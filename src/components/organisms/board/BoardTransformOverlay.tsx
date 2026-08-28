// -- Utils Imports --
import { pointsBounds, type WorldRect } from '@/lib/drawing/strokeGeometry';
import { strokePaint } from '@/lib/drawing/strokePaint';
import { groupToolbarZIndex } from '@/lib/board/boardLayering';
import { applyMatrixToPoints, IDENTITY, type Mat } from '@/lib/drawing/strokeTransform';
import { HANDLE_GRIP_PX, MIN_HANDLE_BOX_PX, ROTATE_KNOB_PX, ROTATE_STALK_PX, handleAnchors, handleLayoutBox, type HandleId } from '@/lib/drawing/strokeHandles';

// -- Type Imports --
import type { BoardItem, Stroke } from '@/lib/types/board';
import type { Point } from '@/lib/board/boardConnections';

/** On-screen weight (px) of the per-stroke outline and the tight bbox; counter-scaled by 1/zoom. */
const OUTLINE_PX = 1.5;
const BOX_PX = 1;
/** The grip's border weight (px), for contrast against the ink beneath. */
const GRIP_BORDER_PX = 1;

interface BoardTransformOverlayProps {
   /** The layer whose strokes are selected; the overlay renders inside its local (rotated) frame. */
   layer: BoardItem | null;
   /** The selected stroke ids within that layer. */
   strokeIds: ReadonlySet<string>;
   /** The live transform in the layer's LOCAL frame (null when idle), applied as the group's matrix. */
   preview: Mat | null;
   /** The live marquee rect in WORLD coords (null when idle). */
   marquee: WorldRect | null;
   zoom: number;
   /** Feeds the disjoint z-index band so the overlay tops the item bands, like the other world cues. */
   layerCount: number;
}

/** The local-frame bounds of the selected strokes (union of their point bounds), or null when empty. */
function selectionBounds(strokes: Stroke[], strokeIds: ReadonlySet<string>): WorldRect | null {
   let box: WorldRect | null = null;
   for (const stroke of strokes) {
      if (!strokeIds.has(stroke.id)) continue;
      const b = pointsBounds(stroke.points);
      if (!b) continue;
      box = box
         ? { minX: Math.min(box.minX, b.minX), minY: Math.min(box.minY, b.minY), maxX: Math.max(box.maxX, b.maxX), maxY: Math.max(box.maxY, b.maxY) }
         : b;
   }
   return box;
}

/** Whether any selected stroke is a 2-corner shape (ellipse/rect): rotate/skew are unrepresentable for it. */
function hasShapeStroke(strokes: Stroke[], strokeIds: ReadonlySet<string>): boolean {
   return strokes.some((stroke) => strokeIds.has(stroke.id) && (stroke.shape === 'ellipse' || stroke.shape === 'rect'));
}

/*
 * The Transform tool's selection overlay + free-transform box: faint per-stroke outlines, the tight bounding
 * box, the 8 scale grips, and the rotate knob on a stalk - all drawn INSIDE the selected layer's local frame
 * so they inherit the layer's own rotation (INVARIANT: the manipulator respects the layer's rotation). A live
 * drag rides the group's `transform` matrix, so the outlines slide/scale/rotate together with no per-sample
 * rebuild; the box + handles re-derive from the same matrix so they track it. The marquee (world-axis-aligned)
 * is a separate world-space rect. Inert - the pointerdown resolves the handle geometrically in the hook; every
 * grip counter-scales by 1/zoom to hold a constant on-screen size. Theme accent only. A selection holding a
 * shape drops the rotate knob (its 2-corner box can't carry a rotated/skewed frame).
 */
