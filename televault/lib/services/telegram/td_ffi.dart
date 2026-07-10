import 'dart:ffi';
import 'dart:io';

import 'package:ffi/ffi.dart';
import 'package:path/path.dart' as p;

typedef CreateClientId = int Function();
typedef SendJson = void Function(int, Pointer<Utf8>);
typedef ReceiveJson = Pointer<Utf8> Function(double);
typedef ExecuteJson = Pointer<Utf8> Function(Pointer<Utf8>);

/// Binding thô tới libtdjson. Chỉ dùng từ TdClient.
class TdFfi {
  final DynamicLibrary _lib;
  /// Parsed from dylib filename, e.g. libtdjson.1.8.0.dylib → 1.8.0
  final String? libraryVersion;

  late final CreateClientId createClientId =
      _lib.lookupFunction<Int32 Function(), CreateClientId>('td_create_client_id');
  late final SendJson _send = _lib.lookupFunction<Void Function(Int32, Pointer<Utf8>), SendJson>('td_send');
  late final ReceiveJson _receive =
      _lib.lookupFunction<Pointer<Utf8> Function(Double), ReceiveJson>('td_receive');
  late final ExecuteJson _execute =
      _lib.lookupFunction<Pointer<Utf8> Function(Pointer<Utf8>), ExecuteJson>('td_execute');

  TdFfi._(this._lib, this.libraryVersion);

  factory TdFfi.open() {
    final (lib, version) = _openLibWithVersion();
    return TdFfi._(lib, version);
  }

  /// TDLib ≤1.8.5: setTdlibParameters dùng object lồng `parameters`.
  bool get legacySetTdlibParameters {
    final v = libraryVersion;
    if (v == null) return false;
    final parts = v.split('.').map(int.tryParse).toList();
    if (parts.length < 2 || parts[0] == null || parts[1] == null) return true;
    final major = parts[0]!;
    final minor = parts[1]!;
    final patch = parts.length > 2 ? (parts[2] ?? 0) : 0;
    if (major > 1) return false;
    if (major < 1) return true;
    if (minor > 8) return false;
    if (minor < 8) return true;
    return patch < 6;
  }

  static (DynamicLibrary, String?) _openLibWithVersion() {
    String? versionFromPath(String libPath) {
      final name = p.basenameWithoutExtension(libPath);
      final m = RegExp(r'libtdjson\.(\d+\.\d+\.\d+)').firstMatch(name);
      return m?.group(1);
    }

    if (Platform.isMacOS) {
      final macos = Platform.resolvedExecutable;
      final frameworks = p.join(p.dirname(macos), '..', 'Frameworks');
      final candidates = <String>[
        p.join(frameworks, 'libtdjson.dylib'),
        p.join(frameworks, 'libtdjson.1.8.0.dylib'),
        p.join(p.dirname(macos), 'libtdjson.dylib'),
        'libtdjson.dylib',
        '/opt/homebrew/opt/tdlib/lib/libtdjson.1.8.0.dylib',
        '/opt/homebrew/lib/libtdjson.dylib',
        '/usr/local/lib/libtdjson.dylib',
      ];
      for (final libPath in candidates) {
        try {
          return (DynamicLibrary.open(libPath), versionFromPath(libPath));
        } catch (_) {}
      }
      throw StateError('libtdjson.dylib not found — chạy tool/copy_tdlib.sh hoặc brew install tdlib');
    }
    if (Platform.isWindows) return (DynamicLibrary.open('tdjson.dll'), null);
    if (Platform.isIOS) return (DynamicLibrary.process(), null);
    return (DynamicLibrary.open('libtdjson.so'), null);
  }

  void send(int clientId, String json) {
    final ptr = json.toNativeUtf8();
    try {
      _send(clientId, ptr);
    } finally {
      malloc.free(ptr);
    }
  }

  String? receive(double timeout) {
    final ptr = _receive(timeout);
    return ptr == nullptr ? null : ptr.toDartString();
  }

  String? execute(String json) {
    final ptr = json.toNativeUtf8();
    try {
      final r = _execute(ptr);
      return r == nullptr ? null : r.toDartString();
    } finally {
      malloc.free(ptr);
    }
  }
}
