import { useI18n } from '../context/I18nContext';

export function HelpDialog({ onClose }) {
  const { t } = useI18n();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-lg mx-4 bg-[var(--gd-surface)] rounded-2xl shadow-2xl border border-[var(--gd-border)] overflow-hidden animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--gd-border)] bg-gradient-to-r from-[var(--gd-primary)]/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--gd-primary)]/10 text-[var(--gd-primary)]">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <h2 className="text-base font-semibold text-[var(--gd-text)]">
              Google Drive Sync — FAQ
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--gd-text-secondary)] transition-colors hover:bg-[var(--gd-primary-light)] hover:text-[var(--gd-text)]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 max-h-[60vh] overflow-y-auto">
          <FaqItem
            icon="🌐"
            title={t('gdriveHelpNetworkTitle')}
            body={t('gdriveHelpNetworkBody')}
          />
          <FaqItem
            icon="💾"
            title={t('gdriveHelpLocalTempTitle')}
            body={t('gdriveHelpLocalTempBody')}
          />
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[var(--gd-border)] bg-[var(--gd-surface)] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-sm font-medium rounded-lg bg-[var(--gd-primary)] text-white transition-all hover:opacity-90 hover:shadow-md active:scale-[0.98]"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

function FaqItem({ icon, title, body }) {
  return (
    <div className="rounded-xl border border-[var(--gd-border)] p-4 transition-colors hover:bg-[var(--gd-primary-light)]/30">
      <div className="flex items-start gap-3">
        <span className="text-lg mt-0.5 shrink-0">{icon}</span>
        <div>
          <h3 className="text-sm font-semibold text-[var(--gd-text)] mb-1.5">{title}</h3>
          <p className="text-xs leading-relaxed text-[var(--gd-text-secondary)]">{body}</p>
        </div>
      </div>
    </div>
  );
}
