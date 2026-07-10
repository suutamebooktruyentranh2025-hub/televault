const { app, BrowserWindow, ipcMain, shell, protocol, net } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: 'TeleVault',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  return win;
}

app.whenReady().then(async () => {
  protocol.handle('tv-local', (request) => {
    const filePath = request.url.slice('tv-local://'.length);
    return net.fetch('file://' + filePath);
  });

  // Register IPC handlers once, outside createWindow to prevent duplicate registration on macOS activate
  ipcMain.on('window:minimize', () => BrowserWindow.getFocusedWindow()?.minimize());
  ipcMain.on('window:maximize', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win?.isMaximized()) win.unmaximize();
    else win?.maximize();
  });
  ipcMain.on('window:close', () => BrowserWindow.getFocusedWindow()?.close());

  ipcMain.handle('shell:openExternal', async (_evt, { url }) => {
    const target = String(url || '').trim();
    if (!target || !/^(https?:|mailto:)/i.test(target)) {
      return { ok: false, error: 'invalid_url' };
    }
    await shell.openExternal(target);
    return { ok: true };
  });

  ipcMain.handle('shell:pickDirectory', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await require('electron').dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false };
    return { ok: true, path: result.filePaths[0] };
  });

  const { registerSessionHandlers } = require('./lib/ipc/sessionHandlers');
  registerSessionHandlers({ userDataPath: app.getPath('userData') });
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
