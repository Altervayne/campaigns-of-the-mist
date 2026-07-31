// -- Library Imports --
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// -- Local Imports --
import {
   MORPH_DESCRIPTORS,
   SPRING_HOLD_MS,
   TAB_LANE_BELOW_PADDING,
   TAB_LANE_SIDE_PADDING,
   createSpringController,
   deriveDragContext,
   drawerDropTargetKey,
   isOverTabLaneFor,
   isWithinTabLane,
   resolveDrawerDropTarget,
   resolveSortableOverId,
   resolveSortableOverId2D,
   resolveSpringTarget,
   resolveTabSpringTarget,
   selectMorphGlyph,
   shouldForceMorph,
   springDirection,
   type DragContext,
   type LaneRect,
   type MorphDescriptor,
   type SpringHitArea,
   type SpringTarget,
} from './dragFeedback';

/*
 * Unit tests for the drag-feedback geometry + context mapping. The hook wiring
 * (refs/listeners/puck) is exercised in the browser; these cover the pure decision
 * logic.
 */

// A thin 40px-tall strip pinned to the top, mimicking the desktop tab strip.
const strip: LaneRect = { left: 100, right: 500, top: 0, bottom: 40, height: 40 };

describe('isWithinTabLane (generous hit zone)', () => {
   it('accepts a point squarely on the strip', () => {
      expect(isWithinTabLane(strip, 300, 20)).toBe(true);
   });

   it('accepts a low aim within the padded band below the strip', () => {
      // Band bottom = bottom(40) + height(40) + below(48) = 128.
      expect(isWithinTabLane(strip, 300, 120)).toBe(true);
      expect(isWithinTabLane(strip, 300, 128)).toBe(true);
   });

   it('accepts a sideways-slack aim just past the strip edges', () => {
      expect(isWithinTabLane(strip, strip.left - TAB_LANE_SIDE_PADDING, 20)).toBe(true);
      expect(isWithinTabLane(strip, strip.right + TAB_LANE_SIDE_PADDING, 20)).toBe(true);
   });

   it('rejects a point below the band (into the play area)', () => {
      const justBelow = strip.bottom + strip.height + TAB_LANE_BELOW_PADDING + 1;
      expect(isWithinTabLane(strip, 300, justBelow)).toBe(false);
   });

   it('rejects a point well outside the sideways slack', () => {
      expect(isWithinTabLane(strip, strip.right + TAB_LANE_SIDE_PADDING + 50, 20)).toBe(false);
   });
});

describe('isOverTabLaneFor (drag-kind guard)', () => {
   it('engages the lane for a drawer character in the band', () => {
      expect(isOverTabLaneFor('drawer-character', strip, 300, 120)).toBe(true);
   });

   it('does NOT engage for a component drag in the same band', () => {
      expect(isOverTabLaneFor('drawer-component', strip, 300, 120)).toBe(false);
   });

   it('does NOT engage for a tab, folder, or sheet item in the band', () => {
      expect(isOverTabLaneFor('tab', strip, 300, 120)).toBe(false);
      expect(isOverTabLaneFor('drawer-folder', strip, 300, 120)).toBe(false);
      expect(isOverTabLaneFor('sheet-item', strip, 300, 120)).toBe(false);
   });

   it('is false when the strip is unmounted (no rect)', () => {
      expect(isOverTabLaneFor('drawer-character', null, 300, 120)).toBe(false);
   });
});

