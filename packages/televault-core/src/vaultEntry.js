/**
 * @typedef {Object} VaultEntry
 * @property {number} messageId
 * @property {string} path - File: '/a/b.pdf'. Dir marker: '/a/b/'.
 * @property {number} size
 * @property {string} sha256
 * @property {Date} mtime
 * @property {string[]} tags
 * @property {string|null} [localPath]
 */

/** @returns {VaultEntry} */
function createVaultEntry({ messageId, path, size, sha256, mtime, tags = [], localPath = null }) {
  return { messageId, path, size, sha256, mtime, tags, localPath };
}

/** @returns {VaultEntry} */
function dirMarker({ messageId, path, tags = [] }) {
  if (!path.endsWith('/')) {
    throw new Error('dir marker path must end with /');
  }
  return createVaultEntry({
    messageId,
    path,
    size: 0,
    sha256: '',
    mtime: new Date(),
    tags,
  });
}

/** @param {VaultEntry} entry */
function isDir(entry) {
  return entry.path.endsWith('/');
}

/** @param {VaultEntry} entry */
function entryName(entry) {
  const p = isDir(entry) ? entry.path.slice(0, -1) : entry.path;
  return p.slice(p.lastIndexOf('/') + 1);
}

/** @param {VaultEntry} entry */
function entryParent(entry) {
  const p = isDir(entry) ? entry.path.slice(0, -1) : entry.path;
  const i = p.lastIndexOf('/');
  return i <= 0 ? '/' : `${p.slice(0, i + 1)}`;
}

/** @param {VaultEntry} entry */
function copyEntry(entry, { path, tags, localPath, messageId } = {}) {
  return createVaultEntry({
    messageId: messageId ?? entry.messageId,
    path: path ?? entry.path,
    size: entry.size,
    sha256: entry.sha256,
    mtime: entry.mtime,
    tags: tags ?? entry.tags,
    localPath: localPath ?? entry.localPath,
  });
}

module.exports = {
  createVaultEntry,
  dirMarker,
  isDir,
  entryName,
  entryParent,
  copyEntry,
};
