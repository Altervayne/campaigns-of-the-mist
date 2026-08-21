// -- React Imports --
import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';

// -- Utils Imports --
import { CONNECTION_CORNER_RADIUS, CONNECTION_LABEL_SIZE_PX, DEFAULT_LABEL_SIZE, connectionArrowGeometryAt, connectionEndpoints, dashArrayFor } from '@/lib/board/boardConnections';
import { connectionMidpoint, connectionPath, connectionPointAt } from '@/lib/board/connectionPath';
import { collapsedBarRect, isConnectionCollapsedAway, resolveEndpointAnchor } from '@/lib/board/zoneCollapse';

// -- Hook Imports --
import { useConnectionControlDrag } from '@/hooks/board/useConnectionControlDrag';

// -- Component Imports --
import { ConnectionControlHandles } from './ConnectionControlHandles';
import { ConnectionToolbar } from './ConnectionToolbar';

// -- Type Imports --
import type { BoardItem, ConnectionBoardContent, ConnectionControls, ConnectionLabelSize, ConnectionMarker, ConnectionMarkerPosition, ConnectionPathType, ConnectionStyle } from '@/lib/types/board';
import type { Point, RectLike } from '@/lib/board/boardConnections';

/*
 * The connection overlay: one SVG inside the world layer (so it shares the pan/zoom
 * transform and lines align to items at any zoom), drawn ABOVE the item boxes. The SVG
 * is `pointer-events: none` so it never blocks an item; only the lines are hittable (a
 * wide transparent stroke makes a thin line easy to click). Lines are read live from the
 * endpoint items each render, so they follow movement/resize; a connection whose
 * endpoint is missing draws nothing (no orphan line). The selected line's style is edited
 * from the midpoint toolbar - each change is one undoable command.
 */

/** The marker positions to iterate when rendering, in draw order. */
const MARKER_POSITIONS: ConnectionMarkerPosition[] = ['start', 'middle', 'end'];

interface BoardConnectionsLayerProps {
   items: Record<string, BoardItem>;
   connections: BoardItem[];
   selectedId: string | null;
   zoom: number;
   /** The active group move (moving ids + shared world delta), or null - so lines track the live drag. */
   moving: { ids: Set<string>; delta: { x: number; y: number } } | null;
   /** Zones currently collapsed: a line to a hidden member of one re-anchors to that zone's bar. */
   collapsedZoneIds: ReadonlySet<string>;
   /** The in-progress connect drag (source item id + cursor in world coords), or null. */
   connectPreview: { fromId: string; cursor: Point } | null;
   /** The connection band's z-index: above every unselected item, below every selected one. */
   zIndex: number;
   onSelect: (id: string) => void;
   onUpdateStyle: (id: string, style: ConnectionStyle) => void;
   onDelete: (id: string) => void;
}