describe('deriveDragContext (kind + over-zone -> action)', () => {
   it('a character over the tab lane -> open-tab (lane wins over play area)', () => {
      expect(deriveDragContext('drawer-character', 'play-area', true)).toBe('open-tab');
      expect(deriveDragContext('drawer-character', null, true)).toBe('open-tab');
   });

   it('a character over the play area (not the lane) -> open', () => {
      expect(deriveDragContext('drawer-character', 'play-area', false)).toBe('open');
   });

   it('a component over the sheet -> add-to-sheet', () => {
      expect(deriveDragContext('drawer-component', 'sheet', false)).toBe('add-to-sheet');
   });

   it('a tab or a character over the board -> add-to-board', () => {
      expect(deriveDragContext('tab', 'board', false)).toBe('add-to-board');
      expect(deriveDragContext('drawer-character', 'board', false)).toBe('add-to-board');
   });

   it('other kinds over the board -> null (only a tab or a character become an element)', () => {
      expect(deriveDragContext('drawer-component', 'board', false)).toBeNull();
      expect(deriveDragContext('drawer-folder', 'board', false)).toBeNull();
      expect(deriveDragContext('sheet-item', 'board', false)).toBeNull();
   });

   it('a sheet item over the drawer -> save-to-drawer (items or nav area)', () => {
      expect(deriveDragContext('sheet-item', 'drawer-items', false)).toBe('save-to-drawer');
      expect(deriveDragContext('sheet-item', 'drawer-nav', false)).toBe('save-to-drawer');
   });

   it('a drawer-sourced drag over the drawer NAV area -> drawer-move', () => {
      expect(deriveDragContext('drawer-folder', 'drawer-nav', false)).toBe('drawer-move');
      expect(deriveDragContext('drawer-component', 'drawer-nav', false)).toBe('drawer-move');
      expect(deriveDragContext('drawer-character', 'drawer-nav', false)).toBe('drawer-move');
   });

   it('a drawer item over the ITEMS area -> null (keeps its full overlay for reordering)', () => {
      expect(deriveDragContext('drawer-component', 'drawer-items', false)).toBeNull();
      expect(deriveDragContext('drawer-character', 'drawer-items', false)).toBeNull();
      // A folder has no items-area reorder, so it still reads as a move there.
      expect(deriveDragContext('drawer-folder', 'drawer-items', false)).toBe('drawer-move');
   });

   it('more specific actions still win over drawer-move', () => {
      expect(deriveDragContext('drawer-character', 'drawer-nav', true)).toBe('open-tab');
      expect(deriveDragContext('drawer-character', 'play-area', false)).toBe('open');
      expect(deriveDragContext('drawer-component', 'sheet', false)).toBe('add-to-sheet');
   });

   it('suppresses add-to-sheet for an incompatible game (no possible action -> no glyph)', () => {
      expect(deriveDragContext('drawer-component', 'sheet', false, false)).toBeNull();
      // Still adds when compatible (default true / explicit true).
      expect(deriveDragContext('drawer-component', 'sheet', false, true)).toBe('add-to-sheet');
   });

   it('plain reorders / non-actionable hovers -> null', () => {
      expect(deriveDragContext('tab', null, false)).toBeNull();
      expect(deriveDragContext('drawer-folder', null, false)).toBeNull();
      expect(deriveDragContext('drawer-character', null, false)).toBeNull();
      expect(deriveDragContext('drawer-component', null, false)).toBeNull();
      expect(deriveDragContext('sheet-item', 'sheet', false)).toBeNull();
   });
});

describe('shouldForceMorph (drawer items morph except in the items area)', () => {
   it('forces morph for a drawer item when NOT geometrically over the items area', () => {
      expect(shouldForceMorph('drawer-component', false)).toBe(true);
      expect(shouldForceMorph('drawer-character', false)).toBe(true);
   });

   it('does NOT force morph while over the items area (full overlay for reordering)', () => {
      expect(shouldForceMorph('drawer-component', true)).toBe(false);
      expect(shouldForceMorph('drawer-character', true)).toBe(false);
   });

   it('never forces morph for folders, sheet items, or tabs', () => {
      expect(shouldForceMorph('drawer-folder', false)).toBe(false);
      expect(shouldForceMorph('sheet-item', false)).toBe(false);
      expect(shouldForceMorph('tab', false)).toBe(false);
   });
});

// Three stacked 40px folder rows, with a Back button above them.
const back: LaneRect = { left: 0, right: 200, top: 0, bottom: 30, height: 30 };
const folders: SpringHitArea[] = [
   { id: 'f1', rect: { left: 0, right: 200, top: 40, bottom: 80, height: 40 } },
   { id: 'f2', rect: { left: 0, right: 200, top: 80, bottom: 120, height: 40 } },
   { id: 'f3', rect: { left: 0, right: 200, top: 120, bottom: 160, height: 40 } },
];

describe('resolveSpringTarget (dwell hit-test)', () => {
   it('resolves the folder under the cursor', () => {
      expect(resolveSpringTarget(folders, back, 100, 100, null)).toEqual({ kind: 'folder', id: 'f2' });
   });

   it('resolves Back first when over the Back button', () => {
      expect(resolveSpringTarget(folders, back, 100, 15, null)).toEqual({ kind: 'back' });
   });

   it('treats Back as absent at root (null rect)', () => {
      expect(resolveSpringTarget(folders, null, 100, 15, null)).toBeNull();
   });

   it('excludes the folder being dragged', () => {
      // Cursor squarely over f2, but f2 is the dragged folder -> no target.
      expect(resolveSpringTarget(folders, back, 100, 100, 'f2')).toBeNull();
   });

   it('returns null over empty space', () => {
      expect(resolveSpringTarget(folders, back, 100, 500, null)).toBeNull();
   });
});

