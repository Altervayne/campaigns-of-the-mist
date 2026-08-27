// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { annotationBounds, clampTranslation, denormalizePoints, denormalizeRect, filterVisibleAnnotations, groupAnnotationsByPage, isAnnotationVisible, listComments, pdfInkToStrokePaintInput, rectFromCorners, resizeHandleAtPoint, resizeHandlePositions, resizeRect, translatePoints, translateRect } from './annotationGeometry';

// -- Type Imports --
import type { PdfAnnotation, PdfComment, PdfHighlight, PdfInk, PdfTextHighlight } from '@/lib/types/pdfAnnotation';

const ink = (id: string, page: number, createdAt: number, extra?: Partial<PdfInk>): PdfInk => ({
   id,
   page,
   createdAt,
   kind: 'ink',
   color: '#ff0000',
   points: [0, 0, 1, 1],
   width: 0.01,
   ...extra,
});

describe('denormalizePoints', () => {
   it('scales even indices by width and odd by height', () => {
      expect(denormalizePoints([0, 0, 0.5, 0.25, 1, 1], 200, 400)).toEqual([0, 0, 100, 100, 200, 400]);
   });

   it('tolerates an empty list', () => {
      expect(denormalizePoints([], 200, 400)).toEqual([]);
   });
});

describe('denormalizeRect', () => {
   it('maps a normalized rect into box pixels', () => {
      expect(denormalizeRect({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, 200, 400)).toEqual({ x: 20, y: 80, w: 60, h: 160 });
   });
});

describe('rectFromCorners', () => {
   it('orders top-left to bottom-right', () => {
      expect(rectFromCorners(0.25, 0.5, 0.75, 1)).toEqual({ x: 0.25, y: 0.5, w: 0.5, h: 0.5 });
   });

   it('normalizes a drag started from any corner', () => {
      expect(rectFromCorners(0.75, 1, 0.25, 0.5)).toEqual({ x: 0.25, y: 0.5, w: 0.5, h: 0.5 });
      expect(rectFromCorners(0.75, 0.5, 0.25, 1)).toEqual({ x: 0.25, y: 0.5, w: 0.5, h: 0.5 });
   });

   it('yields a zero-size rect for a point', () => {
      expect(rectFromCorners(0.5, 0.5, 0.5, 0.5)).toEqual({ x: 0.5, y: 0.5, w: 0, h: 0 });
   });
});

describe('groupAnnotationsByPage', () => {
   it('returns an empty map for undefined', () => {
      expect(groupAnnotationsByPage(undefined).size).toBe(0);
   });

   it('buckets by page', () => {
      const map = groupAnnotationsByPage({ a: ink('a', 1, 1), b: ink('b', 3, 1), c: ink('c', 1, 2) });
      expect(map.get(1)?.map((x) => x.id)).toEqual(['a', 'c']);
      expect(map.get(3)?.map((x) => x.id)).toEqual(['b']);
      expect(map.has(2)).toBe(false);
   });

   it('sorts each bucket by createdAt ascending', () => {
      const map = groupAnnotationsByPage({ late: ink('late', 1, 30), early: ink('early', 1, 10), mid: ink('mid', 1, 20) });
      expect(map.get(1)?.map((x) => x.id)).toEqual(['early', 'mid', 'late']);
   });
});

describe('pdfInkToStrokePaintInput', () => {
   it('defaults the brush to pen, scales width by box width, denormalizes points', () => {
      const paint = pdfInkToStrokePaintInput(ink('a', 1, 1, { points: [0, 0, 1, 0.5], width: 0.02 }), 300, 600);
      expect(paint.brush).toBe('pen');
      expect(paint.color).toBe('#ff0000');
      expect(paint.width).toBe(6);
      expect(paint.points).toEqual([0, 0, 300, 300]);
      expect(paint.shape).toBeUndefined();
      expect(paint.filled).toBeUndefined();
   });

   it('carries a set brush through', () => {
      expect(pdfInkToStrokePaintInput(ink('a', 1, 1, { brush: 'highlighter' }), 100, 100).brush).toBe('highlighter');
   });
});

// A wider annotation set keeps the split-agnostic grouping honest across kinds.
const mixed: Record<string, PdfAnnotation> = {
   h: { id: 'h', page: 2, createdAt: 1, kind: 'highlight', color: '#00ff00', rect: { x: 0, y: 0, w: 0.5, h: 0.5 }, alpha: 0.3 },
   c: { id: 'c', page: 2, createdAt: 2, kind: 'comment', color: '#0000ff', rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, body: 'note' },
};

const comment = (id: string, page: number, x: number, y: number, body = 'note'): PdfComment => ({
   id,
   page,
   createdAt: 1,
   kind: 'comment',
   color: '#0000ff',
   rect: { x, y, w: 0.1, h: 0.1 },
   body,
});

describe('listComments', () => {
   it('returns an empty list for undefined', () => {
      expect(listComments(undefined)).toEqual([]);
   });

   it('filters out non-comment kinds', () => {
      const only = listComments({ i: ink('i', 1, 1), h: mixed.h, c: comment('c', 1, 0.2, 0.2) });
      expect(only.map((x) => x.id)).toEqual(['c']);
   });

   it('orders by page, then top-to-bottom, then left-to-right', () => {
      const ordered = listComments({
         p2: comment('p2', 2, 0.1, 0.1),
         low: comment('low', 1, 0.1, 0.6),
         topRight: comment('topRight', 1, 0.8, 0.2),
         topLeft: comment('topLeft', 1, 0.1, 0.2),
      });
      expect(ordered.map((x) => x.id)).toEqual(['topLeft', 'topRight', 'low', 'p2']);
   });
});

describe('groupAnnotationsByPage (mixed kinds)', () => {
   it('keeps all kinds in one page bucket, createdAt-ordered', () => {
      const map = groupAnnotationsByPage(mixed);
      expect(map.get(2)?.map((x) => x.id)).toEqual(['h', 'c']);
   });
});

describe('annotationBounds', () => {
   it('spans an ink polyline padded by half its stroke width', () => {
      const bounds = annotationBounds(ink('a', 1, 1, { points: [0.25, 0.5, 0.75, 0.5], width: 0.125 }));
      expect(bounds).toEqual({ x: 0.1875, y: 0.4375, w: 0.625, h: 0.125 });
   });

   it('pads a single-point ink into a width-square box', () => {
      const bounds = annotationBounds(ink('a', 1, 1, { points: [0.5, 0.5], width: 0.125 }));
      expect(bounds).toEqual({ x: 0.4375, y: 0.4375, w: 0.125, h: 0.125 });
   });

   it('returns a zero box for an empty ink', () => {
      expect(annotationBounds(ink('a', 1, 1, { points: [] }))).toEqual({ x: 0, y: 0, w: 0, h: 0 });
   });

   it('returns the rect for a highlight or comment', () => {
      expect(annotationBounds(mixed.h)).toEqual({ x: 0, y: 0, w: 0.5, h: 0.5 });
      expect(annotationBounds(mixed.c)).toEqual({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 });
   });

   it('spans the union of a text highlight’s quads', () => {
      const mark: PdfTextHighlight = {
         id: 'th',
         page: 1,
         createdAt: 1,
         kind: 'textHighlight',
         color: '#fde047',
         alpha: 0.35,
         text: 'two lines',
         quads: [
            { x: 0.25, y: 0.25, w: 0.25, h: 0.125 },
            { x: 0.5, y: 0.5, w: 0.25, h: 0.125 },
         ],
      };
      expect(annotationBounds(mark)).toEqual({ x: 0.25, y: 0.25, w: 0.5, h: 0.375 });
   });

   it('returns a zero box for a text highlight with no quads', () => {
      const mark: PdfTextHighlight = { id: 'th', page: 1, createdAt: 1, kind: 'textHighlight', color: '#fde047', alpha: 0.35, text: '', quads: [] };
      expect(annotationBounds(mark)).toEqual({ x: 0, y: 0, w: 0, h: 0 });
   });
});

describe('clampTranslation', () => {
   it('passes a delta through when the bounds stay on the page', () => {
      expect(clampTranslation({ x: 0.25, y: 0.25, w: 0.25, h: 0.25 }, 0.125, 0.125)).toEqual({ dx: 0.125, dy: 0.125 });
   });

   it('clamps to zero at the far edge', () => {
      expect(clampTranslation({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, 0.25, 0.25)).toEqual({ dx: 0, dy: 0 });
   });

   it('clamps to zero at the near edge', () => {
      expect(clampTranslation({ x: 0, y: 0, w: 0.5, h: 0.5 }, -0.25, -0.25)).toEqual({ dx: 0, dy: 0 });
   });

   it('caps a delta to the remaining room', () => {
      expect(clampTranslation({ x: 0.5, y: 0, w: 0.25, h: 0.25 }, 0.5, 0.5)).toEqual({ dx: 0.25, dy: 0.5 });
   });
});

describe('translatePoints', () => {
   it('shifts even indices by dx and odd by dy', () => {
      expect(translatePoints([0.25, 0.25, 0.5, 0.5], 0.125, 0.25)).toEqual([0.375, 0.5, 0.625, 0.75]);
   });
});

describe('translateRect', () => {
   it('shifts the origin and keeps the size', () => {
      expect(translateRect({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, 0.125, 0.125)).toEqual({ x: 0.375, y: 0.375, w: 0.5, h: 0.5 });
   });
});

describe('resizeHandlePositions', () => {
   // bounds {0.2,0.2,0.4,0.4} at 100x100 -> box {20,20,40,40}; padded by 4 -> left 16, right 64, top 16, bottom 64.
   const positions = resizeHandlePositions({ x: 0.2, y: 0.2, w: 0.4, h: 0.4 }, 100, 100);

   it('places corners on the padded box', () => {
      expect(positions.nw).toEqual({ x: 16, y: 16 });
      expect(positions.ne).toEqual({ x: 64, y: 16 });
      expect(positions.se).toEqual({ x: 64, y: 64 });
      expect(positions.sw).toEqual({ x: 16, y: 64 });
   });

   it('places edge handles at the unpadded midpoints', () => {
      expect(positions.n).toEqual({ x: 40, y: 16 });
      expect(positions.s).toEqual({ x: 40, y: 64 });
      expect(positions.e).toEqual({ x: 64, y: 40 });
      expect(positions.w).toEqual({ x: 16, y: 40 });
   });
});

describe('resizeHandleAtPoint', () => {
   const bounds = { x: 0.2, y: 0.2, w: 0.4, h: 0.4 };

   it('grabs the handle within tolerance', () => {
      expect(resizeHandleAtPoint(bounds, 100, 100, 17, 17, 10)).toBe('nw');
      expect(resizeHandleAtPoint(bounds, 100, 100, 40, 15, 10)).toBe('n');
   });

   it('takes the nearest of two nearby handles', () => {
      // Nudged toward ne (64,16) from the n midpoint (40,16); ne is closer.
      expect(resizeHandleAtPoint(bounds, 100, 100, 60, 18, 10)).toBe('ne');
   });

   it('returns null when no handle is within tolerance', () => {
      expect(resizeHandleAtPoint(bounds, 100, 100, 40, 40, 10)).toBeNull();
      expect(resizeHandleAtPoint(bounds, 100, 100, 500, 500, 10)).toBeNull();
   });
});

// Binary-exact fractions (multiples of 1/16) keep every product/difference exact for `toEqual`.
describe('resizeRect', () => {
   const min = { w: 0.0625, h: 0.0625 };
   const rect = { x: 0.25, y: 0.25, w: 0.25, h: 0.25 };

   it('grows the east edge', () => {
      expect(resizeRect(rect, 'e', 0.125, 0, min)).toEqual({ x: 0.25, y: 0.25, w: 0.375, h: 0.25 });
   });

   it('moves the west edge in', () => {
      expect(resizeRect(rect, 'w', 0.125, 0, min)).toEqual({ x: 0.375, y: 0.25, w: 0.125, h: 0.25 });
   });

   it('grows the south edge', () => {
      expect(resizeRect(rect, 's', 0, 0.125, min)).toEqual({ x: 0.25, y: 0.25, w: 0.25, h: 0.375 });
   });

   it('moves the north edge in', () => {
      expect(resizeRect(rect, 'n', 0, 0.125, min)).toEqual({ x: 0.25, y: 0.375, w: 0.25, h: 0.125 });
   });

   it('reshapes both edges from a corner', () => {
      expect(resizeRect(rect, 'se', 0.125, 0.125, min)).toEqual({ x: 0.25, y: 0.25, w: 0.375, h: 0.375 });
      expect(resizeRect(rect, 'nw', 0.125, 0.125, min)).toEqual({ x: 0.375, y: 0.375, w: 0.125, h: 0.125 });
   });

   it('leaves the fixed edges untouched (ne)', () => {
      expect(resizeRect(rect, 'ne', 0.125, -0.125, min)).toEqual({ x: 0.25, y: 0.125, w: 0.375, h: 0.375 });
   });

   it('flips cleanly when a west drag crosses the east edge', () => {
      // left 0.25 dragged +0.375 -> 0.625, past right 0.5; rect flips to the right of the old right edge.
      expect(resizeRect(rect, 'w', 0.375, 0, min)).toEqual({ x: 0.5, y: 0.25, w: 0.125, h: 0.25 });
   });

   it('holds the minimum width when collapsed toward the anchor', () => {
      // left dragged to 0.46875 (gap 0.03125 < min 0.0625) -> stops 0.0625 from the right edge.
      expect(resizeRect(rect, 'w', 0.21875, 0, min)).toEqual({ x: 0.4375, y: 0.25, w: 0.0625, h: 0.25 });
   });

   it('clamps the east edge to the page', () => {
      expect(resizeRect({ x: 0.5, y: 0.5, w: 0.25, h: 0.25 }, 'e', 0.5, 0, min)).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.25 });
   });

   it('clamps the west edge to the page without moving the anchor', () => {
      expect(resizeRect({ x: 0.25, y: 0.25, w: 0.25, h: 0.25 }, 'w', -0.5, 0, min)).toEqual({ x: 0, y: 0.25, w: 0.5, h: 0.25 });
   });
});

describe('isAnnotationVisible', () => {
   it('reads the flag matching the annotation kind', () => {
      const highlight = mixed.h as PdfHighlight;
      expect(isAnnotationVisible(highlight, { ink: true, highlight: false, comment: true, textHighlight: true })).toBe(false);
      expect(isAnnotationVisible(highlight, { ink: false, highlight: true, comment: false, textHighlight: false })).toBe(true);
   });
});

describe('filterVisibleAnnotations', () => {
   const all: Record<string, PdfAnnotation> = { i: ink('i', 1, 1), h: mixed.h, c: mixed.c };

   it('drops the hidden kind and keeps the visible ones', () => {
      const kept = filterVisibleAnnotations(all, { ink: false, highlight: true, comment: true, textHighlight: true });
      expect(Object.keys(kept ?? {})).toEqual(['h', 'c']);
   });

   it('drops everything when all kinds are hidden', () => {
      expect(filterVisibleAnnotations(all, { ink: false, highlight: false, comment: false, textHighlight: false })).toEqual({});
   });

   it('keeps everything when all kinds are visible', () => {
      const kept = filterVisibleAnnotations(all, { ink: true, highlight: true, comment: true, textHighlight: true });
      expect(Object.keys(kept ?? {})).toEqual(['i', 'h', 'c']);
   });

   it('passes an absent map through untouched', () => {
      expect(filterVisibleAnnotations(undefined, { ink: true, highlight: true, comment: true, textHighlight: true })).toBeUndefined();
   });
});
