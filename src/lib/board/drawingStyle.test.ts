// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { BRUSH_MIN_WIDTH_FACTOR, DEFAULT_STROKE_WIDTH, HIGHLIGHTER_OPACITY, MIN_LINE_LENGTH, NIB_ANGLE, SHAPE_ELLIPSE_SEGMENTS, appendStrokeToDrawing, brushOpacity, buildBrushRibbonPath, buildEllipsePath, buildGeometricRibbonPath, buildPolylinePath, buildRectPath, buildStrokePath, ellipseVertices, isAppendTool, isLineDegenerate, makePenStroke, makeStroke, mergeDrawings, pointsBounds, rebasePoints, recomputeDrawingBoxWithout, recomputeDrawingBoxWithoutMany, regularPolygonVertices, shapeBoxCorners, snapAngle, strokeColorToCss, strokeHitsPoint, strokeIntersectsRect, strokePaint } from './drawingStyle';

// -- Type Imports --
import type { BrushKind, DrawingBoardContent, Stroke } from '@/lib/types/board';

/** A layer-local stroke fixture (only the fields the box math reads matter). Defaults to a pen stroke. */
function stroke(id: string, points: number[], brush: BrushKind = 'pen', width: number = DEFAULT_STROKE_WIDTH): Stroke {
   return { id, brush, color: null, width, points };
}

/** A minimal drawing layer at an origin, holding the given layer-local strokes. */
function layer(x: number, y: number, strokes: Stroke[]): { x: number; y: number; content: DrawingBoardContent } {
   return { x, y, content: { kind: 'drawing', strokes } };
}

/*
 * The pure geometry + style helpers behind a drawing layer: adaptive ink resolution, world bounds (for
 * minting a layer's origin), world<->local rebasing (so an append never touches the box), and the smoothed
 * path builder that turns raw samples into a curve. Kept free of React so they are unit-testable here.
 */

describe('strokeColorToCss', () => {
   it('resolves null to the adaptive theme foreground and passes a hex through', () => {
      expect(strokeColorToCss(null)).toBe('var(--foreground)');
      expect(strokeColorToCss('#ff0000')).toBe('#ff0000');
   });
});

describe('pointsBounds', () => {
   it('returns the min/max corners over a flat point list', () => {
      expect(pointsBounds([10, 20, -5, 40, 30, 15])).toEqual({ minX: -5, minY: 15, maxX: 30, maxY: 40 });
   });

   it('returns null when there is no point', () => {
      expect(pointsBounds([])).toBeNull();
   });
});

describe('rebasePoints', () => {
   it('subtracts the origin from every pair (world -> local)', () => {
      expect(rebasePoints([10, 20, 30, 40], 10, 20)).toEqual([0, 0, 20, 20]);
   });

   it('round-trips through a negated origin', () => {
      const local = rebasePoints([10, 20, 30, 40], 10, 20);
      expect(rebasePoints(local, -10, -20)).toEqual([10, 20, 30, 40]);
   });
});

describe('buildStrokePath', () => {
   it('is empty for no points', () => {
      expect(buildStrokePath([])).toBe('');
   });

   it('draws a zero-length segment (a dot) for a single point', () => {
      expect(buildStrokePath([5, 7])).toBe('M 5 7 L 5 7');
   });

   it('opens with a move to the first point and emits a bezier per following point', () => {
      const path = buildStrokePath([0, 0, 10, 10, 20, 0]);
      expect(path.startsWith('M 0 0')).toBe(true);
      expect(path.match(/C/g)?.length).toBe(2); // one cubic segment per step between three points
   });
});

describe('makePenStroke', () => {
   it('mints a pen stroke with the default width and the adaptive (null) color', () => {
      const pen = makePenStroke('s1', [0, 0, 1, 1]);
      expect(pen).toEqual({ id: 's1', brush: 'pen', color: null, width: DEFAULT_STROKE_WIDTH, points: [0, 0, 1, 1] });
   });
});

describe('makeStroke', () => {
   it('carries the given brush, ink, and width', () => {
      expect(makeStroke('s1', [0, 0, 2, 2], 'highlighter', '#ff0000', 16)).toEqual({ id: 's1', brush: 'highlighter', color: '#ff0000', width: 16, points: [0, 0, 2, 2] });
   });

   it('stamps a shape only when one is passed (freehand stays shape-less)', () => {
      expect(makeStroke('s1', [0, 0, 2, 2], 'pen', null, 3)).not.toHaveProperty('shape');
      expect(makeStroke('s2', [0, 0, 2, 2], 'pen', null, 3, 'line').shape).toBe('line');
      expect(makeStroke('s3', [0, 0, 2, 2, 4, 0], 'pen', null, 3, 'polygon').shape).toBe('polygon');
   });

   it('stamps filled only when true (an unfilled shape stays fill-less)', () => {
      expect(makeStroke('s1', [0, 0, 2, 2], 'pen', null, 3, 'rect')).not.toHaveProperty('filled');
      expect(makeStroke('s2', [0, 0, 2, 2], 'pen', null, 3, 'rect', false)).not.toHaveProperty('filled');
      expect(makeStroke('s3', [0, 0, 2, 2], 'pen', null, 3, 'ellipse', true).filled).toBe(true);
   });
});

