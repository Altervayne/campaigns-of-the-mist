/*
 * The stroke paint resolver: the ONE place the brush x shape matrix branches into an outline `<path>`'s
 * attributes (plus an optional interior fill layer), so every surface renders a stroke identically. Pure,
 * no React/store.
 */

// -- Utils Imports --
import { HIGHLIGHTER_OPACITY, NIB_ANGLE } from './constants';
import { buildBrushRibbonPath, buildEllipsePath, buildGeometricRibbonPath, buildPolylinePath, buildRectPath, buildStrokePath } from './strokePaths';
import { shapeEllipseRing, shapeRectCorners } from './strokeGeometry';

// -- Type Imports --
import type { ActiveTool, BrushKind, Stroke } from './types';

/** A brush's stroke opacity: highlighter is translucent, pen/brush opaque. */
export function brushOpacity(brush: BrushKind): number {
   return brush === 'highlighter' ? HIGHLIGHTER_OPACITY : 1;
}

/**
 * The Draw gestures that append a stroke to a layer - every drawing gesture except the eraser (which works
 * across all layers) and Select. Drives the active-layer focus cue: while an append tool is armed, the
 * active layer stays full and the others dim, so it must NOT fire for the eraser or in Select mode.
 */
export function isAppendTool(tool: ActiveTool): boolean {
   return tool === 'freehand' || tool === 'line' || tool === 'freeformPolygon' || tool === 'regularPolygon' || tool === 'shape';
}

/**
 * Resolves a stroke's ink to a CSS color. `null` is the adaptive default - the theme foreground token,
 * which stays legible on any board theme - while a set hex is used verbatim (ink is the one sanctioned
 * raw-hex place). Mirrors {@link textStyleToCss}'s color handling.
 */
export function strokeColorToCss(color: string | null): string {
   return color ?? 'var(--foreground)';
}

/**
 * The paint a stroke resolves to: the outline `<path>`'s attributes, plus an optional interior fill layer
 * (`fillD`) drawn UNDER it - a filled brush shape needs both a solid interior and a nib-ribbon outline, two
 * different paths. The fill uses the ink at `fillOpacity` (opaque for pen/brush, the highlighter's own alpha).
 */
export interface StrokePaint {
   d: string;
   fill: string;
   stroke: string;
   strokeWidth?: number;
   strokeOpacity?: number;
   fillD?: string;
   fillColor?: string;
   fillOpacity?: number;
}

/** The stroke fields the paint helper reads (so a live preview can pass a transient, id-less stroke). */
export type StrokePaintInput = Pick<Stroke, 'brush' | 'color' | 'width' | 'points' | 'shape' | 'filled'>;

/**
 * Resolves a stroke to its outline `<path>`'s paint (plus an optional fill layer), the ONE place the brush x
 * shape matrix branches (so the drawing item and the live preview render identically). A geometric brush
 * stroke is a filled nib ribbon; a geometric pen/highlighter is a crisp stroked polyline (the highlighter
 * keeps its translucency); a freehand brush stroke is the smoothed nib ribbon; a freehand pen/highlighter is
 * the smoothed stroked path. A polygon closes its path, and a `filled` one adds an interior fill of the ink
 * beneath it (like the bounding-box shapes). An ellipse/rect is a bounding-box region: the outline inherits
 * the brush (a nib ribbon over the sampled ring / four corners, or a crisp stroked region), and a `filled`
 * one adds an interior fill of the ink beneath it.
 */
export function strokePaint(stroke: StrokePaintInput): StrokePaint {
   const ink = strokeColorToCss(stroke.color);
   if (stroke.shape === 'ellipse' || stroke.shape === 'rect') {
      const region = stroke.shape === 'ellipse' ? buildEllipsePath(stroke.points) : buildRectPath(stroke.points);
      // The fill covers what's beneath at full ink opacity; the highlighter keeps its own translucency so a
      // filled highlighter shape stays see-through rather than turning into an opaque block.
      const fill = stroke.filled ? { fillD: region, fillColor: ink, fillOpacity: brushOpacity(stroke.brush) } : undefined;
      if (stroke.brush === 'brush') {
         const ring = stroke.shape === 'ellipse' ? shapeEllipseRing(stroke.points) : shapeRectCorners(stroke.points);
         return { d: buildGeometricRibbonPath(ring, stroke.width, NIB_ANGLE, true), fill: ink, stroke: 'none', ...fill };
      }
      return { d: region, fill: 'none', stroke: ink, strokeWidth: stroke.width, strokeOpacity: brushOpacity(stroke.brush), ...fill };
   }
   const closed = stroke.shape === 'polygon';
   if (stroke.shape) {
      // A closed polygon carries an interior fill like the bounding-box shapes (the region is its own closed
      // polyline); a line stays outline-only. The highlighter keeps its own alpha so a filled one reads see-through.
      const fill = closed && stroke.filled ? { fillD: buildPolylinePath(stroke.points, true), fillColor: ink, fillOpacity: brushOpacity(stroke.brush) } : undefined;
      if (stroke.brush === 'brush') {
         return { d: buildGeometricRibbonPath(stroke.points, stroke.width, NIB_ANGLE, closed), fill: ink, stroke: 'none', ...fill };
      }
      return { d: buildPolylinePath(stroke.points, closed), fill: 'none', stroke: ink, strokeWidth: stroke.width, strokeOpacity: brushOpacity(stroke.brush), ...fill };
   }
   if (stroke.brush === 'brush') {
      return { d: buildBrushRibbonPath(stroke.points, stroke.width, NIB_ANGLE), fill: ink, stroke: 'none' };
   }
   return { d: buildStrokePath(stroke.points), fill: 'none', stroke: ink, strokeWidth: stroke.width, strokeOpacity: brushOpacity(stroke.brush) };
}
