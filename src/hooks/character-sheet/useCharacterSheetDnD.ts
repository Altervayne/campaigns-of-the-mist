// -- React Imports --
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import type { DragStartEvent, DragOverEvent } from '@dnd-kit/core';

// -- Utils Imports --
import { MORPH_DESCRIPTORS, SPRING_BACK_KEY, deriveDragContext, drawerDropTargetKey, isOverTabLaneFor, resolveDrawerDropTarget, resolveSpringTarget, resolveTabSpringTarget, shouldForceMorph, springDirection } from '@/lib/utils/dragFeedback';
import { sheetSectionForItemType } from '@/lib/utils/dnd';
import { DRAG_TYPES } from '@/lib/constants/dragDrop';

// -- Local Imports --
import { classifyDrag, NAV_GRACE_PX } from '@/hooks/character-sheet/dnd/dragClassification';
import { useDragEndRouter } from '@/hooks/character-sheet/dnd/useDragEndRouter';
import { useDrawerSaveActions } from '@/hooks/character-sheet/dnd/useDrawerSaveActions';
import { useSheetReorderActions } from '@/hooks/character-sheet/dnd/useSheetReorderActions';
import { useSpringNavigation } from '@/hooks/character-sheet/dnd/useSpringNavigation';

// -- Drag-morph engine --
import { useDragMorph } from '@/components/molecules/drag-morph/useDragMorph';
import { buildDragIdentity } from '@/hooks/character-sheet/buildDragIdentity';

// -- Store Imports --
import { useCharacterStore, useCharacterActions } from '@/lib/stores/characterStore';
import { useTabManagerActions, useTabManagerStore } from '@/lib/character/tabManagerStore';
import { useDrawerStore, useDrawerActions } from '@/lib/stores/drawerStore';
import { useAppSettingsActions } from '@/lib/stores/appSettingsStore';
import { useAppGeneralStateActions, useAppGeneralStateStore } from '@/lib/stores/appGeneralStateStore';

// -- Type Imports --
import type { Journal } from '@/lib/types/board';
import type { DragEndSnapshot } from '@/hooks/character-sheet/dnd/dragEndDeps';
import type { WorkspaceDwellTarget } from '@/hooks/character-sheet/dnd/dragClassification';
import type { Card as CardData, Tracker } from '@/lib/types/character';
import type { DrawerItem, Folder as FolderType } from '@/lib/types/drawer';
import type { OpenTab } from '@/lib/character/tabManagerStore';
import type { DragContext, DragKind, DragOverZone, DrawerDropTarget, SpringHitArea, SpringTarget } from '@/lib/utils/dragFeedback';



/**
 * Owns the entire character-sheet drag-and-drop subsystem.
 *
 * Encapsulates the active drag item and hover state, the memoized SortableContext
 * id arrays, and the full set of @dnd-kit event handlers. `handleDragEnd` routes
 * every supported drop - drawer-to-sheet character loads and component imports,
 * sheet-to-drawer saves, in-drawer moves and reorders, and on-sheet reordering -
 * by inspecting the drag source and target and dispatching directly to the
 * character and drawer store actions. The page only forwards `handleDragStart`,
 * `handleDragOver`, and `handleDragEnd` to its `DndContext` and wires the returned
 * id arrays and drag state into its JSX.
 *
 * The three sheet drop zones (trackers, cards, main play area) are intentionally
 * NOT registered here: `useDroppable` only resolves against a `DndContext` when
 * it is called inside that context's subtree, and this hook runs in the page body
 * that renders the `DndContext` (so it is above it, not within). The zones
 * therefore self-register inside their descendant components (`TrackersSection`,
 * `CardsSection`, `SheetMainDropZone`).
 *
 * @returns The drag state, memoized id arrays, and the `DndContext` event
 *   handlers.
 */
