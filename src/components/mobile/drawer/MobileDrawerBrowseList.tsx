// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent, Modifier, SensorDescriptor, SensorOptions } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

// -- Component Imports --
import MobileFolderItem from '@/components/mobile/drawer/MobileFolderItem';
import MobileDrawerItem from '@/components/mobile/drawer/MobileDrawerItem';
import MobileDrawerDragOverlay from '@/components/mobile/drawer/MobileDrawerDragOverlay';

// -- Type Imports --
import type { DrawerFolderRecord, DrawerItemRecord } from '@/lib/drawer/drawerRecords';



/**
 * Inline `@dnd-kit` modifier that locks dragging to the vertical axis: any
 * horizontal pointer travel is dropped from the transform applied to the
 * `DragOverlay`. This keeps the dragged item moving with the finger up and down
 * (so it visually follows the gesture across the screen) while making
 * horizontal drift impossible - which, combined with `overflow-x: hidden` on
 * the scroll container, prevents the drag from expanding the container and
 * breaking the drawer layout. Inlined rather than depending on
 * `@dnd-kit/modifiers` (not installed; do not add).
 */
const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });



interface MobileDrawerBrowseListProps {
   sensors: SensorDescriptor<SensorOptions>[];
   onDragStart: (event: DragStartEvent) => void;
   onDragEnd: (event: DragEndEvent) => void;
   onDragCancel: () => void;
   /** False when the open folder holds neither subfolders nor items; drives the empty state. */
   hasContent: boolean;
   /** The open folder's id (null at root); selects which empty-state copy applies. */
   currentFolderId: string | null;
   folders: readonly DrawerFolderRecord[];
   items: readonly DrawerItemRecord[];
   /** Sortable id lists, memoized by the caller so each `SortableContext` keeps a stable set. */
   folderIds: string[];
   itemIds: string[];
   childCounts: ReadonlyMap<string, { folderCount: number; itemCount: number }>;
   onNavigate: (folderId: string | null) => void;
   onFolderLongPress: (folderId: string, folderName: string, position: { x: number; y: number }) => void;
   onItemLongPress: (itemId: string, itemName: string, position: { x: number; y: number }) => void;
   isCompactView: boolean;
   isLeftHanded: boolean;
   /** The folder being dragged, if the active drag is a folder. */
   activeFolder: DrawerFolderRecord | undefined;
   /** The item being dragged, if the active drag is an item. */
   activeItem: DrawerItemRecord | undefined;
}

/**
 * The browse half of the drawer body: the open folder's subfolders and items as
 * two reorderable lists, plus the overlay snapshot that follows the pointer.
 *
 * Renders the `DndContext` as its own root. This is one arm of the drawer's
 * browse/search ternary, so the context unmounts whenever a search starts; the
 * drag state driving it lives in the caller and survives that swap.
 */
export default function MobileDrawerBrowseList({
   sensors,
   onDragStart,
   onDragEnd,
   onDragCancel,
   hasContent,
   currentFolderId,
   folders,
   items,
   folderIds,
   itemIds,
   childCounts,
   onNavigate,
   onFolderLongPress,
   onItemLongPress,
   isCompactView,
   isLeftHanded,
   activeFolder,
   activeItem,
}: MobileDrawerBrowseListProps) {
   const { t } = useTranslation();

   return (
      <DndContext
         sensors={sensors}
         collisionDetection={closestCenter}
         modifiers={[restrictToVerticalAxis]}
         onDragStart={onDragStart}
         onDragEnd={onDragEnd}
         onDragCancel={onDragCancel}
      >
         <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-2">
            {!hasContent && (
               <div className="h-full flex items-center justify-center text-center p-8">
                  <div>
                     <p className="text-muted-foreground mb-4">
                        {currentFolderId
                           ? t('Drawer.emptyFolder')
                           : t('Drawer.emptyDrawer')}
                     </p>
                  </div>
               </div>
            )}

            {/* Folders */}
            <SortableContext items={folderIds} strategy={verticalListSortingStrategy}>
               {folders.map((folder) => (
                  <MobileFolderItem
                     key={folder.id}
                     folder={folder}
                     folderCount={childCounts.get(folder.id)?.folderCount ?? 0}
                     itemCount={childCounts.get(folder.id)?.itemCount ?? 0}
                     onNavigate={onNavigate}
                     onLongPress={onFolderLongPress}
                     isLeftHanded={isLeftHanded}
                  />
               ))}
            </SortableContext>

            {/* Separator if both folders and items exist */}
            {folders.length > 0 && items.length > 0 && (
               <div className="border-t border-border my-2" />
            )}

            {/* Items */}
            <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
               {items.map((item) => (
                  <MobileDrawerItem
                     key={item.id}
                     item={item}
                     isCompact={isCompactView}
                     onLongPress={onItemLongPress}
                     isLeftHanded={isLeftHanded}
                  />
               ))}
            </SortableContext>
         </div>

         {/* Overlay snapshot of the active row, floating with the pointer */}
         <DragOverlay dropAnimation={null}>
            <MobileDrawerDragOverlay
               activeFolder={activeFolder}
               activeItem={activeItem}
               folderCount={activeFolder ? childCounts.get(activeFolder.id)?.folderCount ?? 0 : 0}
               itemCount={activeFolder ? childCounts.get(activeFolder.id)?.itemCount ?? 0 : 0}
               isCompact={isCompactView}
               isLeftHanded={isLeftHanded}
            />
         </DragOverlay>
      </DndContext>
   );
}
