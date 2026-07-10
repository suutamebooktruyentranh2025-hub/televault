# TeleVault Desktop Footer Log Design

## Overview
Add a `ConsolePanel` and `StatusBar` at the footer of TeleVault Desktop, directly inspired by the existing "crawler desktop" implementation. This provides users with real-time feedback on sync processes, API calls, and easy access to quick configuration options.

## Architecture

1. **State Management (Logs):**
   - Use custom `window.dispatchEvent` (e.g., `CustomEvent('app-log')`) to broadcast log messages from anywhere in the app without causing global re-renders.
   - Create a `useLogs` custom hook to listen for these events, store them locally, and feed them to the `ConsolePanel`.

2. **Components:**
   - **`StatusBar`**: Placed at the very bottom of the app layout. Displays quick status summaries (like selection counts or global statuses) and includes a toggle button on the right to show/hide the `ConsolePanel`.
   - **`ConsolePanel`**: Sits just above the `StatusBar`. It has two main sections:
     - **Left (Log Terminal):** A scrollable area displaying `[time] [level] message`. Auto-scrolls to the bottom on new logs.
     - **Right (Quick Settings):** Contains toggles for Dark Mode and Language (EN/VI).
   - **Draggable Resizer**: The `ConsolePanel` can be resized vertically. Height is persisted to `localStorage` (e.g., `televaultLogPanelHeightPx`).

3. **Integration in `VaultShell`:**
   - The components will be integrated into the main `VaultShell.jsx` layout, ensuring they sit outside the main scrollable areas (e.g., fixed at the bottom).
   - The `ConsolePanel` visibility state (`logFooterVisible`) will also be persisted to `localStorage`.

## Data Flow
- Any component or API hook (e.g., `useVault`) can do: `window.dispatchEvent(new CustomEvent('app-log', { detail: { level: 'info', msg: 'Uploading file...' } }))`.
- `useLogs` captures it and prepends/appends to an array.
- `ConsolePanel` renders the updated array.
