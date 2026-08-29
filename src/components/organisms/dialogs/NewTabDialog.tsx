// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Basic UI Imports --
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// -- Component Imports --
import { TabTypeChooser } from '@/components/molecules/TabTypeChooser';

/*
 * The New Tab dialog: the shared {@link TabTypeChooser} in a dialog shell. A choice (a character
 * sheet by game, or a board) creates + activates the tab and closes the dialog.
 */

interface NewTabDialogProps {
   isOpen: boolean;
   onOpenChange: (isOpen: boolean) => void;
}

/**
 * Renders the New Tab dialog. Any choice in the chooser creates and activates the
 * new tab, then closes the dialog.
 *
 * @param props.isOpen - Whether the dialog is open.
 * @param props.onOpenChange - Open-state setter (closes on a choice or dismiss).
 */
export function NewTabDialog({ isOpen, onOpenChange }: NewTabDialogProps) {
   const { t } = useTranslation();

   return (
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
         {/* Wide enough for the three full-size character cards across + the two-up workspace cards. */}
         <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
               <DialogTitle>{t('Tabs.newTabDialog.title')}</DialogTitle>
               <DialogDescription>{t('Tabs.newTabDialog.description')}</DialogDescription>
            </DialogHeader>

            {/* Two workspace rows can outgrow a short viewport, so the body scrolls rather than overflowing. */}
            <div className="max-h-[70vh] overflow-y-auto py-2">
               <TabTypeChooser onChoose={() => onOpenChange(false)} />
            </div>
         </DialogContent>
      </Dialog>
   );
}