describe('resolveDrawerDropTarget (manual in-drawer drop hit-test)', () => {
   // The items body (catch-all = current folder) sits BELOW the folder rows (y 40-160).
   // Chrome above it - Back (y 0-30), the breadcrumb/header, the folder-nav gaps - is not
   // part of the items area, so it resolves to no target (no glyph).
   const itemsArea: LaneRect = { left: 0, right: 200, top: 200, bottom: 600, height: 400 };

   it('resolves a folder row anywhere on the row (full-row, not center-only)', () => {
      expect(resolveDrawerDropTarget(folders, itemsArea, 5, 100, null)).toEqual({ kind: 'folder', id: 'f2' });
      expect(resolveDrawerDropTarget(folders, itemsArea, 195, 100, null)).toEqual({ kind: 'folder', id: 'f2' });
   });

   it('resolves current-folder over the items body', () => {
      expect(resolveDrawerDropTarget(folders, itemsArea, 100, 300, null)).toEqual({ kind: 'current-folder' });
   });

   it('resolves NO target over chrome - Back, header, breadcrumb (no stray glyph)', () => {
      expect(resolveDrawerDropTarget(folders, itemsArea, 100, 15, null)).toBeNull(); // over Back
      expect(resolveDrawerDropTarget(folders, itemsArea, 100, 180, null)).toBeNull(); // gap between folders and items body
   });

   it('excludes the dragged folder (its row over chrome falls through to no target)', () => {
      // Over f2's row but f2 is the dragged folder -> not a folder target; its row is not in
      // the items body either -> no target.
      expect(resolveDrawerDropTarget(folders, itemsArea, 100, 100, 'f2')).toBeNull();
   });

   it('returns null outside the items body and folder rows', () => {
      expect(resolveDrawerDropTarget(folders, itemsArea, 100, 900, null)).toBeNull();
      expect(resolveDrawerDropTarget(folders, null, 100, 15, null)).toBeNull();
   });
});

describe('resolveSortableOverId (live-geometry over, clamped at edges)', () => {
   // Three 20px rows stacked from y=100, intentionally out of order to prove the sort.
   const rows = [
      { id: 'b', top: 120, bottom: 140 },
      { id: 'a', top: 100, bottom: 120 },
      { id: 'c', top: 140, bottom: 160 },
   ];

   it('cursor above the first row -> the first row', () => {
      expect(resolveSortableOverId(rows, 50)).toBe('a');
      expect(resolveSortableOverId(rows, 100)).toBe('a');
   });

   it('cursor below the last row -> the last row', () => {
      expect(resolveSortableOverId(rows, 160)).toBe('c');
      expect(resolveSortableOverId(rows, 9999)).toBe('c');
   });

   it('cursor within a row -> that row', () => {
      expect(resolveSortableOverId(rows, 110)).toBe('a');
      expect(resolveSortableOverId(rows, 150)).toBe('c');
   });

   it('single item: any cursor -> that item', () => {
      const one = [{ id: 'only', top: 0, bottom: 40 }];
      expect(resolveSortableOverId(one, -10)).toBe('only');
      expect(resolveSortableOverId(one, 999)).toBe('only');
   });

   it('a gap between rows resolves to the nearest by midpoint', () => {
      // Two rows with a gap 120..200; 130 is nearest the first (mid 110), 190 the second (mid 210).
      const gapped = [{ id: 'top', top: 100, bottom: 120 }, { id: 'bot', top: 200, bottom: 220 }];
      expect(resolveSortableOverId(gapped, 130)).toBe('top');
      expect(resolveSortableOverId(gapped, 195)).toBe('bot');
   });

   it('empty -> null', () => {
      expect(resolveSortableOverId([], 50)).toBeNull();
   });
});

