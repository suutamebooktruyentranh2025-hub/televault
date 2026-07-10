# Remove Supabase Login Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Completely remove the Supabase login functionality and associated Free User Tier limits from the application, allowing unlimited usage and booting straight to Telegram setup.

**Architecture:** Remove Supabase/Google Auth UI screens, delete the backend authentication services (`googleAuthService.js`, `freeUserCredits.js`, `freeUserTier.js`), and clean up the IPC handlers in `sessionHandlers.js` to start directly at `telegramApiSetup`.

**Tech Stack:** React, Electron

---

### Task 1: Delete Supabase UI and Auth Services

**Files:**
- Delete: `src/screens/SupabaseAuthScreen.jsx`
- Delete: `src/components/FreeUserTrialExpiredModal.jsx`
- Delete: `electron/lib/auth/googleAuthService.js`
- Delete: `electron/lib/auth/freeUserCredits.js`
- Delete: `electron/lib/auth/freeUserTier.js`

**Step 1: Delete the files**

```bash
rm src/screens/SupabaseAuthScreen.jsx
rm src/components/FreeUserTrialExpiredModal.jsx
rm electron/lib/auth/googleAuthService.js
rm electron/lib/auth/freeUserCredits.js
rm electron/lib/auth/freeUserTier.js
```

**Step 2: Commit**

```bash
git add src/screens src/components electron/lib/auth
git commit -m "refactor: delete supabase UI and auth services"
```

### Task 2: Clean up IPC Session Handlers

**Files:**
- Modify: `electron/lib/ipc/sessionHandlers.js`

**Step 1: Write the minimal implementation**
We need to remove Google Auth and Free User imports, and bypass Supabase completely.

```javascript
// Remove imports:
// const googleAuth = require('../auth/googleAuthService');
// const { isFreeUserTokenTier, isFreeTrialExpired } = require('../auth/freeUserTier');
// const freeUserCredits = require('../auth/freeUserCredits');

// Modify recomputePhase:
  async function recomputePhase() {
    telegramApi = tgApiStore.load({
      userDataPath: ctx.userDataPath,
      userId: 'default_user', // mock userId
    });

    if (!telegramApi) {
      phase = 'telegramApiSetup';
      return;
    }
    // ... keep existing telegram flow
// Remove supabaseSession usage everywhere.
// Change guardUpload to always return true.
// Modify session:signOut to only logout Telegram
```
*(Agent to manually replace content during execution via `replace_file_content` / `multi_replace_file_content`)*

**Step 2: Commit**

```bash
git add electron/lib/ipc/sessionHandlers.js
git commit -m "refactor: remove supabase from session handlers"
```

### Task 3: Clean up App Component and Contexts

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/hooks/useSession.js`

**Step 1: Write the minimal implementation**
Remove `SupabaseAuthScreen` and `FreeUserTrialExpiredModal` imports and usages in `App.jsx`.
Remove `signInGoogle` and `forceLogoutExpiredTrial` from `useSession.js`.
Ensure `VaultShell` does not rely on `account` data that came from Supabase.

**Step 2: Commit**

```bash
git add src/App.jsx src/hooks/useSession.js
git commit -m "refactor: remove supabase from frontend components"
```

### Task 4: Clean up Settings Screen

**Files:**
- Modify: `src/screens/SettingsScreen.jsx`

**Step 1: Write the minimal implementation**
Remove displaying of Supabase email and account tier in the Settings screen, as it no longer exists. Only display Telegram related settings or sign out button.

**Step 2: Commit**

```bash
git add src/screens/SettingsScreen.jsx
git commit -m "refactor: remove account info from settings"
```

### Task 5: Clean up Locales and Dependencies

**Files:**
- Modify: `src/i18n/locales.js`
- Modify: `package.json`

**Step 1: Write the minimal implementation**
Remove `supabase*` keys from `locales.js`.
Uninstall `@supabase/supabase-js`.

```bash
npm uninstall @supabase/supabase-js
```

**Step 2: Run npm to verify**

```bash
npm install
```

**Step 3: Commit**

```bash
git add src/i18n/locales.js package.json package-lock.json
git commit -m "chore: remove supabase dependencies and locales"
```

### Task 6: Verify Build

**Step 1: Run the application**

```bash
npm run dev
```

Expected: The app boots and goes straight to the Telegram Setup screen or dashboard if already logged in. Uploads work without Free Tier prompts.
