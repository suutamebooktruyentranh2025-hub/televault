import { useCallback } from 'react';
import { useI18n } from '../context/I18nContext';

export const ADMIN_EMAIL = 'suutamebooktruyentranh@gmail.com';
export const ADMIN_TELEGRAM_ALEX = 'https://t.me/alexdandan';
export const ADMIN_TELEGRAM_CHANNEL = 'https://t.me/suutamebooktruyentranh';

function useOpenExternal() {
  return useCallback((url) => {
    const u = String(url || '').trim();
    if (!u) return;
    const api = window.televault?.shell;
    if (api?.openExternal) {
      void api.openExternal(u);
    } else {
      window.open(u, '_blank', 'noopener,noreferrer');
    }
  }, []);
}

export function AdminContactLinks({ className = '' }) {
  const { t } = useI18n();
  const openExternal = useOpenExternal();
  const mailto = `mailto:${ADMIN_EMAIL}`;

  return (
    <div
      className={`rounded-lg border border-[var(--gd-border)] bg-[var(--gd-hover)] px-4 py-3 text-left text-sm ${className}`}
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--gd-text-secondary)]">
        {t('contactAdminHeading')}
      </p>
      <ul className="space-y-2.5 text-[var(--gd-text)]">
        <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="w-16 shrink-0 text-[var(--gd-text-secondary)]">{t('contactEmailLabel')}</span>
          <button
            type="button"
            onClick={() => openExternal(mailto)}
            className="break-all text-left font-medium text-[var(--gd-primary)] underline hover:opacity-90"
          >
            {ADMIN_EMAIL}
          </button>
        </li>
        <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="w-16 shrink-0 text-[var(--gd-text-secondary)]">{t('contactTelegramLabel')}</span>
          <button
            type="button"
            onClick={() => openExternal(ADMIN_TELEGRAM_ALEX)}
            className="text-left font-medium text-[var(--gd-primary)] underline hover:opacity-90"
          >
            {t('contactTelegramAlex')}
          </button>
        </li>
        <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="w-16 shrink-0 text-[var(--gd-text-secondary)]">{t('contactTelegramLabel')}</span>
          <button
            type="button"
            onClick={() => openExternal(ADMIN_TELEGRAM_CHANNEL)}
            className="text-left font-medium text-[var(--gd-primary)] underline hover:opacity-90"
          >
            {t('contactTelegramChannel')}
          </button>
        </li>
      </ul>
    </div>
  );
}