describe('resolveSortableOverId2D (grid over by live geometry)', () => {
   // A 2x2 grid: two columns (x 0-100, 110-210), two rows (y 0-100, 110-210).
   const cells = [
      { id: 'tl', left: 0, top: 0, right: 100, bottom: 100 },
      { id: 'tr', left: 110, top: 0, right: 210, bottom: 100 },
      { id: 'bl', left: 0, top: 110, right: 100, bottom: 210 },
      { id: 'br', left: 110, top: 110, right: 210, bottom: 210 },
   ];

   it('cursor within a cell -> that cell', () => {
      expect(resolveSortableOverId2D(cells, 50, 50)).toBe('tl');
      expect(resolveSortableOverId2D(cells, 160, 160)).toBe('br');
      expect(resolveSortableOverId2D(cells, 160, 50)).toBe('tr');
   });

   it('cursor in a gap -> the nearest cell by center', () => {
      expect(resolveSortableOverId2D(cells, 105, 50)).toBe('tl'); // gap between columns, top row, slightly left
      expect(resolveSortableOverId2D(cells, 300, 300)).toBe('br'); // far past the grid -> nearest is br
   });

   it('single cell / empty', () => {
      expect(resolveSortableOverId2D([{ id: 'only', left: 0, top: 0, right: 10, bottom: 10 }], 999, 999)).toBe('only');
      expect(resolveSortableOverId2D([], 5, 5)).toBeNull();
   });
});

describe('drawerDropTargetKey (change-keyed indicator state)', () => {
   it('keys a folder target by its id and the current folder by a constant', () => {
      expect(drawerDropTargetKey({ kind: 'folder', id: 'abc' })).toBe('folder:abc');
      expect(drawerDropTargetKey({ kind: 'current-folder' })).toBe('current-folder');
      expect(drawerDropTargetKey(null)).toBeNull();
   });

   it('is stable for the same target and distinct across targets (so state updates only on change)', () => {
      expect(drawerDropTargetKey({ kind: 'folder', id: 'a' })).toBe(drawerDropTargetKey({ kind: 'folder', id: 'a' }));
      expect(drawerDropTargetKey({ kind: 'folder', id: 'a' })).not.toBe(drawerDropTargetKey({ kind: 'folder', id: 'b' }));
      expect(drawerDropTargetKey({ kind: 'folder', id: 'a' })).not.toBe(drawerDropTargetKey({ kind: 'current-folder' }));
   });
});

describe('springDirection (dwell -> arrow)', () => {
   it('maps a folder target to the "in" arrow', () => {
      expect(springDirection({ kind: 'folder', id: 'f1' })).toBe('in');
   });

   it('maps the Back and tab targets to the "up" arrow', () => {
      expect(springDirection({ kind: 'back' })).toBe('up');
      expect(springDirection({ kind: 'tab', id: 't1' })).toBe('up');
   });
});

describe('resolveTabSpringTarget (tab auto-nav hit-test)', () => {
   const tabs: SpringHitArea[] = [
      { id: 'tab-a', rect: { left: 0, right: 100, top: 0, bottom: 40, height: 40 } },
      { id: 'tab-b', rect: { left: 100, right: 200, top: 0, bottom: 40, height: 40 } },
   ];

   it('resolves the tab under the cursor', () => {
      expect(resolveTabSpringTarget(tabs, 150, 20, 'tab-a')).toEqual({ kind: 'tab', id: 'tab-b' });
   });

   it('excludes the already-active tab', () => {
      expect(resolveTabSpringTarget(tabs, 50, 20, 'tab-a')).toBeNull();
   });

   it('returns null off any tab', () => {
      expect(resolveTabSpringTarget(tabs, 300, 20, null)).toBeNull();
   });
});

describe('MORPH_DESCRIPTORS (context -> descriptor)', () => {
   const contexts: NonNullable<DragContext>[] = ['open-tab', 'open', 'add-to-sheet', 'add-to-board', 'save-to-drawer', 'drawer-move'];

   it('resolves every drag context to a descriptor with an icon + label', () => {
      for (const context of contexts) {
         const descriptor = MORPH_DESCRIPTORS[context];
         expect(descriptor).toBeDefined();
         expect(descriptor.Icon).toBeTruthy(); // a lucide component (forwardRef object)
         expect(descriptor.labelKey).toMatch(/^DragPuck\./);
      }
   });

   it('carries the up arrow only for the directional open-tab context', () => {
      expect(MORPH_DESCRIPTORS['open-tab'].arrow).toBe('up');
      expect(MORPH_DESCRIPTORS.open.arrow).toBeUndefined();
      expect(MORPH_DESCRIPTORS['add-to-sheet'].arrow).toBeUndefined();
      expect(MORPH_DESCRIPTORS['save-to-drawer'].arrow).toBeUndefined();
   });
});

