/*
 * The SVG path builders for a stroke's rendered outline. A freehand stroke smooths its raw samples through a
 * Catmull-Rom -> cubic-bezier spline; a geometric stroke stays crisp. The brush brushes build a FILLED
 * variable-width calligraphy ribbon. Derived at paint time - only the raw samples are stored. Pure, no
 * React/store.
 */

// -- Utils Imports --
import { BRUSH_MIN_WIDTH_FACTOR, BRUSH_SMOOTH_WINDOW } from './constants';
import { shapeBox } from './strokeGeometry';

/**
 * The Catmull-Rom -> cubic-bezier segments over a point list, emitted WITHOUT a leading move (the pen is
 * assumed to already sit at the first point). Ends of the list clamp to their endpoints, so the curve
 * passes through every sample. Fewer than two points yields no segment.
 */
function bezierSegments(pts: { x: number; y: number }[]): string {
   const count = pts.length;
   if (count < 2) return '';
   const at = (index: number) => pts[Math.min(Math.max(index, 0), count - 1)];
   let d = '';
   for (let i = 0; i < count - 1; i++) {
      const p0 = at(i - 1);
      const p1 = at(i);
      const p2 = at(i + 1);
      const p3 = at(i + 2);
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
   }
   return d;
}

/**
 * Builds a smoothed SVG path from a flat `[x0,y0,...]` point list via a Catmull-Rom spline converted to
 * cubic beziers, so a freehand stroke reads as a curve rather than a polygon. An empty list yields no
 * path; a single point yields a zero-length segment (a round-capped dot); two points yield a straight line.
 */
export function buildStrokePath(points: number[]): string {
   const count = Math.floor(points.length / 2);
   if (count === 0) return '';
   const first = { x: points[0], y: points[1] };
   if (count === 1) return `M ${first.x} ${first.y} L ${first.x} ${first.y}`;
   const pts = new Array<{ x: number; y: number }>(count);
   for (let i = 0; i < count; i++) pts[i] = { x: points[i * 2], y: points[i * 2 + 1] };
   return `M ${first.x} ${first.y}${bezierSegments(pts)}`;
}

/**
 * Resamples a point list to roughly even `spacing` arc-length steps, always keeping the endpoints. Dropping
 * the near-coincident samples a fast pointer emits keeps the ribbon's per-point heading from spinning on a
 * sub-pixel span. Degenerate input (all points coincident) collapses to a single point.
 */
function resampleEven(pts: { x: number; y: number }[], spacing: number): { x: number; y: number }[] {
   if (pts.length < 2 || spacing <= 0) return pts.slice();
   const out = [pts[0]];
   let prev = pts[0];
   let acc = 0; // arc length walked since the last emitted point
   for (let i = 1; i < pts.length; i++) {
      let dx = pts[i].x - prev.x;
      let dy = pts[i].y - prev.y;
      let seg = Math.hypot(dx, dy);
      while (acc + seg >= spacing) {
         const t = (spacing - acc) / seg;
         const nx = prev.x + dx * t;
         const ny = prev.y + dy * t;
         out.push({ x: nx, y: ny });
         prev = { x: nx, y: ny };
         dx = pts[i].x - prev.x;
         dy = pts[i].y - prev.y;
         seg = Math.hypot(dx, dy);
         acc = 0;
      }
      acc += seg;
      prev = pts[i];
   }
   const last = pts[pts.length - 1];
   const tail = out[out.length - 1];
   if (Math.hypot(tail.x - last.x, tail.y - last.y) > 1e-6) out.push(last);
   return out;
}

/**
 * Builds a FILLED calligraphy-nib ribbon from a flat `[x0,y0,...]` point list (the stroke's centerline).
 * The nib is a fixed edge at `nibAngle`: the half-width at a point is `(baseWidth/2)` scaled by
 * `lerp(BRUSH_MIN_WIDTH_FACTOR, 1, |sin(heading - nibAngle)|)` - full where the stroke runs perpendicular to
 * the nib, thin where it runs along it (speed-independent, direction only). To keep the edge from serrating
 * on raw pointer noise, the centerline is first resampled to even spacing, then each point's heading is a
 * windowed average of neighbouring segment directions and its nib factor a small moving average - so the
 * perpendiculars and the thickness ease rather than wobble. Both offset edges are drawn as Catmull-Rom
 * curves (the centerline idiom) and joined by rounded bezier end caps into one closed shape painted with
 * `fill` (no stroke). A lone point is a full-width round dot. Sharp cusps may self-overlap; the nonzero fill
 * rule hides it (no boolean union). Render-only: the stored stroke keeps its raw centerline samples + width,
 * so hit-testing and the box bounds are unaffected.
 */