describe('shapeBoxCorners', () => {
   it('leaves the box A->B verbatim when freed', () => {
      expect(shapeBoxCorners(2, 3, 12, 9, false)).toEqual([2, 3, 12, 9]);
   });

   it('makes an equal-sided box from the larger extent when constrained', () => {
      // dx=10 dominates dy=6: the side is 10, so B lands at (12, 13) down-right of A.
      expect(shapeBoxCorners(2, 3, 12, 9, true)).toEqual([2, 3, 12, 13]);
   });

   it('preserves the drag quadrant (an up-left drag stays up-left)', () => {
      // dx=-8, dy=-4: side 8, B moves up and left of A.
      expect(shapeBoxCorners(20, 20, 12, 16, true)).toEqual([20, 20, 12, 12]);
   });

   it('picks the dominant axis regardless of which is larger', () => {
      // dy=14 dominates dx=5: the side is 14.
      expect(shapeBoxCorners(0, 0, 5, 14, true)).toEqual([0, 0, 14, 14]);
   });

   it('collapses a zero drag to a zero box (sign defaults to +)', () => {
      expect(shapeBoxCorners(5, 5, 5, 5, true)).toEqual([5, 5, 5, 5]);
   });
});

describe('buildEllipsePath', () => {
   it('draws a two-arc path with the box center and radii', () => {
      // Box (0,0)-(20,10): center (10,5), rx 10, ry 5.
      expect(buildEllipsePath([0, 0, 20, 10])).toBe('M 0 5 a 10 5 0 1 0 20 0 a 10 5 0 1 0 -20 0 Z');
   });

   it('normalizes reversed corners to the same path', () => {
      expect(buildEllipsePath([20, 10, 0, 0])).toBe(buildEllipsePath([0, 0, 20, 10]));
   });

   it('yields no path for a fully degenerate (zero) box', () => {
      expect(buildEllipsePath([7, 7, 7, 7])).toBe('');
   });
});

describe('buildRectPath', () => {
   it('draws a closed four-corner rectangle', () => {
      expect(buildRectPath([0, 0, 20, 10])).toBe('M 0 0 L 20 0 L 20 10 L 0 10 Z');
   });

   it('normalizes reversed corners to the same path', () => {
      expect(buildRectPath([20, 10, 0, 0])).toBe(buildRectPath([0, 0, 20, 10]));
   });
});

describe('ellipseVertices', () => {
   it('yields one vertex pair per segment', () => {
      expect(ellipseVertices(0, 0, 1, 1, 8)).toHaveLength(16);
   });

   it('samples the unit circle at radius 1 on equal axes', () => {
      const v = ellipseVertices(0, 0, 1, 1, 4);
      // Vertex 0 at angle 0 -> (1,0); vertex 1 at 90deg -> (0,1).
      expect(v[0]).toBeCloseTo(1);
      expect(v[1]).toBeCloseTo(0);
      expect(v[2]).toBeCloseTo(0);
      expect(v[3]).toBeCloseTo(1);
   });

   it('honors differing axis radii', () => {
      const v = ellipseVertices(0, 0, 10, 2, 4);
      expect(v[0]).toBeCloseTo(10); // along x
      expect(v[3]).toBeCloseTo(2); // along y
   });

   it('collapses every vertex onto the center at radius 0', () => {
      const v = ellipseVertices(3, 4, 0, 0, 6);
      for (let i = 0; i < v.length; i += 2) {
         expect(v[i]).toBeCloseTo(3);
         expect(v[i + 1]).toBeCloseTo(4);
      }
   });
});

describe('buildPolylinePath', () => {
   it('is empty for no points', () => {
      expect(buildPolylinePath([], false)).toBe('');
   });

   it('draws a round-capped dot for a single point', () => {
      expect(buildPolylinePath([5, 7], false)).toBe('M 5 7 L 5 7');
   });

   it('emits straight line-tos with no smoothing', () => {
      expect(buildPolylinePath([0, 0, 10, 10], false)).toBe('M 0 0 L 10 10');
      expect(buildPolylinePath([0, 0, 10, 10, 20, 0], false)).toBe('M 0 0 L 10 10 L 20 0');
   });

   it('appends Z only when closed', () => {
      expect(buildPolylinePath([0, 0, 10, 10, 20, 0], true)).toBe('M 0 0 L 10 10 L 20 0 Z');
      expect(/Z/.test(buildPolylinePath([0, 0, 10, 10, 20, 0], false))).toBe(false);
   });
});

