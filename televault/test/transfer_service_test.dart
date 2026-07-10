import 'package:flutter_test/flutter_test.dart';
import 'package:televault/services/transfer_service.dart';

void main() {
  group('TransferQueue (logic thuần)', () {
    test('runs at most maxConcurrent tasks', () async {
      var running = 0, peak = 0;
      final q = TransferQueue(maxConcurrent: 2);
      final done = <Future<void>>[];
      for (var i = 0; i < 5; i++) {
        done.add(q.add(TransferTask(
          id: 't$i', kind: TransferKind.upload, label: 'f$i',
          run: (_) async {
            running++;
            peak = peak > running ? peak : running;
            await Future<void>.delayed(const Duration(milliseconds: 20));
            running--;
          },
        )));
      }
      await Future.wait(done);
      expect(peak, 2);
    });

    test('retries 3 times with backoff then marks failed', () async {
      var attempts = 0;
      final q = TransferQueue(maxConcurrent: 1, baseBackoff: Duration.zero);
      final task = TransferTask(
        id: 'x', kind: TransferKind.download, label: 'f',
        run: (_) async { attempts++; throw Exception('net'); },
      );
      await q.add(task);
      expect(attempts, 3);
      expect(task.status, TransferStatus.failed);
    });

    test('cancelled task does not run', () async {
      final q = TransferQueue(maxConcurrent: 1);
      var ran = false;
      final slow = q.add(TransferTask(id: 's', kind: TransferKind.upload, label: 's',
          run: (_) => Future<void>.delayed(const Duration(milliseconds: 50))));
      final t = TransferTask(id: 'c', kind: TransferKind.upload, label: 'c',
          run: (_) async { ran = true; });
      final fut = q.add(t);
      q.cancel('c');
      await Future.wait([slow, fut]);
      expect(ran, isFalse);
      expect(t.status, TransferStatus.cancelled);
    });

    test('progress reported through task', () async {
      final q = TransferQueue(maxConcurrent: 1);
      final t = TransferTask(id: 'p', kind: TransferKind.upload, label: 'p',
          run: (report) async { report(0.5); report(1.0); });
      final seen = <double>[];
      t.progress.listen(seen.add);
      await q.add(t);
      await Future<void>.delayed(Duration.zero);
      expect(seen, [0.5, 1.0]);
    });
    test('clearFinished removes done cancelled failed tasks', () async {
      final q = TransferQueue(maxConcurrent: 1);
      final t1 = TransferTask(id: '1', kind: TransferKind.upload, label: 'a', run: (_) async {});
      final t2 = TransferTask(id: '2', kind: TransferKind.upload, label: 'b', run: (_) async { throw Exception('x'); });
      await q.add(t1);
      await q.add(t2);
      expect(t1.status, TransferStatus.done);
      expect(t2.status, TransferStatus.failed);
      q.clearFinished();
      expect(q.tasks, isEmpty);
    });

    test('startTask resumes paused task', () async {
      final q = TransferQueue(maxConcurrent: 1);
      var ran = false;
      final t = TransferTask(
        id: 'p',
        kind: TransferKind.upload,
        label: 'p',
        run: (_) async { ran = true; },
      );
      q.restorePaused(t);
      expect(t.status, TransferStatus.paused);
      await q.startTask(t);
      expect(ran, isTrue);
      expect(t.status, TransferStatus.done);
    });
  });
}
