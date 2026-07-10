String formatTransferSpeed(double bytesPerSecond) {
  if (bytesPerSecond <= 0) return '—';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  var v = bytesPerSecond;
  var i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  final digits = v >= 100 || i == 0 ? 0 : v >= 10 ? 1 : 2;
  return '${v.toStringAsFixed(digits)} ${units[i]}';
}

String formatTransferEta(Duration? eta) {
  if (eta == null) return '—';
  if (eta.inSeconds < 1) return '<1s';
  final h = eta.inHours;
  final m = eta.inMinutes.remainder(60);
  final s = eta.inSeconds.remainder(60);
  if (h > 0) return '${h}h ${m}m';
  if (m > 0) return '${m}m ${s}s';
  return '${s}s';
}
