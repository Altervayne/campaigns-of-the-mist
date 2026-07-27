// -- React Imports --
import { useCallback, useEffect, useId, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { useStore } from 'zustand';
import { useDroppable } from '@dnd-kit/core';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';

// -- Icon Imports --
import { ChevronLeft, ChevronRight, Copy, Crosshair, Layers, Maximize, MousePointer2, PenTool, Trash2 } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { centerViewport, fitViewport } from '@/lib/board/boardCoordinates';
import { zoneContentMinSize } from '@/lib/board/zoneMembership';
import { connectionsZIndex, groupToolbarZIndex, itemZIndex } from '@/lib/board/boardLayering';
import { flattenBoardOrder } from '@/lib/board/boardTree';
import { isMergeableSelection } from '@/lib/board/layersReorder';
import { isAppendTool } from '@/lib/board/drawingStyle';
import { GAME_VISUALS, GAME_CARD_OPTIONS, CHALLENGE_GAME_OPTIONS } from '@/lib/constants/gameVisuals';
import { getItemTypeIconComponent } from '@/lib/utils/drawer-icons';
import { CREATABLE_BY_KIND, type CreatableKind } from '@/lib/creation/creatableRegistry';
import { CREATION_TAXONOMY } from '@/lib/creation/creationTaxonomy';
import { PORTAL_MIN_SIZE } from '@/lib/board/portalSizing';
import { PendingEraseContext } from '@/lib/board/PendingEraseContext';
import { DrawingFocusContext } from '@/lib/board/DrawingFocusContext';
import { useBoardBarScroll } from '@/hooks/board/useBoardBarScroll';
import { useBoardViewport, FIT_PADDING } from '@/hooks/board/useBoardViewport';
import { useBoardPanKeys } from '@/hooks/board/useBoardPanKeys';
import { useBoardTools } from '@/hooks/board/useBoardTools';
import { useBoardSelection } from '@/hooks/board/useBoardSelection';
import { useBoardPointerInteraction } from '@/hooks/board/useBoardPointerInteraction';
import { useBoardDrawing } from '@/hooks/board/useBoardDrawing';
import { useBoardCreation } from '@/hooks/board/useBoardCreation';

// -- Component Imports --
import { BoardItemBox } from './BoardItemBox';
import { BoardConnectionsLayer } from './BoardConnectionsLayer';
import { BoardToolSettingsBar } from './BoardToolSettingsBar';
import { BoardGroupToolbar } from './BoardGroupToolbar';
import { BoardRadialMenu, type RadialNode } from './BoardRadialMenu';
import { BoardAddMenu } from './BoardAddMenu';
import { BoardGridMenu } from './BoardGridMenu';
import { LayersPanel } from './LayersPanel';
import { LinkTargetList } from '@/components/molecules/links/LinkTargetList';
import { BoardPortalEditor } from './items/BoardPortalEditor';
import { StrokeShape } from './items/BoardDrawingItem';
import { BoardFloatingWindow, PORTAL_WINDOW_WIDTH, PORTAL_EDITOR_WIDTH } from './windows/BoardFloatingWindow';
import { BoardCardCreationWindow } from './windows/BoardCardCreationWindow';
import { BoardCoordinateField } from './fields/BoardCoordinateField';
import { BoardGridLayer } from './layers/BoardGridLayer';
import { ToolbarButton } from './toolbar/ToolbarButton';
import { ToolToggleButton } from './toolbar/ToolToggleButton';
import { BoardNamePill } from './toolbar/BoardNamePill';
import { isEditableTarget, isTextEditableKind, MOVE_THRESHOLD, RIGHT_PAN_THRESHOLD } from './boardCanvasConstants';

// -- Store Imports --
import { useActiveBoardInstance } from '@/lib/board/ActiveBoardStoreContext';
import { useAppGeneralStateStore, useAppGeneralStateActions } from '@/lib/stores/appGeneralStateStore';
import { useAppSettingsStore, useAppSettingsActions } from '@/lib/stores/appSettingsStore';

// -- Type Imports --
import type { BoardStore } from '@/lib/stores/boardStore';
import type { BoardGridType, BoardItem, BoardItemContent, BrushKind, ConnectionStyle, PortalBoardContent } from '@/lib/types/board';
import type { Point } from '@/lib/board/boardConnections';
import type { ChallengeGame } from '@/lib/types/common';

/*
 * The board canvas: a pan/zoom world layer over the active board, with freeform move /
 * resize / select / z-order / delete wired to the board store's commands, plus a
 * creation palette for the board-native item kinds. It reads the ACTIVE BOARD instance
 * (never the character context) and only mounts when a board tab is active. Embedded
 * drawer items, connections, and threats are later prompts.
 */


/** Rebuilds a connection's content with a new style, preserving its endpoints. The style carries
 *  the full set (width + color + dash), so any single-facet edit keeps the others. */
function buildConnectionContent(item: BoardItem | undefined, style: ConnectionStyle): BoardItemContent {
   const content = item?.content;
   const from = content?.kind === 'connection' ? content.from : '';
   const to = content?.kind === 'connection' ? content.to : '';
   return { kind: 'connection', from, to, style };
}

/**
 * Screen-px the selected item's toolbar keeps below the clip's top edge. When the item's top runs above
 * the canvas (a tall drawing/zone pushes the bar out of reach), the bar is clamped down to this line so it
 * stays visible. Covers the bar's own height (it grows upward from the box top) plus a small margin.
 */
const TOOLBAR_TOP_CLEARANCE = 48;

/**
 * The top-bar scroll arrow: a frosted square overlaid on a scroll edge so the bar's contents slide
 * underneath it. Centered vertically via `my-auto` (not a transform) so framer-motion owns `x` for
 * the slide-in/out; the side (`left-0.5`/`right-0.5`) is appended per arrow.
 */
const BAR_ARROW_CLASS =
   'absolute top-0 bottom-0 z-10 my-auto flex size-6 items-center justify-center rounded border border-border bg-popover/95 text-popover-foreground shadow-md backdrop-blur-sm hover:bg-muted cursor-pointer';

/** The layers panel's fixed width (matches its `w-64`), used to inset the bottom bar when it's open. */
const LAYERS_PANEL_WIDTH = 256;

/** Screen-px the bottom-center tool bar keeps from the canvas floor. */
const BAR_EDGE_GAP = 12;

/** The canvas; renders nothing when no board tab is active. */
export function BoardView() {
   const instance = useActiveBoardInstance();
   if (!instance) return null;
   return <BoardCanvas store={instance} />;
}

function BoardCanvas({ store }: { store: BoardStore }) {
   const { t } = useTranslation();
   const grid = useStore(store, (state) => state.grid);
   const hexPatternId = useId();
   const name = useStore(store, (state) => state.name);
   const items = useStore(store, (state) => state.items);
   const actions = useStore(store, (state) => state.actions);

   // The camera: viewport subscription + ref mirror, the clip ref + its live box, pan, wheel zoom, and the
   // world-coordinate / view-center helpers. The clip ref is returned plain so it composes with the droppable.
   const {
      clipRef,
      viewport,
      viewportRef,
      viewCenter,
      clipRect,
      isPanning,
      beginPan,
      cursorToWorld,
      originViewport,
      jumpToViewCenter,
      currentViewCenter,
      handleFitToContent,
      jumpXRef,
   } = useBoardViewport(store, actions, items);

   // The hovered item drives a canvas highlight for a layers-panel row hover (row -> canvas only). Discrete
   // enter/leave, so subscribing here re-renders on a boundary crossing, never per pointer move.
   const hoveredId = useStore(store, (state) => state.hoveredId);

   // Item pointer interaction: the group move, the connect drag, the item double-click deep action, and the
   // marquee. Owns the live move / connect-preview / marquee state and `moveDeltaFor` (handed to the selection
   // hook below so its group bbox tracks a live move). Runs BEFORE the selection hook so it can provide
   // `moveDeltaFor` without a cycle; it subscribes to `selectedIds` directly rather than through selection.
   const {
      marquee,
      groupDrag,
      connectPreview,
      moveDeltaFor,
      handleMoveStart,
      handleItemDoubleClick,
      handleConnectStart,
      beginMarquee,
   } = useBoardPointerInteraction({ store, actions, cursorToWorld, clipRef, viewportRef });

   // Selection + text-editing sub-state: the delete/duplicate handlers, the sole-selection derivation, and
   // the multi-select group bbox. Subscribes to selectedIds in the store; the group bbox tracks a live move
   // via `moveDeltaFor`. Editing exits on Escape or when its item stops being the sole selection.
   const {
      selectedIds,
      editingId,
      setEditingId,
      soleSelectedId,
      groupBbox,
      handleDelete,
      handleDeleteSelection,
      handleDuplicateSelection,
   } = useBoardSelection(store, actions, items, moveDeltaFor);

   // Cross-surface drop target for dragging a drawer card/tracker onto the canvas. Only
   // mounted on a board tab (BoardView renders nothing otherwise), so it never competes
   // with the sheet drop zones on a character tab. The drop is routed by `handleDragEnd`.
   const { setNodeRef: setDroppableRef } = useDroppable({ id: 'board-drop-zone', data: { type: 'board-drop-zone' } });

   // Compose the droppable node ref with the local clip ref (used for the wheel listener
   // and screen->world math, and read by the drop handler via `data-board-clip`).
   const setClipRefs = (node: HTMLDivElement | null) => {
      clipRef.current = node;
      setDroppableRef(node);
   };

   const layersPanelOpen = useAppSettingsStore((state) => state.layersPanelOpen);

   // The tool mode + drawing settings: the active tool, the sticky last-Draw gesture, the active drawing
   // layer, the regular-polygon side count, and the persisted pen settings the toolbar reads. `resetForBoard`
   // clears the tool/layer half on a board switch (orchestrated with the drawing-state reset below).
   const {
      activeTool,
      setActiveTool,
      lastDrawToolRef,
      chooseDrawTool,
      activeLayerId,
      setActiveLayerId,
      polygonSides,
      setPolygonSides,
      penSettings,
      setPenBrush,
      setPenColor,
      setPenWidth,
      setShapeBase,
      setShapeFilled,
      resetForBoard,
   } = useBoardTools();
   const { toggleLayersPanel, setLayersPanelOpen } = useAppSettingsActions();
   // Space and Alt each arm a mode-independent pan while held; the flags drive the cursor and the Space ref
   // twin is read live by the pointer handlers. Both clear on a window blur so an alt-tab leaves no stuck pan.
   const { spaceHeld, spaceHeldRef, altHeld } = useBoardPanKeys();

   // Every drawing gesture: the pen / line / shape / polygon pointerdowns, the eraser scrub, their commits,
   // and the live previews. It owns the in-flight stroke + cleanup refs and the mid-stroke unmount teardown,
   // so a tab switch during a stroke can't leak its listeners. `resetForBoard` clears the drawing half on a
   // board switch (orchestrated with the tool/layer reset below).
   const {
      penPreview,
      polygonPreview,
      pendingErase,
      polygonRef,
      closePolygon,
      handleFreehandPointerDown,
      handleLinePointerDown,
      handleRegularPolygonPointerDown,
      handleShapePointerDown,
      handleEraserPointerDown,
      handlePolygonPointerDown,
      handlePolygonPointerMove,
      handlePolygonDoubleClick,
      resetForBoard: resetDrawingForBoard,
   } = useBoardDrawing({
      store,
      actions,
      cursorToWorld,
      beginPan,
      viewportRef,
      spaceHeldRef,
      activeTool,
      setActiveTool,
      activeLayerId,
      setActiveLayerId,
      penSettings,
      polygonSides,
   });

   // A right-click that just finished a polygon must not also open the radial; set on the finishing
   // pointerdown, consumed by the matching context-menu.
   const suppressRadialRef = useRef(false);
   // Board switches keep this canvas mounted (a new `store` prop, no remount), so the tool/layer + drawing
   // state would leak across boards; reset them when the loaded board id changes.
   const boardId = useStore(store, (state) => state.boardId);
   useEffect(() => {
      resetForBoard();
      resetDrawingForBoard();
   }, [boardId, resetForBoard, resetDrawingForBoard]);

   // Paint order is the scope-relative tree flatten (root items by z, each zone immediately followed by
   // its members), NOT a global z-sort - so a zone's members band contiguously with it. Connections
   // render in the SVG overlay and carry no paint rank, so the flatten excludes them; gather them apart.
   const spatialItems = flattenBoardOrder(items);
   const connectionItems = Object.values(items).filter((item) => item.kind === 'connection').sort((a, b) => a.z - b.z);
   // Zones are background frames: their tinted rectangle now ranks at the zone's own band floor (its
   // members band right above it), while their header + chrome paint over the tint. A non-zone item
   // lower in the flatten than a zone renders beneath that zone's tint.
   const zoneItems = spatialItems.filter((item) => item.kind === 'zone');
   // Collapsed zones shrink to a bar and hide their members: members keep their store position but
   // aren't painted, and connections touching them re-anchor to the bar (handled in the layer).
   const collapsedZoneIds = new Set(zoneItems.filter((item) => item.content.kind === 'zone' && item.content.collapsed).map((item) => item.id));
   const nonZoneItems = spatialItems.filter((item) => item.kind !== 'zone' && !(item.zoneId && collapsedZoneIds.has(item.zoneId)));

   // The open right-click radial menu: the cursor's screen point (positions the ring) + its world
   // point (where a create action drops the new item). Null when closed.
   const [radial, setRadial] = useState<{ screen: { x: number; y: number }; world: Point } | null>(null);

   // Item creation + the portal flow + save-back, plus the three creation-UI window states the windows below
   // render from. The create handlers close over the live `items`/`zoneItems`; the portal Edit/Relink handlers
   // and `commitPortalStyle` stay stable so the item boxes don't re-render on every pan.
   const {
      pendingCard,
      setPendingCard,
      portalPicker,
      setPortalPicker,
      portalEditor,
      setPortalEditor,
      createItemAt,
      createTrackerAt,
      createCardAt,
      createChallengeAt,
      embedNoteAt,
      handleAddItem,
      handlePickCardGame,
      handleRequestEditPortal,
      handleRequestRelinkPortal,
      handlePortalPick,
      openPortalPickerAtViewCenter,
      commitPortalStyle,
      saveSelectedItemToDrawer,
   } = useBoardCreation({ store, actions, items, zoneItems, selectedIds, viewCenter, currentViewCenter, clipRef, viewportRef, setEditingId });

   // The bottom-bar overflow-scroll UX (wheel scrolls, hidden scrollbar, edge arrows).
   const { barScrollRef, barContentRef, barCanScrollLeft, barCanScrollRight, scrollBarBy } = useBoardBarScroll(activeTool);

   /** Layers panel: a plain click selects just that row (no pan); Shift/Ctrl-click toggles it in the selection. */
   const handleLayerSelect = useCallback((id: string, additive: boolean) => actions.selectItem(id, additive), [actions]);

   /** Layers panel: a row's double-click centers the view on the item (keeping zoom). Reads live refs so
    *  its identity stays stable (the panel subscribes to items/selection, not to it). */
   const handleLayerActivate = useCallback((id: string) => {
      const item = store.getState().items[id];
      const el = clipRef.current;
      if (!item || !el) return;
      const rect = el.getBoundingClientRect();
      const center = { x: item.x + item.width / 2, y: item.y + item.height / 2 };
      actions.setViewport(centerViewport(center, { width: rect.width, height: rect.height }, viewportRef.current.zoom));
   }, [store, actions, clipRef, viewportRef]);

   /** Layers panel: commit a row rename (or clear the label with `undefined`) as one undoable edit. */
   const handleLayerCommitLabel = useCallback((id: string, label: string | undefined) => void actions.setItemLabel(id, label), [actions]);

   /** Layers panel: a drag-reorder lands the item at `(zoneId, index)` within its destination scope. */
   const handleLayerReorder = useCallback((id: string, zoneId: string | null, index: number) => void actions.reorderItem(id, zoneId, index), [actions]);

   /** Layers panel + palette: merge the selected drawing layers into one. Re-checks mergeability (the footer
    *  button is pre-guarded, but the palette command reaches here on any selection) and toasts when it can't. */
   const handleLayerMerge = useCallback(() => {
      const state = store.getState();
      if (!isMergeableSelection(state.items, state.selectedIds)) {
         toast.error(t('Notifications.board.layersNotMergeable'));
         return;
      }
      void actions.mergeDrawings([...state.selectedIds]);
   }, [store, actions, t]);

   /** Layers panel: the group chevron toggles the zone's collapse - the SAME content field the canvas edits. */
   const handleZoneCollapseToggle = useCallback((id: string) => {
      const zone = store.getState().items[id];
      if (zone?.content.kind !== 'zone') return;
      void actions.updateItemContent(id, { ...zone.content, collapsed: !zone.content.collapsed });
   }, [store, actions]);

   // ==================
   //  Keyboard: delete / duplicate the selection (ignored while editing text)
   // ==================
   useEffect(() => {
      if (selectedIds.size === 0) return;
      const onKeyDown = (event: KeyboardEvent) => {
         const target = event.target;
         if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
         // A freeform polygon in progress owns Backspace (it pops a vertex); don't also delete the selection.
         if (event.key === 'Backspace' && polygonRef.current) return;
         if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            handleDeleteSelection();
         } else if ((event.ctrlKey || event.metaKey) && (event.key === 'd' || event.key === 'D')) {
            event.preventDefault();
            void handleDuplicateSelection();
         }
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
   }, [selectedIds, handleDeleteSelection, handleDuplicateSelection, polygonRef]);

   // A bare `L` toggles the layers panel. Ignored while editing text (a board field / the panel's rename)
   // and when a modifier is held (so browser shortcuts like Ctrl+L stay intact).
   useEffect(() => {
      const onKeyDown = (event: KeyboardEvent) => {
         if (event.ctrlKey || event.metaKey || event.altKey) return;
         const target = event.target;
         if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
         if (event.key === 'l' || event.key === 'L') {
            event.preventDefault();
            toggleLayersPanel();
         }
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
   }, [toggleLayersPanel]);

   /** Opens the radial at a screen point (create-at-cursor + selection actions). A right-click on an
    *  unselected item selects it first so the actions target it; an empty press keeps the current selection. */
   const openRadial = useCallback((itemId: string | null, clientX: number, clientY: number) => {
      if (itemId && !store.getState().selectedIds.has(itemId)) actions.setSelection([itemId]);
      const world = cursorToWorld(clientX, clientY);
      if (!world) return;
      setRadial({ screen: { x: clientX, y: clientY }, world });
   }, [store, actions, cursorToWorld]);

   /**
    * An item's body press (deferred, shared with the grip). Plain: a drag past the threshold moves it
    * group-aware from the down origin (no jump); a click with no drag selects it (a modifier toggles it
    * in/out of the set), and a text kind's plain click also promotes it to editing (focus the editor).
    * Shift: a drag draws an additive marquee anchored at the item, a click toggles it. A text item that is
    * already editing keeps the pointer on its own field (the box only routes the press here when it isn't).
    */
   const handleItemPointerDown = useCallback(
      (id: string, event: ReactPointerEvent) => {
         if (event.button !== 0) return;
         if (event.shiftKey) {
            const startX = event.clientX;
            const startY = event.clientY;
            let started = false;
            const onMove = (moveEvent: PointerEvent) => {
               if (started) return;
               if (Math.abs(moveEvent.clientX - startX) < MOVE_THRESHOLD && Math.abs(moveEvent.clientY - startY) < MOVE_THRESHOLD) return;
               started = true;
               window.removeEventListener('pointermove', onMove);
               window.removeEventListener('pointerup', onUp);
               beginMarquee(startX, startY, { additive: true });
            };
            const onUp = () => {
               window.removeEventListener('pointermove', onMove);
               window.removeEventListener('pointerup', onUp);
               if (!started) actions.selectItem(id, true); // a shift-click with no drag toggles this item
            };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
            return;
         }
         const additive = event.ctrlKey || event.metaKey;
         const editable = isTextEditableKind(store.getState().items[id]?.kind);
         handleMoveStart(id, event, {
            onClickNoMove: () => {
               actions.selectItem(id, additive);
               // A plain click on a text kind promotes it straight to editing (one step); a modifier click
               // only toggles selection, so it never enters editing.
               if (editable && !additive) setEditingId(id);
            },
         });
      },
      [actions, beginMarquee, handleMoveStart, setEditingId, store],
   );

   const handleBackgroundPointerDown = (event: ReactPointerEvent) => {
      // Middle-button, Space+drag, and Alt+drag pan in ANY tool (the pen's escape hatch out of its viewport).
      if (event.button === 1) { event.preventDefault(); beginPan(event.clientX, event.clientY); return; }
      if (event.button === 0 && (spaceHeldRef.current || event.altKey)) { beginPan(event.clientX, event.clientY); return; }
      // The right button is owned by the capture handler (radial / right-drag pan), so it never reaches here.
      // Past here only the select tool acts on the background; a Draw gesture's background is owned by the
      // capture overlay (a higher sibling), so a plain draw pointerdown never reaches here.
      if (event.button !== 0 || activeTool !== 'select') return;
      // A left drag on the background draws a marquee: Shift adds to the selection, a plain drag replaces
      // it (clear up front so a click with no drag deselects - the sub-threshold marquee release is a no-op).
      // The background no longer pans; pan is right / middle / Alt / Space (handled above).
      if (!event.shiftKey) actions.clearSelection();
      beginMarquee(event.clientX, event.clientY, { additive: event.shiftKey });
   };

   /**
    * Right-button DRAG detector, captured at the clip so it fires over the background AND any item - even
    * ones whose own handlers stop pointer propagation - in both Select and Draw modes (right-drag pans the
    * board the same way everywhere). It never opens the radial (that rides the reliable contextmenu event);
    * it only watches for a drag: past the threshold it pans and sets `suppressRadialRef` so the contextmenu
    * stays shut, and closes any menu that already opened on press (GTK fires contextmenu on pointerdown). A
    * right-CLICK with no drag that finds a freeform polygon mid-draw closes it here (suppressing the radial),
    * mirroring the pan-vs-radial split: a right-drag while placing a polygon PANS and leaves the polygon
    * anchored in world space (ready for more vertices), a right-click CLOSES it. The suppress flag is cleared
    * up front so a prior right-drag can't eat this click's menu on a platform where no closing contextmenu
    * followed it. A live text editor keeps its native menu.
    */
   const handleClipPointerDownCapture = (event: ReactPointerEvent) => {
      if (event.button !== 2 || isEditableTarget(event.target)) return;
      event.stopPropagation(); // this sequence owns the right button; no item handler also acts on it
      suppressRadialRef.current = false; // fresh gesture: drop any flag a prior drag left unconsumed
      const startX = event.clientX;
      const startY = event.clientY;
      let panning = false;
      const onMove = (moveEvent: PointerEvent) => {
         if (panning) return;
         if (Math.abs(moveEvent.clientX - startX) < RIGHT_PAN_THRESHOLD && Math.abs(moveEvent.clientY - startY) < RIGHT_PAN_THRESHOLD) return;
         panning = true;
         suppressRadialRef.current = true; // a real right-drag swallows the contextmenu that follows
         setRadial(null); // GTK opens the menu on pointerdown; dismiss it as the drag takes over
         beginPan(moveEvent.clientX, moveEvent.clientY); // pan leaves an in-progress polygon anchored in world space
      };
      const onUp = () => {
         window.removeEventListener('pointermove', onMove);
         window.removeEventListener('pointerup', onUp);
         // A right-click with no drag closes an in-progress freeform polygon and swallows the radial the
         // following contextmenu would open; with none in progress that contextmenu opens the radial as usual.
         if (!panning && polygonRef.current) { closePolygon(); suppressRadialRef.current = true; }
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
   };

   const { clearBoardAction } = useAppGeneralStateActions();

   // The command palette has no cursor point to drop at and doesn't know the selection, so it requests
   // actions through this one-shot store signal instead; the active board consumes it against its own
   // view center / selection and clears it. Runs only while this canvas is mounted, so it can't fire on
   // a background board.
   const pendingBoardAction = useAppGeneralStateStore((state) => state.pendingBoardAction);
   useEffect(() => {
      if (!pendingBoardAction) return;
      if (pendingBoardAction.startsWith('createChallenge:')) createChallengeAt(pendingBoardAction.slice('createChallenge:'.length) as ChallengeGame, viewCenter);
      else if (pendingBoardAction === 'setTool:select') setActiveTool('select');
      else if (pendingBoardAction === 'setTool:pen') chooseDrawTool('freehand');
      else if (pendingBoardAction === 'setTool:line') chooseDrawTool('line');
      else if (pendingBoardAction === 'setTool:freeformPolygon') chooseDrawTool('freeformPolygon');
      else if (pendingBoardAction === 'setTool:regularPolygon') chooseDrawTool('regularPolygon');
      else if (pendingBoardAction === 'setTool:shape') chooseDrawTool('shape');
      else if (pendingBoardAction === 'setTool:eraser') chooseDrawTool('eraser');
      // A brush pick is a style change; if a non-drawing gesture owns the pointer (select/eraser), enter freehand first.
      else if (pendingBoardAction.startsWith('setBrush:')) { if (activeTool === 'select' || activeTool === 'eraser') chooseDrawTool('freehand'); setPenBrush(pendingBoardAction.slice('setBrush:'.length) as BrushKind); }
      else if (pendingBoardAction === 'saveItemToDrawer') saveSelectedItemToDrawer(false);
      else if (pendingBoardAction === 'saveItemToDrawerAs') saveSelectedItemToDrawer(true);
      else if (pendingBoardAction.startsWith('setGrid:')) void actions.setGrid({ ...grid, type: pendingBoardAction.slice('setGrid:'.length) as BoardGridType });
      else if (pendingBoardAction === 'focusJumpToCoordinate') {
         // Reveal the X input if the bar has scrolled it out of view, then focus + select it to type over.
         jumpXRef.current?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
         jumpXRef.current?.focus();
         jumpXRef.current?.select();
      }
      else if (pendingBoardAction.startsWith('create:')) {
         const kind = pendingBoardAction.slice('create:'.length) as CreatableKind;
         // A picker-first kind (a portal) opens its target picker instead of dropping a targetless item.
         if (CREATABLE_BY_KIND[kind]?.requiresPicker) openPortalPickerAtViewCenter();
         else createItemAt(kind, viewCenter);
      }
      else if (pendingBoardAction === 'mergeSelectedLayers') handleLayerMerge();
      else if (pendingBoardAction === 'frameConnections') {
         // Present every connection for reading: select mode (so cards are the interaction target, not a
         // draw surface) and a viewport that frames each link's two endpoints, so a connection can never
         // sit out of view after the user has panned or zoomed. No connections leaves the viewport as-is.
         setActiveTool('select');
         const el = clipRef.current;
         const seen = new Set<string>();
         const endpoints: BoardItem[] = [];
         for (const item of Object.values(items)) {
            if (item.content.kind !== 'connection') continue;
            for (const endId of [item.content.from, item.content.to]) {
               const endpoint = items[endId];
               if (endpoint && !seen.has(endId)) { seen.add(endId); endpoints.push(endpoint); }
            }
         }
         if (el && endpoints.length) {
            const rect = el.getBoundingClientRect();
            const fitted = fitViewport(endpoints, { width: rect.width, height: rect.height }, FIT_PADDING);
            // The read beat's coach-mark is centered in the window, so a link running through the framed
            // center would sit under it. Lift the content so its midline (where a link between two aligned
            // cards runs) clears the coach's top edge by a fixed margin, whatever the window height: the
            // `rect.top / 2` term cancels the canvas offset, leaving half the coach height plus breathing room.
            const COACH_HALF_HEIGHT = 130;
            const BREATHING_ROOM = 32;
            const lift = rect.top / 2 + COACH_HALF_HEIGHT + BREATHING_ROOM;
            actions.setViewport({ ...fitted, y: fitted.y - lift });
         }
      }
      else if (pendingBoardAction === 'framePortals') {
         // Bring the board's portals into view for a read: select mode (tiles are the interaction target,
         // not a draw surface), then frame the portal items. The read beat's coach-mark is centered in the
         // window, so a tile fit dead-center would land under it. Reserve the coach's lower half of the
         // window and fit the tile into the band ABOVE it, so the whole tile sits clear with room to breathe.
         // A window too short for a band falls back to a plain centered fit. No portals leaves the view as-is.
         setActiveTool('select');
         const el = clipRef.current;
         const portals = Object.values(items).filter((item) => item.content.kind === 'portal');
         if (el && portals.length) {
            const rect = el.getBoundingClientRect();
            const COACH_HALF_HEIGHT = 130;
            const PORTAL_FRAME_PADDING = 24;
            const band = window.innerHeight / 2 - COACH_HALF_HEIGHT - rect.top;
            const clip = band > PORTAL_FRAME_PADDING * 2 ? { width: rect.width, height: band } : { width: rect.width, height: rect.height };
            actions.setViewport(fitViewport(portals, clip, PORTAL_FRAME_PADDING));
         }
      }
      else if (pendingBoardAction.startsWith('embedNote:')) embedNoteAt(pendingBoardAction.slice('embedNote:'.length), viewCenter);
      clearBoardAction();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- the handlers close over live selection/viewCenter that change every render; only the action id should re-trigger this.
   }, [pendingBoardAction, clearBoardAction]);

   /**
    * Opens the radial from the native context-menu event - reliable on every real right-click, every
    * platform (the right-button pointerup is NOT, around a context menu). Over a text field it does nothing
    * (native edit menu stays); right-clicking an unselected item selects it first. A right-drag pan sets
    * `suppressRadialRef` (consumed here) so a drag never opens the menu.
    */
   const handleContextMenu = (event: ReactMouseEvent) => {
      // A right-drag pan (or a right-click that just finished a freeform polygon) already decided the menu
      // should stay closed; consume the flag and swallow the event so nothing reopens.
      if (suppressRadialRef.current) { suppressRadialRef.current = false; event.preventDefault(); event.stopPropagation(); return; }
      // Over a live text editor: leave the native edit menu (copy/paste) intact.
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      const itemId = event.target instanceof Element ? event.target.closest('[data-board-item-id]')?.getAttribute('data-board-item-id') ?? null : null;
      openRadial(itemId, event.clientX, event.clientY);
   };

   // Any live canvas gesture (pan / marquee / move) suppresses the item hover ring, so it never flickers
   // on items the cursor sweeps past mid-drag.
   const interacting = isPanning || marquee !== null || groupDrag !== null;

   // Sole-selecting a drawing layer makes it the pen's append target, so the pen continues on it. Narrow to
   // the sole selection so a marquee over mixed items never hijacks the target; minting already sets the id.
   useEffect(() => {
      if (!soleSelectedId) return;
      if (store.getState().items[soleSelectedId]?.content.kind === 'drawing') setActiveLayerId(soleSelectedId);
   }, [soleSelectedId, store, setActiveLayerId]);

   // Every non-connection item renders in ONE stable pass; selection raises an item via z-index, not
   // a DOM re-order, so its React instance is preserved (no remount -> edits commit on blur, images
   // don't reload). A selected item still renders full front-row (above other items AND the connection
   // layer) - here that's a z-index band, not a later pass. `rank` is the item's index in stored-z
   // order, feeding the disjoint bands in `boardLayering`. Render-only: stored z is untouched.
   const layerRank = new Map(spatialItems.map((item, index) => [item.id, index]));
   const layerCount = spatialItems.length;

   // The element a layers-panel row is hovering, highlighted on the canvas. Skipped when it's already
   // selected (its selection ring covers it) so the two cues never stack.
   const hoveredItem = hoveredId ? items[hoveredId] : undefined;

   // Active drawing-layer focus cue. On only while a drawing (append) gesture is armed AND the append target
   // is a live drawing layer - guards a stale `activeLayerId` (deleted / no longer a drawing) to null. When
   // on: the target layer stays full, every other drawing layer dims (via context), and a dashed accent box
   // wraps the target. Off in Select/eraser, or with no active layer (a fresh layer pending its first stroke).
   const focusLayer = isAppendTool(activeTool) && activeLayerId && items[activeLayerId]?.content.kind === 'drawing' ? items[activeLayerId] : undefined;
   const focusLayerId = focusLayer?.id ?? null;
   // The "new layer" button reads armed while a drawing gesture is set but no layer is the target yet, so
   // "fresh layer pending - the next stroke mints one" is legible. Un-arms the instant a layer becomes active.
   const newLayerArmed = isAppendTool(activeTool) && activeLayerId === null;

   /**
    * World-px to push the sole-selected item's toolbar down so it clears the clip's top edge; undefined
    * when the item sits low enough to need no clamp (a stable prop, so an unclamped box still skips a pan
    * re-render). Only the toolbar-bearing sole selection is measured. `item.y` includes any live move.
    */
   const toolbarClampFor = (item: BoardItem): number | undefined => {
      if (item.id !== soleSelectedId) return undefined;
      const topScreen = viewport.y + (item.y + (moveDeltaFor(item.id)?.y ?? 0)) * viewport.zoom;
      const overshoot = TOOLBAR_TOP_CLEARANCE - topScreen;
      return overshoot > 0 ? overshoot / viewport.zoom : undefined;
   };

   /** Renders one item box. Shared by the non-zone and zone passes; a zone paints its own tinted frame inline. */
   const renderBox = (item: BoardItem) => {
      // A zone carries its member count (collapsed-bar badge) and a resize floor (the extent of its
      // members), so it can't be dragged smaller than it encloses; other kinds floor at MIN_ITEM_SIZE.
      const members = item.kind === 'zone' ? Object.values(items).filter((other) => other.zoneId === item.id) : null;
      return (
         <BoardItemBox
            key={item.id}
            item={item}
            isSelected={selectedIds.has(item.id)}
            soleSelected={item.id === soleSelectedId}
            isEditing={item.id === editingId}
            toolbarClamp={toolbarClampFor(item)}
            zIndex={itemZIndex(layerRank.get(item.id) ?? 0, selectedIds.has(item.id), layerCount)}
            memberCount={members?.length}
            resizeMin={members ? zoneContentMinSize(item, members) : item.kind === 'portal' ? PORTAL_MIN_SIZE : undefined}
            zoom={viewport.zoom}
            moveDelta={moveDeltaFor(item.id)}
            interacting={interacting}
            onSelect={actions.selectItem}
            onItemPointerDown={handleItemPointerDown}
            onDeepAction={handleItemDoubleClick}
            onMoveStart={handleMoveStart}
            onResize={actions.resizeItem}
            onSyncSize={actions.syncItemSize}
            onUpdateContent={actions.updateItemContent}
            onCacheLastKnown={actions.cacheReferenceLastKnown}
            onAdoptSource={actions.adoptItemDrawerSource}
            onBringToFront={actions.bringToFront}
            onSendToBack={actions.sendToBack}
            onDelete={handleDelete}
            onConnectStart={handleConnectStart}
            onRequestEditPortal={handleRequestEditPortal}
            onRequestRelinkPortal={handleRequestRelinkPortal}
            onCachePortalName={actions.cachePortalLastKnown}
         />
      );
   };

   // The radial's node tree: the three creation groups (Basic / Rich / Game) as flat root branches,
   // each opening straight to its leaves, plus duplicate + delete leaves at the root when something is
   // selected. Built only while the menu is open, from the same taxonomy the Add popover reads.
   const radialRoot: RadialNode[] = radial
      ? [
           ...CREATION_TAXONOMY.map((group): RadialNode => {
              const GroupIcon = group.icon;
              if (group.key === 'game') {
                 return {
                    id: `group-${group.key}`,
                    icon: <GroupIcon className="h-5 w-5" />,
                    label: t(group.labelKey),
                    children: group.rows.map((row): RadialNode => {
                       const RowIcon = row.icon;
                       if (row.kind === 'trackers') {
                          return {
                             id: 'trackers',
                             icon: <RowIcon className="h-5 w-5" />,
                             label: t(row.labelKey),
                             children: row.rows.map(({ id, trackerType, itemType, labelKey }) => {
                                const Icon = getItemTypeIconComponent(itemType);
                                return { id, icon: <Icon className="h-5 w-5" />, label: t(labelKey), onSelect: () => createTrackerAt(trackerType, radial.world) };
                             }),
                          };
                       }
                       if (row.kind === 'cards') {
                          return {
                             id: 'cards',
                             icon: <RowIcon className="h-5 w-5" />,
                             label: t(row.labelKey),
                             children: GAME_CARD_OPTIONS.map(({ game }) => {
                                const { Icon } = GAME_VISUALS[game];
                                // Open the creation popover for that game; the drop happens on confirm.
                                return { id: `card-${game}`, icon: <Icon className="h-5 w-5" />, label: t(`Drawer.Types.${game}`), onSelect: () => setPendingCard({ game, world: radial.world, screen: radial.screen }) };
                             }),
                          };
                       }
                       // A challenge picks its game (each variant drops immediately, no theme wizardry).
                       return {
                          id: 'challenge',
                          icon: <RowIcon className="h-5 w-5" />,
                          label: t(row.labelKey),
                          children: CHALLENGE_GAME_OPTIONS.map((game) => {
                             const { Icon } = GAME_VISUALS[game];
                             return { id: `challenge-${game}`, icon: <Icon className="h-5 w-5" />, label: t(`Drawer.Types.${game}`), onSelect: () => createChallengeAt(game, radial.world) };
                          }),
                       };
                    }),
                 };
              }
              return {
                 id: `group-${group.key}`,
                 icon: <GroupIcon className="h-5 w-5" />,
                 label: t(group.labelKey),
                 children: group.kinds.map((kind) => {
                    const { icon: Icon, labelKey, requiresPicker } = CREATABLE_BY_KIND[kind];
                    return {
                       id: kind,
                       icon: <Icon className="h-5 w-5" />,
                       label: t(`BoardView.${labelKey}`),
                       // A picker-first kind (a portal) opens its target picker before it drops.
                       onSelect: () => (requiresPicker ? setPortalPicker({ world: radial.world, screen: radial.screen }) : createItemAt(kind, radial.world)),
                    };
                 }),
              };
           }),
           ...(selectedIds.size > 0
              ? [
                   { id: 'duplicate', icon: <Copy className="h-5 w-5" />, label: t('BoardView.duplicateSelection'), onSelect: () => void handleDuplicateSelection() },
                   { id: 'delete', icon: <Trash2 className="h-5 w-5" />, label: t('BoardView.deleteSelection'), destructive: true, onSelect: handleDeleteSelection },
                ]
              : []),
        ]
      : [];

   return (
      <PendingEraseContext.Provider value={pendingErase}>
      <DrawingFocusContext.Provider value={focusLayerId}>
      <div
         ref={setClipRefs}
         data-board-clip
         data-tutorial="board-canvas"
         onPointerDownCapture={handleClipPointerDownCapture}
         onPointerDown={handleBackgroundPointerDown}
         onContextMenu={handleContextMenu}
         // Cursor language: panning shows the closed hand, a live marquee the crosshair, a pan-armed
         // modifier (Space/Alt) the open hand. At rest select is the plain default (the hand is pan-only
         // now, so it no longer signals "grab an element"); eraser keeps its cell, every other draw its crosshair.
         className={cn('absolute inset-0 overflow-hidden bg-muted/10', isPanning ? 'cursor-grabbing' : marquee ? 'cursor-crosshair' : spaceHeld || altHeld ? 'cursor-grab' : activeTool === 'select' ? 'cursor-default' : activeTool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair')}
      >
         <BoardGridLayer grid={grid} viewport={viewport} hexPatternId={hexPatternId} itemCount={Object.keys(items).length} />

         {/* World layer: a single transform maps world coords to screen. */}
         <div className="absolute left-0 top-0" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`, transformOrigin: '0 0' }}>
            {/* All non-connection items in ONE pass (never split by selection - no remount). Each box
                carries its z-index band: unselected below the connection layer, selected above it. A
                zone's tinted frame paints inline at the zone's band, behind its own members. */}
            {nonZoneItems.map(renderBox)}
            {zoneItems.map(renderBox)}

            {/* Group toolbar over the multi-selection's bounding box (per-item bars suppressed). It
                tops every band so it floats above its members and the connection layer. */}
            {groupBbox && (
               <div className="absolute" style={{ left: groupBbox.x, top: groupBbox.y, width: groupBbox.width, height: groupBbox.height, zIndex: groupToolbarZIndex(layerCount) }}>
                  <BoardGroupToolbar
                     zoom={viewport.zoom}
                     onMoveStart={(event) => {
                        const anchor = [...selectedIds][0];
                        if (anchor) handleMoveStart(anchor, event);
                     }}
                     onDuplicate={() => void handleDuplicateSelection()}
                     onDelete={handleDeleteSelection}
                  />
               </div>
            )}

            {/* Connections (+ the connect-drag preview) sit at the connection band (z N+1): above every
                unselected item, below every selected one - so a string to a selected item runs behind
                its face. Highlighted only when it is the sole selection (groups are about spatial items). */}
            <BoardConnectionsLayer
               items={items}
               connections={connectionItems}
               selectedId={soleSelectedId}
               zoom={viewport.zoom}
               moving={groupDrag}
               collapsedZoneIds={collapsedZoneIds}
               connectPreview={connectPreview}
               zIndex={connectionsZIndex(layerCount)}
               onSelect={(id) => actions.selectItem(id, false)}
               onUpdateStyle={(id, style) => void actions.updateItemContent(id, buildConnectionContent(items[id], style))}
               onDelete={handleDelete}
            />

            {/* In-flight pen stroke: painted in the WORLD layer (its points are world coords), so it tracks
                the cursor under pan/zoom while the overlay captures in screen. Tops the layer so it draws
                over the items; inert, and gone the instant the stroke commits. */}
            {penPreview && (
               <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1" style={{ zIndex: groupToolbarZIndex(layerCount) }} aria-hidden>
                  {/* Same paint path as the committed stroke: geometric for a shape gesture, freehand otherwise. */}
                  <StrokeShape stroke={{ brush: penSettings.brush, color: penSettings.color, width: penSettings.width, points: penPreview, shape: activeTool === 'line' ? 'line' : activeTool === 'regularPolygon' ? 'polygon' : activeTool === 'shape' ? (penSettings.shapeBase === 'circle' ? 'ellipse' : 'rect') : undefined, filled: activeTool === 'shape' || activeTool === 'regularPolygon' ? penSettings.shapeFilled : undefined }} />
               </svg>
            )}

            {/* In-progress freeform polygon: the committed vertices plus a rubber band to the cursor, painted
                OPEN and geometric in the active brush (it only closes once committed). Same inert world-layer
                overlay as the pen preview. */}
            {polygonPreview && (
               <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1" style={{ zIndex: groupToolbarZIndex(layerCount) }} aria-hidden>
                  <StrokeShape stroke={{ brush: penSettings.brush, color: penSettings.color, width: penSettings.width, points: polygonPreview, shape: 'line' }} />
               </svg>
            )}

            {/* Active drawing-layer cue: a dashed accent outline around the layer the next stroke appends to,
                shown only while a drawing gesture is armed. Dashed (not the solid selection ring), so it reads
                as "the active layer" rather than a selected element. Inert; theme tokens only. */}
            {focusLayer && (
               <div
                  className="pointer-events-none absolute rounded-sm border-dashed border-primary/70"
                  style={{
                     left: focusLayer.x + (moveDeltaFor(focusLayer.id)?.x ?? 0),
                     top: focusLayer.y + (moveDeltaFor(focusLayer.id)?.y ?? 0),
                     width: focusLayer.width,
                     height: focusLayer.height,
                     // Counter-scale the dashed stroke so it holds a constant on-screen weight at any zoom.
                     borderWidth: 2 / viewport.zoom,
                     zIndex: groupToolbarZIndex(layerCount),
                  }}
               />
            )}

            {/* Layers-panel hover cue: a soft outline around the element a panel row is hovering, so probing
                the list points it out on the board. Inert; theme tokens only; hidden once the item is selected. */}
            {hoveredItem && hoveredItem.kind !== 'connection' && !selectedIds.has(hoveredItem.id) && (
               <div
                  className="pointer-events-none absolute rounded-sm border border-primary/50"
                  style={{
                     left: hoveredItem.x + (moveDeltaFor(hoveredItem.id)?.x ?? 0),
                     top: hoveredItem.y + (moveDeltaFor(hoveredItem.id)?.y ?? 0),
                     width: hoveredItem.width,
                     height: hoveredItem.height,
                     borderWidth: 2 / viewport.zoom,
                     zIndex: groupToolbarZIndex(layerCount),
                  }}
               />
            )}
         </div>

         {/* Draw capture overlay: a screen-space gesture surface above the world layer. Interactive ONLY in a
             Draw gesture (select stays fully click-through, so item boxes never see the pointerdown). It routes
             the pan escape hatch first, then dispatches by the active gesture; right-click falls through to the
             radial. It renders nothing - strokes live in their drawing items. */}
         <div
            className={cn('absolute inset-0', activeTool === 'select' ? 'pointer-events-none' : activeTool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair')}
            onPointerDown={
               activeTool === 'eraser'
                  ? handleEraserPointerDown
                  : activeTool === 'line'
                    ? handleLinePointerDown
                    : activeTool === 'freeformPolygon'
                      ? handlePolygonPointerDown
                      : activeTool === 'regularPolygon'
                        ? handleRegularPolygonPointerDown
                        : activeTool === 'shape'
                          ? handleShapePointerDown
                          : handleFreehandPointerDown
            }
            onPointerMove={activeTool === 'freeformPolygon' ? handlePolygonPointerMove : undefined}
            onDoubleClick={activeTool === 'freeformPolygon' ? handlePolygonDoubleClick : undefined}
            onContextMenu={handleContextMenu}
         />

         {/* Marquee rectangle: a screen-space overlay (not the world layer), drawn while a
             Shift+background drag is in progress. Inert so it never interferes with the drag. */}
         {marquee && (
            <div
               className="pointer-events-none absolute border border-primary bg-primary/10"
               style={{
                  left: Math.min(marquee.x0, marquee.x1) - marquee.clipLeft,
                  top: Math.min(marquee.y0, marquee.y1) - marquee.clipTop,
                  width: Math.abs(marquee.x1 - marquee.x0),
                  height: Math.abs(marquee.y1 - marquee.y0),
               }}
            />
         )}

         <BoardNamePill
            name={name}
            placeholder={t('BoardView.boardNamePlaceholder')}
            onCommit={(value) => void actions.renameBoard(value)}
            layersPanelOpen={layersPanelOpen}
            layersPanelWidth={LAYERS_PANEL_WIDTH}
         />

         {/* Bottom-center tool bar: the mode segment, the contextual creation/drawing section, then the view
             controls + positioning cluster. It grows to fit its contents and, when they exceed the canvas,
             scrolls horizontally inside (capped at the canvas width minus its margins) - the wheel scrolls it,
             the scrollbar is hidden, and edge arrows appear per side (like the tab strip). Stops the pointer so
             editing a field or scrolling the bar never pans. Holds its floor spot (z-40, above the board content
             but below the floating windows / radial); the app-wide dice tray (z-50) simply overlays it when open
             rather than shoving it up. `overflow-x-clip` clips a slide-out arrow at the card edge. */}
         <div
            data-tutorial="board-toolbar"
            onPointerDown={(event) => event.stopPropagation()}
            style={{ bottom: BAR_EDGE_GAP, marginLeft: layersPanelOpen ? -(LAYERS_PANEL_WIDTH / 2) : 0 }}
            className={cn(
               'absolute left-1/2 z-40 flex w-fit -translate-x-1/2 items-center overflow-x-clip rounded-md border border-border bg-card/90 shadow-sm backdrop-blur-sm transition-[margin-left] duration-300 ease-out',
               // Slide the bar out from under the panel and cap its width to the free region so it never underlaps.
               layersPanelOpen ? 'max-w-[calc(100%-1.5rem-16rem)]' : 'max-w-[calc(100%-1.5rem)]',
            )}
         >
            <AnimatePresence>
               {barCanScrollLeft && (
                  <motion.button
                     key="bar-scroll-left"
                     type="button"
                     onClick={() => scrollBarBy(-1)}
                     aria-label={t('BoardView.scrollLeft')}
                     title={t('BoardView.scrollLeft')}
                     className={cn(BAR_ARROW_CLASS, 'left-1.5')}
                     initial={{ opacity: 0, x: -12 }}
                     animate={{ opacity: 1, x: 0 }}
                     exit={{ opacity: 0, x: -12 }}
                     transition={{ duration: 0.18, ease: 'easeOut' }}
                  >
                     <ChevronLeft className="h-4 w-4" />
                  </motion.button>
               )}
            </AnimatePresence>

            {/* The only scrollable element: capped to the card width (min-w-0) and scrolls; the wheel
                handler maps a vertical wheel to horizontal scroll, so the hidden scrollbar shows nothing. */}
            <div ref={barScrollRef} className="min-w-0 overflow-x-auto overscroll-x-contain scrollbar-hide">
               <div ref={barContentRef} className="flex w-max items-center gap-1.5 p-1.5">
                  {/* Sticky mode segment (Elements / Drawing): labeled toggles with a stable icon per mode, so
                      the modes read as distinct from the icon-only clusters below. The Drawing glyph never
                      tracks the active gesture; the specific gesture lives in the settings bar. Drawing is
                      pressed for any drawing gesture and re-enters the last one - exit via Elements, Esc, or V. */}
                  <div data-tutorial="board-mode-segment" className="flex shrink-0 items-center gap-0.5">
                     <ToolToggleButton active={activeTool === 'select'} title={t('BoardView.toolSelect')} label={t('BoardView.toolSelect')} onClick={() => setActiveTool('select')}>
                        <MousePointer2 className="h-4 w-4" />
                     </ToolToggleButton>
                     <ToolToggleButton active={activeTool !== 'select'} title={t('BoardView.toolDraw')} label={t('BoardView.toolDraw')} onClick={() => chooseDrawTool(lastDrawToolRef.current)}>
                        <PenTool className="h-4 w-4" />
                     </ToolToggleButton>
                  </div>
                  {/* The contextual second section swaps by mode: Select shows the element-creation cluster;
                      Draw shows the drawing-tool settings (gesture axis / brush / size / ink / new layer). The
                      mode segment above and the view controls below stay visible in both modes. */}
                  {activeTool === 'select' ? (
                     <>
                        <div className="mx-0.5 h-5 w-px shrink-0 bg-border" />
                        <BoardAddMenu
                           onAddItem={handleAddItem}
                           onOpenPortalPicker={openPortalPickerAtViewCenter}
                           onAddTracker={(trackerType) => createTrackerAt(trackerType, currentViewCenter())}
                           onPickCardGame={handlePickCardGame}
                           onAddChallenge={(game) => createChallengeAt(game, currentViewCenter())}
                        />
                     </>
                  ) : (
                     <BoardToolSettingsBar
                        tool={activeTool}
                        onSetTool={chooseDrawTool}
                        penSettings={penSettings}
                        onSetBrush={setPenBrush}
                        onSetColor={setPenColor}
                        onSetWidth={setPenWidth}
                        onNewLayer={() => setActiveLayerId(null)}
                        newLayerArmed={newLayerArmed}
                        sides={polygonSides}
                        onSetSides={setPolygonSides}
                        shapeBase={penSettings.shapeBase}
                        onSetShapeBase={setShapeBase}
                        shapeFilled={penSettings.shapeFilled}
                        onSetShapeFilled={setShapeFilled}
                     />
                  )}
                  <div className="mx-0.5 h-5 w-px shrink-0 bg-border" />
                  <BoardGridMenu grid={grid} onSelect={(type) => void actions.setGrid({ ...grid, type })} />
                  <ToolbarButton title={t('LayersPanel.toggle')} active={layersPanelOpen} onClick={toggleLayersPanel} dataTutorial="board-layers-toggle">
                     <Layers className="h-4 w-4" />
                  </ToolbarButton>
                  <div className="mx-0.5 h-5 w-px shrink-0 bg-border" />
                  {/* Positioning cluster: the recenter button, the center on contents button, the live zoom %, then the world point
                  the view is CENTERED on as two editable fields - typing + Enter recenters on that point (keeping zoom). */}
                  <ToolbarButton title={t('BoardView.fitToContent')} onClick={handleFitToContent}>
                     <Maximize className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton title={t('BoardView.returnToOrigin')} onClick={() => actions.setViewport(originViewport())}>
                     <Crosshair className="h-4 w-4" />
                  </ToolbarButton>
                  <div className="flex shrink-0 items-center gap-1.5 px-0.5">
                     <span className="text-xs tabular-nums text-muted-foreground mr-2 ml-1">{Math.round(viewport.zoom * 100)}%</span>
                     {/* Separates the read-only zoom from the editable view-center fields, so the % never reads as an input. */}
                     <BoardCoordinateField ref={jumpXRef} prefix="x:" label={t('BoardView.coordinateX')} value={Math.round(viewCenter.x)} onCommit={(x) => jumpToViewCenter({ x, y: Math.round(viewCenter.y) })} />
                     <BoardCoordinateField prefix="y:" label={t('BoardView.coordinateY')} value={Math.round(viewCenter.y)} onCommit={(y) => jumpToViewCenter({ x: Math.round(viewCenter.x), y })} />
                  </div>
               </div>
            </div>

            <AnimatePresence>
               {barCanScrollRight && (
                  <motion.button
                     key="bar-scroll-right"
                     type="button"
                     onClick={() => scrollBarBy(1)}
                     aria-label={t('BoardView.scrollRight')}
                     title={t('BoardView.scrollRight')}
                     className={cn(BAR_ARROW_CLASS, 'right-1.5')}
                     initial={{ opacity: 0, x: 12 }}
                     animate={{ opacity: 1, x: 0 }}
                     exit={{ opacity: 0, x: 12 }}
                     transition={{ duration: 0.18, ease: 'easeOut' }}
                  >
                     <ChevronRight className="h-4 w-4" />
                  </motion.button>
               )}
            </AnimatePresence>
         </div>

         {/* Layers panel: a frosted right-edge overlay inside the clip (screen-space, never in the pan/zoom
             transform). Subscribes to items/selection/hover only, so a pan never re-renders it. */}
         {layersPanelOpen && (
            <LayersPanel
               store={store}
               onClose={() => setLayersPanelOpen(false)}
               onSelect={handleLayerSelect}
               onActivate={handleLayerActivate}
               onHover={actions.setHovered}
               onCommitLabel={handleLayerCommitLabel}
               onReorder={handleLayerReorder}
               onToggleZoneCollapse={handleZoneCollapseToggle}
               onMerge={handleLayerMerge}
            />
         )}

         {/* Right-click radial menu (portals to the body; screen-space, edge-clamped). */}
         {radial && <BoardRadialMenu screen={radial.screen} root={radialRoot} onClose={() => setRadial(null)} />}
      </div>

      {/* Card creation: a draggable, non-modal window. It lives OUTSIDE the clip div, so a pointer-down
          on it never reaches the canvas pan handler (the click-through fix); the canvas stays visible and
          interactive behind it. Close via the X button or Escape; confirm drops the card at the pending
          world point. */}
      {pendingCard && (
         <BoardCardCreationWindow
            game={pendingCard.game}
            initialScreen={pendingCard.screen}
            clipRect={clipRect}
            onConfirm={(options) => { createCardAt(pendingCard.game, options, pendingCard.world); setPendingCard(null); }}
            onClose={() => setPendingCard(null)}
         />
      )}

      {/* Portal target picker: the shared headless target list in a draggable, non-modal window (same shell as
          the card-creation dialog). It has no note, so it passes no `sections`; picking a row drops the portal
          styled and closes. Closes on the X button or Escape only - no outside-click dismiss, matching the card
          dialog; the search input autofocuses on open (from `LinkTargetList`). */}
      {portalPicker && (
         <BoardFloatingWindow
            initialScreen={portalPicker.screen}
            clipRect={clipRect}
            width={PORTAL_WINDOW_WIDTH}
            title={t('BoardView.portalPickerTitle')}
            onClose={() => setPortalPicker(null)}
         >
            <LinkTargetList onPick={handlePortalPick} />
         </BoardFloatingWindow>
      )}

      {/* Portal restyle editor: a movable window (same shell as the picker) driving the selected portal's
          style. Change-target reopens the picker in retarget mode; every style edit is one undoable command,
          read live-then-patched (via `commitPortalStyle`). Closes if its item is deleted or is no longer a
          portal. */}
      {portalEditor && items[portalEditor.itemId]?.content.kind === 'portal' && (
         <BoardFloatingWindow
            initialScreen={portalEditor.screen}
            clipRect={clipRect}
            width={PORTAL_EDITOR_WIDTH}
            title={t('BoardView.portalEditorTitle')}
            onClose={() => setPortalEditor(null)}
         >
            <BoardPortalEditor
               content={items[portalEditor.itemId].content as PortalBoardContent}
               onCommitStyle={(updater) => commitPortalStyle(portalEditor.itemId, updater)}
               onChangeTarget={() => setPortalPicker({ world: { x: 0, y: 0 }, screen: portalEditor.screen, retargetItemId: portalEditor.itemId })}
            />
         </BoardFloatingWindow>
      )}
      </DrawingFocusContext.Provider>
      </PendingEraseContext.Provider>
   );
}
