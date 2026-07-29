// -- React Imports --
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import toast from 'react-hot-toast';
import type { DragEndEvent, DragStartEvent, DragOverEvent } from '@dnd-kit/core';

// -- Utils Imports --
import { mapItemToStorableInfo } from '@/lib/utils/dnd';
import { MORPH_DESCRIPTORS, SPRING_BACK_KEY, deriveDragContext, drawerDropTargetKey, isOverTabLaneFor, resolveDrawerDropTarget, resolveSpringTarget, resolveTabSpringTarget, shouldForceMorph, springDirection } from '@/lib/utils/dragFeedback';
import { sheetSectionForItemType } from '@/lib/utils/dnd';
import { DRAG_TYPES } from '@/lib/constants/dragDrop';

// -- Local Imports --
import { classifyDrag, NAV_GRACE_PX } from '@/hooks/character-sheet/dnd/dragClassification';
import { useDrawerSaveActions } from '@/hooks/character-sheet/dnd/useDrawerSaveActions';
import { useSheetReorderActions } from '@/hooks/character-sheet/dnd/useSheetReorderActions';
import { useSpringNavigation } from '@/hooks/character-sheet/dnd/useSpringNavigation';

// -- Drag-morph engine --
import { useDragMorph } from '@/components/molecules/drag-morph/useDragMorph';
import { buildDragIdentity } from '@/hooks/character-sheet/buildDragIdentity';

// -- Store Imports --
import { useCharacterStore, useCharacterActions } from '@/lib/stores/characterStore';
import { useTabManagerActions, useTabManagerStore } from '@/lib/character/tabManagerStore';
import { getOrCreateInstance } from '@/lib/character/characterStoreRegistry';
import { useDrawerStore, useDrawerActions } from '@/lib/stores/drawerStore';
import { getChildFolders, whenFolderTreeSettled } from '@/lib/drawer/drawerFolderTree';
import { useAppSettingsActions } from '@/lib/stores/appSettingsStore';
import { useAppGeneralStateActions, useAppGeneralStateStore } from '@/lib/stores/appGeneralStateStore';
import { getActiveBoardStore } from '@/lib/board/boardStoreRegistry';

// -- Board Imports --
import { boardDropPlacement } from '@/lib/board/boardDropPlacement';
import { embeddedSpecForDrawerItem, embeddedSpecForComponent, characterElementSpec } from '@/lib/board/embedDrawerItem';
import { importBoard } from '@/lib/board/boardRepository';
import { importNote } from '@/lib/notes/noteRepository';

