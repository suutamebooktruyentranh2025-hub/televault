const fs = require('fs');
const path = require('path');
const { dialog, shell, BrowserWindow } = require('electron');
const {
  listFolder,
  listAllFolders,
  sortFolderListing,
  buildVisibleTreeRows,
  folderMtime,
  folderSize,
  entryName,
  isDir,
  K_TRASH_FOLDER,
  effectiveTagsForPath,
} = require('@televault/core');
const { FolderMoveException } = require('../vault/vaultService');
const { resolveSaveAsDirectory, copyToSaveDirectory, exportVaultFolder } = require('../vault/fileExport');

/** @param {import('../db/indexDb').ReturnType<import('../db/indexDb').openIndexDb>} db */
function serializeEntry(db, e) {
  const folderTags = db.folderTagsIndex();
  const tags = e.path.endsWith('/')
    ? e.tags || []
    : effectiveTagsForPath(e.path, folderTags);
  return {
    messageId: e.messageId,
    path: e.path,
    name: entryName(e),
    size: e.size,
    sha256: e.sha256,
    mtime: e.mtime.toISOString(),
    tags,
    localPath: e.localPath ?? null,
    isDir: isDir(e),
  };
}

/**
 * @param {import('electron').IpcMain} ipcMain
 * @param {{ getDb: () => unknown, getVault: () => unknown, getQueue: () => unknown, getChannel?: () => unknown, isReady: () => boolean, guardUpload?: (destPath: string) => Promise<boolean> }} ctx
 */