describe('buildGeometricRibbonPath', () => {
   // The bbox of the first edge quad only (up to its closing Z), so the vertex discs' relative arc deltas
   // never pollute the thickness measurement.
   const firstQuadBounds = (d: string) => {
      const nums = (d.slice(0, d.indexOf('Z')).match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi) ?? []).map(Number);
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i < nums.length - 1; i += 2) {
         minX = Math.min(minX, nums[i]); maxX = Math.max(maxX, nums[i]);
         minY = Math.min(minY, nums[i + 1]); maxY = Math.max(maxY, nums[i + 1]);
      }
      return { minX, minY, maxX, maxY };
   };

   it('is empty for no points', () => {
      expect(buildGeometricRibbonPath([], 10, NIB_ANGLE, false)).toBe('');
   });

   it('draws a full-width round dot for a single point', () => {
      const d = buildGeometricRibbonPath([5, 5], 10, NIB_ANGLE, false);
      expect(d.match(/a/g)?.length).toBe(2); // two arcs close the disc
   });

   it('emits one filled quad for a single straight edge (no smoothing)', () => {
      const d = buildGeometricRibbonPath([0, 0, 20, 0], 10, NIB_ANGLE, false);
      expect((d.match(/ L /g) ?? []).length).toBe(3); // a quad is three line-tos after the move
      expect(d.includes('C')).toBe(false); // geometric: never a curve
   });

   it('varies width by edge direction (a horizontal and a vertical edge differ, within the nib range)', () => {
      const width = 10;
      const h = firstQuadBounds(buildGeometricRibbonPath([0, 0, 20, 0], width, NIB_ANGLE, false)); // thickness is vertical
      const v = firstQuadBounds(buildGeometricRibbonPath([0, 0, 0, 20], width, NIB_ANGLE, false)); // thickness is horizontal
      const hThick = h.maxY - h.minY;
      const vThick = v.maxX - v.minX;
      expect(hThick).not.toBeCloseTo(vThick);
      for (const thick of [hThick, vThick]) {
         expect(thick).toBeGreaterThanOrEqual(width * BRUSH_MIN_WIDTH_FACTOR - 1e-6);
         expect(thick).toBeLessThanOrEqual(width + 1e-6);
      }
   });

   it('closes a triangle: three edge quads plus bridging discs', () => {
      const open = buildGeometricRibbonPath([0, 0, 20, 0, 10, 17], 10, NIB_ANGLE, false); // 2 edges
      const closed = buildGeometricRibbonPath([0, 0, 20, 0, 10, 17], 10, NIB_ANGLE, true); // + the wrap edge
      // Each quad is three line-tos; the closed form carries the extra closing edge.
      expect((closed.match(/ L /g) ?? []).length).toBe((open.match(/ L /g) ?? []).length + 3);
      expect(closed.includes('a')).toBe(true); // vertex discs bridge the corners
   });

   it('collapses to a lone dot when every point is coincident', () => {
      const d = buildGeometricRibbonPath([4, 4, 4, 4, 4, 4], 10, NIB_ANGLE, false);
      expect(d.match(/a/g)?.length).toBe(2); // no quad survives; a single disc remains
      expect(d.includes('L')).toBe(false);
   });
});

describe('snapAngle', () => {
   const step = Math.PI / 4; // 45deg

   it('snaps a near-diagonal to an exact 45deg, keeping the length', () => {
      const p = snapAngle(0, 0, 10, 6, step); // ~31deg -> 45deg
      expect(p.x).toBeCloseTo(p.y); // exactly on the 45deg diagonal
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(Math.hypot(10, 6)); // length preserved
   });

   it('leaves an already axis-aligned segment on its axis', () => {
      const p = snapAngle(0, 0, 12, 0.3, step); // ~1.4deg -> 0deg
      expect(p.x).toBeCloseTo(Math.hypot(12, 0.3));
      expect(p.y).toBeCloseTo(0);
   });

   it('returns the end unchanged for a zero-length segment (no direction)', () => {
      expect(snapAngle(5, 5, 5, 5, step)).toEqual({ x: 5, y: 5 });
   });
});

describe('regularPolygonVertices', () => {
   it('yields one vertex pair per side', () => {
      expect(regularPolygonVertices(0, 0, 10, 3, 0)).toHaveLength(6);
      expect(regularPolygonVertices(0, 0, 10, 4, 0)).toHaveLength(8);
      expect(regularPolygonVertices(0, 0, 10, 5, 0)).toHaveLength(10);
   });

   it('points its first vertex straight up at rotation 0 (unit circle)', () => {
      const v = regularPolygonVertices(0, 0, 1, 4, 0);
      // First vertex straight up: (0, -1).
      expect(v[0]).toBeCloseTo(0);
      expect(v[1]).toBeCloseTo(-1);
      // A square's four vertices, going clockwise from the top: up, right, down, left.
      expect(v[2]).toBeCloseTo(1); // right
      expect(v[3]).toBeCloseTo(0);
      expect(v[4]).toBeCloseTo(0); // down
      expect(v[5]).toBeCloseTo(1);
      expect(v[6]).toBeCloseTo(-1); // left
      expect(v[7]).toBeCloseTo(0);
   });

   it('honors the center offset', () => {
      const v = regularPolygonVertices(5, 7, 1, 4, 0);
      expect(v[0]).toBeCloseTo(5);
      expect(v[1]).toBeCloseTo(6); // 7 - 1, first vertex up
   });

   it('turns the whole polygon by the rotation offset', () => {
      // A quarter turn takes the top vertex to the right.
      const v = regularPolygonVertices(0, 0, 1, 4, Math.PI / 2);
      expect(v[0]).toBeCloseTo(1);
      expect(v[1]).toBeCloseTo(0);
   });

   it('collapses every vertex onto the center at radius 0', () => {
      const v = regularPolygonVertices(3, 4, 0, 5, 1.2);
      for (let i = 0; i < v.length; i += 2) {
         expect(v[i]).toBeCloseTo(3);
         expect(v[i + 1]).toBeCloseTo(4);
      }
   });
});

