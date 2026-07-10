const { K_TRASH_FOLDER_NAME } = require('./trash');

/** @param {import('./vaultEntry').VaultEntry[]} all */
function listAllFolders(all) {
  const folders = new Set();

  for (const entry of all) {
    const parts = entry.path.split('/').filter(Boolean);
    if (parts[0] === K_TRASH_FOLDER_NAME) continue;

    for (let i = 0; i < parts.length - 1; i += 1) {
      folders.add(`/${parts.slice(0, i + 1).join('/')}/`);
    }

    if (entry.path.endsWith('/')) folders.add(entry.path);
  }

  return [...folders].sort();
}

function isInvalidMoveDestination(destination, currentFolder, sourceFolders = []) {
  if (!destination || !destination.endsWith('/')) return true;
  if (destination === currentFolder) return true;
  return sourceFolders.some((folderPath) => destination === folderPath || destination.startsWith(folderPath));
}

module.exports = {
  listAllFolders,
  isInvalidMoveDestination,
};
