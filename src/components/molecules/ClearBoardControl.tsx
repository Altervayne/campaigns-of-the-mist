// -- React Imports --
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { useStore } from 'zustand';
import toast from 'react-hot-toast';

// -- Icon Imports --
import { Eraser } from 'lucide-react';

// -- Component Imports --
import { SidebarButton } from './SidebarButton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

// -- Store and Hook Imports --
import { useActiveBoardInstance } from '@/lib/board/ActiveBoardStoreContext';

// -- Type Imports --
import type { BoardStore } from '@/lib/stores/boardStore';

/**
 * The sidebar's destructive "Clear Board" control: removes every item from the active board in one
 * undoable step (the board's name, viewport, and grid are kept), behind a confirm dialog. Disabled
 * on an empty board. Self-contained like {@link import('./BoardUndoRedoControls').BoardUndoRedoControls}
 * so it can subscribe to the active board store for the live item count.
 *
 * Outer/inner split: the board context hook returns `BoardStore | null` and `useStore` can't take
 * null, so the outer renders nothing without an active board (it only mounts under a board tab).
 */
export function ClearBoardControl({ isCollapsed }: { isCollapsed: boolean }) {
   const instance = useActiveBoardInstance();
   if (!instance) return null;
   return <ClearBoardControlInner store={instance} isCollapsed={isCollapsed} />;
}

function ClearBoardControlInner({ store, isCollapsed }: { store: BoardStore; isCollapsed: boolean }) {
   const { t } = useTranslation();
   const [isOpen, setIsOpen] = useState(false);
   const itemCount = useStore(store, (state) => Object.keys(state.items).length);

   const handleClear = () => {
      // One compound, undoable delete (it cascades connections), so Ctrl+Z brings everything back.
      const ids = Object.keys(store.getState().items);
      if (ids.length) void store.getState().actions.deleteItems(ids);
      toast.success(t('Notifications.board.cleared'));
      setIsOpen(false);
   };

   return (
      <>
         <SidebarButton variant="destructive" disabled={itemCount === 0} isCollapsed={isCollapsed} onClick={() => setIsOpen(true)} Icon={Eraser}>
            {t('CharacterSheetPage.SidebarMenu.clearBoard')}
         </SidebarButton>

         <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>{t('CharacterSheetPage.SidebarMenu.clearBoardConfirmTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>{t('CharacterSheetPage.SidebarMenu.clearBoardConfirmDescription')}</AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel className="cursor-pointer">{t('Common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer" onClick={handleClear}>{t('CharacterSheetPage.SidebarMenu.clearBoardConfirmButton')}</AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </>
   );
}