describe('isLineDegenerate', () => {
   it('flags a pure click (coincident endpoints)', () => {
      expect(isLineDegenerate([10, 10, 10, 10], MIN_LINE_LENGTH)).toBe(true);
   });

   it('flags a sub-threshold drag', () => {
      expect(isLineDegenerate([0, 0, MIN_LINE_LENGTH - 0.5, 0], MIN_LINE_LENGTH)).toBe(true);
   });

   it('passes a drag past the threshold', () => {
      expect(isLineDegenerate([0, 0, MIN_LINE_LENGTH + 1, 0], MIN_LINE_LENGTH)).toBe(false);
   });

   it('flags a point list too short to be a line', () => {
      expect(isLineDegenerate([0, 0], MIN_LINE_LENGTH)).toBe(true);
   });
});

describe('strokePaint', () => {
   it('paints a geometric brush stroke as a filled nib ribbon', () => {
      const paint = strokePaint({ brush: 'brush', color: null, width: 10, points: [0, 0, 20, 0], shape: 'line' });
      expect(paint.fill).toBe('var(--foreground)');
      expect(paint.stroke).toBe('none');
      expect(paint.d.includes('C')).toBe(false); // crisp, not smoothed
   });

   it('paints a geometric pen line as a crisp stroked polyline', () => {
      const paint = strokePaint({ brush: 'pen', color: '#ff0000', width: 3, points: [0, 0, 20, 0], shape: 'line' });
      expect(paint.fill).toBe('none');
      expect(paint.stroke).toBe('#ff0000');
      expect(paint.strokeWidth).toBe(3);
      expect(paint.d).toBe('M 0 0 L 20 0');
   });

   it('keeps the highlighter translucent and closes a polygon', () => {
      const paint = strokePaint({ brush: 'highlighter', color: null, width: 8, points: [0, 0, 10, 0, 5, 8], shape: 'polygon' });
      expect(paint.strokeOpacity).toBeCloseTo(0.4);
      expect(paint.d.trim().endsWith('Z')).toBe(true);
   });

   it('falls back to the freehand smoothed path when no shape is set', () => {
      const paint = strokePaint({ brush: 'pen', color: null, width: 3, points: [0, 0, 10, 10, 20, 0] });
      expect(paint.d.includes('C')).toBe(true); // smoothed bezier, not a crisp polyline
   });

   it('paints an unfilled pen ellipse as a crisp stroked region with no fill layer', () => {
      const paint = strokePaint({ brush: 'pen', color: '#00ff00', width: 4, points: [0, 0, 20, 10], shape: 'ellipse' });
      expect(paint.d).toBe(buildEllipsePath([0, 0, 20, 10]));
      expect(paint.fill).toBe('none');
      expect(paint.stroke).toBe('#00ff00');
      expect(paint.fillD).toBeUndefined();
   });

   it('adds a solid ink fill layer under a filled pen rect', () => {
      const paint = strokePaint({ brush: 'pen', color: '#00ff00', width: 4, points: [0, 0, 20, 10], shape: 'rect', filled: true });
      expect(paint.fillD).toBe(buildRectPath([0, 0, 20, 10]));
      expect(paint.fillColor).toBe('#00ff00');
      expect(paint.fillOpacity).toBe(1); // opaque - the fill covers what's beneath
   });

   it('keeps a filled highlighter shape translucent (its own alpha, not opaque)', () => {
      const paint = strokePaint({ brush: 'highlighter', color: null, width: 8, points: [0, 0, 20, 20], shape: 'ellipse', filled: true });
      expect(paint.fillOpacity).toBeCloseTo(HIGHLIGHTER_OPACITY);
   });

   it('paints a brush ellipse as a nib ribbon over the sampled ring', () => {
      const paint = strokePaint({ brush: 'brush', color: null, width: 10, points: [0, 0, 20, 20], shape: 'ellipse' });
      expect(paint.fill).toBe('var(--foreground)');
      expect(paint.stroke).toBe('none');
      expect(paint.d.includes('C')).toBe(false); // crisp geometric ribbon, not smoothed
      expect(paint.fillD).toBeUndefined(); // unfilled: outline only
   });

   it('paints a filled brush rect as a ribbon outline over an interior fill', () => {
      const paint = strokePaint({ brush: 'brush', color: null, width: 10, points: [0, 0, 20, 20], shape: 'rect', filled: true });
      expect(paint.stroke).toBe('none'); // the ribbon is a fill, not a stroke
      expect(paint.fillD).toBe(buildRectPath([0, 0, 20, 20]));
      expect(paint.fillOpacity).toBe(1);
   });

   it('adds a solid ink fill layer under a filled polygon (its closed polyline is the region)', () => {
      const paint = strokePaint({ brush: 'pen', color: '#00ff00', width: 4, points: [0, 0, 10, 0, 5, 8], shape: 'polygon', filled: true });
      expect(paint.fillD).toBe(buildPolylinePath([0, 0, 10, 0, 5, 8], true));
      expect(paint.fillColor).toBe('#00ff00');
      expect(paint.fillOpacity).toBe(1);
   });

   it('leaves an unfilled polygon outline-only (no fill layer)', () => {
      const paint = strokePaint({ brush: 'pen', color: null, width: 4, points: [0, 0, 10, 0, 5, 8], shape: 'polygon' });
      expect(paint.fillD).toBeUndefined();
   });
});

