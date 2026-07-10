import { useI18n } from '../context/I18nContext';
import { IconSearch } from './DriveIcons';

export function DriveTopBar({ searchQuery, onSearchChange, title, showSearch = true, helpAction, syncStatus }) {
  const { t } = useI18n();

  const syncLabelKey = syncStatus?.status === 'idle'
    ? 'syncStatusSynced'
    : `syncStatus${syncStatus?.status ? syncStatus.status.charAt(0).toUpperCase() + syncStatus.status.slice(1) : 'Paused'}`;

  const tooltip = syncStatus
    ? `${t(syncLabelKey)}${syncStatus.pendingCount > 0 ? ` (${syncStatus.pendingCount} ${t('syncPending')})` : ''}`
    : '';

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-[var(--gd-border)] bg-[var(--gd-surface)] px-4">
      {title ? (
        <h1 className="min-w-0 truncate text-xl font-normal text-[var(--gd-text)]">{title}</h1>
      ) : null}
      {showSearch ? (
        <div className="gd-search flex h-12 max-w-[720px] flex-1 items-center gap-3 px-4 transition-all">
          <IconSearch className="h-5 w-5 shrink-0 text-[var(--gd-text-secondary)]" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('searchHint')}
            className="w-full bg-transparent text-sm text-[var(--gd-text)] outline-none placeholder:text-[var(--gd-text-secondary)]"
          />
        </div>
      ) : null}
      
      <div className="ml-auto flex items-center gap-3">
        {syncStatus && syncStatus.status && (
          <div 
            title={tooltip}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--gd-text-secondary)] transition-all hover:bg-[var(--gd-primary-light)] hover:text-[var(--gd-primary)] cursor-help"
          >
            {syncStatus.status === 'idle' && (
              <svg className="text-green-500/80" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.5 19A3.5 3.5 0 0 0 21 15.5c0-2.79-2.54-4.5-5-4.5-.48 0-.96.06-1.4.17A6 6 0 0 0 3 13c0 2.2 1.4 4.3 3.5 4.9" />
              </svg>
            )}
            {syncStatus.status === 'syncing' && (
              <svg className="text-[var(--gd-primary)] animate-spin" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6" />
                <path d="M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
            )}
            {syncStatus.status === 'conflict' && (
              <svg className="text-amber-500" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            )}
            {syncStatus.status === 'paused' && (
              <svg className="text-zinc-400" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="14" y="4" width="4" height="16" rx="1" />
                <rect x="6" y="4" width="4" height="16" rx="1" />
              </svg>
            )}
            {syncStatus.status === 'error' && (
              <svg className="text-red-500" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            )}
          </div>
        )}

        {helpAction ? (
          <button
            type="button"
            onClick={helpAction}
            title={t('gdriveHelpFaqTitle')}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--gd-border)] text-[var(--gd-text-secondary)] transition-all hover:bg-[var(--gd-primary-light)] hover:text-[var(--gd-primary)] hover:border-[var(--gd-primary)] hover:shadow-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </button>
        ) : null}
      </div>
    </header>
  );
}
