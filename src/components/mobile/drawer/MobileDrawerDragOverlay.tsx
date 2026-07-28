// -- Component Imports --
import { DrawerItemPreview } from '@/components/organisms/drawer/DrawerItemPreview';
import { GameTag } from '@/components/molecules/GameTag';
import { FolderCountLabel } from '@/components/mobile/shared/FolderCountLabel';

// -- Icon Imports --
import { Folder as FolderIcon, MoreHorizontal } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { getItemTypeIconComponent } from '@/lib/utils/drawer-icons';

// -- Type Imports --
import type { DrawerItem } from '@/lib/types/drawer';
import type { DrawerFolderRecord } from '@/lib/drawer/drawerRecords';



/**
 * Render an overlay snapshot of a folder row that follows the pointer during a
 * drag. Presentational copy of `MobileFolderItem`'s body with the corner
 * context-menu button drawn in its handedness-leading position. Kept inline so
 * the overlay is self-contained.
 */
const renderFolderOverlay = (folder: DrawerFolderRecord, folderCount: number, itemCount: number, isLeftHanded: boolean) => (
   <div className={cn(
      "flex items-center rounded-lg border border-border bg-card shadow-2xl overflow-hidden",
      isLeftHanded && "flex-row-reverse"
   )}>
      <div className="flex flex-1 min-w-0">
         <div className="flex flex-1 min-w-0 items-center gap-2 p-2 min-h-11">
            <FolderIcon className="w-6 h-6 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
               <p className="font-medium text-foreground break-words">{folder.name}</p>
               <FolderCountLabel folders={folderCount} items={itemCount} />
            </div>
         </div>
      </div>
      <div className="flex shrink-0 items-center justify-center h-11 w-11 text-muted-foreground">
         <MoreHorizontal className="w-5 h-5" />
      </div>
   </div>
);

/**
 * Render an overlay snapshot of a drawer-item row that follows the pointer
 * during a drag. Mirrors `MobileDrawerItem`'s compact / rich shapes with the
 * inline context-menu button on the handedness-leading edge.
 */
const renderItemOverlay = (item: DrawerItem, isCompact: boolean, isLeftHanded: boolean) => {
   const Icon = getItemTypeIconComponent(item.type);
   return (
      <div className={cn(
         "flex rounded-lg border border-border bg-card shadow-2xl overflow-hidden",
         isCompact ? "items-center" : "items-start",
         isLeftHanded && "flex-row-reverse"
      )}>
         <div className="flex flex-1 min-w-0">
            {isCompact ? (
               <div className="flex flex-1 min-w-0 items-center gap-2 p-2 min-h-11">
                  <Icon className="w-5 h-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                     <p className="font-medium text-foreground break-words">{item.name}</p>
                     <div className="flex items-center gap-2 mt-1">
                        {/* NEUTRAL items are game-agnostic: GameTag renders nothing for them. */}
                        <GameTag game={item.game} />
                     </div>
                  </div>
               </div>
            ) : (
               <div className="flex-1 min-w-0">
                  <DrawerItemPreview item={item} />
               </div>
            )}
         </div>
         <div className="flex shrink-0 items-center justify-center h-11 w-11 text-muted-foreground">
            <MoreHorizontal className="w-5 h-5" />
         </div>
      </div>
   );
};



interface MobileDrawerDragOverlayProps {
   /** The folder being dragged, if the active drag is a folder. */
   activeFolder: DrawerFolderRecord | undefined;
   /** The item being dragged, if the active drag is an item. */
   activeItem: DrawerItem | undefined;
   /** Subfolder count of `activeFolder`, for its summary line. */
   folderCount: number;
   /** Item count of `activeFolder`, for its summary line. */
   itemCount: number;
   isCompact: boolean;
   isLeftHanded: boolean;
}

/**
 * The snapshots rendered inside the drawer's `DragOverlay` - one shape per
 * draggable kind, at most one of them active at a time. The `<DragOverlay>`
 * wrapper stays with the `DndContext` it must descend from.
 */
export default function MobileDrawerDragOverlay({
   activeFolder,
   activeItem,
   folderCount,
   itemCount,
   isCompact,
   isLeftHanded,
}: MobileDrawerDragOverlayProps) {
   return (
      <>
         {activeFolder ? renderFolderOverlay(activeFolder, folderCount, itemCount, isLeftHanded) : null}
         {activeItem ? renderItemOverlay(activeItem, isCompact, isLeftHanded) : null}
      </>
   );
}
