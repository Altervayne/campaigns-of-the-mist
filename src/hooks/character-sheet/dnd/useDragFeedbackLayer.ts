// -- React Imports --
import { useState, useCallback, useRef, useEffect } from 'react';

// -- Utils Imports --
import { MORPH_DESCRIPTORS, SPRING_BACK_KEY, deriveDragContext, drawerDropTargetKey, isOverTabLaneFor, resolveDrawerDropTarget, resolveSpringTarget, resolveTabSpringTarget, shouldForceMorph, springDirection } from '@/lib/utils/dragFeedback';

// -- Local Imports --
import { NAV_GRACE_PX } from '@/hooks/character-sheet/dnd/dragClassification';
import { useSpringNavigation } from '@/hooks/character-sheet/dnd/useSpringNavigation';

// -- Store Imports --
import { useTabManagerStore } from '@/lib/character/tabManagerStore';
import { useAppGeneralStateStore } from '@/lib/stores/appGeneralStateStore';

// -- Type Imports --
import type { useDragMorph } from '@/components/molecules/drag-morph/useDragMorph';
import type { DragEndSnapshot } from '@/hooks/character-sheet/dnd/dragEndDeps';
import type { WorkspaceDwellTarget } from '@/hooks/character-sheet/dnd/dragClassification';
import type { useTabManagerActions } from '@/lib/character/tabManagerStore';
import type { useAppGeneralStateActions } from '@/lib/stores/appGeneralStateStore';
import type { DrawerState } from '@/lib/stores/drawerStore';
import type { DragContext, DragKind, DragOverZone, DrawerDropTarget, SpringHitArea, SpringTarget } from '@/lib/utils/dragFeedback';

interface UseDragFeedbackLayerArgs {
   setDrawerCurrentFolderId: DrawerState['actions']['setDrawerCurrentFolderId'];
   setActiveTab: ReturnType<typeof useTabManagerActions>['setActiveTab'];
   setDrawerReceded: ReturnType<typeof useAppGeneralStateActions>['setDrawerReceded'];
   /** The morph engine's imperative slots: the layer pins the cursor, feeds the resolved signal, and clears both on teardown. */
   setCursor: ReturnType<typeof useDragMorph>['setCursor'];
   setMorph: ReturnType<typeof useDragMorph>['setMorph'];
   resetMorph: ReturnType<typeof useDragMorph>['reset'];
}

/*
 * The drag-feedback layer: everything the drag's visuals show and the drop routes read.
 *
 * Every value a drop routes against exists twice - as a ref written on the `pointermove` stream, and
 * as mirrored state that paints. The ref is the truth at drop time; the state can lag a commit behind,
 * so a fast drop routed against the state lands on the target the cursor left. The mirrors commit only
 * when their value changes, so a 120 Hz pointer stream does not re-render the workspace shell.
 *
 * `handlePointerMove` is the per-move pass: it re-queries the live drawer/tab geometry on every move
 * (scroll- and navigation-correct by construction) and resolves the in-drawer drop target, the two dwell
 * targets, the generous tab lane and the force-morph rule from it, in that order.
 *
 * `handleDragStart` and `handleDragOver` stay with the caller - they compose this layer with the morph
 * engine and the overlay state - so the refs they arm are returned rather than kept private.
 */
