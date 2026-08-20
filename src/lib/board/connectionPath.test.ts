// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { bezierControlPoints, connectionMidpoint, connectionPath, draggedControlOffset } from './connectionPath';

// -- Type Imports --
import type { Point } from './boardConnections';

/*
 * Tests for the connection routing math: the SVG `d` of each of the four path types, and the
 * on-path midpoint + tangent (straight must reduce to the geometric midpoint; curves land on the curve).
 */

describe('connectionPath', () => {
   it('straight is an edge-to-edge line', () => {
      expect(connectionPath('straight', { x: 0, y: 0 }, { x: 200, y: 0 })).toBe('M 0 0 L 200 0');
   });

   it('orthogonal routes horizontal-first when |dx| >= |dy| (double elbow through the mid-x)', () => {
      // dx=200, dy=100 -> horizontal first; corners at x = 100 (the chord mid-x).
      expect(connectionPath('orthogonal', { x: 0, y: 0 }, { x: 200, y: 100 })).toBe('M 0 0 L 100 0 L 100 100 L 200 100');
   });

   it('orthogonal routes vertical-first when |dy| > |dx| (double elbow through the mid-y)', () => {
      // dx=100, dy=200 -> vertical first; corners at y = 100 (the chord mid-y).
      expect(connectionPath('orthogonal', { x: 0, y: 0 }, { x: 100, y: 200 })).toBe('M 0 0 L 0 100 L 100 100 L 100 200');
   });

   it('circle is a quadratic whose control sits perpendicular to the chord at its midpoint', () => {
      // Horizontal chord (len 200); perpendicular offset = 200 * 0.2 = 40, so the control is at (100, 40).
      expect(connectionPath('circle', { x: 0, y: 0 }, { x: 200, y: 0 })).toBe('M 0 0 Q 100 40 200 0');
   });

   it('bezier auto-places two cubic controls bowed off the chord (a gentle arc)', () => {
      // dx=200: each control 50 along the chord + a perpendicular bow of 200 * 0.15 = 30, same side.
      expect(connectionPath('bezier', { x: 0, y: 0 }, { x: 200, y: 0 })).toBe('M 0 0 C 50 30 150 30 200 0');
   });

   it('bezier uses stored controls as offsets from their endpoints when present', () => {
      const controls = { c1: { x: 10, y: -20 }, c2: { x: -10, y: -20 } };
      // c1 = from + c1 = (10,-20); c2 = to + c2 = (190,-20).
      expect(connectionPath('bezier', { x: 0, y: 0 }, { x: 200, y: 0 }, controls)).toBe('M 0 0 C 10 -20 190 -20 200 0');
   });
});

describe('connectionMidpoint', () => {
   const isUnit = (v: Point) => expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);

   it('straight reduces to the geometric midpoint and the chord direction', () => {
      const { point, tangent } = connectionMidpoint('straight', { x: 0, y: 0 }, { x: 200, y: 0 });
      expect(point).toEqual({ x: 100, y: 0 }); // == (from + to) / 2
      expect(tangent).toEqual({ x: 1, y: 0 });
   });

   it('orthogonal midpoint is the chord center, tangent along the middle segment', () => {
      // Horizontal-first: the middle elbow-to-elbow segment is vertical.
      const { point, tangent } = connectionMidpoint('orthogonal', { x: 0, y: 0 }, { x: 200, y: 100 });
      expect(point).toEqual({ x: 100, y: 50 });
      expect(tangent).toEqual({ x: 0, y: 1 });
   });

   it('circle midpoint lands on the arc (offset toward the bow), tangent parallel to the chord', () => {
      const { point, tangent } = connectionMidpoint('circle', { x: 0, y: 0 }, { x: 200, y: 0 });
      // Quadratic B(0.5) = 0.25*P0 + 0.5*ctrl + 0.25*P2; ctrl=(100,40) -> (100,20), half the sagitta.
      expect(point).toEqual({ x: 100, y: 20 });
      expect(tangent).toEqual({ x: 1, y: 0 });
      isUnit(tangent);
   });

   it('bezier auto midpoint lands on the bowed cubic with a chord-parallel tangent', () => {
      const { point, tangent } = connectionMidpoint('bezier', { x: 0, y: 0 }, { x: 200, y: 0 });
      expect(point).toEqual({ x: 100, y: 22.5 });
      expect(tangent).toEqual({ x: 1, y: 0 });
      isUnit(tangent);
   });

   it('bezier midpoint follows stored controls off the chord', () => {
      const controls = { c1: { x: 40, y: -60 }, c2: { x: -40, y: -60 } };
      const { point, tangent } = connectionMidpoint('bezier', { x: 0, y: 0 }, { x: 200, y: 0 }, controls);
      // Symmetric hump above the chord: the midpoint sits at x=100, y<0.
      expect(point.x).toBeCloseTo(100);
      expect(point.y).toBeLessThan(0);
      isUnit(tangent);
   });
});

describe('bezierControlPoints', () => {
   it('turns stored offsets into world control points', () => {
      const controls = { c1: { x: 10, y: -20 }, c2: { x: -10, y: -20 } };
      // c1 = from + c1; c2 = to + c2.
      expect(bezierControlPoints({ x: 0, y: 0 }, { x: 200, y: 0 }, controls)).toEqual({
         c1: { x: 10, y: -20 },
         c2: { x: 190, y: -20 },
      });
   });

   it('auto-places the two controls when absent, matching the rendered curve', () => {
      // Same points connectionPath bakes into `M 0 0 C 50 30 150 30 200 0`.
      expect(bezierControlPoints({ x: 0, y: 0 }, { x: 200, y: 0 })).toEqual({
         c1: { x: 50, y: 30 },
         c2: { x: 150, y: 30 },
      });
   });
});

describe('draggedControlOffset', () => {
   it('converts a screen drag to a new offset from c1 endpoint (from)', () => {
      // Screen delta (20,40) at zoom 2 -> world (10,20); start world (50,30) -> (60,50); offset from (0,0).
      expect(draggedControlOffset({ x: 50, y: 30 }, { x: 0, y: 0 }, { x: 20, y: 40 }, 2)).toEqual({ x: 60, y: 50 });
   });

   it('re-expresses c2 relative to its endpoint (to)', () => {
      // Screen delta (-40,-40) at zoom 2 -> world (-20,-20); start (150,30) -> (130,10); offset from (200,0).
      expect(draggedControlOffset({ x: 150, y: 30 }, { x: 200, y: 0 }, { x: -40, y: -40 }, 2)).toEqual({ x: -70, y: 10 });
   });
});
