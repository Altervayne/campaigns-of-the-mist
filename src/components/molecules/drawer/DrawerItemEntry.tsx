// -- React Imports --
import React from 'react';
import { useTranslation } from 'react-i18next';

// -- DnD Component Imports --
import { Sortable, DragStaticWrapper } from '@/components/dnd';

// -- Basic UI Imports --
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

// -- Icon Imports --
import { MoreHorizontal, Pencil, Trash2, Move, Upload } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { deriveExportHandle, exportToFile, generateExportFilename } from '@/lib/utils/export-import';
import { DRAG_TYPES } from '@/lib/constants/dragDrop';

// -- Hook Imports --
import { useDrawerRowReveal } from '@/hooks/drawer/useDrawerRowReveal';

// -- Component Imports --
import { DrawerItemPreview } from '@/components/organisms/drawer/DrawerItemPreview';
import { DRAWER_MENU_TRIGGER_CLASS } from '@/components/molecules/drawer/drawerMenuTrigger';

// -- Type Imports --
import type { DrawerItem } from '@/lib/types/drawer';



export function DrawerItemEntry({ item, parentFolderId, onRename, onDelete, onMove }: { item: DrawerItem & { createdAt?: number; updatedAt?: number }, parentFolderId: string | null, onRename: () => void, onDelete: () => void, onMove: () => void }) {
   const { t } = useTranslation();
   const { ref: revealRef, isRevealed } = useDrawerRowReveal(item.id);

   const handleExport = async (e: React.MouseEvent) => {
      e.stopPropagation();
      const { content, type, game, name } = item;

      const handle = deriveExportHandle(content, name);

      const fileName = generateExportFilename(game, type, handle);
      try {
         await exportToFile(content, type, game, fileName);
      } catch (error) {
         console.error('Drawer item export failed:', error);
      }
   };

   return (
      <Sortable
         id={item.id}
         data={{
            type: DRAG_TYPES.DRAWER_ITEM,
            item: item,
            parentFolderId,
            isDrawer: true
         }}
      >
         {({ dragAttributes, dragListeners, isBeingDragged }) => (
            <DragStaticWrapper isBeingDragged={isBeingDragged}>
               <div ref={revealRef} className={cn('relative group/item rounded-lg data-[state=open]:bg-muted', isRevealed && 'motion-safe:animate-drawer-reveal')}>
                  <div {...dragAttributes} {...dragListeners} className="cursor-grab">
                     <DrawerItemPreview item={item} />
                  </div>
                  <div className="absolute top-1 right-1 z-10">
                     <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                           <Button variant="ghost" size="icon" className={`h-6 w-6 opacity-0 group-hover/item:opacity-100 transition-opacity cursor-pointer ${DRAWER_MENU_TRIGGER_CLASS}`}>
                              <MoreHorizontal className="h-4 w-4" />
                           </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
                           <DropdownMenuItem onClick={onRename} className="cursor-pointer">
                              <Pencil className="mr-2 h-4 w-4" />
                              <span>{t('Drawer.Actions.rename')}</span>
                           </DropdownMenuItem>
                           <DropdownMenuItem onClick={onMove} className="cursor-pointer">
                              <Move className="mr-2 h-4 w-4" />
                              <span>{t('Common.move')}</span>
                           </DropdownMenuItem>
                           <DropdownMenuItem onClick={handleExport} className="cursor-pointer">
                              <Upload className="mr-2 h-4 w-4" />
                              <span>{t('Drawer.Actions.export')}</span>
                           </DropdownMenuItem>
                           <DropdownMenuItem onClick={onDelete} className="bg-destructive text-destructive-foreground cursor-pointer">
                              <Trash2 className="text-destructive-foreground mr-2 h-4 w-4" />
                              <span>{t('Drawer.Actions.delete')}</span>
                           </DropdownMenuItem>
                        </DropdownMenuContent>
                     </DropdownMenu>
                  </div>
               </div>
            </DragStaticWrapper>
         )}
      </Sortable>
   );
};
