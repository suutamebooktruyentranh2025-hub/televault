import re

with open('televault-desktop/electron/lib/ipc/sessionHandlers.js', 'r') as f:
    content = f.read()

# 1. Remove imports
content = re.sub(r"const googleAuth = require\('\.\./auth/googleAuthService'\);\n", "", content)
content = re.sub(r"const \{ isFreeUserTokenTier, isFreeTrialExpired \} = require\('\.\./auth/freeUserTier'\);\n", "", content)
content = re.sub(r"const freeUserCredits = require\('\.\./auth/freeUserCredits'\);\n", "", content)

# 2. Remove state vars
content = re.sub(r"  let supabaseSession = null;\n", "", content)
content = re.sub(r"  let signingIn = false;\n", "", content)
content = re.sub(r"  let freeUserTrialExpiredDialogPending = false;\n", "", content)

# 3. Replace Trial and Upload guards
target_guard = r"  function checkTrialFromSession\(session\) \{.*?async function onUploadSucceeded\(destPath\) \{.*?\n  \}"
replacement_guard = """  async function guardUpload(destPath) {
    return true;
  }

  async function onUploadSucceeded(destPath) {
    // no-op
  }"""
content = re.sub(target_guard, replacement_guard, content, flags=re.DOTALL)

# 4. Modify recomputePhase
target_recompute = r"""  async function recomputePhase\(\) \{
    if \(!supabaseSession\?\.userId\) \{
      phase = 'supabaseAuth';
      return;
    \}

    if \(freeUserTrialExpiredDialogPending\) \{
      phase = 'supabaseAuth';
      return;
    \}

    telegramApi = tgApiStore\.load\(\{
      userDataPath: ctx\.userDataPath,
      userId: supabaseSession\.userId,
    \}\);"""
replacement_recompute = """  async function recomputePhase() {
    telegramApi = tgApiStore.load({
      userDataPath: ctx.userDataPath,
      userId: 'default_user',
    });"""
content = re.sub(target_recompute, replacement_recompute, content)

# 5. Modify maybeStartTelegram
target_maybe = r"""  async function maybeStartTelegram\(\) \{
    if \(!supabaseSession\?\.userId \|\| freeUserTrialExpiredDialogPending\) return;
    const creds = tgApiStore\.load\(\{
      userDataPath: ctx\.userDataPath,
      userId: supabaseSession\.userId,
    \}\);"""
replacement_maybe = """  async function maybeStartTelegram() {
    const creds = tgApiStore.load({
      userDataPath: ctx.userDataPath,
      userId: 'default_user',
    });"""
content = re.sub(target_maybe, replacement_maybe, content)

# 6. Modify buildState
target_buildstate = r"""    return \{
      phase,
      signingIn,
      authError: authError \|\| tgSnap\.authError,
      syncError: tgSnap\.syncError,
      supabaseEmail: supabaseSession\?\.email \|\| null,
      supabaseUserId: supabaseSession\?\.userId \|\| null,
      hasTelegramApi: Boolean\(telegramApi\),
      telegramApiId: telegramApi\?\.apiId \|\| null,
      authState: tgSnap\.authState,
      authDetail: tgSnap\.authDetail \|\| \{\},
      scannedCount: tgSnap\.scannedCount,
      entryCount: tgSnap\.entryCount,
      bootError: tgSnap\.bootError,
      freeUserTrialExpiredDialogPending,
      freeRemainingTokens: isFreeUserTokenTier\(supabaseSession\)
        \? supabaseSession\?\.remainingTokens \?\? null
        : null,
      isFreeTier: isFreeUserTokenTier\(supabaseSession\),
      supabaseTelevaultTier: supabaseSession\?\.televaultTier \|\| supabaseSession\?\.userType \|\| null,
      televaultEntitlementCreatedAt: supabaseSession\?\.televaultEntitlementCreatedAt \|\| null,
      telegramRestartRecommended,
    \};"""
replacement_buildstate = """    return {
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
    };"""
content = re.sub(target_buildstate, replacement_buildstate, content)

# 7. Modify hydrate
target_hydrate = r"""  async function hydrate\(\) \{
    if \(hydratePromise\) return hydratePromise;
    hydratePromise = \(async \(\) => \{
      phase = 'booting';
      const result = await googleAuth\.hydrateSession\(ctx\.userDataPath\);
      supabaseSession = result\.session;
      if \(supabaseSession\) checkTrialFromSession\(supabaseSession\);
      await recomputePhase\(\);
      if \(supabaseSession\?\.userId && telegramApi && !freeUserTrialExpiredDialogPending\) \{
        await maybeStartTelegram\(\);
      \}
      await recomputePhase\(\);
      return buildState\(\);
    \}\)\(\)\.finally\(\(\) => \{
      hydratePromise = null;
    \}\);
    return hydratePromise;
  \}"""
replacement_hydrate = """  async function hydrate() {
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
  }"""
content = re.sub(target_hydrate, replacement_hydrate, content)

# 8. Remove session:signInGoogle
content = re.sub(r"  ipcMain\.handle\('session:signInGoogle', async \(\) => \{.*?\n  \}\);\n", "", content, flags=re.DOTALL)

# 9. Modify session:signOut
target_signout = r"""  ipcMain\.handle\('session:signOut', async \(\) => \{
    // Close TDLib client without logOut — Telegram auth stays in userData/td for next sign-in.
    if \(syncService\) \{
      await syncService\.stop\(\)\.catch\(\(\) => \{\}\);
      syncService = null;
    \}
    if \(gdriveSyncService\) \{
      gdriveSyncService\.stopPolling\(\);
      gdriveSyncService = null;
    \}
    await telegram\.shutdown\(\);
    googleAuth\.clearSession\(ctx\.userDataPath\);
    supabaseSession = null;
    telegramApi = null;
    phase = 'supabaseAuth';
    authError = null;
    freeUserTrialExpiredDialogPending = false;
    return buildState\(\);
  \}\);"""
replacement_signout = """  ipcMain.handle('session:signOut', async () => {
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
  });"""
content = re.sub(target_signout, replacement_signout, content)

# 10. Remove session:forceLogoutExpiredTrial
content = re.sub(r"  ipcMain\.handle\('session:forceLogoutExpiredTrial', async \(\) => \{.*?\n  \}\);\n", "", content, flags=re.DOTALL)

# 11. Modify session:saveTelegramApi
target_savetg = r"""  ipcMain\.handle\('session:saveTelegramApi', async \(_evt, \{ apiId, apiHash \}\) => \{
    authError = null;
    const userId = supabaseSession\?\.userId;
    if \(!userId\) \{
      phase = 'supabaseAuth';
      return \{ ok: false, error: 'Chưa đăng nhập Supabase\.' \};
    \}
    if \(freeUserTrialExpiredDialogPending\) \{
      return \{ ok: false, error: 'free_trial_expired' \};
    \}"""
replacement_savetg = """  ipcMain.handle('session:saveTelegramApi', async (_evt, { apiId, apiHash }) => {
    authError = null;
    const userId = 'default_user';"""
content = re.sub(target_savetg, replacement_savetg, content)

with open('televault-desktop/electron/lib/ipc/sessionHandlers.js', 'w') as f:
    f.write(content)
