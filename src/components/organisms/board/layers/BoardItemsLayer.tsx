// -- React Imports --
import type { PointerEvent as ReactPointerEvent } from 'react';

// -- Utils Imports --
import { zoneContentMinSize } from '@/lib/board/zoneMembership';
import { connectionsZIndex, groupToolbarZIndex, itemZIndex } from '@/lib/board/boardLayering';
import { PORTAL_MIN_SIZE } from '@/lib/board/portalSizing';

// -- Component Imports --
import { BoardItemBox } from '../BoardItemBox';
import { BoardConnectionsLayer } from '../BoardConnectionsLayer';
import { BoardGroupToolbar } from '../BoardGroupToolbar';
import { StrokeShape } from '../items/BoardDrawingItem';

// -- Type Imports --
import type { BoardState } from '@/lib/stores/boardStore';
import type { ActiveTool, BoardItem, BoardItemContent, BrushKind, ConnectionStyle, Viewport } from '@/lib/types/board';
import type { Point } from '@/lib/board/boardConnections';

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

interface BoardItemsLayerProps {
   viewport: Viewport;
   items: Record<string, BoardItem>;
   /** Paint order: non-zone items first, then zones - each rendered by the same single pass. */
   nonZoneItems: BoardItem[];
   zoneItems: BoardItem[];
   connectionItems: BoardItem[];
   collapsedZoneIds: ReadonlySet<string>;
   selectedIds: Set<string>;
   soleSelectedId: string | null;
   editingId: string | null;
   /** The item's index in stored-z order, feeding the disjoint z-index bands. */
   layerRank: Map<string, number>;
   layerCount: number;
   moveDeltaFor: (id: string) => { x: number; y: number } | null;
   interacting: boolean;
   groupBbox: { x: number; y: number; width: number; height: number } | null;
   groupDrag: { ids: Set<string>; delta: { x: number; y: number } } | null;
   connectPreview: { fromId: string; cursor: Point } | null;
   penPreview: number[] | null;
   polygonPreview: number[] | null;
   penSettings: { brush: BrushKind; color: string | null; width: number; shapeBase: 'circle' | 'square'; shapeFilled: boolean };
   activeTool: ActiveTool;
   focusLayer: BoardItem | undefined;
   hoveredItem: BoardItem | undefined;
   actions: BoardState['actions'];
   handleItemPointerDown: (id: string, event: ReactPointerEvent) => void;
   handleItemDoubleClick: (id: string) => void;
   handleMoveStart: (id: string, event: ReactPointerEvent, options?: { onClickNoMove?: () => void }) => void;
   handleDelete: (id: string) => void;
   handleConnectStart: (id: string, event: ReactPointerEvent) => void;
   handleRequestEditPortal: (itemId: string, screen: { x: number; y: number }) => void;
   handleRequestRelinkPortal: (itemId: string, screen: { x: number; y: number }) => void;
   handleDuplicateSelection: () => Promise<void>;
   handleDeleteSelection: () => void;
}

/*
 * The board's world-transform layer: one translate+scale div mapping world coords to screen. Holds every
 * non-connection item in ONE stable pass (selection raises an item via its z-index band, never a DOM
 * re-order, so its React instance is preserved - no remount), the multi-select group toolbar, the
 * connection overlay, and the pen / polygon / focus / hover previews. The pending-erase and drawing-focus
 * contexts wrap this layer from the parent.
 */
export function BoardItemsLayer({
   viewport,
   items,
   nonZoneItems,
   zoneItems,
   connectionItems,
   collapsedZoneIds,
   selectedIds,
   soleSelectedId,
   editingId,
   layerRank,
   layerCount,
   moveDeltaFor,
   interacting,
   groupBbox,
   groupDrag,
   connectPreview,
   penPreview,
   polygonPreview,
   penSettings,
   activeTool,
   focusLayer,
   hoveredItem,
   actions,
   handleItemPointerDown,
   handleItemDoubleClick,
   handleMoveStart,
   handleDelete,
   handleConnectStart,
   handleRequestEditPortal,
   handleRequestRelinkPortal,
   handleDuplicateSelection,
   handleDeleteSelection,
}: BoardItemsLayerProps) {
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

   // World layer: a single transform maps world coords to screen.
   return (
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
   );
}