export function buildBrushRibbonPath(points: number[], baseWidth: number, nibAngle: number): string {
   const count = Math.floor(points.length / 2);
   if (count === 0) return '';
   const half = baseWidth / 2;
   const dot = (x: number, y: number) => {
      const r = Math.max(half, 0.01);
      return `M ${x - r} ${y} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0 Z`;
   };
   if (count === 1) return dot(points[0], points[1]);

   const raw = new Array<{ x: number; y: number }>(count);
   for (let i = 0; i < count; i++) raw[i] = { x: points[i * 2], y: points[i * 2 + 1] };
   // Even spacing tied to the brush size: coarse enough to shed pointer jitter, fine enough to hold a curve.
   const pts = resampleEven(raw, Math.max(2, baseWidth * 0.5));
   const m = pts.length;
   if (m === 1) return dot(pts[0].x, pts[0].y);

   // Per-segment unit directions, then a windowed heading per point (a unit-vector mean, so the perpendicular
   // can't flip between near-parallel samples).
   const segX = new Array<number>(m - 1);
   const segY = new Array<number>(m - 1);
   for (let i = 0; i < m - 1; i++) {
      const dx = pts[i + 1].x - pts[i].x;
      const dy = pts[i + 1].y - pts[i].y;
      const len = Math.hypot(dx, dy) || 1;
      segX[i] = dx / len;
      segY[i] = dy / len;
   }
   const win = BRUSH_SMOOTH_WINDOW;
   const heading = new Array<number>(m);
   for (let i = 0; i < m; i++) {
      let sx = 0;
      let sy = 0;
      for (let j = i - win; j <= i + win; j++) {
         const s = Math.min(Math.max(j, 0), m - 2);
         sx += segX[s];
         sy += segY[s];
      }
      heading[i] = Math.atan2(sy, sx);
   }
   // Raw nib factor per point, then a small moving average so thickness eases rather than steps.
   const range = 1 - BRUSH_MIN_WIDTH_FACTOR;
   const factor = new Array<number>(m);
   for (let i = 0; i < m; i++) factor[i] = BRUSH_MIN_WIDTH_FACTOR + range * Math.abs(Math.sin(heading[i] - nibAngle));
   const smooth = new Array<number>(m);
   for (let i = 0; i < m; i++) {
      let sum = 0;
      let n = 0;
      for (let j = i - win; j <= i + win; j++) {
         sum += factor[Math.min(Math.max(j, 0), m - 1)];
         n++;
      }
      smooth[i] = sum / n;
   }

   const left = new Array<{ x: number; y: number }>(m);
   const right = new Array<{ x: number; y: number }>(m);
   for (let i = 0; i < m; i++) {
      const hw = half * smooth[i];
      // The unit normal to the heading: (-sin, cos).
      const nx = -Math.sin(heading[i]) * hw;
      const ny = Math.cos(heading[i]) * hw;
      left[i] = { x: pts[i].x + nx, y: pts[i].y + ny };
      right[i] = { x: pts[i].x - nx, y: pts[i].y - ny };
   }
   const rightRev = right.slice().reverse();

   // Rounded end caps: cubic beziers bulging along the stroke's tangent, so the ends read soft, not chopped.
   const k = 4 / 3;
   const hwEnd = half * smooth[m - 1];
   const hwStart = half * smooth[0];
   const teX = Math.cos(heading[m - 1]) * hwEnd * k;
   const teY = Math.sin(heading[m - 1]) * hwEnd * k;
   const tsX = Math.cos(heading[0]) * hwStart * k;
   const tsY = Math.sin(heading[0]) * hwStart * k;

   let d = `M ${left[0].x} ${left[0].y}`;
   d += bezierSegments(left); // down the left edge
   d += ` C ${left[m - 1].x + teX} ${left[m - 1].y + teY} ${right[m - 1].x + teX} ${right[m - 1].y + teY} ${right[m - 1].x} ${right[m - 1].y}`; // end cap
   d += bezierSegments(rightRev); // back up the right edge
   d += ` C ${right[0].x - tsX} ${right[0].y - tsY} ${left[0].x - tsX} ${left[0].y - tsY} ${left[0].x} ${left[0].y}`; // start cap
   d += ' Z';
   return d;
}

/**
 * A crisp polyline path over a flat `[x0,y0,...]` point list - straight `M`/`L` segments, no smoothing (the
 * geometric counterpart to {@link buildStrokePath}). An empty list yields no path; a single point yields a
 * round-capped dot; `closed` appends a `Z` so the last vertex joins the first.
 */
