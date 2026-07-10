import { useEffect, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useI18n } from '../context/I18nContext';

const levelColors = {
  info: 'text-blue-500 dark:text-blue-400',
  success: 'text-green-500 dark:text-green-400',
  warn: 'text-amber-500 dark:text-amber-400',
  error: 'text-red-500 dark:text-red-400',
};

function Toggle({ checked, onChange, ariaLabel }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={onChange}
      className={`w-8 h-4 rounded-full flex items-center px-0.5 cursor-pointer transition-colors ${
        checked ? 'bg-[var(--gd-primary)] justify-end' : 'bg-gray-300 dark:bg-zinc-700 justify-start'
      }`}
    >
      <span className="w-3 h-3 bg-white rounded-full shadow-sm shrink-0" />
    </button>
  );
}

function LocaleToggle({ locale, onLocaleChange, ariaLabel }) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex h-4 shrink-0 rounded-full bg-gray-200 dark:bg-zinc-800 p-0.5 w-[4.25rem]">
      <button
        type="button"
        aria-pressed={locale === 'en'}
        onClick={() => onLocaleChange('en')}
        className={`flex-1 min-w-0 rounded-full text-[9px] font-bold leading-none transition-colors cursor-pointer ${
          locale === 'en'
            ? 'bg-[var(--gd-primary)] text-white'
            : 'text-gray-500 dark:text-zinc-400 hover:text-gray-800 dark:hover:text-zinc-200'
        }`}
      >
        EN
      </button>
      <button
        type="button"
        aria-pressed={locale === 'vi'}
        onClick={() => onLocaleChange('vi')}
        className={`flex-1 min-w-0 rounded-full text-[9px] font-bold leading-none transition-colors cursor-pointer ${
          locale === 'vi'
            ? 'bg-[var(--gd-primary)] text-white'
            : 'text-gray-500 dark:text-zinc-400 hover:text-gray-800 dark:hover:text-zinc-200'
        }`}
      >
        VI
      </button>
    </div>
  );
}


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
          <div className="flex items-center gap-2 min-w-0 text-gray-500 dark:text-zinc-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 17 10 11 4 5"></polyline>
              <line x1="12" y1="19" x2="20" y2="19"></line>
            </svg>
            <span className="truncate text-[10px] font-bold uppercase tracking-tighter">
              {t('consoleTitle')}
            </span>
          </div>
          <button
            type="button"
            onClick={onClearLogs}
            title={t('clearLog')}
            className="cursor-pointer rounded p-0.5 text-gray-500 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto font-mono text-[11px] text-gray-700 dark:text-zinc-300 space-y-0.5">
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
      <div className="flex min-h-0 min-w-0 flex-col gap-3 rounded-lg border border-[var(--gd-border)] bg-[var(--gd-surface)] p-3 shadow-sm h-full overflow-y-auto">
        <div className="space-y-3 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-medium text-gray-700 dark:text-zinc-200 shrink-0">{t('darkMode')}</span>
            <Toggle checked={isDark} ariaLabel={t('darkMode')} onChange={() => setTheme(isDark ? 'light' : 'dark')} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-medium text-gray-700 dark:text-zinc-200 shrink-0">{t('language')}</span>
            <LocaleToggle locale={locale} onLocaleChange={setLocale} ariaLabel={t('language')} />
          </div>
        </div>
      </div>
    </section>
  );
}
