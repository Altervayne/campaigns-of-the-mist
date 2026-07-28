// -- React Imports --
import type { ReactNode } from 'react';

// -- Other Library Imports --
import { DragOverlay } from '@dnd-kit/core';

// -- Utils Imports --
import { isSheetScaledDragItem } from '@/lib/character/sheetZoom';

// -- Component Imports --
import { DragOverlayContent } from '@/components/molecules/DragOverlayContent';
import { TabDragPreview } from '@/components/organisms/tabs/TabDragPreview';

// -- Type Imports --
import type { OpenTab } from '@/lib/character/tabManagerStore';
import type { Card as CardData, Tracker } from '@/lib/types/character';
import type { Journal } from '@/lib/types/board';
import type { DrawerItem, Folder as FolderType } from '@/lib/types/drawer';


interface WorkspaceDragOverlayLayerProps {
   activeDragItem: CardData | Tracker | Journal | DrawerItem | FolderType | null;
   /** Non-null while a tab is dragged, which swaps the preview for the strip's own. */
   activeTabDrag: OpenTab | null;
   isEditing: boolean;
   isCompactDrawer: boolean;
   /** The active sheet zoom, applied to a sheet-sourced clone so it matches its source's size. */
   sheetZoom: number;
   /** The drag-morph engine's two slots. */
   renderClone: (preview: ReactNode) => ReactNode;
   renderCluster: () => ReactNode;
}

/**
 * The drag layer: the dnd-kit overlay carrying the clone, plus the cursor cluster beside it. A
 * fragment, because the two must stay siblings.
 */
export function WorkspaceDragOverlayLayer({ activeDragItem, activeTabDrag, isEditing, isCompactDrawer, sheetZoom, renderClone, renderCluster }: WorkspaceDragOverlayLayerProps) {
   return (
      <>
         {/* Reorders apply immediately, so disable the drop-back animation. */}
         <DragOverlay dropAnimation={null}>
            {renderClone(
               activeTabDrag ? (
                  <TabDragPreview tab={activeTabDrag} />
               ) : (
                  <DragOverlayContent
                     activeDragItem={activeDragItem}
                     isEditing={isEditing}
                     isCompactDrawer={isCompactDrawer}
                     contentScale={isSheetScaledDragItem(activeDragItem) ? sheetZoom : 1}
                  />
               ),
            )}
         </DragOverlay>

         {/* Cursor cluster as a SIBLING of <DragOverlay> (never a child: the overlay's
             transform would offset this fixed element). */}
         {renderCluster()}
      </>
   );
}
