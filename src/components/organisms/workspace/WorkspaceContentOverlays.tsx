// -- Component Imports --
import { CharacterLoadDropZone } from '@/components/organisms/CharacterLoadDropzone';
import { CannotDropOverlay } from '@/components/organisms/CannotDropOverlay';
import { FileDragOverlay } from '@/components/molecules/FileDragOverlay';
import { SheetZoomControl } from '@/components/organisms/character-sheet/SheetZoomControl';

// -- Type Imports --
import type { Card as CardData, Tracker } from '@/lib/types/character';
import type { Journal } from '@/lib/types/board';
import type { DrawerItem, Folder as FolderType } from '@/lib/types/drawer';


interface WorkspaceContentOverlaysProps {
   activeDragItem: CardData | Tracker | Journal | DrawerItem | FolderType | null;
   /** A board or note owns the surface, so the character-load zone steps aside. */
   isBoardActive: boolean;
   isIncompatibleComponentDrag: boolean;
   isFileDragActive: boolean;
   /** Gates the sheet-zoom control to character tabs. */
   hasCharacter: boolean;
}

/**
 * The workspace content area's overlays: drop zones, the incompatible-drag notice, and the floating
 * zoom control. They are siblings of the surface switch, so they ride above whichever surface is
 * showing rather than belonging to any one of them.
 */
export function WorkspaceContentOverlays({ activeDragItem, isBoardActive, isIncompatibleComponentDrag, isFileDragActive, hasCharacter }: WorkspaceContentOverlaysProps) {
   return (
      <>
         {/* Character from Drawer Drop Zone */}
         <CharacterLoadDropZone activeDragItem={activeDragItem} isBoardActive={isBoardActive} />

         {/* "Can't drop here" overlay for an incompatible (wrong-game) component */}
         <CannotDropOverlay active={isIncompatibleComponentDrag} />

         {/* File Drop Zone */}
         <FileDragOverlay isDragActive={isFileDragActive} />

         {/* Floating sheet-zoom control (character tabs only), bottom-right of the content area. */}
         {hasCharacter && <SheetZoomControl />}
      </>
   );
}
