const MAX_TAG_LEN = 50;

/** @param {string[]} tags */
function normalizeFolderTags(tags) {
  const out = [];
  const seen = new Set();
  for (const raw of tags || []) {
    if (typeof raw !== 'string') continue;
    const t = raw.trim();
    if (!t) continue;
    if (t.includes(',')) throw new Error('Tag cannot contain comma');
    if (t.length > MAX_TAG_LEN) throw new Error('Tag too long');
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** @param {string} filePath */
function* ancestorFolderPaths(filePath) {
  if (!filePath.startsWith('/') || filePath.endsWith('/')) return;
  let folder = filePath.substring(0, filePath.lastIndexOf('/') + 1);
  while (folder !== '/') {
    yield folder;
    const trimmed = folder.substring(0, folder.length - 1);
    folder = trimmed.substring(0, trimmed.lastIndexOf('/') + 1);
  }
}

/** @param {string} filePath @param {Record<string, string[]>} folderTagsByPath */
function effectiveTagsForPath(filePath, folderTagsByPath) {
  const tags = new Set();
  for (const folder of ancestorFolderPaths(filePath)) {
    for (const t of folderTagsByPath[folder] || []) tags.add(t);
  }
  return [...tags].sort();
}

/** @param {import('./vaultEntry').VaultEntry} entry @param {Record<string, string[]>} folderTagsByPath */
function effectiveTagsForEntry(entry, folderTagsByPath) {
  if (entry.path.endsWith('/')) {
    return [...(folderTagsByPath[entry.path] || entry.tags || [])];
  }
  return effectiveTagsForPath(entry.path, folderTagsByPath);
}

module.exports = {
  MAX_TAG_LEN,
  normalizeFolderTags,
  ancestorFolderPaths,
  effectiveTagsForPath,
  effectiveTagsForEntry,
};
