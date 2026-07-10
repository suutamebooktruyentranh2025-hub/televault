import { useEffect, useRef, useState } from 'react';
import { formatDate, formatSize } from '../utils/format';
import { useI18n } from '../context/I18nContext';
import { ContextMenu } from './ContextMenu';
import { DriveSelectionBar } from './DriveSelectionBar';
import {
  fileTypeIcon,
  IconDeleteForever,
  IconDownload,
  IconFolder,
  IconFolderGrid,
  IconGridView,
  IconLabel,
  IconListView,
  IconMoveTo,
  IconMoreVert,
  IconNewFolder,
  IconOpen,
  IconPreview,
  IconRename,
  IconRestore,
  IconSaveAs,
  IconTrash,
  IconUploadFile,
  IconUploadFolder,
} from './DriveIcons';

const menuIconClass = 'h-5 w-5';

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);

function isEditableTarget(target) {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}

function fileExt(name) {
  return name.includes('.') ? name.split('.').pop()?.toLowerCase() : '';
}

function openMenu(setMenu, e, items, anchor = null) {
  setMenu({
    x: e.clientX,
    y: e.clientY,
    anchor,
    items,
  });
}

export function BrowserScreen({
  folders,
  files,
  loading,
  viewMode,
  sortField,
  sortDirection,
  trashFolder,
  currentFolder,
  selectedIds,
  selectedFolders,
  onOpenFolder,
  onToggleSort,
  onToggleViewMode,
  onToggleSelect,
  onToggleFolderSelect,
  onOpenFile,
  onRenameFile,
  onRenameFolder,
  onMoveFile,
  onMoveFolder,
  onFolderTags,
  onTrashFile,
  onTrashFolder,
  onRestoreFile,
  onRestoreFolder,
  onDeleteForeverFile,
  onDeleteForeverFolder,
  onDownload,
  onDownloadFolder,
  onSaveAs,
  onPreview,
  onUploadFiles,
  onUploadFolder,
  onCreateFolder,
  selectionCount = 0,
  canDownloadSelection = false,
  onClearSelection,
  onDownloadSelected,
  onMoveSelected,
  onTrashSelected,
  onRestoreSelected,
  onDeleteForeverSelected,
  onApplyItemSelection,
  onSelectAll,
  readonly = false,
}) {
  const { t } = useI18n();
  const isTrash = currentFolder === trashFolder;
  const empty = !loading && folders.length === 0 && files.length === 0;
  const [menu, setMenu] = useState(null);
  const clickTimerRef = useRef(null);

  const orderedKeys = [
    ...folders.map((folder) => `folder:${currentFolder}${folder.name}/`),
    ...files.map((file) => `file:${file.messageId}`),
  ];

  function scheduleSelect(selectFn) {
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      selectFn();
      clickTimerRef.current = null;
    }, 220);
  }

  function cancelSelectTimer() {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
  }

  function handleItemMouseDown(e) {
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      e.preventDefault();
    }
  }

  function handleItemClick(e, key) {
    const additive = e.ctrlKey || e.metaKey;
    const range = e.shiftKey;
    const modifiers = { additive, range };

    if (additive || range) {
      e.preventDefault();
      window.getSelection()?.removeAllRanges();
      cancelSelectTimer();
      onApplyItemSelection(key, modifiers, orderedKeys);
      return;
    }

    scheduleSelect(() => {
      onApplyItemSelection(key, { additive: false, range: false }, orderedKeys);
    });
  }

  function handleOpen(openFn) {
    cancelSelectTimer();
    openFn();
  }

  useEffect(() => {
    function onKeyDown(e) {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'a') return;
      if (isEditableTarget(e.target)) return;
      if (loading || empty) return;

      e.preventDefault();
      window.getSelection()?.removeAllRanges();
      onSelectAll();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [loading, empty, onSelectAll]);

  function showSelectionMoreMenu(e) {
    if (!isTrash) return;
    openMenu(setMenu, e, [
      {
        label: t('deleteForever'),
        icon: <IconDeleteForever className={menuIconClass} />,
        action: onDeleteForeverSelected,
        danger: true,
      },
    ], e.currentTarget);
  }

  function showEmptyMenu(e) {
    if (readonly || isTrash) return;
    e.preventDefault();
    openMenu(setMenu, e, [
      {
        label: t('newFolder'),
        icon: <IconNewFolder className={menuIconClass} />,
        action: onCreateFolder,
      },
      { separator: true },
      {
        label: t('uploadFile'),
        icon: <IconUploadFile className={menuIconClass} />,
        action: onUploadFiles,
      },
      {
        label: t('uploadFolder'),
        icon: <IconUploadFolder className={menuIconClass} />,
        action: onUploadFolder,
      },
    ]);
  }

  function showFileMenu(e, file, anchor = null) {
    e.preventDefault();
    e.stopPropagation();
    
    if (readonly) {
      openMenu(setMenu, e, [
        {
          label: t('download'),
          icon: <IconDownload className={menuIconClass} />,
          action: () => onDownload(file),
        }
      ], anchor);
      return;
    }

    const items = isTrash
      ? [
          {
            label: t('restore'),
            icon: <IconRestore className={menuIconClass} />,
            action: () => onRestoreFile(file),
          },
          {
            label: t('deleteForever'),
            icon: <IconDeleteForever className={menuIconClass} />,
            action: () => onDeleteForeverFile(file),
            danger: true,
          },
        ]
      : [
          {
            label: t('download'),
            icon: <IconDownload className={menuIconClass} />,
            action: () => onDownload(file),
          },
          {
            label: t('rename'),
            icon: <IconRename className={menuIconClass} />,
            action: () => onRenameFile(file),
          },
          {
            label: t('move'),
            icon: <IconMoveTo className={menuIconClass} />,
            action: () => onMoveFile(file),
          },
          {
            label: t('trash'),
            icon: <IconTrash className={menuIconClass} />,
            action: () => onTrashFile(file),
            danger: true,
          },
        ];
    openMenu(setMenu, e, items, anchor);
  }

  function showFolderMenu(e, name, anchor = null) {
    e.preventDefault();
    e.stopPropagation();

    if (readonly) {
      // For folders in readonly mode, we might only allow opening (which is handled by click).
      // If there's a download folder function, we could show it, but for now just don't show the context menu.
      if (onDownloadFolder) {
        openMenu(setMenu, e, [
          {
            label: t('download'),
            icon: <IconDownload className={menuIconClass} />,
            action: () => onDownloadFolder(name),
          }
        ], anchor);
      }
      return;
    }

    const items = isTrash
      ? [
          {
            label: t('restore'),
            icon: <IconRestore className={menuIconClass} />,
            action: () => onRestoreFolder(name),
          },
          {
            label: t('deleteForever'),
            icon: <IconDeleteForever className={menuIconClass} />,
            action: () => onDeleteForeverFolder(name),
            danger: true,
          },
        ]
      : [
          {
            label: t('download'),
            icon: <IconDownload className={menuIconClass} />,
            action: () => onDownloadFolder(name),
          },
          {
            label: t('rename'),
            icon: <IconRename className={menuIconClass} />,
            action: () => onRenameFolder(name),
          },
          {
            label: t('move'),
            icon: <IconMoveTo className={menuIconClass} />,
            action: () => onMoveFolder(name),
          },
          {
            label: t('addTags'),
            icon: <IconLabel className={menuIconClass} />,
            action: () => onFolderTags(name),
          },
          {
            label: t('trash'),
            icon: <IconTrash className={menuIconClass} />,
            action: () => onTrashFolder(name),
            danger: true,
          },
        ];
    openMenu(setMenu, e, items, anchor);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" onContextMenu={showEmptyMenu}>
      <div className="flex items-center justify-between gap-3 px-4 py-2">
        {selectionCount > 0 ? (
          <DriveSelectionBar
            count={selectionCount}
            isTrash={isTrash}
            canDownload={canDownloadSelection}
            onClear={onClearSelection}
            onDownload={() => void onDownloadSelected()}
            onMove={readonly ? undefined : () => void onMoveSelected()}
            onTrash={readonly ? undefined : () => void onTrashSelected()}
            onRestore={readonly ? undefined : () => void onRestoreSelected()}
            onDeleteForever={readonly ? undefined : () => void onDeleteForeverSelected()}
            onMore={readonly ? undefined : (isTrash ? showSelectionMoreMenu : undefined)}
            readonly={readonly}
          />
        ) : (
          <div />
        )}
        <div className="flex items-center gap-1">
          <IconToggle
            active={viewMode === 'list'}
            label={t('viewList')}
            onClick={() => viewMode !== 'list' && onToggleViewMode()}
          >
            <IconListView className="h-5 w-5" />
          </IconToggle>
          <IconToggle
            active={viewMode === 'grid'}
            label={t('viewGrid')}
            onClick={() => viewMode !== 'grid' && onToggleViewMode()}
          >
            <IconGridView className="h-5 w-5" />
          </IconToggle>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-[var(--gd-text-secondary)]">
          {t('loading')}
        </div>
      ) : empty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[var(--gd-text-secondary)]">
          <IconFolder className="h-16 w-16 opacity-80" />
          <p className="text-base">{isTrash ? t('emptyTrash') : t('emptyFolder')}</p>
          {!isTrash && <p className="max-w-sm text-center text-sm">{readonly ? t('emptyFolderReadonlyHint') : t('emptyFolderHint')}</p>}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="gd-grid flex-1 overflow-auto px-6 pb-6">
          {folders.map((folder) => (
            <FolderGridCard
              key={folder.name}
              name={folder.name}
              selected={selectedFolders.has(`${currentFolder}${folder.name}/`)}
              onMouseDown={handleItemMouseDown}
              onClick={(e) => handleItemClick(e, `folder:${currentFolder}${folder.name}/`)}
              onDoubleClick={isTrash ? undefined : () => handleOpen(() => onOpenFolder(folder.name))}
              onContextMenu={(e) => showFolderMenu(e, folder.name)}
              onMenu={(e) => showFolderMenu(e, folder.name, e.currentTarget)}
            />
          ))}
          {files.map((file) => (
            <FileGridCard
              key={file.messageId}
              file={file}
              selected={selectedIds.has(file.messageId)}
              onMouseDown={handleItemMouseDown}
              onClick={(e) => handleItemClick(e, `file:${file.messageId}`)}
              onDoubleClick={() => handleOpen(() => onOpenFile(file))}
              onContextMenu={(e) => showFileMenu(e, file)}
              onMenu={(e) => showFileMenu(e, file, e.currentTarget)}
            />
          ))}
        </div>
      ) : (
        <div className={`min-h-0 flex-1 overflow-auto px-2 pb-4 ${selectionCount > 0 ? 'gd-list-has-selection' : ''}`}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--gd-border)] text-left text-xs font-medium text-[var(--gd-text-secondary)]">
                <th className="w-12 px-3 py-2" />
                <th className="px-3 py-2">
                  <SortHeader active={sortField === 'name'} direction={sortDirection} onClick={() => onToggleSort('name')}>
                    {t('colName')}
                  </SortHeader>
                </th>
                <th className="hidden px-3 py-2 md:table-cell">
                  <SortHeader active={sortField === 'mtime'} direction={sortDirection} onClick={() => onToggleSort('mtime')}>
                    {t('colModified')}
                  </SortHeader>
                </th>
                <th className="hidden w-28 px-3 py-2 sm:table-cell">
                  <SortHeader active={sortField === 'size'} direction={sortDirection} onClick={() => onToggleSort('size')}>
                    {t('colSize')}
                  </SortHeader>
                </th>
                <th className="w-36 px-2 py-2" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {folders.map((folder) => {
                const selected = selectedFolders.has(`${currentFolder}${folder.name}/`);
                return (
                  <tr
                    key={folder.name}
                    className={`gd-row cursor-pointer border-b border-[var(--gd-border)] ${selected ? 'selected' : ''}`}
                    onMouseDown={handleItemMouseDown}
                    onClick={(e) => handleItemClick(e, `folder:${currentFolder}${folder.name}/`)}
                    onDoubleClick={isTrash ? undefined : () => handleOpen(() => onOpenFolder(folder.name))}
                    onContextMenu={(e) => showFolderMenu(e, folder.name)}
                  >
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="gd-row-checkbox"
                        checked={selected}
                        onChange={() => onToggleFolderSelect(folder.name)}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <IconFolder className="h-6 w-6 shrink-0" />
                        <span
                          className={`truncate ${selected ? 'font-medium text-[var(--gd-primary)]' : 'text-[var(--gd-text)]'}`}
                        >
                          {folder.name}
                        </span>
                      </div>
                    </td>
                    <td className="hidden px-3 py-3 text-[var(--gd-text-secondary)] md:table-cell">
                      {formatDate(folder.mtime)}
                    </td>
                    <td className="hidden px-3 py-3 text-[var(--gd-text-secondary)] sm:table-cell">
                      {folder.size > 0 ? formatSize(folder.size) : '—'}
                    </td>
                    <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                      <RowQuickActions
                        onRename={readonly ? undefined : () => onRenameFolder(folder.name)}
                        onMore={readonly ? undefined : (e) => showFolderMenu(e, folder.name, e.currentTarget)}
                      />
                    </td>
                  </tr>
                );
              })}
              {files.map((file) => {
                const selected = selectedIds.has(file.messageId);
                return (
                  <tr
                    key={file.messageId}
                    className={`gd-row cursor-pointer border-b border-[var(--gd-border)] ${selected ? 'selected' : ''}`}
                    onMouseDown={handleItemMouseDown}
                    onClick={(e) => handleItemClick(e, `file:${file.messageId}`)}
                    onDoubleClick={() => handleOpen(() => onOpenFile(file))}
                    onContextMenu={(e) => showFileMenu(e, file)}
                  >
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="gd-row-checkbox"
                        checked={selected}
                        onChange={() => onToggleSelect(file.messageId)}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        {fileTypeIcon(file.name, 'h-6 w-6 shrink-0')}
                        <span
                          className={`truncate ${selected ? 'font-medium text-[var(--gd-primary)]' : 'text-[var(--gd-text)]'}`}
                        >
                          {file.name}
                        </span>
                      </div>
                    </td>
                    <td className="hidden px-3 py-3 text-[var(--gd-text-secondary)] md:table-cell">
                      {formatDate(file.mtime)}
                    </td>
                    <td className="hidden px-3 py-3 text-[var(--gd-text-secondary)] sm:table-cell">
                      {formatSize(file.size)}
                    </td>
                    <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                      <RowQuickActions
                        onDownload={() => onDownload(file)}
                        onRename={readonly ? undefined : () => onRenameFile(file)}
                        onMore={readonly ? undefined : (e) => showFileMenu(e, file, e.currentTarget)}
                        showDownload={!isTrash}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          anchor={menu.anchor}
          items={menu.items}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

function SortHeader({ active, direction, onClick, children }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 hover:text-[var(--gd-text)]">
      {children}
      {active && <span className="text-[var(--gd-primary)]">{direction === 'asc' ? '↑' : '↓'}</span>}
    </button>
  );
}

function IconToggle({ active, label, onClick, children }) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={`rounded-full p-2 ${
        active ? 'bg-[var(--gd-primary-light)] text-[var(--gd-primary)]' : 'text-[var(--gd-text-secondary)] hover:bg-[var(--gd-hover)]'
      }`}
    >
      {children}
    </button>
  );
}

function GridMenuButton({ onClick }) {
  return (
    <button
      type="button"
      className="gd-grid-menu"
      aria-label="More actions"
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
    >
      <IconMoreVert className="h-5 w-5" />
    </button>
  );
}

function FolderGridCard({ name, selected, onMouseDown, onClick, onDoubleClick, onContextMenu, onMenu }) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={`gd-grid-folder ${selected ? 'selected' : ''}`}
      onMouseDown={onMouseDown}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(e);
        }
      }}
    >
      <IconFolderGrid className="h-6 w-6" />
      <span
        className={`min-w-0 flex-1 truncate text-sm ${selected ? 'font-medium text-[var(--gd-primary)]' : 'text-[var(--gd-text)]'}`}
      >
        {name}
      </span>
      {onMenu && <GridMenuButton onClick={onMenu} />}
    </div>
  );
}

