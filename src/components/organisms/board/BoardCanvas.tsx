// -- React Imports --
import { useCallback, useEffect, useId, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { useStore } from 'zustand';
import { useDroppable } from '@dnd-kit/core';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { fitViewport } from '@/lib/board/boardCoordinates';
import { flattenBoardOrder } from '@/lib/board/boardTree';
import { CREATABLE_BY_KIND, type CreatableKind } from '@/lib/creation/creatableRegistry';
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
import { useBoardRadial } from '@/hooks/board/useBoardRadial';
import { useBoardLayers } from '@/hooks/board/useBoardLayers';

// -- Component Imports --
import { BoardRadialMenu } from './BoardRadialMenu';
import { LayersPanel } from './LayersPanel';
import { LinkTargetList } from '@/components/molecules/links/LinkTargetList';
import { BoardPortalEditor } from './items/BoardPortalEditor';
import { BoardFloatingWindow, PORTAL_WINDOW_WIDTH, PORTAL_EDITOR_WIDTH } from './windows/BoardFloatingWindow';
import { BoardCardCreationWindow } from './windows/BoardCardCreationWindow';
import { BoardGridLayer } from './layers/BoardGridLayer';
import { BoardItemsLayer } from './layers/BoardItemsLayer';
import { BoardToolbar } from './toolbar/BoardToolbar';
import { BoardNamePill } from './toolbar/BoardNamePill';
import { isEditableTarget, isTextEditableKind, MOVE_THRESHOLD, RIGHT_PAN_THRESHOLD } from './boardCanvasConstants';

// -- Store Imports --
import { useAppGeneralStateStore, useAppGeneralStateActions } from '@/lib/stores/appGeneralStateStore';
import { useAppSettingsStore, useAppSettingsActions } from '@/lib/stores/appSettingsStore';

// -- Type Imports --
import type { BoardStore } from '@/lib/stores/boardStore';
import type { BoardGridType, BoardItem, BrushKind, PortalBoardContent } from '@/lib/types/board';
import type { ChallengeGame } from '@/lib/types/common';

/*
 * The board canvas: a pan/zoom world layer over the active board, with freeform move /
 * resize / select / z-order / delete wired to the board store's commands, plus a
 * creation palette for the board-native item kinds. It reads the ACTIVE BOARD instance
 * (never the character context) and only mounts when a board tab is active. Embedded
 * drawer items, connections, and threats are later prompts.
 */


/** The layers panel's fixed width (matches its `w-64`), used to inset the bottom bar when it's open. */
const LAYERS_PANEL_WIDTH = 256;

export function BoardCanvas({ store }: { store: BoardStore }) {
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

   // The right-click radial: the open state, the `contextmenu` opener, the taxonomy-built node tree, and the
   // suppress ref the right-drag capture handler below sets so a pan / polygon-close doesn't also open it.
   const {
      radial,
      setRadial,
      suppressRadialRef,
      radialRoot,
      handleContextMenu,
   } = useBoardRadial({
      store,
      actions,
      cursorToWorld,
      selectedIds,
      createItemAt,
      createTrackerAt,
      createChallengeAt,
      setPendingCard,
      setPortalPicker,
      handleDuplicateSelection,
      handleDeleteSelection,
   });

   // The layers-panel wiring: the row handlers plus the canvas-side render cues it drives (the hovered-row
   // highlight, the active drawing-layer focus, and the "new layer" armed flag). `handleLayerMerge` is also
   // reached by the palette's merge command below.
   const {
      handleLayerSelect,
      handleLayerActivate,
      handleLayerCommitLabel,
      handleLayerReorder,
      handleLayerMerge,
      handleZoneCollapseToggle,
      hoveredItem,
      focusLayer,
      focusLayerId,
      newLayerArmed,
   } = useBoardLayers({ store, actions, items, clipRef, viewportRef, activeTool, activeLayerId });

   // The bottom-bar overflow-scroll UX (wheel scrolls, hidden scrollbar, edge arrows).
   const { barScrollRef, barContentRef, barCanScrollLeft, barCanScrollRight, scrollBarBy } = useBoardBarScroll(activeTool);

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

         <BoardItemsLayer
            viewport={viewport}
            clipWidth={clipRect.width}
            items={items}
            nonZoneItems={nonZoneItems}
            zoneItems={zoneItems}
            connectionItems={connectionItems}
            collapsedZoneIds={collapsedZoneIds}
            selectedIds={selectedIds}
            soleSelectedId={soleSelectedId}
            editingId={editingId}
            layerRank={layerRank}
            layerCount={layerCount}
            moveDeltaFor={moveDeltaFor}
            interacting={interacting}
            groupBbox={groupBbox}
            groupDrag={groupDrag}
            connectPreview={connectPreview}
            penPreview={penPreview}
            polygonPreview={polygonPreview}
            penSettings={penSettings}
            activeTool={activeTool}
            focusLayer={focusLayer}
            hoveredItem={hoveredItem}
            actions={actions}
            handleItemPointerDown={handleItemPointerDown}
            handleItemDoubleClick={handleItemDoubleClick}
            handleMoveStart={handleMoveStart}
            handleDelete={handleDelete}
            handleConnectStart={handleConnectStart}
            handleRequestEditPortal={handleRequestEditPortal}
            handleRequestRelinkPortal={handleRequestRelinkPortal}
            handleDuplicateSelection={handleDuplicateSelection}
            handleDeleteSelection={handleDeleteSelection}
         />

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

         <BoardToolbar
            activeTool={activeTool}
            setActiveTool={setActiveTool}
            chooseDrawTool={chooseDrawTool}
            lastDrawToolRef={lastDrawToolRef}
            handleAddItem={handleAddItem}
            openPortalPickerAtViewCenter={openPortalPickerAtViewCenter}
            createTrackerAt={createTrackerAt}
            currentViewCenter={currentViewCenter}
            handlePickCardGame={handlePickCardGame}
            createChallengeAt={createChallengeAt}
            penSettings={penSettings}
            setPenBrush={setPenBrush}
            setPenColor={setPenColor}
            setPenWidth={setPenWidth}
            setActiveLayerId={setActiveLayerId}
            newLayerArmed={newLayerArmed}
            polygonSides={polygonSides}
            setPolygonSides={setPolygonSides}
            setShapeBase={setShapeBase}
            setShapeFilled={setShapeFilled}
            grid={grid}
            actions={actions}
            toggleLayersPanel={toggleLayersPanel}
            layersPanelOpen={layersPanelOpen}
            layersPanelWidth={LAYERS_PANEL_WIDTH}
            handleFitToContent={handleFitToContent}
            originViewport={originViewport}
            viewport={viewport}
            viewCenter={viewCenter}
            jumpToViewCenter={jumpToViewCenter}
            jumpXRef={jumpXRef}
            barScrollRef={barScrollRef}
            barContentRef={barContentRef}
            barCanScrollLeft={barCanScrollLeft}
            barCanScrollRight={barCanScrollRight}
            scrollBarBy={scrollBarBy}
         />

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