function registerVaultHandlers(ipcMain, ctx) {
  const guardUpload = ctx.guardUpload || (async () => true);
  function requireVault() {
    if (!ctx.isReady()) throw new Error('not_ready');
    const vault = ctx.getVault();
    if (!vault) throw new Error('vault_unavailable');
    return vault;
  }

  ipcMain.handle('vault:getListing', (_evt, { folder, sortField = 'name', sortDirection = 'asc' }) => {
    if (!ctx.isReady()) return { ok: false, error: 'not_ready', folders: [], files: [] };
    const db = ctx.getDb();
    const all = db.getAll();
    const listing = listFolder(all, folder || '/');
    const sorted = sortFolderListing(listing, all, folder || '/', {
      field: sortField,
      direction: sortDirection,
    });
    const base = folder || '/';
    const folderItems = sorted.folders.map((name) => {
      const folderPath = `${base}${name}/`;
      const mtime = folderMtime(all, folderPath);
      return {
        name,
        mtime: mtime.toISOString(),
        size: folderSize(all, folderPath),
      };
    });
    return {
      ok: true,
      folders: folderItems,
      files: sorted.files.map((e) => serializeEntry(db, e)),
    };
  });

  ipcMain.handle('vault:getTree', (_evt, { expanded = [] }) => {
    if (!ctx.isReady()) return { ok: false, rows: [] };
    const db = ctx.getDb();
    const all = db.getAll();
    const rows = buildVisibleTreeRows(all, new Set(expanded)).map((row) => {
      if (row.kind === 'folder') {
        return {
          kind: 'folder',
          depth: row.depth,
          path: row.path,
          name: row.name,
          hasChildren: row.hasChildren,
          expanded: row.expanded,
        };
      }
      return {
        kind: 'file',
        depth: row.depth,
        entry: serializeEntry(db, row.entry),
      };
    });
    return { ok: true, rows };
  });

  ipcMain.handle('vault:getStats', () => {
    if (!ctx.isReady()) return { ok: false, count: 0 };
    const db = ctx.getDb();
    return {
      ok: true,
      count: db.listVisibleFileCount(),
      trashFolder: K_TRASH_FOLDER,
    };
  });

  ipcMain.handle('vault:getDashboard', (_evt, { rangeDays = 30 } = {}) => {
    if (!ctx.isReady()) {
      return { ok: false, error: 'not_ready' };
    }
    const { buildDashboardStats } = require('@televault/core');
    const all = ctx.getDb().getAll();
    const stats = buildDashboardStats(all, { rangeDays: Number(rangeDays) || 30 });
    return { ok: true, stats };
  });

  ipcMain.handle('vault:search', (_evt, { query, tags = [] }) => {
    if (!ctx.isReady()) return { ok: false, files: [] };
    const db = ctx.getDb();
    const files = db.search({ query, tags }).map((e) => serializeEntry(db, e));
    return { ok: true, files };
  });

  ipcMain.handle('vault:getFolderTags', (_evt, { folderPath }) => {
    if (!ctx.isReady()) return { ok: false, tags: [] };
    const db = ctx.getDb();
    const index = db.folderTagsIndex();
    return { ok: true, tags: index[folderPath] || [] };
  });

  ipcMain.handle('vault:allTags', async () => {
    if (!ctx.isReady()) return { ok: false, tags: {}, foldersByTag: {} };
    const db = ctx.getDb();
    db.reconcileFolderTagsFromMarkers();
    let foldersByTag = db.foldersByTag();
    const tagCounts = db.allTags();

    const needsTelegramResync = Object.keys(tagCounts).some((tag) => !(foldersByTag[tag]?.length));
    if (needsTelegramResync) {
      const channel = ctx.getChannel?.();
      const chatId = db.getVaultChatId();
      if (channel && chatId) {
        try {
          await channel.resyncDirMarkers(chatId);
          foldersByTag = db.foldersByTag();
        } catch (e) {
          console.error('[vault:allTags resync]', e);
        }
      }
    }

    return { ok: true, tags: tagCounts, names: db.allTagNames(), foldersByTag };
  });

  ipcMain.handle('vault:allFolders', () => {
    if (!ctx.isReady()) return { ok: false, folders: [] };
    const db = ctx.getDb();
    return { ok: true, folders: listAllFolders(db.getAll()) };
  });

  ipcMain.handle('vault:createFolder', async (_evt, { parentFolder, name }) => {
    try {
      const vault = requireVault();
      const folderName = String(name || '').trim().replace(/[/\\]/g, '');
      if (!folderName) return { ok: false, error: 'invalid_name' };
      const folderPath = `${parentFolder || '/'}${folderName}/`.replace('//', '/');
      await vault.createFolder(folderPath);
      broadcastVaultChanged();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('vault:renameFile', async (_evt, { messageId, newName }) => {
    try {
      const vault = requireVault();
      const db = ctx.getDb();
      const entry = db.getByMessageId(messageId);
      if (!entry) return { ok: false, error: 'not_found' };
      const parent = entry.path.slice(0, entry.path.lastIndexOf('/') + 1);
      const clean = String(newName || '').trim().replace(/[/\\]/g, '');
      await vault.renameFile(messageId, `${parent}${clean}`);
      broadcastVaultChanged();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('vault:renameFolder', async (_evt, { folderPath, newName }) => {
    try {
      const vault = requireVault();
      const clean = String(newName || '').trim().replace(/[/\\]/g, '');
      const parent = folderPath.slice(0, folderPath.lastIndexOf('/', folderPath.length - 2) + 1);
      await vault.renameFolder(folderPath, `${parent}${clean}/`);
      broadcastVaultChanged();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('vault:moveFile', async (_evt, { messageId, destFolder }) => {
    try {
      await requireVault().moveFile(messageId, destFolder);
      broadcastVaultChanged();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('vault:moveFolder', async (_evt, { folderPath, destFolder }) => {
    try {
      await requireVault().moveFolder(folderPath, destFolder);
      broadcastVaultChanged();
      return { ok: true };
    } catch (e) {
      if (e instanceof FolderMoveException) return { ok: false, error: 'into_descendant' };
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('vault:trash', async (_evt, { messageIds = [], folders = [] }) => {
    try {
      const vault = requireVault();
      if (messageIds.length) await vault.trashEntries(messageIds);
      for (const f of folders) await vault.trashFolder(f);
      broadcastVaultChanged();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('vault:restore', async (_evt, { messageIds = [], folders = [] }) => {
    try {
      const vault = requireVault();
      if (messageIds.length) await vault.restoreEntries(messageIds);
      for (const f of folders) await vault.restoreFolder(f);
      broadcastVaultChanged();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('vault:deletePermanent', async (_evt, { messageIds = [], folders = [] }) => {
    try {
      const vault = requireVault();
      if (messageIds.length) await vault.deleteEntries(messageIds);
      for (const f of folders) await vault.deleteFolderPermanently(f);
      broadcastVaultChanged();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('vault:setFolderTags', async (_evt, { folderPath, tags }) => {
    try {
      await requireVault().setFolderTags(folderPath, tags || []);
      broadcastVaultChanged();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('vault:renameTag', async (_evt, { from, to }) => {
    try {
      await requireVault().renameTag(from, to);
      broadcastVaultChanged();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('vault:deleteTag', async (_evt, { tag }) => {
    try {
      await requireVault().deleteTag(tag);
      broadcastVaultChanged();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('vault:checkDuplicate', (_evt, { sha256 }) => {
    if (!ctx.isReady()) return { ok: false, duplicate: null };
    const dup = ctx.getVault()?.checkDuplicate(sha256);
    return { ok: true, duplicate: dup ? serializeEntry(ctx.getDb(), dup) : null };
  });

  ipcMain.handle('vault:pickUploadFiles', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
    });
    if (result.canceled) return { ok: true, paths: [] };
    return { ok: true, paths: result.filePaths };
  });

  ipcMain.handle('vault:pickUploadFolder', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return { ok: true, paths: [] };
    return { ok: true, paths: [result.filePaths[0]] };
  });

  ipcMain.handle('vault:uploadPaths', async (_evt, { localPaths, destFolder }) => {
    try {
      const vault = requireVault();
      const folder = destFolder || '/';
      /** @type {string[]} */
      const queued = [];
      for (const localPath of localPaths || []) {
        if (!fs.existsSync(localPath)) continue;
        const stat = fs.statSync(localPath);
        if (stat.isDirectory()) {
          const base = path.basename(localPath);
          for (const { rel, full } of walkFilesEntries(localPath)) {
            const dest = `${folder}${base}/${rel}`.replace(/\/+/g, '/');
            if (!(await guardUpload(dest))) {
              return { ok: false, error: 'free_trial_expired', count: queued.length };
            }
            vault.enqueueUpload(full, dest);
            queued.push(dest);
          }
        } else {
          const dest = `${folder}${path.basename(localPath)}`.replace(/\/+/g, '/');
          if (!(await guardUpload(dest))) {
            return { ok: false, error: 'free_trial_expired', count: queued.length };
          }
          vault.enqueueUpload(localPath, dest);
          queued.push(dest);
        }
      }
      return { ok: true, count: queued.length };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('vault:download', async (_evt, { messageId }) => {
    try {
      const vault = requireVault();
      const db = ctx.getDb();
      const entry = db.getByMessageId(messageId);
      if (!entry) return { ok: false, error: 'not_found' };

      const saveDir = await resolveSaveAsDirectory(db);
      if (!saveDir) return { ok: false, cancelled: true };

      const { done } = vault.enqueueDownload(entry);
      const localPath = await done;
      const fileName = entry.path.split('/').pop() || 'download';
      const destPath = copyToSaveDirectory(localPath, saveDir, fileName);
      shell.showItemInFolder(destPath);
      return { ok: true, path: destPath, saveDir };
    } catch (e) {
      console.error('[vault:download]', e);
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('vault:downloadFolder', async (evt, { folderPath }) => {
    try {
      const vault = requireVault();
      const db = ctx.getDb();
      if (!folderPath?.endsWith('/')) return { ok: false, error: 'invalid_folder' };

      const result = await exportVaultFolder({
        db,
        vault,
        folderPrefix: folderPath,
        onProgress: (current, total, name) => {
          evt.sender.send('vault:downloadFolderProgress', { current, total, name, folderPath });
        },
      });
      if (!result) return { ok: false, cancelled: true };
      if (fs.existsSync(result.destRoot)) shell.showItemInFolder(result.destRoot);
      return { ok: true, ...result };
    } catch (e) {
      console.error('[vault:downloadFolder]', e);
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('vault:saveAs', async (_evt, { messageId }) => {
    try {
      const vault = requireVault();
      const db = ctx.getDb();
      const entry = db.getByMessageId(messageId);
      if (!entry) return { ok: false, error: 'not_found' };
      const win = BrowserWindow.getFocusedWindow();
      const defaultDir = db.getSaveAsDirectory() || undefined;
      const fileName = entry.path.split('/').pop() || 'download';
      const result = await dialog.showSaveDialog(win, {
        defaultPath: defaultDir ? path.join(defaultDir, fileName) : fileName,
      });
      if (result.canceled || !result.filePath) return { ok: false, cancelled: true };
      const { done } = vault.enqueueDownload(entry);
      const localPath = await done;
      fs.copyFileSync(localPath, result.filePath);
      db.setSaveAsDirectory(path.dirname(result.filePath));
      return { ok: true, path: result.filePath };
    } catch (e) {
      console.error('[vault:saveAs]', e);
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('vault:openFile', async (_evt, { messageId }) => {
    try {
      const db = ctx.getDb();
      const entry = db.getByMessageId(messageId);
      if (!entry) return { ok: false, error: 'not_found' };
      let localPath = entry.localPath;
      if (!localPath || !fs.existsSync(localPath)) {
        const vault = requireVault();
        const { done } = vault.enqueueDownload(entry);
        localPath = await done;
      }
      db.touchLastUsed(messageId);
      await shell.openPath(localPath);
      return { ok: true, localPath };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('vault:readFileText', (_evt, { messageId }) => {
    try {
      const db = ctx.getDb();
      const entry = db.getByMessageId(messageId);
      if (!entry?.localPath) return { ok: false, error: 'not_cached' };
      const text = fs.readFileSync(entry.localPath, 'utf8');
      return { ok: true, text };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('vault:getLocalPath', async (_evt, { messageId }) => {
    try {
      const db = ctx.getDb();
      const entry = db.getByMessageId(messageId);
      if (!entry) return { ok: false, error: 'not_found' };
      let localPath = entry.localPath;
      if (!localPath || !fs.existsSync(localPath)) {
        const vault = requireVault();
        const { done } = vault.enqueueDownload(entry);
        localPath = await done;
      }
      return { ok: true, localPath };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('vault:getTransfers', () => {
    const queue = ctx.getQueue();
    if (!queue) return { ok: false, tasks: [] };
    return { ok: true, tasks: queue.snapshot() };
  });

  ipcMain.handle('vault:cancelTransfer', (_evt, { taskId }) => {
    ctx.getQueue()?.cancel(taskId);
    return { ok: true };
  });

  ipcMain.handle('vault:clearFinishedTransfers', () => {
    ctx.getVault()?.clearFinishedTransfers();
    return { ok: true };
  });

  ipcMain.handle('settings:get', () => {
    const db = ctx.getDb();
    if (!db) return { ok: false };
    return {
      ok: true,
      locale: db.getSetting('locale', 'vi'),
      theme: db.getSetting('theme', 'light'),
      maxConcurrentTransfers: Number(db.getSetting('max_concurrent_transfers', '2')),
      cacheLimitGb: Number(db.getSetting('cache_limit_gb', '2')),
      autoResumeTransfers: db.getAutoResumeTransfers(),
      saveAsDirectory: db.getSaveAsDirectory(),
    };
  });

  ipcMain.handle('settings:pickSaveAsDirectory', async () => {
    if (!ctx.isReady()) return { ok: false };
    const db = ctx.getDb();
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false, cancelled: true };
    db.setSaveAsDirectory(result.filePaths[0]);
    return { ok: true, path: result.filePaths[0] };
  });

  ipcMain.handle('settings:clearSaveAsDirectory', () => {
    if (!ctx.isReady()) return { ok: false };
    ctx.getDb().clearSaveAsDirectory();
    return { ok: true };
  });

  ipcMain.handle('settings:set', (_evt, settings) => {
    const db = ctx.getDb();
    if (!db) return { ok: false };
    if (settings.locale != null) db.setSetting('locale', settings.locale);
    if (settings.theme != null) db.setSetting('theme', settings.theme);
    if (settings.maxConcurrentTransfers != null) {
      db.setSetting('max_concurrent_transfers', String(settings.maxConcurrentTransfers));
      ctx.getQueue()?.setMaxConcurrent(settings.maxConcurrentTransfers);
    }
    if (settings.cacheLimitGb != null) {
      db.setSetting('cache_limit_gb', String(settings.cacheLimitGb));
      db.setCacheLimitBytes(settings.cacheLimitGb * 1024 * 1024 * 1024);
    }
    if (settings.autoResumeTransfers != null) {
      db.setAutoResumeTransfers(Boolean(settings.autoResumeTransfers));
    }
    if (settings.saveAsDirectory != null) {
      if (settings.saveAsDirectory === '') db.clearSaveAsDirectory();
      else db.setSaveAsDirectory(settings.saveAsDirectory);
    }
    return { ok: true };
  });
}

/** @param {string} dir @returns {Array<{ rel: string, full: string }>} */
function walkFilesEntries(dir, prefix = '') {
  /** @type {Array<{ rel: string, full: string }>} */
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (fs.statSync(full).isDirectory()) out.push(...walkFilesEntries(full, rel));
    else out.push({ rel: rel.replace(/\\/g, '/'), full });
  }
  return out;
}

/** @param {string} dir @param {(rel: string, full: string) => void} fn */
function walkFiles(dir, fn, prefix = '') {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (fs.statSync(full).isDirectory()) walkFiles(full, fn, rel);
    else fn(rel.replace(/\\/g, '/'), full);
  }
}

function broadcastVaultChanged() {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('vault:changed');
  }
}

function broadcastTransfersChanged() {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('transfers:changed');
  }
}

function broadcastSharedVaultsChanged() {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('sharedVault:changed');
  }
}

/**
 * @param {import('electron').IpcMain} ipcMain
 * @param {{ getSharedVaults: () => import('../vault/sharedVaultManager').SharedVaultManager | null, getClient: () => unknown, getDb: () => unknown, isReady: () => boolean }} ctx
 */
function registerSharedVaultHandlers(ipcMain, ctx) {
  ipcMain.handle('sharedVault:list', () => {
    const mgr = ctx.getSharedVaults();
    if (!mgr) return { ok: false, vaults: [] };
    return { ok: true, vaults: mgr.getDiscoveredVaults() };
  });

  ipcMain.handle('sharedVault:discover', async () => {
    try {
      const mgr = ctx.getSharedVaults();
      if (!mgr) return { ok: false, error: 'not_ready' };
      await mgr.discover();
      return { ok: true, vaults: mgr.getDiscoveredVaults() };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('sharedVault:scan', async (_evt, { chatId }) => {
    try {
      const mgr = ctx.getSharedVaults();
      if (!mgr) return { ok: false, error: 'not_ready' };
      await mgr.scanVault(chatId);
      return { ok: true };
    } catch (e) {
      console.error('[TeleVault shared-vault scan error]', e);
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('sharedVault:getListing', (_evt, { chatId, folder, sortField, sortDirection }) => {
    console.log(`[TeleVault] sharedVault:getListing called with folder: ${JSON.stringify(folder)}`);
    const mgr = ctx.getSharedVaults();
    if (!mgr) return { ok: false, folders: [], files: [] };
    return mgr.getListing(chatId, folder, sortField, sortDirection);
  });

  ipcMain.handle('sharedVault:search', (_evt, { chatId, query }) => {
    const mgr = ctx.getSharedVaults();
    if (!mgr) return { ok: false, files: [] };
    return mgr.search(chatId, query);
  });

  ipcMain.handle('sharedVault:getStats', (_evt, { chatId }) => {
    const mgr = ctx.getSharedVaults();
    if (!mgr) return { ok: false, count: 0 };
    return mgr.getStats(chatId);
  });

  
  ipcMain.handle('sharedVault:downloadFolder', async (_evt, { chatId, folderPath }) => {
    try {
      const mgr = ctx.getSharedVaults();
      if (!mgr) return { ok: false, error: 'not_ready' };
      if (!folderPath?.endsWith('/')) return { ok: false, error: 'invalid_folder' };

      const files = mgr.getFiles(chatId, folderPath);
      if (!files || files.length === 0) return { ok: false, error: 'Thư mục trống' };

      const db = ctx.getDb();
      const { resolveSaveAsDirectory, folderExportName } = require('../vault/fileExport');
      const saveDir = await resolveSaveAsDirectory(db);
      if (!saveDir) return { ok: false, cancelled: true };

      const rootName = folderExportName(folderPath);
      const destRoot = require('path').join(saveDir, rootName);
      
      const client = ctx.getClient();
      const { TransferTask } = require('../transfer/transferQueue');
      const queue = ctx.getQueue();

      for (const entry of files) {
        const messageId = entry.messageId;
        const relUnderFolder = entry.path.slice(folderPath.length);
        const relativePath = require('path').join(rootName, relUnderFolder);
        
        const task = new TransferTask({
          id: `shared_down:${chatId}_${messageId}_${Date.now()}`,
          kind: 'download',
          label: entry.path.split('/').pop(),
          messageId: messageId,
          totalBytes: entry.size || 0,
          metadata: { vaultPath: entry.path },
          run: async (report, signal) => {
            report(0);
            const msg = await client.invoke({ _: 'getMessage', chat_id: chatId, message_id: messageId });
            const fileId = msg?.content?.document?.document?.id;
            if (fileId == null) throw new Error('Tin nhắn không có file đính kèm');

            const fileInfo = await client.invoke({ _: 'getFile', file_id: fileId });
            const cached = fileInfo.local || {};
            let localPath = null;
            
            if (cached.is_downloading_completed && cached.path && require('fs').existsSync(cached.path)) {
              localPath = cached.path;
            } else {
              localPath = await new Promise((resolve, reject) => {
                let aborted = false;
                const timeout = setTimeout(() => {
                  client.off('update', handler);
                  reject(new Error('Download timeout — kiểm tra kết nối mạng'));
                }, 30 * 60 * 1000);

                const onAbort = () => {
                  aborted = true;
                  void client.invoke({ _: 'cancelDownloadFile', file_id: fileId }).catch(() => {});
                  clearTimeout(timeout);
                  client.off('update', handler);
                  reject(new Error('Người dùng đã hủy quá trình tải'));
                };
                if (signal) {
                  if (signal.aborted) return onAbort();
                  signal.addEventListener('abort', onAbort);
                }

                const handler = (u) => {
                  if (u._ !== 'updateFile') return;
                  const file = u.file;
                  if (file.id !== fileId) return;
                  const local = file.local || {};
                  if (file.size > 0) report(local.downloaded_size / file.size);
                  if (local.is_downloading_completed) {
                    clearTimeout(timeout);
                    client.off('update', handler);
                    if (signal) signal.removeEventListener('abort', onAbort);
                    resolve(local.path);
                  }
                };

                client.on('update', handler);
                client.invoke({ _: 'downloadFile', file_id: fileId, priority: 32, synchronous: false }).catch((e) => {
                  clearTimeout(timeout);
                  client.off('update', handler);
                  if (signal) signal.removeEventListener('abort', onAbort);
                  reject(e);
                });
              });
            }

            if (!localPath) throw new Error('Không thể tải file về cục bộ');
            report(1);
            
            const destDir = require('path').dirname(relativePath) === '.' ? saveDir : require('path').join(saveDir, require('path').dirname(relativePath));
            require('fs').mkdirSync(destDir, { recursive: true });
            const { uniqueDestPath } = require('../vault/fileExport');
            const dest = uniqueDestPath(destDir, require('path').basename(relativePath));
            require('fs').copyFileSync(localPath, dest);
          }
        });
        queue.add(task);
      }
      
      require('electron').shell.showItemInFolder(destRoot);
      return { ok: true, saved: files.length, failed: 0, destRoot, total: files.length };
    } catch (e) {
      console.error('[sharedVault:downloadFolder]', e);
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('sharedVault:download', async (_evt, { chatId, messageId }) => {
    console.log(`[sharedVault:download] called with chatId=${chatId}, messageId=${messageId}`);
    try {
      const mgr = ctx.getSharedVaults();
      if (!mgr) { console.log('[sharedVault:download] manager not ready'); return { ok: false, error: 'not_ready' }; }
      const info = mgr.getDownloadInfo(chatId, messageId);
      if (!info) { console.log('[sharedVault:download] entry not found for messageId:', messageId); return { ok: false, error: 'not_found' }; }
      console.log('[sharedVault:download] entry found:', info.entry.path);

      const db = ctx.getDb();
      const saveDir = await resolveSaveAsDirectory(db);
      if (!saveDir) { console.log('[sharedVault:download] user cancelled save dialog'); return { ok: false, cancelled: true }; }
      console.log('[sharedVault:download] saveDir:', saveDir);

      const client = ctx.getClient();
      const fileName = info.entry.path.split('/').pop() || 'download';
      
      const { TransferTask } = require('../transfer/transferQueue');
      const queue = ctx.getQueue();

      const task = new TransferTask({
        id: `shared_down:${chatId}_${messageId}_${Date.now()}`,
        kind: 'download',
        label: fileName,
        messageId: messageId,
        totalBytes: info.entry.size || 0,
        metadata: { vaultPath: info.entry.path },
        run: async (report, signal) => {
          report(0);
          const msg = await client.invoke({ _: 'getMessage', chat_id: chatId, message_id: messageId });
          const fileId = msg?.content?.document?.document?.id;
          if (fileId == null) throw new Error('Tin nhắn không có file đính kèm');

          const fileInfo = await client.invoke({ _: 'getFile', file_id: fileId });
          const cached = fileInfo.local || {};
          let localPath = null;
          
          if (cached.is_downloading_completed && cached.path && require('fs').existsSync(cached.path)) {
            localPath = cached.path;
          } else {
            localPath = await new Promise((resolve, reject) => {
              let aborted = false;
              const timeout = setTimeout(() => {
                client.off('update', handler);
                reject(new Error('Download timeout — kiểm tra kết nối mạng'));
              }, 30 * 60 * 1000);

              const onAbort = () => {
                aborted = true;
                void client.invoke({ _: 'cancelDownloadFile', file_id: fileId }).catch(() => {});
                clearTimeout(timeout);
                client.off('update', handler);
                reject(new Error('Người dùng đã hủy quá trình tải'));
              };
              if (signal) {
                if (signal.aborted) return onAbort();
                signal.addEventListener('abort', onAbort);
              }

              const handler = (u) => {
                if (u._ !== 'updateFile') return;
                const file = u.file;
                // Wait, TDLib returns integer IDs.
                if (file.id !== fileId) return;
                const local = file.local || {};
                
                if (file.size > 0) report(local.downloaded_size / file.size);
                
                if (local.is_downloading_completed) {
                  clearTimeout(timeout);
                  client.off('update', handler);
                  if (signal) signal.removeEventListener('abort', onAbort);
                  resolve(local.path);
                }
              };

              client.on('update', handler);
              
              client.invoke({
                _: 'downloadFile',
                file_id: fileId,
                priority: 32,
                synchronous: false,
              }).catch((e) => {
                clearTimeout(timeout);
                client.off('update', handler);
                if (signal) signal.removeEventListener('abort', onAbort);
                reject(e);
              });
            });
          }

          if (!localPath) throw new Error('Không thể tải file về cục bộ');
          
          report(1);
          const destPath = copyToSaveDirectory(localPath, saveDir, fileName);
          console.log('[sharedVault:download] copied to:', destPath);
          const { shell } = require('electron');
          shell.showItemInFolder(destPath);
        }
      });

      queue.add(task);
      return { ok: true, path: path.join(saveDir, fileName) };
    } catch (e) {
      console.error('[sharedVault:download]', e);
      return { ok: false, error: String(e.message || e) };
    }
  });
}

module.exports = { registerVaultHandlers, registerSharedVaultHandlers, broadcastVaultChanged, broadcastTransfersChanged, broadcastSharedVaultsChanged };
