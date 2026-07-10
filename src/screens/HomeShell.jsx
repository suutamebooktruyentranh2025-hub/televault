import { useI18n } from '../context/I18nContext';

export function HomeShell({ email, entryCount, onSignOut }) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen flex-col bg-[#f8f7fc]">
      <header className="flex items-center justify-between border-b border-[#e8deff] bg-white px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold text-[#21005d]">{t('appName')}</h1>
          {email ? <p className="text-xs text-[#4a4458]">{email}</p> : null}
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="rounded-lg px-3 py-2 text-sm text-[#5a3799] hover:bg-[#e8deff]"
        >
          {t('signOut')}
        </button>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8">
        <p className="text-sm text-[#4a4458]">{t('homeReady')}</p>
        <p className="text-2xl font-semibold text-[#5a3799]">{entryCount}</p>
        <p className="text-xs text-[#4a4458]">{t('homeEntryCount')}</p>
      </main>
    </div>
  );
}
