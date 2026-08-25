// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { annotationBounds, clampTranslation, denormalizePoints, denormalizeRect, groupAnnotationsByPage, pdfInkToStrokePaintInput, rectFromCorners, translatePoints, translateRect } from './annotationGeometry';

// -- Type Imports --
import type { PdfAnnotation, PdfInk } from '@/lib/types/pdfAnnotation';

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
