# Shared Vault — Auto-discover, Read-only

## Problem

Televault currently operates in a single-owner, single-vault model. Each user has exactly one vault channel. When an owner adds another Telegram user to their vault channel, the guest user's Televault app has no way to discover or browse the shared vault.

## Goal

Allow users to automatically discover and browse (read-only) vault channels shared with them via Telegram membership, presented in a "Shared with me" sidebar section similar to Google Drive.

## Scope

- **In scope**: Auto-discover shared vaults, read-only browsing, file download, sidebar UI
- **Out of scope**: Write access (upload/rename/move/trash), manual vault linking, vault sharing management UI, permission levels

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   TelegramCoordinator                    │
│                                                          │
│  ┌────────────────┐      ┌────────────────────────────┐ │
│  │   Own Vault     │      │   SharedVaultManager       │ │
│  │   (read-write)  │      │                            │ │
│  │   chatId: X     │      │   ┌──────────────────┐    │ │
│  │   channel: ch   │      │   │ Shared Vault A    │    │ │
│  │   vault: vs     │      │   │ chatId, owner,    │    │ │
│  │                 │      │   │ channel, indexDb  │    │ │
│  └────────────────┘      │   └──────────────────┘    │ │
│                           │   ┌──────────────────┐    │ │
│                           │   │ Shared Vault B    │    │ │
│                           │   └──────────────────┘    │ │
│                           └────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Discovery Flow

1. After own vault sync completes (`_runSync` success), `SharedVaultManager.discover()` is called
2. Scans all channels in `chatListMain` (limit 200)
3. Filters for channels with `#televault-v1` in description AND `chatId ≠ ownChatId`
4. For each discovered vault: resolve owner name from supergroup info
5. Stores discovered vaults in local DB: `{ chatId, title, ownerName, lastSeen }`
6. Emits change event → frontend updates sidebar

### Data Storage

Each shared vault gets its own SQLite index file at:
```
<userData>/shared-vaults/<chatId>/index.db
```

This prevents pollution of the user's own vault index and allows independent cleanup.

### Read-only Enforcement (3 layers)

1. **Frontend**: `SharedBrowserScreen` does not render upload/edit/delete UI
2. **Backend**: `SharedVaultManager` does not expose write APIs via IPC
3. **Telegram**: Channel members (non-admin) cannot `sendMessage` to channels

---

## Backend Design

### [NEW] `electron/lib/vault/sharedVaultManager.js`

```
class SharedVaultManager {
  constructor({ client, ownChatId, userDataPath, onChange })
  
  // Discovery
  async discover()                              // scan chatListMain, find shared vaults
  getDiscoveredVaults()                         // returns list of { chatId, title, ownerName }
  
  // Per-vault operations  
  async scanVault(chatId)                       // scan history, build index
  async getListing(chatId, folder, sort, dir)   // get files/folders for a path
  async search(chatId, query)                   // search within shared vault
  async downloadFile(chatId, messageId)         // download a file from shared vault
  async getStats(chatId)                        // file count, folder count
  
  // Lifecycle
  dispose()                                     // cleanup all channel listeners
}
```

### [MODIFY] `electron/lib/telegram/channelService.js`

Add static method:
```js
static async findAllVaultChannels(client, excludeChatId)
// Returns Array<{ chatId, title, description }> of all channels with #televault-v1
// excluding the given chatId (user's own vault)
```

Add method:
```js
async getChannelOwnerInfo(chatId)
// Returns { ownerId, ownerName } from supergroup creator info
```

### [MODIFY] `electron/lib/telegram/telegramCoordinator.js`

- After `_runSync()` succeeds and `this.syncComplete = true`:
  - Create `SharedVaultManager` instance
  - Call `discover()`
  - Store as `this.sharedVaults`
- Add to `getSnapshot()`: `sharedVaults: this.sharedVaults?.getDiscoveredVaults() || []`

### [MODIFY] `electron/lib/ipc/vaultHandlers.js`

New IPC channels:
- `vault:shared-list` → returns list of shared vaults
- `vault:shared-scan` → triggers scan for a specific shared vault chatId
- `vault:shared-listing` → returns file listing for shared vault
- `vault:shared-search` → search within shared vault
- `vault:shared-download` → download file from shared vault
- `vault:shared-stats` → get stats for shared vault

