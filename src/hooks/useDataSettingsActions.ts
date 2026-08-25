// -- React Imports --
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import toast from 'react-hot-toast';

// -- Store and Hook Imports --
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';
import { clearAllCharacterData } from '@/lib/character/characterRepository';
import { clearAllAssets } from '@/lib/assets/assetRepository';
import { clearAllStencils } from '@/lib/assets/stencilRepository';
import { clearAllBoards } from '@/lib/board/boardRepository';
import { clearAllNotes } from '@/lib/notes/noteRepository';
import { clearAllPdfs } from '@/lib/pdf/pdfRepository';
import { clearAllPdfAssets } from '@/lib/pdf/pdfAssetRepository';
import { runSweep, estimateStorageUsage } from '@/lib/assets/assetGarbageCollector';
import { runPdfSweep } from '@/lib/pdf/pdfGarbageCollector';
import { clearWorkspace } from '@/lib/character/workspaceSession';
import { clearAllDrawerData } from '@/lib/drawer/drawerRepository';
import { drawerCommandEngine } from '@/lib/drawer/drawerCommandEngine';
import { getLegacyBlobRemovalState } from '@/lib/drawer/runDrawerMigration';
import { getCharacterLegacyBlobRemovalState } from '@/lib/character/runCharacterMigration';
import { useLegacyBlobRemovable } from '@/hooks/useLegacyBlobRemovable';
import { exportFullBackup, parseFullBackup, applyFullBackup, type FullBackupFile } from '@/lib/backup/fullBackup';
import { readFileAsText } from '@/lib/utils/export-import';

/*
 * The shared Data & Storage logic behind both the desktop pane and the mobile Data screen: the destructive
 * reset/delete handlers, the migration + legacy-backup dialog wiring, and the storage usage + reclaim readout.
 * One home so the two surfaces can never drift on what "reset" or "delete drawer" actually clears.
 */
export function useDataSettingsActions() {
   const { t } = useTranslation();

   const [isResetAppDialogOpen, setIsResetAppDialogOpen] = useState(false);
   const [isDeleteDrawerDialogOpen, setIsDeleteDrawerDialogOpen] = useState(false);
   const [isRestoreBackupDialogOpen, setIsRestoreBackupDialogOpen] = useState(false);
   // The parsed, validated backup staged between the file pick and the hard confirm; applied on confirm.
   const [pendingBackup, setPendingBackup] = useState<FullBackupFile | null>(null);
   const [isMigrationDialogOpen, setIsMigrationDialogOpen] = useState(false);
   const [isLegacyBackupDialogOpen, setIsLegacyBackupDialogOpen] = useState(false);
   const [isLegacyCharacterBackupDialogOpen, setIsLegacyCharacterBackupDialogOpen] = useState(false);
   const { removable: legacyBlobRemovable, refresh: refreshLegacyBlobRemovable } = useLegacyBlobRemovable(getLegacyBlobRemovalState);
   const { removable: legacyCharacterRemovable, refresh: refreshLegacyCharacterRemovable } = useLegacyBlobRemovable(getCharacterLegacyBlobRemovalState);

   const handleAppReset = async () => {
      await clearAllCharacterData();
      await clearAllAssets();
      await clearAllStencils();
      await clearAllBoards();
      await clearAllNotes();
      await clearAllPdfs();
      await clearAllPdfAssets();
      clearWorkspace();
      await clearAllDrawerData();
      drawerCommandEngine.clear();
      useAppSettingsStore.persist.clearStorage();
      setTimeout(() => window.location.reload(), 500);
      toast.success(t('Notifications.general.appReset'));
   };

   const handleDeleteDrawer = async () => {
      await clearAllDrawerData();
      drawerCommandEngine.clear();
      setTimeout(() => window.location.reload(), 500);
      toast.success(t('Notifications.drawer.deleted'));
   };

   const handleExportBackup = async () => {
      try {
         await exportFullBackup();
         toast.success(t('Notifications.backup.exported'));
      } catch {
         toast.error(t('Notifications.backup.exportFailed'));
      }
   };

   // Restore is gated: parse + validate the picked file, then stage it behind the hard confirm below.
   const handleRestoreBackupFile = async (file: File) => {
      try {
         const backup = parseFullBackup(await readFileAsText(file));
         setPendingBackup(backup);
         setIsRestoreBackupDialogOpen(true);
      } catch {
         toast.error(t('Notifications.backup.invalidFile'));
      }
   };

   const handleConfirmRestore = async () => {
      if (!pendingBackup) return;
      setIsRestoreBackupDialogOpen(false);
      try {
         await applyFullBackup(pendingBackup);
         drawerCommandEngine.clear();
         setTimeout(() => window.location.reload(), 500);
      } catch {
         toast.error(t('Notifications.backup.restoreFailed'));
      }
   };

   // Storage usage + reclaim (asset GC). `null` means the estimate API is unavailable; the readout shows "unavailable".
   const [storageUsageBytes, setStorageUsageBytes] = useState<number | null>(null);
   const [isReclaiming, setIsReclaiming] = useState(false);

   // Refresh the usage readout when the consuming screen mounts.
   useEffect(() => {
      let active = true;
      void estimateStorageUsage().then((usage) => {
         if (active) setStorageUsageBytes(usage);
      });
      return () => { active = false; };
   }, []);

   const formatMegabytes = (bytes: number): string => (bytes / (1024 * 1024)).toFixed(1);

   const handleReclaimImageSpace = async () => {
      setIsReclaiming(true);
      try {
         // Reclaim images and PDFs together: two parallel collectors, one combined readout.
         const [images, pdfs] = await Promise.all([runSweep('manual'), runPdfSweep('manual')]);
         const deleted = images.deleted + pdfs.deleted;
         const reclaimedBytes = images.reclaimedBytes + pdfs.reclaimedBytes;
         setStorageUsageBytes(await estimateStorageUsage());
         if (deleted > 0) {
            toast.success(t('SettingsDialog.storage.reclaimed', { count: deleted, mb: formatMegabytes(reclaimedBytes) }));
         } else {
            toast(t('SettingsDialog.storage.nothing'));
         }
      } catch {
         toast.error(t('SettingsDialog.storage.failed'));
      } finally {
         setIsReclaiming(false);
      }
   };

   return {
      // Destructive confirm dialogs
      isResetAppDialogOpen,
      setIsResetAppDialogOpen,
      isDeleteDrawerDialogOpen,
      setIsDeleteDrawerDialogOpen,
      handleAppReset,
      handleDeleteDrawer,
      // Full backup / restore
      handleExportBackup,
      handleRestoreBackupFile,
      handleConfirmRestore,
      isRestoreBackupDialogOpen,
      setIsRestoreBackupDialogOpen,
      // Migration + legacy backups
      isMigrationDialogOpen,
      setIsMigrationDialogOpen,
      isLegacyBackupDialogOpen,
      setIsLegacyBackupDialogOpen,
      isLegacyCharacterBackupDialogOpen,
      setIsLegacyCharacterBackupDialogOpen,
      legacyBlobRemovable,
      refreshLegacyBlobRemovable,
      legacyCharacterRemovable,
      refreshLegacyCharacterRemovable,
      // Storage usage + reclaim
      storageUsageBytes,
      isReclaiming,
      formatMegabytes,
      handleReclaimImageSpace,
   };
}
