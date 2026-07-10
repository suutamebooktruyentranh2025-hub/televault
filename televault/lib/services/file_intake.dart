import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

String _norm(String path) => path.replaceAll('\\', '/');

/// Path đích trong kho cho 1 file local.
/// [pickedRoot] != null khi người dùng chọn cả thư mục — giữ cấu trúc từ tên thư mục gốc trở xuống.
String destPathFor(String localPath, {String? pickedRoot, required String destFolder}) {
  assert(destFolder.startsWith('/') && destFolder.endsWith('/'));
  final local = _norm(localPath);
  if (pickedRoot == null) {
    return '$destFolder${local.substring(local.lastIndexOf('/') + 1)}';
  }
  final root = _norm(pickedRoot);
  final parentOfRoot = root.substring(0, root.lastIndexOf('/') + 1);
  return '$destFolder${local.substring(parentOfRoot.length)}';
}

Directory? _stagingDir;

Future<Directory> _uploadStagingDir() async {
  if (_stagingDir != null) return _stagingDir!;
  final root = await getApplicationSupportDirectory();
  _stagingDir = Directory(p.join(root.path, 'upload_staging'))..createSync(recursive: true);
  return _stagingDir!;
}

/// Copy file vào app container ngay khi chọn — TDLib (native) không đọc được path ngoài sandbox macOS.
Future<String> stageLocalFile(String sourcePath) async {
  final src = File(sourcePath);
  if (!await src.exists()) {
    throw FileSystemException('Không đọc được file', sourcePath);
  }
  final support = await getApplicationSupportDirectory();
  final abs = src.absolute.path;
  if (p.isWithin(support.path, abs) || abs == support.path) {
    return abs;
  }
  final staging = await _uploadStagingDir();
  final safeName = p.basename(sourcePath).replaceAll(RegExp(r'[^\w.\- ]'), '_');
  final dest = File(p.join(staging.path, '${DateTime.now().microsecondsSinceEpoch}_$safeName'));
  await src.copy(dest.path);
  return dest.path;
}

/// Mở picker chọn nhiều file; trả về danh sách (localPath đã stage, destPath).
Future<List<(String local, String dest)>> pickFiles(String destFolder) async {
  final result = await FilePicker.pickFiles(allowMultiple: true);
  if (result == null) return [];
  final out = <(String, String)>[];
  for (final f in result.files) {
    if (f.path == null) continue;
    final staged = await stageLocalFile(f.path!);
    out.add((staged, destPathFor(f.path!, destFolder: destFolder)));
  }
  return out;
}

/// Mở picker chọn 1 thư mục; liệt kê đệ quy mọi file bên trong (stage trước khi upload).
Future<List<(String local, String dest)>> pickDirectory(String destFolder) async {
  final dir = await FilePicker.getDirectoryPath();
  if (dir == null) return [];
  final files = Directory(dir)
      .listSync(recursive: true, followLinks: false)
      .whereType<File>();
  final out = <(String, String)>[];
  for (final f in files) {
    final staged = await stageLocalFile(f.path);
    out.add((staged, destPathFor(f.path, pickedRoot: dir, destFolder: destFolder)));
  }
  return out;
}
