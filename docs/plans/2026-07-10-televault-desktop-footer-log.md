# Footer Log Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Add a footer with a toggleable, resizable log console and quick settings (theme/language), modeled after "crawler desktop" but using the Google Drive aesthetic.

**Architecture:** Use custom events (`window.dispatchEvent`) for cross-app logging without triggering React re-renders. A custom hook `useLogs` captures these and feeds a new `ConsolePanel` component, toggled via a new `StatusBar` component at the bottom of `VaultShell`.

**Tech Stack:** React, Tailwind CSS (using Google Drive variables `--gd-bg`, `--gd-surface`, `--gd-border`).

---

### Task 1: Create Logger Utility & Hook

**Files:**
- Create: `televault-desktop/src/utils/logger.js`
- Create: `televault-desktop/src/hooks/useLogs.js`

**Step 1: Write logger.js**
Create `televault-desktop/src/utils/logger.js`
```javascript
export const appLog = (level, msg) => {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  window.dispatchEvent(new CustomEvent('app-log', { detail: { level, msg, time } }));
};
```

**Step 2: Write useLogs.js**
Create `televault-desktop/src/hooks/useLogs.js`
```javascript
import { useState, useEffect, useCallback } from 'react';

export function useLogs(maxLogs = 300) {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    function handleLog(e) {
      setLogs((prev) => {
        const next = [...prev, e.detail];
        if (next.length > maxLogs) return next.slice(next.length - maxLogs);
        return next;
      });
    }
    window.addEventListener('app-log', handleLog);
    return () => window.removeEventListener('app-log', handleLog);
  }, [maxLogs]);

  const clearLogs = useCallback(() => setLogs([]), []);
  return { logs, clearLogs };
}
```

---

### Task 2: Add Translations

**Files:**
- Modify: `televault-desktop/src/i18n/locales.js`

**Step 1: Add EN keys**
Add inside the `export const en = {` block:
```javascript
  consoleTitle: 'Console',
  clearLog: 'Clear logs',
  consolePlaceholder: 'No logs yet...',
  darkMode: 'Dark Mode',
  language: 'Language',
  resizeFooter: 'Drag to resize log panel height',
  hideLogPanel: 'Hide log panel',
  showLogPanel: 'Show log panel',
```

**Step 2: Add VI keys**
Add inside the `export const vi = {` block:
```javascript
  consoleTitle: 'Bảng điều khiển',
  clearLog: 'Xoá log',
  consolePlaceholder: 'Chưa có log nào...',
  darkMode: 'Giao diện tối',
  language: 'Ngôn ngữ',
  resizeFooter: 'Kéo để chỉnh chiều cao panel',
  hideLogPanel: 'Ẩn log panel',
  showLogPanel: 'Hiện log panel',
```

---

### Task 3: Create ConsolePanel Component

**Files:**
- Create: `televault-desktop/src/components/ConsolePanel.jsx`

**Step 1: Write ConsolePanel.jsx**
Create the component maintaining the Google Drive aesthetic (no Material 3 colors).
```javascript
import { useEffect, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useI18n } from '../context/I18nContext';

const levelColors = {
  info: 'text-blue-500 dark:text-blue-400',
  success: 'text-green-500 dark:text-green-400',
  warn: 'text-amber-500 dark:text-amber-400',
  error: 'text-red-500 dark:text-red-400',
};

export function ConsolePanel({ logs = [], onClearLogs, heightPx = 128 }) {
  const { theme, setTheme } = useTheme();
  const { t, locale, setLocale } = useI18n();
  const logEndRef = useRef(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [logs]);

  const isDark = theme === 'dark';

  return (
    <section
      className="grid min-h-0 shrink-0 grid-cols-4 grid-rows-1 gap-4 border-t border-[var(--gd-border)] bg-[var(--gd-bg)] px-6 py-3 [grid-template-rows:minmax(0,1fr)]"
      style={{ height: heightPx }}
    >
      {/* Logs Area */}
      <div className="col-span-3 flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--gd-border)] bg-[var(--gd-surface)] p-2 shadow-sm">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 text-gray-600 dark:text-zinc-300">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 17 10 11 4 5"></polyline>
              <line x1="12" y1="19" x2="20" y2="19"></line>
            </svg>
            <span className="truncate text-xs font-bold uppercase tracking-wide">
              {t('consoleTitle')}
            </span>
          </div>
          <button
            type="button"
            onClick={onClearLogs}
            title={t('clearLog')}
            className="cursor-pointer rounded p-1 text-gray-500 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto font-mono text-xs text-gray-700 dark:text-zinc-300 space-y-0.5">
          {logs.length === 0 ? (
            <p className="text-gray-400 dark:text-zinc-500">{t('consolePlaceholder')}</p>
          ) : (
            logs.map((log, i) => (
              <p key={i}>
                <span className={levelColors[log.level] || levelColors.info}>[{log.time}]</span> {log.msg}
              </p>
            ))
          )}
          <div ref={logEndRef} className="h-px w-full shrink-0" />
        </div>
      </div>

      {/* Settings Area */}
      <div className="flex min-h-0 min-w-0 flex-col gap-3 rounded-lg border border-[var(--gd-border)] bg-[var(--gd-surface)] p-3 shadow-sm overflow-y-auto">
        <div className="space-y-3 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-gray-700 dark:text-zinc-200 shrink-0">{t('darkMode')}</span>
            <input 
              type="checkbox" 
              checked={isDark} 
              onChange={() => setTheme(isDark ? 'light' : 'dark')}
              className="h-4 w-4 cursor-pointer"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-gray-700 dark:text-zinc-200 shrink-0">{t('language')}</span>
            <select 
              value={locale} 
              onChange={(e) => setLocale(e.target.value)}
              className="rounded border border-[var(--gd-border)] bg-transparent px-2 py-1 text-sm text-gray-700 dark:text-zinc-200"
            >
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>
      </div>
    </section>
  );
}
```