export function useDragFeedbackLayer({
   setDrawerCurrentFolderId,
   setActiveTab,
   setDrawerReceded,
   setCursor,
   setMorph,
   resetMorph,
}: UseDragFeedbackLayerArgs) {
   // `dragContext`/`isOverTabLane` are React state (feed the morph engine and the
   // strip highlight); their `*Ref` twins are the truth read inside `handleDragEnd`,
   // where the matching state can lag. `tabStripElRef` caches the strip element
   // (queried once at drag start) for the generous geometry test. The cursor itself
   // is positioned imperatively by the morph engine, not here.
   const [dragContext, setDragContext] = useState<DragContext>(null);
   const [isOverTabLane, setIsOverTabLane] = useState(false);
   const tabStripElRef = useRef<HTMLElement | null>(null);
   const dragKindRef = useRef<DragKind>(null);
   const overZoneRef = useRef<DragOverZone>(null);
   const isOverTabLaneRef = useRef(false);
   const dragContextRef = useRef<DragContext>(null);
   // Force-morph: drawer items morph everywhere except the items area.
   const [forceMorph, setForceMorph] = useState(false);
   const forceMorphRef = useRef(false);
   // Which sheet section to highlight for a compatible drawer-item drag ('cards'/'trackers').
   const [sheetHighlight, setSheetHighlight] = useState<'cards' | 'trackers' | null>(null);
   // Whether the dragged item can actually land on the current sheet (game match).
   // Gates the 'add-to-sheet' glyph: no action possible -> no glyph (still morphs).
   const sheetCompatibleRef = useRef(true);
   // Reactive flag for the whole drag of a game-incompatible component, driving the
   // large "can't drop here" overlay over the sheet (issue 5). Set once at drag start.
   const [isIncompatibleComponentDrag, setIsIncompatibleComponentDrag] = useState(false);
   // The character a dragged SHEET item came from, so a drop on a DIFFERENT tab's
   // sheet (after tab auto-nav) imports a copy rather than a no-op reorder.
   const dragSourceCharacterIdRef = useRef<string | null>(null);

   // ==================
   //  See-Workspace recede (Expanded only)
   // ==================
   // `isDrawerItemDragActive` gates the strip's appearance (a drawer ITEM drag, not a folder);
   // `workspaceDwellKey` ('see-workspace' | 'reexpand' | null) drives the strip/edge dwell-progress cue.
   // The recede itself lives in appGeneralStateStore; the dwell reuses the spring timer (own controller).
   const [isDrawerItemDragActive, setIsDrawerItemDragActive] = useState(false);
   // True only while a FOLDER is being dragged: the drawer surfaces show the reorder drop slots even after
   // drilling into another folder (where the dragged folder isn't in view), so it can be placed precisely.
   const [isFolderDragActive, setIsFolderDragActive] = useState(false);
   // The in-drawer drop target under the cursor, resolved by live geometry each move.
   // dnd-kit's collision rects desync in the scrollable/animated
   // drawer so folder drops were center-only; this is the source of truth for an
   // in-drawer move at drop. Read at dragEnd (the dwell-then-release value is correct
   //, it holds the folder the spring drilled into). Cleared on end/cancel.
   const hoveredDrawerTargetRef = useRef<DrawerDropTarget | null>(null);
   // Reactive mirror of `hoveredDrawerTargetRef` for the drop INDICATORS:
   // the folder nest highlight + items-area highlight read this so the highlight matches
   // the full-row resolver drop, not dnd-kit's center-only `over`. Updated only when the
   // resolved target's key CHANGES (the ref stays the per-frame truth read at drop), and
   // scoped to resolver-driven drags (drawer moves), sheet/tab saves keep their dnd-kit
   // `over` indicator path so a center-only save never shows a full-row highlight.
   const [drawerDropTarget, setDrawerDropTarget] = useState<DrawerDropTarget | null>(null);
   const drawerDropTargetKeyRef = useRef<string | null>(null);
   // The live cursor each move, so a spring nav can anchor the post-nav grace below.
   const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
   // After a spring nav the view reflows under the STATIONARY cursor (e.g. at root the
   // Back button vanishes and a folder row slides up into the cursor), which would make
   // that folder an accidental drop target. While this anchor is set, the drop target is
   // forced to the current folder until the cursor genuinely moves away (the grace), so
   // a dwell-then-release lands in the folder you navigated to. Cleared on real movement.
   const navGraceAnchorRef = useRef<{ x: number; y: number } | null>(null);

   const {
      springTarget,
      workspaceDwellKey,
      setWorkspaceDwellKey,
      draggedFolderIdRef,
      springNavigatingRef,
      springControllerRef,
      workspaceDwellControllerRef,
   } = useSpringNavigation({
      setDrawerCurrentFolderId,
      setActiveTab,
      setDrawerReceded,
      lastPointerRef,
      navGraceAnchorRef,
   });

   // Feed the morph engine a single resolved signal whenever the derived context or
   // the spring target changes. The arrow mirrors springDirection() for
   // the active dwell; the engine renders, knowing nothing of what the action means.
   useEffect(() => {
      let springArrow = null as ReturnType<typeof springDirection> | null;
      if (springTarget != null) {
         const target: SpringTarget = springTarget === SPRING_BACK_KEY
            ? { kind: 'back' }
            : springTarget.startsWith('tab:')
               ? { kind: 'tab', id: springTarget.slice(4) }
               : { kind: 'folder', id: springTarget };
         springArrow = springDirection(target);
      }
      setMorph({
         descriptor: dragContext ? MORPH_DESCRIPTORS[dragContext] : null,
         springKey: springTarget,
         springArrow,
         morph: forceMorph,
      });
   }, [dragContext, springTarget, forceMorph, setMorph]);

   /**
    * Recomputes the drag context from the current kind + over-zone + lane flag and
    * commits it to state only when it actually changes (the puck re-renders rarely).
    */
   const updateContext = useCallback(() => {
      // In-drawer zones come from the manual geometry target (full-row, reliable);
      // non-drawer zones (play area / sheet) come from `overZoneRef` (dnd-kit `over`,
      // set in handleDragOver). The manual target wins when present.
      const manual = hoveredDrawerTargetRef.current;
      const zone: DragOverZone = manual
         ? (manual.kind === 'current-folder' ? 'drawer-items' : 'drawer-nav')
         : overZoneRef.current;
      const next = deriveDragContext(dragKindRef.current, zone, isOverTabLaneRef.current, sheetCompatibleRef.current);
      if (next !== dragContextRef.current) {
         dragContextRef.current = next;
         setDragContext(next);
      }
   }, []);

   /**
    * Drag-scoped `pointermove` handler: pins the puck to the cursor via a cheap
    * direct DOM write, runs the generous tab-lane hit test (characters only), and
    * refreshes the context. Attached to `window` on start, detached on end/cancel.
    */
   const handlePointerMove = useCallback((event: PointerEvent) => {
      // Pin the cursor cluster to the pointer (imperative; no re-render).
      setCursor(event.clientX, event.clientY);
      lastPointerRef.current = { x: event.clientX, y: event.clientY };

      const rect = tabStripElRef.current?.getBoundingClientRect() ?? null;
      // The expanded Library overlays the tab strip, so the strip is unreachable - its generous "open as
      // tab" lane must NOT engage, or a character dragged over the Library header / breadcrumb (which sit
      // within that lane) falsely reads as "open as tab" (a stray + glyph). When receded for See-Workspace
      // the strip is revealed again, so the lane is only suppressed while the Library actually covers it.
      const generalState = useAppGeneralStateStore.getState();
      const tabStripCovered = generalState.isDrawerExpanded && !generalState.isDrawerReceded;
      const overLane = !tabStripCovered && isOverTabLaneFor(dragKindRef.current, rect, event.clientX, event.clientY);
      if (overLane !== isOverTabLaneRef.current) {
         isOverTabLaneRef.current = overLane;
         setIsOverTabLane(overLane);
      }

      // Live-geometry hit-test of the drawer (re-queried each move, so scroll- and
      // navigation-correct by construction). Folder rows + Back drive the spring nav;
      // folder rows + the whole drawer panel drive the manual in-drawer DROP target.
      const backEl = document.querySelector('[data-drawer-back]');
      const backRect = backEl ? backEl.getBoundingClientRect() : null;
      const folders: SpringHitArea[] = Array.from(
         document.querySelectorAll<HTMLElement>('[data-folder-id]'),
      ).flatMap((el) => (el.dataset.folderId ? [{ id: el.dataset.folderId, rect: el.getBoundingClientRect() }] : []));
      const itemsAreaEl = document.querySelector('[data-drawer-items-area]');
      const itemsAreaRect = itemsAreaEl ? itemsAreaEl.getBoundingClientRect() : null;
      // Either drawer surface (the side panel or the Expanded Library) counts as the in-drawer panel for
      // the current-folder catch-all; only one is mounted at a time.
      const drawerPanelEl = document.querySelector('[data-drawer-panel]');
      const drawerPanelRect = drawerPanelEl ? drawerPanelEl.getBoundingClientRect() : null;

      const drawerTarget = resolveSpringTarget(
         folders,
         backRect,
         event.clientX,
         event.clientY,
         draggedFolderIdRef.current,
      );

      // Post-nav grace: once the cursor moves NAV_GRACE_PX from where a spring nav left
      // it, resume honoring folder-row drop targets normally.
      if (navGraceAnchorRef.current) {
         const dx = event.clientX - navGraceAnchorRef.current.x;
         const dy = event.clientY - navGraceAnchorRef.current.y;
         if (Math.hypot(dx, dy) > NAV_GRACE_PX) navGraceAnchorRef.current = null;
      }

      // The instantaneous in-drawer drop target (NOT the dwell target): the source of
      // truth for an in-drawer move at drop, replacing dnd-kit's center-only collision.
      // A folder row nests; the items body resolves to the current folder; chrome (the
      // header, breadcrumb, search, folder-nav) resolves to nothing - so no glyph there.
      // During the post-nav grace, force the current folder (anywhere in the panel) so a
      // row that reflowed under the stationary cursor (Back vanishing at root) isn't an
      // accidental target, and a dwell-Back-then-release still lands in the new folder.
      const inDrawerPanel = !!drawerPanelRect &&
         event.clientX >= drawerPanelRect.left && event.clientX <= drawerPanelRect.right &&
         event.clientY >= drawerPanelRect.top && event.clientY <= drawerPanelRect.bottom;
      hoveredDrawerTargetRef.current = navGraceAnchorRef.current
         ? (inDrawerPanel ? { kind: 'current-folder' } : null)
         : resolveDrawerDropTarget(folders, itemsAreaRect, event.clientX, event.clientY, draggedFolderIdRef.current);

      // Mirror the resolved target into reactive state for the drop indicators, scoped to
      // the resolver-driven drags (drawer moves) and committed only when the target's key
      // CHANGES (never per frame). Sheet/tab saves resolve their target via dnd-kit `over`,
      // so they stay null here, their indicators ride that path, and no full-row highlight
      // is shown where the (center-only) save could not honor it.
      const moveKind = dragKindRef.current;
      const isDrawerMoveDrag =
         moveKind === 'drawer-character' || moveKind === 'drawer-component' || moveKind === 'drawer-folder';
      const nextDropTarget = isDrawerMoveDrag ? hoveredDrawerTargetRef.current : null;
      const nextDropKey = drawerDropTargetKey(nextDropTarget);
      if (nextDropKey !== drawerDropTargetKeyRef.current) {
         drawerDropTargetKeyRef.current = nextDropKey;
         setDrawerDropTarget(nextDropTarget);
      }

      // The morph context reads the SAME manual signal, so the "drawer-move" cluster
      // lights up full-row (not center-only). Recomputed after the hit-test above.
      updateContext();

      // Tab auto-nav: a dragged drawer COMPONENT or sheet item can dwell on a
      // background tab to spring-switch the active character mid-drag (then drop on
      // its sheet). Tabs never overlap the drawer, so the drawer target wins ties.
      const kind = dragKindRef.current;
      const canTabNav = kind === 'drawer-component' || kind === 'sheet-item';
      let tabTarget = null;
      if (canTabNav && !drawerTarget) {
         const tabAreas: SpringHitArea[] = Array.from(
            document.querySelectorAll<HTMLElement>('[data-tab-id]'),
         ).flatMap((el) => (el.dataset.tabId ? [{ id: el.dataset.tabId, rect: el.getBoundingClientRect() }] : []));
         tabTarget = resolveTabSpringTarget(tabAreas, event.clientX, event.clientY, useTabManagerStore.getState().activeTabId);
      }

      springControllerRef.current?.setTarget(drawerTarget ?? tabTarget);

      // Force-morph (the "full card only in the drawer items area" rule): decide by
      // real cursor geometry against the items-area rect, NOT dnd-kit's `over`.
      const overItemsArea = !!itemsAreaRect &&
         event.clientX >= itemsAreaRect.left && event.clientX <= itemsAreaRect.right &&
         event.clientY >= itemsAreaRect.top && event.clientY <= itemsAreaRect.bottom;
      const nextForce = shouldForceMorph(dragKindRef.current, overItemsArea);
      if (nextForce !== forceMorphRef.current) {
         forceMorphRef.current = nextForce;
         setForceMorph(nextForce);
      }

      // See-Workspace recede dwell: only while Expanded and dragging a drawer ITEM. Hit-test the strip
      // (when shown) or the re-expand edge (when receded) by live geometry, like the folder nav, and
      // feed the workspace dwell timer; the actual drop lands on the revealed workspace zone behind.
      const general = useAppGeneralStateStore.getState();
      const kindNow = dragKindRef.current;
      const isItemDrag = kindNow === 'drawer-character' || kindNow === 'drawer-component';
      let workspaceTarget: WorkspaceDwellTarget | null = null;
      if (general.isDrawerExpanded && isItemDrag) {
         const within = (selector: string) => {
            const rect = document.querySelector(selector)?.getBoundingClientRect() ?? null;
            return !!rect &&
               event.clientX >= rect.left && event.clientX <= rect.right &&
               event.clientY >= rect.top && event.clientY <= rect.bottom;
         };
         if (general.isDrawerReceded) {
            if (within('[data-reexpand-drawer]')) workspaceTarget = 'reexpand';
         } else if (within('[data-see-workspace]')) {
            workspaceTarget = 'see-workspace';
         }
      }
      workspaceDwellControllerRef.current?.setTarget(workspaceTarget);
   }, [updateContext, setCursor, draggedFolderIdRef, springControllerRef, workspaceDwellControllerRef]);

   /**
    * Reads the feedback values a drop routes against, as plain values taken in one call. Every one of
    * them is reset by `clearDragFeedback`, so the drop handler calls this FIRST and the routes read the
    * snapshot rather than the layer.
    */
   const readDragSnapshot = useCallback((): DragEndSnapshot => ({
      wasOverTabLane: isOverTabLaneRef.current,
      dragKind: dragKindRef.current,
      manualDrawerTarget: hoveredDrawerTargetRef.current,
      // The last cursor position, for a board drop's world placement (cleared by cleanup).
      dropPointer: lastPointerRef.current,
   }), []);

   /**
    * Tears down the feedback layer: detaches the move listener and clears every
    * ref + its mirrored state. Called from both `handleDragEnd` and the cancel path
    * (and on unmount) so nothing leaks across drags.
    */
   const clearDragFeedback = useCallback(() => {
      window.removeEventListener('pointermove', handlePointerMove);
      dragKindRef.current = null;
      tabStripElRef.current = null;
      overZoneRef.current = null;
      if (isOverTabLaneRef.current) {
         isOverTabLaneRef.current = false;
         setIsOverTabLane(false);
      }
      if (dragContextRef.current) {
         dragContextRef.current = null;
         setDragContext(null);
      }
      // Abort any pending spring dwell (a drop / cancel must win over navigation).
      springControllerRef.current?.cancel();
      draggedFolderIdRef.current = null;
      springNavigatingRef.current = false;
      dragSourceCharacterIdRef.current = null;
      sheetCompatibleRef.current = true;
      hoveredDrawerTargetRef.current = null;
      if (drawerDropTargetKeyRef.current !== null) {
         drawerDropTargetKeyRef.current = null;
         setDrawerDropTarget(null);
      }
      navGraceAnchorRef.current = null;
      lastPointerRef.current = null;
      if (forceMorphRef.current) {
         forceMorphRef.current = false;
         setForceMorph(false);
      }
      setSheetHighlight(null);
      setIsIncompatibleComponentDrag(false);
      // See-Workspace: abort the dwell and re-expand on EVERY drag end/cancel, so a dropped or
      // Escape-cancelled drag never strands the user looking at the receded workspace.
      workspaceDwellControllerRef.current?.cancel();
      setWorkspaceDwellKey(null);
      setIsDrawerItemDragActive(false);
      setIsFolderDragActive(false);
      if (useAppGeneralStateStore.getState().isDrawerReceded) setDrawerReceded(false);
      // Clear the morph feedback (clone funnel + cursor cluster).
      resetMorph();
   }, [handlePointerMove, resetMorph, setDrawerReceded, draggedFolderIdRef, springNavigatingRef, springControllerRef, workspaceDwellControllerRef, setWorkspaceDwellKey]);

   // Safety net: never leak the window listener if the sheet unmounts mid-drag.
   useEffect(() => () => window.removeEventListener('pointermove', handlePointerMove), [handlePointerMove]);

   return {
      // Mirrored state, for the JSX. Each one can lag its ref by a commit; no drop routes against these.
      drawerDropTarget,
      isOverTabLane,
      sheetHighlight,
      isIncompatibleComponentDrag,
      isDrawerItemDragActive,
      isFolderDragActive,
      springTarget,
      workspaceDwellKey,
      // The refs and flags `handleDragStart` arms and `handleDragOver` refreshes.
      dragKindRef,
      tabStripElRef,
      isOverTabLaneRef,
      overZoneRef,
      sheetCompatibleRef,
      dragSourceCharacterIdRef,
      draggedFolderIdRef,
      setIsDrawerItemDragActive,
      setIsFolderDragActive,
      setSheetHighlight,
      setIsIncompatibleComponentDrag,
      // The move listener (attached at drag start), the context recompute, and the drop-time read + teardown.
      handlePointerMove,
      updateContext,
      readDragSnapshot,
      clearDragFeedback,
   };
}