export function BoardConnectionsLayer({ items, connections, selectedId, zoom, moving, collapsedZoneIds, connectPreview, zIndex, onSelect, onUpdateStyle, onDelete }: BoardConnectionsLayerProps) {
   const { t } = useTranslation();

   // While an item is being dragged it renders at its position + the live delta, but the committed
   // `items` map hasn't moved yet; offset an endpoint that is in the moving set so its line follows
   // the item smoothly (both ends shift when both move, e.g. a zone carrying its members).
   const live = (item: BoardItem): BoardItem =>
      moving && moving.ids.has(item.id) ? { ...item, x: item.x + moving.delta.x, y: item.y + moving.delta.y } : item;

   // The geometry an endpoint anchors to: a hidden member of a collapsed zone (or that zone itself)
   // ends on the zone's bar - which follows the bar's own drag; everything else uses the item's live
   // rect. Render-only - the connection's from/to data is untouched.
   const endpointRect = (item: BoardItem): RectLike => {
      const { anchor, isBar } = resolveEndpointAnchor(item, items, collapsedZoneIds);
      const moved = live(anchor);
      // Carry the shape so the anchor lands on the visible outline: a pin meets its circle, every
      // other (rounded) kind - including the collapsed-zone bar - clamps to its corner radius.
      const base = isBar ? collapsedBarRect(moved) : { x: moved.x, y: moved.y, width: moved.width, height: moved.height };
      if (!isBar && moved.kind === 'pin') return { ...base, circle: true };
      // A rotated endpoint (post-it / image / text / drawing) tilts the outline so the anchor meets its
      // real edge; a collapsed-zone bar is never rotated, so it stays axis-aligned.
      return { ...base, radius: CONNECTION_CORNER_RADIUS, rotation: isBar ? undefined : moved.rotation };
   };

   // The selected line's live color while its picker is open: shown on the line before the
   // single committed command on close (so a picker drag never floods undo).
   const [colorPreview, setColorPreview] = useState<{ id: string; color: string } | null>(null);

   // The selected connection's live LABEL color while its label-color picker is open (same one-command
   // discipline as the line color, but painted on the label chip instead of the line).
   const [labelColorPreview, setLabelColorPreview] = useState<{ id: string; color: string } | null>(null);

   // The selected bezier's live control offsets while a handle is dragged: shown on the curve +
   // handles before the single committed command on release (same one-command discipline as color).
   const [controlPreview, setControlPreview] = useState<{ id: string; controls: ConnectionControls } | null>(null);

   // The live preview line during a connect drag: source edge -> cursor (a free end).
   const previewLine = (() => {
      if (!connectPreview) return null;
      const source = items[connectPreview.fromId];
      if (!source) return null;
      return connectionEndpoints(endpointRect(source), { x: connectPreview.cursor.x, y: connectPreview.cursor.y, width: 0, height: 0 });
   })();

   const selectedConnection = connections.find((connection) => connection.id === selectedId);

   // The selected bezier's live endpoints + controls, fed to the handle-drag hook (null unless the
   // selection is an editable bezier that still resolves to two live items).
   const selectedBezierTarget = (() => {
      if (!selectedConnection) return null;
      const content = selectedConnection.content as ConnectionBoardContent;
      if ((content.style.pathType ?? 'straight') !== 'bezier') return null;
      const fromItem = items[content.from];
      const toItem = items[content.to];
      if (!fromItem || !toItem) return null;
      if (isConnectionCollapsedAway(fromItem, toItem, items, collapsedZoneIds)) return null;
      const { from, to } = connectionEndpoints(endpointRect(fromItem), endpointRect(toItem));
      return { from, to, controls: content.style.controls };
   })();

   const controlDrag = useConnectionControlDrag({
      target: selectedBezierTarget,
      zoom,
      onPreview: (controls) => setControlPreview(selectedConnection && controls ? { id: selectedConnection.id, controls } : null),
      onCommit: (controls) => {
         if (!selectedConnection) return;
         onUpdateStyle(selectedConnection.id, { ...(selectedConnection.content as ConnectionBoardContent).style, controls });
      },
   });

   return (
      <>
         {/* The SVG itself is inert; only the lines below opt back into pointer events. The band sits
             above every unselected item and below every selected one (so a string runs behind a
             selected face). */}
         <svg className="absolute left-0 top-0" style={{ width: 1, height: 1, overflow: 'visible', pointerEvents: 'none', zIndex }}>
            {connections.map((connection) => {
               const content = connection.content as ConnectionBoardContent;
               const fromItem = items[content.from];
               const toItem = items[content.to];
               // Defensive: a connection to a deleted item draws nothing (no orphan line).
               if (!fromItem || !toItem) return null;
               // Both ends collapse to the same zone's bar -> the line is a dot; don't draw it.
               if (isConnectionCollapsedAway(fromItem, toItem, items, collapsedZoneIds)) return null;

               const { from, to } = connectionEndpoints(endpointRect(fromItem), endpointRect(toItem));
               const isSelected = connection.id === selectedId;
               // Show the live picker color on the selected line; otherwise the committed color.
               const effectiveColor = colorPreview?.id === connection.id ? colorPreview.color : content.style.color;
               const dashArray = dashArrayFor(content.style.dash, content.style.width);
               const pathType = content.style.pathType ?? 'straight';
               // While a handle is dragged the selected bezier reads the live preview offsets; otherwise
               // the stored ones (or auto). The same `controls` shape the curve, the marker, and the handles.
               const effectiveControls = controlPreview?.id === connection.id ? controlPreview.controls : content.style.controls;
               // One shared `d` drives the visible line, the selection halo, and the hit target.
               const d = connectionPath(pathType, from, to, effectiveControls);

               return (
                  <g key={connection.id}>
                     {isSelected && (
                        <path
                           d={d}
                           fill="none"
                           stroke="var(--primary)"
                           strokeOpacity={0.35}
                           strokeWidth={content.style.width + 8 / zoom}
                           strokeLinecap="round"
                           strokeLinejoin="round"
                        />
                     )}
                     <path
                        d={d}
                        fill="none"
                        stroke={effectiveColor}
                        strokeWidth={content.style.width}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray={dashArray}
                     />
                     {/* Positional markers (part of the line, always visible), each in the line's own color. */}
                     {content.style.markers && MARKER_POSITIONS.map((pos) => {
                        const marker = content.style.markers?.[pos];
                        if (!marker) return null;
                        return (
                           <ConnectionMarkerGlyph
                              key={pos} pathType={pathType} from={from} to={to} controls={effectiveControls}
                              pos={pos} marker={marker} width={content.style.width} color={effectiveColor}
                           />
                        );
                     })}
                     {/* Wide transparent hit path (always SOLID, so a dotted/dashed line stays clickable). */}
                     <path
                        d={d}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={Math.max(content.style.width, 14 / zoom)}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                        onPointerDown={(event: ReactPointerEvent<SVGPathElement>) => {
                           event.stopPropagation();
                           onSelect(connection.id);
                        }}
                     />
                     {/* The bezier's two draggable control handles + tethers, above the line, selection only. */}
                     {isSelected && pathType === 'bezier' && (
                        <ConnectionControlHandles
                           from={from} to={to} controls={effectiveControls} zoom={zoom}
                           c1Label={t('BoardView.connectionControlHandle')}
                           c2Label={t('BoardView.connectionControlHandle')}
                           onPointerDown={controlDrag.onPointerDown}
                           onPointerMove={controlDrag.onPointerMove}
                           onPointerUp={controlDrag.onPointerUp}
                        />
                     )}
                  </g>
               );
            })}

            {previewLine && (
               <line
                  x1={previewLine.from.x} y1={previewLine.from.y} x2={previewLine.to.x} y2={previewLine.to.y}
                  stroke="var(--primary)"
                  strokeWidth={3 / zoom}
                  strokeDasharray={`${6 / zoom} ${4 / zoom}`}
                  strokeLinecap="round"
               />
            )}
         </svg>

         {/* Label chips: one per connection carrying a non-empty label, anchored at the on-path midpoint
             and lifted a fixed screen distance off the line so it never sits under a middle marker. */}
         {connections.map((connection) => {
            const content = connection.content as ConnectionBoardContent;
            const label = content.style.label;
            if (!label) return null;
            const fromItem = items[content.from];
            const toItem = items[content.to];
            if (!fromItem || !toItem) return null;
            if (isConnectionCollapsedAway(fromItem, toItem, items, collapsedZoneIds)) return null;
            const { from, to } = connectionEndpoints(endpointRect(fromItem), endpointRect(toItem));
            const pathType = content.style.pathType ?? 'straight';
            const { point: mid } = connectionMidpoint(pathType, from, to, content.style.controls);
            const labelColor = labelColorPreview?.id === connection.id ? labelColorPreview.color : content.style.labelColor;
            return <ConnectionLabelChip key={connection.id} x={mid.x} y={mid.y} zIndex={zIndex} label={label} size={content.style.labelSize} color={labelColor} />;
         })}

         {/* Style control for the selected connection, anchored at the on-path midpoint so it follows a
             bent line. The toolbar counter-scales itself and floats above the line (clearing the center
             marker it edits). */}
         {selectedConnection && (() => {
            const content = selectedConnection.content as ConnectionBoardContent;
            const fromItem = items[content.from];
            const toItem = items[content.to];
            if (!fromItem || !toItem) return null;
            if (isConnectionCollapsedAway(fromItem, toItem, items, collapsedZoneIds)) return null;
            const { from, to } = connectionEndpoints(endpointRect(fromItem), endpointRect(toItem));
            const pathType = content.style.pathType ?? 'straight';
            const { point: mid } = connectionMidpoint(pathType, from, to, content.style.controls);
            const effectiveColor = colorPreview?.id === selectedConnection.id ? colorPreview.color : content.style.color;

            return (
               <ConnectionToolbar
                  connectionId={selectedConnection.id}
                  style={content.style}
                  x={mid.x}
                  y={mid.y}
                  zoom={zoom}
                  zIndex={zIndex}
                  effectiveColor={effectiveColor}
                  onPreview={(color) => setColorPreview(color == null ? null : { id: selectedConnection.id, color })}
                  onLabelColorPreview={(color) => setLabelColorPreview(color == null ? null : { id: selectedConnection.id, color })}
                  onUpdateStyle={onUpdateStyle}
                  onDelete={onDelete}
               />
            );
         })()}
      </>
   );
}

