import { useCallback, useEffect, useMemo, useState } from 'react';
import { DriveSidebar } from './DriveSidebar';
import { DriveBreadcrumb } from './DriveBreadcrumb';
import { DriveTopBar } from './DriveTopBar';
import { BrowserScreen } from './BrowserScreen';

import { MoveToDialog } from './MoveToDialog';
import { FolderTagEditorDialog } from './FolderTagEditorDialog';
import { recordRecentMoveFolder } from '../utils/moveTargets';
import { SearchResultsBody } from './SearchResultsBody';
import { UploadActivityPanel } from './UploadActivityPanel';
import { TagsScreen } from '../screens/TagsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { PreviewScreen } from '../screens/PreviewScreen';
import { GDriveSyncScreen } from '../screens/GDriveSyncScreen';
import { TransferScreen } from '../screens/TransferScreen';
import { HelpDialog } from './HelpDialog';
import { useVault } from '../hooks/useVault';
import { useSharedVaults } from '../hooks/useSharedVaults';
import { useTransfers } from '../hooks/useTransfers';
import { useI18n } from '../context/I18nContext';
import { useDialog } from '../context/DialogContext';
import { useToast } from '../context/ToastContext';
import { ConsolePanel } from './ConsolePanel';
import { StatusBar } from './StatusBar';
import { useLogs } from '../hooks/useLogs';
import { appLog } from '../utils/logger';

const vaultApi = window.televault?.vault;

function sectionTitle(section, t, isTrash) {
  if (section === 'tags') return t('tagsTitle');
  if (section === 'dashboard') return t('dashboardTitle');
  if (section === 'gdrive') return t('gdriveSection');
  if (section === 'transfers') return 'Truyền tải';
  if (section === 'settings') return t('settingsTitle');
  if (isTrash) return t('navTrash');
  return t('navVault');
}

function folderLabelFromPath(path, myDriveLabel) {
  if (!path || path === '/') return myDriveLabel;
  return path.split('/').filter(Boolean).at(-1) || myDriveLabel;
}

function parentFolderOfPath(path) {
  const trimmed = path.endsWith('/') ? path.slice(0, -1) : path;
  const lastSlash = trimmed.lastIndexOf('/');
  return lastSlash <= 0 ? '/' : `${trimmed.slice(0, lastSlash + 1)}`;
}

