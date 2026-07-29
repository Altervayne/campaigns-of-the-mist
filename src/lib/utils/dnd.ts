import { closestCenter, pointerWithin } from "@dnd-kit/core";
import type { Collision, CollisionDetection } from "@dnd-kit/core";
import type { DrawerItem, Folder, GameSystem, GeneralItemType } from "../types/drawer";
import type { Card, Tracker } from "../types/character";
import type { Journal, PostItNote } from "../types/board";
import type { SortingStrategy } from "@dnd-kit/sortable";
import { resolveSortableOverId, resolveSortableOverId2D } from "./dragFeedback";
import { useAppGeneralStateStore } from "../stores/appGeneralStateStore";


// ==================
//  Shared types
// ==================

/**
 * Every payload a workspace drag can carry, plus `null` for "no drag in flight". Held as overlay state by
 * the drag engine and threaded down to the overlay/dropzone components, so it lives here rather than being
 * re-spelled at each site.
 */
export type ActiveDragItem = Card | Tracker | Journal | DrawerItem | Folder | null;



// ==================
//  Utility functions
// ==================

/**
 * Converts a character sheet card or tracker into drawer-compatible storage info.
 * Returns a tuple of [item type, game system] - useful when saving items to the drawer.
 */
export function mapItemToStorableInfo(item: Card | Tracker | PostItNote | Journal): [GeneralItemType, GameSystem] | null {
   if ('cardType' in item) {
      const game: GameSystem = item.details.game;
      switch (item.cardType) {
         case 'CHARACTER_CARD': return ['CHARACTER_CARD', game];
         case 'CHARACTER_THEME': return ['CHARACTER_THEME', game];
         case 'GROUP_THEME': return ['GROUP_THEME', game];
         case 'LOADOUT_THEME': return ['LOADOUT_THEME', game];
         case 'IMAGE_CARD': return ['IMAGE_CARD', game];
         case 'CHALLENGE_CARD': return ['CHALLENGE_CARD', game];
         default: return null;
      }
   }
   if ('trackerType' in item) {
      // A tracker is game-agnostic: it saves to the drawer as NEUTRAL (no game segment, app theme).
      const game: GameSystem = 'NEUTRAL';
      switch (item.trackerType) {
         case 'STATUS': return ['STATUS_TRACKER', game];
         case 'STORY_TAG': return ['STORY_TAG_TRACKER', game];
         case 'STORY_THEME': return ['STORY_THEME_TRACKER', game];
         default: return null;
      }
   }
   // Post-its and journals are game-agnostic notes: they save to the drawer as NEUTRAL. A journal owns
   // `pages`; a post-it owns `text` - disjoint shapes, so the presence of `pages` splits them cleanly.
   if ('pages' in item) return ['JOURNAL', 'NEUTRAL'];
   if ('text' in item) return ['POST_IT', 'NEUTRAL'];
   return null;
};



/**
 * Which sheet section a drawer item type belongs to, so the play area can highlight
 * only the relevant region while still accepting a drop anywhere (the drop is routed
 * by type regardless). Card/theme types → the cards section; tracker types → the
 * trackers section; anything else (e.g. a full character sheet) → null.
 */
export function sheetSectionForItemType(type: GeneralItemType): 'cards' | 'trackers' | null {
   switch (type) {
      case 'CHARACTER_CARD':
      case 'CHARACTER_THEME':
      case 'GROUP_THEME':
      case 'LOADOUT_THEME':
      case 'IMAGE_CARD':
      case 'CHALLENGE_CARD':
      case 'JOURNAL':
         return 'cards';
      case 'STATUS_TRACKER':
      case 'STORY_TAG_TRACKER':
      case 'STORY_THEME_TRACKER':
         return 'trackers';
      default:
         return null;
   }
}


// ==================
//  Custom DndToolkit sorting strategies and collision detection
// ==================

/**
 * Custom collision detection for drag-and-drop operations throughout the app.
 * Handles complex drop logic for character sheets, drawer items, folders, and trackers.
 * Makes sure you can only drop items where it actually makes sense to drop them!
 */
/**
 * The Expanded Library's reorder allowlist for a drawer-item drag. The workspace is mounted BEHIND the
 * overlay (for See-Workspace), so its drop zones must NOT win the collision while reordering: resolve the
 * over among the Library's OWN items by live 2D geometry and return ONLY that (or `[]` when over the
 * Library but not a cell, so the workspace never wins). Returns null when not applicable (not Expanded, or
 * receded - where the workspace IS the intended target). Gated on the DRAG type by the caller, so it
 * covers EVERY item type (regular, character, board) the same.
 */