// -- Type Imports --
import type { Board, Journal, Note } from '@/lib/types/board';
import type { WorkspaceDwellTarget } from '@/hooks/character-sheet/dnd/dragClassification';
import type { Character, Card as CardData, Tracker } from '@/lib/types/character';
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

   const handleDragEnd = useCallback((event: DragEndEvent) => {
      const { active, over } = event;

      // Read the feedback refs BEFORE tearing them down (clearDragFeedback resets them).
      const wasOverTabLane = isOverTabLaneRef.current;
      const dragKind = dragKindRef.current;
      const manualDrawerTarget = hoveredDrawerTargetRef.current;
      // The last cursor position, for a board drop's world placement (cleared by cleanup).
      const dropPointer = lastPointerRef.current;
      // Read the drawer's expand/recede state before clearDragFeedback tears it down: once an item lands
      // on the workspace, the Library's search/nav job is done, so leave the drawer as the reduced side
      // panel. If the drop came from the receded See-Workspace state, clearDragFeedback just un-receded it,
      // which would slide the Library back UP into view as the overlay contracts (a flash). Re-recede so it
      // stays off-screen through the exit - only the reduced side panel is seen opening; ExpandedDrawer
      // clears the flag when it unmounts. Only the successful workspace-drop branches call this; a no-op /
      // cancel leaves clearDragFeedback's un-recede in place, restoring the Library.
      const wasDrawerExpanded = useAppGeneralStateStore.getState().isDrawerExpanded;
      const wasDrawerReceded = useAppGeneralStateStore.getState().isDrawerReceded;
      const contractIfExpanded = () => {
         if (!wasDrawerExpanded) return;
         contractDrawer();
         if (wasDrawerReceded) setDrawerReceded(true);
      };

      // Embeds the dragged sheet component as a self-contained board copy at the drop point.
      // Shared by SCENARIO 2.0a's two entry paths: the dnd-kit `board-drop-zone` hit, and the
      // geometry fallback for a board tab reached by a mid-drag spring nav (see below).
      const dropSheetItemOnBoard = () => {
         const boardStore = getActiveBoardStore();
         if (!boardStore || !activeDragItem) return;
         // A card, tracker, OR journal: embeddedSpecForComponent forks on the shape (a bare Journal drops
         // as a board journal copy), so no separate journal branch is needed here.
         const spec = embeddedSpecForComponent(activeDragItem as CardData | Tracker | Journal);
         if (!spec) return;
         void boardStore.getState().actions.addItem({
            ...boardDropPlacement(boardStore, dropPointer, spec),
            kind: spec.kind,
            content: spec.content,
         });
         contractIfExpanded();
      };

      setActiveDragItem(null);
      setIsOverDrawer(false);
      setOverDragId(null);
      setActiveTabDrag(null);
      clearDragFeedback();

      // ##################################################
      // ###   Generous tab lane (drawer character)     ###
      // ##################################################
      // A character released anywhere in the padded top band opens/focuses its tab,
      // even when @dnd-kit's thin `tab-strip-drop-zone` was missed (so this runs
      // BEFORE the `over` null-guard). The kind guard keeps it character-only.
      if (wasOverTabLane && dragKind === 'drawer-character') {
         const draggedItem = active.data.current?.item as DrawerItem | undefined;
         if (draggedItem?.type === 'FULL_CHARACTER_SHEET') {
            const characterData = draggedItem.content as Character;
            openCharacterTab(characterData, draggedItem.id); // append-or-focus
            setContextualGame(characterData.game);
            contractIfExpanded();
         }
         return;
      }

      // ##################################################
      // ###   Manual in-drawer drop targeting          ###
      // ##################################################
      // For a drawer-sourced drag, the in-drawer DROP target is resolved by live cursor
      // geometry, NOT dnd-kit's `over`, its collision rects desync in
      // the scrollable/animated drawer (folder drops were center-only). This runs BEFORE
      // the `over` null-guard so an off-center drop the collision missed still lands.
      // A folder-row target moves into that folder; a current-folder target (Back, the
      // items body, anywhere else in the drawer) moves into the folder currently being
      // VIEWED, read live from the store, so a dwell-Back-then-release lands in the
      // folder you navigated to (not its parent). Same-folder current-folder drops fall
      // through to the dnd-kit reorder path below.
      const activeIsDrawerMove =
         dragKind === 'drawer-character' || dragKind === 'drawer-component' || dragKind === 'drawer-folder';
      if (activeIsDrawerMove) {
         const draggedId = active.id.toString();
         const isFolderDrag = dragKind === 'drawer-folder';

         // Folder onto a reorder SLOT → place at that exact position, ahead of the generic
         // folder-row / current-folder handling so the user lands where the highlighted slot
         // shows. When the dragged folder is already in this view it is a pure reorder; when
         // it arrived via a spring navigation it is moved into the current folder and then
         // slotted into place (an append + reorder, hence two undo steps). Driven by dnd-kit's
         // `over` (the drop-zone droppable), so it must run independently of the geometry resolver:
         // the slots sit in the folder-nav region the resolver excludes, so its target is null there.
         if (isFolderDrag && over?.data.current?.type === 'drawer-drop-zone') {
            const destParentId = useDrawerStore.getState().currentFolderId ?? null;
            // Folder scope comes from the folder-tree cache (the store no longer carries folders).
            const scope = getChildFolders(destParentId);
            const { targetId } = over.data.current as { targetId: string };
            const fromIndex = scope.findIndex((f) => f.id === draggedId);
            const slotIndex = targetId === 'last' ? scope.length : scope.findIndex((f) => f.id === targetId);
            if (fromIndex !== -1) {
               let newIndex = targetId === 'last' ? scope.length - 1 : slotIndex;
               if (newIndex !== -1) {
                  if (fromIndex < newIndex) newIndex -= 1;
                  if (fromIndex !== newIndex) void reorderFolders(destParentId, fromIndex, newIndex);
               }
            } else {
               const targetIndex = slotIndex < 0 ? scope.length : slotIndex;
               void (async () => {
                  await moveFolder(draggedId, destParentId ?? undefined);
                  // The move re-derived the cache; read the appended position back from it to slot it in.
                  await whenFolderTreeSettled();
                  const after = getChildFolders(destParentId);
                  const appendedIndex = after.findIndex((f) => f.id === draggedId);
                  if (appendedIndex !== -1 && appendedIndex !== targetIndex) {
                     await reorderFolders(destParentId, appendedIndex, targetIndex);
                  }
               })();
            }
            return;
         }

         // The remaining in-drawer drops need the geometry-resolved target: nest onto a folder ROW, or
         // move into the VIEWED folder (the items body / Back). When it is null - the cursor is over
         // chrome (header / breadcrumb / search) - there is nothing more to do here.
         if (manualDrawerTarget) {
            if (manualDrawerTarget.kind === 'folder') {
               if (manualDrawerTarget.id !== draggedId) {
                  if (isFolderDrag) void moveFolder(draggedId, manualDrawerTarget.id);
                  else void moveItem(draggedId, manualDrawerTarget.id);
               }
               return;
            }
            // current-folder: move into the folder being VIEWED, unless the dragged item is
            // ALREADY a child of it (then fall through to reorder). The source of truth is
            // the loaded current-folder view, NOT the drag data's `parentFolderId`, which is
            // stale/null after a spring navigation (it reported ROOT for an item dragged from
            // a folder, making a real cross-folder drop look like a same-folder no-op).
            const currentFolderId = useDrawerStore.getState().currentFolderId ?? null;
            const view = useDrawerStore.getState().currentFolderView;
            const alreadyInCurrentFolder = isFolderDrag
               ? getChildFolders(currentFolderId).some((f) => f.id === draggedId)
               : (view?.items ?? []).some((i) => i.id === draggedId);
            if (!alreadyInCurrentFolder) {
               if (isFolderDrag) void moveFolder(draggedId, currentFolderId ?? undefined);
               else void moveItem(draggedId, currentFolderId ?? undefined);
               return;
            }
            // Already in the current folder → fall through to the dnd-kit reorder path below.
         }
      }

      // ##################################################
      // ###   Sheet → board via mid-drag spring nav    ###
      // ##################################################
      // A sheet item dropped on the board after spring-navigating to the board tab MID-DRAG:
      // BoardView's `board-drop-zone` droppable mounts during the drag, so dnd-kit never measures
      // it and `over` is not `board-drop-zone` (often null), which would fall through to the reorder
      // path below. Resolve it by real cursor geometry instead, matching how the drawer force-morph
      // and nav-grace already trust the live pointer over dnd-kit's `over`. Guarded so it fires ONLY
      // for a sheet drag with a live board tab and a real pointer inside the board canvas, so it can
      // never hijack a sheet or drawer target. Runs BEFORE the `over` null-guard for the null case.
      if (dragKind === 'sheet-item' && dropPointer && getActiveBoardStore()) {
         const clip = document.querySelector('[data-board-clip]') as HTMLElement | null;
         const rect = clip?.getBoundingClientRect() ?? null;
         const overBoard = !!rect &&
            dropPointer.x >= rect.left && dropPointer.x <= rect.right &&
            dropPointer.y >= rect.top && dropPointer.y <= rect.bottom;
         if (overBoard) {
            dropSheetItemOnBoard();
            return;
         }
      }

      if (!over || active.id === over.id) {
         return;
      }

      const activeType = active.data.current?.type as string;
      const overType = over.data.current?.type as string;
      const overIdStr = over.id.toString();

      // ##########################################
      // ###   BRANCH 0: Reordering tab strip   ###
      // ##########################################
      // A tab reorders against another tab, or saves to the drawer when dropped on a
      // drawer target (collision detection scopes a tab drag to those two). Reorder
      // persistence is the TabManager's; the save creates a new linked drawer copy.
      if (activeType === DRAG_TYPES.TAB) {
         const tabId = (active.data.current?.tabId as string) ?? String(active.id);
         if (overType === DRAG_TYPES.TAB) {
            reorderTabs(String(active.id), String(over.id));
         } else if (overIdStr.startsWith('drawer-drop-zone-') || overType?.startsWith('drawer-')) {
            // Route the save by the tab's kind: a board/note tab saves its own aggregate, a character
            // tab its character. All three land a NEW linked drawer copy in the drop target's folder.
            const draggedTab = useTabManagerStore.getState().openTabs.find((openTab) => openTab.id === tabId);
            if (draggedTab?.type === 'board') void saveBoardTabToDrawer(tabId, overIdStr, overType, over);
            else if (draggedTab?.type === 'note') void saveNoteTabToDrawer(tabId, overIdStr, overType, over);
            else saveTabToDrawer(tabId, overIdStr, overType, over);
         } else if (overIdStr === 'board-drop-zone') {
            // A tab dropped on the board adds a character element - saved or unsaved. The element keys
            // on the character id and reads live while the tab is open; a saved one also links its
            // drawer source for when the tab is closed.
            const boardStore = getActiveBoardStore();
            const character = getOrCreateInstance(tabId).getState().character;
            if (!boardStore) return;
            const spec = characterElementSpec(character);
            if (!spec) return;
            void boardStore.getState().actions.addItem({
               ...boardDropPlacement(boardStore, dropPointer, spec),
               kind: spec.kind,
               content: spec.content,
            });
         }
         return;
      }

      // ##############################################
      // ###   BRANCH 1: Dragging FROM the Drawer   ###
      // ##############################################
      if (activeType === 'drawer-item' || activeType === 'drawer-folder') {

         // ==================
         //  SCENARIO 1.0: Dropping a card/tracker onto the board canvas
         // ==================
         // Board-only target (the zone exists solely on a board tab). A board is game-agnostic, so
         // there is NO game gate. A card/tracker becomes a self-contained COPY, an image a native
         // image, and a saved character a read-only reference element - all at the drop point. A
         // folder / full board has no spec and no-ops.
         if (overIdStr === 'board-drop-zone') {
            const boardStore = getActiveBoardStore();
            const draggedItem = active.data.current?.item as DrawerItem | undefined;
            if (!boardStore || !draggedItem) return;
            const spec = embeddedSpecForDrawerItem(draggedItem);
            if (!spec) return;

            void boardStore.getState().actions.addItem({
               ...boardDropPlacement(boardStore, dropPointer, spec),
               kind: spec.kind,
               content: spec.content,
            });
            contractIfExpanded();
            return;
         }

         // ==================
         //  SCENARIO 1.1: Dropping a full character onto the play area
         // ==================
         if (overIdStr === 'main-character-drop-zone') {
            const draggedItem = active.data.current?.item as DrawerItem;
            if (draggedItem?.type === 'FULL_CHARACTER_SHEET') {
               const characterData = draggedItem.content as Character;
               openCharacterTab(characterData, draggedItem.id);
               setContextualGame(characterData.game);
               contractIfExpanded();
            } else if (draggedItem?.type === 'FULL_BOARD') {
               // A board dropped on the workspace opens like a character: focus its tab if already
               // open (don't re-import, so live unsaved edits aren't clobbered), else materialize the
               // drawer copy into the working tables and open it by id.
               const boardData = draggedItem.content as Board;
               if (useTabManagerStore.getState().openTabs.some((tab) => tab.id === boardData.id)) {
                  setActiveTab(boardData.id);
               } else {
                  void importBoard(boardData).then(() => openBoardTab(boardData.id));
               }
               contractIfExpanded();
            } else if (draggedItem?.type === 'NOTE') {
               // A note opens like a board: focus its tab if already open (don't re-import, so live
               // unsaved edits aren't clobbered), else materialize the drawer copy into the working
               // note table (linked to the drawer item) and open it by id.
               const noteData = draggedItem.content as Note;
               if (useTabManagerStore.getState().openTabs.some((tab) => tab.id === noteData.id)) {
                  setActiveTab(noteData.id);
               } else {
                  void importNote(noteData, draggedItem.id).then(() => openNoteTab(noteData.id));
               }
               contractIfExpanded();
            }
            return;
         }

         // ==================
         //  SCENARIO 1.1b: Dropping a full character / board onto the tab strip (open or focus)
         // ==================
         // Only FULL_CHARACTER_SHEET / FULL_BOARD items are valid here; anything else is a no-op.
         if (overIdStr === 'tab-strip-drop-zone') {
            const draggedItem = active.data.current?.item as DrawerItem;
            if (draggedItem?.type === 'FULL_CHARACTER_SHEET') {
               const characterData = draggedItem.content as Character;
               openCharacterTab(characterData, draggedItem.id); // append-or-focus
               setContextualGame(characterData.game);
               contractIfExpanded();
            } else if (draggedItem?.type === 'FULL_BOARD') {
               // The drawer copy is the source of truth on open: materialize it into the
               // working tables, then focus-or-open its tab (by board id) so an already-open
               // board's live state is never clobbered.
               const boardData = draggedItem.content as Board;
               void importBoard(boardData).then(() => openBoardTab(boardData.id));
               contractIfExpanded();
            } else if (draggedItem?.type === 'NOTE') {
               // Same as a board: materialize the drawer copy into the working note table (linked to
               // the drawer item), then focus-or-open its tab (by note id).
               const noteData = draggedItem.content as Note;
               void importNote(noteData, draggedItem.id).then(() => openNoteTab(noteData.id));
               contractIfExpanded();
            }
            return;
         }

         // ==================
         //  SCENARIO 1.2: Dropping INSIDE the drawer
         // ==================
         if (overType?.startsWith('drawer-') || overIdStr.startsWith('drawer-')) {
            const activeIsItem = activeType === 'drawer-item';
            const parentFolderId = active.data.current?.parentFolderId ?? null;
            // Scope = the currently loaded folder's children (the drawer only ever
            // shows one folder, so every in-drawer drag originates there).
            const itemsInScope = currentFolderView?.items ?? [];

            // NOTE: moves INTO a folder / Back / the items body of a different folder, and
            // ALL folder slot placements (reorder + cross-folder insert), are handled by the
            // manual geometry resolver above; this block now only handles same-folder
            // item REORDER. The `over` is resolved from live row geometry (customCollisionDetection),
            // so the live-shuffle lands on the right sibling - reliable at the edges and in place.
            if (overType === 'drawer-item' && activeIsItem && parentFolderId === (over.data.current?.parentFolderId ?? null)) {
               const oldIndex = itemsInScope.findIndex(item => item.id === active.id);
               const overIndex = itemsInScope.findIndex(item => item.id === over.id);
               if (oldIndex !== -1 && overIndex !== -1) void reorderItems(parentFolderId, oldIndex, overIndex);
               return;
            }
         }

         // ==================
         //  SCENARIO 1.3: Dropping ONTO the character sheet
         // ==================
         // (Requires a character to be loaded)
         if (!character) return;

         const isOverSheet = overIdStr === 'character-sheet-main-drop-zone' ||
                              overIdStr === 'tracker-drop-zone' ||
                              overIdStr === 'card-drop-zone' ||
                              overType === 'sheet-card' ||
                              overType === 'sheet-journal' ||
                              overType === 'sheet-tracker';

         if (isOverSheet) {
            if (activeType !== 'drawer-item') return;

            const draggedItem = active.data.current?.item as DrawerItem;
            if (!draggedItem) return;

            const isTrackerType = draggedItem.type === 'STATUS_TRACKER' || draggedItem.type === 'STORY_TAG_TRACKER' || draggedItem.type === 'STORY_THEME_TRACKER';
            const isImageCard = draggedItem.type === 'IMAGE_CARD';
            const isCardType = draggedItem.type === 'CHARACTER_CARD' || draggedItem.type === 'CHARACTER_THEME' || draggedItem.type === 'GROUP_THEME' || draggedItem.type === 'LOADOUT_THEME' || isImageCard;
            const isJournalType = draggedItem.type === 'JOURNAL';

            // Only sheet components add here; a FULL_CHARACTER_SHEET over the sheet is
            // not a failure (it opens a tab via its own zone), so don't toast for it.
            if (!isTrackerType && !isCardType && !isJournalType) return;

            // Game mismatch: the drop can't land, tell the user why instead of a silent
            // no-op. NEUTRAL items are game-agnostic, so they skip this gate.
            if (draggedItem.game !== 'NEUTRAL' && draggedItem.game !== character.game) {
               toast.error(tNotifications(draggedItem.type === 'CHALLENGE_CARD'
                  ? 'Notifications.general.importFailedWrongGameChallenge'
                  : 'Notifications.general.importFailedWrongGame'));
               return;
            }

            if (isTrackerType) {
               addImportedTracker(draggedItem.content as Tracker);
               toast.success(tNotifications('Notifications.character.componentImported'));
            } else if (isJournalType) {
               // A bare journal (game-agnostic): import a copy onto the sheet (fresh id, pages/bookmarks kept).
               addImportedJournal(draggedItem.content as Journal);
               toast.success(tNotifications('Notifications.character.componentImported'));
            } else if (isCardType) {
               const added = addImportedCard(draggedItem.content as CardData);
               if (added) {
                  toast.success(tNotifications('Notifications.character.componentImported'));
               } else {
                  toast.error(tNotifications('Notifications.character.duplicatePortrait'));
               }
            }
            contractIfExpanded();
            return;
         }
      }

      // #############################################
      // ###   BRANCH 2: Dragging FROM the Sheet   ###
      // #############################################
      if (activeType?.startsWith('sheet-')) {

         // A sheet JOURNAL (SHEET_JOURNAL) rides the SAME scenarios below as a card - board drop, drawer
         // save, cross-character import, reorder - each of which forks explicitly on the journal shape (its
         // bare aggregate has no cardType/trackerType). It saves a COPY and stays put, mirroring a card.

         // ==================
         //  SCENARIO 2.0a: Dropping a card/tracker/journal onto the board canvas
         // ==================
         // Mirrors the drawer's board drop (SCENARIO 1.0): a board is game-agnostic, so there is NO
         // game gate. The sheet component becomes a self-contained COPY (no `sourceDrawerItemId`, it is
         // not from the drawer); an image drops as a native image. The board zone only exists on a board
         // tab, so a sheet drag reaches it only when a board is active. The geometry fallback above
         // handles the mid-drag spring-nav case where this dnd-kit target is not yet measured.
         if (overIdStr === 'board-drop-zone') {
            dropSheetItemOnBoard();
            return;
         }

         // ==================
         //  SCENARIO 2.0: Dropping on a DIFFERENT character's sheet (after tab auto-nav)
         // ==================
         // The sheet item came from another tab; import a copy into the now-active
         // character (game must match). A same-character drop falls through to reorder.
         const overIsSheetZone = overIdStr === 'character-sheet-main-drop-zone' ||
            overIdStr === 'card-drop-zone' || overIdStr === 'tracker-drop-zone' ||
            overType?.startsWith('sheet-');
         if (
            character && activeDragItem && overIsSheetZone &&
            dragSourceCharacterIdRef.current && dragSourceCharacterIdRef.current !== character.id
         ) {
            const info = mapItemToStorableInfo(activeDragItem as CardData | Tracker | Journal);
            // NEUTRAL items are game-agnostic; every other component must match the sheet's game.
            if (info && (info[1] === 'NEUTRAL' || info[1] === character.game)) {
               if ('cardType' in activeDragItem) {
                  const added = addImportedCard(activeDragItem as CardData);
                  if (added) {
                     toast.success(tNotifications('Notifications.character.componentImported'));
                  } else {
                     toast.error(tNotifications('Notifications.character.duplicatePortrait'));
                  }
               } else if ('trackerType' in activeDragItem) {
                  addImportedTracker(activeDragItem as Tracker);
                  toast.success(tNotifications('Notifications.character.componentImported'));
               } else if ('pages' in activeDragItem) {
                  // A bare journal (no cardType/trackerType): import a copy onto the now-active character.
                  addImportedJournal(activeDragItem as Journal);
                  toast.success(tNotifications('Notifications.character.componentImported'));
               }
            }
            return;
         }

         // ==================
         //  SCENARIO 2.1: Dropping ONTO the drawer
         // ==================
         if (overIdStr.startsWith('drawer-drop-zone-') || overType?.startsWith('drawer-')) {
            handleSheetToDrawerDrop(activeDragItem, overIdStr, overType, over);
            return;
         }

         // ==================
         //  SCENARIO 2.2: Reordering ON the sheet
         // ==================
         if (overType?.startsWith('sheet-') && character) {
            // Cards and journals share one manifest space: a card-or-journal reorder lands on any
            // card-or-journal target, resolved by id through reorderSheetLayout.
            const isLayoutDrag = activeType === DRAG_TYPES.SHEET_CARD || activeType === DRAG_TYPES.SHEET_JOURNAL;
            const overIsLayout = overType === DRAG_TYPES.SHEET_CARD || overType === DRAG_TYPES.SHEET_JOURNAL;
            if (isLayoutDrag && overIsLayout) {
               handleSheetLayoutReorder(active.id as string, over.id as string);
            } else if (activeType === DRAG_TYPES.SHEET_TRACKER) {
               handleSheetTrackerReorder(active, over);
            }
         }
      }
   }, [
      character,
      currentFolderView,
      moveFolder,
      reorderFolders,
      moveItem,
      reorderItems,
      handleSheetLayoutReorder,
      handleSheetTrackerReorder,
      handleSheetToDrawerDrop,
      saveTabToDrawer,
      saveBoardTabToDrawer,
      saveNoteTabToDrawer,
      openCharacterTab,
      openBoardTab,
      openNoteTab,
      reorderTabs,
      setActiveTab,
      setContextualGame,
      addImportedTracker,
      addImportedCard,
      addImportedJournal,
      tNotifications,
      clearDragFeedback,
      contractDrawer,
      setDrawerReceded,
      activeDragItem,
   ]);

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
