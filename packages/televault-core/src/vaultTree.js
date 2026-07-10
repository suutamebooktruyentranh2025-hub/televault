const { isDir } = require('./vaultEntry');
const { K_TRASH_FOLDER_NAME } = require('./trash');

/** @typedef {'name'|'mtime'|'size'} VaultSortField */
/** @typedef {'asc'|'desc'} SortDirection */

/**
 * @param {import('./vaultEntry').VaultEntry[]} all
 * @param {string} folder
 */
function listFolder(all, folder) {
  if (!folder.endsWith('/')) {
    throw new Error('folder must end with /');
  }

  const folders = new Set();
  /** @type {import('./vaultEntry').VaultEntry[]} */
  const files = [];

  for (const e of all) {
    if (!e.path.startsWith(folder) || e.path === folder) continue;
    const rest = e.path.slice(folder.length);
    const slash = rest.indexOf('/');
    if (slash === -1) {
      files.push(e);
    } else {
      const name = rest.slice(0, slash);
      if (folder === '/' && name === K_TRASH_FOLDER_NAME) continue;
      folders.add(name);
    }
  }

  return {
    folders: [...folders].sort(),
    files: files.sort((a, b) => a.path.slice(a.path.lastIndexOf('/') + 1).localeCompare(
      b.path.slice(b.path.lastIndexOf('/') + 1),
    )),
  };
}

/** @param {import('./vaultEntry').VaultEntry[]} all @param {string} folderPath */
function folderMtime(all, folderPath) {
  let latest = null;
  /** @type {import('./vaultEntry').VaultEntry|null} */
  let marker = null;
  for (const e of all) {
    if (e.path === folderPath && isDir(e)) marker = e;
    if (e.path.startsWith(folderPath) && e.path !== folderPath && !isDir(e)) {
      if (!latest || e.mtime > latest) latest = e.mtime;
    }
  }
  return latest ?? marker?.mtime ?? new Date(0);
}

/** @param {import('./vaultEntry').VaultEntry[]} all @param {string} folderPath */
function folderSize(all, folderPath) {
  let total = 0;
  for (const e of all) {
    if (e.path.startsWith(folderPath) && e.path !== folderPath && !isDir(e)) {
      total += e.size;
    }
  }
  return total;
}

function compareByDirection(a, b, direction) {
  const c = a < b ? -1 : a > b ? 1 : 0;
  return direction === 'asc' ? c : -c;
}

function sortFolderListing(listing, all, currentFolder, { field, direction }) {
  const folders = [...listing.folders];
  const files = [...listing.files];

  if (field === 'name') {
    folders.sort((a, b) => compareByDirection(a, b, direction));
    files.sort((a, b) => compareByDirection(
      a.path.slice(a.path.lastIndexOf('/') + 1),
      b.path.slice(b.path.lastIndexOf('/') + 1),
      direction,
    ));
  } else if (field === 'mtime') {
    folders.sort((a, b) => compareByDirection(
      folderMtime(all, `${currentFolder}${a}/`).getTime(),
      folderMtime(all, `${currentFolder}${b}/`).getTime(),
      direction,
    ));
    files.sort((a, b) => compareByDirection(a.mtime.getTime(), b.mtime.getTime(), direction));
  } else if (field === 'size') {
    folders.sort((a, b) => compareByDirection(
      folderSize(all, `${currentFolder}${a}/`),
      folderSize(all, `${currentFolder}${b}/`),
      direction,
    ));
    files.sort((a, b) => compareByDirection(a.size, b.size, direction));
  }

  return { folders, files };
}

/** @param {import('./vaultEntry').VaultEntry[]} all @param {string} folderPath */
function folderHasContents(all, folderPath) {
  const listing = listFolder(all, folderPath);
  return listing.folders.length > 0 || listing.files.some((e) => !isDir(e));
}

/** @param {import('./vaultEntry').VaultEntry[]} all @param {Set<string>} expanded */
function buildVisibleTreeRows(all, expanded) {
  /** @type {Array<{ kind: 'folder', depth: number, path: string, name: string, hasChildren: boolean, expanded: boolean } | { kind: 'file', depth: number, entry: import('./vaultEntry').VaultEntry }>} */
  const rows = [];

  /** @param {string} folderPath @param {number} depth */
  function walk(folderPath, depth) {
    const listing = listFolder(all, folderPath);
    for (const name of listing.folders) {
      const path = `${folderPath}${name}/`;
      const hasChildren = folderHasContents(all, path);
      const isExpanded = expanded.has(path);
      rows.push({ kind: 'folder', depth, path, name, hasChildren, expanded: isExpanded });
      if (isExpanded) walk(path, depth + 1);
    }
    for (const file of listing.files) {
      if (!isDir(file)) rows.push({ kind: 'file', depth, entry: file });
    }
  }

  walk('/', 0);
  return rows;
}

module.exports = {
  listFolder,
  folderMtime,
  folderSize,
  sortFolderListing,
  folderHasContents,
  buildVisibleTreeRows,
};