### [MODIFY] `electron/preload.js`

Add `window.televault.sharedVault` API surface:
```js
sharedVault: {
  list: () => ipcRenderer.invoke('vault:shared-list'),
  scan: (chatId) => ipcRenderer.invoke('vault:shared-scan', chatId),
  getListing: (chatId, folder, sortField, sortDir) => ...,
  search: (chatId, query) => ...,
  download: (chatId, messageId) => ...,
  getStats: (chatId) => ...,
  onChanged: (fn) => ...,
}
```

---

## Frontend Design

### [MODIFY] `DriveSidebar.jsx`

Add new section below Trash:
```
── My Drive
── Rác
── ─────────── (divider)
── Chia sẻ với tôi
   ├── 📁 Vault của Anh Nam
   └── 📁 Vault của Chị Lan
── ─────────── (divider)
── Tags
── Dashboard
── ...
```

- Each shared vault item shows owner name + file count badge
- Click → `onSectionChange('shared-vault')` + `onSharedVaultSelect(chatId)`
- Active shared vault highlighted in sidebar

### [NEW] `useSharedVaults.js` hook

```js
export function useSharedVaults() {
  // State: list of discovered vaults
  // State: active vault chatId
  // State: current folder, files, folders, loading for active vault
  // Methods: goTo(folder), setActiveVault(chatId)
  // Auto-scan on first open of each vault
}
```

### [NEW] `SharedBrowserScreen.jsx`

Reuses `BrowserScreen.jsx` architecture but:
- **Removes**: upload button, create folder, rename, move, trash, delete, drag-drop upload
- **Removes**: context menu actions except Download and Preview
- **Adds**: Read-only badge in header: `🔒 Read-only — Vault của {ownerName}`
- **Keeps**: File/folder table, sorting, view mode toggle, selection (for batch download), search
- Selection bar shows only: Download selected, Clear selection

### [MODIFY] `VaultShell.jsx`

- Add `useSharedVaults()` hook
- Add state `activeSharedVaultId`
- When `section === 'shared-vault'`:
  - Breadcrumb shows: `Shared > {ownerName} > folder...`
  - Render `SharedBrowserScreen`
- Pass shared vault list to `DriveSidebar`

---

## Data Flow

```
App starts
  → Telegram auth
  → Own vault sync complete
  → SharedVaultManager.discover()
  → Found: [{ chatId: 123, ownerName: "Anh Nam" }, { chatId: 456, ownerName: "Chị Lan" }]
  → IPC broadcast: vault:shared-changed
  → Sidebar renders "Chia sẻ với tôi" section

User clicks "Vault của Anh Nam"
  → section = 'shared-vault', activeSharedVaultId = 123
  → useSharedVaults.scanVault(123)  (lazy scan on first open)
  → Loading spinner while scanning history
  → SharedBrowserScreen renders file list (read-only)
  → User browses folders, previews images, downloads files
```

---

## Edge Cases

1. **User has no shared vaults**: "Chia sẻ với tôi" section hidden or shows empty state
2. **User removed from channel**: Next discover cycle removes vault from list; if browsing, show toast "Vault không còn khả dụng"
3. **Owner deletes channel**: Same as #2
4. **Scan limit (200 chats)**: Sufficient for typical users; could increase or use `searchChatsOnServer` in future
5. **Multiple vaults from same owner**: Each channel = separate vault entry (edge case, unlikely)
6. **User has no own vault yet**: Discover runs after own vault is resolved, so own vault always exists first

---

## Verification Plan

### Automated Tests
- Unit test `findAllVaultChannels` filtering logic
- Unit test `SharedVaultManager.discover` with mock TDLib responses
- Unit test read-only enforcement (no write IPC handlers)

### Manual Verification
- Test with 2 Telegram accounts: Account A creates vault, adds Account B as member
- Account B opens app → sees Account A's vault in sidebar
- Account B browses, downloads → works
- Account B attempts no write operations (UI doesn't show them)
- Account B removed from channel → vault disappears on next discovery