/**
 * One positional marker, drawn in the world SVG at its position (`start` / `middle` / `end`) in the
 * line's own color. `full` is a filled triangle; `chevron` an open stroked "V". It sits on the on-path
 * point and points along the local tangent (`forward` toward `to`, `backward` toward `from`), so it
 * tracks a curve or elbow. Geometry is in world units (from the line width), so it scales with the
 * board exactly like the line and stays crisp at any zoom.
 */
function ConnectionMarkerGlyph({ pathType, from, to, controls, pos, marker, width, color }: {
   pathType: ConnectionPathType;
   from: Point;
   to: Point;
   controls?: ConnectionControls;
   pos: ConnectionMarkerPosition;
   marker: ConnectionMarker;
   width: number;
   color: string;
}) {
   const { point, tangent } = connectionPointAt(pathType, from, to, controls, pos);
   const { points } = connectionArrowGeometryAt(point, tangent, marker, width);
   const d = points.map((p) => `${p.x},${p.y}`).join(' ');
   if (marker.type === 'full') return <polygon points={d} fill={color} />;
   return <polyline points={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />;
}

/**
 * A connection's label chip: an HTML pill floated at the on-path midpoint in the world layer, lifted off
 * the line. It scales WITH the board (no counter-scale), so it grows and shrinks with the line it labels.
 * Theme-token chrome so it reads over any line color. Display only; the label is edited from the toolbar.
 */
function ConnectionLabelChip({ x, y, zIndex, label, size, color }: {
   x: number;
   y: number;
   zIndex: number;
   label: string;
   size?: ConnectionLabelSize;
   color?: string;
}) {
   const fontSize = CONNECTION_LABEL_SIZE_PX[size ?? DEFAULT_LABEL_SIZE];
   return (
      <div
         className="pointer-events-none absolute"
         style={{ left: x, top: y, zIndex, transform: 'translate(-50%, -50%) translateY(-22px)' }}
      >
         <span
            className="whitespace-nowrap rounded border border-border bg-card/95 px-1.5 py-0.5 text-foreground shadow-sm"
            style={{ fontSize, ...(color ? { color } : null) }}
         >
            {label}
         </span>
      </div>
   );
}
