// -- React Imports --
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { ArrowLeftRight, Trash2 } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { CONNECTION_CORNER_RADIUS, connectionArrowGeometryAt, connectionEndpoints } from '@/lib/board/boardConnections';
import { connectionMidpoint, connectionPath } from '@/lib/board/connectionPath';
import { collapsedBarRect, isConnectionCollapsedAway, resolveEndpointAnchor } from '@/lib/board/zoneCollapse';
import { pushRecentColor, readRecentColors } from '@/lib/recentColors';

// -- Component Imports --
import { ColorPickerPopover } from '@/components/molecules/color/ColorPickerPopover';
import { ConnectionPathTypePicker } from './ConnectionPathTypePicker';

// -- Type Imports --
import type { BoardItem, ConnectionArrow, ConnectionBoardContent, ConnectionControls, ConnectionDash, ConnectionPathType, ConnectionStyle } from '@/lib/types/board';
import type { Point, RectLike } from '@/lib/board/boardConnections';

/*
 * The connection overlay: one SVG inside the world layer (so it shares the pan/zoom
 * transform and lines align to items at any zoom), drawn ABOVE the item boxes. The SVG
 * is `pointer-events: none` so it never blocks an item; only the lines are hittable (a
 * wide transparent stroke makes a thin line easy to click). Lines are read live from the
 * endpoint items each render, so they follow movement/resize; a connection whose
 * endpoint is missing draws nothing (no orphan line). The selected line's width/color
 * are edited from the midpoint toolbar - each change is one undoable command.
 */

/** Line-width presets (world units), thin -> thick. */
const WIDTH_PRESETS = [1, 2, 3, 5, 8];
/** Line dash-style presets, in toolbar order. */
const DASH_PRESETS: ConnectionDash[] = ['solid', 'dashed', 'dotted'];
/** Center-marker presets, in toolbar order (`null` = no marker). */
const ARROW_PRESETS: (ConnectionArrow['type'] | null)[] = [null, 'full', 'chevron'];

/** The SVG `strokeDasharray` for a dash style at width `w` (world units); solid -> no array. */
function dashArrayFor(dash: ConnectionDash | undefined, w: number): string | undefined {
   if (dash === 'dashed') return `${w * 2.5} ${w * 2}`;
   if (dash === 'dotted') return `0.01 ${w * 2}`; // round-capped zero dashes read as dots
   return undefined;
}

/**
 * The connection's curated palette: vivid colors chosen to read on light + dark boards.
 * Deliberately distinct from the post-it pastels - the picker and recents are shared, the
 * palette is per-context. A pick from here is NOT a "custom" color, so it never joins recents.
 */
