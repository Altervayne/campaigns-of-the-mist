// -- React Imports --
import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import toast from 'react-hot-toast';

// -- Hook Imports --
import { useFileDrop } from '@/hooks/useFileDrop';

// -- Basic UI Imports --
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// -- Icon Imports --
import { HardDriveUpload, File, X, Heart } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { transformLegacyCharacter } from '@/lib/utils/migration';

// -- Store and Hook Imports --
import { useDrawerActions } from '@/lib/stores/drawerStore';
import { getFolderChildren } from '@/lib/drawer/drawerRepository';



interface MigrationDialogProps {
   isOpen: boolean;
   onOpenChange: (isOpen: boolean) => void;
}



export const MigrationDialog: React.FC<MigrationDialogProps> = ({ isOpen, onOpenChange }) => {
   const { t: t } = useTranslation();
   const { t: tNotifications } = useTranslation();
   const [files, setFiles] = useState<File[]>([]);

   const { addFolder, addItem } = useDrawerActions();

   const appendFiles = useCallback((acceptedFiles: File[]) => {
      setFiles(prevFiles => {
         const newFiles = acceptedFiles.filter(
            (newFile) => !prevFiles.some(
               (existingFile) => existingFile.name === newFile.name && existingFile.size === newFile.size
            )
         );
         return [...prevFiles, ...newFiles];
      });
   }, []);

   // The one import site with click-to-open + multi-select: the dashed box opens the picker and takes drops.
   // Plain 1.x character exports, not `.cotm` envelopes, so this keeps its own `accept` rather than a shared one.
   const { getRootProps, getInputProps, isDragActive } = useFileDrop({
      onFiles: appendFiles,
      accept: '.json',
      multiple: true,
      noClick: false,
   });

   const handleRemoveFile = (fileToRemove: File) => {
      setFiles(prevFiles => prevFiles.filter(file => file !== fileToRemove));
   };



   // Find a same-named child folder of `parentId` (null = root), or create one and
   // return its id. The async store action returns the created id directly, so the
   // old subscribe-and-poll id-discovery dance is gone.
   const getOrCreateFolder = async (name: string, parentId?: string): Promise<string> => {
      const { folders } = await getFolderChildren(parentId ?? null);
      const existingFolder = folders.find(folder => folder.name === name);
      if (existingFolder) return existingFolder.id;
      return addFolder(name, parentId);
   };



   const handleMigrate = async () => {
      if (files.length === 0) return;
      let successCount = 0;

      try {
         const migrationRootFolderId = await getOrCreateFolder("MIGRATION");

         const migrationPromises = files.map(async (file) => {
            try {
               const fileContent = await file.text();
               const legacyData = JSON.parse(fileContent);

               const { character, deconstructedCards, deconstructedTrackers } = transformLegacyCharacter(legacyData);

               const today = new Date().toISOString().split('MigrationDialog.T')[0];
               const characterFolderName = `${character.name} - ${today}`;
               const characterFolderId = await getOrCreateFolder(characterFolderName, migrationRootFolderId);

               await addItem(character.name, character.game, 'FULL_CHARACTER_SHEET', character, characterFolderId);

               if (deconstructedCards.length > 0) {
                  const cardsFolderId = await getOrCreateFolder("Cards", characterFolderId);
                  for (const card of deconstructedCards) {
                     await addItem(card.title, character.game, card.cardType, card, cardsFolderId);
                  }
               }

               if (deconstructedTrackers.length > 0) {
                  const trackersFolderId = await getOrCreateFolder("Trackers", characterFolderId);
                  for (const tracker of deconstructedTrackers) {
                     await addItem(tracker.name, character.game, 'STATUS_TRACKER', tracker, trackersFolderId);
                  }
               }

               successCount++;
            } catch (error: unknown) {
               if (error instanceof Error && error.message === 'UNSUPPORTED_GAME_SYSTEM') {
                  toast.error(tNotifications('Notifications.migration.unsupported'));
               } else {
                  toast.error(tNotifications('Notifications.migration.failed'));
               }
               console.error(`Failed to migrate ${file.name}:`, error);
            }
        });

        await Promise.all(migrationPromises);

        if (successCount > 0) {
            toast.success(tNotifications('Notifications.migration.success'));
        }
      } catch (error: unknown) {
         toast.error(tNotifications('Notifications.migration.folderError'));
         console.error("Migration failed:", error);
      }

      setFiles([]);
      onOpenChange(false);
   };

   const handleOpenChange = (open: boolean) => {
      if (!open) {
         setFiles([]);
      }
      onOpenChange(open);
   };



   return (
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>{t('MigrationDialog.title')}</DialogTitle>
               <DialogDescription>{t('MigrationDialog.description')}</DialogDescription>
            </DialogHeader>

            <div className="flex flex-col p-4 bg-muted/50 rounded-md mt-4">
               <DialogDescription>{t('MigrationDialog.thankYou')}</DialogDescription>
               <span className="flex items-center p-1 gap-2 mt-1">
                  <p className="w-full text-end">{`- Altervayne²`}</p>
                  <Heart/>
               </span>
            </div>

            <div className="py-4 space-y-3">
               <div
                  {...getRootProps()}
                  className={cn(
                     "flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-md cursor-pointer transition-colors",
                     {
                        "border-primary bg-muted": isDragActive,
                        "border-border hover:border-primary/50": !isDragActive,
                     }
                  )}
               >
                  <input {...getInputProps()} />
                  <HardDriveUpload className="h-10 w-10 text-muted-foreground mb-2" />
                  <p className="text-center">
                     {isDragActive ? t('MigrationDialog.dropzone.active') : t('MigrationDialog.dropzone.inactive')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{t('MigrationDialog.dropzone.fileTypes')}</p>
               </div>

               {files.length > 0 && (
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-2">
                     {files.map((file, index) => (
                        <div key={`${file.name}-${index}`} className="flex items-center justify-between p-2 rounded-md border">
                           <div className="flex items-center gap-2 overflow-hidden">
                           <File className="h-5 w-5 shrink-0" />
                           <span className="font-mono text-sm truncate" title={file.name}>{file.name}</span>
                           </div>
                           <Button variant="ghost" size="icon" title={t('MigrationDialog.removeFile')} onClick={() => handleRemoveFile(file)}>
                           <X className="h-4 w-4" />
                           </Button>
                        </div>
                     ))}
                  </div>
               )}
            </div>

            <DialogFooter>
               <Button variant="ghost" onClick={() => handleOpenChange(false)} title={t('MigrationDialog.cancel')} className="cursor-pointer">{t('MigrationDialog.cancel')}</Button>
               <Button onClick={handleMigrate} disabled={files.length === 0} title={t('MigrationDialog.migrateButton')} className="cursor-pointer">{t('MigrationDialog.migrateButton')}</Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
};