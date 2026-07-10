import 'dart:io';

int _counter = 0;

/// Mỗi test cần DB riêng — tránh leak dữ liệu giữa các test (kể cả chạy song song).
String nextTestDbPath() {
  final path =
      '${Directory.systemTemp.path}/televault_test_${DateTime.now().microsecondsSinceEpoch}_${_counter++}.db';
  return path;
}

Future<void> deleteTestDb(String path) async {
  final f = File(path);
  if (await f.exists()) await f.delete();
}
