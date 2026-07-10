export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatDate(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()) || d.getTime() === 0) return '—';
    return d.toLocaleString();
  } catch {
    return iso;
  }
}
