/**
 * Pure helpers + descriptors for the drag-feedback layer: the
 * generous tab-lane hit test, the cross-surface context derivation, the spring
 * dwell controller, and the per-context morph descriptors. Kept free of React,
 * @dnd-kit, and any drawer/tab/character concept (lucide icons are imported only as
 * descriptor data) so the geometry, the kind->context mapping, and the descriptor
 * resolution can be unit-tested in isolation; the stateful wiring lives in
 * {@link import('@/hooks/character-sheet/useCharacterSheetDnD')} and the morph engine.
 */

// -- Icon Imports (descriptor data only) --
import { Download, ExternalLink, LayoutGrid, Move, Plus, Save } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** What is being dragged, classified once at drag start. */
export type DragKind =
   | 'drawer-character'
   | 'drawer-component'
   | 'drawer-folder'
   | 'sheet-item'
   | 'tab'
   | null;

/**
 * The actionable surface the cursor is currently over (from @dnd-kit's `over`). The
 * drawer is split into its **items** area (where items reorder / land) and its
 * **nav** area (folder rows, folder reorder slots, Back) so a dragged drawer item
 * can keep its full card overlay in the items area while morphing elsewhere.
 */
export type DragOverZone = 'play-area' | 'sheet' | 'board' | 'drawer-items' | 'drawer-nav' | null;

/** The action a drop would perform right now; drives the morph cluster (null = hidden). */
export type DragContext = 'open-tab' | 'open' | 'add-to-sheet' | 'add-to-board' | 'save-to-drawer' | 'drawer-move' | null;

/** The directional hint shown in the morph cluster (null = no arrow). */
export type MorphArrow = 'in' | 'up' | null;

/**
 * Presentational descriptor for a drag context: the icon, i18n label, and optional
 * direction arrow the morph cluster renders. Pure data, the engine consumes it
 * without knowing what the action means.
 */
export interface MorphDescriptor {
   Icon: LucideIcon;
   labelKey: string;
   arrow?: MorphArrow;
}

/**
 * Sideways slack (px) added to each edge of the tab strip's measured rect so a
 * character aimed roughly at the lane still registers.
 */
export const TAB_LANE_SIDE_PADDING = 32;

/**
 * Downward slack (px) ADDED TO the strip's own height when extending the lane into
 * the top band, so a low aim is forgiven without reaching the play area proper.
 * The band's bottom edge is `rect.bottom + rect.height + TAB_LANE_BELOW_PADDING`.
 */
export const TAB_LANE_BELOW_PADDING = 48;

/** The minimal slice of a `DOMRect` the lane test needs. */
export interface LaneRect {
   left: number;
   right: number;
   top: number;
   bottom: number;
   height: number;
}

