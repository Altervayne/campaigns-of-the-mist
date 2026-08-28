// -- Utils Imports --
import { strokePaint } from '@/lib/drawing/strokePaint';

// -- Type Imports --
import type { StrokePaintInput } from '@/lib/drawing/strokePaint';

/**
 * One stroke as its outline `<path>`, with an optional interior fill layer painted underneath (a filled
 * shape needs a solid interior AND its brush outline, two paths). All the brush x shape branching lives in
 * {@link strokePaint}, so every surface (board layer, PDF annotation) paints through the exact same code.
 * Round cap/join stay set for the stroked (pen/highlighter) paths; they are inert on the filled (brush) ribbons.
 */
export function StrokeShape({ stroke }: { stroke: StrokePaintInput }) {
   const paint = strokePaint(stroke);
   return (
      <>
         {paint.fillD && <path d={paint.fillD} fill={paint.fillColor} fillOpacity={paint.fillOpacity} stroke="none" />}
         <path d={paint.d} fill={paint.fill} stroke={paint.stroke} strokeWidth={paint.strokeWidth} strokeOpacity={paint.strokeOpacity} strokeLinecap="round" strokeLinejoin="round" />
      </>
   );
}