function resolveExpandedLibraryItemOver(args: Parameters<CollisionDetection>[0]): Collision[] | null {
   const general = useAppGeneralStateStore.getState();
   if (!general.isDrawerExpanded || general.isDrawerReceded) return null;

   const pointer = args.pointerCoordinates;
   const gridRect = typeof document !== 'undefined'
      ? (document.querySelector('[data-drawer-items-area]')?.getBoundingClientRect() ?? null)
      : null;
   const overGrid = !!pointer && !!gridRect &&
      pointer.x >= gridRect.left && pointer.x <= gridRect.right &&
      pointer.y >= gridRect.top && pointer.y <= gridRect.bottom;
   if (pointer && overGrid) {
      const cells = args.droppableContainers.flatMap((container) => {
         if (container.data.current?.type !== 'drawer-item') return [];
         const node = container.node?.current;
         if (!node) return [];
         const rect = node.getBoundingClientRect();
         // Subtract the live shuffle transform so cells read at their STATIC slots (the grid uses
         // rectSortingStrategy; reading shuffled rects would feed back, as in the side panel).
         const transform = getComputedStyle(node).transform;
         const matrix = transform && transform !== 'none' ? new DOMMatrixReadOnly(transform) : null;
         const tx = matrix?.m41 ?? 0;
         const ty = matrix?.m42 ?? 0;
         return [{ id: String(container.id), left: rect.left - tx, top: rect.top - ty, right: rect.right - tx, bottom: rect.bottom - ty }];
      });
      const overId = resolveSortableOverId2D(cells, pointer.x, pointer.y);
      if (overId) return [{ id: overId }];
   }
   // Over the Library but not a cell (folder nav / header / empty): no collision, so the workspace
   // behind never wins. A move INTO a folder / the current folder is the live-geometry resolver's job.
   return [];
}

/**
 * The side-panel's same-folder REORDER over for a drawer-item drag: the over sibling resolved from the
 * item rows' LIVE rects (the shuffle transform subtracted so they read at their static slots, clamped at
 * the edges) - the keep-shuffle fix. Shared by the regular `drawer-item` branch AND the character/board
 * (`FULL_*`) reorder fallback so all drawer items reorder identically. Returns null when there's no
 * pointer or the cursor isn't over the items body, so the caller keeps its center-based fallback.
 */
function resolveSidePanelItemReorderOver(args: Parameters<CollisionDetection>[0]): Collision[] | null {
   const pointer = args.pointerCoordinates;
   const itemsAreaRect = typeof document !== 'undefined'
      ? (document.querySelector('[data-drawer-items-area]')?.getBoundingClientRect() ?? null)
      : null;
   const overItemsBody = !!pointer && !!itemsAreaRect &&
      pointer.x >= itemsAreaRect.left && pointer.x <= itemsAreaRect.right &&
      pointer.y >= itemsAreaRect.top && pointer.y <= itemsAreaRect.bottom;
   if (!pointer || !overItemsBody) return null;

   const itemRows = args.droppableContainers.flatMap((container) => {
      if (container.data.current?.type !== 'drawer-item') return [];
      const node = container.node?.current;
      if (!node) return [];
      const rect = node.getBoundingClientRect();
      // Static slot (subtract the live sort transform), so the held row anchors at its own place and a
      // drop in place is a true no-op - reading the shuffled rect would feed back into the shuffle.
      const transform = getComputedStyle(node).transform;
      const translateY = transform && transform !== 'none' ? new DOMMatrixReadOnly(transform).m42 : 0;
      return [{ id: String(container.id), top: rect.top - translateY, bottom: rect.bottom - translateY }];
   });
   const overId = resolveSortableOverId(itemRows, pointer.y);
   return overId ? [{ id: overId }] : null;
}

