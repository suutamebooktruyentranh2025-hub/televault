/** @param {import('./vaultEntry').VaultEntry[]} entries @param {Date} today */
function resolvePathConflicts(entries, today = new Date()) {
  const fixes = [];
  const byPath = new Map();
  for (const e of entries) {
    if (e.path.endsWith('/')) continue;
    const list = byPath.get(e.path) || [];
    list.push(e);
    byPath.set(e.path, list);
  }
  const date = today.toISOString().slice(0, 10);
  for (const group of byPath.values()) {
    if (group.length <= 1) continue;
    const sorted = [...group].sort((a, b) => a.messageId - b.messageId);
    for (const loser of sorted.slice(0, -1)) {
      const p = loser.path;
      const dot = p.lastIndexOf('.');
      const slash = p.lastIndexOf('/');
      const hasExt = dot > slash;
      const stem = hasExt ? p.slice(0, dot) : p;
      const ext = hasExt ? p.slice(dot) : '';
      fixes.push({ entry: loser, newPath: `${stem} (conflict ${date})${ext}` });
    }
  }
  return fixes;
}

/** @param {import('./vaultEntry').VaultEntry[]} entries */
function planFolderRename(entries, from, to) {
  return entries
    .filter((e) => e.path.startsWith(from))
    .map((e) => ({ messageId: e.messageId, newPath: to + e.path.slice(from.length) }));
}

/** @param {import('./vaultEntry').VaultEntry[]} entries */
function planFolderDelete(entries, folder) {
  return entries.filter((e) => e.path.startsWith(folder)).map((e) => ({ messageId: e.messageId }));
}

/** @param {import('./vaultEntry').VaultEntry[]} entries */
function planTagRename(entries, from, to) {
  return entries
    .filter((e) => e.path.endsWith('/') && (e.tags || []).includes(from))
    .map((e) => ({
      messageId: e.messageId,
      newTags: (e.tags || []).map((t) => (t === from ? to : t)),
    }));
}

/** @param {import('./vaultEntry').VaultEntry[]} entries */
function planTagDelete(entries, tag) {
  return entries
    .filter((e) => e.path.endsWith('/') && (e.tags || []).includes(tag))
    .map((e) => ({
      messageId: e.messageId,
      newTags: (e.tags || []).filter((t) => t !== tag),
    }));
}

module.exports = {
  resolvePathConflicts,
  planFolderRename,
  planFolderDelete,
  planTagRename,
  planTagDelete,
};
