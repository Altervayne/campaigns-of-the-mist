// -- Type Imports --
import type { RefObject } from 'react';
import type { useTranslation } from 'react-i18next';
import type { DragEndEvent } from '@dnd-kit/core';
import type { useDrawerSaveActions } from '@/hooks/character-sheet/dnd/useDrawerSaveActions';
import type { useSheetReorderActions } from '@/hooks/character-sheet/dnd/useSheetReorderActions';
import type { useTabManagerActions } from '@/lib/character/tabManagerStore';
import type { useAppSettingsActions } from '@/lib/stores/appSettingsStore';
import type { CharacterState } from '@/lib/stores/characterStore';
import type { DrawerState } from '@/lib/stores/drawerStore';
import type { Journal } from '@/lib/types/board';
import type { Character, Card as CardData, Tracker } from '@/lib/types/character';
import type { DrawerItem, Folder as FolderType } from '@/lib/types/drawer';
import type { DragKind, DrawerDropTarget } from '@/lib/utils/dragFeedback';

/*
 * The contract between `useDragEndRouter` and its route modules.
 *
 * A route is a plain function `(event, snapshot | target, deps) => boolean`, where `true` means the drop
 * was handled and the chain stops. The router assembles `deps` once per drop, so no route module opens a
 * store subscription or re-reads the drag-feedback layer.
 */

/** The drag-feedback values read once at the top of the handler, before the teardown clears them. */
export interface DragEndSnapshot {
   wasOverTabLane: boolean;
   dragKind: DragKind;
   manualDrawerTarget: DrawerDropTarget | null;
   dropPointer: { x: number; y: number } | null;
}

/** The snapshot plus the dnd-kit target, for the routes that run past the `!over` guard. */
export interface DragEndTarget extends DragEndSnapshot {
   over: NonNullable<DragEndEvent['over']>;
   activeType: string;
   overType: string;
   overIdStr: string;
}

export interface DragEndDeps {
   character: Character | null;
   currentFolderView: DrawerState['currentFolderView'];
   activeDragItem: CardData | Tracker | Journal | DrawerItem | FolderType | null;
   /** Read live by the cross-character import, NOT snapshotted - see `dragEndSheetRoutes`. */
   dragSourceCharacterIdRef: RefObject<string | null>;
   tNotifications: ReturnType<typeof useTranslation>['t'];
   moveFolder: DrawerState['actions']['moveFolder'];
   reorderFolders: DrawerState['actions']['reorderFolders'];
   moveItem: DrawerState['actions']['moveItem'];
   reorderItems: DrawerState['actions']['reorderItems'];
   openCharacterTab: ReturnType<typeof useTabManagerActions>['openCharacterTab'];
   openBoardTab: ReturnType<typeof useTabManagerActions>['openBoardTab'];
   openNoteTab: ReturnType<typeof useTabManagerActions>['openNoteTab'];
   reorderTabs: ReturnType<typeof useTabManagerActions>['reorderTabs'];
   setActiveTab: ReturnType<typeof useTabManagerActions>['setActiveTab'];
   setContextualGame: ReturnType<typeof useAppSettingsActions>['setContextualGame'];
   addImportedCard: CharacterState['actions']['addImportedCard'];
   addImportedTracker: CharacterState['actions']['addImportedTracker'];
   addImportedJournal: CharacterState['actions']['addImportedJournal'];
   handleSheetLayoutReorder: ReturnType<typeof useSheetReorderActions>['handleSheetLayoutReorder'];
   handleSheetTrackerReorder: ReturnType<typeof useSheetReorderActions>['handleSheetTrackerReorder'];
   handleSheetToDrawerDrop: ReturnType<typeof useDrawerSaveActions>['handleSheetToDrawerDrop'];
   saveTabToDrawer: ReturnType<typeof useDrawerSaveActions>['saveTabToDrawer'];
   saveBoardTabToDrawer: ReturnType<typeof useDrawerSaveActions>['saveBoardTabToDrawer'];
   saveNoteTabToDrawer: ReturnType<typeof useDrawerSaveActions>['saveNoteTabToDrawer'];
   /** Both closures belong to the router: they capture snapshot-moment values. */
   contractIfExpanded: () => void;
   dropSheetItemOnBoard: () => void;
}
