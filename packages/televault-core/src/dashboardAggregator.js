const { isDir, entryName } = require('./vaultEntry');
const { isInTrash } = require('./trash');

function visibleFiles(all) {
  return all.filter((e) => !isDir(e) && !isInTrash(e.path));
}

function topLevelFolderPath(filePath) {
  const rest = filePath.slice(1);
  const slash = rest.indexOf('/');
  if (slash === -1) return null;
  return `/${rest.slice(0, slash + 1)}`;
}

function formatLocalDate(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function buildDateRange(endDate, days, timeZone) {
  const keys = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(endDate);
    d.setDate(d.getDate() - i);
    keys.push(formatLocalDate(d, timeZone));
  }
  return keys;
}

/**
 * @param {import('./vaultEntry').VaultEntry[]} all
 * @param {{ rangeDays?: number, today?: Date, timeZone?: string, topN?: number }} [options]
 */
function buildDashboardStats(all, options = {}) {
  const rangeDays = options.rangeDays ?? 30;
  const today = options.today ?? new Date();
  const timeZone = options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const topN = options.topN ?? 10;

  const files = visibleFiles(all);
  const totalFiles = files.length;
  const totalBytes = files.reduce((sum, e) => sum + e.size, 0);

  /** @type {Map<string, { path: string, name: string, bytes: number, fileCount: number }>} */
  const folderMap = new Map();
  for (const file of files) {
    const folderPath = topLevelFolderPath(file.path);
    if (!folderPath) continue;
    const row = folderMap.get(folderPath) || {
      path: folderPath,
      name: folderPath.slice(1, -1).split('/').pop(),
      bytes: 0,
      fileCount: 0,
    };
    row.bytes += file.size;
    row.fileCount += 1;
    folderMap.set(folderPath, row);
  }
  const topFolders = [...folderMap.values()]
    .sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name))
    .slice(0, topN);

  const topFiles = [...files]
    .sort((a, b) => b.size - a.size || a.path.localeCompare(b.path))
    .slice(0, topN)
    .map((e) => ({
      messageId: e.messageId,
      path: e.path,
      name: entryName(e),
      bytes: e.size,
      mtime: e.mtime.toISOString(),
    }));

  const dateKeys = buildDateRange(today, rangeDays, timeZone);
  /** @type {Map<string, { date: string, fileCount: number, bytes: number }>} */
  const byDay = new Map(dateKeys.map((date) => [date, { date, fileCount: 0, bytes: 0 }]));
  for (const file of files) {
    const key = formatLocalDate(file.mtime, timeZone);
    const bucket = byDay.get(key);
    if (!bucket) continue;
    bucket.fileCount += 1;
    bucket.bytes += file.size;
  }
  const uploadsPerDay = dateKeys.map((date) => byDay.get(date));

  return { totalFiles, totalBytes, topFolders, topFiles, uploadsPerDay };
}

module.exports = { buildDashboardStats, visibleFiles };