export const customCollisionDetection: CollisionDetection = (args) => {
   const activeData = args.active.data.current;
   const activeDataType = args.active.data.current?.type as string;
   const draggedItemType = (activeData?.item as DrawerItem)?.type;

   // Expanded Library reorder short-circuits EVERY drawer-item drag - regular, character, AND board -
   // into the Library's own items, BEFORE the type branches below whose workspace zones would otherwise
   // hijack a character/board (those branch on item.type). Gated on the DRAG type, so item.type can't
   // mis-route it. Skipped (null) when not Expanded / when receded (See-Workspace wants the workspace).
   if (activeDataType === 'drawer-item') {
      const libraryOver = resolveExpandedLibraryItemOver(args);
      if (libraryOver) return libraryOver;
   }

   // ==================
   //  If dragging a tab (the desktop tab strip shares the sheet's DndContext)
   // ==================
   // A tab reorders against other tabs, OR saves into the drawer when dropped on a
   // drawer target. Prioritise drawer drop zones, then folders / back-buttons
   // (pointerWithin), and otherwise resolve the tab sortables for reordering.
   if (activeDataType === 'tab') {
      // Dropping a tab onto the board canvas adds a character element (board tab only, so the
      // zone is absent elsewhere and never competes with the drawer/tab targets below).
      const boardDroppables = args.droppableContainers.filter((container) => container.id === 'board-drop-zone');
      const boardCollisions = pointerWithin({ ...args, droppableContainers: boardDroppables });
      if (boardCollisions.length > 0) return boardCollisions;

      const drawerZoneDroppables = args.droppableContainers.filter((container) =>
         container.id.toString().startsWith('drawer-drop-zone-'),
      );
      const drawerZoneCollisions = pointerWithin({ ...args, droppableContainers: drawerZoneDroppables });
      if (drawerZoneCollisions.length > 0) return drawerZoneCollisions;

      const folderDroppables = args.droppableContainers.filter(
         (container) => container.data.current?.type === 'drawer-folder' || container.id.toString().startsWith('drawer-back-button-'),
      );
      const folderCollisions = pointerWithin({ ...args, droppableContainers: folderDroppables });
      if (folderCollisions.length > 0) return folderCollisions;

      const tabDroppables = args.droppableContainers.filter((container) => container.data.current?.type === 'tab');
      return closestCenter({ ...args, droppableContainers: tabDroppables });
   }

   // ==================
   //  If dragging a full character sheet, a full board, or a note
   // ==================
   // A saved board or note joins this branch: like a character each opens onto the tab strip
   // (its `main-character-drop-zone` collision is a harmless no-op at drop), and neither drops
   // as a component, so they reuse the same tab-strip-priority + sibling-reorder routing.
   // A saved character is a `drawer-item` whose `item.type` is FULL_CHARACTER_SHEET, so
   // it needs BOTH its own high-priority targets AND the ordinary sibling reorder.
   // Priority 1 (pointerWithin): load onto the sheet / open as a tab. In-drawer MOVES
   // (into a folder / the current folder) are resolved by the live-geometry resolver at
   // drop, not this `over`, so no folder/back collision is needed.
   // Priority 2: same-folder REORDER. Strict pointerWithin rarely lands on a
   // sibling row, which is exactly why a saved character never reordered; fall back to the
   // nearest sibling `drawer-item` via closestCenter, EXCLUDING the active item so `over`
   // is always a different row (handleDragEnd's reorder no-ops on a self drop). This
   // mirrors the regular `drawer-item` branch's reorder, kept LAST so the sheet/tab
   // targets still win.
   if (draggedItemType === 'FULL_CHARACTER_SHEET' || draggedItemType === 'FULL_BOARD' || draggedItemType === 'NOTE') {
      // A drawer character or note over the board canvas adds an element (board tab only, so the
      // zone is absent elsewhere and never competes below): a character reference, or a live note
      // reference tile. A board never drops onto a board, so FULL_BOARD skips this and keeps its
      // tab-strip routing.
      if (draggedItemType === 'FULL_CHARACTER_SHEET' || draggedItemType === 'NOTE') {
         const boardDroppables = args.droppableContainers.filter((container) => container.id === 'board-drop-zone');
         const boardCollisions = pointerWithin({ ...args, droppableContainers: boardDroppables });
         if (boardCollisions.length > 0) return boardCollisions;
      }

      const primaryDroppables = args.droppableContainers.filter((container) => (
         container.id === 'main-character-drop-zone' ||
         container.id === 'tab-strip-drop-zone'
      ));
      const primaryCollisions = pointerWithin({ ...args, droppableContainers: primaryDroppables });
      if (primaryCollisions.length > 0) {
         return primaryCollisions;
      }

      // Same-folder REORDER: the live-geometry over (the keep-shuffle fix), so a character/board reorders
      // exactly like a regular item - NOT dnd-kit's center-only measured-rect collision, which desyncs in
      // the scrollable/animated drawer (the jank). The drag-out zones above keep priority.
      const reorderOver = resolveSidePanelItemReorderOver(args);
      if (reorderOver) return reorderOver;

      // Fallback when the cursor isn't over the items body (no DOM, keyboard drag): nearest sibling row,
      // excluding the active so `over` is always a different row (handleDragEnd no-ops a self drop).
      const siblingDroppables = args.droppableContainers.filter(
         (container) => container.data.current?.type === 'drawer-item' && container.id !== args.active.id,
      );
      return closestCenter({ ...args, droppableContainers: siblingDroppables });
   };

   // ==================
   //  If dragging a folder
   // ==================
   // Folder reorder uses the expanding-dropzone SLOTS (`drawer-drop-zone`, the
   // FolderDropZone targets): `handleDragEnd`'s slot-placement reads this `over` to land a
   // folder at an exact position. The slots sit BETWEEN folders so they never compete with
   // the folder rows themselves, which stay free for spring-nav (dwell) and nest.
   if (activeDataType === 'drawer-folder') {
      const filteredDroppables = args.droppableContainers.filter(
         (container) => container.data.current?.type === 'drawer-drop-zone',
      );
      return pointerWithin({ ...args, droppableContainers: filteredDroppables });
   };

   // ==================
   //  If dragging a drawer item
   // ==================
   // In-drawer moves (into a folder / Back / the current folder's items body) are now
   // resolved by the live-geometry resolver at drop, which returns
   // before this `over` is read, so the former folder / back-button / items-area-zone
   // collision was dead and is removed. What remains is still live: the sheet drop zones
   // (dropping the item onto the sheet), then same-folder item REORDER over the nearest
   // sibling row (`closestCenter`, resolved by `handleDragEnd`'s reorder path).
   if (activeDataType === 'drawer-item') {
      // (Expanded-Library reorder was already short-circuited at the top of this function.)

      // Sheet drop zones (character tab) plus the board drop zone (board tab). The board
      // zone exists only when a board is active, so it never competes with the sheet
      // zones, and vice versa - exactly one of them is mounted at a time.
      const surfaceZoneDroppables = args.droppableContainers.filter((container) => {
         const id = container.id.toString();
         return id === 'character-sheet-main-drop-zone' || id === 'tracker-drop-zone' || id === 'card-drop-zone' || id === 'board-drop-zone';
      });
      const surfaceZoneCollisions = pointerWithin({ ...args, droppableContainers: surfaceZoneDroppables });
      if (surfaceZoneCollisions.length > 0) {
         return surfaceZoneCollisions;
      }

      // Same-folder REORDER by live geometry (the keep-shuffle fix), shared with the character/board
      // branch. Falls through to the center-based path below when the cursor isn't over the items body.
      const reorderOver = resolveSidePanelItemReorderOver(args);
      if (reorderOver) return reorderOver;

      const itemDroppables = args.droppableContainers.filter((container) => {
         const type = container.data.current?.type as string;
         return type === 'drawer-item' || type === 'sheet-card' || type === 'sheet-tracker';
      });
      return closestCenter({ ...args, droppableContainers: itemDroppables });
   }

   // ==================
   //  If dragging from sheet (card or tracker)
   // ==================
   if (activeDataType === 'sheet-card' || activeDataType === 'sheet-tracker') {
      // Dropping a sheet card/tracker onto the board canvas embeds a copy (board tab only, so the
      // zone is absent elsewhere and never competes with the drawer/reorder targets below).
      const boardDroppables = args.droppableContainers.filter((container) => container.id === 'board-drop-zone');
      const boardCollisions = pointerWithin({ ...args, droppableContainers: boardDroppables });
      if (boardCollisions.length > 0) return boardCollisions;

      // First priority: drawer drop zones (current folder)
      const drawerZoneDroppables = args.droppableContainers.filter((container) => {
         const id = container.id.toString();
         return id.startsWith('drawer-drop-zone-');
      });
      const drawerZoneCollisions = pointerWithin({ ...args, droppableContainers: drawerZoneDroppables });
      if (drawerZoneCollisions.length > 0) {
         return drawerZoneCollisions;
      }

      // Second priority: folders and back buttons (only if not over a drop zone)
      const folderDroppables = args.droppableContainers.filter(
         (container) => container.data.current?.type === 'drawer-folder' || container.id.toString().startsWith('drawer-back-button-')
      );
      const folderCollisions = pointerWithin({ ...args, droppableContainers: folderDroppables });
      if (folderCollisions.length > 0) {
         return folderCollisions;
      }

      // Third priority: other sheet items for reordering
      const sheetItemDroppables = args.droppableContainers.filter((container) => {
         const type = container.data.current?.type as string;
         return type === 'sheet-card' || type === 'sheet-tracker';
      });
      return closestCenter({ ...args, droppableContainers: sheetItemDroppables });
   }

   return closestCenter(args);
};

/**
 * Sorting strategy that keeps items visually static during drag operations.
 * Prevents the jarring "items jumping around" effect - drag previews move, but the list stays put.
 */
export const staticListSortingStrategy: SortingStrategy = () => {
   return {
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
   };
};