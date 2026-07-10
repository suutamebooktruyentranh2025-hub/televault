import 'package:collection/collection.dart';

import '../models/vault_entry.dart';

class ConflictFix {
  final VaultEntry entry;
  final String newPath;
  const ConflictFix(this.entry, this.newPath);
}

class EditCaptionStep {
  final int messageId;
  final String newPath;
  const EditCaptionStep(this.messageId, this.newPath);

  @override
  bool operator ==(Object other) =>
      other is EditCaptionStep && other.messageId == messageId && other.newPath == newPath;
  @override
  int get hashCode => Object.hash(messageId, newPath);
  @override
  String toString() => 'EditCaptionStep($messageId, $newPath)';
}

class DeleteStep {
  final int messageId;
  const DeleteStep(this.messageId);
}

class RetagStep {
  final int messageId;
  final List<String> newTags;
  const RetagStep(this.messageId, this.newTags);
}

List<ConflictFix> resolvePathConflicts(List<VaultEntry> entries, {required DateTime today}) {
  final fixes = <ConflictFix>[];
  final byPath = groupBy(entries.where((e) => !e.isDir), (VaultEntry e) => e.path);
  final date =
      '${today.year.toString().padLeft(4, '0')}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';
  for (final group in byPath.values.where((g) => g.length > 1)) {
    final sorted = [...group]..sort((a, b) => a.messageId.compareTo(b.messageId));
    for (final loser in sorted.sublist(0, sorted.length - 1)) {
      final p = loser.path;
      final dot = p.lastIndexOf('.');
      final slash = p.lastIndexOf('/');
      final hasExt = dot > slash;
      final stem = hasExt ? p.substring(0, dot) : p;
      final ext = hasExt ? p.substring(dot) : '';
      fixes.add(ConflictFix(loser, '$stem (conflict $date)$ext'));
    }
  }
  return fixes;
}

List<EditCaptionStep> planFolderRename(List<VaultEntry> entries, {required String from, required String to}) {
  assert(from.endsWith('/') && to.endsWith('/'));
  return entries
      .where((e) => e.path.startsWith(from))
      .map((e) => EditCaptionStep(e.messageId, to + e.path.substring(from.length)))
      .toList();
}

List<DeleteStep> planFolderDelete(List<VaultEntry> entries, {required String folder}) {
  assert(folder.endsWith('/'));
  return entries.where((e) => e.path.startsWith(folder)).map((e) => DeleteStep(e.messageId)).toList();
}

List<RetagStep> planTagRename(List<VaultEntry> entries, {required String from, required String to}) {
  return entries
      .where((e) => e.isDir && e.tags.contains(from))
      .map((e) => RetagStep(e.messageId, e.tags.map((t) => t == from ? to : t).toList()))
      .toList();
}

List<RetagStep> planTagDelete(List<VaultEntry> entries, {required String tag}) {
  return entries
      .where((e) => e.isDir && e.tags.contains(tag))
      .map((e) => RetagStep(e.messageId, e.tags.where((t) => t != tag).toList()))
      .toList();
}