export const CONNECTION_PALETTE = ['#3b82f6', '#ef4444', '#22c55e', '#eab308', '#a855f7', '#f97316', '#64748b', '#0f172a', '#f8fafc'] as const;

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
      return { ...base, radius: CONNECTION_CORNER_RADIUS };
   };

   // The selected line's live color while its picker is open: shown on the line before the
   // single committed command on close (so a picker drag never floods undo).
   const [colorPreview, setColorPreview] = useState<{ id: string; color: string } | null>(null);

   // The live preview line during a connect drag: source edge -> cursor (a free end).
   const previewLine = (() => {
      if (!connectPreview) return null;
      const source = items[connectPreview.fromId];
      if (!source) return null;
      return connectionEndpoints(endpointRect(source), { x: connectPreview.cursor.x, y: connectPreview.cursor.y, width: 0, height: 0 });
   })();

   const selectedConnection = connections.find((connection) => connection.id === selectedId);

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
               // One shared `d` drives the visible line, the selection halo, and the hit target.
               const d = connectionPath(pathType, from, to, content.style.controls);

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
                     {/* The center marker (part of the line, always visible), in the line's own color. */}
                     {content.style.arrow && (
                        <ConnectionArrowMarker
                           pathType={pathType} from={from} to={to} controls={content.style.controls}
                           arrow={content.style.arrow} width={content.style.width} color={effectiveColor}
                        />
                     )}
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

         {/* Style control for the selected connection: counter-scaled and floated a fixed screen distance
             ABOVE the midpoint (the trailing translateY rides after the scale, so it's zoom-independent) so
             it never covers the center arrow marker it edits. */}
         {selectedConnection && (() => {
            const content = selectedConnection.content as ConnectionBoardContent;
            const fromItem = items[content.from];
            const toItem = items[content.to];
            if (!fromItem || !toItem) return null;
            if (isConnectionCollapsedAway(fromItem, toItem, items, collapsedZoneIds)) return null;
            const { from, to } = connectionEndpoints(endpointRect(fromItem), endpointRect(toItem));
            const pathType = content.style.pathType ?? 'straight';
            // Anchor the toolbar at the on-path midpoint, so it follows a bent line.
            const { point: mid } = connectionMidpoint(pathType, from, to, content.style.controls);
            const effectiveColor = colorPreview?.id === selectedConnection.id ? colorPreview.color : content.style.color;

            return (
               <div
                  className="absolute"
                  style={{ left: mid.x, top: mid.y, zIndex, transform: `translate(-50%, -50%) scale(${1 / zoom}) translateY(-44px)` }}
                  onPointerDown={(event) => event.stopPropagation()}
               >
                  <div className="flex items-center gap-2 rounded-md border border-border bg-card/95 p-1.5 shadow-md backdrop-blur-sm">
                     <ConnectionPathTypePicker
                        pathType={pathType}
                        onChange={(next) => onUpdateStyle(selectedConnection.id, { ...content.style, pathType: next })}
                     />

                     <div className="h-5 w-px bg-border" />

                     <div className="flex items-center gap-1" title={t('BoardView.lineWidth')}>
                        {WIDTH_PRESETS.map((width) => (
                           <button
                              key={width}
                              type="button"
                              aria-label={`${t('BoardView.lineWidth')} ${width}`}
                              onClick={() => onUpdateStyle(selectedConnection.id, { ...content.style, width })}
                              className={cn(
                                 'flex h-6 w-6 items-center justify-center rounded hover:bg-muted cursor-pointer',
                                 content.style.width === width && 'bg-muted ring-1 ring-primary',
                              )}
                           >
                              <span className="rounded-full bg-foreground" style={{ width: width + 2, height: width + 2 }} />
                           </button>
                        ))}
                     </div>

                     <div className="h-5 w-px bg-border" />

                     {/* Solid / dashed / dotted, each previewing its own pattern. */}
                     <div className="flex items-center gap-1" title={t('BoardView.lineStyle')}>
                        {DASH_PRESETS.map((dash) => (
                           <button
                              key={dash}
                              type="button"
                              aria-label={t(`BoardView.lineStyle${dash[0].toUpperCase()}${dash.slice(1)}`)}
                              onClick={() => onUpdateStyle(selectedConnection.id, { ...content.style, dash })}
                              className={cn(
                                 'flex h-6 w-6 items-center justify-center rounded text-foreground hover:bg-muted cursor-pointer',
                                 (content.style.dash ?? 'solid') === dash && 'bg-muted ring-1 ring-primary',
                              )}
                           >
                              <DashPreview dash={dash} />
                           </button>
                        ))}
                     </div>

                     <div className="h-5 w-px bg-border" />

                     {/* Center marker: none / full / chevron, then a direction flip (enabled only with a marker). */}
                     <div className="flex items-center gap-1" title={t('BoardView.arrowMarker')}>
                        {ARROW_PRESETS.map((type) => {
                           const active = (content.style.arrow?.type ?? null) === type;
                           return (
                              <button
                                 key={type ?? 'none'}
                                 type="button"
                                 aria-label={t(`BoardView.arrow${type === null ? 'None' : type === 'full' ? 'Full' : 'Chevron'}`)}
                                 onClick={() => onUpdateStyle(selectedConnection.id, {
                                    ...content.style,
                                    arrow: type === null ? undefined : { type, direction: content.style.arrow?.direction ?? 'forward' },
                                 })}
                                 className={cn(
                                    'flex h-6 w-6 items-center justify-center rounded text-foreground hover:bg-muted cursor-pointer',
                                    active && 'bg-muted ring-1 ring-primary',
                                 )}
                              >
                                 <ArrowPreview type={type} />
                              </button>
                           );
                        })}
                        <button
                           type="button"
                           aria-label={t('BoardView.arrowFlip')}
                           title={t('BoardView.arrowFlip')}
                           disabled={!content.style.arrow}
                           onClick={() => content.style.arrow && onUpdateStyle(selectedConnection.id, {
                              ...content.style,
                              arrow: { ...content.style.arrow, direction: content.style.arrow.direction === 'forward' ? 'backward' : 'forward' },
                           })}
                           className={cn(
                              'flex h-6 w-6 items-center justify-center rounded text-foreground hover:bg-muted cursor-pointer',
                              'disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent',
                           )}
                        >
                           <ArrowLeftRight className="h-3.5 w-3.5" />
                        </button>
                     </div>

                     <div className="h-5 w-px bg-border" />

                     <ConnectionColorControl
                        connectionId={selectedConnection.id}
                        style={content.style}
                        effectiveColor={effectiveColor}
                        onPreview={(color) => setColorPreview(color == null ? null : { id: selectedConnection.id, color })}
                        onUpdateStyle={onUpdateStyle}
                     />

                     <div className="h-5 w-px bg-border" />

                     <button
                        type="button"
                        aria-label={t('BoardView.deleteConnection')}
                        title={t('BoardView.deleteConnection')}
                        onClick={() => onDelete(selectedConnection.id)}
                        className="flex h-6 w-6 items-center justify-center rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
                     >
                        <Trash2 className="h-3.5 w-3.5" />
                     </button>
                  </div>
               </div>
            );
         })()}
      </>
   );
}