describe('brushOpacity', () => {
   it('is translucent for the highlighter and opaque for pen/brush', () => {
      expect(brushOpacity('highlighter')).toBeCloseTo(0.4);
      expect(brushOpacity('pen')).toBe(1);
      expect(brushOpacity('brush')).toBe(1);
   });
});

describe('isAppendTool', () => {
   it('is true for every drawing gesture that appends a stroke', () => {
      expect(isAppendTool('freehand')).toBe(true);
      expect(isAppendTool('line')).toBe(true);
      expect(isAppendTool('freeformPolygon')).toBe(true);
      expect(isAppendTool('regularPolygon')).toBe(true);
      expect(isAppendTool('shape')).toBe(true);
   });

   it('is false for select and the eraser (no active-layer focus cue)', () => {
      expect(isAppendTool('select')).toBe(false);
      expect(isAppendTool('eraser')).toBe(false);
   });
});

describe('buildBrushRibbonPath', () => {
   // Every coordinate pair in a ribbon path (no arcs), so the perpendicular thickness can be measured.
   const bounds = (d: string) => {
      const nums = (d.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi) ?? []).map(Number);
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i < nums.length - 1; i += 2) {
         minX = Math.min(minX, nums[i]); maxX = Math.max(maxX, nums[i]);
         minY = Math.min(minY, nums[i + 1]); maxY = Math.max(maxY, nums[i + 1]);
      }
      return { minX, minY, maxX, maxY };
   };

   it('is empty for no points', () => {
      expect(buildBrushRibbonPath([], 10, NIB_ANGLE)).toBe('');
   });

   it('draws a full-width round dot (an arc pair) for a single point', () => {
      const d = buildBrushRibbonPath([5, 5], 10, NIB_ANGLE);
      expect(d.startsWith('M')).toBe(true);
      expect(d.match(/a/g)?.length).toBe(2); // two arcs close the circle
      expect(d.trim().endsWith('Z')).toBe(true);
   });

   it('closes a curved filled ribbon (both edges + caps are beziers, no straight line-tos)', () => {
      const d = buildBrushRibbonPath([0, 0, 20, 0, 40, 0, 60, 0], 10, NIB_ANGLE);
      expect(d.startsWith('M')).toBe(true);
      expect(d.trim().endsWith('Z')).toBe(true);
      expect(/ L /.test(d)).toBe(false); // outline + caps are curved, never a serrating straight join
      expect((d.match(/C/g) ?? []).length).toBeGreaterThanOrEqual(4); // left edge, right edge, two caps
   });

   it('shrugs off a near-coincident (noise) sample - the resampled ribbon barely moves', () => {
      const clean = bounds(buildBrushRibbonPath([0, 0, 20, 0, 40, 0, 60, 0], 10, NIB_ANGLE));
      // The same stroke with a sub-pixel-jittered near-duplicate injected (the pointer noise that serrates).
      const noisy = bounds(buildBrushRibbonPath([0, 0, 20, 0, 20.2, 0.1, 40, 0, 60, 0], 10, NIB_ANGLE));
      expect(Math.abs((noisy.maxY - noisy.minY) - (clean.maxY - clean.minY))).toBeLessThan(0.5);
      expect(Math.abs(noisy.maxX - clean.maxX)).toBeLessThan(1);
   });

   it('gives a horizontal and a vertical stroke different widths (the nib is off 45deg)', () => {
      const width = 10;
      const h = bounds(buildBrushRibbonPath([0, 0, 10, 0], width, NIB_ANGLE)); // thickness is vertical
      const v = bounds(buildBrushRibbonPath([0, 0, 0, 10], width, NIB_ANGLE)); // thickness is horizontal
      const hThick = h.maxY - h.minY;
      const vThick = v.maxX - v.minX;
      expect(hThick).not.toBeCloseTo(vThick);
      // Both sit within the nib's range: never thinner than the floor, never wider than the base width.
      for (const thick of [hThick, vThick]) {
         expect(thick).toBeGreaterThanOrEqual(width * BRUSH_MIN_WIDTH_FACTOR - 1e-6);
         expect(thick).toBeLessThanOrEqual(width + 1e-6);
      }
   });

   it('is thinnest along the nib edge and fullest perpendicular to it', () => {
      const width = 10;
      const along = bounds(buildBrushRibbonPath([0, 0, Math.cos(NIB_ANGLE) * 10, Math.sin(NIB_ANGLE) * 10], width, NIB_ANGLE));
      const across = bounds(buildBrushRibbonPath([0, 0, Math.cos(NIB_ANGLE + Math.PI / 2) * 10, Math.sin(NIB_ANGLE + Math.PI / 2) * 10], width, NIB_ANGLE));
      const span = (b: { minX: number; minY: number; maxX: number; maxY: number }) => Math.max(b.maxX - b.minX, b.maxY - b.minY);
      // The perpendicular stroke's bbox is wider than the along-nib one (thin edge vs full edge).
      expect(span(across)).toBeGreaterThan(span(along));
   });
});

