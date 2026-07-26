// -- React Imports --
import { useCallback, useEffect, useId, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { useStore } from 'zustand';
import { useDroppable } from '@dnd-kit/core';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import cuid from 'cuid';

// -- Icon Imports --
import { ChevronLeft, ChevronRight, Copy, Crosshair, Layers, Maximize, MousePointer2, PenTool, Trash2 } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { centerViewport, fitViewport, itemsInMarquee, screenDeltaToWorld, screenToWorld, zoomToCursor } from '@/lib/board/boardCoordinates';
import { DEFAULT_CONNECTION_STYLE } from '@/lib/board/boardConnections';
import { zoneContaining, zoneContentMinSize } from '@/lib/board/zoneMembership';
import { connectionsZIndex, groupToolbarZIndex, itemZIndex } from '@/lib/board/boardLayering';
import { flattenBoardOrder, nextScopeZ } from '@/lib/board/boardTree';
import { isMergeableSelection } from '@/lib/board/layersReorder';
import { ERASER_RADIUS, isAppendTool, isLineDegenerate, makeStroke, MIN_LINE_LENGTH, pointsBounds, rebasePoints, regularPolygonVertices, shapeBoxCorners, snapAngle, strokeHitsPoint } from '@/lib/board/drawingStyle';
import { EMBEDDED_TRACKER_SIZES, EMBEDDED_CARD_SIZE, embeddedSpecForDrawerItem } from '@/lib/board/embedDrawerItem';
import { getItem } from '@/lib/drawer/drawerRepository';
import { emptyTracker, type TrackerType } from '@/lib/trackers/emptyTracker';
import { buildCard } from '@/lib/cards/buildCard';
import { GAME_VISUALS, GAME_CARD_OPTIONS, CHALLENGE_GAME_OPTIONS } from '@/lib/constants/gameVisuals';
import { getItemTypeIconComponent } from '@/lib/utils/drawer-icons';
import { CREATABLE_BY_KIND, type CreatableKind } from '@/lib/creation/creatableRegistry';
import { CREATION_TAXONOMY } from '@/lib/creation/creationTaxonomy';
import { makePortalContent, portalTargetFromInsert } from '@/lib/creation/portalContent';
import { PORTAL_MIN_SIZE } from '@/lib/board/portalSizing';
import { EMPTY_STROKE_IDS, PendingEraseContext } from '@/lib/board/PendingEraseContext';
import { DrawingFocusContext } from '@/lib/board/DrawingFocusContext';
import { runSaveImageToDrawerAs, runSaveItemToDrawer, runSaveItemToDrawerAs } from '@/hooks/board/useBoardItemSaveBack';
import { useBoardBarScroll } from '@/hooks/board/useBoardBarScroll';

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
import { BoardFloatingWindow, PORTAL_WINDOW_WIDTH, PORTAL_EDITOR_WIDTH, BOARD_WINDOW_MARGIN } from './windows/BoardFloatingWindow';
import { BoardCardCreationWindow } from './windows/BoardCardCreationWindow';
import { BoardCoordinateField } from './fields/BoardCoordinateField';
import { BoardGridLayer } from './layers/BoardGridLayer';
import { ToolbarButton } from './toolbar/ToolbarButton';
import { ToolToggleButton } from './toolbar/ToolToggleButton';
import { BoardNamePill } from './toolbar/BoardNamePill';

// -- Store Imports --
import { useActiveBoardInstance } from '@/lib/board/ActiveBoardStoreContext';
import { useAppGeneralStateStore, useAppGeneralStateActions } from '@/lib/stores/appGeneralStateStore';
import { useAppSettingsStore, useAppSettingsActions } from '@/lib/stores/appSettingsStore';
import { useDrawerStore } from '@/lib/stores/drawerStore';

// -- Type Imports --
import type { BoardStore } from '@/lib/stores/boardStore';
import type { ActiveTool, BoardGridType, BoardItem, BoardItemContent, BoardItemKind, BrushKind, ConnectionStyle, PortalBoardContent, PortalStyle, PortalTarget, Stroke, Viewport } from '@/lib/types/board';
import type { LinkInsertTarget } from '@/lib/portals/buildLinkToken';
import type { Point } from '@/lib/board/boardConnections';
import type { Card } from '@/lib/types/character';
import type { GameSystem } from '@/lib/types/drawer';
import type { ChallengeGame } from '@/lib/types/common';
import type { CreateCardOptions } from '@/lib/types/creation';

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

/** Wheel-to-zoom sensitivity: a typical notch (~100 deltaY) is a gentle step. */
const ZOOM_SENSITIVITY = 0.0015;

/** Screen-px radius around a freeform polygon's first vertex where a click closes the shape (>= 3 vertices). */
const POLYGON_CLOSE_THRESHOLD = 12;

/** The regular polygon's rotation snap step (radians) while Shift is held: 15deg detents. */
const ROTATION_SNAP = Math.PI / 12;

/** Screen-px a pointer must travel before a drag arms a move/marquee; a sub-threshold press dispatches nothing. */
const MOVE_THRESHOLD = 5;
/** Screen-px a right-drag must travel to pan instead of opening the radial (larger so a jittery right-click still opens it). */
const RIGHT_PAN_THRESHOLD = 8;

/** The kinds with a text-edit sub-state: a body click selects, then a second click (or a click on an
 *  already-selected one) promotes it to editing (focused editor). Every other kind has no editing state. */
const TEXT_EDITABLE_KINDS = new Set<BoardItemKind>(['post-it', 'journal', 'text']);
const isTextEditableKind = (kind: BoardItemKind | undefined): boolean => kind !== undefined && TEXT_EDITABLE_KINDS.has(kind);

/** True when the target is a live text field / editor, so board pointer gestures defer to it (native menu, typing). */
function isEditableTarget(target: EventTarget | null): boolean {
   return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

/** Screen-px margin fit-to-content leaves around the framed items. */
const FIT_PADDING = 64;
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
   const viewport = useStore(store, (state) => state.viewport);
   const grid = useStore(store, (state) => state.grid);
   const hexPatternId = useId();
   const name = useStore(store, (state) => state.name);
   const items = useStore(store, (state) => state.items);
   const actions = useStore(store, (state) => state.actions);

   // Selection lives in the board store as ephemeral state (shared with the layers panel), never
   // persisted or routed through commands. Read here; mutated via the store's selection actions.
   const selectedIds = useStore(store, (state) => state.selectedIds);
   // The hovered item drives a canvas highlight for a layers-panel row hover (row -> canvas only). Discrete
   // enter/leave, so subscribing here re-renders on a boundary crossing, never per pointer move.
   const hoveredId = useStore(store, (state) => state.hoveredId);
   const [isPanning, setIsPanning] = useState(false);
   // A Shift+background marquee (null when idle); a plain drag pans instead. Corners are in
   // client coords; the clip origin is captured at start so the overlay + world math never
   // read a ref during render.
   const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number; clipLeft: number; clipTop: number } | null>(null);
   // The live group move: the moving id set + a shared world delta (null when idle).
   const [groupDrag, setGroupDrag] = useState<{ ids: Set<string>; delta: { x: number; y: number } } | null>(null);
   // The item in its text-edit sub-state (post-it / journal / text), or null. Ephemeral canvas state,
   // decoupled from selection: a text item is selected first, then a body click promotes it to editing
   // (a focused editor). Cleared when it stops being the sole selection or on Escape (see the effects below).
   const [editingId, setEditingId] = useState<string | null>(null);

   /** Opens the portal restyle editor for `itemId`, anchored at the Edit click. Stable so it never breaks
    *  the item box memoization (every box would otherwise re-render on each pan). */
   const handleRequestEditPortal = useCallback((itemId: string, screen: { x: number; y: number }) => {
      setPortalEditor({ itemId, screen });
   }, []);

   /** Relinks a dead portal: reopens the shared picker in retarget mode (swaps the target, keeps the style).
    *  `world` is unused on a retarget; stable for the same box-memoization reason as the Edit handler. */
   const handleRequestRelinkPortal = useCallback((itemId: string, screen: { x: number; y: number }) => {
      setPortalPicker({ world: { x: 0, y: 0 }, screen, retargetItemId: itemId });
   }, []);

   // Cross-surface drop target for dragging a drawer card/tracker onto the canvas. Only
   // mounted on a board tab (BoardView renders nothing otherwise), so it never competes
   // with the sheet drop zones on a character tab. The drop is routed by `handleDragEnd`.
   const { setNodeRef: setDroppableRef } = useDroppable({ id: 'board-drop-zone', data: { type: 'board-drop-zone' } });

   const clipRef = useRef<HTMLDivElement | null>(null);
   // Compose the droppable node ref with the local clip ref (used for the wheel listener
   // and screen->world math, and read by the drop handler via `data-board-clip`).
   const setClipRefs = (node: HTMLDivElement | null) => {
      clipRef.current = node;
      setDroppableRef(node);
   };
   // Mirror the live viewport into a ref so the native wheel listener and pan handlers
   // read the current value without re-subscribing.
   const viewportRef = useRef(viewport);
   useEffect(() => {
      viewportRef.current = viewport;
   }, [viewport]);
   const panStart = useRef<{ x: number; y: number; origX: number; origY: number; zoom: number } | null>(null);

   // The clip's live box (size + viewport offset), so the corner readout and the card popover read it
   // from state, never via the ref during render. The observer captures the rect (in its callback, not
   // the effect body) and fires on observe(), so the first measure lands without a synchronous setState.
   const [clipRect, setClipRect] = useState({ left: 0, top: 0, width: 0, height: 0 });
   useEffect(() => {
      const el = clipRef.current;
      if (!el) return;
      const observer = new ResizeObserver(() => {
         const box = el.getBoundingClientRect();
         setClipRect({ left: box.left, top: box.top, width: box.width, height: box.height });
      });
      observer.observe(el);
      return () => observer.disconnect();
   }, []);
   // The world point at the clip's center, for the positioning cluster. Origin cancels for the centre, so
   // it derives from the live viewport + clip size alone (no layout read during render).
   const viewCenter = screenToWorld(clipRect.width / 2, clipRect.height / 2, { left: 0, top: 0 }, viewport);
   // Reset-view places the world origin at the clip's center (so the cluster reads 0, 0), not the
   // top-left corner that a zero offset would give.
   const originViewport = (): Viewport => centerViewport({ x: 0, y: 0 }, clipRect, 1);
   // Recenters the viewport on a world point (keeping zoom): the coordinate cluster's jump. Same centering
   // as fit-to-content / reset-view; routed through the debounced, non-undoable camera setter.
   const jumpToViewCenter = (world: Point) => actions.setViewport(centerViewport(world, clipRect, viewport.zoom));

   const layersPanelOpen = useAppSettingsStore((state) => state.layersPanelOpen);

   // The positioning cluster's X input, focused by the palette's jump command (it can't carry a coordinate
   // through the one-shot bridge, so it focuses the field and lets the user type).
   const jumpXRef = useRef<HTMLInputElement | null>(null);

   // The in-progress connect drag (preview line follows the cursor in world coords).
   const [connectPreview, setConnectPreview] = useState<{ fromId: string; cursor: Point } | null>(null);

   // The active pointer TOOL and the current drawing LAYER strokes append to - both ephemeral (same
   // family as the selection), never persisted or routed through commands. `select` is the default
   // (click-through overlay); every other value is a Draw gesture that owns the pointer. Only freehand +
   // eraser are wired today. A first stroke with no active layer mints one.
   const [activeTool, setActiveTool] = useState<ActiveTool>('select');
   // The last Draw gesture chosen, so re-entering Draw from Select restores it (default freehand). Ephemeral.
   const lastDrawToolRef = useRef<Exclude<ActiveTool, 'select'>>('freehand');
   /** Enters a Draw gesture and remembers it, so leaving to Select and clicking Draw returns to that gesture. */
   const chooseDrawTool = useCallback((tool: Exclude<ActiveTool, 'select'>) => {
      lastDrawToolRef.current = tool;
      setActiveTool(tool);
   }, []);
   const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
   // The regular polygon's side count, read at press time by its center-out drag. Ephemeral tool setting.
   const [polygonSides, setPolygonSides] = useState(5);
   // The pen/highlighter settings (brush, ink, per-brush widths), persisted in app settings. Every new
   // stroke and the live preview read the CURRENT values, so the pickers actually drive the ink.
   const penSettings = useAppSettingsStore((state) => state.penSettings);
   const { setPenBrush, setPenColor, setPenWidth, setShapeBase, setShapeFilled, toggleLayersPanel, setLayersPanelOpen } = useAppSettingsActions();
   // Space arms a mode-independent pan (mirrored to a ref for the pointer handlers, and to state for the
   // cursor). The pen overlay + a Space/middle-drag can all start a pan, so the trigger is mode-agnostic.
   const [spaceHeld, setSpaceHeld] = useState(false);
   const spaceHeldRef = useRef(false);
   // Alt likewise arms a pan (Alt+left-drag). Only the cursor needs it in state - the pointerdown reads
   // `event.altKey` live - so there's no ref twin; keyup / blur disarm it, mirroring Space.
   const [altHeld, setAltHeld] = useState(false);
   // The in-flight pen stroke's WORLD points (captured in screen, painted in world) + its live preview.
   // The cleanup ref tears the window listeners down on unmount so a mid-stroke tab switch can't leak them.
   const currentStrokeRef = useRef<{ points: number[] } | null>(null);
   const strokeCleanupRef = useRef<null | (() => void)>(null);
   const [penPreview, setPenPreview] = useState<number[] | null>(null);
   // The in-progress freeform polygon: the WORLD vertices dropped so far (a persistent multi-click gesture,
   // unlike the self-terminating pen/line) plus its live preview (the committed vertices + a rubber band to
   // the cursor). Null when no polygon is being drawn. Cleared on close/cancel, on leaving the polygon tool,
   // and on board switch. The ref is separate from the pan/select paths, so neither can touch it.
   const polygonRef = useRef<number[] | null>(null);
   const [polygonPreview, setPolygonPreview] = useState<number[] | null>(null);
   // A right-click that just finished a polygon must not also open the radial; set on the finishing
   // pointerdown, consumed by the matching context-menu.
   const suppressRadialRef = useRef(false);
   // Stroke ids the in-progress eraser scrub has crossed, hidden on contact and cleared when the scrub
   // commits (or on board switch). The removal is only made real, as ONE undo step, on pointer-up.
   const [pendingErase, setPendingErase] = useState<ReadonlySet<string>>(EMPTY_STROKE_IDS);
   // Board switches keep this canvas mounted (a new `store` prop, no remount), so the tool/layer would
   // leak across boards; reset them when the loaded board id changes.
   const boardId = useStore(store, (state) => state.boardId);
   useEffect(() => {
      setActiveTool('select');
      setActiveLayerId(null);
      setPendingErase(EMPTY_STROKE_IDS);
      polygonRef.current = null;
      setPolygonPreview(null);
   }, [boardId]);

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

   // A pending board card creation: the chosen game, the world point to drop at, and the screen point
   // the creation window opens at (near the toolbar when menu-triggered, the cursor from the radial).
   // Null when closed.
   const [pendingCard, setPendingCard] = useState<{ game: GameSystem; world: Point; screen: { x: number; y: number } } | null>(null);

   // The target picker: anchored at `screen`. On CREATE it drops a new portal at `world`; on RETARGET
   // (`retargetItemId` set, opened from the editor) it swaps that portal's target and keeps its style. Null
   // when closed. A portal picks its target FIRST, then drops styled.
   const [portalPicker, setPortalPicker] = useState<{ world: Point; screen: { x: number; y: number }; retargetItemId?: string } | null>(null);

   // The open portal restyle editor: the item being edited + the screen point its window opens at (the Edit
   // click). Null when closed. The window itself is a `BoardFloatingWindow` rendered below.
   const [portalEditor, setPortalEditor] = useState<{ itemId: string; screen: { x: number; y: number } } | null>(null);

   // The bottom-bar overflow-scroll UX (wheel scrolls, hidden scrollbar, edge arrows).
   const { barScrollRef, barContentRef, barCanScrollLeft, barCanScrollRight, scrollBarBy } = useBoardBarScroll(activeTool);

   /** Converts an absolute cursor point to world coords via the live clip rect + viewport. */
   const cursorToWorld = useCallback((clientX: number, clientY: number): Point | null => {
      const el = clipRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return screenToWorld(clientX, clientY, { left: rect.left, top: rect.top }, viewportRef.current);
   }, []);

   /** Deletes one item plus the connections referencing it (cascade + dedupe), as one undo step. */
   const handleDelete = useCallback(
      (id: string) => {
         void actions.deleteItems([id]);
         actions.deselectItem(id);
      },
      [actions],
   );

   /** Deletes the whole selection (with connection cascade) as one undo step, then clears it. */
   const handleDeleteSelection = useCallback(() => {
      if (selectedIds.size === 0) return;
      void actions.deleteItems([...selectedIds]);
      actions.clearSelection();
   }, [actions, selectedIds]);

   /** Duplicates the selection (copies + in-selection connections, offset), then selects the copies. */
   const handleDuplicateSelection = useCallback(async () => {
      if (selectedIds.size === 0) return;
      const newIds = await actions.duplicateItems([...selectedIds]);
      actions.setSelection(newIds);
   }, [actions, selectedIds]);

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
   }, [store, actions]);

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

   /**
    * Starts a group move from an item's move grip or its body (canvas-owned, like the connect drag). The
    * move arms only once the pointer clears `MOVE_THRESHOLD`, measured from the down origin so the item
    * never jumps; a sub-threshold release is a click - it dispatches no move and runs `onClickNoMove`
    * instead (the body passes a select there; the grip passes nothing, so a grip click is a no-op). The
    * whole selection moves if the grabbed item is in it; otherwise it selects just that item and moves it
    * alone. A shared world delta renders live; one compound command on release.
    */
   const handleMoveStart = useCallback(
      (id: string, event: ReactPointerEvent, options?: { onClickNoMove?: () => void }) => {
         if (event.button !== 0) return; // right-click is for the radial menu, not a move
         const startX = event.clientX;
         const startY = event.clientY;
         const zoom = viewportRef.current.zoom;
         const wasSelected = selectedIds.has(id);
         // Null until the move arms: the move set + the membership to re-evaluate on release. While null the
         // gesture is still a candidate click.
         let ids: Set<string> | null = null;
         let reevaluate: string[] = [];
         let delta = { x: 0, y: 0 };

         // Arms the (group-aware) move on the first past-threshold sample. Expand the set with every member
         // of any zone in it so a zone carries its contents; `reevaluate` is the directly-grabbed non-zone
         // items (their membership recomputed on release), members pulled in by a moved zone excluded.
         const arm = (moveEvent: PointerEvent) => {
            const liveItems = store.getState().items;
            const base = wasSelected ? new Set(selectedIds) : new Set([id]);
            if (!wasSelected) actions.setSelection([id]);
            const set = new Set(base);
            for (const baseId of base) {
               if (liveItems[baseId]?.kind !== 'zone') continue;
               for (const candidate of Object.values(liveItems)) if (candidate.zoneId === baseId) set.add(candidate.id);
            }
            ids = set;
            reevaluate = [...base].filter((baseId) => liveItems[baseId] && liveItems[baseId].kind !== 'zone');
            delta = screenDeltaToWorld(moveEvent.clientX - startX, moveEvent.clientY - startY, zoom);
            setGroupDrag({ ids, delta });
         };

         const onMove = (moveEvent: PointerEvent) => {
            if (!ids) {
               if (Math.abs(moveEvent.clientX - startX) < MOVE_THRESHOLD && Math.abs(moveEvent.clientY - startY) < MOVE_THRESHOLD) return;
               arm(moveEvent);
               return;
            }
            delta = screenDeltaToWorld(moveEvent.clientX - startX, moveEvent.clientY - startY, zoom);
            setGroupDrag({ ids, delta });
         };
         const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            if (ids) {
               setGroupDrag(null);
               if (delta.x !== 0 || delta.y !== 0) void actions.moveItems([...ids], delta, reevaluate);
            } else {
               options?.onClickNoMove?.();
            }
         };
         window.addEventListener('pointermove', onMove);
         window.addEventListener('pointerup', onUp);
      },
      [actions, selectedIds, store],
   );

   /**
    * A double-click's deep action for the kinds that own one: a challenge card copy toggles its expanded
    * display mode (persisted on the card copy). Note tiles + character elements open their tab from their
    * own double-click, so they aren't routed here.
    */
   const handleItemDoubleClick = useCallback(
      (id: string) => {
         const item = store.getState().items[id];
         if (!item || item.content.kind !== 'card' || item.content.mode !== 'copy') return;
         const card = item.content.data as Card;
         if (card.cardType !== 'CHALLENGE_CARD') return;
         void actions.updateItemContent(id, { ...item.content, data: { ...card, expanded: !(card.expanded === true) } });
      },
      [store, actions],
   );

   /**
    * Starts a connect drag from an item's connect handle: a preview line follows the
    * cursor, and a release over a different item creates a connection (otherwise cancel).
    * Custom pointer handling (window listeners), not dnd-kit.
    */
   const handleConnectStart = useCallback(
      (fromId: string, event: ReactPointerEvent) => {
         if (event.button !== 0) return; // right-click is for the radial menu, not a connect drag
         const start = cursorToWorld(event.clientX, event.clientY);
         setConnectPreview({ fromId, cursor: start ?? { x: 0, y: 0 } });

         const onMove = (moveEvent: PointerEvent) => {
            const world = cursorToWorld(moveEvent.clientX, moveEvent.clientY);
            if (world) setConnectPreview({ fromId, cursor: world });
         };
         const onUp = (upEvent: PointerEvent) => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            setConnectPreview(null);

            const hit = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
            const targetId = hit instanceof Element ? hit.closest('[data-board-item-id]')?.getAttribute('data-board-item-id') ?? null : null;
            const liveItems = store.getState().items;
            if (targetId && targetId !== fromId) {
               const target = liveItems[targetId];
               if (target && target.kind !== 'connection') {
                  const zValues = Object.values(liveItems).map((item) => item.z);
                  const z = zValues.length > 0 ? Math.max(...zValues) + 1 : 0;
                  void actions.addItem({
                     id: cuid(),
                     kind: 'connection',
                     x: 0, y: 0, width: 0, height: 0, z,
                     content: { kind: 'connection', from: fromId, to: targetId, style: { ...DEFAULT_CONNECTION_STYLE } },
                  });
               }
            }
         };
         window.addEventListener('pointermove', onMove);
         window.addEventListener('pointerup', onUp);
      },
      [cursorToWorld, store, actions],
   );

   // ==================
   //  Zoom (native, non-passive wheel so it can preventDefault the page scroll)
   // ==================
   useEffect(() => {
      const el = clipRef.current;
      if (!el) return;
      const onWheel = (event: WheelEvent) => {
         // A selected, scrollable note (post-it/journal) marks its body for native scroll: let the wheel
         // scroll it instead of zooming the board - no preventDefault, so the textarea scrolls natively.
         const target = event.target;
         if (target instanceof Element && target.closest('[data-board-wheel-scroll]')) return;
         const rect = el.getBoundingClientRect();
         const vp = viewportRef.current;
         const factor = Math.exp(-event.deltaY * ZOOM_SENSITIVITY);
         actions.setViewport(zoomToCursor(vp, { left: rect.left, top: rect.top }, event.clientX, event.clientY, vp.zoom * factor));
         event.preventDefault();
      };
      el.addEventListener('wheel', onWheel, { passive: false });
      return () => el.removeEventListener('wheel', onWheel);
   }, [actions]);

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
   }, [selectedIds, handleDeleteSelection, handleDuplicateSelection]);

   // ==================
   //  Pan + Space-to-pan (mode-independent: middle-drag / Space+drag pan in any tool)
   // ==================
   /**
    * Starts a pan from a screen point via WINDOW listeners (not element pointer-capture), so the pen
    * overlay - or a Space/middle-drag anywhere - can begin one and the move/up still land off the clip.
    * The pan math is raw screen px (the world translate applies before the scale).
    */
   const beginPan = useCallback(
      (clientX: number, clientY: number) => {
         const vp = viewportRef.current;
         panStart.current = { x: clientX, y: clientY, origX: vp.x, origY: vp.y, zoom: vp.zoom };
         setIsPanning(true);
         const onMove = (moveEvent: PointerEvent) => {
            const start = panStart.current;
            if (!start) return;
            actions.setViewport({ x: start.origX + (moveEvent.clientX - start.x), y: start.origY + (moveEvent.clientY - start.y), zoom: start.zoom });
         };
         const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            panStart.current = null;
            setIsPanning(false);
         };
         window.addEventListener('pointermove', onMove);
         window.addEventListener('pointerup', onUp);
      },
      [actions],
   );

   // Space and Alt each arm a pan while held, cleared on keyup or a window blur (no stuck arm after an
   // alt-tab). Space is ignored while editing text on the board (a post-it/journal/text field) so typing
   // a space never arms it; Alt isn't a typing key, so it needs no such guard.
   useEffect(() => {
      const clearSpace = () => { spaceHeldRef.current = false; setSpaceHeld(false); };
      const onKeyDown = (event: KeyboardEvent) => {
         if (event.code === 'Space') {
            if (isEditableTarget(event.target)) return;
            if (!spaceHeldRef.current) { spaceHeldRef.current = true; setSpaceHeld(true); }
            event.preventDefault(); // stop the page from scrolling on Space
         } else if (event.key === 'Alt') {
            setAltHeld(true);
         }
      };
      const onKeyUp = (event: KeyboardEvent) => {
         if (event.code === 'Space') clearSpace();
         else if (event.key === 'Alt') setAltHeld(false);
      };
      const clearAll = () => { clearSpace(); setAltHeld(false); };
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', clearAll);
      return () => {
         window.removeEventListener('keydown', onKeyDown);
         window.removeEventListener('keyup', onKeyUp);
         window.removeEventListener('blur', clearAll);
      };
   }, []);

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
    * Starts a marquee from a screen point via WINDOW listeners (mirroring beginPan): the rectangle grows
    * with the cursor and, on release past the move threshold, selects the framed items - `additive` keeps
    * the current selection (adds the hits), otherwise it replaces it. The clip origin is captured up front
    * so the overlay + world math never read a ref during render.
    */
   const beginMarquee = useCallback((clientX: number, clientY: number, { additive }: { additive: boolean }) => {
      const el = clipRef.current;
      if (!el) return;
      const clip = el.getBoundingClientRect();
      setMarquee({ x0: clientX, y0: clientY, x1: clientX, y1: clientY, clipLeft: clip.left, clipTop: clip.top });
      const onMove = (moveEvent: PointerEvent) => {
         setMarquee((current) => (current ? { ...current, x1: moveEvent.clientX, y1: moveEvent.clientY } : null));
      };
      const onUp = (upEvent: PointerEvent) => {
         window.removeEventListener('pointermove', onMove);
         window.removeEventListener('pointerup', onUp);
         // Ignore a sub-threshold press (no real drag) so it never selects under the point.
         const dragged = Math.abs(upEvent.clientX - clientX) >= MOVE_THRESHOLD || Math.abs(upEvent.clientY - clientY) >= MOVE_THRESHOLD;
         if (dragged) {
            const origin = { left: clip.left, top: clip.top };
            const a = screenToWorld(clientX, clientY, origin, viewportRef.current);
            const b = screenToWorld(upEvent.clientX, upEvent.clientY, origin, viewportRef.current);
            const hits = itemsInMarquee(Object.values(store.getState().items), {
               minX: Math.min(a.x, b.x),
               minY: Math.min(a.y, b.y),
               maxX: Math.max(a.x, b.x),
               maxY: Math.max(a.y, b.y),
            });
            if (additive) actions.addToSelection(hits);
            else actions.setSelection(hits);
         }
         setMarquee(null);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
   }, [store, actions]);

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
      [actions, beginMarquee, handleMoveStart, store],
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
         if (!panning && polygonRef.current) { commitPolygon(); suppressRadialRef.current = true; }
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
   };

   // ==================
   //  Freehand capture (screen-space overlay owns the gesture; the preview paints in the world layer)
   // ==================
   /**
    * Commits a finished stroke (given its WORLD points): appends it to the active drawing layer, or mints
    * a fresh layer when none is active (its origin = the stroke's world bbox min, so points store
    * layer-local). The stroke carries the CURRENT brush/ink/width. Fewer than two points is a stray tap - dropped.
    */
   const commitStroke = useCallback(
      (worldPoints: number[], shape?: Stroke['shape'], filled?: boolean) => {
         // Min points is shape-aware: a polygon needs 3 vertices (6 numbers); a line, a bounding-box shape, and
         // freehand all need 2 (4 numbers), so a stray tap still drops but a valid stroke survives.
         if (worldPoints.length < (shape === 'polygon' ? 6 : 4)) return;
         // A Line from a pure click (endpoints all but coincident) is a zero-length dot; discard it.
         if (shape === 'line' && isLineDegenerate(worldPoints, MIN_LINE_LENGTH)) return;
         const width = penSettings.width;
         const liveItems = store.getState().items;
         const layer = activeLayerId ? liveItems[activeLayerId] : undefined;
         if (layer && layer.content.kind === 'drawing') {
            // World points: the store grows the box + re-bases to layer-local, so the box tracks every stroke.
            void actions.appendStroke(layer.id, makeStroke(cuid(), worldPoints, penSettings.brush, penSettings.color, width, shape, filled));
            return;
         }
         const bounds = pointsBounds(worldPoints);
         if (!bounds) return;
         const local = rebasePoints(worldPoints, bounds.minX, bounds.minY);
         // A freehand layer spawns at root (never auto-joins a zone); land it at the front of the root scope.
         const z = nextScopeZ(liveItems, null);
         const id = cuid();
         void actions.addItem({
            id,
            kind: 'drawing',
            x: bounds.minX,
            y: bounds.minY,
            width: bounds.maxX - bounds.minX,
            height: bounds.maxY - bounds.minY,
            z,
            content: { kind: 'drawing', strokes: [makeStroke(cuid(), local, penSettings.brush, penSettings.color, width, shape, filled)] },
         });
         setActiveLayerId(id);
      },
      [actions, activeLayerId, store, penSettings],
   );

   /**
    * Closes the in-progress freeform polygon: commits its vertices as a closed geometric stroke (>= 3
    * needed; a shorter run is dropped by `commitStroke`'s shape-aware guard) and clears the gesture,
    * staying in the tool so the next click starts a new polygon.
    */
   const commitPolygon = useCallback(() => {
      const verts = polygonRef.current;
      polygonRef.current = null;
      setPolygonPreview(null);
      if (verts) commitStroke(verts, 'polygon', penSettings.shapeFilled);
   }, [commitStroke, penSettings.shapeFilled]);

   /**
    * Freeform-polygon pointerdown: a PERSISTENT multi-click gesture - each primary click drops a vertex,
    * unlike the self-terminating pen/line. The pan escape hatch runs first (middle / Space+drag); the right
    * button is owned by the clip's capture handler (right-drag pans, right-click closes the polygon). A
    * primary click starts a polygon, closes it (the click lands within the close threshold of the first
    * vertex and there are >= 3 vertices), or appends a vertex.
    */
   const handlePolygonPointerDown = (event: ReactPointerEvent) => {
      event.stopPropagation();
      if (event.button === 1) { event.preventDefault(); beginPan(event.clientX, event.clientY); return; }
      if (event.button === 0 && spaceHeldRef.current) { beginPan(event.clientX, event.clientY); return; }
      if (event.button !== 0) return;
      const world = cursorToWorld(event.clientX, event.clientY);
      if (!world) return;
      const verts = polygonRef.current;
      if (!verts) {
         // Start a fresh polygon; seed a zero-length rubber band (the next move extends it to the cursor).
         polygonRef.current = [world.x, world.y];
         setPolygonPreview([world.x, world.y, world.x, world.y]);
         return;
      }
      // Close when the click lands within the screen-px threshold of the first vertex (compared in world, so
      // it holds at any zoom) and there are >= 3 vertices; otherwise drop another vertex.
      const reach = POLYGON_CLOSE_THRESHOLD / viewportRef.current.zoom;
      if (verts.length >= 6 && Math.hypot(world.x - verts[0], world.y - verts[1]) <= reach) { commitPolygon(); return; }
      verts.push(world.x, world.y);
      setPolygonPreview([...verts, world.x, world.y]);
   };

   /** Freeform-polygon rubber band: redraws the committed vertices plus a live segment to the cursor. */
   const handlePolygonPointerMove = (event: ReactPointerEvent) => {
      const verts = polygonRef.current;
      if (!verts) return;
      const world = cursorToWorld(event.clientX, event.clientY);
      if (world) setPolygonPreview([...verts, world.x, world.y]);
   };

   /**
    * Double-click closes the freeform polygon. The two pointerdowns a dblclick fires already dropped a
    * trailing vertex on (or near) the last one, so dedupe that coincident vertex before closing to avoid a
    * zero-length edge.
    */
   const handlePolygonDoubleClick = () => {
      const verts = polygonRef.current;
      if (!verts) return;
      if (verts.length >= 4) {
         const dedupe = 2 / viewportRef.current.zoom; // a couple screen px: the dblclick's two points land together
         const lastX = verts[verts.length - 2];
         const lastY = verts[verts.length - 1];
         if (Math.hypot(lastX - verts[verts.length - 4], lastY - verts[verts.length - 3]) <= dedupe) verts.splice(-2, 2);
      }
      commitPolygon();
   };

   // Leaving the freeform-polygon tool (to Select or any other gesture) discards a half-drawn polygon. Board
   // switches route through here too (the boardId reset sets Select, and also clears the ref directly).
   useEffect(() => {
      if (activeTool === 'freeformPolygon') return;
      polygonRef.current = null;
      setPolygonPreview(null);
   }, [activeTool]);

   // One draw-mode keydown handler, branching on whether a freeform polygon is mid-draw. With a polygon in
   // progress the keys edit it: Esc cancels, Backspace pops the last vertex (emptying it cancels), Enter
   // closes (>= 3 vertices) - each swallowed so it never reaches the tool-exit path. With no polygon, Esc / V
   // leave the Draw gesture (they're sticky, so they need an explicit exit besides the segment). Mounted only
   // off Select, so V never shadows anything in the default mode.
   useEffect(() => {
      if (activeTool === 'select') return;
      const onKeyDown = (event: KeyboardEvent) => {
         const target = event.target;
         if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
         const verts = polygonRef.current;
         if (verts) {
            if (event.key === 'Escape') {
               event.preventDefault();
               polygonRef.current = null;
               setPolygonPreview(null);
            } else if (event.key === 'Backspace') {
               event.preventDefault();
               verts.splice(-2, 2); // pop the last vertex
               if (verts.length === 0) { polygonRef.current = null; setPolygonPreview(null); }
               else setPolygonPreview([...verts, verts[verts.length - 2], verts[verts.length - 1]]);
            } else if (event.key === 'Enter') {
               event.preventDefault();
               commitPolygon();
            }
            return;
         }
         if (event.key === 'Escape' || event.key === 'v' || event.key === 'V') {
            event.preventDefault();
            setActiveTool('select');
         }
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
   }, [activeTool, commitPolygon]);

   /**
    * Freehand-overlay pointerdown: the pan escape hatch first (middle / Space+drag), then a primary-button
    * press starts a stroke. Points are captured in screen and converted to world via `cursorToWorld`;
    * `getCoalescedEvents` recovers the batched samples a fast stroke would otherwise skip. Window
    * listeners (mirroring the connect drag) keep the move/up landing off the overlay; the teardown is
    * stashed in a ref so an unmount mid-stroke can't leak them.
    */
   const handleFreehandPointerDown = (event: ReactPointerEvent) => {
      // The overlay owns every pointerdown in a draw gesture; stop it reaching the clip's background handler
      // (which would double-fire a middle/Space pan or clear the selection).
      event.stopPropagation();
      if (event.button === 1) { event.preventDefault(); beginPan(event.clientX, event.clientY); return; }
      if (event.button === 0 && spaceHeldRef.current) { beginPan(event.clientX, event.clientY); return; }
      if (event.button !== 0) return; // right-click falls through to the overlay's context menu (radial)
      const start = cursorToWorld(event.clientX, event.clientY);
      if (!start) return;
      currentStrokeRef.current = { points: [start.x, start.y] };
      setPenPreview([start.x, start.y]);

      const onMove = (moveEvent: PointerEvent) => {
         const stroke = currentStrokeRef.current;
         if (!stroke) return;
         const samples = moveEvent.getCoalescedEvents?.() ?? [];
         const batch = samples.length > 0 ? samples : [moveEvent];
         for (const sample of batch) {
            const world = cursorToWorld(sample.clientX, sample.clientY);
            if (world) stroke.points.push(world.x, world.y);
         }
         setPenPreview([...stroke.points]);
      };
      const cleanup = () => {
         window.removeEventListener('pointermove', onMove);
         window.removeEventListener('pointerup', onUp);
         strokeCleanupRef.current = null;
      };
      const onUp = () => {
         const stroke = currentStrokeRef.current;
         currentStrokeRef.current = null;
         cleanup();
         setPenPreview(null);
         if (stroke) commitStroke(stroke.points); // stays in freehand (sticky)
      };
      strokeCleanupRef.current = cleanup;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
   };

   // A mid-stroke unmount (tab switch) fires no pointerup; tear the in-flight listeners down so they
   // never point at a dead store. The half-drawn stroke is simply discarded.
   useEffect(() => () => strokeCleanupRef.current?.(), []);

   /**
    * Line-overlay pointerdown: the pan escape hatch first (middle / Space+drag), then a primary-button
    * press-drag from A to B. The live preview is a 2-point stroke; Shift snaps the A->B angle to 45deg
    * increments (length preserved). On release it commits a geometric `line` stroke and stays in Line
    * (sticky). Window listeners + the shared cleanup ref mirror the freehand gesture.
    */
   const handleLinePointerDown = (event: ReactPointerEvent) => {
      event.stopPropagation();
      if (event.button === 1) { event.preventDefault(); beginPan(event.clientX, event.clientY); return; }
      if (event.button === 0 && spaceHeldRef.current) { beginPan(event.clientX, event.clientY); return; }
      if (event.button !== 0) return; // right-click falls through to the overlay's context menu (radial)
      const start = cursorToWorld(event.clientX, event.clientY);
      if (!start) return;
      const sx = start.x;
      const sy = start.y;
      setPenPreview([sx, sy, sx, sy]);

      // The end point in world, angle-snapped to 45deg while Shift is held.
      const endPoint = (clientX: number, clientY: number, shift: boolean) => {
         const end = cursorToWorld(clientX, clientY);
         if (!end) return null;
         return shift ? snapAngle(sx, sy, end.x, end.y, Math.PI / 4) : end;
      };
      const onMove = (moveEvent: PointerEvent) => {
         const to = endPoint(moveEvent.clientX, moveEvent.clientY, moveEvent.shiftKey);
         if (to) setPenPreview([sx, sy, to.x, to.y]);
      };
      const cleanup = () => {
         window.removeEventListener('pointermove', onMove);
         window.removeEventListener('pointerup', onUp);
         strokeCleanupRef.current = null;
      };
      const onUp = (upEvent: PointerEvent) => {
         cleanup();
         setPenPreview(null);
         const to = endPoint(upEvent.clientX, upEvent.clientY, upEvent.shiftKey);
         if (to) commitStroke([sx, sy, to.x, to.y], 'line'); // stays in line (sticky)
      };
      strokeCleanupRef.current = cleanup;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
   };

   /**
    * Regular-polygon pointerdown: the pan escape hatch first (middle / Space+drag), then a primary-button
    * center-out drag - the press is the center, the drag vector sets both the circumradius and the rotation.
    * The live preview is the closed N-gon in the active brush; Shift snaps the rotation to 15deg increments.
    * On release it commits a geometric `polygon` stroke (when the radius clears the stray-click floor) and
    * stays in the tool (sticky). Window listeners + the shared cleanup ref mirror the line gesture.
    */
   const handleRegularPolygonPointerDown = (event: ReactPointerEvent) => {
      event.stopPropagation();
      if (event.button === 1) { event.preventDefault(); beginPan(event.clientX, event.clientY); return; }
      if (event.button === 0 && spaceHeldRef.current) { beginPan(event.clientX, event.clientY); return; }
      if (event.button !== 0) return; // right-click falls through to the overlay's context menu (radial)
      const center = cursorToWorld(event.clientX, event.clientY);
      if (!center) return;
      const cx = center.x;
      const cy = center.y;
      const sides = polygonSides;
      setPenPreview(regularPolygonVertices(cx, cy, 0, sides, 0));

      // The N-gon for the current cursor plus its radius: the drag vector is both circumradius and rotation
      // (Shift snaps the rotation to 15deg). Preview and commit share this, so the committed shape matches.
      const shapeAt = (clientX: number, clientY: number, shift: boolean) => {
         const p = cursorToWorld(clientX, clientY);
         if (!p) return null;
         const radius = Math.hypot(p.x - cx, p.y - cy);
         let rotation = Math.atan2(p.y - cy, p.x - cx);
         if (shift) rotation = Math.round(rotation / ROTATION_SNAP) * ROTATION_SNAP;
         return { verts: regularPolygonVertices(cx, cy, radius, sides, rotation), radius };
      };
      const onMove = (moveEvent: PointerEvent) => {
         const shape = shapeAt(moveEvent.clientX, moveEvent.clientY, moveEvent.shiftKey);
         if (shape) setPenPreview(shape.verts);
      };
      const cleanup = () => {
         window.removeEventListener('pointermove', onMove);
         window.removeEventListener('pointerup', onUp);
         strokeCleanupRef.current = null;
      };
      const onUp = (upEvent: PointerEvent) => {
         cleanup();
         setPenPreview(null);
         const shape = shapeAt(upEvent.clientX, upEvent.clientY, upEvent.shiftKey);
         // A press with no real drag (radius under the floor) makes nothing, mirroring the line's dot guard.
         if (shape && shape.radius >= MIN_LINE_LENGTH) commitStroke(shape.verts, 'polygon', penSettings.shapeFilled); // stays in the tool (sticky)
      };
      strokeCleanupRef.current = cleanup;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
   };

   /**
    * Shape pointerdown: the pan escape hatch first (middle / Space+drag), then a primary-button corner-anchored
    * bbox drag - the press is corner A, the drag sets the opposite corner B. The box is constrained to equal
    * axes (a circle/square) by default; Shift frees the aspect (an ellipse/rectangle), read live so it flips
    * mid-drag. The base toggle (not Shift) picks the stored ellipse/rect. On release it commits (when the box
    * clears the stray-click floor) and stays in the tool (sticky). Window listeners + the shared cleanup ref
    * mirror the line gesture.
    */
   const handleShapePointerDown = (event: ReactPointerEvent) => {
      event.stopPropagation();
      if (event.button === 1) { event.preventDefault(); beginPan(event.clientX, event.clientY); return; }
      if (event.button === 0 && spaceHeldRef.current) { beginPan(event.clientX, event.clientY); return; }
      if (event.button !== 0) return; // right-click falls through to the overlay's context menu (radial)
      const start = cursorToWorld(event.clientX, event.clientY);
      if (!start) return;
      const ax = start.x;
      const ay = start.y;
      const shape: Stroke['shape'] = penSettings.shapeBase === 'circle' ? 'ellipse' : 'rect';
      const filled = penSettings.shapeFilled;
      setPenPreview([ax, ay, ax, ay]);

      // The two box corners for the current cursor: equal axes unless Shift frees the aspect (read live).
      const cornersAt = (clientX: number, clientY: number, shift: boolean) => {
         const b = cursorToWorld(clientX, clientY);
         if (!b) return null;
         return shapeBoxCorners(ax, ay, b.x, b.y, !shift);
      };
      const onMove = (moveEvent: PointerEvent) => {
         const corners = cornersAt(moveEvent.clientX, moveEvent.clientY, moveEvent.shiftKey);
         if (corners) setPenPreview(corners);
      };
      const cleanup = () => {
         window.removeEventListener('pointermove', onMove);
         window.removeEventListener('pointerup', onUp);
         strokeCleanupRef.current = null;
      };
      const onUp = (upEvent: PointerEvent) => {
         cleanup();
         setPenPreview(null);
         const corners = cornersAt(upEvent.clientX, upEvent.clientY, upEvent.shiftKey);
         if (!corners) return;
         // A press with no real drag (both extents under the floor) makes nothing, mirroring the line's dot guard.
         if (Math.max(Math.abs(corners[2] - corners[0]), Math.abs(corners[3] - corners[1])) >= MIN_LINE_LENGTH) {
            commitStroke(corners, shape, filled); // stays in the tool (sticky)
         }
      };
      strokeCleanupRef.current = cleanup;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
   };

   /**
    * Commits a finished erase gesture: removes the collected strokes (per layer) as ONE undo step, then
    * clears the append target if the erase emptied the layer the pen was drawing on (so the next stroke
    * mints fresh instead of appending to a dead id).
    */
   const commitErase = useCallback(
      async (erasures: { layerId: string; strokeIds: string[] }[]) => {
         await actions.eraseStrokes(erasures);
         if (activeLayerId && !store.getState().items[activeLayerId]) setActiveLayerId(null);
      },
      [actions, activeLayerId, store],
   );

   /**
    * Eraser-overlay pointerdown: the pan escape hatch first (middle / Space+drag), then a primary-button
    * scrub. Each sample whole-stroke hit-tests every drawing layer's strokes (any layer), collecting the
    * touched ids per layer; the whole scrub commits as one erase on pointerup. Window listeners mirror the
    * pen, and the teardown is stashed in the shared cleanup ref so an unmount mid-scrub can't leak them.
    */
   const handleEraserPointerDown = (event: ReactPointerEvent) => {
      event.stopPropagation();
      if (event.button === 1) { event.preventDefault(); beginPan(event.clientX, event.clientY); return; }
      if (event.button === 0 && spaceHeldRef.current) { beginPan(event.clientX, event.clientY); return; }
      if (event.button !== 0) return; // right-click falls through to the overlay's context menu (radial)

      const touched = new Map<string, Set<string>>();
      // Ids crossed this scrub, hidden on contact via the pending-erase set while the store's strokes stay
      // intact - so the commit below can still read them to decide survivors vs. emptied layers.
      const pending = new Set<string>();
      const eraseAt = (clientX: number, clientY: number) => {
         const world = cursorToWorld(clientX, clientY);
         if (!world) return;
         let grew = false;
         for (const item of Object.values(store.getState().items)) {
            if (item.content.kind !== 'drawing') continue;
            for (const stroke of item.content.strokes) {
               if (!strokeHitsPoint(item, stroke, world.x, world.y, ERASER_RADIUS)) continue;
               let set = touched.get(item.id);
               if (!set) { set = new Set(); touched.set(item.id, set); }
               set.add(stroke.id);
               if (!pending.has(stroke.id)) { pending.add(stroke.id); grew = true; }
            }
         }
         // Only when a new stroke is crossed: hand a fresh set so the drawing layers re-render it away now.
         if (grew) setPendingErase(new Set(pending));
      };
      eraseAt(event.clientX, event.clientY);

      // Last sample only: a scrub needs coverage, not per-coalesced-sample fidelity, and hit-testing every
      // stroke on every sample is O(strokes) - one test per move batch keeps it cheap on a dense board.
      const onMove = (moveEvent: PointerEvent) => eraseAt(moveEvent.clientX, moveEvent.clientY);
      const cleanup = () => {
         window.removeEventListener('pointermove', onMove);
         window.removeEventListener('pointerup', onUp);
         strokeCleanupRef.current = null;
      };
      const onUp = () => {
         cleanup();
         if (touched.size === 0) return;
         // `commitErase` runs the store's optimistic removal synchronously, so the strokes are already gone
         // from the layers by the time the pending set clears - no flash of the erased ink reappearing.
         void commitErase([...touched].map(([layerId, ids]) => ({ layerId, strokeIds: [...ids] })));
         setPendingErase(EMPTY_STROKE_IDS);
      };
      strokeCleanupRef.current = cleanup;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
   };

   // ==================
   //  Toolbar actions
   // ==================
   /**
    * Creates a new item of `kind` centered on `worldCenter`, joining a zone it lands in, then selects it.
    * A text kind opens straight into editing so it's typeable on creation. `contentOverride` lets a
    * picker-first kind (a portal) supply its already-targeted content instead of the registry's empty
    * factory; everything else about the placement/z/zone/select path is identical.
    */
   const createItemAt = (kind: CreatableKind, worldCenter: Point, contentOverride?: BoardItemContent) => {
      const size = CREATABLE_BY_KIND[kind].defaultSize;
      const id = cuid();
      const placement = { id, x: worldCenter.x - size.width / 2, y: worldCenter.y - size.height / 2, width: size.width, height: size.height };
      // A non-zone item created over a zone joins it (same center-in-rectangle rule as a drop).
      const zoneId = kind === 'zone' ? undefined : zoneContaining(placement, zoneItems) ?? undefined;
      const z = nextScopeZ(items, zoneId ?? null);
      void actions.addItem({ ...placement, kind, z, zoneId, content: contentOverride ?? CREATABLE_BY_KIND[kind].makeContent() });
      actions.setSelection([id]);
      if (isTextEditableKind(kind)) setEditingId(id);
   };

   /** Drops a portal (target picked in the list) at `worldCenter` with the smart-default icon+text style. */
   const createPortalAt = (target: PortalTarget, defaultName: string, worldCenter: Point) => {
      createItemAt('portal', worldCenter, makePortalContent(target, defaultName));
   };

   /** The portal picker's pick handler: classifies the row to a portal target, then drops (create) or swaps
    *  the target of an existing portal (retarget, keeping its style + label), then closes. */
   const handlePortalPick = (target: LinkInsertTarget, defaultName: string) => {
      if (!portalPicker) return;
      const portalTarget = portalTargetFromInsert(target);
      if (!portalTarget) return; // a section row (note-only) is never offered here.
      if (portalPicker.retargetItemId) {
         const existing = store.getState().items[portalPicker.retargetItemId];
         if (existing && existing.content.kind === 'portal') {
            void actions.updateItemContent(existing.id, { ...existing.content, target: portalTarget });
         }
      } else {
         createPortalAt(portalTarget, defaultName, portalPicker.world);
      }
      setPortalPicker(null);
   };

   /** Opens the portal target picker for a menu/palette create (no cursor point): drop at the view center, window near the top-left. */
   const openPortalPickerAtViewCenter = () => {
      const rect = clipRef.current?.getBoundingClientRect();
      if (!rect) { setPortalPicker({ world: viewCenter, screen: { x: 0, y: 0 } }); return; }
      const world = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2, { left: rect.left, top: rect.top }, viewportRef.current);
      setPortalPicker({ world, screen: { x: rect.left + BOARD_WINDOW_MARGIN, y: rect.top + BOARD_WINDOW_MARGIN } });
   };

   /**
    * Commits a portal STYLE edit as one undoable command, reading the item LIVE at commit time and patching
    * only its style - so a deferred label flush can't clobber a target/visual change made meanwhile (and vice
    * versa). No-op if the item is gone or is no longer a portal.
    */
   const commitPortalStyle = useCallback(
      (itemId: string, updater: (style: PortalStyle) => PortalStyle) => {
         const live = store.getState().items[itemId];
         if (!live || live.content.kind !== 'portal') return;
         const content = { ...live.content, style: updater(live.content.style) };
         // A poster wears the crop shape: reshape the box to the aspect (keep width, derive height) in the
         // SAME undoable write so the full image shows and undo reverts box + visual together. Composed keeps
         // its box (it holds the label); the thumbnail alone takes the aspect.
         const visual = content.style.visual;
         if (visual?.kind === 'image' && visual.mode === 'poster') {
            const width = Math.max(PORTAL_MIN_SIZE.width, live.width);
            const height = Math.max(PORTAL_MIN_SIZE.height, Math.round(width / visual.aspect));
            void actions.updateItemContentAndSize(itemId, content, { width, height });
            return;
         }
         void actions.updateItemContent(itemId, content);
      },
      [store, actions],
   );

   /**
    * Creates a fresh, game-agnostic tracker at `worldCenter`: a board-native COPY (no drawer source),
    * sized to the tracker's native footprint, then selects it. It renders through the interactive
    * embed host (a NEUTRAL synthetic character), so it's app-themed and editable with no extra wiring.
    */
   const createTrackerAt = (trackerType: TrackerType, worldCenter: Point) => {
      const size = EMBEDDED_TRACKER_SIZES[trackerType];
      const id = cuid();
      const placement = { id, x: worldCenter.x - size.width / 2, y: worldCenter.y - size.height / 2, width: size.width, height: size.height };
      const zoneId = zoneContaining(placement, zoneItems) ?? undefined;
      const z = nextScopeZ(items, zoneId ?? null);
      void actions.addItem({ ...placement, kind: 'tracker', z, zoneId, content: { kind: 'tracker', mode: 'copy', data: emptyTracker(trackerType) } });
      actions.setSelection([id]);
   };

   /**
    * Creates a card from the dialog's options at `worldCenter`: a board-native COPY (no drawer source)
    * of the chosen game, sized to the card's native footprint, then selects it. The embed host seeds
    * the synthetic character with the card's own game, so it themes by that game (not NEUTRAL).
    */
   const createCardAt = (game: GameSystem, options: CreateCardOptions, worldCenter: Point) => {
      const card = buildCard(game, options);
      if (!card) return;
      const { width, height } = EMBEDDED_CARD_SIZE;
      const id = cuid();
      const placement = { id, x: worldCenter.x - width / 2, y: worldCenter.y - height / 2, width, height };
      const zoneId = zoneContaining(placement, zoneItems) ?? undefined;
      const z = nextScopeZ(items, zoneId ?? null);
      void actions.addItem({ ...placement, kind: 'card', z, zoneId, content: { kind: 'card', mode: 'copy', data: card } });
      actions.setSelection([id]);
   };

   /**
    * Mints a fresh Challenge Card at `worldCenter`: a board-native COPY (no drawer source, no creation
    * form - a challenge has none of the theme wizardry), selected AND dropped straight into its Expanded
    * display mode so a GM goes from "wants a threat" to typing its name with no extra click. Expanded is
    * a persisted card field, so the item keeps its stored portrait footprint for when it collapses back.
    */
   const createChallengeAt = (game: ChallengeGame, worldCenter: Point) => {
      const card = buildCard(game, { cardType: 'CHALLENGE_CARD', powerTagsCount: 0, weaknessTagsCount: 0 });
      if (!card) return;
      const { width, height } = EMBEDDED_CARD_SIZE;
      const id = cuid();
      const placement = { id, x: worldCenter.x - width / 2, y: worldCenter.y - height / 2, width, height };
      const zoneId = zoneContaining(placement, zoneItems) ?? undefined;
      const z = nextScopeZ(items, zoneId ?? null);
      void actions.addItem({ ...placement, kind: 'card', z, zoneId, content: { kind: 'card', mode: 'copy', data: { ...card, expanded: true } } });
      actions.setSelection([id]);
   };

   /**
    * Embeds a saved note at `worldCenter` as a live reference tile: loads the drawer NOTE item and builds
    * the SAME reference spec the drag-drop path uses ({@link embeddedSpecForDrawerItem}), then drops + selects
    * it. Async (a drawer read); a deleted source no-ops. Keyed on the note's drawer item id (from the picker).
    */
   const embedNoteAt = (drawerItemId: string, worldCenter: Point) => {
      void getItem(drawerItemId).then((item) => {
         if (!item) return;
         const spec = embeddedSpecForDrawerItem(item);
         if (!spec) return;
         const id = cuid();
         const placement = { id, x: worldCenter.x - spec.width / 2, y: worldCenter.y - spec.height / 2, width: spec.width, height: spec.height };
         const zoneId = zoneContaining(placement, zoneItems) ?? undefined;
         const z = nextScopeZ(items, zoneId ?? null);
         void actions.addItem({ ...placement, kind: spec.kind, z, zoneId, content: spec.content });
         actions.setSelection([id]);
      });
   };

   const { clearBoardAction, setDrawerOpen } = useAppGeneralStateActions();

   /*
    * Saves the sole-selected item to the drawer via the same orchestration the toolbar affordances run.
    * A copy card/tracker: `asNew` = Save As, else Save with a transparent Save-As fallback for a dangling
    * source. An image is Save-As only (mint an IMAGE_CARD, no source to write back to), so a Save request
    * on an image transparently mints too - mirroring a source-less card. The canvas owns the selection, so
    * the palette routes here rather than reaching into board state. No-op with an explanatory toast when
    * nothing usable is selected; the remaining kinds (pin/post-it/journal/character ref) have no drawer
    * save yet.
    */
   const saveSelectedItemToDrawer = (asNew: boolean) => {
      const id = selectedIds.size === 1 ? [...selectedIds][0] : null;
      const item = id ? items[id] : undefined;
      const content = item?.content;
      if (!content) {
         toast.error(t('Notifications.board.itemNotSaveable'));
         return;
      }

      const drawerState = useDrawerStore.getState();
      const baseDeps = {
         t,
         drawerCurrentFolderId: drawerState.currentFolderId,
         isDrawerOpen: useAppGeneralStateStore.getState().isDrawerOpen,
         setDrawerOpen,
      };

      // A board image is mint-only (no source, no adopt); Save and Save As both mint an IMAGE_CARD.
      if (content.kind === 'image') {
         runSaveImageToDrawerAs(content, baseDeps);
         return;
      }

      if ((content.kind !== 'card' && content.kind !== 'tracker' && content.kind !== 'post-it' && content.kind !== 'journal') || content.mode !== 'copy') {
         toast.error(t('Notifications.board.itemNotSaveable'));
         return;
      }
      const deps = {
         ...baseDeps,
         onAdoptSource: (sourceDrawerItemId: string) => { void actions.adoptItemDrawerSource(id!, sourceDrawerItemId); },
      };
      if (asNew) runSaveItemToDrawerAs(content, deps);
      else void runSaveItemToDrawer(content, deps);
   };

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

   /** Palette add: drop the new item centered in the current view (the radial uses the cursor point). */
   const handleAddItem = (kind: CreatableKind) => {
      createItemAt(kind, currentViewCenter());
   };

   /** The current view's world center + the clip's center screen point (for a menu-driven create/anchor). */
   const currentViewCenter = (): Point => {
      const el = clipRef.current;
      if (!el) return viewCenter;
      const rect = el.getBoundingClientRect();
      return screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2, { left: rect.left, top: rect.top }, viewportRef.current);
   };

   /**
    * The "Add Game Element" menu's card row: open the card creation window for `game`. The drop still
    * lands at the view center on confirm, but the window opens near the toolbar (upper-left) rather than
    * mid-canvas - the menu isn't cursor-placed, so a mid-canvas panel would cover the drop point.
    */
   const handlePickCardGame = (game: GameSystem) => {
      const el = clipRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const world = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2, { left: rect.left, top: rect.top }, viewportRef.current);
      const screen = { x: rect.left + 12, y: rect.top + 56 }; // just below the top-left toolbar
      setPendingCard({ game, world, screen });
   };

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

   /** Frames every spatial item, centered and zoom-clamped (origin when the board is empty). */
   const handleFitToContent = () => {
      const el = clipRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      actions.setViewport(fitViewport(Object.values(items), { width: rect.width, height: rect.height }, FIT_PADDING));
   };

   // Derived selection chrome. One selected -> the per-item toolbar; the live group-move
   // delta applies to every item in the active drag.
   const soleSelectedId = selectedIds.size === 1 ? [...selectedIds][0] : null;
   const moveDeltaFor = (id: string) => (groupDrag && groupDrag.ids.has(id) ? groupDrag.delta : null);
   // Any live canvas gesture (pan / marquee / move) suppresses the item hover ring, so it never flickers
   // on items the cursor sweeps past mid-drag.
   const interacting = isPanning || marquee !== null || groupDrag !== null;

   // Sole-selecting a drawing layer makes it the pen's append target, so the pen continues on it. Narrow to
   // the sole selection so a marquee over mixed items never hijacks the target; minting already sets the id.
   useEffect(() => {
      if (!soleSelectedId) return;
      if (store.getState().items[soleSelectedId]?.content.kind === 'drawing') setActiveLayerId(soleSelectedId);
   }, [soleSelectedId, store]);

   // Editing exits the moment its item stops being the sole selection - clicking away, selecting another
   // item, multi-selecting, or the item's deletion all flow through here (the editor's own falling-edge
   // and unmount flushes then commit the buffer). Editing is only ever the sole selection.
   useEffect(() => {
      if (editingId && editingId !== soleSelectedId) setEditingId(null);
   }, [editingId, soleSelectedId]);

   // Escape leaves editing (back to a plain selection) without deleting anything; the editor's falling-edge
   // flush commits the buffer as it unmounts. Armed only while editing, so it never shadows other Escape uses.
   useEffect(() => {
      if (!editingId) return;
      const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setEditingId(null); };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
   }, [editingId]);

   // Two+ selected spatial items -> a group toolbar over their bounding box (shifted live
   // during a group move). Connections (zero-size) don't anchor it.
   const groupBbox = (() => {
      if (selectedIds.size < 2) return null;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, count = 0;
      for (const id of selectedIds) {
         const item = items[id];
         if (!item || item.kind === 'connection') continue;
         const delta = moveDeltaFor(id) ?? { x: 0, y: 0 };
         minX = Math.min(minX, item.x + delta.x);
         minY = Math.min(minY, item.y + delta.y);
         maxX = Math.max(maxX, item.x + item.width + delta.x);
         maxY = Math.max(maxY, item.y + item.height + delta.y);
         count++;
      }
      return count >= 2 ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : null;
   })();

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
