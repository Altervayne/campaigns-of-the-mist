// -- Other Library Imports --
import { motion } from 'framer-motion';

// -- Component Imports --
import { CardRenderer } from '@/components/organisms/cards/CardRenderer';
import { StatusTrackerCard } from '@/components/organisms/trackers/StatusTracker';
import { StoryTagTrackerCard } from '@/components/organisms/trackers/StoryTagTracker';
import { StoryThemeTrackerCard } from '@/components/organisms/trackers/StoryThemeTracker';
import { SheetJournalCard } from '@/components/organisms/cards/SheetJournalCard';
import { DrawerCompactItemEntry } from '@/components/molecules/drawer/DrawerCompactItemEntry';
import { DrawerItemPreview, FolderPreview } from '@/components/organisms/drawer/DrawerItemPreview';

// -- Type Imports --
import type { Journal } from '@/lib/types/board';
import type { DrawerItem, Folder as FolderType } from '@/lib/types/drawer';
import type { ActiveDragItem } from '@/lib/utils/dnd';



interface DragOverlayContentProps {
   activeDragItem: ActiveDragItem;
   isEditing: boolean;
   isCompactDrawer: boolean;
   /**
    * Scale for the preview, matching the source's on-screen size. A sheet card/tracker/journal
    * renders inside the sheet's zoom layer, but the overlay lives at the DndContext root (unscaled),
    * so the clone is scaled to the active sheet zoom; everything else stays 1.
    */
   contentScale?: number;
}

/**
 * Content rendered inside the DnD `<DragOverlay>`. Picks the correct drag preview
 * based on the shape of `activeDragItem`: a folder, a sheet card, a sheet journal, a
 * tracker, or a drawer item (compact or full preview). Renders nothing when no drag is active.
 */
export function DragOverlayContent({ activeDragItem, isEditing, isCompactDrawer, contentScale = 1 }: DragOverlayContentProps) {
   if (!activeDragItem) {
      return null;
   }

   // A dragged sheet journal is a bare Journal aggregate: it carries `pages`/`bookmarks` and NONE of
   // the card/tracker/drawer discriminants, so it must be detected BEFORE the folder-by-elimination
   // check below (which would otherwise mistake it for a folder and render a FolderPreview).
   const isJournal = 'pages' in activeDragItem && 'bookmarks' in activeDragItem;

   // A dragged drawer folder is a flat DrawerFolderRecord (id/name/parentFolderId/
   // order), it has none of the discriminants the other drag sources carry
   // (`cardType`/`trackerType`/`game`), and NOT `folders`, so the old
   // `'folders' in item` check never matched it and a folder drag showed no clone.
   // Detect it by elimination instead, then render its folder preview.
   const isFolder = !isJournal &&
      !('cardType' in activeDragItem) && !('trackerType' in activeDragItem) && !('game' in activeDragItem);

   return (
      <motion.div className="shadow-2xl rounded-lg" style={contentScale === 1 ? undefined : { zoom: contentScale }}>
         {isJournal ? (
            <SheetJournalCard journal={activeDragItem as Journal} isEditing={false} />
         ) : isFolder ? (
            <FolderPreview folder={activeDragItem as unknown as FolderType} />
         ) : 'cardType' in activeDragItem ? (
            <CardRenderer card={activeDragItem} isEditing={isEditing} isSnapshot={true}/>
         ) : 'trackerType' in activeDragItem ? (
            (activeDragItem.trackerType === 'STATUS') ? <StatusTrackerCard tracker={activeDragItem} isEditing={isEditing} /> :
            (activeDragItem.trackerType === 'STORY_TAG') ? <StoryTagTrackerCard tracker={activeDragItem} isEditing={isEditing} /> :
            <StoryThemeTrackerCard tracker={activeDragItem} isEditing={isEditing} />
         ) : 'game' in activeDragItem ? (
            isCompactDrawer ? (
               <DrawerCompactItemEntry item={activeDragItem as DrawerItem} isPreview={true} />
            ) : (
               <DrawerItemPreview item={activeDragItem as DrawerItem} />
            )
         ) : null}
      </motion.div>
   );
}
