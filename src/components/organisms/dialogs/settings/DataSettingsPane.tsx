// -- React Imports --
import { useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';

// -- Basic UI Imports --
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// -- Icon Imports --
import { AlertTriangle, Trash2, OctagonMinus, DatabaseBackup, HardDrive, Download, Upload } from 'lucide-react';

// -- Component Imports --
import { MigrationDialog } from '@/components/organisms/dialogs/MigrationDialog';
import { LegacyDrawerBackupDialog } from '@/components/organisms/dialogs/LegacyDrawerBackupDialog';
import { LegacyCharacterBackupDialog } from '@/components/organisms/dialogs/LegacyCharacterBackupDialog';

// -- Utils Imports --
import { ACCEPT_BACKUP_RESTORE } from '@/lib/utils/fileAccept';

// -- Store and Hook Imports --
import { useDataSettingsActions } from '@/hooks/useDataSettingsActions';



// ###################################
// ###   ALERT DIALOG COMPONENTS   ###
// ###################################

interface ConfirmationDialogProps {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   onConfirm: () => void;
   title: string;
   description: string;
   confirmationText: string;
   confirmButtonText: string;
}

function ConfirmationDialog({ open, onOpenChange, onConfirm, title, description, confirmationText, confirmButtonText }: ConfirmationDialogProps) {
   const { t } = useTranslation();
   const [input, setInput] = useState("");

   const handleOpenChange = (isOpen: boolean) => {
      onOpenChange(isOpen);
      if (!isOpen) {
         setInput("");
      }
   };

   return (
      <AlertDialog open={open} onOpenChange={handleOpenChange}>
         <AlertDialogContent className="border-2 border-dashed border-destructive">
            <AlertDialogHeader>
               <div className="flex items-center gap-2">
                  <AlertTriangle className="h-6 w-6 text-destructive shrink-0" />
                  <AlertDialogTitle>{title}</AlertDialogTitle>
               </div>
               <AlertDialogDescription>
                  {description}
                  <p className="mt-2 text-foreground">
                     {t('SettingsDialog.dangerZone.resetDialog.confirmationPrompt')} <strong className="text-destructive"></strong>
                  </p>
                  <p className="w-full mt-1 text-center text-sm font-bold text-destructive">{confirmationText}</p>
               </AlertDialogDescription>
            </AlertDialogHeader>
            <Input
               value={input}
               onChange={(e) => setInput(e.target.value)}
               placeholder={confirmationText}
               className="border-foreground/50"
            />
            <AlertDialogFooter>
               <AlertDialogCancel className="cursor-pointer">{t('SettingsDialog.dangerZone.resetDialog.cancel')}</AlertDialogCancel>
               <AlertDialogAction
                  onClick={onConfirm}
                  disabled={input !== confirmationText}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
               >
                  {confirmButtonText}
               </AlertDialogAction>
            </AlertDialogFooter>
         </AlertDialogContent>
      </AlertDialog>
   );
}



// #############################
// ###   DATA & STORAGE PANE ###
// #############################

/** The Data and storage section: storage usage + reclaim, legacy migration, and the fenced Danger Zone. */
export function DataSettingsPane() {
   const { t } = useTranslation();

   const {
      isResetAppDialogOpen, setIsResetAppDialogOpen,
      isDeleteDrawerDialogOpen, setIsDeleteDrawerDialogOpen,
      handleAppReset, handleDeleteDrawer,
      handleExportBackup, handleRestoreBackupFile, handleConfirmRestore,
      isRestoreBackupDialogOpen, setIsRestoreBackupDialogOpen,
      isMigrationDialogOpen, setIsMigrationDialogOpen,
      isLegacyBackupDialogOpen, setIsLegacyBackupDialogOpen,
      isLegacyCharacterBackupDialogOpen, setIsLegacyCharacterBackupDialogOpen,
      legacyBlobRemovable, refreshLegacyBlobRemovable,
      legacyCharacterRemovable, refreshLegacyCharacterRemovable,
      storageUsageBytes, isReclaiming, formatMegabytes, handleReclaimImageSpace,
   } = useDataSettingsActions();

   // Hidden picker for the restore flow; resetting its value lets the same file be re-picked.
   const restoreInputRef = useRef<HTMLInputElement>(null);
   const onRestoreFileChange = (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) void handleRestoreBackupFile(file);
      event.target.value = '';
   };

   return (
      <>
         <div className="grid gap-6">
            <div className="grid grid-cols-3 items-center gap-4">
               <Label className="text-left">{t('SettingsDialog.storage.label')}</Label>
               <div className="col-span-2 flex items-center gap-2">
                  <span className="flex-1 min-w-0 truncate text-sm text-muted-foreground">
                     {storageUsageBytes === null
                        ? t('SettingsDialog.storage.usageUnavailable')
                        : t('SettingsDialog.storage.usageUsed', { mb: formatMegabytes(storageUsageBytes) })}
                  </span>
                  <Button
                     variant="outline"
                     onClick={handleReclaimImageSpace}
                     disabled={isReclaiming}
                     title={t('SettingsDialog.storage.reclaimButton')}
                     className="cursor-pointer min-w-0"
                  >
                     <HardDrive className="mr-2 h-4 w-4 shrink-0" />
                     <span className="truncate">{t('SettingsDialog.storage.reclaimButton')}</span>
                  </Button>
               </div>
            </div>

            <div className="grid grid-cols-3 items-start gap-4">
               <Label className="text-left mt-2">{t('SettingsDialog.backup.label')}</Label>
               <div className="col-span-2 flex flex-col gap-2">
                  <Button onClick={handleExportBackup} title={t('SettingsDialog.backup.exportButton')} className="cursor-pointer min-w-0 justify-start">
                     <Download className="mr-2 h-4 w-4 shrink-0" />
                     <span className="truncate">{t('SettingsDialog.backup.exportButton')}</span>
                  </Button>
                  <Button variant="outline" onClick={() => restoreInputRef.current?.click()} title={t('Common.restoreFromBackup')} className="cursor-pointer min-w-0 justify-start">
                     <Upload className="mr-2 h-4 w-4 shrink-0" />
                     <span className="truncate">{t('Common.restoreFromBackup')}</span>
                  </Button>
                  <p className="text-xs text-muted-foreground">{t('SettingsDialog.backup.description')}</p>
                  <input ref={restoreInputRef} type="file" accept={ACCEPT_BACKUP_RESTORE} onChange={onRestoreFileChange} className="hidden" />
               </div>
            </div>

            <div className="grid grid-cols-3 items-center gap-4">
               <Label className="text-left">{t('SettingsDialog.migration.label')}</Label>
               <Button onClick={() => setIsMigrationDialogOpen(true)} title={t('SettingsDialog.migration.button')} className="col-span-2 cursor-pointer min-w-0">
                  <DatabaseBackup className="mr-2 h-4 w-4 shrink-0" />
                  <span className="truncate">{t('SettingsDialog.migration.button')}</span>
               </Button>
            </div>

            {/* Danger Zone: fenced at the bottom of the section - a destructive-tinted block, walled off so it
                never sits inline with the everyday controls above it. */}
            <div className="space-y-4 rounded-lg border-2 border-destructive bg-destructive/5 p-4">
               <div className="flex items-center gap-4">
                  <AlertTriangle className="h-6 w-6 text-destructive shrink-0" />
                  <div>
                     <h3 className="font-semibold">{t('SettingsDialog.dangerZone.title')}</h3>
                     <p className="text-sm text-muted-foreground">{t('SettingsDialog.dangerZone.description')}</p>
                  </div>
               </div>

               <div className="flex gap-2">
                  <Button
                     variant="destructive"
                     className="cursor-pointer flex-1 min-w-0"
                     onClick={() => setIsDeleteDrawerDialogOpen(true)}
                     title={t('SettingsDialog.dangerZone.deleteDrawerButton')}
                  >
                     <Trash2 className="mr-2 h-4 w-4 shrink-0" />
                     <span className="truncate">{t('SettingsDialog.dangerZone.deleteDrawerButton')}</span>
                  </Button>
                  <Button
                     variant="destructive"
                     className="cursor-pointer flex-1 min-w-0"
                     onClick={() => setIsResetAppDialogOpen(true)}
                     title={t('SettingsDialog.dangerZone.resetButton')}
                  >
                     <OctagonMinus className="mr-2 h-4 w-4 shrink-0" />
                     <span className="truncate">{t('SettingsDialog.dangerZone.resetButton')}</span>
                  </Button>
               </div>

               {/* Legacy backup cleanup - only shown once the migration is
                   verified faithful and the blob is still present. Removing it
                   is gated on a backup export + explicit confirm in the dialog. */}
               {legacyBlobRemovable && (
                  <Button
                     variant="outline"
                     className="cursor-pointer w-full min-w-0"
                     onClick={() => setIsLegacyBackupDialogOpen(true)}
                     title={t('SettingsDialog.legacyBackup.actionLabel')}
                  >
                     <span className="truncate">{t('SettingsDialog.legacyBackup.actionLabel')}</span>
                  </Button>
               )}

               {legacyCharacterRemovable && (
                  <Button
                     variant="outline"
                     className="cursor-pointer w-full min-w-0"
                     onClick={() => setIsLegacyCharacterBackupDialogOpen(true)}
                     title={t('SettingsDialog.legacyCharacterBackup.actionLabel')}
                  >
                     <span className="truncate">{t('SettingsDialog.legacyCharacterBackup.actionLabel')}</span>
                  </Button>
               )}
            </div>
         </div>

         <MigrationDialog
            isOpen={isMigrationDialogOpen}
            onOpenChange={setIsMigrationDialogOpen}
         />

         <LegacyDrawerBackupDialog
            isOpen={isLegacyBackupDialogOpen}
            onOpenChange={setIsLegacyBackupDialogOpen}
            onRemoved={refreshLegacyBlobRemovable}
         />

         <LegacyCharacterBackupDialog
            isOpen={isLegacyCharacterBackupDialogOpen}
            onOpenChange={setIsLegacyCharacterBackupDialogOpen}
            onRemoved={refreshLegacyCharacterRemovable}
         />

         <ConfirmationDialog
            open={isDeleteDrawerDialogOpen}
            onOpenChange={setIsDeleteDrawerDialogOpen}
            onConfirm={handleDeleteDrawer}
            title={t('SettingsDialog.dangerZone.deleteDrawerDialog.title')}
            description={t('SettingsDialog.dangerZone.deleteDrawerDialog.description')}
            confirmationText="DELETE DRAWER"
            confirmButtonText={t('SettingsDialog.dangerZone.deleteDrawerDialog.confirm')}
         />

         <ConfirmationDialog
            open={isRestoreBackupDialogOpen}
            onOpenChange={setIsRestoreBackupDialogOpen}
            onConfirm={handleConfirmRestore}
            title={t('Common.restoreFromBackup')}
            description={t('SettingsDialog.backup.restoreDialog.description')}
            confirmationText="REPLACE ALL MY DATA"
            confirmButtonText={t('SettingsDialog.backup.restoreDialog.confirm')}
         />

         <ConfirmationDialog
            open={isResetAppDialogOpen}
            onOpenChange={setIsResetAppDialogOpen}
            onConfirm={handleAppReset}
            title={t('SettingsDialog.dangerZone.resetDialog.title')}
            description={t('SettingsDialog.dangerZone.resetDialog.description')}
            confirmationText="DELETE ALL MY APP DATA"
            confirmButtonText={t('SettingsDialog.dangerZone.resetDialog.confirm')}
         />
      </>
   );
}