describe('selectMorphGlyph (left action badge)', () => {
   const descriptor = MORPH_DESCRIPTORS.open; // any descriptor (no arrow)

   it('shows the dwell arrow while a spring dwell is running (dwell wins)', () => {
      expect(selectMorphGlyph(descriptor, 'folder-1', 'in')).toEqual({ kind: 'arrow', arrow: 'in' });
      expect(selectMorphGlyph(null, '__drawer_back__', 'up')).toEqual({ kind: 'arrow', arrow: 'up' });
   });

   it('shows the action icon when a descriptor is active and no dwell is running', () => {
      expect(selectMorphGlyph(descriptor, null, null)).toEqual({ kind: 'action' });
      expect(selectMorphGlyph(MORPH_DESCRIPTORS['open-tab'], null, 'up')).toEqual({ kind: 'action' });
   });

   it('shows nothing when neither a descriptor nor a dwell is active', () => {
      expect(selectMorphGlyph(null, null, null)).toBeNull();
   });

   it('falls back to the action icon if a dwell is keyed but has no arrow', () => {
      const orphanDwell: MorphDescriptor | null = descriptor;
      expect(selectMorphGlyph(orphanDwell, 'folder-1', null)).toEqual({ kind: 'action' });
   });
});

describe('createSpringController (dwell timer)', () => {
   beforeEach(() => vi.useFakeTimers());
   afterEach(() => vi.useRealTimers());

   const folderTarget: SpringTarget = { kind: 'folder', id: 'f1' };
   const otherTarget: SpringTarget = { kind: 'folder', id: 'f2' };
   const backTarget: SpringTarget = { kind: 'back' };

   it('fires navigation after holding the same target for SPRING_HOLD_MS', () => {
      const onNavigate = vi.fn();
      const controller = createSpringController({ onNavigate });

      controller.setTarget(folderTarget);
      vi.advanceTimersByTime(SPRING_HOLD_MS - 1);
      expect(onNavigate).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(onNavigate).toHaveBeenCalledExactlyOnceWith(folderTarget);
   });

   it('fires the Back target after the hold', () => {
      const onNavigate = vi.fn();
      const controller = createSpringController({ onNavigate });

      controller.setTarget(backTarget);
      vi.advanceTimersByTime(SPRING_HOLD_MS);
      expect(onNavigate).toHaveBeenCalledExactlyOnceWith(backTarget);
   });

   it('restarts the timer when the target changes (no nav to the first)', () => {
      const onNavigate = vi.fn();
      const controller = createSpringController({ onNavigate });

      controller.setTarget(folderTarget);
      vi.advanceTimersByTime(SPRING_HOLD_MS - 100); // not yet
      controller.setTarget(otherTarget); // switch before it fires
      vi.advanceTimersByTime(SPRING_HOLD_MS - 100); // would have fired the first by now
      expect(onNavigate).not.toHaveBeenCalledWith(folderTarget);
      vi.advanceTimersByTime(100); // complete the second hold
      expect(onNavigate).toHaveBeenCalledExactlyOnceWith(otherTarget);
   });

   it('does not restart while the same target is held continuously', () => {
      const onTargetChange = vi.fn();
      const controller = createSpringController({ onNavigate: vi.fn(), onTargetChange });

      controller.setTarget(folderTarget);
      controller.setTarget(folderTarget); // same target, repeated moves
      expect(onTargetChange).toHaveBeenCalledExactlyOnceWith('f1');
   });

   it('cancel() aborts a pending dwell (a drop before the hold wins)', () => {
      const onNavigate = vi.fn();
      const onTargetChange = vi.fn();
      const controller = createSpringController({ onNavigate, onTargetChange });

      controller.setTarget(folderTarget);
      vi.advanceTimersByTime(SPRING_HOLD_MS - 50);
      controller.cancel(); // drop happens here
      vi.advanceTimersByTime(SPRING_HOLD_MS);
      expect(onNavigate).not.toHaveBeenCalled();
      expect(onTargetChange).toHaveBeenLastCalledWith(null);
   });

   it('a null target clears the affordance without navigating', () => {
      const onNavigate = vi.fn();
      const onTargetChange = vi.fn();
      const controller = createSpringController({ onNavigate, onTargetChange });

      controller.setTarget(folderTarget);
      controller.setTarget(null); // cursor left the row before the hold
      vi.advanceTimersByTime(SPRING_HOLD_MS);
      expect(onNavigate).not.toHaveBeenCalled();
      expect(onTargetChange).toHaveBeenLastCalledWith(null);
   });
});
