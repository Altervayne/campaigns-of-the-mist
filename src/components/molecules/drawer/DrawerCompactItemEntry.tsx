// -- React Imports --
import React from 'react';
import { useTranslation } from 'react-i18next';

// -- DnD Component Imports --
import { Sortable, DragStaticWrapper } from '@/components/dnd';

// -- Basic UI Imports --
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

// -- Icon Imports --
import { MoreHorizontal, Pencil, Trash2, Move, Upload, Highlighter } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { canExportPdfMarkup, exportDrawerItem, exportDrawerItemMarkup } from '@/lib/drawer/exportDrawerItem';
import { DRAG_TYPES } from '@/lib/constants/dragDrop';

// -- Hook Imports --
import { useDrawerRowReveal } from '@/hooks/drawer/useDrawerRowReveal';

// -- Component Imports --
import { DrawerListRow, DrawerListRowFrame } from '@/components/molecules/drawer/DrawerListRow';
import { DRAWER_MENU_TRIGGER_CLASS } from '@/components/molecules/drawer/drawerMenuTrigger';
import { drawerItemCardTypeClass } from '@/lib/theme/drawerItemCardTypeClass';

// -- Type Imports --
import type { DrawerItem } from '@/lib/types/drawer';

export function DrawerCompactItemEntry({ item, parentFolderId, onRename, onDelete, onMove, isPreview = false }: { item: DrawerItem & { createdAt?: number; updatedAt?: number }, parentFolderId?: string | null, onRename?: () => void, onDelete?: () => void, onMove?: () => void, isPreview?: boolean }) {
   const { t } = useTranslation();
   const { ref: revealRef, isRevealed } = useDrawerRowReveal(item.id);
   // Right-click opens the row's actions menu, matching the rich card.
   const [menuOpen, setMenuOpen] = React.useState(false);

   const handleExport = async (e: React.MouseEvent) => {
      e.stopPropagation();
      await exportDrawerItem(item, t);
   };

   const handleExportMarkup = (e: React.MouseEvent) => {
      e.stopPropagation();
      exportDrawerItemMarkup(item, t);
   };

   return (
      <Sortable
         id={item.id}
         data={{ type: DRAG_TYPES.DRAWER_ITEM, item, parentFolderId: parentFolderId ?? null, isDrawer: true }}
         disabled={isPreview}
      >
         {({ dragAttributes, dragListeners, isBeingDragged }) => (
            <DragStaticWrapper isBeingDragged={isBeingDragged}>
               <DrawerListRowFrame
                  containerRef={revealRef}
                  className={cn(isPreview && 'border-2 border-border bg-muted/50', isRevealed && 'motion-safe:animate-drawer-reveal')}
                  onContextMenu={!isPreview ? (e) => { e.preventDefault(); setMenuOpen(true); } : undefined}
                  menu={!isPreview &&
                     <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()} className="cursor-pointer">
                           <Button variant="ghost" size="icon" className={`h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100 ${DRAWER_MENU_TRIGGER_CLASS}`}>
                              <MoreHorizontal className="h-4 w-4" />
                           </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
                           <DropdownMenuItem onClick={onRename} className="cursor-pointer"><Pencil className="mr-2 h-4 w-4" /><span>{t('Drawer.Actions.rename')}</span></DropdownMenuItem>
                           <DropdownMenuItem onClick={onMove} className="cursor-pointer"><Move className="mr-2 h-4 w-4" /><span>{t('Common.move')}</span></DropdownMenuItem>
                           <DropdownMenuItem onClick={handleExport} className="cursor-pointer"><Upload className="mr-2 h-4 w-4" /><span>{t('Drawer.Actions.export')}</span></DropdownMenuItem>
                           {canExportPdfMarkup(item) && (
                              <DropdownMenuItem onClick={handleExportMarkup} className="cursor-pointer"><Highlighter className="mr-2 h-4 w-4" /><span>{t('Drawer.Actions.exportAnnotations')}</span></DropdownMenuItem>
                           )}
                           <DropdownMenuItem onClick={onDelete} className="text-destructive cursor-pointer"><Trash2 className="mr-2 h-4 w-4" /><span>{t('Drawer.Actions.delete')}</span></DropdownMenuItem>
                        </DropdownMenuContent>
                     </DropdownMenu>
                  }
               >
                  {/* The whole row is the drag handle; the menu overlays it on hover (a sibling, so a menu
                      click never starts a drag). */}
                  <div {...dragAttributes} {...dragListeners} className="cursor-grab">
                     <DrawerListRow
                        type={item.type}
                        name={item.name}
                        game={item.game}
                        createdAt={item.createdAt}
                        updatedAt={item.updatedAt}
                        cardTypeClass={drawerItemCardTypeClass(item.type, item.game, item.content)}
                     />
                  </div>
               </DrawerListRowFrame>
            </DragStaticWrapper>
         )}
      </Sortable>
   );
}