describe('strokeHitsPoint', () => {
   const origin = { x: 100, y: 100 }; // layer origin: local (0,0) == world (100,100)

   it('never hits an empty stroke', () => {
      expect(strokeHitsPoint(origin, stroke('s', []), 100, 100, 8)).toBe(false);
   });

   it('hits a single-point stroke within reach and misses beyond it', () => {
      const dot = stroke('s', [0, 0], 'pen', 4); // reach = width/2 + tol = 2 + 8 = 10
      expect(strokeHitsPoint(origin, dot, 108, 100, 8)).toBe(true); // 8px away, inside 10
      expect(strokeHitsPoint(origin, dot, 120, 100, 8)).toBe(false); // 20px away, outside
   });

   it('hits along a segment (perpendicular distance) and misses a near-miss just past the band', () => {
      const line = stroke('s', [0, 0, 40, 0], 'pen', 4); // horizontal, reach 10 with tol 8
      expect(strokeHitsPoint(origin, line, 120, 108, 8)).toBe(true); // 8px off the line, inside
      expect(strokeHitsPoint(origin, line, 120, 112, 8)).toBe(false); // 12px off, outside
   });

   it('widens the hit band for a thick stroke', () => {
      const near = { worldX: 120, worldY: 118 }; // 18px off the line
      const thin = stroke('s', [0, 0, 40, 0], 'pen', 4); // reach 10
      const thick = stroke('s', [0, 0, 40, 0], 'highlighter', 20); // reach = 10 + 8 = 18
      expect(strokeHitsPoint(origin, thin, near.worldX, near.worldY, 8)).toBe(false);
      expect(strokeHitsPoint(origin, thick, near.worldX, near.worldY, 8)).toBe(true);
   });

   it('hits a polygon on its closing edge (last vertex back to the first)', () => {
      // A square's four vertices; local (0,20) sits on the closing edge (0,40)->(0,0) but is 20px from
      // every open edge, so only the closing segment can catch it.
      const square: Stroke = { id: 's', brush: 'pen', color: null, width: 4, points: [0, 0, 40, 0, 40, 40, 0, 40], shape: 'polygon' };
      expect(strokeHitsPoint(origin, square, 100, 120, 8)).toBe(true);
      // The same vertices as an OPEN stroke never close, so that point misses.
      const open: Stroke = { ...square, shape: undefined };
      expect(strokeHitsPoint(origin, open, 100, 120, 8)).toBe(false);
   });

   it('bites a rect on any edge, not just the stored diagonal, and misses its interior when unfilled', () => {
      // Corners stored as the diagonal (0,0)-(40,40).
      const rect: Stroke = { id: 's', brush: 'pen', color: null, width: 4, points: [0, 0, 40, 40], shape: 'rect' };
      expect(strokeHitsPoint(origin, rect, 120, 100, 8)).toBe(true); // local (20,0): top edge, off the diagonal
      expect(strokeHitsPoint(origin, rect, 140, 120, 8)).toBe(true); // local (40,20): right edge
      expect(strokeHitsPoint(origin, rect, 120, 120, 8)).toBe(false); // local (20,20): dead center, no outline
   });

   it('erases anywhere inside a FILLED rect', () => {
      const rect: Stroke = { id: 's', brush: 'pen', color: null, width: 4, points: [0, 0, 40, 40], shape: 'rect', filled: true };
      expect(strokeHitsPoint(origin, rect, 120, 120, 8)).toBe(true); // local (20,20): interior now hits
   });

   it('bites an ellipse on its ring and misses its interior when unfilled', () => {
      // Box (0,0)-(40,40): a circle of radius 20 centered at local (20,20).
      const ellipse: Stroke = { id: 's', brush: 'pen', color: null, width: 4, points: [0, 0, 40, 40], shape: 'ellipse' };
      expect(strokeHitsPoint(origin, ellipse, 120, 100, 8)).toBe(true); // local (20,0): top of the ring
      expect(strokeHitsPoint(origin, ellipse, 120, 120, 8)).toBe(false); // local (20,20): center, no fill
   });

   it('erases anywhere inside a FILLED ellipse', () => {
      const ellipse: Stroke = { id: 's', brush: 'pen', color: null, width: 4, points: [0, 0, 40, 40], shape: 'ellipse', filled: true };
      expect(strokeHitsPoint(origin, ellipse, 120, 120, 8)).toBe(true); // local (20,20): interior now hits
      // A corner of the bounding box sits OUTSIDE the ellipse, so it still misses even when filled.
      expect(strokeHitsPoint(origin, ellipse, 102, 102, 2)).toBe(false); // local (2,2): outside the curve
   });

   it('erases anywhere inside a FILLED polygon, but an unfilled one only on its edges', () => {
      // A triangle: (0,0)-(40,0)-(20,40). Local (20,10) sits well inside it, clear of every edge.
      const points = [0, 0, 40, 0, 20, 40];
      const filled: Stroke = { id: 's', brush: 'pen', color: null, width: 4, points, shape: 'polygon', filled: true };
      const open: Stroke = { id: 's', brush: 'pen', color: null, width: 4, points, shape: 'polygon' };
      expect(strokeHitsPoint(origin, filled, 120, 110, 2)).toBe(true); // interior hits when filled
      expect(strokeHitsPoint(origin, open, 120, 110, 2)).toBe(false); // interior misses when unfilled
      expect(strokeHitsPoint(origin, filled, 160, 160, 2)).toBe(false); // local (60,60): outside, still misses
   });
});

