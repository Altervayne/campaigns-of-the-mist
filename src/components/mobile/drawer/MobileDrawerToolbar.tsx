// -- React Imports --
import type { ChangeEventHandler, CSSProperties, RefObject } from 'react';
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { IconButton } from '@/components/ui/icon-button';

// -- Icon Imports --
import { FolderPlus, List, Grid3x3, Download, Undo2, Redo2 } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { ACCEPT_DRAWER_IMPORT } from '@/lib/utils/fileAccept';



interface MobileDrawerToolbarProps {
   isLeftHanded: boolean;
   /** Horizontal slot reserved for the navigation FAB; undefined in bottom-tabs mode. */
   fabSlotStyle: CSSProperties | undefined;
   formRef: RefObject<HTMLFormElement | null>;
   fileInputRef: RefObject<HTMLInputElement | null>;
   onFileSelected: ChangeEventHandler<HTMLInputElement>;
   onAddFolder: () => void;
   isCompactView: boolean;
   onToggleView: () => void;
   canUndo: boolean;
   canRedo: boolean;
   onUndo: () => void;
   onRedo: () => void;
}

/**
 * Toolbar at bottom for thumb accessibility.
 * Bottom padding is set inline as `calc(0.5rem + env(safe-area-inset-bottom))`
 * rather than via the shared `pb-safe` utility: that utility is just the
 * safe-area inset on its own, which on non-notch devices resolves to 0
 * and overrides `py-2`'s bottom side, leaving the buttons flush to the
 * screen edge. The inline calc keeps a real 0.5rem base and adds the
 * safe-area inset on top, so the toolbar always has visible breathing
 * room. Top + horizontal padding stay on the `py-2 px-3` utility.
 */
export default function MobileDrawerToolbar({
   isLeftHanded,
   fabSlotStyle,
   formRef,
   fileInputRef,
   onFileSelected,
   onAddFolder,
   isCompactView,
   onToggleView,
   canUndo,
   canRedo,
   onUndo,
   onRedo,
}: MobileDrawerToolbarProps) {
   const { t } = useTranslation();

   return (
      <div
         data-tutorial="drawer-toolbar"
         className={cn(
            "flex items-center justify-between px-3 py-2 border-t border-border bg-card",
            isLeftHanded ? "flex-row-reverse" : ""
         )}
         style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))', ...fabSlotStyle }}
      >
         <div className={cn(
            "flex items-center gap-2",
            isLeftHanded ? "flex-row-reverse" : ""
         )}>
            {/* Add Folder (icon-only to keep the toolbar within a narrow viewport) */}
            <IconButton
               variant="outline"
               size="lg"
               onClick={onAddFolder}
               aria-label={t('Drawer.addFolder')}
               title={t('Drawer.addFolder')}
               className="cursor-pointer"
            >
               <FolderPlus className="w-5 h-5" />
            </IconButton>

            {/* Import */}
            <form ref={formRef} className="hidden">
               <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPT_DRAWER_IMPORT}
                  onChange={onFileSelected}
               />
            </form>
            <IconButton
               variant="outline"
               size="lg"
               onClick={() => fileInputRef.current?.click()}
               title={t('Drawer.Actions.import')}
               className="cursor-pointer"
            >
               <Download className="w-5 h-5" />
            </IconButton>

            {/* View toggle */}
            <IconButton
               data-tutorial="drawer-view-toggle"
               variant="outline"
               size="lg"
               onClick={onToggleView}
               title={isCompactView ? t('Drawer.toggleView') : t('Drawer.compactView')}
               className="cursor-pointer"
            >
               {isCompactView ? <Grid3x3 className="w-5 h-5" /> : <List className="w-5 h-5" />}
            </IconButton>
         </div>

         {/* Undo / Redo for drawer mutations (rename/move/delete/reorder/add) */}
         <div className={cn(
            "flex items-center gap-2",
            isLeftHanded ? "flex-row-reverse" : ""
         )}>
            <IconButton
               variant="outline"
               size="lg"
               onClick={onUndo}
               disabled={!canUndo}
               title={t('Toolbelt.undo')}
               aria-label={t('Toolbelt.undo')}
               className="cursor-pointer"
            >
               <Undo2 className="w-5 h-5" />
            </IconButton>
            <IconButton
               variant="outline"
               size="lg"
               onClick={onRedo}
               disabled={!canRedo}
               title={t('Toolbelt.redo')}
               aria-label={t('Toolbelt.redo')}
               className="cursor-pointer"
            >
               <Redo2 className="w-5 h-5" />
            </IconButton>
         </div>
      </div>
   );
}