---

### Task 4: Create StatusBar Component

**Files:**
- Create: `televault-desktop/src/components/StatusBar.jsx`

**Step 1: Write StatusBar.jsx**
```javascript
import { useI18n } from '../context/I18nContext';

export function StatusBar({ logFooterVisible, onToggleLogFooter }) {
  const { t } = useI18n();

  return (
    <footer className="flex h-8 shrink-0 items-center justify-between border-t border-[var(--gd-border)] bg-[var(--gd-surface)] px-4 text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-zinc-400">
      <div className="flex items-center gap-4">
        <span>TeleVault Desktop</span>
      </div>
      <div className="flex items-center">
        <button
          type="button"
          onClick={onToggleLogFooter}
          title={logFooterVisible ? t('hideLogPanel') : t('showLogPanel')}
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {logFooterVisible ? (
              <>
                <polyline points="4 14 12 22 20 14"></polyline>
                <line x1="12" y1="22" x2="12" y2="2"></line>
              </>
            ) : (
              <>
                <polyline points="4 10 12 2 20 10"></polyline>
                <line x1="12" y1="2" x2="12" y2="22"></line>
              </>
            )}
          </svg>
        </button>
      </div>
    </footer>
  );
}
```

---

### Task 5: Integrate into VaultShell

**Files:**
- Modify: `televault-desktop/src/components/VaultShell.jsx`

**Step 1: Imports**
Add imports at the top:
```javascript
import { ConsolePanel } from './ConsolePanel';
import { StatusBar } from './StatusBar';
import { useLogs } from '../hooks/useLogs';
```

**Step 2: State variables**
Inside `VaultShell` function component, add state for logs and visibility:
```javascript
  const { logs, clearLogs } = useLogs();
  const [logFooterVisible, setLogFooterVisible] = useState(() => {
    return localStorage.getItem('televaultLogFooterVisible') === 'true';
  });
  const [logPanelHeightPx, setLogPanelHeightPx] = useState(() => {
    const cached = parseInt(localStorage.getItem('televaultLogPanelHeightPx'), 10);
    return isNaN(cached) ? 128 : cached;
  });

  const toggleLogFooter = useCallback(() => {
    setLogFooterVisible((v) => {
      const next = !v;
      localStorage.setItem('televaultLogFooterVisible', String(next));
      return next;
    });
  }, []);

  const handleLogResizePointerDown = useCallback((e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = logPanelHeightPx;

    const onPointerMove = (ev) => {
      const diff = startY - ev.clientY;
      const newH = Math.min(Math.max(startHeight + diff, 100), 500);
      setLogPanelHeightPx(newH);
    };

    const onPointerUp = (ev) => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      const diff = startY - ev.clientY;
      const newH = Math.min(Math.max(startHeight + diff, 100), 500);
      localStorage.setItem('televaultLogPanelHeightPx', String(newH));
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }, [logPanelHeightPx]);
```

**Step 3: Render at bottom**
Find the end of `return (` where the `div` wraps the `DriveSidebar` and `main Content` (around line 663 just before `{moveDialog &&`). Ensure the outermost `div` (which is `h-screen flex`) wraps everything properly. Actually, `VaultShell` uses `<div className="flex h-screen bg-[var(--gd-bg)]">` which splits into `<DriveSidebar>` and `<div className="flex min-w-0 flex-1 flex-col">`.
We need the footer to span the whole bottom or just under the right side. Usually, a status bar spans the entire bottom (so it must be inside a flex-col wrapper that wraps the main flex row).

*Correction to Layout Structure in `VaultShell.jsx`:*
Change the outermost `div` to be a flex column that holds the main content row and the footer row.
```javascript
  return (
    <div className="flex h-screen flex-col bg-[var(--gd-bg)]">
      {/* Existing main row wrapper */}
      <div
        className="flex min-h-0 flex-1"
        onDragOver={(e) => { ... }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { ... }}
      >
        <DriveSidebar ... />
        <div className="flex min-w-0 flex-1 flex-col">
          ...
        </div>
      </div>

      {/* New Footer */}
      {logFooterVisible && (
        <>
          <div
            className="h-1 cursor-ns-resize bg-[var(--gd-border)] hover:bg-[var(--gd-primary)] transition-colors"
            onPointerDown={handleLogResizePointerDown}
            title={t('resizeFooter')}
          />
          <ConsolePanel logs={logs} onClearLogs={clearLogs} heightPx={logPanelHeightPx} />
        </>
      )}
      <StatusBar logFooterVisible={logFooterVisible} onToggleLogFooter={toggleLogFooter} />

      {/* Dialogs ... */}
      <UploadActivityPanel ... />
```
*(Need to carefully inject this around line 566-632 to keep the dialogs at the end)*