export function VaultShell({ accounts, activeAccountId, onSignOut, onSwitchAccount, onAddAccount }) {
  const { t } = useI18n();
  const { prompt, confirm } = useDialog();
  const { showToast } = useToast();
  const vault = useVault();
  const sharedVaults = useSharedVaults();
  const transfers = useTransfers({ enabled: true });
  const [section, setSection] = useState(() => localStorage.getItem('televault_section') || 'vault');
  useEffect(() => {
    localStorage.setItem('televault_section', section);
  }, [section]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectedFolders, setSelectedFolders] = useState(new Set());
  const [lastSelectedKey, setLastSelectedKey] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [moveDialog, setMoveDialog] = useState(null);
  const [tagEditor, setTagEditor] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  
  const activeAccount = accounts?.find(a => a.id === activeAccountId) || { name: 'Người dùng', phone: '' };

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

  useEffect(() => {
    const unsub = window.televault?.sync?.onChanged?.((snapshot) => {
      setSyncStatus(snapshot);
    });
    void window.televault?.sync?.getStatus?.().then((s) => {
      if (s?.ok) setSyncStatus(s);
    });
    return () => unsub?.();
  }, []);

  const isTrash = vault.currentFolder === vault.stats.trashFolder;
  const showSearch = (section === 'vault' && !isTrash) || section === 'shared-vault';
  const isSearching = showSearch && searchQuery.trim().length > 0;
  const pageTitle = isSearching ? t('searchHint') : sectionTitle(section, t, isTrash);

  useEffect(() => {
    if (!isSearching) {
      setSearchResults([]);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        let result;
        if (section === 'shared-vault' && sharedVaults.activeVaultId) {
          result = await window.televault?.sharedVault?.search(sharedVaults.activeVaultId, searchQuery.trim());
        } else {
          result = await vaultApi?.search(searchQuery.trim(), []);
        }
        if (!cancelled && result?.ok) setSearchResults(result.files);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, isSearching, section, sharedVaults.activeVaultId]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectedFolders(new Set());
    setLastSelectedKey(null);
  }, []);

  function parseSelectionKey(key) {
    if (key.startsWith('file:')) return { type: 'file', id: Number(key.slice(5)) };
    if (key.startsWith('folder:')) return { type: 'folder', path: key.slice(7) };
    return null;
  }

  const applyItemSelection = useCallback((key, { additive, range }, orderedKeys) => {
    const item = parseSelectionKey(key);
    if (!item) return;

    if (range && lastSelectedKey && orderedKeys.length > 0) {
      const from = orderedKeys.indexOf(lastSelectedKey);
      const to = orderedKeys.indexOf(key);
      if (from >= 0 && to >= 0) {
        const lo = Math.min(from, to);
        const hi = Math.max(from, to);
        const newIds = new Set();
        const newFolders = new Set();
        for (const entryKey of orderedKeys.slice(lo, hi + 1)) {
          const parsed = parseSelectionKey(entryKey);
          if (parsed?.type === 'file') newIds.add(parsed.id);
          if (parsed?.type === 'folder') newFolders.add(parsed.path);
        }
        setSelectedIds(newIds);
        setSelectedFolders(newFolders);
        setLastSelectedKey(key);
        return;
      }
    }

    if (additive) {
      if (item.type === 'file') {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(item.id)) next.delete(item.id);
          else next.add(item.id);
          return next;
        });
      } else {
        setSelectedFolders((prev) => {
          const next = new Set(prev);
          if (next.has(item.path)) next.delete(item.path);
          else next.add(item.path);
          return next;
        });
      }
    } else if (item.type === 'file') {
      setSelectedIds(new Set([item.id]));
      setSelectedFolders(new Set());
    } else {
      setSelectedFolders(new Set([item.path]));
      setSelectedIds(new Set());
    }

    setLastSelectedKey(key);
  }, [lastSelectedKey]);

  function openFolder(name) {
    clearSelection();
    vault.goTo(`${vault.currentFolder}${name}/`);
  }

  useEffect(() => {
    function onGdNavigate(e) {
      clearSelection();
      setSection('vault');
      setSearchQuery('');
      vault.goTo(e.detail);
    }
    window.addEventListener('gd-navigate', onGdNavigate);
    return () => window.removeEventListener('gd-navigate', onGdNavigate);
  }, [vault.goTo, clearSelection]);

  const toggleSelect = useCallback((keyOrId) => {
    const key = String(keyOrId).includes(':') ? keyOrId : `file:${keyOrId}`;
    applyItemSelection(key, { additive: true, range: false }, [key]);
  }, [applyItemSelection]);

  const selectAllInView = useCallback(() => {
    const orderedKeys = [
      ...vault.folders.map((folder) => `folder:${vault.currentFolder}${folder.name}/`),
      ...vault.files.map((file) => `file:${file.messageId}`),
    ];
    const newIds = new Set(vault.files.map((file) => file.messageId));
    const newFolders = new Set(vault.folders.map((folder) => `${vault.currentFolder}${folder.name}/`));
    setSelectedIds(newIds);
    setSelectedFolders(newFolders);
    setLastSelectedKey(orderedKeys.at(-1) ?? null);
  }, [vault.folders, vault.files, vault.currentFolder]);

  async function uploadPaths(paths) {
    if (!paths?.length) return;
    appLog('info', t('uploadQueued', { n: paths.length }));
    await vaultApi?.uploadPaths(paths, vault.currentFolder);
  }

  async function handleUploadFiles() {
    const picked = await vaultApi?.pickUploadFiles();
    if (picked?.ok) await uploadPaths(picked.paths);
  }

  async function handleUploadFolder() {
    const picked = await vaultApi?.pickUploadFolder();
    if (picked?.ok) await uploadPaths(picked.paths);
  }

  async function handleCreateFolder() {
    const name = await prompt(t('folderName'));
    if (!name?.trim()) return;
    const result = await vaultApi?.createFolder(vault.currentFolder, name.trim());
    if (!result?.ok) showToast(result?.error || t('errorGeneric'), { variant: 'error' });
  }

  async function handleTrashSelected() {
    const result = await vaultApi?.trash([...selectedIds], [...selectedFolders]);
    if (!result?.ok) {
      showToast(result?.error || t('errorGeneric'), { variant: 'error' });
      return;
    }
    clearSelection();
  }

  async function handleMoveSelected() {
    const sourceFolders = [...selectedFolders];
    const total = selectedIds.size + selectedFolders.size;
    setMoveDialog({
      title: t('moveDialogItemsTitle', { n: total }),
      currentFolder: vault.currentFolder,
      currentLocationLabel: folderLabelFromPath(vault.currentFolder, t('myDrive')),
      sourceFolders,
      onConfirm: async (destination) => {
        for (const messageId of selectedIds) {
          const result = await vaultApi?.moveFile(messageId, destination);
          if (!result?.ok) {
            showToast(result?.error || t('errorGeneric'), { variant: 'error' });
            return false;
          }
        }
        for (const folderPath of sourceFolders) {
          const result = await vaultApi?.moveFolder(folderPath, destination);
          if (!result?.ok) {
            showToast(result?.error || t('errorGeneric'), { variant: 'error' });
            return false;
          }
        }
        clearSelection();
        return true;
      },
    });
  }

  async function handleDownloadSelected() {
    for (const messageId of selectedIds) {
      const file = vault.files.find((f) => f.messageId === messageId);
      if (file) await handleDownload(file);
    }
    for (const folderPath of selectedFolders) {
      await handleDownloadFolderByPath(folderPath);
    }
  }

  async function handleRestoreSelected() {
    const result = await vaultApi?.restore([...selectedIds], [...selectedFolders]);
    if (!result?.ok) {
      showToast(result?.error || t('errorGeneric'), { variant: 'error' });
      return;
    }
    clearSelection();
  }

  async function handleDeleteForeverSelected() {
    if (!(await confirm(t('deleteForever')))) return;
    const result = await vaultApi?.deletePermanent([...selectedIds], [...selectedFolders]);
    if (!result?.ok) {
      showToast(result?.error || t('errorGeneric'), { variant: 'error' });
      return;
    }
    clearSelection();
  }

  async function handleOpenFile(file) {
    const ext = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : '';
    const previewable = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'txt', 'md', 'json'].includes(ext || '');
    if (previewable) setPreviewFile(file);
  }

  async function handleRenameFile(file) {
    const name = await prompt(t('newName'), file.name);
    if (!name?.trim()) return;
    const result = await vaultApi?.renameFile(file.messageId, name.trim());
    if (!result?.ok) showToast(result?.error || t('errorGeneric'), { variant: 'error' });
  }

  async function handleRenameFolder(folderName) {
    const folderPath = `${vault.currentFolder}${folderName}/`;
    const name = await prompt(t('newName'), folderName);
    if (!name?.trim()) return;
    const result = await vaultApi?.renameFolder(folderPath, name.trim());
    if (!result?.ok) showToast(result?.error || t('errorGeneric'), { variant: 'error' });
  }

  async function handleMoveFile(file) {
    const currentFolder = parentFolderOfPath(file.path);
    setMoveDialog({
      title: t('moveDialogItemTitle', { name: file.name }),
      currentFolder,
      currentLocationLabel: folderLabelFromPath(currentFolder, t('myDrive')),
      sourceFolders: [],
      onConfirm: async (destination) => {
        const result = await vaultApi?.moveFile(file.messageId, destination);
        if (!result?.ok) {
          showToast(result?.error || t('errorGeneric'), { variant: 'error' });
          return false;
        }
        return true;
      },
    });
  }

  async function handleMoveFolder(folderName) {
    const folderPath = `${vault.currentFolder}${folderName}/`;
    setMoveDialog({
      title: t('moveDialogItemTitle', { name: folderName }),
      currentFolder: vault.currentFolder,
      currentLocationLabel: folderLabelFromPath(vault.currentFolder, t('myDrive')),
      sourceFolders: [folderPath],
      onConfirm: async (destination) => {
        const result = await vaultApi?.moveFolder(folderPath, destination);
        if (!result?.ok) {
          showToast(result?.error || t('errorGeneric'), { variant: 'error' });
          return false;
        }
        return true;
      },
    });
  }

  async function handleDownload(file) {
    const result = await vaultApi?.download(file.messageId);
    if (result?.cancelled) return;
    if (!result?.ok) {
      showToast(result?.error || t('errorGeneric'), { variant: 'error' });
      return;
    }
    showToast(t('downloadDone', { path: result.path }));
  }

  async function handleDownloadFolderByPath(folderPath) {
    const result = await vaultApi?.downloadFolder(folderPath);
    if (result?.cancelled) return;
    if (!result?.ok) {
      showToast(result?.error || t('errorGeneric'), { variant: 'error' });
      return;
    }
    const msg =
      result.failed === 0
        ? t('saveFolderDone', { saved: result.saved, total: result.total, path: result.destRoot })
        : t('saveFolderPartial', {
            saved: result.saved,
            failed: result.failed,
            path: result.destRoot,
          });
    showToast(msg, { variant: result.failed === 0 ? 'default' : 'error' });
  }

  async function handleDownloadFolder(folderName) {
    await handleDownloadFolderByPath(`${vault.currentFolder}${folderName}/`);
  }

  async function handleSaveAs(file) {
    const result = await vaultApi?.saveAs(file.messageId);
    if (result?.cancelled) return;
    if (!result?.ok) {
      showToast(result?.error || t('errorGeneric'), { variant: 'error' });
      return;
    }
    showToast(t('downloadDone', { path: result.path }));
  }

  async function handleFolderTags(folderName) {
    const folderPath = `${vault.currentFolder}${folderName}/`;
    const [folderTagsResult, allTagsResult] = await Promise.all([
      vaultApi?.getFolderTags(folderPath),
      vaultApi?.allTags(),
    ]);
    setTagEditor({
      folderName,
      folderPath,
      initialTags: folderTagsResult?.ok ? folderTagsResult.tags : [],
      knownTags: allTagsResult?.ok ? allTagsResult.names || [] : [],
    });
  }

  async function handleSaveFolderTags(folderPath, tags) {
    const result = await vaultApi?.setFolderTags(folderPath, tags);
    if (!result?.ok) {
      showToast(result?.error || t('errorGeneric'), { variant: 'error' });
      return false;
    }
    return true;
  }

  async function handleTrashFile(file) {
    const result = await vaultApi?.trash([file.messageId], []);
    if (!result?.ok) showToast(result?.error || t('errorGeneric'), { variant: 'error' });
  }

  async function handleTrashFolder(name) {
    const result = await vaultApi?.trash([], [`${vault.currentFolder}${name}/`]);
    if (!result?.ok) showToast(result?.error || t('errorGeneric'), { variant: 'error' });
  }

  async function handleRestoreFile(file) {
    const result = await vaultApi?.restore([file.messageId], []);
    if (!result?.ok) showToast(result?.error || t('errorGeneric'), { variant: 'error' });
  }

  async function handleRestoreFolder(name) {
    const result = await vaultApi?.restore([], [`${vault.currentFolder}${name}/`]);
    if (!result?.ok) showToast(result?.error || t('errorGeneric'), { variant: 'error' });
  }

  async function handleDeleteForeverFile(file) {
    if (!(await confirm(t('deleteForever')))) return;
    const result = await vaultApi?.deletePermanent([file.messageId], []);
    if (!result?.ok) showToast(result?.error || t('errorGeneric'), { variant: 'error' });
  }

  async function handleDeleteForeverFolder(name) {
    if (!(await confirm(t('deleteForever')))) return;
    const result = await vaultApi?.deletePermanent([], [`${vault.currentFolder}${name}/`]);
    if (!result?.ok) showToast(result?.error || t('errorGeneric'), { variant: 'error' });
  }

  function handleDashboardOpenFolder(folderPath) {
    clearSelection();
    setSection('vault');
    vault.goTo(folderPath);
  }

  function handleDashboardOpenFile(file) {
    clearSelection();
    setSection('vault');
    const parent = file.path.slice(0, file.path.lastIndexOf('/') + 1) || '/';
    vault.goTo(parent);
    void handleOpenFile(file);
  }

  const selectionCount = selectedIds.size + selectedFolders.size;
  const canDownloadSelection = selectedIds.size > 0 || selectedFolders.size > 0;

  const mainContent = useMemo(() => {
    if (section === 'shared-vault') {
      const noop = () => {};
      
      const sharedDownloadFolder = async (folderName) => {
        const folderPath = `${sharedVaults.currentFolder}${folderName}/`;
        const result = await window.televault?.sharedVault?.downloadFolder(sharedVaults.activeVaultId, folderPath);
        if (result?.cancelled) return;
        if (!result?.ok) {
          showToast(result?.error || t('errorGeneric'), { variant: 'error' });
          return;
        }
        showToast(t('saveFolderDone', { saved: result.saved, total: result.total, path: result.destRoot }));
      };

      const sharedDownload = async (file) => {
        const result = await window.televault?.sharedVault?.download(sharedVaults.activeVaultId, file.messageId);
        if (result?.cancelled) return;
        if (!result?.ok) {
          showToast(result?.error || t('errorGeneric'), { variant: 'error' });
          return;
        }
        showToast(t('downloadDone', { path: result.path }));
      };

      // If searching within shared vault, show search results
      if (isSearching) {
        return (
          <SearchResultsBody
            files={searchResults}
            loading={searchLoading}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onOpenFile={noop}
            onApplyItemSelection={applyItemSelection}
            onDownload={sharedDownload}
            onRenameFile={noop}
            onMoveFile={noop}
            onTrashFile={noop}
            onSaveAs={noop}
            onPreview={(file) => setPreviewFile(file)}
          />
        );
      }

      return (
        <BrowserScreen
          folders={sharedVaults.folders}
          files={sharedVaults.files}
          loading={sharedVaults.loading || sharedVaults.scanning}
          readonly={true}
          viewMode={vault.viewMode}
          sortField={sharedVaults.sortField}
          sortDirection={sharedVaults.sortDirection}
          trashFolder="__never_match__"
          currentFolder={sharedVaults.currentFolder}
          selectedIds={selectedIds}
          selectedFolders={selectedFolders}
          onOpenFolder={(f) => sharedVaults.goTo(`${sharedVaults.currentFolder}${f}/`)}
          onToggleSort={sharedVaults.toggleSort}
          onToggleViewMode={vault.toggleViewMode}
          onToggleSelect={toggleSelect}
          onApplyItemSelection={applyItemSelection}
          onToggleFolderSelect={(name) => {
            applyItemSelection(
              `folder:${sharedVaults.currentFolder}${name}/`,
              { additive: true, range: false },
              [
                ...sharedVaults.folders.map((f) => `folder:${sharedVaults.currentFolder}${f.name}/`),
                ...sharedVaults.files.map((f) => `file:${f.messageId}`),
              ],
            );
          }}
          onOpenFile={noop}
          onRenameFile={noop}
          onRenameFolder={noop}
          onMoveFile={noop}
          onMoveFolder={noop}
          onFolderTags={noop}
          onTrashFile={noop}
          onTrashFolder={noop}
          onRestoreFolder={noop}
          onDeleteForeverFolder={noop}
          onRestoreFile={noop}
          onDeleteForeverFile={noop}
          onDownload={sharedDownload}
          onDownloadFolder={sharedDownloadFolder}
          onSaveAs={noop}
          onPreview={(file) => setPreviewFile(file)}
          selectionCount={selectionCount}
          canDownloadSelection={canDownloadSelection}
          onClearSelection={clearSelection}
          onDownloadSelected={async () => {
            for (const messageId of selectedIds) {
              await sharedDownload({ messageId });
            }
            for (const folderPath of selectedFolders) {
              const folderName = folderPath.slice(sharedVaults.currentFolder.length, -1);
              if (folderName) await sharedDownloadFolder(folderName);
            }
            clearSelection();
          }}
          onSelectAll={() => {
            const allKeys = [
              ...sharedVaults.folders.map((f) => `folder:${sharedVaults.currentFolder}${f.name}/`),
              ...sharedVaults.files.map((f) => `file:${f.messageId}`),
            ];
            for (const key of allKeys) {
              applyItemSelection(key, { additive: true, range: false }, allKeys);
            }
          }}
        />
      );
    }
    if (section === 'tags') {
      return (
        <TagsScreen
          onOpenFolder={(folderPath) => {
            setSection('vault');
            setSearchQuery('');
            clearSelection();
            vault.goTo(folderPath);
          }}
        />
      );
    }
    if (section === 'settings') {
      return <SettingsScreen account={activeAccount} onSignOut={onSignOut} />;
    }
    if (section === 'gdrive') {
      return <GDriveSyncScreen />;
    }
    if (section === 'transfers') {
      return <TransferScreen />;
    }
    if (section === 'dashboard') {
      return (
        <DashboardScreen
          onOpenFolder={handleDashboardOpenFolder}
          onOpenFile={handleDashboardOpenFile}
        />
      );
    }
    if (isSearching) {
      return (
        <SearchResultsBody
          files={searchResults}
          loading={searchLoading}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onOpenFile={handleOpenFile}
          onApplyItemSelection={applyItemSelection}
          onDownload={handleDownload}
          onRenameFile={handleRenameFile}
          onMoveFile={handleMoveFile}
          onTrashFile={handleTrashFile}
          onSaveAs={handleSaveAs}
          onPreview={(file) => setPreviewFile(file)}
        />
      );
    }
    return (
      <BrowserScreen
        folders={vault.folders}
        files={vault.files}
        loading={vault.loading}
        viewMode={vault.viewMode}
        sortField={vault.sortField}
        sortDirection={vault.sortDirection}
        trashFolder={vault.stats.trashFolder}
        currentFolder={vault.currentFolder}
        selectedIds={selectedIds}
        selectedFolders={selectedFolders}
        onOpenFolder={openFolder}
        onToggleSort={vault.toggleSort}
        onToggleViewMode={vault.toggleViewMode}
        onToggleSelect={toggleSelect}
        onApplyItemSelection={applyItemSelection}
        onToggleFolderSelect={(name) => {
          applyItemSelection(
            `folder:${vault.currentFolder}${name}/`,
            { additive: true, range: false },
            [
              ...vault.folders.map((folder) => `folder:${vault.currentFolder}${folder.name}/`),
              ...vault.files.map((file) => `file:${file.messageId}`),
            ],
          );
        }}
        onOpenFile={handleOpenFile}
        onRenameFile={handleRenameFile}
        onRenameFolder={handleRenameFolder}
        onMoveFile={handleMoveFile}
        onMoveFolder={handleMoveFolder}
        onFolderTags={handleFolderTags}
        onTrashFile={handleTrashFile}
        onTrashFolder={handleTrashFolder}
        onRestoreFolder={handleRestoreFolder}
        onDeleteForeverFolder={handleDeleteForeverFolder}
        onRestoreFile={handleRestoreFile}
        onDeleteForeverFile={handleDeleteForeverFile}
        onDownload={handleDownload}
        onDownloadFolder={handleDownloadFolder}
        onSaveAs={handleSaveAs}
        onPreview={(file) => setPreviewFile(file)}
        onUploadFiles={handleUploadFiles}
        onUploadFolder={handleUploadFolder}
        onCreateFolder={handleCreateFolder}
        selectionCount={selectionCount}
        canDownloadSelection={canDownloadSelection}
        onClearSelection={clearSelection}
        onDownloadSelected={handleDownloadSelected}
        onMoveSelected={handleMoveSelected}
        onTrashSelected={handleTrashSelected}
        onRestoreSelected={handleRestoreSelected}
        onDeleteForeverSelected={handleDeleteForeverSelected}
        onSelectAll={selectAllInView}
      />
    );
  }, [section, isSearching, searchResults, searchLoading, selectedIds, selectedFolders, vault, sharedVaults, toggleSelect, applyItemSelection, selectionCount, canDownloadSelection, clearSelection]);

  return (
    <div className="flex h-screen flex-col bg-[var(--gd-bg)]">
      <div
        className="flex min-h-0 flex-1"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (section !== 'vault' || isSearching || isTrash) return;
        const paths = [...e.dataTransfer.files].map((f) => f.path).filter(Boolean);
        void uploadPaths(paths);
      }}
    >
      <DriveSidebar
        section={section}
        currentFolder={vault.currentFolder}
        trashFolder={vault.stats.trashFolder}
        onNavigate={(folder) => {
          setSection('vault');
          setSearchQuery('');
          clearSelection();
          vault.goTo(folder);
        }}
        onSectionChange={(next) => {
          setSection(next);
          setSearchQuery('');
          clearSelection();
        }}
        onNewFolder={handleCreateFolder}
        onUploadFiles={handleUploadFiles}
        onUploadFolder={handleUploadFolder}
        sharedVaults={sharedVaults.vaults}
        activeSharedVaultId={sharedVaults.activeVaultId}
        onDiscoverSharedVaults={sharedVaults.discover}
        onSharedVaultSelect={(chatId) => {
          setSection('shared-vault');
          setSearchQuery('');
          clearSelection();
          sharedVaults.openVault(chatId);
        }}
        accounts={accounts}
        activeAccountId={activeAccountId}
        onSwitchAccount={onSwitchAccount}
        onAddAccount={onAddAccount}
        onSignOut={onSignOut}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <DriveTopBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          showSearch={showSearch}
          helpAction={section === 'gdrive' ? () => setShowHelpDialog(true) : undefined}
          syncStatus={syncStatus}
        />

        {section === 'vault' && !isSearching && !isTrash && (
          <div className="border-b border-[var(--gd-border)] bg-[var(--gd-surface)] px-2">
            <DriveBreadcrumb crumbs={vault.breadcrumbs} onNavigate={vault.goTo} />
          </div>
        )}

        {section === 'shared-vault' && !isSearching && (
          <div className="border-b border-[var(--gd-border)] bg-[var(--gd-surface)] px-2">
            <DriveBreadcrumb crumbs={sharedVaults.breadcrumbs} onNavigate={sharedVaults.goTo} />
          </div>
        )}

        <div className="relative flex min-h-0 flex-1 flex-col bg-[var(--gd-surface)]">
          {dragOver && section === 'vault' && !isSearching && !isTrash && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-[var(--gd-primary)] bg-[var(--gd-primary-light)]/60 text-[var(--gd-primary)]">
              {t('uploadFile')}
            </div>
          )}
          <main className="flex min-h-0 flex-1 flex-col">{mainContent}</main>
        </div>
        </div>
      </div>

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

      <UploadActivityPanel
        tasks={transfers.tasks}
        onClearFinished={() => void transfers.clearFinished()}
        onCancel={(id) => void transfers.cancel(id)}
      />

      {moveDialog && (
        <MoveToDialog
          title={moveDialog.title}
          currentFolder={moveDialog.currentFolder}
          currentLocationLabel={moveDialog.currentLocationLabel}
          sourceFolders={moveDialog.sourceFolders}
          folders={vault.allFolders}
          onCancel={() => setMoveDialog(null)}
          onConfirm={async (destination) => {
            const ok = await moveDialog.onConfirm(destination);
            if (ok) {
              recordRecentMoveFolder(destination);
              setMoveDialog(null);
            }
          }}
        />
      )}

      {tagEditor && (
        <FolderTagEditorDialog
          folderName={tagEditor.folderName}
          initialTags={tagEditor.initialTags}
          knownTags={tagEditor.knownTags}
          onCancel={() => setTagEditor(null)}
          onSave={(tags) => handleSaveFolderTags(tagEditor.folderPath, tags)}
        />
      )}

      {previewFile && <PreviewScreen file={previewFile} onClose={() => setPreviewFile(null)} />}

      {showHelpDialog && <HelpDialog onClose={() => setShowHelpDialog(false)} />}
    </div>
  );
}
