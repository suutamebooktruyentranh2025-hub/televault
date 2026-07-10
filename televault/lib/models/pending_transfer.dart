import '../services/transfer_service.dart';

class PendingTransfer {
  final int id;
  final TransferKind kind;
  final String label;
  final String status;
  final String? localPath;
  final String? destPath;
  final int? messageId;
  final int size;
  final String? error;
  final DateTime createdAt;

  const PendingTransfer({
    required this.id,
    required this.kind,
    required this.label,
    required this.status,
    this.localPath,
    this.destPath,
    this.messageId,
    required this.size,
    this.error,
    required this.createdAt,
  });
}
