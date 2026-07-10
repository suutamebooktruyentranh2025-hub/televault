const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('televault', {
  session: {
    hydrate: () => ipcRenderer.invoke('session:hydrate'),
    getState: () => ipcRenderer.invoke('session:getState'),
    signInGoogle: () => ipcRenderer.invoke('session:signInGoogle'),
    signOut: () => ipcRenderer.invoke('session:signOut'),
    forceLogoutExpiredTrial: () => ipcRenderer.invoke('session:forceLogoutExpiredTrial'),
    saveTelegramApi: (apiId, apiHash) =>
      ipcRenderer.invoke('session:saveTelegramApi', { apiId, apiHash }),
    submitPhone: (phone) => ipcRenderer.invoke('session:submitPhone', { phone }),
    submitEmail: (email) => ipcRenderer.invoke('session:submitEmail', { email }),
    submitEmailCode: (code) => ipcRenderer.invoke('session:submitEmailCode', { code }),
    submitRegistration: (firstName, lastName) =>
      ipcRenderer.invoke('session:submitRegistration', { firstName, lastName }),
    submitCode: (code) => ipcRenderer.invoke('session:submitCode', { code }),
    submitPassword: (password) => ipcRenderer.invoke('session:submitPassword', { password }),
    signOutTelegram: () => ipcRenderer.invoke('session:signOutTelegram'),
    switchAccount: (accountId) => ipcRenderer.invoke('session:switchAccount', accountId),
    addAccount: () => ipcRenderer.invoke('session:addAccount'),
    resetTelegramApi: () => ipcRenderer.invoke('session:resetTelegramApi'),
    factoryReset: () => ipcRenderer.invoke('session:factoryReset'),
    onChanged: (callback) => {
      const listener = (_evt, state) => callback(state);
      ipcRenderer.on('session:changed', listener);
      return () => ipcRenderer.removeListener('session:changed', listener);
    },
  },
  vault: {
    getListing: (folder, sortField, sortDirection) =>
      ipcRenderer.invoke('vault:getListing', { folder, sortField, sortDirection }),
    getTree: (expanded) => ipcRenderer.invoke('vault:getTree', { expanded }),
    getStats: () => ipcRenderer.invoke('vault:getStats'),
    getDashboard: (rangeDays) => ipcRenderer.invoke('vault:getDashboard', { rangeDays }),
    search: (query, tags) => ipcRenderer.invoke('vault:search', { query, tags }),
    allTags: () => ipcRenderer.invoke('vault:allTags'),
    getFolderTags: (folderPath) => ipcRenderer.invoke('vault:getFolderTags', { folderPath }),
    allFolders: () => ipcRenderer.invoke('vault:allFolders'),
    createFolder: (parentFolder, name) =>
      ipcRenderer.invoke('vault:createFolder', { parentFolder, name }),
    renameFile: (messageId, newName) =>
      ipcRenderer.invoke('vault:renameFile', { messageId, newName }),
    renameFolder: (folderPath, newName) =>
      ipcRenderer.invoke('vault:renameFolder', { folderPath, newName }),
    moveFile: (messageId, destFolder) =>
      ipcRenderer.invoke('vault:moveFile', { messageId, destFolder }),
    moveFolder: (folderPath, destFolder) =>
      ipcRenderer.invoke('vault:moveFolder', { folderPath, destFolder }),
    trash: (messageIds, folders) =>
      ipcRenderer.invoke('vault:trash', { messageIds, folders }),
    restore: (messageIds, folders) =>
      ipcRenderer.invoke('vault:restore', { messageIds, folders }),
    deletePermanent: (messageIds, folders) =>
      ipcRenderer.invoke('vault:deletePermanent', { messageIds, folders }),
    setFolderTags: (folderPath, tags) =>
      ipcRenderer.invoke('vault:setFolderTags', { folderPath, tags }),
    renameTag: (from, to) => ipcRenderer.invoke('vault:renameTag', { from, to }),
    deleteTag: (tag) => ipcRenderer.invoke('vault:deleteTag', { tag }),
    checkDuplicate: (sha256) => ipcRenderer.invoke('vault:checkDuplicate', { sha256 }),
    pickUploadFiles: () => ipcRenderer.invoke('vault:pickUploadFiles'),
    pickUploadFolder: () => ipcRenderer.invoke('vault:pickUploadFolder'),
    uploadPaths: (localPaths, destFolder) =>
      ipcRenderer.invoke('vault:uploadPaths', { localPaths, destFolder }),
    download: (messageId) => ipcRenderer.invoke('vault:download', { messageId }),
    downloadFolder: (folderPath) => ipcRenderer.invoke('vault:downloadFolder', { folderPath }),
    onDownloadFolderProgress: (callback) => {
      const listener = (_evt, payload) => callback(payload);
      ipcRenderer.on('vault:downloadFolderProgress', listener);
      return () => ipcRenderer.removeListener('vault:downloadFolderProgress', listener);
    },
    saveAs: (messageId) => ipcRenderer.invoke('vault:saveAs', { messageId }),
    openFile: (messageId) => ipcRenderer.invoke('vault:openFile', { messageId }),
    getLocalPath: (messageId) => ipcRenderer.invoke('vault:getLocalPath', { messageId }),
    readFileText: (messageId) => ipcRenderer.invoke('vault:readFileText', { messageId }),
    getTransfers: () => ipcRenderer.invoke('vault:getTransfers'),
    cancelTransfer: (taskId) => ipcRenderer.invoke('vault:cancelTransfer', { taskId }),
    clearFinishedTransfers: () => ipcRenderer.invoke('vault:clearFinishedTransfers'),
    onChanged: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('vault:changed', listener);
      return () => ipcRenderer.removeListener('vault:changed', listener);
    },
    onTransfersChanged: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('transfers:changed', listener);
      return () => ipcRenderer.removeListener('transfers:changed', listener);
    },
  },
  sharedVault: {
    discover: () => ipcRenderer.invoke('sharedVault:discover'),
    list: () => ipcRenderer.invoke('sharedVault:list'),
    scan: (chatId) => ipcRenderer.invoke('sharedVault:scan', { chatId }),
    getListing: (chatId, folder, sortField, sortDirection) =>
      ipcRenderer.invoke('sharedVault:getListing', { chatId, folder, sortField, sortDirection }),
    search: (chatId, query) => ipcRenderer.invoke('sharedVault:search', { chatId, query }),
    downloadFolder: (chatId, folderPath) => ipcRenderer.invoke('sharedVault:downloadFolder', { chatId, folderPath }),
    download: (chatId, messageId) => ipcRenderer.invoke('sharedVault:download', { chatId, messageId }),
    getStats: (chatId) => ipcRenderer.invoke('sharedVault:getStats', { chatId }),
    onChanged: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('sharedVault:changed', listener);
      return () => ipcRenderer.removeListener('sharedVault:changed', listener);
    },
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (values) => ipcRenderer.invoke('settings:set', values),
    pickSaveAsDirectory: () => ipcRenderer.invoke('settings:pickSaveAsDirectory'),
    clearSaveAsDirectory: () => ipcRenderer.invoke('settings:clearSaveAsDirectory'),
  },
  sync: {
    getConfig: () => ipcRenderer.invoke('sync:getConfig'),
    setConfig: (config) => ipcRenderer.invoke('sync:setConfig', config),
    pickFolder: () => ipcRenderer.invoke('sync:pickFolder'),
    getStatus: () => ipcRenderer.invoke('sync:getStatus'),
    start: () => ipcRenderer.invoke('sync:start'),
    stop: () => ipcRenderer.invoke('sync:stop'),
    runInitialSync: (strategy) => ipcRenderer.invoke('sync:runInitialSync', { strategy }),
    getInitialCounts: () => ipcRenderer.invoke('sync:getInitialCounts'),
    onChanged: (callback) => {
      const listener = (_evt, snapshot) => callback(snapshot);
      ipcRenderer.on('sync:changed', listener);
      return () => ipcRenderer.removeListener('sync:changed', listener);
    },
  },
  gdrive: {
    getStatus: () => ipcRenderer.invoke('gdrive:getStatus'),
    connect: (clientId, clientSecret) => ipcRenderer.invoke('gdrive:connect', { clientId, clientSecret }),
    disconnect: () => ipcRenderer.invoke('gdrive:disconnect'),
    setPaused: (paused) => ipcRenderer.invoke('gdrive:setPaused', { paused }),
    listFolder: (folderId) => ipcRenderer.invoke('gdrive:listFolder', { folderId }),
    addSubscription: (sub) => ipcRenderer.invoke('gdrive:addSubscription', sub),
    removeSubscription: (driveId) => ipcRenderer.invoke('gdrive:removeSubscription', { driveId }),
    toggleSubscription: (driveId, enabled) => ipcRenderer.invoke('gdrive:toggleSubscription', { driveId, enabled }),
    getSubscriptions: () => ipcRenderer.invoke('gdrive:getSubscriptions'),
    scanNow: () => ipcRenderer.invoke('gdrive:scanNow'),
    retryFile: (driveFileId) => ipcRenderer.invoke('gdrive:retryFile', { driveFileId }),
    setPollInterval: (intervalMs) => ipcRenderer.invoke('gdrive:setPollInterval', { intervalMs }),
    setFilters: (ignored, allowed) => ipcRenderer.invoke('gdrive:setFilters', { ignored, allowed }),
    setTempDir: (tempDir) => ipcRenderer.invoke('gdrive:setTempDir', { tempDir }),
    removeQueueItem: (driveFileId) => ipcRenderer.invoke('gdrive:removeQueueItem', { driveFileId }),
    clearErrors: () => ipcRenderer.invoke('gdrive:clearErrors'),
    clearHistory: () => ipcRenderer.invoke('gdrive:clearHistory'),
    removeErrorItem: (driveFileId) => ipcRenderer.invoke('gdrive:removeErrorItem', { driveFileId }),
    removeHistoryItem: (driveFileId) => ipcRenderer.invoke('gdrive:removeHistoryItem', { driveFileId }),
    onChanged: (callback) => {
      const listener = (_evt, snapshot) => callback(snapshot);
      ipcRenderer.on('gdrive:changed', listener);
      return () => ipcRenderer.removeListener('gdrive:changed', listener);
    },
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', { url }),
    pickDirectory: () => ipcRenderer.invoke('shell:pickDirectory'),
  },
});
