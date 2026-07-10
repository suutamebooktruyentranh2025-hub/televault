import { useI18n } from '../context/I18nContext';
import { IconDriveLogo } from '../components/DriveIcons';
import { UploadActivityPanel } from '../components/UploadActivityPanel';
import { useTransfers } from '../hooks/useTransfers';

export function SyncingScreen({ scannedCount }) {
  const { t } = useI18n();
  const transfers = useTransfers();
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--gd-bg)] px-6">
      <IconDriveLogo className="h-12 w-12" />
      <p className="text-lg font-normal text-[var(--gd-text)]">{t('syncingTitle')}</p>
      <p className="text-sm text-[var(--gd-text-secondary)]">{t('syncingProgress', { n: scannedCount })}</p>
      <UploadActivityPanel
        tasks={transfers.tasks}
        onClearFinished={() => void transfers.clearFinished()}
        onCancel={(id) => void transfers.cancel(id)}
      />
    </div>
  );
}
