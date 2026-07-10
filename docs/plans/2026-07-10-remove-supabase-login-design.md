# Remove Supabase Login Design

## Objective
Completely remove the Supabase login functionality and associated Free User Tier limits from the application. The app will now boot directly into the Telegram API setup and allow unlimited usage (no upload credits/limits).

## Approach: "Clean Sweep"
We will completely wipe all references to Supabase, Google OAuth, and credit limits to keep the codebase clean and reduce technical debt.

## Proposed Changes

### 1. UI Changes
- Delete `src/screens/SupabaseAuthScreen.jsx`.
- Update routing/state logic in root components (like `VaultShell.jsx` or similar) to ignore `supabaseAuth` phase and jump straight to `telegramApiSetup`.

### 2. Core Logic Cleanup
- Delete `electron/lib/auth/googleAuthService.js`.
- Delete `electron/lib/auth/freeUserCredits.js`.
- Delete `electron/lib/auth/freeUserTier.js`.

### 3. Session State & IPC (`electron/lib/ipc/sessionHandlers.js`)
- Remove the `supabaseAuth` phase from session management.
- Update initialization and hydration logic to not check for Supabase session.
- Make `guardUpload` always return `true` immediately (removing credit deduction).
- Remove IPC event handlers related to Google Auth (`session:signInGoogle`).
- Update `session:signOut` to only log out of Telegram.

### 4. Dependencies and Locales
- Uninstall `@supabase/supabase-js` from `package.json`.
- Remove Supabase and free trial related string keys from `src/i18n/locales.js`.

## Verification
- Run the app and ensure it boots directly to the Telegram Setup or Dashboard (if already logged into Telegram).
- Ensure file uploads work normally without triggering any Free Trial limits.
- Ensure clicking Sign Out logs out of Telegram successfully and returns to the Telegram setup screen.
