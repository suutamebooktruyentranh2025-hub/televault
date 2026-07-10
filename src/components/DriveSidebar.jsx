import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../context/I18nContext';
import {
  IconAdd,
  IconChevronDown,
  IconDashboard,
  IconDriveLogo,
  IconGDriveLogo,
  IconHome,
  IconLabel,
  IconNewFolder,
  IconSettings,
  IconTrash,
  IconTransfer,
  IconUploadFolder,
  IconSharedDrive,
  IconRefresh,
  IconLogout,
  IconAccount,
  IconUploadFile,
} from './DriveIcons';
export function DriveSidebar({
  section,
  currentFolder,
  trashFolder,
  onNavigate,
  onSectionChange,
  onNewFolder,
  onUploadFiles,
  onUploadFolder,
  sharedVaults = [],
  activeSharedVaultId,
  onSharedVaultSelect,
  onDiscoverSharedVaults,
  accounts = [],
  activeAccountId,
  onSwitchAccount,
  onAddAccount,
  onSignOut,
}) {
  const { t } = useI18n();
  const isTrash = currentFolder === trashFolder && section === 'vault';
  const [newOpen, setNewOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const newRef = useRef(null);
  const accountRef = useRef(null);

  useEffect(() => {
    function close(e) {
      if (newOpen && newRef.current && !newRef.current.contains(e.target)) setNewOpen(false);
      if (accountOpen && accountRef.current && !accountRef.current.contains(e.target)) setAccountOpen(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [newOpen, accountOpen]);

  const activeAccount = accounts.find(a => a.id === activeAccountId) || { name: 'Người dùng', phone: '' };

  return (
    <aside className="flex w-[256px] shrink-0 flex-col bg-[var(--gd-bg)] py-2 pl-2">
      <div className="mb-3 flex items-center gap-2 px-3 py-2">
        <IconDriveLogo className="h-8 w-8 shrink-0" />
        <span className="text-[22px] font-normal text-[var(--gd-text)]">{t('appName')}</span>
      </div>

        <div ref={newRef} className="relative mb-4 px-2">
          <button
            type="button"
            onClick={() => setNewOpen((v) => !v)}
            className="gd-btn-new flex h-12 w-[min(156px,calc(100%-8px))] items-center gap-3 rounded-2xl px-5 text-sm font-medium transition-shadow"
          >
            <IconAdd className="h-6 w-6 text-[var(--gd-primary)]" />
            <span>{t('newButton')}</span>
            <IconChevronDown className="ml-auto h-4 w-4 text-[var(--gd-text-secondary)]" />
          </button>
          {newOpen && (
            <div className="gd-menu absolute left-2 top-[52px] z-50 min-w-[220px] py-1">
              <MenuItem
                icon={<IconNewFolder className="h-5 w-5" />}
                label={t('newFolder')}
                onClick={() => {
                  setNewOpen(false);
                  onNewFolder();
                }}
              />
              <div className="my-1 border-t border-[var(--gd-border)]" role="separator" />
              <MenuItem
                icon={<IconUploadFile className="h-5 w-5" />}
                label={t('uploadFile')}
                onClick={() => {
                  setNewOpen(false);
                  onUploadFiles();
                }}
              />
              <MenuItem
                icon={<IconUploadFolder className="h-5 w-5" />}
                label={t('uploadFolder')}
                onClick={() => {
                  setNewOpen(false);
                  onUploadFolder();
                }}
              />
            </div>
          )}
        </div>

      <nav className="flex flex-col gap-0.5">
            <NavItem
              active={section === 'vault' && !isTrash}
              icon={<IconHome className="h-5 w-5" />}
              label={t('navVault')}
              onClick={() => {
                onSectionChange('vault');
                onNavigate('/');
              }}
            />
            <NavItem
              active={section === 'gdrive'}
              icon={<IconGDriveLogo className="h-5 w-5 shrink-0" />}
              label={t('gdriveSection')}
              onClick={() => onSectionChange('gdrive')}
            />
            <NavItem
              active={section === 'tags'}
              icon={<IconLabel className="h-5 w-5" />}
              label={t('tagsSection')}
              onClick={() => onSectionChange('tags')}
            />
            <NavItem
              active={section === 'dashboard'}
              icon={<IconDashboard className="h-5 w-5" />}
              label={t('dashboardSection')}
              onClick={() => onSectionChange('dashboard')}
            />
        <NavItem
          active={section === 'transfers'}
          icon={<IconTransfer className="h-5 w-5" />}
          label={t('taskSection')}
          onClick={() => onSectionChange('transfers')}
        />
        <NavItem
          active={section === 'vault' && isTrash}
          icon={<IconTrash className="h-5 w-5" />}
          label={t('navTrash')}
          onClick={() => {
            onSectionChange('vault');
            onNavigate(trashFolder);
          }}
        />
        <NavItem
          active={section === 'settings'}
          icon={<IconSettings className="h-5 w-5" />}
          label={t('navSettings')}
          onClick={() => onSectionChange('settings')}
        />

        {sharedVaults.length > 0 && (
          <>
            <div className="my-2 mx-4 border-t border-[var(--gd-border)]" role="separator" />
            <div className="flex items-center justify-between px-4 py-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--gd-text-secondary)] opacity-70">
                {t('navSharedWithMe')}
              </div>
              {onDiscoverSharedVaults && (
                <button
                  type="button"
                  className="rounded p-1 text-[var(--gd-text-secondary)] hover:bg-[var(--gd-hover)]"
                  title="Làm mới danh sách"
                  onClick={onDiscoverSharedVaults}
                >
                  <IconRefresh className="h-3 w-3" />
                </button>
              )}
            </div>
            {sharedVaults.map((vault) => (
              <NavItem
                key={vault.chatId}
                active={section === 'shared-vault' && activeSharedVaultId === vault.chatId}
                icon={<IconSharedDrive className="h-5 w-5" />}
                label={vault.title}
                onClick={() => onSharedVaultSelect?.(vault.chatId)}
              />
            ))}
          </>
        )}
      </nav>


      
      <div className="mt-auto px-2 pb-4">
        <div ref={accountRef} className="relative">
          <button
            type="button"
            onClick={() => setAccountOpen(!accountOpen)}
            className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-[var(--gd-hover)] transition-colors"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--gd-primary)] text-white font-medium">
              {activeAccount.name ? activeAccount.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium text-[var(--gd-text)]">{activeAccount.name}</span>
              </div>
            <IconChevronDown className="h-4 w-4 text-[var(--gd-text-secondary)]" />
          </button>
          
          {accountOpen && (
            <div className="absolute bottom-[calc(100%+8px)] left-0 z-50 w-full min-w-[240px] rounded-2xl bg-[var(--gd-surface)] py-2 shadow-lg border border-[var(--gd-border)]">
              <div className="px-4 py-2 text-xs font-semibold text-[var(--gd-text-secondary)] uppercase tracking-wider">
                Chuyển tài khoản
              </div>
              {accounts.map(acc => (
                <button
                  key={acc.id}
                  onClick={() => {
                    setAccountOpen(false);
                    onSwitchAccount(acc.id);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-[var(--gd-hover)]"
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-700 text-xs font-medium">
                    {acc.name ? acc.name.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className={`truncate text-sm ${acc.id === activeAccountId ? 'font-semibold text-[var(--gd-primary)]' : 'text-[var(--gd-text)]'}`}>
                      {acc.name}
                    </span>
                    </div>
                  {acc.id === activeAccountId && (
                    <div className="h-2 w-2 rounded-full bg-[var(--gd-primary)]" />
                  )}
                </button>
              ))}
              <div className="my-1 border-t border-[var(--gd-border)]" />
              <MenuItem
                icon={<IconAdd className="h-4 w-4" />}
                label="Thêm tài khoản mới"
                onClick={() => {
                  setAccountOpen(false);
                  onAddAccount();
                }}
              />
              <MenuItem
                icon={<IconLogout className="h-4 w-4 text-red-500" />}
                label="Đăng xuất khỏi thiết bị"
                onClick={() => {
                  setAccountOpen(false);
                  onSignOut();
                }}
              />
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function NavItem({ active, icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`gd-nav-item flex h-10 items-center gap-4 px-4 text-sm ${active ? 'active' : ''}`}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function MenuItem({ icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-[var(--gd-text)] hover:bg-[var(--gd-hover)]"
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