describe('SHAPE_ELLIPSE_SEGMENTS', () => {
   it('samples the ellipse ring at a smooth, even resolution', () => {
      expect(SHAPE_ELLIPSE_SEGMENTS).toBeGreaterThanOrEqual(16);
   });
});

describe('recomputeDrawingBoxWithoutMany', () => {
   it('drops several strokes, re-fits the box, and re-bases the survivors', () => {
      // origin (-5,-8): survivor s1 at world (0,0)-(10,10); s2/s3 reach up/left and are erased.
      const item = layer(-5, -8, [stroke('s1', [5, 8, 15, 18]), stroke('s2', [0, 0, 8, 11]), stroke('s3', [0, 0, 1, 1])]);
      const next = recomputeDrawingBoxWithoutMany(item, new Set(['s2', 's3']));
      expect(next).toEqual({ x: 0, y: 0, width: 10, height: 10, strokes: [stroke('s1', [0, 0, 10, 10])] });
   });

   it('returns a zero box holding no stroke when every stroke is removed', () => {
      const item = layer(0, 0, [stroke('s1', [0, 0, 10, 10]), stroke('s2', [3, 3, 4, 4])]);
      expect(recomputeDrawingBoxWithoutMany(item, new Set(['s1', 's2']))).toEqual({ x: 0, y: 0, width: 0, height: 0, strokes: [] });
   });
});

describe('strokeIntersectsRect', () => {
   it('hits when a stroke bbox overlaps the rect (points offset to world by the layer origin)', () => {
      const item = { x: 100, y: 100 };
      const s = stroke('s1', [0, 0, 10, 10]); // world bounds 100..110
      expect(strokeIntersectsRect(item, s, { minX: 105, minY: 105, maxX: 200, maxY: 200 })).toBe(true);
   });

   it('misses when the world bboxes are disjoint', () => {
      const item = { x: 0, y: 0 };
      const s = stroke('s1', [0, 0, 10, 10]);
      expect(strokeIntersectsRect(item, s, { minX: 50, minY: 50, maxX: 60, maxY: 60 })).toBe(false);
   });

   it('counts a touching edge as a hit', () => {
      const item = { x: 0, y: 0 };
      const s = stroke('s1', [0, 0, 10, 10]);
      expect(strokeIntersectsRect(item, s, { minX: 10, minY: 10, maxX: 20, maxY: 20 })).toBe(true);
   });

   it('never hits an empty stroke', () => {
      expect(strokeIntersectsRect({ x: 0, y: 0 }, stroke('s1', []), { minX: -10, minY: -10, maxX: 10, maxY: 10 })).toBe(false);
   });
});