export function BoardTransformOverlay({ layer, strokeIds, preview, marquee, zoom, layerCount }: BoardTransformOverlayProps) {
   const zIndex = groupToolbarZIndex(layerCount);
   const outline = OUTLINE_PX / zoom;
   const boxWidth = BOX_PX / zoom;

   const drawing = layer && layer.content.kind === 'drawing' ? { item: layer, content: layer.content } : null;
   const selected = drawing ? drawing.content.strokes.filter((stroke) => strokeIds.has(stroke.id)) : [];
   const bounds = drawing ? selectionBounds(drawing.content.strokes, strokeIds) : null;
   const rotation = drawing?.item.rotation ?? 0;

   // The manipulator's geometry: the (padded, for a tiny selection) layout box + its handle anchors, then the
   // live preview mapping each into place. The box/handles derive from the SAME matrix as the outlines, so the
   // whole manipulator tracks a drag.
   const matrix = preview ?? IDENTITY;
   const mapPoint = (p: Point): Point => {
      const [x, y] = applyMatrixToPoints([p.x, p.y], matrix);
      return { x, y };
   };
   const layoutBox = bounds ? handleLayoutBox(bounds, MIN_HANDLE_BOX_PX / zoom) : null;
   const anchors = layoutBox ? handleAnchors(layoutBox, ROTATE_STALK_PX / zoom) : null;
   const hasShape = drawing ? hasShapeStroke(drawing.content.strokes, strokeIds) : false;
   const gripSize = HANDLE_GRIP_PX / zoom;
   const knobRadius = ROTATE_KNOB_PX / zoom / 2;
   const gripBorder = GRIP_BORDER_PX / zoom;

   // The scale grips: corners then edges (the rotate knob is drawn separately, and hidden for a shape).
   const gripHandles: HandleId[] = ['nw', 'ne', 'se', 'sw', 'n', 'e', 's', 'w'];
   const groupTransform = preview ? `matrix(${matrix.join(' ')})` : undefined;

   return (
      <>
         {/* The selection + manipulator, inside the layer's local frame: a positioned box at the layer origin,
             sized to the layer, rotated about its center exactly like the item box - so the SVG's local coords
             line up with the layer's own strokes. */}
         {drawing && selected.length > 0 && (
            <div
               className="pointer-events-none absolute"
               style={{ left: drawing.item.x, top: drawing.item.y, width: drawing.item.width, height: drawing.item.height, transform: rotation ? `rotate(${rotation}deg)` : undefined, zIndex }}
            >
               <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden>
                  {/* The ink outlines ride the group matrix. */}
                  <g transform={groupTransform}>
                     {selected.map((stroke) => (
                        <path key={stroke.id} className="stroke-primary" d={strokePaint(stroke).d} fill="none" strokeWidth={outline} strokeOpacity={0.7} strokeLinecap="round" strokeLinejoin="round" />
                     ))}
                  </g>

                  {/* The box + handles map through the same matrix (so they track a drag) but stay constant-size
                      - a scale must not fatten the grips. Under rotate/skew the box is a parallelogram, so it's
                      drawn as a polygon of the four mapped corners. */}
                  {anchors && (
                     <>
                        <polygon
                           className="stroke-primary"
                           points={[anchors.nw, anchors.ne, anchors.se, anchors.sw].map((p) => { const m = mapPoint(p); return `${m.x},${m.y}`; }).join(' ')}
                           fill="none"
                           strokeWidth={boxWidth}
                           strokeDasharray={`${4 / zoom} ${3 / zoom}`}
                        />

                        {gripHandles.map((id) => {
                           const c = mapPoint(anchors[id]);
                           return (
                              <rect
                                 key={id}
                                 className="fill-primary stroke-background"
                                 x={c.x - gripSize / 2}
                                 y={c.y - gripSize / 2}
                                 width={gripSize}
                                 height={gripSize}
                                 strokeWidth={gripBorder}
                              />
                           );
                        })}

                        {/* The rotate knob on a stalk below the bottom-mid edge (clear of the top toolbar) - a circle vs the square grips. */}
                        {!hasShape && (() => {
                           const stalkBase = mapPoint(anchors.s);
                           const knob = mapPoint(anchors.rotate);
                           return (
                              <>
                                 <line className="stroke-primary" x1={stalkBase.x} y1={stalkBase.y} x2={knob.x} y2={knob.y} strokeWidth={boxWidth} />
                                 <circle className="fill-primary stroke-background" cx={knob.x} cy={knob.y} r={knobRadius} strokeWidth={gripBorder} />
                              </>
                           );
                        })()}
                     </>
                  )}
               </svg>
            </div>
         )}

         {/* The marquee: a world-axis-aligned rect (not tied to any layer's rotation), counter-scaled border. */}
         {marquee && (
            <div
               className="pointer-events-none absolute border border-primary bg-primary/10"
               style={{ left: marquee.minX, top: marquee.minY, width: marquee.maxX - marquee.minX, height: marquee.maxY - marquee.minY, borderWidth: boxWidth, zIndex }}
            />
         )}
      </>
   );
}
