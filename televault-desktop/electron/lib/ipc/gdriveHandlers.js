const { BrowserWindow } = require('electron');

/**
 * @param {import('electron').IpcMain} ipcMain
 * @param {{
 *   getDb: () => any,
 *   getGDriveSyncService: () => import('../gdrive/gdriveSyncService').GDriveSyncService | null,
 *   isReady: () => boolean,
 * }} ctx
 */
function registerGDriveHandlers(ipcMain, ctx) {
  function broadcastGDriveChanged() {
    const svc = ctx.getGDriveSyncService();
    const snapshot = svc ? svc.getSnapshot() : null;
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('gdrive:changed', snapshot);
    }
  }

  ipcMain.handle('gdrive:getStatus', () => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false, connected: false };
    return { ok: true, ...svc.getSnapshot() };
  });

  ipcMain.handle('gdrive:connect', async (_evt, { clientId, clientSecret }) => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false, error: 'Service not available' };
    try {
      const result = await svc.connect(clientId, clientSecret);
      if (result.ok) svc.startPolling();
      broadcastGDriveChanged();
      return result;
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('gdrive:disconnect', () => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false };
    svc.disconnect();
    broadcastGDriveChanged();
    return { ok: true };
  });

  ipcMain.handle('gdrive:listFolder', async (_evt, { folderId }) => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false, files: [] };
    try {
      const files = await svc.listDriveFolder(folderId || 'root');
      return { ok: true, files };
    } catch (e) {
      return { ok: false, error: String(e.message || e), files: [] };
    }
  });

  ipcMain.handle('gdrive:addSubscription', async (_evt, sub) => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false };
    svc.addSubscription(sub);
    broadcastGDriveChanged();
    return { ok: true };
  });

  ipcMain.handle('gdrive:removeSubscription', async (_evt, { driveId }) => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false };
    svc.removeSubscription(driveId);
    broadcastGDriveChanged();
    return { ok: true };
  });

  ipcMain.handle('gdrive:toggleSubscription', async (_evt, { driveId, enabled }) => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false };
    svc.toggleSubscription(driveId, enabled);
    broadcastGDriveChanged();
    return { ok: true };
  });

  ipcMain.handle('gdrive:getSubscriptions', () => {
    const db = ctx.getDb();
    if (!db) return { ok: false, subscriptions: [] };
    return { ok: true, subscriptions: db.gdriveSubscriptionsAll() };
  });

  ipcMain.handle('gdrive:scanNow', async () => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false, error: 'Service not available' };
    try {
      await svc.scanNow();
      broadcastGDriveChanged();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('gdrive:retryFile', async (_evt, { driveFileId }) => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false, error: 'Service not available' };
    try {
      const res = await svc.retryFile(driveFileId);
      broadcastGDriveChanged();
      return res;
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('gdrive:removeQueueItem', async (_evt, { driveFileId }) => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false, error: 'Service not available' };
    svc.removeQueueItem(driveFileId);
    broadcastGDriveChanged();
    return { ok: true };
  });

  ipcMain.handle('gdrive:setPaused', async (_evt, { paused }) => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false };
    svc.setPaused(paused);
    broadcastGDriveChanged();
    return { ok: true };
  });

  ipcMain.handle('gdrive:setPollInterval', async (_evt, { intervalMs }) => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false };
    svc.setPollInterval(intervalMs);
    broadcastGDriveChanged();
    return { ok: true };
  });

  ipcMain.handle('gdrive:setFilters', async (_evt, { ignored, allowed }) => {
    const db = ctx.getDb();
    if (!db) return { ok: false };
    db.gdriveStateSet('ignored_extensions', ignored || '');
    db.gdriveStateSet('allowed_extensions', allowed || '');
    broadcastGDriveChanged();
    return { ok: true };
  });

  ipcMain.handle('gdrive:setTempDir', async (_evt, { tempDir }) => {
    const db = ctx.getDb();
    if (!db) return { ok: false };
    db.gdriveStateSet('temp_download_dir', tempDir || '');
    broadcastGDriveChanged();
    return { ok: true };
  });

  ipcMain.handle('gdrive:clearErrors', () => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false };
    svc.db.gdriveSyncErrorsClear();
    broadcastGDriveChanged();
    return { ok: true };
  });

  ipcMain.handle('gdrive:clearHistory', () => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false };
    svc.db.gdriveManifestClear();
    broadcastGDriveChanged();
    return { ok: true };
  });

  ipcMain.handle('gdrive:removeErrorItem', (_evt, { driveFileId }) => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false };
    svc.db.gdriveSyncErrorRemove(driveFileId);
    broadcastGDriveChanged();
    return { ok: true };
  });

  ipcMain.handle('gdrive:removeHistoryItem', (_evt, { driveFileId }) => {
    const svc = ctx.getGDriveSyncService();
    if (!svc) return { ok: false };
    svc.db.gdriveManifestDelete(driveFileId);
    broadcastGDriveChanged();
    return { ok: true };
  });

  return { broadcastGDriveChanged };
}

module.exports = { registerGDriveHandlers };