describe('appendStrokeToDrawing', () => {
   const mint = (id: string) => (points: number[]) => stroke(id, points);

   it('grows width/height without re-basing when the stroke stays below/right of the origin', () => {
      const item = layer(0, 0, [stroke('s1', [0, 0, 10, 10])]);
      const next = appendStrokeToDrawing(item, [5, 5, 20, 20], mint('s2'));
      expect(next).toEqual({
         x: 0,
         y: 0,
         width: 20,
         height: 20,
         // The existing stroke is untouched (same object contents); the new one lands local to the held origin.
         strokes: [stroke('s1', [0, 0, 10, 10]), stroke('s2', [5, 5, 20, 20])],
      });
   });

   it('shifts the origin up/left and re-bases every stroke, holding the ink still on screen', () => {
      const item = layer(0, 0, [stroke('s1', [0, 0, 10, 10])]);
      const next = appendStrokeToDrawing(item, [-5, -8, 3, 3], mint('s2'));
      expect(next).toEqual({
         x: -5,
         y: -8,
         width: 15,
         height: 18,
         strokes: [stroke('s1', [5, 8, 15, 18]), stroke('s2', [0, 0, 8, 11])],
      });
      // Ink is world-stable: local + new origin recovers each stroke's original world coords.
      expect(rebasePoints(next.strokes[0].points, -next.x, -next.y)).toEqual([0, 0, 10, 10]);
      expect(rebasePoints(next.strokes[1].points, -next.x, -next.y)).toEqual([-5, -8, 3, 3]);
   });

   it('appends against a non-zero layer origin by converting the world stroke into the local frame', () => {
      const item = layer(100, 100, [stroke('s1', [0, 0, 10, 10])]); // world (100,100)-(110,110)
      const next = appendStrokeToDrawing(item, [105, 105, 130, 130], mint('s2'));
      expect(next).toEqual({
         x: 100,
         y: 100,
         width: 30,
         height: 30,
         strokes: [stroke('s1', [0, 0, 10, 10]), stroke('s2', [5, 5, 30, 30])],
      });
   });
});

describe('mergeDrawings', () => {
   it('unions the box and keeps the target\'s strokes first, then each source\'s, in order', () => {
      const target = layer(0, 0, [stroke('t1', [0, 0, 10, 10])]);
      // A far-away source (world (100,100)-(110,110)): the box grows to hold both, origin unchanged.
      const source = layer(100, 100, [stroke('s1', [0, 0, 10, 10])]);
      const merged = mergeDrawings(target, [source]);
      expect(merged).toEqual({
         x: 0,
         y: 0,
         width: 110,
         height: 110,
         strokes: [stroke('t1', [0, 0, 10, 10]), stroke('s1', [100, 100, 110, 110])],
      });
   });

   it('shifts the origin up/left and re-bases every stroke when a source reaches above/left', () => {
      const target = layer(0, 0, [stroke('t1', [0, 0, 10, 10])]);
      const source = layer(-20, -20, [stroke('s1', [0, 0, 5, 5])]); // world (-20,-20)-(-15,-15)
      const merged = mergeDrawings(target, [source]);
      expect(merged).toEqual({
         x: -20,
         y: -20,
         width: 30,
         height: 30,
         strokes: [stroke('t1', [20, 20, 30, 30]), stroke('s1', [0, 0, 5, 5])],
      });
      // The ink is world-stable: local + merged origin recovers each stroke's original world coords.
      expect(rebasePoints(merged.strokes[0].points, -merged.x, -merged.y)).toEqual([0, 0, 10, 10]);
      expect(rebasePoints(merged.strokes[1].points, -merged.x, -merged.y)).toEqual([-20, -20, -15, -15]);
   });

   it('folds several sources bottom -> top, preserving stroke stacking order', () => {
      const target = layer(0, 0, [stroke('t1', [0, 0, 1, 1])]);
      const lower = layer(0, 0, [stroke('a1', [0, 0, 1, 1])]);
      const upper = layer(0, 0, [stroke('b1', [0, 0, 1, 1])]);
      const merged = mergeDrawings(target, [lower, upper]);
      expect(merged.strokes.map((s) => s.id)).toEqual(['t1', 'a1', 'b1']);
      expect({ x: merged.x, y: merged.y, width: merged.width, height: merged.height }).toEqual({ x: 0, y: 0, width: 1, height: 1 });
   });

   it('carries every stroke of a multi-stroke source', () => {
      const target = layer(0, 0, [stroke('t1', [0, 0, 4, 4])]);
      const source = layer(0, 0, [stroke('s1', [0, 0, 2, 2]), stroke('s2', [1, 1, 3, 3])]);
      const merged = mergeDrawings(target, [source]);
      expect(merged.strokes.map((s) => s.id)).toEqual(['t1', 's1', 's2']);
   });
});

describe('recomputeDrawingBoxWithout', () => {
   it('re-fits the box to the remaining strokes and re-bases them (the inverse of an up/left append)', () => {
      // The layer left by the up/left append above: origin (-5,-8), two strokes.
      const item = layer(-5, -8, [stroke('s1', [5, 8, 15, 18]), stroke('s2', [0, 0, 8, 11])]);
      const next = recomputeDrawingBoxWithout(item, 's2');
      expect(next).toEqual({ x: 0, y: 0, width: 10, height: 10, strokes: [stroke('s1', [0, 0, 10, 10])] });
   });

   it('leaves the box untouched when the removed stroke was inside the extent', () => {
      const item = layer(0, 0, [stroke('s1', [0, 0, 10, 10]), stroke('s2', [3, 3, 4, 4])]);
      const next = recomputeDrawingBoxWithout(item, 's2');
      expect(next).toEqual({ x: 0, y: 0, width: 10, height: 10, strokes: [stroke('s1', [0, 0, 10, 10])] });
   });
});
