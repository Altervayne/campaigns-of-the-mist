// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { annotationAtPoint, pointToSegmentDistance } from './annotationHitTest';

// -- Type Imports --
import type { PdfAnnotation } from '@/lib/types/pdfAnnotation';

describe('pointToSegmentDistance', () => {
   it('measures the perpendicular drop onto the segment', () => {
      expect(pointToSegmentDistance(5, 3, 0, 0, 10, 0)).toBe(3);
   });

   it('clamps past an endpoint to the endpoint distance', () => {
      expect(pointToSegmentDistance(-4, 0, 0, 0, 10, 0)).toBe(4);
   });

   it('reads a zero-length segment as its endpoint', () => {
      expect(pointToSegmentDistance(5, 6, 2, 2, 2, 2)).toBe(5);
   });
});

const BOX_W = 200;
const BOX_H = 400;

// An ink along the box's top edge; width 0.02 -> 4px band over a 200px box, so reach floors at 8.
const ink: PdfAnnotation = { id: 'ink', page: 1, createdAt: 1, kind: 'ink', color: '#e11d48', width: 0.02, points: [0, 0, 1, 0] };
const highlight: PdfAnnotation = { id: 'hl', page: 1, createdAt: 2, kind: 'highlight', color: '#22cc55', rect: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, alpha: 0.3 };

describe('annotationAtPoint', () => {
   it('hits an ink within its grab band', () => {
      // (100,0) sits on the polyline; well inside the floored reach.
      expect(annotationAtPoint([ink], 100, 0, BOX_W, BOX_H, 8)).toEqual(['ink']);
   });

   it('misses an ink beyond its reach', () => {
      // 20px below the top edge, past the 8px floor.
      expect(annotationAtPoint([ink], 100, 20, BOX_W, BOX_H, 8)).toEqual([]);
   });

   it('hits a highlight when the point is inside its rect', () => {
      // Rect spans x 50..150, y 100..300 in box px; (100,200) is centered.
      expect(annotationAtPoint([highlight], 100, 200, BOX_W, BOX_H, 8)).toEqual(['hl']);
   });

   it('misses a highlight outside its rect', () => {
      expect(annotationAtPoint([highlight], 10, 10, BOX_W, BOX_H, 8)).toEqual([]);
   });

   it('returns overlapping ids topmost-first', () => {
      // A highlight covering the top edge overlaps the ink; the later-painted highlight comes first.
      const cover: PdfAnnotation = { id: 'cover', page: 1, createdAt: 3, kind: 'highlight', color: '#000000', rect: { x: 0, y: 0, w: 1, h: 0.5 }, alpha: 0.2 };
      expect(annotationAtPoint([ink, cover], 100, 0, BOX_W, BOX_H, 8)).toEqual(['cover', 'ink']);
   });
});