export function buildPolylinePath(points: number[], closed: boolean): string {
   const count = Math.floor(points.length / 2);
   if (count === 0) return '';
   if (count === 1) return `M ${points[0]} ${points[1]} L ${points[0]} ${points[1]}`;
   let d = `M ${points[0]} ${points[1]}`;
   for (let i = 1; i < count; i++) d += ` L ${points[i * 2]} ${points[i * 2 + 1]}`;
   if (closed) d += ' Z';
   return d;
}

/**
 * The GEOMETRIC calligraphy-nib ribbon over a flat `[x0,y0,...]` vertex list - the crisp counterpart to
 * {@link buildBrushRibbonPath} (no resample, no heading smoothing). Each EDGE keeps its own straight
 * direction, and that direction alone sets its width: `hw = (baseWidth/2) * lerp(BRUSH_MIN_WIDTH_FACTOR, 1,
 * |sin(edgeHeading - nibAngle)|)`. So a single straight line reads as one uniform nib-weight for its angle,
 * while a polygon varies edge-to-edge. Every edge is a filled quad (its endpoints offset +/-hw along the
 * edge normal); a filled disc at each vertex, sized to the max of its adjacent edges' half-widths, bridges
 * the corner width mismatch (the nonzero fill hides the overlaps - the same trick the freehand ribbon uses).
 * `closed` adds the wrap edge (last->first). A lone point is a full-width round dot. Painted with `fill`,
 * no stroke. Render-only: the stored stroke keeps its raw vertices + width, so hit-test/bounds are unaffected.
 */
export function buildGeometricRibbonPath(points: number[], baseWidth: number, nibAngle: number, closed: boolean): string {
   const count = Math.floor(points.length / 2);
   if (count === 0) return '';
   const half = baseWidth / 2;
   const vx = (i: number) => points[i * 2];
   const vy = (i: number) => points[i * 2 + 1];
   const disc = (x: number, y: number, r: number) => {
      const rr = Math.max(r, 0.01);
      return `M ${x - rr} ${y} a ${rr} ${rr} 0 1 0 ${rr * 2} 0 a ${rr} ${rr} 0 1 0 ${-rr * 2} 0 Z`;
   };
   if (count === 1) return disc(vx(0), vy(0), half);

   const range = 1 - BRUSH_MIN_WIDTH_FACTOR;
   const edgeCount = closed ? count : count - 1;
   const vertexHw = new Array<number>(count).fill(0); // widest edge incident to each vertex, sizing its disc
   let d = '';
   for (let e = 0; e < edgeCount; e++) {
      const a = e;
      const b = (e + 1) % count;
      const ax = vx(a), ay = vy(a), bx = vx(b), by = vy(b);
      const len = Math.hypot(bx - ax, by - ay);
      if (len < 1e-9) continue; // coincident endpoints: no quad; the vertex disc still covers the point
      const heading = Math.atan2(by - ay, bx - ax);
      const hw = half * (BRUSH_MIN_WIDTH_FACTOR + range * Math.abs(Math.sin(heading - nibAngle)));
      // The unit normal to the edge, scaled to the half-width: (-sin, cos).
      const nx = -Math.sin(heading) * hw;
      const ny = Math.cos(heading) * hw;
      d += `M ${ax + nx} ${ay + ny} L ${bx + nx} ${by + ny} L ${bx - nx} ${by - ny} L ${ax - nx} ${ay - ny} Z`;
      if (hw > vertexHw[a]) vertexHw[a] = hw;
      if (hw > vertexHw[b]) vertexHw[b] = hw;
   }
   for (let i = 0; i < count; i++) if (vertexHw[i] > 0) d += disc(vx(i), vy(i), vertexHw[i]);
   // Every edge degenerate (all points coincident): fall back to a lone dot.
   return d || disc(vx(0), vy(0), half);
}

/**
 * A crisp ellipse region path (two arcs) from a two-corner `[ax,ay,bx,by]` box. Reversed corners normalize
 * to the same path. A fully degenerate box (both radii zero) yields no path.
 */
export function buildEllipsePath(points: number[]): string {
   const { x0, y0, x1, y1 } = shapeBox(points);
   const rx = (x1 - x0) / 2;
   const ry = (y1 - y0) / 2;
   if (rx === 0 && ry === 0) return '';
   const cx = (x0 + x1) / 2;
   const cy = (y0 + y1) / 2;
   return `M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${rx * 2} 0 a ${rx} ${ry} 0 1 0 ${-rx * 2} 0 Z`;
}

/** A crisp closed rectangle region path from a two-corner `[ax,ay,bx,by]` box. Reversed corners normalize. */
export function buildRectPath(points: number[]): string {
   const { x0, y0, x1, y1 } = shapeBox(points);
   return `M ${x0} ${y0} L ${x1} ${y0} L ${x1} ${y1} L ${x0} ${y1} Z`;
}
