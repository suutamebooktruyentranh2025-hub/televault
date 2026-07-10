const { createVaultEntry, dirMarker } = require('./vaultEntry');

const CAPTION_VERSION = 1;

/** @param {import('./vaultEntry').VaultEntry} entry */
function encodeCaption(entry) {
  if (entry.path.endsWith('/')) {
    const payload = { v: CAPTION_VERSION, dir: entry.path };
    if (entry.tags.length > 0) payload.tags = entry.tags;
    return JSON.stringify(payload);
  }
  return JSON.stringify({
    v: CAPTION_VERSION,
    path: entry.path,
    size: entry.size,
    sha256: entry.sha256,
    mtime: entry.mtime.toISOString(),
  });
}

/**
 * @param {number} messageId
 * @param {string} caption
 * @returns {import('./vaultEntry').VaultEntry|null}
 */
function decodeCaption(messageId, caption) {
  let m;
  try {
    const d = JSON.parse(caption);
    if (!d || typeof d !== 'object') return null;
    m = d;
  } catch {
    return null;
  }
  if (m.v !== CAPTION_VERSION) return null;

  if (typeof m.dir === 'string' && m.dir.startsWith('/') && m.dir.endsWith('/')) {
    const tagsRaw = m.tags;
    const tags = Array.isArray(tagsRaw) ? tagsRaw.filter((t) => typeof t === 'string') : [];
    return dirMarker({ messageId, path: m.dir, tags });
  }

  const path = m.path;
  if (typeof path !== 'string' || !path.startsWith('/') || path.endsWith('/')) return null;
  const mtimeRaw = m.mtime;
  const mtime = typeof mtimeRaw === 'string' ? new Date(mtimeRaw) : null;
  if (!mtime || Number.isNaN(mtime.getTime())) return null;

  const size = typeof m.size === 'number' ? m.size : 0;
  const sha256 = typeof m.sha256 === 'string' ? m.sha256 : '';

  return createVaultEntry({ messageId, path, size, sha256, mtime, tags: [] });
}

module.exports = { CAPTION_VERSION, encodeCaption, decodeCaption };
