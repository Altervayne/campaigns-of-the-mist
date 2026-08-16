// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { LegacyBackupDialog } from '@/components/organisms/dialogs/LegacyBackupDialog';

// -- Character Data Layer Imports --
import { getLegacyCharacterForBackup, removeLegacyCharacterBlob } from '@/lib/character/runCharacterMigration';
import { exportCharacterSheet } from '@/lib/utils/export-import';



interface LegacyCharacterBackupDialogProps {
   isOpen: boolean;
   onOpenChange: (open: boolean) => void;
   /** Called after the legacy blob has been removed (so the opener can hide the action). */
   onRemoved: () => void;
}

/**
 * Character-domain wrapper around {@link LegacyBackupDialog}: supplies the active
 * character's safety-backup exporter (`exportCharacterSheet`), blob remover, and
 * i18n. Mirrors {@link import('./LegacyDrawerBackupDialog').LegacyDrawerBackupDialog}.
 */
export function LegacyCharacterBackupDialog({ isOpen, onOpenChange, onRemoved }: LegacyCharacterBackupDialogProps) {
   const { t } = useTranslation();

   const downloadBackup = (): boolean => {
      const character = getLegacyCharacterForBackup();
      if (!character) return false;
      try {
         // Legacy backups predate image cards (no asset references), so the now-async
         // export does no asset work; fire it and report the download was started.
         void exportCharacterSheet(character);
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
         removeBlob={removeLegacyCharacterBlob}
         title={t('SettingsDialog.legacyCharacterBackup.confirmTitle')}
         description={t('SettingsDialog.legacyCharacterBackup.confirmDescription')}
         downloadButtonLabel={t('Common.downloadBackup')}
         backupDownloadedLabel={t('Common.backupDownloaded')}
         confirmCheckboxLabel={t('Common.iUnderstandTheOld')}
         removeButtonLabel={t('Common.removeOldCopy')}
         cancelLabel={t('Common.cancel')}
         exportFailedMessage={t('Notifications.character.legacyBackupExportFailed')}
         downloadedMessage={t('Notifications.character.legacyBackupDownloaded')}
         removedMessage={t('Notifications.character.legacyBackupRemoved')}
         removeFailedMessage={t('Notifications.drawer.actionFailed')}
      />
   );
}
