import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import { useI18n } from '../context/I18nContext';
import { useDialog } from '../context/DialogContext';
import { useToast } from '../context/ToastContext';
import { GDriveFilePicker } from '../components/GDriveFilePicker';
import { SettingsSelect } from '../components/SettingsSelect';
import { TransferProgressRing } from '../components/TransferProgressRing';
import { IconFolder, IconClose } from '../components/DriveIcons';

function SettingsToggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="gd-settings-toggle"
      onClick={() => onChange(!checked)}
    >
      <span className="gd-settings-toggle-thumb" />
    </button>
  );
}

function SettingsField({ title, hint, children }) {
  return (
    <div className="gd-settings-field">
      <div className="gd-settings-field-label">
        <div className="gd-settings-row-title">{title}</div>
        {hint && <div className="gd-settings-row-hint">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

const GDriveQueueRow = memo(({ item, isSelected, onToggle, onClick, currentSyncFile, currentSyncProgress }) => {
  return (
    <tr
      className={`gd-row cursor-pointer border-b border-[var(--gd-border)] ${isSelected ? 'selected' : ''}`}
      onMouseDown={(e) => {
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          e.preventDefault();
        }
      }}
      onClick={onClick}
    >
      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          className="gd-row-checkbox"
          checked={isSelected}
          onChange={() => onToggle(item.driveFileId, { additive: true, range: false })}
        />
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-3">
          <span className={`truncate ${isSelected ? 'font-medium text-[var(--gd-primary)]' : 'text-[var(--gd-text)]'}`}>
            {item.fileName}
          </span>
        </div>
        <div className="text-[11px] opacity-60 truncate mt-0.5 text-[var(--gd-text-secondary)]">
          {item.drivePath}
        </div>
      </td>
      <td className="hidden px-3 py-3 text-[var(--gd-text-secondary)] sm:table-cell text-right">
        {item.size > 0 ? `${(item.size / (1024 * 1024)).toFixed(2)} MB` : '—'}
      </td>
      <td className="hidden px-3 py-3 text-[var(--gd-text-secondary)] md:table-cell">
        {item.fileName === currentSyncFile ? (
          <div className="flex items-center gap-2">
            <div className={currentSyncProgress === 0 ? "animate-spin" : ""}>
              <TransferProgressRing progress={currentSyncProgress} status="running" size={16} />
            </div>
            <span className="text-[11px] text-[var(--gd-primary)]">Đang tải...</span>
          </div>
        ) : (
          <span className="text-[11px] opacity-50">Đang chờ</span>
        )}
      </td>
      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
        <div className="gd-row-actions">
          <button
            type="button"
            className="gd-row-action"
            onClick={() => {
              window.televault?.gdrive?.removeQueueItem(item.driveFileId);
            }}
            title="Hủy"
          >
            <IconClose className="h-5 w-5" />
          </button>
        </div>
      </td>
    </tr>
  );
}, (prevProps, nextProps) => {
  return prevProps.item.driveFileId === nextProps.item.driveFileId &&
         prevProps.item.size === nextProps.item.size &&
         prevProps.item.fileName === nextProps.item.fileName &&
         prevProps.isSelected === nextProps.isSelected &&
         prevProps.currentSyncFile === nextProps.currentSyncFile &&
         prevProps.currentSyncProgress === nextProps.currentSyncProgress;
});

export function GDriveSyncScreen() {
  const { t } = useI18n();
  const { confirm } = useDialog();
  const { showToast } = useToast();

  // Google Drive state
  const [gdriveConnected, setGdriveConnected] = useState(false);
  const [gdriveEmail, setGdriveEmail] = useState('');
  const [gdriveClientId, setGdriveClientId] = useState('');
  const [gdriveClientSecret, setGdriveClientSecret] = useState('');
  const [gdriveSubs, setGdriveSubs] = useState([]);
  const [showGDrivePicker, setShowGDrivePicker] = useState(false);
  const [gdrivePollInterval, setGdrivePollInterval] = useState(300000);
  const [gdriveStatus, setGdriveStatus] = useState('disconnected');
  const [gdriveIsPaused, setGdriveIsPaused] = useState(false);
  const [gdriveLastError, setGdriveLastError] = useState(null);
  const [gdrivePendingCount, setGdrivePendingCount] = useState(0);
  const [gdriveTotalCount, setGdriveTotalCount] = useState(0);
  const [gdriveSyncedCount, setGdriveSyncedCount] = useState(0);
  const [gdriveCurrentSyncFile, setGdriveCurrentSyncFile] = useState(null);
  const [gdriveCurrentSyncProgress, setGdriveCurrentSyncProgress] = useState(0);
  const [gdriveQueue, setGdriveQueue] = useState([]);
  const [gdriveRecentSynced, setGdriveRecentSynced] = useState([]);
  const [gdriveScanPhase, setGdriveScanPhase] = useState(null);
  const [gdriveScanInfo, setGdriveScanInfo] = useState(null);
  const [gdriveIgnoredExtensions, setGdriveIgnoredExtensions] = useState('');
  const [gdriveAllowedExtensions, setGdriveAllowedExtensions] = useState('');
  const [gdriveTempDir, setGdriveTempDir] = useState('');
  const [gdriveErrors, setGdriveErrors] = useState([]);
  const [activeSyncTab, setActiveSyncTab] = useState('queue');
  
  const [selectedQueueIds, setSelectedQueueIds] = useState(new Set());
  const [selectedErrorIds, setSelectedErrorIds] = useState(new Set());
  const [selectedHistoryIds, setSelectedHistoryIds] = useState(new Set());
  const [visibleQueueCount, setVisibleQueueCount] = useState(50);
  const [visibleErrorsCount, setVisibleErrorsCount] = useState(50);
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(50);
  const lastSelectedRef = React.useRef(null);
  const lastSelectedErrorRef = React.useRef(null);
  const lastSelectedHistoryRef = React.useRef(null);
  const queueRef = React.useRef([]);
  
  useEffect(() => {
    queueRef.current = gdriveQueue;
  }, [gdriveQueue]);

  const load = useCallback(async () => {
    const gdStatus = await window.televault?.gdrive?.getStatus();
    if (gdStatus?.ok) {
      setGdriveConnected(gdStatus.connected);
      setGdriveEmail(gdStatus.email || '');
      setGdriveSubs(gdStatus.subscriptions || []);
      setGdrivePollInterval(gdStatus.pollIntervalMs !== undefined ? gdStatus.pollIntervalMs : 300000);
      setGdriveStatus(gdStatus.status || 'disconnected');
      setGdriveIsPaused(gdStatus.isPaused || false);
      setGdriveLastError(gdStatus.lastError || null);
      setGdrivePendingCount(gdStatus.pendingCount || 0);
      setGdriveTotalCount(gdStatus.totalCount || 0);
      setGdriveSyncedCount(gdStatus.syncedCount || 0);
      setGdriveCurrentSyncFile(gdStatus.currentSyncFile || null);
      setGdriveCurrentSyncProgress(gdStatus.currentSyncProgress || 0);
      setGdriveQueue(gdStatus.syncQueue || []);
      setGdriveRecentSynced(gdStatus.recentSynced || []);
      setGdriveScanPhase(gdStatus.scanPhase || null);
      setGdriveScanInfo(gdStatus.scanInfo || null);
      setGdriveIgnoredExtensions(gdStatus.ignoredExtensions || '');
      setGdriveAllowedExtensions(gdStatus.allowedExtensions || '');
      setGdriveTempDir(gdStatus.tempDownloadDir || '');
      setGdriveErrors(gdStatus.syncErrors || []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const unsub = window.televault?.gdrive?.onChanged((snapshot) => {
      if (snapshot) {
        setGdriveConnected(snapshot.connected);
        setGdriveEmail(snapshot.email || '');
        setGdriveSubs(snapshot.subscriptions || []);
        setGdrivePollInterval(snapshot.pollIntervalMs !== undefined ? snapshot.pollIntervalMs : 300000);
        setGdriveStatus(snapshot.status || 'disconnected');
        setGdriveIsPaused(snapshot.isPaused || false);
        setGdriveLastError(snapshot.lastError || null);
        setGdrivePendingCount(snapshot.pendingCount || 0);
        setGdriveTotalCount(snapshot.totalCount || 0);
        setGdriveSyncedCount(snapshot.syncedCount || 0);
        setGdriveCurrentSyncFile(snapshot.currentSyncFile || null);
        setGdriveCurrentSyncProgress(snapshot.currentSyncProgress || 0);
        setGdriveQueue(snapshot.syncQueue || []);
        setGdriveRecentSynced(snapshot.recentSynced || []);
        setGdriveScanPhase(snapshot.scanPhase || null);
        setGdriveScanInfo(snapshot.scanInfo || null);
        setGdriveIgnoredExtensions(snapshot.ignoredExtensions || '');
        setGdriveAllowedExtensions(snapshot.allowedExtensions || '');
        setGdriveTempDir(snapshot.tempDownloadDir || '');
        setGdriveErrors(snapshot.syncErrors || []);
      }
    });
    return () => unsub?.();
  }, []);

  async function connectGDrive() {
    if (!gdriveClientId || !gdriveClientSecret) {
      showToast("Vui lòng nhập Client ID và Client Secret", { variant: 'error' });
      return;
    }
    const res = await window.televault?.gdrive?.connect(gdriveClientId, gdriveClientSecret);
    if (!res.ok) {
      showToast("Lỗi kết nối: " + res.error, { variant: 'error' });
    }
  }

  async function disconnectGDrive() {
    await window.televault?.gdrive?.disconnect();
  }

  async function toggleSub(driveId, enabled) {
    await window.televault?.gdrive?.toggleSubscription(driveId, enabled);
  }

  async function removeSub(driveId) {
    await window.televault?.gdrive?.removeSubscription(driveId);
  }

  async function handlePollIntervalChange(val) {
    const ms = Number(val);
    setGdrivePollInterval(ms);
    await window.televault?.gdrive?.setPollInterval(ms);
  }

  async function handleScanNow() {
    await window.televault?.gdrive?.scanNow();
  }

  async function handleTogglePause() {
    await window.televault?.gdrive?.setPaused(!gdriveIsPaused);
  }

  async function handleSaveFilters() {
    const res = await window.televault?.gdrive?.setFilters(gdriveIgnoredExtensions, gdriveAllowedExtensions);
    const res2 = await window.televault?.gdrive?.setTempDir(gdriveTempDir);
    if (res?.ok && res2?.ok) {
      showToast(t('gdriveFiltersSavedAlert'));
    } else {
      showToast("Lỗi: Không thể lưu bộ lọc", { variant: 'error' });
    }
  }

  async function handleAddGDriveSubs(subs) {
    setShowGDrivePicker(false);
    for (const sub of subs) {
      await window.televault?.gdrive?.addSubscription(sub);
    }
  }

  async function handleRetryFile(driveFileId) {
    const res = await window.televault?.gdrive?.retryFile(driveFileId);
    if (!res.ok) {
      showToast("Lỗi thử lại: " + res.error, { variant: 'error' });
    }
  }

  function handleCopyErrors() {
    const selected = gdriveErrors.filter(e => selectedErrorIds.has(e.driveFileId));
    if (selected.length === 0) return;
    const text = selected.map(err => `Tên file: ${err.fileName}\nĐường dẫn: ${err.drivePath}\nLỗi: ${err.errorMessage}\nThời gian: ${new Date(err.failedAt).toLocaleString()}`).join('\n\n---\n\n');
    navigator.clipboard.writeText(text).then(() => showToast('Đã copy danh sách lỗi vào clipboard!'));
  }

  function handleExportCSV() {
    const selected = gdriveErrors.filter(e => selectedErrorIds.has(e.driveFileId));
    if (selected.length === 0) return;
    const header = '\uFEFF"Tên file","Đường dẫn","Chi tiết lỗi","Thời gian"\n';
    const rows = selected.map(err => {
      const escape = (str) => `"${String(str).replace(/"/g, '""')}"`;
      return `${escape(err.fileName)},${escape(err.drivePath)},${escape(err.errorMessage)},${escape(new Date(err.failedAt).toLocaleString())}`;
    }).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `danh_sach_loi_televault_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function handleRetryAll() {
    for (const err of gdriveErrors) {
      void window.televault?.gdrive?.retryFile(err.driveFileId);
    }
  }

  const openExternal = useCallback((url) => {
    const api = window.televault?.shell;
    if (api?.openExternal) {
      void api.openExternal(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, []);

  const makeSelectionHandler = (setSelectedIds, lastRef) => {
    return (key, { additive, range }, orderedKeys) => {
      if (!key) {
        setSelectedIds(new Set());
        lastRef.current = null;
        return;
      }

      if (range && lastRef.current && orderedKeys.length > 0) {
        const from = orderedKeys.indexOf(lastRef.current);
        const to = orderedKeys.indexOf(key);
        if (from >= 0 && to >= 0) {
          const lo = Math.min(from, to);
          const hi = Math.max(from, to);
          const newIds = new Set();
          for (const entryKey of orderedKeys.slice(lo, hi + 1)) {
            newIds.add(entryKey);
          }
          setSelectedIds(newIds);
          lastRef.current = key;
          return;
        }
      }

      if (additive) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
      } else {
        setSelectedIds(new Set([key]));
      }
      lastRef.current = key;
    };
  };

  const applyQueueSelection = useCallback(makeSelectionHandler(setSelectedQueueIds, lastSelectedRef), []);
  const applyErrorSelection = useCallback(makeSelectionHandler(setSelectedErrorIds, lastSelectedErrorRef), []);
  const applyHistorySelection = useCallback(makeSelectionHandler(setSelectedHistoryIds, lastSelectedHistoryRef), []);

  const handleSelectionClick = useCallback(
    (e, key, orderedKeys, applySelection) => {
      e.stopPropagation();
      const modifiers = {
        additive: e.metaKey || e.ctrlKey,
        range: e.shiftKey,
      };

      if (e.target.closest('.gd-row-action') || e.target.closest('.gd-row-actions') || e.target.closest('.gd-row-checkbox')) {
        return;
      }

      if (modifiers.additive || modifiers.range) {
        applySelection(key, modifiers, orderedKeys);
      } else {
        applySelection(key, { additive: false, range: false }, orderedKeys);
      }
    },
    []
  );

  const handleCancelSelected = async () => {
    for (const id of selectedQueueIds) {
      await handleCancelSync(id);
    }
    setSelectedQueueIds(new Set());
  };

  return (
    <div className="gd-settings flex min-h-0 flex-1 flex-col overflow-auto p-4">
      <section className="gd-settings-group">
        <div className="gd-settings-card">
          {!gdriveConnected ? (
            <>
              <details className="m-4 p-4 bg-gray-50 dark:bg-zinc-800 rounded-lg border border-gray-100 dark:border-zinc-700/50 text-xs">
                <summary className="cursor-pointer font-semibold text-[var(--gd-text)] select-none hover:underline">
                  {t('gdriveSetupInstructionTitle')}
                </summary>
                <div className="mt-3 space-y-2 text-[var(--gd-text-secondary)]">
                  <div>
                    <strong>1. </strong>
                    <button
                      type="button"
                      className="text-[#0066cc] hover:underline font-medium inline-block text-left cursor-pointer"
                      onClick={() => openExternal('https://console.cloud.google.com')}
                    >
                      {t('gdriveSetupInstructionStep1')}
                    </button>
                  </div>
                  <div>
                    <strong>2. </strong>
                    <button
                      type="button"
                      className="text-[#0066cc] hover:underline font-medium inline-block text-left cursor-pointer"
                      onClick={() => openExternal('https://console.cloud.google.com/projectcreate')}
                    >
                      {t('gdriveSetupInstructionStep2')}
                    </button>
                  </div>
                  <div>
                    <strong>3. </strong>
                    <button
                      type="button"
                      className="text-[#0066cc] hover:underline font-medium inline-block text-left cursor-pointer"
                      onClick={() => openExternal('https://console.cloud.google.com/apis/library')}
                    >
                      {t('gdriveSetupInstructionStep3')}
                    </button>
                  </div>
                  <div>
                    <strong>4. </strong>
                    <button
                      type="button"
                      className="text-[#0066cc] hover:underline font-medium inline-block text-left cursor-pointer"
                      onClick={() => openExternal('https://console.cloud.google.com/apis/credentials/consent')}
                    >
                      {t('gdriveSetupInstructionStep4')}
                    </button>
                  </div>
                  <div>
                    <strong>5. </strong>
                    <button
                      type="button"
                      className="text-[#0066cc] hover:underline font-medium inline-block text-left cursor-pointer"
                      onClick={() => openExternal('https://console.cloud.google.com/apis/credentials')}
                    >
                      {t('gdriveSetupInstructionStep5')}
                    </button>
                  </div>
                  <div>
                    <strong>6. </strong>
                    <span>{t('gdriveSetupInstructionStep6')}</span>
                  </div>
                  <div className="mt-4 p-2.5 bg-yellow-50 dark:bg-yellow-950/20 text-yellow-800 dark:text-yellow-200 rounded border border-yellow-200 dark:border-yellow-900/30 text-[11px] leading-relaxed">
                    <strong>⚠️ {t('gdriveSetupWarningTitle')}</strong> {t('gdriveSetupWarningBody')}
                  </div>
                  <div className="mt-2 p-2.5 bg-blue-50 dark:bg-blue-950/10 text-blue-800 dark:text-blue-200 rounded border border-blue-200 dark:border-blue-900/20 text-[11px] leading-relaxed">
                    <strong>ℹ️ {t('gdriveSetupLimitInfoTitle')}</strong> {t('gdriveSetupLimitInfoBody')}
                  </div>
                </div>
              </details>
              <SettingsField title={t('gdriveClientId')}>
                <input
                  type="text"
                  className="gd-settings-path-field px-3 py-2 w-full border border-[#79747e] rounded-lg dark:bg-[#1c1b1f] dark:text-[#e6e1e5]"
                  style={{ minHeight: '38px' }}
                  value={gdriveClientId}
                  onChange={(e) => setGdriveClientId(e.target.value)}
                  placeholder="Google OAuth Client ID"
                />
              </SettingsField>
              <SettingsField title={t('gdriveClientSecret')}>
                <input
                  type="password"
                  className="gd-settings-path-field px-3 py-2 w-full border border-[#79747e] rounded-lg dark:bg-[#1c1b1f] dark:text-[#e6e1e5]"
                  style={{ minHeight: '38px' }}
                  value={gdriveClientSecret}
                  onChange={(e) => setGdriveClientSecret(e.target.value)}
                  placeholder="Google OAuth Client Secret"
                />
              </SettingsField>
              <div className="p-4 flex justify-end">
                <button
                  type="button"
                  className="gd-dialog-btn gd-dialog-btn--primary px-4 py-2"
                  onClick={connectGDrive}
                >
                  {t('gdriveConnect')}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="p-4 border-b border-gray-100 dark:border-zinc-800 flex justify-between items-center">
                <div>
                  <div className="font-medium text-sm text-[#0066cc]">{t('gdriveConnected')}</div>
                  <div className="text-xs opacity-70 mt-0.5">{gdriveEmail}</div>
                  <div className="text-xs opacity-70 mt-1 text-[var(--gd-text-secondary)]">
                    {t('gdriveStatusLabel')}: <span className="font-semibold text-[var(--gd-text)] inline-flex items-center gap-1.5">
                      {gdriveStatus === 'syncing' && (
                        <>
                          {t('gdriveStatusSyncing')}
                          <svg className="animate-spin h-3.5 w-3.5 text-[#0066cc]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        </>
                      )}
                      {gdriveStatus === 'paused' && (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 rounded text-[11px] font-bold uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                          Đã tạm dừng
                        </div>
                      )}
                      {gdriveStatus === 'idle' && t('gdriveStatusIdle')}
                      {gdriveStatus === 'disconnected' && t('gdriveStatusDisconnected')}
                      {gdriveStatus === 'error' && t('gdriveStatusError')}
                    </span>
                  </div>
                  {gdriveLastError && (
                    <div className="text-xs text-red-500 mt-1 font-normal">{gdriveLastError}</div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`text-xs px-4 py-2 font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                      gdriveScanPhase === 'scanning' || gdriveScanPhase === 'scanning+syncing'
                        ? 'bg-blue-500 text-white cursor-default'
                        : 'bg-zinc-200 hover:bg-zinc-300 text-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-300'
                    } ${gdriveIsPaused ? 'opacity-50 pointer-events-none' : ''}`}
                    onClick={(gdriveScanPhase === 'scanning' || gdriveScanPhase === 'scanning+syncing') ? undefined : handleScanNow}
                    disabled={gdriveIsPaused}
                  >
                    {(gdriveScanPhase === 'scanning' || gdriveScanPhase === 'scanning+syncing') ? (
                      <>
                        <svg className="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Đang quét...
                      </>
                    ) : (
                      '🔄 Quét ngay'
                    )}
                  </button>
                  <button
                    type="button"
                    className={`text-xs px-4 py-2 font-semibold rounded-lg transition-all ${
                      gdriveIsPaused
                        ? 'bg-amber-500 hover:bg-amber-600 text-white'
                        : 'bg-zinc-200 hover:bg-zinc-300 text-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-300'
                    }`}
                    onClick={handleTogglePause}
                  >
                    {gdriveIsPaused ? '▶ Tiếp tục' : '⏸ Tạm dừng'}
                  </button>
                </div>
              </div>
              {gdriveStatus === 'syncing' && (gdriveScanPhase === 'scanning' || gdriveScanPhase === 'scanning+syncing') && (
                <div className="mx-4 mt-3 mb-4 p-3 bg-gray-50 dark:bg-zinc-800 rounded border border-gray-100 dark:border-zinc-700/50 text-xs text-[var(--gd-text)]">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="inline-block animate-spin">🔍</span>
                    <span className="font-semibold">Đang quét thư mục trên Google Drive...</span>
                  </div>
                  {gdriveScanInfo && (
                    <div className="space-y-1 pl-6 text-[11px] opacity-80">
                      <div className="truncate">
                        📂 <span className="font-medium">{gdriveScanInfo.currentFolder}</span>
                      </div>
                      <div>
                        📄 Đã tìm thấy: <span className="font-semibold text-[var(--gd-primary)]">{gdriveScanInfo.filesFound}</span> file
                      </div>
                    </div>
                  )}
                </div>
              )}
              {gdriveStatus === 'syncing' && gdriveTotalCount > 0 && (
                <div className="mx-4 mt-3 mb-4 p-3 bg-gray-50 dark:bg-zinc-800 rounded border border-gray-100 dark:border-zinc-700/50">
                  <div className="flex justify-between items-center text-xs font-semibold mb-1">
                    <span className="truncate pr-2 text-[var(--gd-text)]">
                      🔄 {gdriveCurrentSyncFile ? `Syncing (${gdriveSyncedCount}/${gdriveTotalCount}${gdriveScanPhase === 'scanning+syncing' ? '+' : ''}): ${gdriveCurrentSyncFile}` : 'Đang chờ file...'}
                    </span>
                    <span className="shrink-0 text-[var(--gd-primary)] font-medium">
                      {Math.min(100, Math.round((gdriveSyncedCount / gdriveTotalCount) * 100))}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-zinc-700 h-2 rounded-full overflow-hidden mt-1.5">
                    <div
                      className="bg-gradient-to-r from-[var(--gd-primary)] to-[#34a853] h-full transition-all duration-300 rounded-full"
                      style={{ width: `${Math.min(100, Math.round((gdriveSyncedCount / gdriveTotalCount) * 100))}%` }}
                    />
                  </div>

                </div>
              )}

              <details className="group mt-4 bg-gray-50 dark:bg-zinc-800/20 rounded-xl border border-gray-200 dark:border-zinc-700/50 overflow-hidden shadow-sm" open={false}>
                <summary className="p-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden font-semibold text-sm select-none hover:bg-gray-100/80 dark:hover:bg-zinc-800/60 text-[var(--gd-text)] flex justify-between items-center transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="bg-white dark:bg-zinc-700/50 p-1.5 rounded-lg shadow-sm border border-gray-100 dark:border-zinc-600/50">
                      ⚙️
                    </div>
                    <div className="flex flex-col">
                      <span>{t('gdriveConfigureTitle')}</span>
                      <span className="text-[11px] font-normal opacity-60 mt-0.5 hidden sm:block">Click để thiết lập bộ lọc, tần suất và thư mục...</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 opacity-50 transition-transform duration-300 group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </summary>
                
                <div className="p-4 space-y-4 bg-gray-50/50 dark:bg-black/10 border-t border-gray-100 dark:border-zinc-800/50">
                  {/* First row: Frequency */}
                  <div className="bg-white dark:bg-[#18181b] p-4 rounded-xl border border-gray-100 dark:border-zinc-800/60 shadow-sm">
                    <div className="flex flex-col gap-1.5 w-[200px]">
                      <label className="block text-sm font-semibold opacity-80 mb-1.5">
                        {t('gdrivePollInterval')}
                      </label>
                      <SettingsSelect
                        value={String(gdrivePollInterval)}
                        onChange={handlePollIntervalChange}
                        options={[
                          { value: '60000', label: `1 ${t('dashboardRange7').replace('7 ', '')}` }, // 1 minute
                          { value: '300000', label: '5 minutes' },
                          { value: '900000', label: '15 minutes' },
                          { value: '1800000', label: '30 minutes' },
                          { value: '0', label: t('gdrivePollOff') },
                        ]}
                      />
                    </div>
                  </div>

                  {/* Second block: File filters */}
                  <div className="bg-white dark:bg-[#18181b] p-4 rounded-xl border border-gray-100 dark:border-zinc-800/60 shadow-sm">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-semibold opacity-80">{t('gdriveFiltersTitle')}</span>
                      <button
                        type="button"
                        className="text-xs text-[#0066cc] hover:opacity-80 transition-opacity font-semibold cursor-pointer"
                        onClick={handleSaveFilters}
                      >
                        💾 {t('gdriveFiltersSaveBtn')}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold opacity-70 mb-1.5">
                          {t('gdriveFiltersIgnoredLabel')}
                        </label>
                        <input
                          type="text"
                          className="px-3 py-2 w-full text-sm border border-gray-300 dark:border-zinc-700 rounded-lg dark:bg-[#1c1b1f] dark:text-[#e6e1e5]"
                          value={gdriveIgnoredExtensions}
                          onChange={(e) => setGdriveIgnoredExtensions(e.target.value)}
                          placeholder={t('gdriveFiltersIgnoredPlaceholder')}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold opacity-70 mb-1.5">
                          {t('gdriveFiltersAllowedLabel')}
                        </label>
                        <input
                          type="text"
                          className="px-3 py-2 w-full text-sm border border-gray-300 dark:border-zinc-700 rounded-lg dark:bg-[#1c1b1f] dark:text-[#e6e1e5]"
                          value={gdriveAllowedExtensions}
                          onChange={(e) => setGdriveAllowedExtensions(e.target.value)}
                          placeholder={t('gdriveFiltersAllowedPlaceholder')}
                        />
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="block text-sm font-semibold opacity-80 mb-1.5">
                        Thư mục tạm lưu file tải về
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          className="px-3 py-2 flex-1 text-sm border border-gray-300 dark:border-zinc-700 rounded-lg dark:bg-[#1c1b1f] dark:text-[#e6e1e5]"
                          value={gdriveTempDir}
                          onChange={(e) => setGdriveTempDir(e.target.value)}
                          onBlur={async () => {
                            const res = await window.televault?.gdrive?.setTempDir(gdriveTempDir);
                            if (res?.ok) showToast('Đã lưu thư mục tạm');
                          }}
                          placeholder="Mặc định: Thư mục tạm của hệ điều hành"
                        />
                        <button
                          type="button"
                          className="px-3 py-2 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 border border-gray-300 dark:border-zinc-700 rounded-lg text-gray-700 dark:text-gray-300 transition-colors flex items-center justify-center"
                          onClick={async () => {
                            const res = await window.televault?.shell?.pickDirectory();
                            if (res?.ok && res.path) {
                              setGdriveTempDir(res.path);
                              const saveRes = await window.televault?.gdrive?.setTempDir(res.path);
                              if (saveRes?.ok) showToast('Đã lưu thư mục tạm');
                            }
                          }}
                          title="Chọn thư mục"
                        >
                          <IconFolder className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Third block: Subscriptions */}
                  <div className="bg-white dark:bg-[#18181b] p-4 rounded-xl border border-gray-100 dark:border-zinc-800/60 shadow-sm">
                    <div className="flex justify-between items-center mb-2.5">
                      <span className="text-sm font-semibold opacity-80">{t('gdriveSubscriptions')}</span>
                      <button
                        type="button"
                        className="text-xs text-[#0066cc] hover:opacity-80 transition-opacity font-semibold cursor-pointer"
                        onClick={() => setShowGDrivePicker(true)}
                      >
                        ➕ {t('gdriveAddFolder')}
                      </button>
                    </div>

                    {gdriveSubs.length === 0 ? (
                      <div className="text-sm opacity-50 py-4 text-center">{t('gdriveNoSubs')}</div>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {gdriveSubs.map((sub) => (
                          <div
                            key={sub.driveId}
                            className="flex items-center justify-between p-2 bg-gray-50/50 dark:bg-zinc-800/30 rounded-lg border border-gray-100 dark:border-zinc-700/50 text-[11px]"
                          >
                            <div className="flex-1 min-w-0 pr-3">
                              <div className="font-medium truncate flex items-center text-[var(--gd-text)]">
                                <span className="mr-1.5 shrink-0 opacity-80">
                                  {sub.isFolder ? '📁' : '📄'}
                                </span>
                                {sub.drivePath}
                              </div>
                              <div className="text-[10px] opacity-50 truncate mt-0.5 text-[var(--gd-text-secondary)]">
                                Dest: {sub.vaultPath}
                              </div>
                            </div>
                            <div className="flex items-center space-x-3">
                              <SettingsToggle
                                checked={sub.enabled}
                                label=""
                                onChange={(enabled) => toggleSub(sub.driveId, enabled)}
                              />
                              <button
                                type="button"
                                className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded transition-colors"
                                onClick={() => removeSub(sub.driveId)}
                                title="Remove"
                              >
                                ❌
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Disconnect button area */}
                  <div className="flex justify-start">
                    <button
                      type="button"
                      className="text-xs px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30 rounded-lg font-semibold transition-all"
                      onClick={disconnectGDrive}
                    >
                      🔌 {t('gdriveDisconnect')}
                    </button>
                  </div>
                </div>
              </details>
            </>
          )}
        </div>
      </section>

      {gdriveConnected && (
        <section className="gd-settings-group mt-6">
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-zinc-800 mb-4">
            <div className="flex gap-6">
              <button
                type="button"
                className={`pb-2 text-sm font-semibold cursor-pointer border-b-2 transition-all ${
                  activeSyncTab === 'queue'
                    ? 'border-[var(--gd-primary)] text-[var(--gd-primary)]'
                    : 'border-transparent opacity-60 hover:opacity-100 text-[var(--gd-text)]'
                }`}
                onClick={() => setActiveSyncTab('queue')}
              >
                {t('gdriveSyncQueueTitle')} ({gdriveQueue.length})
              </button>
              <button
                type="button"
                className={`pb-2 text-sm font-semibold cursor-pointer border-b-2 transition-all ${
                  activeSyncTab === 'history'
                    ? 'border-[var(--gd-primary)] text-[var(--gd-primary)]'
                    : 'border-transparent opacity-60 hover:opacity-100 text-[var(--gd-text)]'
                }`}
                onClick={() => setActiveSyncTab('history')}
              >
                {t('gdriveRecentSyncedTitle')} ({gdriveRecentSynced.length})
              </button>
              <button
                type="button"
                className={`pb-2 text-sm font-semibold cursor-pointer border-b-2 transition-all ${
                  activeSyncTab === 'errors'
                    ? 'border-[var(--gd-primary)] text-[var(--gd-primary)]'
                    : 'border-transparent opacity-60 hover:opacity-100 text-[var(--gd-text)]'
                }`}
                onClick={() => setActiveSyncTab('errors')}
              >
                {t('gdriveSyncErrorsTitle')} ({gdriveErrors.length})
              </button>
            </div>
            <div className="flex gap-4 items-center">
              {activeSyncTab === 'errors' && gdriveErrors.length > 0 && (
                <>
                  <button
                    type="button"
                    className="text-xs text-[#0066cc] hover:underline font-semibold cursor-pointer pb-2"
                    onClick={handleRetryAll}
                  >
                    {t('gdriveSyncErrorActionRetryAll')}
                  </button>
                  <button
                    type="button"
                    className="text-xs text-red-500 hover:underline font-semibold cursor-pointer pb-2"
                    onClick={async () => {
                      if (await confirm('Bạn có chắc chắn muốn xóa tất cả file lỗi khỏi danh sách?')) {
                        window.televault?.gdrive?.clearErrors();
                      }
                    }}
                  >
                    Xóa tất cả
                  </button>
                </>
              )}
              {activeSyncTab === 'history' && gdriveRecentSynced.length > 0 && (
                <button
                  type="button"
                  className="text-xs text-red-500 hover:underline font-semibold cursor-pointer pb-2"
                  onClick={async () => {
                    if (await confirm('Bạn có chắc chắn muốn xóa lịch sử đồng bộ? (Quá trình đồng bộ sau này có thể phải kiểm tra lại các file đã tải)')) {
                      window.televault?.gdrive?.clearHistory();
                    }
                  }}
                >
                  Xóa tất cả
                </button>
              )}
            </div>
          </div>

          <div className="gd-settings-card h-[280px] flex flex-col overflow-hidden">
            {activeSyncTab === 'queue' && (
              <div className="h-full flex flex-col">
                {selectedQueueIds.size > 0 && (
                  <div className="shrink-0 bg-[var(--gd-surface)] border-b border-[var(--gd-border)] p-2 flex items-center justify-between text-xs shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[var(--gd-primary)]">
                        Đã chọn {selectedQueueIds.size} file
                      </span>
                      <button
                        type="button"
                        className="px-2 py-1 text-[var(--gd-text-secondary)] hover:text-[var(--gd-text)] hover:underline"
                        onClick={() => {
                          setSelectedQueueIds(new Set());
                          lastSelectedRef.current = null;
                        }}
                      >
                        Bỏ chọn
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 text-[var(--gd-text-secondary)] hover:text-[var(--gd-text)] hover:underline"
                        onClick={() => {
                          const allIds = gdriveQueue.map((item) => item.driveFileId);
                          setSelectedQueueIds(new Set(allIds));
                          if (allIds.length > 0) {
                            lastSelectedRef.current = { 
                              id: allIds[allIds.length - 1], 
                              index: allIds.length - 1 
                            };
                          }
                        }}
                      >
                        Chọn tất cả
                      </button>
                    </div>
                    <button
                      type="button"
                      className="px-3 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded font-medium flex items-center gap-1 transition-colors"
                      onClick={() => {
                        for (const id of selectedQueueIds) {
                          window.televault?.gdrive?.removeQueueItem(id);
                        }
                        setSelectedQueueIds(new Set());
                      }}
                    >
                      <IconClose className="h-4 w-4" />
                      Hủy mục đã chọn
                    </button>
                  </div>
                )}
                {gdriveQueue.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-sm opacity-60">
                    {t('gdriveSyncQueueEmpty')}
                  </div>
                ) : (
                  <div className={`flex-1 overflow-y-auto ${selectedQueueIds.size > 0 ? 'gd-list-has-selection' : ''}`}>
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-zinc-800 text-left text-xs font-medium text-[var(--gd-text-secondary)]">
                          <th className="w-12 px-3 py-2" />
                          <th className="px-3 py-2">Tên file</th>
                          <th className="hidden px-3 py-2 sm:table-cell w-28 text-right">Kích thước</th>
                          <th className="hidden px-3 py-2 md:table-cell w-32">Trạng thái</th>
                          <th className="w-24 px-2 py-2" aria-hidden />
                        </tr>
                      </thead>
                      <tbody>
                        {gdriveQueue.slice(0, visibleQueueCount).map((item) => (
                          <GDriveQueueRow
                            key={item.driveFileId}
                            item={item}
                            isSelected={selectedQueueIds.has(item.driveFileId)}
                            onToggle={applyQueueSelection}
                            onClick={(e) => {
                              const orderedKeys = gdriveQueue.slice(0, visibleQueueCount).map(i => i.driveFileId);
                              handleSelectionClick(e, item.driveFileId, orderedKeys, applyQueueSelection);
                            }}
                            currentSyncFile={gdriveCurrentSyncFile}
                            currentSyncProgress={item.fileName === gdriveCurrentSyncFile ? gdriveCurrentSyncProgress : 0}
                          />
                        ))}
                      </tbody>
                    </table>
                    {visibleQueueCount < gdriveQueue.length && (
                      <div className="p-3 flex justify-center">
                        <button
                          type="button"
                          className="px-4 py-2 text-xs font-medium text-[var(--gd-primary)] border border-[var(--gd-primary)] rounded hover:bg-[var(--gd-primary-light)]/10 transition-colors"
                          onClick={() => setVisibleQueueCount(prev => prev + 50)}
                        >
                          Hiển thị thêm
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeSyncTab === 'errors' && (
              <div className="h-full flex flex-col">
                {gdriveErrors.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-sm opacity-60">
                    {t('gdriveSyncErrorsEmpty')}
                  </div>
                ) : (
                  <div className={`flex-1 overflow-y-auto ${selectedErrorIds.size > 0 ? 'gd-list-has-selection' : ''}`}>
                    {selectedErrorIds.size > 0 && (
                      <div className="shrink-0 bg-[var(--gd-surface)] border-b border-[var(--gd-border)] p-2 flex items-center justify-between text-xs shadow-sm sticky top-0 z-10">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[var(--gd-primary)]">
                            Đã chọn {selectedErrorIds.size} file
                          </span>
                          <button
                            type="button"
                            className="px-2 py-1 text-[var(--gd-text-secondary)] hover:text-[var(--gd-text)] hover:underline"
                            onClick={() => {
                              setSelectedErrorIds(new Set());
                              lastSelectedErrorRef.current = null;
                            }}
                          >
                            Bỏ chọn
                          </button>
                          <button
                            type="button"
                            className="px-2 py-1 text-[var(--gd-text-secondary)] hover:text-[var(--gd-text)] hover:underline"
                            onClick={() => {
                              const allIds = gdriveErrors.slice(0, visibleErrorsCount).map((item) => item.driveFileId);
                              setSelectedErrorIds(new Set(allIds));
                              if (allIds.length > 0) {
                                lastSelectedErrorRef.current = allIds[allIds.length - 1];
                              }
                            }}
                          >
                            Chọn tất cả
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="px-3 py-1 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-[var(--gd-text)] rounded font-medium flex items-center gap-1 transition-colors"
                            onClick={handleCopyErrors}
                          >
                            📋 Copy
                          </button>
                          <button
                            type="button"
                            className="px-3 py-1 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-[var(--gd-text)] rounded font-medium flex items-center gap-1 transition-colors"
                            onClick={handleExportCSV}
                          >
                            📄 Xuất CSV
                          </button>
                          <button
                            type="button"
                            className="px-3 py-1 bg-[#0066cc]/10 hover:bg-[#0066cc]/20 text-[#0066cc] rounded font-medium flex items-center gap-1 transition-colors"
                            onClick={() => {
                              for (const id of selectedErrorIds) {
                                handleRetryFile(id);
                              }
                              setSelectedErrorIds(new Set());
                            }}
                          >
                            Thử lại mục đã chọn
                          </button>
                          <button
                            type="button"
                            className="px-3 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded font-medium flex items-center gap-1 transition-colors"
                            onClick={() => {
                              for (const id of selectedErrorIds) {
                                window.televault?.gdrive?.removeErrorItem(id);
                              }
                              setSelectedErrorIds(new Set());
                            }}
                          >
                            <IconClose className="h-4 w-4" />
                            Xóa mục đã chọn
                          </button>
                        </div>
                      </div>
                    )}
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-[var(--gd-border)] text-left text-xs font-medium text-[var(--gd-text-secondary)]">
                          <th className="w-12 px-3 py-2" />
                          <th className="px-3 py-2">Tên file</th>
                          <th className="hidden px-3 py-2 sm:table-cell w-1/3">Chi tiết lỗi</th>
                          <th className="hidden px-3 py-2 md:table-cell w-36">Thời gian</th>
                          <th className="px-3 py-2 w-20 text-center">Trạng thái</th>
                          <th className="w-16 px-2 py-2" aria-hidden />
                        </tr>
                      </thead>
                      <tbody>
                        {gdriveErrors.slice(0, visibleErrorsCount).map((err) => (
                          <tr 
                            key={err.driveFileId} 
                            className={`gd-row border-b border-[var(--gd-border)] cursor-pointer hover:bg-[var(--gd-hover)] transition-colors ${selectedErrorIds.has(err.driveFileId) ? 'selected' : ''}`}
                            onMouseDown={(e) => {
                              if (e.shiftKey || e.ctrlKey || e.metaKey) {
                                e.preventDefault();
                              }
                            }}
                            onClick={(e) => {
                              const orderedKeys = gdriveErrors.slice(0, visibleErrorsCount).map(i => i.driveFileId);
                              handleSelectionClick(e, err.driveFileId, orderedKeys, applyErrorSelection);
                            }}
                          >
                            <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                className="gd-row-checkbox"
                                checked={selectedErrorIds.has(err.driveFileId)}
                                onChange={() => applyErrorSelection(err.driveFileId, { additive: true, range: false })}
                              />
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-3">
                                <span className="break-all whitespace-normal text-[var(--gd-text)]">{err.fileName}</span>
                              </div>
                              <div className="text-[11px] opacity-60 break-all whitespace-normal mt-0.5 text-[var(--gd-text-secondary)]">
                                {err.drivePath}
                              </div>
                            </td>
                            <td className="hidden px-3 py-3 text-[11px] text-red-500 sm:table-cell">
                              {err.errorMessage}
                            </td>
                            <td className="hidden px-3 py-3 text-[var(--gd-text-secondary)] md:table-cell text-[11px]">
                              {new Date(err.failedAt).toLocaleString()}
                            </td>
                            <td className="px-3 py-3 text-center">
                              <span className="text-red-500">❌</span>
                            </td>
                            <td className="px-2 py-2">
                              <div className="gd-row-actions justify-end shrink-0">
                                <button
                                  type="button"
                                  className="gd-row-action text-[var(--gd-primary)]"
                                  onClick={() => handleRetryFile(err.driveFileId)}
                                  title={t('gdriveSyncErrorActionRetry')}
                                >
                                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                    <path d="M3 3v5h5" />
                                  </svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {visibleErrorsCount < gdriveErrors.length && (
                      <div className="p-3 flex justify-center">
                        <button
                          type="button"
                          className="px-4 py-2 text-xs font-medium text-[var(--gd-primary)] border border-[var(--gd-primary)] rounded hover:bg-[var(--gd-primary-light)]/10 transition-colors"
                          onClick={() => setVisibleErrorsCount((c) => c + 50)}
                        >
                          Hiển thị thêm
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeSyncTab === 'history' && (
              <div className="h-full flex flex-col">
                {gdriveRecentSynced.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-sm opacity-60">
                    {t('gdriveRecentSyncedEmpty')}
                  </div>
                ) : (
                  <div className={`flex-1 overflow-y-auto ${selectedHistoryIds.size > 0 ? 'gd-list-has-selection' : ''}`}>
                    {selectedHistoryIds.size > 0 && (
                      <div className="shrink-0 bg-[var(--gd-surface)] border-b border-[var(--gd-border)] p-2 flex items-center justify-between text-xs shadow-sm sticky top-0 z-10">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[var(--gd-primary)]">
                            Đã chọn {selectedHistoryIds.size} file
                          </span>
                          <button
                            type="button"
                            className="px-2 py-1 text-[var(--gd-text-secondary)] hover:text-[var(--gd-text)] hover:underline"
                            onClick={() => {
                              setSelectedHistoryIds(new Set());
                              lastSelectedHistoryRef.current = null;
                            }}
                          >
                            Bỏ chọn
                          </button>
                          <button
                            type="button"
                            className="px-2 py-1 text-[var(--gd-text-secondary)] hover:text-[var(--gd-text)] hover:underline"
                            onClick={() => {
                              const allIds = gdriveRecentSynced.slice(0, visibleHistoryCount).map((item) => item.driveFileId);
                              setSelectedHistoryIds(new Set(allIds));
                              if (allIds.length > 0) {
                                lastSelectedHistoryRef.current = allIds[allIds.length - 1];
                              }
                            }}
                          >
                            Chọn tất cả
                          </button>
                        </div>
                        <button
                          type="button"
                          className="px-3 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded font-medium flex items-center gap-1 transition-colors"
                          onClick={() => {
                            for (const id of selectedHistoryIds) {
                              window.televault?.gdrive?.removeHistoryItem(id);
                            }
                            setSelectedHistoryIds(new Set());
                          }}
                        >
                          <IconClose className="h-4 w-4" />
                          Xóa mục đã chọn
                        </button>
                      </div>
                    )}
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-[var(--gd-border)] text-left text-xs font-medium text-[var(--gd-text-secondary)]">
                          <th className="w-12 px-3 py-2" />
                          <th className="px-3 py-2">Tên file</th>
                          <th className="hidden px-3 py-2 sm:table-cell w-28 text-right">Kích thước</th>
                          <th className="hidden px-3 py-2 md:table-cell w-36">Thời gian</th>
                          <th className="px-3 py-2 w-20 text-center">Trạng thái</th>
                          <th className="w-16 px-2 py-2" aria-hidden />
                        </tr>
                      </thead>
                      <tbody>
                        {gdriveRecentSynced.slice(0, visibleHistoryCount).map((item) => (
                          <tr 
                            key={item.driveFileId} 
                            className={`gd-row border-b border-[var(--gd-border)] cursor-pointer hover:bg-[var(--gd-hover)] transition-colors ${selectedHistoryIds.has(item.driveFileId) ? 'selected' : ''}`}
                            onMouseDown={(e) => {
                              if (e.shiftKey || e.ctrlKey || e.metaKey) {
                                e.preventDefault();
                              }
                            }}
                            onClick={(e) => {
                              const orderedKeys = gdriveRecentSynced.slice(0, visibleHistoryCount).map(i => i.driveFileId);
                              handleSelectionClick(e, item.driveFileId, orderedKeys, applyHistorySelection);
                            }}
                          >
                            <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                className="gd-row-checkbox"
                                checked={selectedHistoryIds.has(item.driveFileId)}
                                onChange={() => applyHistorySelection(item.driveFileId, { additive: true, range: false })}
                              />
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-3">
                                <span className="break-all whitespace-normal font-medium text-[var(--gd-text)]">
                                  {item.drivePath.split('/').at(-1) || item.drivePath}
                                </span>
                              </div>
                              <div className="text-[11px] opacity-60 break-all whitespace-normal mt-0.5 text-[var(--gd-text-secondary)]">
                                Drive: {item.drivePath} → Vault: {item.vaultPath}
                              </div>
                            </td>
                            <td className="hidden px-3 py-3 text-[var(--gd-text-secondary)] sm:table-cell text-right">
                              {item.size > 0 ? `${(item.size / (1024 * 1024)).toFixed(2)} MB` : '—'}
                            </td>
                            <td className="hidden px-3 py-3 text-[var(--gd-text-secondary)] md:table-cell text-[11px]">
                              {new Date(item.syncedAt).toLocaleString()}
                            </td>
                            <td className="px-3 py-3 text-center">
                              <span className="text-green-500">✓</span>
                            </td>
                            <td className="px-2 py-2">
                              <div className="gd-row-actions justify-end shrink-0">
                                <button
                                  type="button"
                                  className="gd-row-action"
                                  onClick={() => {
                                    const vaultDir = item.vaultPath.substring(0, item.vaultPath.lastIndexOf('/'));
                                    window.dispatchEvent(new CustomEvent('gd-navigate', { detail: vaultDir + '/' }));
                                  }}
                                  title="Mở thư mục"
                                >
                                  <IconFolder className="h-5 w-5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {visibleHistoryCount < gdriveRecentSynced.length && (
                      <div className="p-3 flex justify-center">
                        <button
                          type="button"
                          className="px-4 py-2 text-xs font-medium text-[var(--gd-primary)] border border-[var(--gd-primary)] rounded hover:bg-[var(--gd-primary-light)]/10 transition-colors"
                          onClick={() => setVisibleHistoryCount((c) => c + 50)}
                        >
                          Hiển thị thêm
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {showGDrivePicker && (
        <GDriveFilePicker
          onConfirm={handleAddGDriveSubs}
          onCancel={() => setShowGDrivePicker(false)}
        />
      )}
    </div>
  );
}