/**
 * The connection's color control in the midpoint toolbar: a swatch trigger opening the
 * shared (portaled) color popover. The full picker previews live on the line and commits a
 * single `onUpdateStyle` on close; a curated/recent swatch commits once. Custom colors join
 * the shared recents; curated ones do not. A line always keeps a color, so there is no
 * remove (the popover hides it when no remove label is given).
 */
function ConnectionColorControl({
   connectionId,
   style,
   effectiveColor,
   onPreview,
   onUpdateStyle,
}: {
   connectionId: string;
   style: ConnectionStyle;
   effectiveColor: string;
   onPreview: (color: string | null) => void;
   onUpdateStyle: (id: string, style: ConnectionStyle) => void;
}) {
   const { t } = useTranslation();
   const [open, setOpen] = useState(false);

   // The commit reads from refs so it is correct from any close path (swatch / outside / Escape
   // / unmount) and unaffected by stale closures.
   const pendingRef = useRef<string | null>(null);
   const styleRef = useRef(style);
   useEffect(() => { styleRef.current = style; });

   const commit = useCallback(() => {
      const next = pendingRef.current;
      if (next === null) return;
      const current = styleRef.current;
      if (next !== current.color) {
         onUpdateStyle(connectionId, { ...current, color: next });
         // Only colors from the full picker (not a curated vivid) join the shared recents.
         if (!(CONNECTION_PALETTE as readonly string[]).includes(next)) pushRecentColor(next);
      }
      pendingRef.current = null;
      onPreview(null);
   }, [connectionId, onUpdateStyle, onPreview]);

   // Commit any pending color if the control unmounts (the connection is deselected) before
   // the popover's own dismiss fires.
   const commitRef = useRef(commit);
   useEffect(() => { commitRef.current = commit; });
   useEffect(() => () => { commitRef.current(); }, []);

   return (
      <ColorPickerPopover
         open={open}
         onOpenChange={(next) => { if (!next) commit(); setOpen(next); }}
         activeColor={effectiveColor}
         palette={CONNECTION_PALETTE}
         recent={readRecentColors()}
         recentLabel={t('BoardView.recentColors')}
         onApply={(color) => {
            // A line always has a color; an (unused) remove resolves to the first palette entry.
            const resolved = color ?? CONNECTION_PALETTE[0];
            pendingRef.current = resolved;
            onPreview(resolved);
         }}
         trigger={
            <button
               type="button"
               title={t('BoardView.lineColor')}
               aria-label={t('BoardView.lineColor')}
               onPointerDown={(event) => event.stopPropagation()}
               className="h-6 w-6 cursor-pointer rounded border border-border"
               style={{ backgroundColor: effectiveColor }}
            />
         }
      />
   );
}

/**
 * The connection's center marker, drawn in the world SVG at the path's midpoint in the line's own color.
 * `full` is a filled triangle; `chevron` an open stroked "V". It sits on the on-path midpoint and points
 * along the local tangent, so it tracks a curve or elbow. Geometry is in world units (from the line
 * width), so it scales with the board exactly like the line and stays crisp at any zoom.
 */
function ConnectionArrowMarker({ pathType, from, to, controls, arrow, width, color }: {
   pathType: ConnectionPathType;
   from: Point;
   to: Point;
   controls?: ConnectionControls;
   arrow: ConnectionArrow;
   width: number;
   color: string;
}) {
   const { point, tangent } = connectionMidpoint(pathType, from, to, controls);
   const { points } = connectionArrowGeometryAt(point, tangent, arrow, width);
   const d = points.map((p) => `${p.x},${p.y}`).join(' ');
   if (arrow.type === 'full') return <polygon points={d} fill={color} />;
   return <polyline points={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />;
}

/** A tiny preview of a center-marker choice, for the toolbar buttons (uses the button's color). */
function ArrowPreview({ type }: { type: ConnectionArrow['type'] | null }) {
   return (
      <svg width="18" height="10" viewBox="0 0 18 10" aria-hidden>
         <line x1="1" y1="5" x2="17" y2="5" stroke="currentColor" strokeWidth="1.5" />
         {type === 'full' && <polygon points="6,1 13,5 6,9" fill="currentColor" />}
         {type === 'chevron' && <polyline points="6,1 13,5 6,9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
   );
}

/** A tiny horizontal line preview of a dash style, for the toolbar buttons (uses the button's color). */
function DashPreview({ dash }: { dash: ConnectionDash }) {
   const stroke = dash === 'dashed' ? { strokeDasharray: '4 3' } : dash === 'dotted' ? { strokeDasharray: '0.5 3', strokeLinecap: 'round' as const } : {};
   return (
      <svg width="16" height="6" viewBox="0 0 16 6" aria-hidden>
         <line x1="1" y1="3" x2="15" y2="3" stroke="currentColor" strokeWidth="2" {...stroke} />
      </svg>
   );
}
