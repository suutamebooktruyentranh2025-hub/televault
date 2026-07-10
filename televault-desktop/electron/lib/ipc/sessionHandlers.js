const { ipcMain, shell, BrowserWindow } = require('electron');
const { AccountManager } = require('../auth/AccountManager');
const tgApiStore = require('../auth/telegramApiCredentialsStore');
const { TelegramCoordinator } = require('../telegram/telegramCoordinator');
const path = require('path');
const { registerVaultHandlers, registerSharedVaultHandlers, broadcastVaultChanged } = require('./vaultHandlers');
const { SyncService } = require('../sync/syncService');
const { registerSyncHandlers } = require('./syncHandlers');
const { GDriveSyncService } = require('../gdrive/gdriveSyncService');
const { registerGDriveHandlers } = require('./gdriveHandlers');

/** @typedef {'booting'|'supabaseAuth'|'telegramApiSetup'|'telegramBooting'|'auth'|'syncing'|'ready'} SessionPhase */

/**
 * @param {{ userDataPath: string }} ctx
 */
function registerSessionHandlers(ctx) {
  /** @type {SessionPhase} */
  let phase = 'booting';
  let telegramApi = null;
  let authError = null;
  let telegramRestartRecommended = false;
  
  const accountManager = new AccountManager(ctx.userDataPath);
  
  function getActiveUserDataPath() {
    const activeId = accountManager.getActiveAccountId() || 'default';
    return path.join(ctx.userDataPath, 'accounts', activeId);
  }

  function broadcastState() {
    const state = buildState();
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('session:changed', state);
    }
    if (state.phase === 'ready') {
      broadcastVaultChanged();
    }
    return state;
  }

  async function guardUpload(destPath) {
    return true;
  }

  async function onUploadSucceeded(destPath) {
    // no-op
  }

  let syncService = null;
  let gdriveSyncService = null;

  const telegram = new TelegramCoordinator({
    userDataPath: getActiveUserDataPath(),
    onAccountInfo: (info) => {
      const activeId = accountManager.getActiveAccountId();
      if (activeId) {
        accountManager.addOrUpdateAccount(activeId, info);
        broadcastState();
      }
    },
    onUploadDone: (destPath) => {
      void onUploadSucceeded(destPath);
    },
    onSyncReady: async () => {
      if (telegram.db && telegram.vault && !syncService) {
        syncService = new SyncService({
          db: telegram.db,
          vault: telegram.vault,
          onChange: () => {
            if (typeof broadcastSyncChanged === 'function') broadcastSyncChanged();
          },
        });
        await syncService.start().catch((err) => console.error('[SyncService start failed]', err));
      }
      if (telegram.db && telegram.vault && !gdriveSyncService) {
        gdriveSyncService = new GDriveSyncService({
          db: telegram.db,
          vault: telegram.vault,
          onChange: () => {
            if (typeof broadcastGDriveChanged === 'function') broadcastGDriveChanged();
          },
        });
        gdriveSyncService.startPolling();
      }
    },
    onChange: () => {
      if (telegram.getSnapshot().authState === 'ready') {
        telegramRestartRecommended = false;
      }
      void recomputePhase().then(async () => {
        broadcastState();
        const mode = telegramApi?.mode || 'personal';
        if (phase === 'ready' && telegram.db && telegram.vault) {
          if (!syncService) {
            syncService = new SyncService({
              db: telegram.db,
              vault: telegram.vault,
              onChange: () => {
                if (typeof broadcastSyncChanged === 'function') broadcastSyncChanged();
              },
            });
            await syncService.start().catch((err) => console.error('[SyncService start failed]', err));
          }
          if (!gdriveSyncService) {
            gdriveSyncService = new GDriveSyncService({
              db: telegram.db,
              vault: telegram.vault,
              onChange: () => {
                if (typeof broadcastGDriveChanged === 'function') broadcastGDriveChanged();
              },
            });
            gdriveSyncService.startPolling();
          }
        } else {
          if (syncService) {
            await syncService.stop();
            syncService = null;
            if (typeof broadcastSyncChanged === 'function') broadcastSyncChanged();
          }
          if (gdriveSyncService) {
            gdriveSyncService.stopPolling();
            gdriveSyncService = null;
            if (typeof broadcastGDriveChanged === 'function') broadcastGDriveChanged();
          }
        }
      });
    },
  });

  registerVaultHandlers(ipcMain, {
    getDb: () => telegram.db,
    getVault: () => telegram.vault,
    getQueue: () => telegram.queue,
    getChannel: () => telegram.channel,
    isReady: () => phase === 'ready' && Boolean(telegram.db),
    guardUpload,
  });

  registerSharedVaultHandlers(ipcMain, {
    getSharedVaults: () => telegram.sharedVaults,
    getClient: () => telegram.client,
    getDb: () => telegram.db,
    getQueue: () => telegram.queue,
    isReady: () => telegram.syncComplete ?? false,
  });

  const { broadcastSyncChanged } = registerSyncHandlers(ipcMain, {
    getDb: () => telegram.db,
    getSyncService: () => syncService,
    isReady: () => phase === 'ready' && Boolean(telegram.db),
  });

  const { broadcastGDriveChanged } = registerGDriveHandlers(ipcMain, {
    getDb: () => telegram.db,
    getGDriveSyncService: () => gdriveSyncService,
    isReady: () => phase === 'ready' && Boolean(telegram.db),
  });

  function telegramSnapshot() {
    return telegram.getSnapshot();
  }

  async function recomputePhase() {
    const tgSnap = telegramSnapshot();
    const activeId = accountManager.getActiveAccountId() || 'default';
    
    telegramApi = tgApiStore.load({
      userDataPath: ctx.userDataPath,
      userId: activeId,
    });

    if (!telegramApi) {
      phase = 'telegramApiSetup';
      return;
    }

    const tg = telegramSnapshot();
    if (tg.booting) {
      phase = 'telegramBooting';
      return;
    }
    if (tg.bootError) {
      phase = 'telegramApiSetup';
      return;
    }

    if (tg.authState === 'ready' && tg.syncError) {
      phase = 'auth';
      return;
    }
    if (tg.authState === 'ready' && telegram.channel && tg.syncComplete) {
      phase = 'ready';
      return;
    }
    if (tg.authState === 'ready' && telegram.channel) {
      phase = 'syncing';
      return;
    }
    if (tg.authState === 'ready') {
      phase = tg.syncError ? 'auth' : 'syncing';
      return;
    }

    phase = 'auth';
  }

  async function maybeStartTelegram() {
    const activeId = accountManager.getActiveAccountId() || 'default';
    const creds = tgApiStore.load({
      userDataPath: ctx.userDataPath,
      userId: activeId,
    });
    if (!creds) return;
    telegramApi = creds;
    if (telegram.isActive()) {
      await recomputePhase();
      return;
    }
    try {
      await telegram.start(creds);
    } catch (e) {
      authError = String(e.message || e);
    }
    await recomputePhase();
  }

  function buildState() {
    const tgSnap = telegramSnapshot();
    return {
      phase,
      authError: authError || tgSnap.authError,
      syncError: tgSnap.syncError,
      hasTelegramApi: Boolean(telegramApi),
      telegramApiId: telegramApi?.apiId || null,
      authState: tgSnap.authState,
      authDetail: tgSnap.authDetail || {},
      scannedCount: tgSnap.scannedCount,
      entryCount: tgSnap.entryCount,
      bootError: tgSnap.bootError,
      telegramRestartRecommended,
      accounts: accountManager.getAccounts(),
      activeAccountId: accountManager.getActiveAccountId(),
    };
  }

  /** @type {Promise<ReturnType<typeof buildState>> | null} */
  let hydratePromise = null;

  async function hydrate() {
    if (hydratePromise) return hydratePromise;
    hydratePromise = (async () => {
      phase = 'booting';
      await recomputePhase();
      if (telegramApi) {
        await maybeStartTelegram();
      }
      await recomputePhase();
      return buildState();
    })().finally(() => {
      hydratePromise = null;
    });
    return hydratePromise;
  }

  ipcMain.handle('session:hydrate', hydrate);
  ipcMain.handle('session:getState', async () => {
    await recomputePhase();
    return buildState();
  });


  ipcMain.handle('session:signOut', async () => {
    // Close TDLib client without logOut — Telegram auth stays in userData/td for next sign-in.
    if (syncService) {
      await syncService.stop().catch(() => {});
      syncService = null;
    }
    if (gdriveSyncService) {
      gdriveSyncService.stopPolling();
      gdriveSyncService = null;
    }
    await telegram.shutdown();
    telegramApi = null;
    phase = 'telegramApiSetup';
    authError = null;
    return buildState();
  });


  ipcMain.handle('session:saveTelegramApi', async (_evt, { apiId, apiHash }) => {
    authError = null;
    const activeId = accountManager.getActiveAccountId();
    let accountId = activeId;
    if (!accountId) {
      const acc = accountManager.addOrUpdateAccount(null, { name: 'Mới' });
      accountId = acc.id;
    }
    
    const id = Number(apiId);
    const hash = String(apiHash || '').trim();
    if (!Number.isFinite(id) || id <= 0 || !hash) {
      authError = 'telegram_api_invalid';
      return { ok: false, error: authError };
    }
    try {
      tgApiStore.save({ userDataPath: ctx.userDataPath, userId: accountId, apiId: id, apiHash: hash });
      telegramApi = { apiId: id, apiHash: hash };
      telegram.userDataPath = getActiveUserDataPath();
      await telegram.start({ apiId: id, apiHash: hash });
      await recomputePhase();
      return { ok: true, state: buildState() };
    } catch (e) {
      authError = String(e.message || e);
      return { ok: false, error: authError };
    }
  });

  ipcMain.handle('session:submitPhone', async (_evt, { phone }) => {
    telegram.submitPhone(phone);
    await recomputePhase();
    return buildState();
  });

  ipcMain.handle('session:submitEmail', async (_evt, { email }) => {
    telegram.submitEmail(email);
    await recomputePhase();
    return buildState();
  });

  ipcMain.handle('session:submitEmailCode', async (_evt, { code }) => {
    telegram.submitEmailCode(code);
    await recomputePhase();
    return buildState();
  });

  ipcMain.handle('session:submitRegistration', async (_evt, { firstName, lastName }) => {
    telegram.submitRegistration(firstName, lastName);
    await recomputePhase();
    return buildState();
  });

  ipcMain.handle('session:submitCode', async (_evt, { code }) => {
    telegram.submitCode(code);
    await recomputePhase();
    return buildState();
  });

  ipcMain.handle('session:submitPassword', async (_evt, { password }) => {
    telegram.submitPassword(password);
    await recomputePhase();
    return buildState();
  });

  ipcMain.handle('session:signOutTelegram', async () => {
    try {
      authError = null;
      await telegram.logOutTelegram(telegramApi);
      telegramRestartRecommended = true;
    } catch (e) {
      authError = String(e.message || e);
    }
    await recomputePhase();
    broadcastState();
    return buildState();
  });

  ipcMain.handle('session:switchAccount', async (_evt, accountId) => {
    if (accountManager.setActiveAccount(accountId)) {
      if (syncService) {
        await syncService.stop().catch(() => {});
        syncService = null;
      }
      if (gdriveSyncService) {
        gdriveSyncService.stopPolling();
        gdriveSyncService = null;
      }
      await telegram.shutdown();
      telegram.userDataPath = getActiveUserDataPath();
      telegramApi = null;
      phase = 'booting';
      authError = null;
      await recomputePhase();
      if (telegramApi) {
        await maybeStartTelegram();
      }
      await recomputePhase();
    }
    return buildState();
  });

  ipcMain.handle('session:addAccount', async () => {
    if (syncService) {
      await syncService.stop().catch(() => {});
      syncService = null;
    }
    if (gdriveSyncService) {
      gdriveSyncService.stopPolling();
      gdriveSyncService = null;
    }
    await telegram.shutdown();
    const acc = accountManager.addOrUpdateAccount(null, { name: 'Mới' });
    accountManager.setActiveAccount(acc.id);
    telegram.userDataPath = getActiveUserDataPath();
    telegramApi = null;
    phase = 'telegramApiSetup';
    authError = null;
    await recomputePhase();
    return buildState();
  });

  ipcMain.handle('session:resetTelegramApi', async () => {
    const activeId = accountManager.getActiveAccountId();
    if (activeId) {
      tgApiStore.clear({ userDataPath: ctx.userDataPath, userId: activeId });
    }
    await telegram.shutdown();
    telegramApi = null;
    phase = 'telegramApiSetup';
    authError = null;
    await recomputePhase();
    return buildState();
  });

  ipcMain.handle('session:factoryReset', async () => {
    const { app } = require('electron');
    const fs = require('fs');
    if (syncService) {
      await syncService.stop().catch(() => {});
    }
    if (gdriveSyncService) {
      gdriveSyncService.stopPolling();
    }
    await telegram.shutdown();
    try {
      fs.rmSync(ctx.userDataPath, { recursive: true, force: true });
    } catch (e) {
      console.error('Failed to wipe user data:', e);
    }
    app.relaunch();
    app.exit(0);
  });

  return { hydrate, getState: buildState, broadcastState };
}

module.exports = { registerSessionHandlers };
