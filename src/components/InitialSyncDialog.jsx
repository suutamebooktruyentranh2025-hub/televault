import { useState } from 'react';
import { useI18n } from '../context/I18nContext';

export function InitialSyncDialog({ localCount, remoteCount, onChoose, onCancel }) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);

  async function handleChoose(strategy) {
    setLoading(true);
    try {
      await onChoose(strategy);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-[#1c1b1f]" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-[#21005d] dark:text-[#e6e1e5] mb-2">
          {t('syncInitialTitle')}
        </h3>
        <div className="mb-6">
          <p className="text-sm text-[#4a4458] dark:text-[#c4c0cc]">
            {localCount} {t('syncInitialLocalCount')} · {remoteCount} {t('syncInitialRemoteCount')}
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <button
            className="w-full rounded-full bg-[#6750a4] py-3 text-sm font-medium text-white hover:bg-[#5a3799] disabled:opacity-50"
            disabled={loading}
            onClick={() => void handleChoose('merge')}
          >
            {t('syncInitialMerge')}
          </button>
          <button
            className="w-full rounded-full border border-[#79747e] py-3 text-sm font-medium text-[#6750a4] hover:bg-[#6750a4]/5 dark:text-[#d0bcff] disabled:opacity-50"
            disabled={loading}
            onClick={() => void handleChoose('local-source')}
          >
            {t('syncInitialLocalSource')}
          </button>
          <button
            className="w-full rounded-full border border-[#79747e] py-3 text-sm font-medium text-[#6750a4] hover:bg-[#6750a4]/5 dark:text-[#d0bcff] disabled:opacity-50"
            disabled={loading}
            onClick={() => void handleChoose('remote-source')}
          >
            {t('syncInitialRemoteSource')}
          </button>
          <button
            className="w-full rounded-full py-2 text-sm font-medium text-[#6750a4] hover:bg-[#6750a4]/5 dark:text-[#d0bcff] mt-2"
            disabled={loading}
            onClick={onCancel}
          >
            {t('cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
