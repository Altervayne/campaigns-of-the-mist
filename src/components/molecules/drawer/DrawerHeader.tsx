// -- React Imports --
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';

// -- Icon Imports --
import { LayoutGrid, Rows, PanelRightClose } from 'lucide-react';

// -- Component Imports --
import { DrawerUndoRedoControls } from '@/components/molecules/DrawerUndoRedoControls';
import { DrawerSearchBar } from '@/components/molecules/drawer/DrawerSearchBar';

/*
 * The drawer's header, shared by the side panel AND the Expanded Library so the two can't drift and
 * expanding never jumps: a modest title, one right cluster (undo/redo + divider + view-toggle + mode +
 * close), then the full-width search. The ONLY per-surface difference is the MODE button - Expand in the
 * side panel, Contract in the Library - passed in. `children` hosts a secondary row (the side panel's
 * breadcrumb); the Library leaves it empty (its breadcrumb lives in the side-nav).
 */

interface DrawerHeaderProps {
   title: string;
   isCompactDrawer: boolean;
   onToggleView: () => void;
   /** The mode toggle: Expand (side panel) or Contract (Library) - the one thing that differs. */
   modeIcon: ReactNode;
   modeLabel: string;
   onMode: () => void;
   onClose: () => void;
   /** The roomy Library surface: lets the search's Filters panel use the width (multi-column). */
   wide?: boolean;
   children?: ReactNode;
}

export function DrawerHeader({ title, isCompactDrawer, onToggleView, modeIcon, modeLabel, onMode, onClose, wide = false, children }: DrawerHeaderProps) {
   const { t } = useTranslation();

   return (
      <header className="shrink-0 border-b-2 border-border px-4 py-2">
         <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{title}</h2>
            <div className="flex items-center gap-1">
               <DrawerUndoRedoControls compact />
               <div className="mx-1 h-6 w-px shrink-0 bg-border" />
               <div onClick={onToggleView} className="cursor-pointer rounded p-2 hover:bg-muted" role="button" aria-label={t('Drawer.toggleView')} title={t('Drawer.toggleView')} data-tutorial="drawer-rich-view-toggle">
                  {isCompactDrawer ? <LayoutGrid className="h-6 w-6" /> : <Rows className="h-6 w-6" />}
               </div>
               <div onClick={onMode} className="cursor-pointer rounded p-2 hover:bg-muted" role="button" aria-label={modeLabel} title={modeLabel} data-tutorial="drawer-expand">
                  {modeIcon}
               </div>
               <div onClick={onClose} className="cursor-pointer rounded p-2 hover:bg-muted" role="button" aria-label={t('Drawer.close')}>
                  <PanelRightClose className="h-6 w-6" />
               </div>
            </div>
         </div>

         <DrawerSearchBar wide={wide} />

         {children}
      </header>
   );
}
