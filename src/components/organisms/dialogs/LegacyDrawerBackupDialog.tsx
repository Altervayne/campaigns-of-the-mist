// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { LegacyBackupDialog } from '@/components/organisms/dialogs/LegacyBackupDialog';

// -- Drawer Data Layer Imports --
import { getLegacyDrawerForBackup, removeLegacyDrawerBlob } from '@/lib/drawer/runDrawerMigration';
import { exportDrawer } from '@/lib/utils/export-import';



interface LegacyDrawerBackupDialogProps {
   isOpen: boolean;
   onOpenChange: (open: boolean) => void;
   /** Called after the legacy blob has been removed (so the opener can hide the action). */
   onRemoved: () => void;
}

/**
 * Drawer-domain wrapper around {@link LegacyBackupDialog}: supplies the drawer's
 * safety-backup exporter, blob remover, and i18n. Behaviour is unchanged from the
 * original dedicated dialog.
 */
export function LegacyDrawerBackupDialog({ isOpen, onOpenChange, onRemoved }: LegacyDrawerBackupDialogProps) {
   const { t } = useTranslation();

   const downloadBackup = (): boolean => {
      const drawer = getLegacyDrawerForBackup();
      if (!drawer) return false;
      try {
         // Legacy backups predate image cards (no asset references), so the now-async
         // export does no asset work; fire it and report the download was started.
         void exportDrawer(drawer);
         return true;
      } catch {
         return false;
      }
   };

   return (
      <LegacyBackupDialog
         isOpen={isOpen}
         onOpenChange={onOpenChange}
         onRemoved={onRemoved}
         downloadBackup={downloadBackup}
         removeBlob={removeLegacyDrawerBlob}
         title={t('SettingsDialog.legacyBackup.confirmTitle')}
         description={t('SettingsDialog.legacyBackup.confirmDescription')}
         downloadButtonLabel={t('Common.downloadBackup')}
         backupDownloadedLabel={t('Common.backupDownloaded')}
         confirmCheckboxLabel={t('Common.iUnderstandTheOld')}
         removeButtonLabel={t('Common.removeOldCopy')}
         cancelLabel={t('Common.cancel')}
         exportFailedMessage={t('Notifications.drawer.legacyBackupExportFailed')}
         downloadedMessage={t('Notifications.drawer.legacyBackupDownloaded')}
         removedMessage={t('Notifications.drawer.legacyBackupRemoved')}
         removeFailedMessage={t('Notifications.drawer.actionFailed')}
      />
   );
}