/** Whether a point falls inside a rect (inclusive edges). */
function pointInRect(rect: { left: number; right: number; top: number; bottom: number }, x: number, y: number): boolean {
   return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/**
 * Tests a cursor point against the tab strip's rect padded generously sideways and
 * (especially) downward into the top band, far more forgiving than @dnd-kit's thin
 * droppable. The band never reaches the play area: its bottom is the strip height
 * plus {@link TAB_LANE_BELOW_PADDING} below the strip.
 *
 * @param rect - The strip's `getBoundingClientRect()` (or a compatible shape).
 * @param x - Cursor clientX.
 * @param y - Cursor clientY.
 * @param sidePad - Sideways slack; defaults to {@link TAB_LANE_SIDE_PADDING}.
 * @param belowPad - Extra downward slack; defaults to {@link TAB_LANE_BELOW_PADDING}.
 * @returns Whether the point falls inside the padded lane.
 */
export function isWithinTabLane(
   rect: LaneRect,
   x: number,
   y: number,
   sidePad: number = TAB_LANE_SIDE_PADDING,
   belowPad: number = TAB_LANE_BELOW_PADDING,
): boolean {
   const bottom = rect.bottom + rect.height + belowPad;
   return x >= rect.left - sidePad && x <= rect.right + sidePad && y >= rect.top && y <= bottom;
}

/**
 * The generous lane only ever engages for a dragged drawer character, a component,
 * folder, tab, or sheet item passing through the same band must NOT register as a
 * tab-open. This guards the geometry test by drag kind.
 *
 * @param kind - The classified drag kind.
 * @param rect - The strip rect (null when the strip is unmounted).
 * @param x - Cursor clientX.
 * @param y - Cursor clientY.
 * @returns Whether the lane is engaged (always false unless `kind` is a character).
 */
export function isOverTabLaneFor(
   kind: DragKind,
   rect: LaneRect | null,
   x: number,
   y: number,
): boolean {
   if (kind !== 'drawer-character' || !rect) return false;
   return isWithinTabLane(rect, x, y);
}

/**
 * Maps the dragged kind + the current over-zone (+ the generous lane flag) to the
 * action a drop would perform. The lane takes precedence over the play area for a
 * character, so the top band reads as "Open as tab" even where it overlaps the
 * play-area drop zone. Returns null for plain reorders or non-actionable hovers.
 *
 * @param kind - The classified drag kind.
 * @param overZone - The @dnd-kit-derived surface under the cursor.
 * @param isOverTabLane - Whether the generous tab lane is engaged.
 * @param sheetCompatible - Whether the dragged item can actually be added to the
 *   current sheet (game match). When false, no `add-to-sheet` glyph is shown, there
 *   is no possible action, though the item still morphs.
 * @returns The drag context (puck content), or null when nothing actionable.
 */
export function deriveDragContext(
   kind: DragKind,
   overZone: DragOverZone,
   isOverTabLane: boolean,
   sheetCompatible: boolean = true,
): DragContext {
   if (kind === 'drawer-character') {
      if (isOverTabLane) return 'open-tab';
      if (overZone === 'board') return 'add-to-board';
      if (overZone === 'play-area') return 'open';
      if (overZone === 'drawer-nav') return 'drawer-move';
      // 'drawer-items' -> null: the item keeps its full overlay for precise reordering.
      return null;
   }
   if (kind === 'drawer-component') {
      if (overZone === 'sheet') return sheetCompatible ? 'add-to-sheet' : null;
      if (overZone === 'drawer-nav') return 'drawer-move';
      // 'drawer-items' -> null: full overlay for reordering among items.
      return null;
   }
   if (kind === 'drawer-folder') {
      return overZone === 'drawer-nav' || overZone === 'drawer-items' ? 'drawer-move' : null;
   }
   if (kind === 'sheet-item') {
      return overZone === 'drawer-nav' || overZone === 'drawer-items' ? 'save-to-drawer' : null;
   }
   if (kind === 'tab') {
      // A tab carries no drawer/sheet action; over the board it adds a character element.
      return overZone === 'board' ? 'add-to-board' : null;
   }
   return null;
}

/**
 * Whether a dragged DRAWER ITEM (a component or a character item) should be forced
 * into morph mode regardless of whether it has an action descriptor. Drawer items
 * keep their full card overlay ONLY while the cursor is genuinely inside the drawer
 * items area (for precise reordering); everywhere else they morph to the cursor
 * cluster, showing just the dot + identity when there is no action glyph. Folders
 * and sheet items are not force-morphed (they keep the descriptor-driven default).
 *
 * `overItemsArea` MUST come from a real geometry hit-test, not dnd-kit's `over`:
 * the collision detection's closestCenter fallback snaps `over` to the nearest item
 * even in neutral space, which would falsely read as the items area.
 *
 * @param kind - The classified drag kind.
 * @param overItemsArea - Whether the cursor is geometrically inside the items area.
 * @returns Whether to funnel the clone even with no descriptor.
 */
export function shouldForceMorph(kind: DragKind, overItemsArea: boolean): boolean {
   if (kind !== 'drawer-component' && kind !== 'drawer-character') return false;
   return !overItemsArea;
}

/**
 * Per-context presentational descriptors driving the drag-morph cluster (icon,
 * i18n label, optional direction arrow). Adding a new draggable's morph is a single
 * entry here plus a new {@link DragContext} value, no choreography change. (Folds
 * in the former `DragCursorPuck` content map, adding arrows where directional.)
 */
export const MORPH_DESCRIPTORS: Record<NonNullable<DragContext>, MorphDescriptor> = {
   'open-tab': { Icon: Plus, labelKey: 'DragPuck.openAsTab', arrow: 'up' },
   open: { Icon: ExternalLink, labelKey: 'DragPuck.open' },
   'add-to-sheet': { Icon: Download, labelKey: 'DragPuck.addToSheet' },
   'add-to-board': { Icon: LayoutGrid, labelKey: 'DragPuck.addToBoard' },
   'save-to-drawer': { Icon: Save, labelKey: 'DragPuck.saveToDrawer' },
   'drawer-move': { Icon: Move, labelKey: 'DragPuck.move' },
};

/** What the cluster's single left action badge should show (null = no glyph). */
export type MorphGlyph = { kind: 'arrow'; arrow: 'in' | 'up' } | { kind: 'action' } | null;

/**
 * Picks the ONE glyph for the cluster's left action badge. The dwell
 * direction takes precedence: while a spring dwell is running its arrow shows;
 * otherwise the descriptor's action icon shows; with neither, no glyph. This
 * precedence is a tunable rule, the point is a single clear glyph per moment.
 *
 * @param descriptor - The active morph descriptor, or null.
 * @param springKey - The dwell key (non-null while a dwell is running), or null.
 * @param arrow - The resolved direction arrow (from the descriptor or the dwell).
 * @returns Which glyph to render, or null when the cluster has none.
 */
export function selectMorphGlyph(
   descriptor: MorphDescriptor | null,
   springKey: string | null,
   arrow: MorphArrow,
): MorphGlyph {
   if (springKey !== null && (arrow === 'in' || arrow === 'up')) return { kind: 'arrow', arrow };
   if (descriptor) return { kind: 'action' };
   return null;
}


// ==================
//  Spring-loaded drawer navigation
// ==================

/**
 * How long (ms) the cursor must dwell on a folder/Back target before the drawer
 * navigates there mid-drag. MUST stay in sync with the `spring-ring` keyframe
 * duration in `global.css` (the cursor ring fills over the same window).
 */
export const SPRING_HOLD_MS = 800;

/** Sentinel key for the Back target (folders use their own id as the key). */
export const SPRING_BACK_KEY = '__drawer_back__';

/**
 * A resolved dwell target: a drawer folder, the drawer's Back button, or a
 * background tab (which spring-switches the active character mid-drag).
 */
export type SpringTarget = { kind: 'folder'; id: string } | { kind: 'back' } | { kind: 'tab'; id: string };

/** A hit-test area: an id paired with its measured rect (folder row or tab). */
export interface SpringHitArea {
   id: string;
   rect: LaneRect;
}

/** Stable key for a target (used to detect when the dwell target changes). */
export function springTargetKey(target: SpringTarget | null): string | null {
   if (!target) return null;
   if (target.kind === 'back') return SPRING_BACK_KEY;
   if (target.kind === 'tab') return `tab:${target.id}`;
   return target.id;
}

/**
 * Maps a dwell target to the morph cluster's direction arrow: folders drill `in`,
 * Back and tabs point `up` (Back goes up a level; tabs sit at the top of the screen).
 */
export function springDirection(target: SpringTarget): MorphArrow {
   return target.kind === 'folder' ? 'in' : 'up';
}

/**
 * Resolves which background tab (if any) the cursor is over, for the tab auto-nav
 * dwell. The active tab is excluded, dwelling on the tab you are already viewing
 * is a no-op. Tabs never overlap the drawer, so the caller can fall back from the
 * drawer hit-test to this one.
 *
 * @param tabs - The open tabs' ids with their measured rects.
 * @param x - Cursor clientX.
 * @param y - Cursor clientY.
 * @param activeTabId - The currently active tab id (excluded as a target).
 * @returns The tab dwell target under the cursor, or null.
 */
export function resolveTabSpringTarget(
   tabs: SpringHitArea[],
   x: number,
   y: number,
   activeTabId: string | null,
): SpringTarget | null {
   for (const tab of tabs) {
      if (tab.id === activeTabId) continue;
      if (pointInRect(tab.rect, x, y)) return { kind: 'tab', id: tab.id };
   }
   return null;
}

/**
 * Resolves which dwell target (if any) the cursor is over, hit-testing the Back
 * button first then the visible folder rows. The folder currently being dragged is
 * excluded, you cannot drill into the thing you are holding, and Back is only a
 * target when its rect is supplied (the caller omits it at root, matching the Back
 * button's `disabled` gate).
 *
 * @param folders - The visible folder rows with their measured rects.
 * @param back - The Back button's rect, or null when at root / not rendered.
 * @param x - Cursor clientX.
 * @param y - Cursor clientY.
 * @param draggedFolderId - The id of the folder being dragged, or null.
 * @returns The dwell target under the cursor, or null.
 */
export function resolveSpringTarget(
   folders: SpringHitArea[],
   back: LaneRect | null,
   x: number,
   y: number,
   draggedFolderId: string | null,
): SpringTarget | null {
   if (back && pointInRect(back, x, y)) return { kind: 'back' };
   for (const folder of folders) {
      if (folder.id === draggedFolderId) continue;
      if (pointInRect(folder.rect, x, y)) return { kind: 'folder', id: folder.id };
   }
   return null;
}

/**
 * A resolved in-drawer DROP target: into a specific folder row, or into the current
 * folder (anywhere else in the drawer). The Back button is intentionally NOT a drop
 * target, it is navigation-only during a drag (dwell to go up). To move an item up,
 * dwell Back to navigate to the parent, then drop, which lands in that now-current
 * folder. `current-folder` is resolved against the live store at drop time, so it is
 * immune to which folder the cursor happened to be over before a spring navigation.
 */
export type DrawerDropTarget = { kind: 'folder'; id: string } | { kind: 'current-folder' };

/**
 * Resolves the in-drawer DROP target under the cursor by live element geometry,
 * the same strategy the spring uses to drill in. dnd-kit's measured
 * droppable rects desync in the drawer's scrollable / layout-animated / spring-
 * remounting context, so its collision only fires near a folder's center; this reads
 * `getBoundingClientRect()` against the cursor so a drop anywhere on a row lands.
 *
 * A folder ROW (excluding the dragged folder) drops INTO that folder; the items body
 * (where the items live, or the empty-folder placeholder) drops into the CURRENT
 * folder. Chrome - the header, breadcrumb, search, folder-nav - is NOT a target, so
 * hovering it shows no glyph. Folder rows are checked first so they win over the body.
 *
 * @param folders - The visible folder rows with their measured rects.
 * @param itemsArea - The items-body rect (the "current folder" catch-all); chrome is excluded.
 * @param x - Cursor clientX.
 * @param y - Cursor clientY.
 * @param draggedFolderId - The folder being dragged (excluded as a target), or null.
 * @returns The drop target under the cursor, or null over chrome / outside the drawer.
 */
export function resolveDrawerDropTarget(
   folders: SpringHitArea[],
   itemsArea: LaneRect | null,
   x: number,
   y: number,
   draggedFolderId: string | null,
): DrawerDropTarget | null {
   for (const folder of folders) {
      if (folder.id === draggedFolderId) continue;
      if (pointInRect(folder.rect, x, y)) return { kind: 'folder', id: folder.id };
   }
   if (itemsArea && pointInRect(itemsArea, x, y)) return { kind: 'current-folder' };
   return null;
}

/**
 * Stable string key for a resolved {@link DrawerDropTarget}, so the reactive drop
 * indicator can re-render only when the target actually CHANGES (not on every pointer
 * move): `folder:<id>` for a folder nest, `current-folder` for the viewed folder, and
 * `null` for none. Mirrors {@link springTargetKey}'s role for the dwell target.
 *
 * @param target - The resolved in-drawer drop target, or null.
 * @returns A stable key, or null when there is no target.
 */
export function drawerDropTargetKey(target: DrawerDropTarget | null): string | null {
   if (!target) return null;
   return target.kind === 'folder' ? `folder:${target.id}` : 'current-folder';
}

/** A sortable item row's id + vertical extent, for resolving the `over` row from live geometry. */
export interface SortableRowRect {
   id: string;
   top: number;
   bottom: number;
}

/**
 * Resolves which sortable item row the cursor is "over" from the rows' LIVE rects, replacing dnd-kit's
 * measured-rect collision (those desync in the drawer's scrollable / layout-animated context, the same
 * reason folders use a geometry resolver). Clamped at the edges so the hard cases land: cursor above the
 * first row -> the first row, below the last -> the last row, within a row -> that row, in a gap between
 * rows -> the nearest by midpoint. The live-shuffle then opens the gap at the right place.
 *
 * @param rows - The sortable rows' ids + live rects (any order).
 * @param cursorY - Cursor clientY.
 * @returns The over row's id, or null when there are no rows.
 */
export function resolveSortableOverId(rows: SortableRowRect[], cursorY: number): string | null {
   if (rows.length === 0) return null;
   const sorted = [...rows].sort((a, b) => a.top - b.top);
   if (cursorY <= sorted[0].top) return sorted[0].id;
   const last = sorted[sorted.length - 1];
   if (cursorY >= last.bottom) return last.id;
   for (const row of sorted) {
      if (cursorY >= row.top && cursorY <= row.bottom) return row.id;
   }
   // In a gap between rows: the nearest row by midpoint.
   let best = sorted[0];
   let bestDistance = Infinity;
   for (const row of sorted) {
      const distance = Math.abs(cursorY - (row.top + row.bottom) / 2);
      if (distance < bestDistance) {
         bestDistance = distance;
         best = row;
      }
   }
   return best.id;
}

/** A sortable grid cell's id + rect, for resolving the `over` cell from live geometry in a 2D grid. */
export interface SortableCellRect {
   id: string;
   left: number;
   top: number;
   right: number;
   bottom: number;
}

/**
 * The 2D analogue of {@link resolveSortableOverId} for a grid (the Expanded Library): the cell the cursor
 * is within, else the nearest by cell center. Reads LIVE rects so the desync of dnd-kit's measured rects
 * (in the scrollable/animated Library) doesn't pick the wrong cell - or the workspace behind the overlay.
 *
 * @param cells - The grid cells' ids + live rects.
 * @param x - Cursor clientX.
 * @param y - Cursor clientY.
 * @returns The over cell's id, or null when there are no cells.
 */
export function resolveSortableOverId2D(cells: SortableCellRect[], x: number, y: number): string | null {
   if (cells.length === 0) return null;
   for (const cell of cells) {
      if (x >= cell.left && x <= cell.right && y >= cell.top && y <= cell.bottom) return cell.id;
   }
   let best = cells[0];
   let bestDistance = Infinity;
   for (const cell of cells) {
      const distance = Math.hypot(x - (cell.left + cell.right) / 2, y - (cell.top + cell.bottom) / 2);
      if (distance < bestDistance) {
         bestDistance = distance;
         best = cell;
      }
   }
   return best.id;
}

/**
 * Options for {@link createSpringController}. Generic over the target type so the same dwell mechanism
 * drives both the folder/tab/back nav (default {@link SpringTarget}) and other dwells (e.g. the
 * See-Workspace recede), which supply their own `keyOf`.
 */
export interface SpringControllerOptions<T = SpringTarget> {
   /** Dwell duration; defaults to {@link SPRING_HOLD_MS}. */
   holdMs?: number;
   /** Fired when the dwell completes on a target (perform the navigation here). */
   onNavigate: (target: T) => void;
   /** Fired whenever the active target key changes (drive the progress affordance). */
   onTargetChange?: (key: string | null) => void;
   /** Stable key for a target; defaults to {@link springTargetKey}. */
   keyOf?: (target: T | null) => string | null;
}

/** The dwell timer state machine returned by {@link createSpringController}. */
export interface SpringController<T = SpringTarget> {
   /** Feed the current hit-test result each pointer move (null = no target). */
   setTarget(target: T | null): void;
   /** Abort any pending dwell and clear the affordance (drop / drag end / cancel). */
   cancel(): void;
}

/**
 * A small, DOM-free dwell timer: feed it the target under the cursor on every
 * pointer move and it (re)starts a hold timer, firing `onNavigate` only when the
 * SAME target is held for the full `holdMs`. Changing targets restarts the timer;
 * a `null` target or `cancel()` aborts it (so a drop before the hold wins). Kept
 * free of the DOM and React so the hold/restart/abort logic is unit-testable.
 *
 * @param options - Navigation + affordance callbacks and the optional hold time.
 * @returns A controller with `setTarget` / `cancel`.
 */
export function createSpringController<T = SpringTarget>(options: SpringControllerOptions<T>): SpringController<T> {
   const holdMs = options.holdMs ?? SPRING_HOLD_MS;
   const keyOf = options.keyOf ?? (springTargetKey as (target: T | null) => string | null);
   let currentKey: string | null = null;
   let timer: ReturnType<typeof setTimeout> | null = null;

   const clearTimer = (): void => {
      if (timer !== null) {
         clearTimeout(timer);
         timer = null;
      }
   };

   return {
      setTarget(target) {
         const key = keyOf(target);
         if (key === currentKey) return; // same target: let the running timer continue
         clearTimer();
         currentKey = key;
         options.onTargetChange?.(key);
         if (target) {
            timer = setTimeout(() => {
               timer = null;
               currentKey = null;
               options.onTargetChange?.(null);
               options.onNavigate(target);
            }, holdMs);
         }
      },
      cancel() {
         clearTimer();
         if (currentKey !== null) {
            currentKey = null;
            options.onTargetChange?.(null);
         }
      },
   };
}
