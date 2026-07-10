import 'dart:async';
import 'dart:collection';

enum TransferKind { upload, download, batch }

enum TransferStatus { queued, running, paused, done, failed, cancelled }

typedef ProgressReporter = void Function(double fraction, {int? bytesDone, int? bytesTotal});
typedef TaskBody = Future<void> Function(ProgressReporter report);
typedef TransferStatusCallback = void Function(TransferTask task);

class TransferProgressInfo {
  final double fraction;
  final int bytesDone;
  final int bytesTotal;
  final double bytesPerSecond;
  final Duration? eta;

  const TransferProgressInfo({
    required this.fraction,
    required this.bytesDone,
    required this.bytesTotal,
    required this.bytesPerSecond,
    this.eta,
  });

  static const empty = TransferProgressInfo(
    fraction: 0,
    bytesDone: 0,
    bytesTotal: 0,
    bytesPerSecond: 0,
  );
}

class _ProgressTracker {
  static const _alpha = 0.3;
  double _emaSpeed = 0;
  DateTime? _lastAt;
  int _lastBytes = 0;

  TransferProgressInfo update(int bytesDone, int bytesTotal) {
    final now = DateTime.now();
    if (_lastAt != null && bytesDone > _lastBytes) {
      final dt = now.difference(_lastAt!).inMicroseconds / 1e6;
      if (dt >= 0.25) {
        final instant = (bytesDone - _lastBytes) / dt;
        _emaSpeed = _alpha * instant + (1 - _alpha) * _emaSpeed;
        _lastAt = now;
        _lastBytes = bytesDone;
      }
    } else if (_lastAt == null) {
      _lastAt = now;
      _lastBytes = bytesDone;
    }

    final fraction = bytesTotal > 0 ? (bytesDone / bytesTotal).clamp(0.0, 1.0) : 0.0;
    Duration? eta;
    if (_emaSpeed > 0 && bytesTotal > bytesDone) {
      eta = Duration(seconds: ((bytesTotal - bytesDone) / _emaSpeed).round().clamp(1, 86400));
    }
    return TransferProgressInfo(
      fraction: fraction,
      bytesDone: bytesDone,
      bytesTotal: bytesTotal,
      bytesPerSecond: _emaSpeed,
      eta: eta,
    );
  }

  void reset() {
    _emaSpeed = 0;
    _lastAt = null;
    _lastBytes = 0;
  }
}

class TransferTask {
  final String id;
  final TransferKind kind;
  final String label;
  TaskBody run;

  /// Metadata for retry / restore after app restart.
  final String? localPath;
  final String? destPath;
  final int? messageId;
  int? totalBytes;
  int? persistId;

  TransferStatus status = TransferStatus.queued;
  Object? error;
  final _progress = StreamController<double>.broadcast();
  final _stats = StreamController<TransferProgressInfo>.broadcast();
  final _tracker = _ProgressTracker();

  Stream<double> get progress => _progress.stream;
  Stream<TransferProgressInfo> get stats => _stats.stream;
  double lastProgress = 0;
  TransferProgressInfo lastStats = TransferProgressInfo.empty;

  TransferTask({
    required this.id,
    required this.kind,
    required this.label,
    required this.run,
    this.localPath,
    this.destPath,
    this.messageId,
    this.totalBytes,
    this.persistId,
  });

  void _report(double f, {int? bytesDone, int? bytesTotal}) {
    lastProgress = f;
    _progress.add(f);
    final total = bytesTotal ?? totalBytes ?? 0;
    final done = bytesDone ?? (total > 0 ? (total * f).round() : 0);
    if (total > 0) {
      lastStats = _tracker.update(done, total);
      _stats.add(lastStats);
    }
  }

  void resetForRetry() {
    error = null;
    lastProgress = 0;
    lastStats = TransferProgressInfo.empty;
    _tracker.reset();
  }
}

class TransferQueue {
  int maxConcurrent;
  final Duration baseBackoff;
  final int maxAttempts;
  TransferStatusCallback? onStatusChange;

  final _waiting = Queue<(TransferTask, Completer<void>)>();
  final tasks = <TransferTask>[];
  int _running = 0;

  final changes = StreamController<void>.broadcast();

  TransferQueue({
    this.maxConcurrent = 2,
    this.baseBackoff = const Duration(seconds: 2),
    this.maxAttempts = 3,
    this.onStatusChange,
  });

  Future<void> add(TransferTask task) {
    final completer = Completer<void>();
    tasks.add(task);
    _waiting.add((task, completer));
    _notify(task);
    _pump();
    return completer.future;
  }

  /// Khôi phục task từ SQLite — không tự chạy (queued → paused; failed giữ nguyên).
  void restorePaused(TransferTask task) {
    if (task.status == TransferStatus.queued) {
      task.status = TransferStatus.paused;
    }
    tasks.add(task);
    changes.add(null);
  }

  /// Bắt đầu task đã pause hoặc retry task failed (đã reset status).
  Future<void> startTask(TransferTask task) {
    if (task.status == TransferStatus.paused || task.status == TransferStatus.failed) {
      task.resetForRetry();
      task.status = TransferStatus.queued;
      final completer = Completer<void>();
      _waiting.add((task, completer));
      _notify(task);
      _pump();
      return completer.future;
    }
    if (task.status == TransferStatus.queued) {
      final completer = Completer<void>();
      _waiting.add((task, completer));
      _pump();
      return completer.future;
    }
    return Future.value();
  }

  void removeTask(String taskId) {
    tasks.removeWhere((t) => t.id == taskId);
    changes.add(null);
  }

  void cancel(String taskId) {
    for (final (task, _) in _waiting) {
      if (task.id == taskId && task.status == TransferStatus.queued) {
        task.status = TransferStatus.cancelled;
        _notify(task);
      }
    }
  }

  void clearFinished() {
    tasks.removeWhere((t) =>
        t.status == TransferStatus.done ||
        t.status == TransferStatus.cancelled ||
        t.status == TransferStatus.failed);
    changes.add(null);
  }

  void _notify(TransferTask task) {
    changes.add(null);
    onStatusChange?.call(task);
  }

  void _pump() {
    while (_running < maxConcurrent && _waiting.isNotEmpty) {
      final (task, completer) = _waiting.removeFirst();
      if (task.status == TransferStatus.cancelled) {
        completer.complete();
        continue;
      }
      _running++;
      _execute(task).whenComplete(() {
        _running--;
        completer.complete();
        _notify(task);
        _pump();
      });
    }
  }

  Future<void> _execute(TransferTask task) async {
    task.status = TransferStatus.running;
    _notify(task);
    for (var attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await task.run(task._report);
        task.status = TransferStatus.done;
        return;
      } catch (e) {
        task.error = e;
        if (attempt == maxAttempts) {
          task.status = TransferStatus.failed;
          return;
        }
        await Future<void>.delayed(baseBackoff * attempt);
      }
    }
  }
}
