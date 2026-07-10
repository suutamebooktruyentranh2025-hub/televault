const fs = require('fs');
const path = require('path');
const { dialog, BrowserWindow } = require('electron');
const { isDir } = require('@televault/core');

function uniqueDestPath(dir, name) {
  let dest = path.join(dir, name);
  if (!fs.existsSync(dest)) return dest;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 1; i < 1000; i += 1) {
    dest = path.join(dir, `${stem} (${i})${ext}`);
    if (!fs.existsSync(dest)) return dest;
  }
  return path.join(dir, `${stem}_${Date.now()}${ext}`);
}

/**
 * @param {import('../db/indexDb').ReturnType<import('../db/indexDb').openIndexDb>} db
 * @param {{ title?: string }} [opts]
 */
async function resolveSaveAsDirectory(db, opts = {}) {
  const saved = db.getSaveAsDirectory();
  if (saved && fs.existsSync(saved)) return saved;

  const win = BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(win, {
    title: opts.title || 'Chọn thư mục tải xuống',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const dir = result.filePaths[0];
  db.setSaveAsDirectory(dir);
  return dir;
}

/**
 * @param {string} localPath
 * @param {string} saveDir
 * @param {string} fileName
 */
function copyToSaveDirectory(localPath, saveDir, fileName) {
  fs.mkdirSync(saveDir, { recursive: true });
  const dest = uniqueDestPath(saveDir, fileName);
  fs.copyFileSync(localPath, dest);
  return dest;
}

/** @param {import('@televault/core').VaultEntry[]} all @param {string} folderPrefix */
function filesInVaultFolder(all, folderPrefix) {
  if (!folderPrefix.endsWith('/')) throw new Error('folderPrefix must end with /');
  return all
    .filter((e) => !isDir(e) && e.path.startsWith(folderPrefix))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** @param {string} folderPrefix */
function folderExportName(folderPrefix) {
  const trimmed = folderPrefix.slice(0, -1);
  if (!trimmed || trimmed === '/') return 'Kho';
  return trimmed.slice(trimmed.lastIndexOf('/') + 1);
}

/**
 * @param {ReturnType<import('../vault/vaultService').VaultService>} vault
 * @param {import('@televault/core').VaultEntry} entry
 */
async function ensureLocalPath(vault, entry) {
  let localPath = entry.localPath;
  if (!localPath || !fs.existsSync(localPath)) {
    const { done } = vault.enqueueDownload(entry);
    localPath = await done;
  }
  if (!localPath || !fs.existsSync(localPath)) {
    throw new Error(`Không tải được ${entry.path.split('/').pop()}`);
  }
  return localPath;
}

/**
 * @param {{ db: import('../db/indexDb').ReturnType<import('../db/indexDb').openIndexDb>, vault: import('../vault/vaultService').VaultService, folderPrefix: string, onProgress?: (current: number, total: number, name: string) => void }} opts
 */
async function exportVaultFolder({ db, vault, folderPrefix, onProgress }) {
  const files = filesInVaultFolder(db.getAll(), folderPrefix);
  if (files.length === 0) {
    throw new Error('Thư mục không có file để lưu');
  }

  const saveDir = await resolveSaveAsDirectory(db);
  if (!saveDir) return null;

  const rootName = folderExportName(folderPrefix);
  const destRoot = path.join(saveDir, rootName);
  let saved = 0;
  let failed = 0;

  for (let i = 0; i < files.length; i += 1) {
    const entry = files[i];
    const fileName = entry.path.split('/').pop() || '';
    onProgress?.(i + 1, files.length, fileName);
    try {
      const localPath = await ensureLocalPath(vault, entry);
      const relUnderFolder = entry.path.slice(folderPrefix.length);
      const relativePath = path.join(rootName, relUnderFolder);
      const destDir =
        path.dirname(relativePath) === '.'
          ? saveDir
          : path.join(saveDir, path.dirname(relativePath));
      fs.mkdirSync(destDir, { recursive: true });
      const dest = uniqueDestPath(destDir, path.basename(relativePath));
      fs.copyFileSync(localPath, dest);
      saved += 1;
    } catch {
      failed += 1;
    }
  }

  return { saved, failed, destRoot, total: files.length };
}

module.exports = {
  uniqueDestPath,
  resolveSaveAsDirectory,
  copyToSaveDirectory,
  filesInVaultFolder,
  folderExportName,
  exportVaultFolder,
};