function FileGridCard({ file, selected, onMouseDown, onClick, onDoubleClick, onContextMenu, onMenu }) {
  const ext = fileExt(file.name);
  const isImage = IMAGE_EXT.has(ext || '');
  const thumbSrc = isImage && file.localPath ? `file://${file.localPath}` : null;

  return (
    <div
      role="button"
      tabIndex={0}
      className={`gd-grid-file ${selected ? 'selected' : ''}`}
      onMouseDown={onMouseDown}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(e);
        }
      }}
    >
      <div className="gd-grid-file-header">
        {fileTypeIcon(file.name, 'h-5 w-5 shrink-0')}
        <span
          className={`min-w-0 flex-1 truncate text-sm ${selected ? 'font-medium text-[var(--gd-primary)]' : 'text-[var(--gd-text)]'}`}
        >
          {file.name}
        </span>
        {onMenu && <GridMenuButton onClick={onMenu} />}
      </div>
      {thumbSrc ? (
        <div className="gd-grid-file-preview">
          <img src={thumbSrc} alt="" loading="lazy" />
        </div>
      ) : (
        <div className="gd-grid-file-preview gd-grid-file-preview--placeholder">
          {fileTypeIcon(file.name, 'h-12 w-12 opacity-80')}
        </div>
      )}
    </div>
  );
}

export function RowQuickActions({ onDownload, onRename, onMore, showDownload = false, onOpenFolder }) {
  const { t } = useI18n();

  return (
    <div className="gd-row-actions">
      {onOpenFolder && (
        <button type="button" className="gd-row-action" title="Mở thư mục" onClick={onOpenFolder}>
          <IconFolder className="h-5 w-5" />
        </button>
      )}
      {showDownload && onDownload && (
        <button type="button" className="gd-row-action" title={t('download')} onClick={onDownload}>
          <IconDownload className="h-5 w-5" />
        </button>
      )}
      {onRename && (
        <button type="button" className="gd-row-action" title={t('rename')} onClick={onRename}>
          <IconRename className="h-5 w-5" />
        </button>
      )}
      {onMore && (
        <button type="button" className="gd-row-action" title={t('moreActions')} onClick={onMore}>
          <IconMoreVert className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
