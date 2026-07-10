const K_TRASH_FOLDER = '/Rác/';
const K_TRASH_FOLDER_NAME = 'Rác';

function isTrashFolder(folderPath) {
  return folderPath === K_TRASH_FOLDER;
}

function isInTrash(path) {
  return path.startsWith(K_TRASH_FOLDER) && path !== K_TRASH_FOLDER;
}

function pathInTrash(originalPath) {
  if (!originalPath.startsWith('/')) {
    throw new Error('path must start with /');
  }
  if (isInTrash(originalPath) || originalPath === K_TRASH_FOLDER) return originalPath;
  return `${K_TRASH_FOLDER}${originalPath.slice(1)}`;
}

function pathFromTrash(trashPath) {
  if (!isInTrash(trashPath)) {
    throw new Error('not in trash');
  }
  return `/${trashPath.slice(K_TRASH_FOLDER.length)}`;
}

function uniqueVaultPath(desired, existingPaths) {
  const taken = new Set(existingPaths);
  if (!taken.has(desired)) return desired;
  const dot = desired.lastIndexOf('.');
  const slash = desired.lastIndexOf('/');
  const hasExt = dot > slash;
  const stem = hasExt ? desired.slice(0, dot) : desired;
  const ext = hasExt ? desired.slice(dot) : '';
  for (let n = 1; n < 10000; n += 1) {
    const candidate = `${stem} (${n})${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(`Không tạo được tên duy nhất cho ${desired}`);
}

module.exports = {
  K_TRASH_FOLDER,
  K_TRASH_FOLDER_NAME,
  isTrashFolder,
  isInTrash,
  pathInTrash,
  pathFromTrash,
  uniqueVaultPath,
};
