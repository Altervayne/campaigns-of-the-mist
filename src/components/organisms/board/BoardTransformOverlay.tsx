// -- Utils Imports --
import { pointsBounds, strokePaint, type WorldRect } from '@/lib/board/drawingStyle';
import { groupToolbarZIndex } from '@/lib/board/boardLayering';

// -- Type Imports --
import type { BoardItem, Stroke } from '@/lib/types/board';
import type { Point } from '@/lib/board/boardConnections';

/** On-screen weight (px) of the per-stroke outline and the tight bbox; counter-scaled by 1/zoom. */
const OUTLINE_PX = 1.5;
const BOX_PX = 1;

interface BoardTransformOverlayProps {
   /** The layer whose strokes are selected; the overlay renders inside its local (rotated) frame. */
   layer: BoardItem | null;
   /** The selected stroke ids within that layer. */
   strokeIds: ReadonlySet<string>;
   /** The live move delta in the layer's LOCAL frame (null when idle), applied as the group's transform. */
   moveDelta: Point | null;
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

/*
 * The Transform tool's selection overlay: faint per-stroke outlines plus one tight bounding box, drawn INSIDE
 * the selected layer's local transformed frame so they inherit the layer's own rotation (INVARIANT: the
 * manipulator respects the layer's rotation). A move preview rides the group's `transform`, so the outlines +
 * box slide together with no per-sample rebuild. The marquee (world-axis-aligned) is a separate world-space
 * rect. Inert; every stroke counter-scales by 1/zoom to hold a constant on-screen weight; theme accent only.
 * Phase 1 shows selection + move only - scale/rotate handles are a later phase.
 */
export function BoardTransformOverlay({ layer, strokeIds, moveDelta, marquee, zoom, layerCount }: BoardTransformOverlayProps) {
   const zIndex = groupToolbarZIndex(layerCount);
   const outline = OUTLINE_PX / zoom;
   const boxWidth = BOX_PX / zoom;

   const drawing = layer && layer.content.kind === 'drawing' ? { item: layer, content: layer.content } : null;
   const selected = drawing ? drawing.content.strokes.filter((stroke) => strokeIds.has(stroke.id)) : [];
   const bounds = drawing ? selectionBounds(drawing.content.strokes, strokeIds) : null;
   const rotation = drawing?.item.rotation ?? 0;
   const groupTransform = moveDelta ? `translate(${moveDelta.x} ${moveDelta.y})` : undefined;

   return (
      <>
         {/* The selection, inside the layer's local frame: a positioned box at the layer origin, sized to the
             layer, rotated about its center exactly like the item box - so the SVG's local coords line up with
             the layer's own strokes. */}
         {drawing && selected.length > 0 && (
            <div
               className="pointer-events-none absolute"
               style={{ left: drawing.item.x, top: drawing.item.y, width: drawing.item.width, height: drawing.item.height, transform: rotation ? `rotate(${rotation}deg)` : undefined, zIndex }}
            >
               <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden>
                  <g transform={groupTransform}>
                     {selected.map((stroke) => (
                        <path key={stroke.id} className="stroke-primary" d={strokePaint(stroke).d} fill="none" strokeWidth={outline} strokeOpacity={0.7} strokeLinecap="round" strokeLinejoin="round" />
                     ))}
                     {bounds && (
                        <rect
                           className="stroke-primary"
                           x={bounds.minX}
                           y={bounds.minY}
                           width={bounds.maxX - bounds.minX}
                           height={bounds.maxY - bounds.minY}
                           fill="none"
                           strokeWidth={boxWidth}
                           strokeDasharray={`${4 / zoom} ${3 / zoom}`}
                        />
                     )}
                  </g>
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
