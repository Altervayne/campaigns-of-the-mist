// -- Utils Imports --
import { DRAG_TYPES } from '@/lib/constants/dragDrop';

// -- Type Imports --
import type { DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import type { DrawerItem } from '@/lib/types/drawer';
import type { DragKind } from '@/lib/utils/dragFeedback';

/*
 * Pure classification and targeting helpers for the workspace drag subsystem: what a drag is, where a
 * drawer drop lands, and the two constants the drag-feedback layer reads while resolving targets.
 */

/**
 * How far (px) the cursor must move after a spring navigation before in-drawer folder
 * rows are honored as drop targets again. Within this grace the drop target is forced
 * to the current folder, so a row that merely reflowed under the stationary cursor
 * (e.g. at root, where the Back button vanishes) is never an accidental target.
 */
export const NAV_GRACE_PX = 24;

/**
 * The See-Workspace dwell targets in the Expanded drawer: the bottom strip recedes the overlay to
 * reveal the workspace; the re-expand edge (shown while receded) brings it back. The dwell reuses the
 * spring-nav timer; these are its targets, keyed by their own string value.
 */
export type WorkspaceDwellTarget = 'see-workspace' | 'reexpand';

/**
 * Classifies a drag's source ONCE at start, so the drag-scoped `pointermove`
 * listener can branch (tab-lane test, puck context) by kind without re-reading
 * @dnd-kit's active data on every move.
 *
 * @param active - The @dnd-kit `active` descriptor from `onDragStart`.
 * @returns The {@link DragKind}, or null when the source is not recognised.
 */
export function classifyDrag(active: DragStartEvent['active']): DragKind {
   const type = active.data.current?.type as string | undefined;
   if (type === DRAG_TYPES.TAB) return 'tab';
   if (type === DRAG_TYPES.DRAWER_FOLDER) return 'drawer-folder';
   if (type === DRAG_TYPES.DRAWER_ITEM) {
      const item = active.data.current?.item as DrawerItem | undefined;
      return item?.type === 'FULL_CHARACTER_SHEET' ? 'drawer-character' : 'drawer-component';
   }
   if (typeof type === 'string' && type.startsWith('sheet-')) return 'sheet-item';
   return null;
}

/**
 * The destination folder id for a drop onto a drawer target: an explicit folder row, a folder's items
 * drop-zone (root -> undefined), or a Back button's parent. Undefined when the target is none of these.
 * Shared by every tab->drawer save so the character/board/note paths route identically.
 */
export function drawerDropFolderId(overIdStr: string, overType: string, over: NonNullable<DragOverEvent['over']>): string | undefined {
   if (overType === 'drawer-folder') return overIdStr;
   if (overIdStr.startsWith('drawer-drop-zone-')) {
      const parsedId = overIdStr.replace('drawer-drop-zone-', '');
      return parsedId === 'root' ? undefined : parsedId;
   }
   if (overType === 'drawer-back-button') return over.data.current?.destinationId ?? undefined;
   return undefined;
}
