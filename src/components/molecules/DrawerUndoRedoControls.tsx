// -- React Imports--
import { useTranslation } from 'react-i18next';

// -- Basic UI Imports --
import { Button } from '@/components/ui/button';

// -- Icon Imports --
import { Undo, Redo } from 'lucide-react';

// -- Store and Hook Imports --
import { useDrawerUndoRedo } from '@/hooks/drawer/useDrawerUndoRedo';



/**
 * Undo / redo for the drawer's command engine. `compact` renders an icon-only pair that matches the
 * header's other icon buttons (for the tidy control cluster); the default is the labelled outline pair.
 */
export function DrawerUndoRedoControls({ compact = false }: { compact?: boolean }) {
   const { t: t } = useTranslation();
   const { canUndo, canRedo, undo, redo } = useDrawerUndoRedo();

   if (compact) {
      // Same look as the view/expand/close icon buttons (rounded p-2 hover:bg-muted, h-6 icons); native
      // buttons so disabled state reads correctly when there's nothing to undo/redo.
      const iconButton = 'rounded p-2 hover:bg-muted cursor-pointer disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent';
      return (
         <div data-tutorial="drawer-undo-redo-buttons" className="flex items-center">
            <button type="button" onClick={() => { void undo(); }} disabled={!canUndo} aria-label={t('Actions.undo')} title={t('Actions.undo')} className={iconButton}>
               <Undo className="h-6 w-6" />
            </button>
            <button type="button" onClick={() => { void redo(); }} disabled={!canRedo} aria-label={t('Actions.redo')} title={t('Actions.redo')} className={iconButton}>
               <Redo className="h-6 w-6" />
            </button>
         </div>
      );
   }

   return (
      <div data-tutorial="drawer-undo-redo-buttons" className="flex items-center gap-2 justify-evenly max-w-50">
         <Button
            variant="outline"
            size="sm"
            onClick={() => { void undo(); }}
            disabled={!canUndo}
            aria-label={t('Actions.undo')}
            title={t('Actions.undo')}
            className={ canUndo ? "cursor-pointer flex-1 min-w-0" : "flex-1 min-w-0" }
         >
            <Undo className="h-4 w-4 mr-1 shrink-0" />
            <span className="truncate">{t('Actions.undo')}</span>
         </Button>
         <Button
            variant="outline"
            size="sm"
            onClick={() => { void redo(); }}
            disabled={!canRedo}
            aria-label={t('Actions.redo')}
            title={t('Actions.redo')}
            className={ canRedo ? "cursor-pointer flex-1 min-w-0" : "flex-1 min-w-0" }
         >
            <span className="truncate">{t('Actions.redo')}</span>
            <Redo className="h-4 w-4 ml-1 shrink-0" />
         </Button>
      </div>
   );
}