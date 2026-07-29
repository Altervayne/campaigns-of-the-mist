// -- React Imports --
import type { PointerEvent as ReactPointerEvent } from 'react';

// -- Utils Imports --
import { zoneContentMinSize } from '@/lib/board/zoneMembership';
import { connectionsZIndex, groupToolbarZIndex, itemZIndex } from '@/lib/board/boardLayering';
import { toolbarClampDown, toolbarClampX } from '@/lib/board/boardCoordinates';
import { PORTAL_MIN_SIZE } from '@/lib/board/portalSizing';

// -- Custom Hooks --
import { useToolbarMetrics } from '@/hooks/board/useToolbarMetrics';

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

interface BoardItemsLayerProps {
   viewport: Viewport;
   /** The clip's screen width, so a floating toolbar can be held inside its left/right edges. */
   clipWidth: number;
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
   clipWidth,
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
   // Each floating bar measures itself for the sideways clamp: its width varies with its own contents (the
   // per-kind action slot), so no constant can stand in for it. Both reads come off a ResizeObserver, so a
   // pan costs arithmetic only. The clamps stay undefined until a bar is actually off an edge, keeping the
   // memoized boxes out of a pan re-render.
   const itemToolbar = useToolbarMetrics();
   const groupToolbar = useToolbarMetrics();

   /**
    * The off-top clamp for the sole-selected item's toolbar; undefined for every other item, since only the
    * toolbar-bearing sole selection needs measuring. `item.y` is the stored top, so the live move delta is
    * added here (the group bbox already carries its own).
    */
   const toolbarClampFor = (item: BoardItem): number | undefined => {
      if (item.id !== soleSelectedId) return undefined;
      return toolbarClampDown(item.y + (moveDeltaFor(item.id)?.y ?? 0), viewport);
   };

   /**
    * The off-edge clamp for that same toolbar. The bar centres on the box, so its anchor is the box's left
    * edge plus the measured half-width - which the browser resolved against the width the box actually
    * RENDERS at (a collapsed zone's bar, an expanded card's sheet), not the stored width.
    */
   const toolbarClampXFor = (item: BoardItem): number | undefined => {
      if (item.id !== soleSelectedId) return undefined;
      const anchor = item.x + (moveDeltaFor(item.id)?.x ?? 0) + itemToolbar.metrics.anchorOffset;
      return toolbarClampX(anchor, itemToolbar.metrics.screenWidth, 'center', clipWidth, viewport);
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
            toolbarClampX={toolbarClampXFor(item)}
            toolbarMeasureRef={itemToolbar.measureRef}
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
             tops every band so it floats above its members and the connection layer. The anchor spans
             the whole bbox and stays inert, so a press inside it still reaches the item under it (the
             bar itself re-arms pointer events); the bbox already carries the live move delta. */}
         {groupBbox && (
            <div className="pointer-events-none absolute" style={{ left: groupBbox.x, top: groupBbox.y, width: groupBbox.width, height: groupBbox.height, zIndex: groupToolbarZIndex(layerCount) }}>
               <BoardGroupToolbar
                  zoom={viewport.zoom}
                  clampDown={toolbarClampDown(groupBbox.y, viewport)}
                  clampX={toolbarClampX(groupBbox.x + groupToolbar.metrics.anchorOffset, groupToolbar.metrics.screenWidth, 'left', clipWidth, viewport)}
                  measureRef={groupToolbar.measureRef}
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
