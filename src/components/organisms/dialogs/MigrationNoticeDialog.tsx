// -- React Imports --
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import toast from 'react-hot-toast';

// -- Basic UI Imports --
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// -- Icon Imports --
import { Check, Download } from 'lucide-react';

// -- Data Layer Imports --
import { getLegacyDrawerForBackup } from '@/lib/drawer/runDrawerMigration';
import { getLegacyCharacterForBackup } from '@/lib/character/runCharacterMigration';
import { exportDrawer, exportCharacterSheet } from '@/lib/utils/export-import';



interface MigrationNoticeDialogProps {
   isOpen: boolean;
   /** Dismisses the notice (it is one-time; the caller does not reopen it). */
   onClose: () => void;
}

/**
 * One-time transparency notice shown immediately after a successful localStorage to
 * IndexedDB migration (drawer and/or active character).
 *
 * The migration is non-destructive: it copied the data into IndexedDB and the
 * original localStorage copy is retained as a safety backup. This dialog tells the
 * user that happened, reassures them nothing was lost, and offers an on-the-spot
 * export of that retained backup (the same legacy data the Settings, under the Danger Zone
 * cleanup would let them remove later). Purely informational; closing it does
 * nothing destructive.
 */
export function MigrationNoticeDialog({ isOpen, onClose }: MigrationNoticeDialogProps) {
   const { t } = useTranslation();
   const [exported, setExported] = useState(false);

   const handleExportOldData = async () => {
      const drawer = getLegacyDrawerForBackup();
      const character = getLegacyCharacterForBackup();
      if (!drawer && !character) {
         toast.error(t('MigrationNotice.exportFailed'));
         return;
      }
      try {
         if (drawer) await exportDrawer(drawer);
         if (character) await exportCharacterSheet(character);
         setExported(true);
         toast.success(t('MigrationNotice.exported'));
      } catch {
         toast.error(t('MigrationNotice.exportFailed'));
      }
   };

   return (
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>{t('MigrationNotice.title')}</DialogTitle>
               <DialogDescription>{t('MigrationNotice.description')}</DialogDescription>
            </DialogHeader>

            <DialogFooter className="gap-2 sm:gap-2">
               <Button variant="outline" onClick={handleExportOldData} className="cursor-pointer">
                  {exported ? <Check className="mr-2 h-4 w-4 text-primary" /> : <Download className="mr-2 h-4 w-4" />}
                  {exported ? t('Common.backupDownloaded') : t('MigrationNotice.exportButton')}
               </Button>
               <Button onClick={onClose} className="cursor-pointer">{t('MigrationNotice.dismissButton')}</Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}
