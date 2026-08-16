// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Basic UI Imports --
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

/*
 * The unsaved-changes close-confirm for a tab (character or board). Closing deletes the
 * working record, so a DIRTY tab confirms first; a clean tab closes silently and never
 * opens this. There is no in-dialog save; the copy points the user at Save / Save As and
 * the only action here is to discard.
 */

interface CloseTabDialogProps {
   isOpen: boolean;
   onOpenChange: (isOpen: boolean) => void;
   /** The tab's display name, woven into the warning. */
   name: string;
   /** Closes the tab and discards it. */
   onConfirm: () => void;
}

/**
 * Renders the close-confirm dialog. Cancel keeps the tab open; the action discards via
 * {@link CloseTabDialogProps.onConfirm}.
 *
 * @param props - See {@link CloseTabDialogProps}.
 */
export function CloseTabDialog({ isOpen, onOpenChange, name, onConfirm }: CloseTabDialogProps) {
   const { t } = useTranslation();

   return (
      <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
         <AlertDialogContent>
            <AlertDialogHeader>
               <AlertDialogTitle>{t('Tabs.closeTabDialog.title')}</AlertDialogTitle>
               <AlertDialogDescription>{t('Tabs.closeTabDialog.description', { name })}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
               <AlertDialogCancel className="cursor-pointer">{t('Common.cancel')}</AlertDialogCancel>
               <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
                  onClick={onConfirm}
               >
                  {t('Tabs.closeTabDialog.closeWithoutSaving')}
               </AlertDialogAction>
            </AlertDialogFooter>
         </AlertDialogContent>
      </AlertDialog>
   );
}