export function useCharacterSheetDnD() {
   const { t: tNotifications } = useTranslation();

   const character = useCharacterStore((state) => state.character);
   const { reorderSheetLayout, reorderStatuses, reorderStoryTags, reorderStoryThemes,
            addImportedCard, addImportedTracker, addImportedJournal } = useCharacterActions();
   const { openCharacterTab, openBoardTab, openNoteTab, reorderTabs, setActiveTab } = useTabManagerActions();
   // The drawer renders a single folder at a time, so the loaded current-folder
   // view is the reorder scope for any in-drawer drag.
   const currentFolderView = useDrawerStore((state) => state.currentFolderView);
   const { initiateItemDrop, moveFolder, reorderFolders, moveItem, reorderItems, setDrawerCurrentFolderId } = useDrawerActions();
   const { setContextualGame } = useAppSettingsActions();
   const { setDrawerOpen, setDrawerReceded, contractDrawer } = useAppGeneralStateActions();

   // ==================
   //  Utility & Library States
   // ==================
   const [isOverDrawer, setIsOverDrawer] = useState(false);
   const [activeDragItem, setActiveDragItem] = useState<CardData | Tracker | Journal | DrawerItem | FolderType | null>(null);
   const [overDragId, setOverDragId] = useState<string | null>(null);
   // The tab being dragged (the strip shares this DndContext); drives the overlay's
   // tab-preview branch. Separate from `activeDragItem` since a tab is not a sheet item.
   const [activeTabDrag, setActiveTabDrag] = useState<OpenTab | null>(null);

   // Memoize SortableContext arrays to prevent unnecessary re-renders
   const statusIds = useMemo(
      () => character?.trackers.statuses.map(t => t.id) || [],
      [character?.trackers.statuses]
   );
   const storyTagIds = useMemo(
      () => character?.trackers.storyTags.map(t => t.id) || [],
      [character?.trackers.storyTags]
   );
   const storyThemeIds = useMemo(
      () => character?.trackers.storyThemes.map(t => t.id) || [],
      [character?.trackers.storyThemes]
   );

   // ==================
   //  Drag-feedback layer: context derivation + generous tab lane
   // ==================
   // `dragContext`/`isOverTabLane` are React state (feed the morph engine and the
   // strip highlight); their `*Ref` twins are the truth read inside `handleDragEnd`,
   // where the matching state can lag. `tabStripElRef` caches the strip element
   // (queried once at drag start) for the generous geometry test. The cursor itself
   // is positioned imperatively by the morph engine (see below), not here.
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
   // Gates the 'add-to-sheet' glyph: no action possible → no glyph (still morphs).
   const sheetCompatibleRef = useRef(true);
   // Reactive flag for the whole drag of a game-incompatible component, driving the
   // large "can't drop here" overlay over the sheet (issue 5). Set once at drag start.
   const [isIncompatibleComponentDrag, setIsIncompatibleComponentDrag] = useState(false);
   // The character a dragged SHEET item came from, so a drop on a DIFFERENT tab's
   // sheet (after tab auto-nav) imports a copy rather than a no-op reorder.
   const dragSourceCharacterIdRef = useRef<string | null>(null);

   // ==================
   //  Drag-morph engine
   // ==================
   // The reusable overlay-feedback engine (funnel clone + cursor cluster). This hook
   // computes the signals (cursor, descriptor, spring) and feeds them in; the engine
   // owns only the visual choreography and knows nothing of drawers/tabs/navigation.
   const { captureGrab, setCursor, setMorph, setIdentity, reset: resetMorph, renderClone, renderCluster } = useDragMorph();

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

   const handleDragStart = useCallback((event: DragStartEvent) => {
      const { active } = event;

      // Arm the drag-feedback layer for every drag: classify the source, cache the
      // strip element for the lane test, and attach the move listener.
      dragKindRef.current = classifyDrag(active);
      // A drawer ITEM drag (not a folder) gets the See-Workspace strip while Expanded.
      setIsDrawerItemDragActive(dragKindRef.current === 'drawer-character' || dragKindRef.current === 'drawer-component');
      // A FOLDER drag shows the reorder drop slots in every drawer view (so a drilled-into folder can host it).
      setIsFolderDragActive(dragKindRef.current === 'drawer-folder');
      tabStripElRef.current = document.querySelector<HTMLElement>('[data-tab-strip]');
      isOverTabLaneRef.current = false;
      overZoneRef.current = null;
      // The dragged folder is excluded as a spring target (can't drill into what you hold).
      draggedFolderIdRef.current = dragKindRef.current === 'drawer-folder' ? String(active.id) : null;
      window.addEventListener('pointermove', handlePointerMove);

      // Capture the grab point so the clone funnels toward the cursor, not the card
      // center. dnd-kit provides the dragged element's initial rect + the activator.
      const activator = event.activatorEvent as PointerEvent | null;
      const initialRect = event.active.rect.current.initial;
      if (initialRect && activator && typeof activator.clientX === 'number') {
         captureGrab(initialRect, activator.clientX, activator.clientY);
      }

      // A tab drag is previewed via its own overlay branch, not as a sheet item.
      // Auto-open the drawer so the tab→drawer save has visible drop targets (the
      // chosen affordance; it does not auto-close).
      const untitledLabel = tNotifications('Tabs.untitled');

      if (active.data.current?.type === DRAG_TYPES.TAB) {
         // Preview the tab by its real kind (board/note/character), so the overlay renders the
         // board/note preview rather than the character default. The strip carries only the tab id,
         // so the kind is read from the tab manager.
         const draggedTab = useTabManagerStore.getState().openTabs.find((openTab) => openTab.id === String(active.id));
         setActiveTabDrag(draggedTab ?? { id: String(active.id), type: 'character' });
         setDrawerOpen(true);
         setIdentity(buildDragIdentity({ kind: dragKindRef.current, active, untitledLabel }));
         return;
      }

      if (active.data.current?.isDrawer) {
         const drawerItem = active.data.current.item as DrawerItem | FolderType;
         setActiveDragItem(drawerItem);
         setIdentity(buildDragIdentity({ kind: dragKindRef.current, active, untitledLabel }));
         // A component dragged while a character of a DIFFERENT game is loaded can't be
         // dropped on the sheet, flag it to show the "can't drop here" overlay. NEUTRAL
         // items are game-agnostic, so they are never incompatible.
         if (
            dragKindRef.current === 'drawer-component' && character &&
            (drawerItem as DrawerItem).game !== 'NEUTRAL' &&
            (drawerItem as DrawerItem).game !== character.game
         ) {
            setIsIncompatibleComponentDrag(true);
         }
         return;
      }

      const allSheetItems = [...(character?.cards || []), ...(character?.journals || []), ...(character?.trackers.statuses || []), ...(character?.trackers.storyTags || []), ...(character?.trackers.storyThemes || [])];
      const item = allSheetItems.find(i => i.id === active.id);
      if (item) {
         setActiveDragItem(item);
         setIdentity(buildDragIdentity({ kind: dragKindRef.current, active, sheetItem: item, untitledLabel }));
         // Remember the source character so a drop on a DIFFERENT tab's sheet (after
         // tab auto-nav) imports a copy instead of a no-op same-character reorder.
         dragSourceCharacterIdRef.current = character?.id ?? null;
      }
   }, [character, setDrawerOpen, handlePointerMove, captureGrab, setIdentity, tNotifications, draggedFolderIdRef]);

   const handleDragOver = useCallback((event: DragOverEvent) => {
      const { active, over } = event;

      // A tab drag reorders within the strip's SortableContext and never touches the
      // sheet zones, but it CAN save into the drawer, so light the drawer items-area
      // while it is held over the drawer (mirroring a sheet-item save), then bail out of
      // the sheet/zone logic below.
      if (active.data.current?.type === DRAG_TYPES.TAB) {
         // Light the items-BODY dropzone only when over it, not over a folder/Back (a
         // tab save INTO a folder still works via the dnd-kit `over` at drop).
         const overId = over?.id.toString();
         setIsOverDrawer(overId?.startsWith('drawer-drop-zone-') ?? false);
         // Over the board, a tab morphs to the "add to board" glyph (like a drawer character):
         // feed the board over-zone so updateContext derives 'add-to-board'; elsewhere it carries
         // no zone (reorder / drawer-save show no morph).
         overZoneRef.current = overId === 'board-drop-zone' ? 'board' : null;
         updateContext();
         return;
      }

      setOverDragId(over ? over.id.toString() : null);

      let isHoveringDrawer = false;
      // The actionable surface under the cursor. The drawer splits into its items
      // area (reorder/land) and its nav area (folders, folder slots, Back). The thin
      // tab strip is handled by the generous pointermove test, not here.
      let zone: DragOverZone = null;
      let highlight: 'cards' | 'trackers' | null = null;
      if (over) {
        const activeType = active.data.current?.type as string;
        const overId = over.id.toString();
        const overType = over.data.current?.type as string | undefined;
        // Light the drawer items-BODY dropzone only when the cursor is actually over it
        // (`drawer-drop-zone-<id>`), NOT over a folder/Back, those are their own targets,
        // and lighting the body while aiming at a folder is misleading. A save INTO a
        // folder still works via the dnd-kit `over` at drop (handleSheetToDrawerDrop).
        const overIsItemsBody = overId.startsWith('drawer-drop-zone-');

         if (activeType?.startsWith('sheet-') && overIsItemsBody) {
            isHoveringDrawer = true;
         }

         if (overId === 'main-character-drop-zone') {
            zone = 'play-area';
         } else if (overId === 'board-drop-zone') {
            zone = 'board';
         } else if (
            overId === 'character-sheet-main-drop-zone' || overId === 'tracker-drop-zone' || overId === 'card-drop-zone'
         ) {
            // Only the explicit sheet zones (resolved via pointerWithin when the cursor
            // is truly over them) count as 'sheet', NOT a closestCenter-snapped
            // sheet-card/tracker, which would mislabel neutral space.
            zone = 'sheet';
         } else if (overId.startsWith('drawer-drop-zone-') || overType === 'drawer-item') {
            zone = 'drawer-items';
         } else if (overType === 'drawer-folder' || overType === 'drawer-drop-zone' || overId.startsWith('drawer-back-button-')) {
            zone = 'drawer-nav';
         }

         // Content-aware sheet highlight: over the play area, only the section that
         // matches the dragged drawer item's type lights up (the drop is still
         // accepted anywhere on the sheet and routed by type). Game-incompatible
         // items neither highlight nor get an action glyph (no possible action).
         if (zone === 'sheet' && activeType === 'drawer-item' && character) {
            const item = active.data.current?.item as DrawerItem | undefined;
            // NEUTRAL items are game-agnostic, so they light the section on any sheet.
            const compatible = !!item && (item.game === 'NEUTRAL' || item.game === character.game);
            sheetCompatibleRef.current = compatible;
            if (compatible && item) highlight = sheetSectionForItemType(item.type);
         } else {
            sheetCompatibleRef.current = true;
         }
      } else {
         sheetCompatibleRef.current = true;
      }

      setIsOverDrawer(isHoveringDrawer);
      setSheetHighlight(highlight);
      // Only the NON-drawer zones come from dnd-kit's `over`; the in-drawer zones are
      // owned by the manual geometry target (set in handlePointerMove → updateContext),
      // which is reliable full-row where dnd-kit's collision is center-only.
      overZoneRef.current = zone === 'play-area' || zone === 'sheet' || zone === 'board' ? zone : null;
      updateContext();
   }, [updateContext, character]);

   // ==================
   //  Drop actions: on-sheet reorders + drawer saves
   // ==================
   const { handleSheetLayoutReorder, handleSheetTrackerReorder } = useSheetReorderActions({
      character,
      reorderSheetLayout,
      reorderStatuses,
      reorderStoryTags,
      reorderStoryThemes,
   });
   const { handleSheetToDrawerDrop, saveTabToDrawer, saveBoardTabToDrawer, saveNoteTabToDrawer } = useDrawerSaveActions({ initiateItemDrop });

   // ==================
   //  Drop routing: the ordered handleDragEnd chain
   // ==================
   const handleDragEnd = useDragEndRouter({
      character,
      currentFolderView,
      activeDragItem,
      dragSourceCharacterIdRef,
      tNotifications,
      moveFolder,
      reorderFolders,
      moveItem,
      reorderItems,
      openCharacterTab,
      openBoardTab,
      openNoteTab,
      reorderTabs,
      setActiveTab,
      setContextualGame,
      addImportedCard,
      addImportedTracker,
      addImportedJournal,
      handleSheetLayoutReorder,
      handleSheetTrackerReorder,
      handleSheetToDrawerDrop,
      saveTabToDrawer,
      saveBoardTabToDrawer,
      saveNoteTabToDrawer,
      readDragSnapshot,
      clearDragFeedback,
      contractDrawer,
      setDrawerReceded,
      setActiveDragItem,
      setIsOverDrawer,
      setOverDragId,
      setActiveTabDrag,
   });

   /**
    * Clears all transient drag state when a drag is cancelled (Escape, or a drop
    * outside any droppable). Mirrors the reset at the top of `handleDragEnd` so the
    * overlay (including a tab preview) never lingers after a cancelled drag.
    */
   const handleDragCancel = useCallback(() => {
      setActiveDragItem(null);
      setIsOverDrawer(false);
      setOverDragId(null);
      setActiveTabDrag(null);
      clearDragFeedback();
   }, [clearDragFeedback]);

   return {
      activeDragItem,
      activeTabDrag,
      overDragId,
      isOverDrawer,
      // Resolved full-row in-drawer drop target, driving the folder nest + items-area
      // highlights so they match the drop.
      drawerDropTarget,
      statusIds,
      storyTagIds,
      storyThemeIds,
      handleDragStart,
      handleDragOver,
      handleDragEnd,
      handleDragCancel,
      // Strip highlight: the generous tab-lane flag.
      isOverTabLane,
      // The active dwell target id (folder id or the Back sentinel), for the static
      // row/Back highlight.
      springTarget,
      // See-Workspace: whether to show the strip (a drawer-item drag) and which recede dwell is
      // in progress ('see-workspace' | 'reexpand' | null), for the strip/edge progress cue.
      isDrawerItemDragActive,
      workspaceDwellKey,
      // True while a folder is dragged, so the drawer surfaces show the reorder slots in any view.
      isFolderDragActive,
      // Content-aware sheet highlight: which section to light up.
      sheetHighlight,
      // True while a game-incompatible component is dragged with a character loaded,
      // driving the "can't drop here" overlay.
      isIncompatibleComponentDrag,
      // Drag-morph engine slots: clone goes inside <DragOverlay>, cluster is a sibling.
      renderClone,
      renderCluster,
   };
}
