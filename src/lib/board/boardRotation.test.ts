// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { isRotatableKind, normalizeAngle, pointerAngleDeg, rotateVec, rotatedResize, rotatedTopExtra, snapAngle } from './boardRotation';

// -- Type Imports --
import type { BoxRect } from './boardRotation';

/*
 * The pure rotation math: pointer-angle derivation, Shift-snap, angle normalization, the local<->world
 * vector rotation, and the rotated-resize corner pin. The gesture wiring (the cursor layer) is verified by
 * hand; these lock the arithmetic every path depends on.
 */

/** A box corner's world position under a center-origin rotation, for the corner-pin assertions. */
function topLeftWorld(rect: BoxRect, deg: number): { x: number; y: number } {
   const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
   const offset = rotateVec({ x: -rect.width / 2, y: -rect.height / 2 }, deg);
   return { x: center.x + offset.x, y: center.y + offset.y };
}

describe('isRotatableKind', () => {
   it('accepts only the free-form kinds', () => {
      expect(isRotatableKind('post-it')).toBe(true);
      expect(isRotatableKind('image')).toBe(true);
      expect(isRotatableKind('text')).toBe(true);
      expect(isRotatableKind('drawing')).toBe(true);
   });

   it('rejects the structured kinds', () => {
      for (const kind of ['card', 'tracker', 'note', 'zone', 'portal', 'character', 'connection', 'pin', 'journal'] as const) {
         expect(isRotatableKind(kind)).toBe(false);
      }
   });
});

describe('pointerAngleDeg', () => {
   it('reads 0 to the right and grows clockwise in the y-down frame', () => {
      expect(pointerAngleDeg(0, 0, 10, 0)).toBeCloseTo(0);
      expect(pointerAngleDeg(0, 0, 0, 10)).toBeCloseTo(90); // down = +90 (y-down, matching CSS rotate)
      expect(pointerAngleDeg(0, 0, 0, -10)).toBeCloseTo(-90); // up
      expect(pointerAngleDeg(0, 0, -10, 0)).toBeCloseTo(180);
   });

   it('is invariant to distance from the center (angle only)', () => {
      expect(pointerAngleDeg(5, 5, 5, 100)).toBeCloseTo(90);
      expect(pointerAngleDeg(5, 5, 5, 10)).toBeCloseTo(90);
   });
});

describe('snapAngle', () => {
   it('snaps to the nearest 15deg increment', () => {
      expect(snapAngle(7, 15)).toBe(0);
      expect(snapAngle(8, 15)).toBe(15);
      expect(snapAngle(52, 15)).toBe(45);
      expect(snapAngle(53, 15)).toBe(60);
   });

   it('snaps negative and past-wrap values consistently', () => {
      expect(Math.abs(snapAngle(-7, 15))).toBe(0);
      expect(snapAngle(-8, 15)).toBe(-15);
      expect(snapAngle(367, 15)).toBe(360);
   });
});

describe('normalizeAngle', () => {
   it('wraps into [0, 360)', () => {
      expect(normalizeAngle(0)).toBe(0);
      expect(normalizeAngle(45)).toBe(45);
      expect(normalizeAngle(360)).toBe(0);
      expect(normalizeAngle(370)).toBe(10);
      expect(normalizeAngle(-10)).toBe(350);
      expect(normalizeAngle(-370)).toBe(350);
      expect(normalizeAngle(720)).toBe(0);
   });
});

describe('rotateVec', () => {
   it('is identity at 0deg', () => {
      expect(rotateVec({ x: 3, y: 7 }, 0)).toEqual({ x: 3, y: 7 });
   });

   it('rotates 90deg (y-down: x-axis maps to +y)', () => {
      const r = rotateVec({ x: 1, y: 0 }, 90);
      expect(r.x).toBeCloseTo(0);
      expect(r.y).toBeCloseTo(1);
   });

   it('is inverted by the negative angle', () => {
      const v = { x: 12, y: -5 };
      const round = rotateVec(rotateVec(v, 41), -41);
      expect(round.x).toBeCloseTo(v.x);
      expect(round.y).toBeCloseTo(v.y);
   });
});

describe('rotatedTopExtra', () => {
   it('is zero when unrotated (0 / 180 deg)', () => {
      expect(rotatedTopExtra(100, 40, 0)).toBeCloseTo(0, 6);
      expect(rotatedTopExtra(100, 40, 180)).toBeCloseTo(0, 6);
   });

   it('rises to the width-driven extent at 90 deg', () => {
      // Rotated a quarter turn, the box's own width becomes its vertical extent: half-width minus half-height.
      expect(rotatedTopExtra(100, 40, 90)).toBeCloseTo(50 - 20, 6);
   });

   it('is symmetric in the rotation sign', () => {
      expect(rotatedTopExtra(100, 40, 30)).toBeCloseTo(rotatedTopExtra(100, 40, -30), 6);
   });
});

describe('rotatedResize', () => {
   const min = { width: 40, height: 40 };

   it('reduces to grow-from-top-left at 0deg (x/y fixed)', () => {
      const orig: BoxRect = { x: 10, y: 20, width: 100, height: 80 };
      const result = rotatedResize(orig, { x: 30, y: 25 }, 0, min);
      expect(result).toMatchObject({ x: 10, y: 20, width: 130, height: 105 });
   });

   it('grows along the box local axes for a nonzero angle', () => {
      const orig: BoxRect = { x: 10, y: 20, width: 100, height: 80 };
      const deg = 37;
      const delta = { x: 25, y: -12 };
      const result = rotatedResize(orig, delta, deg, min);
      const local = rotateVec(delta, -deg);
      expect(result.width).toBeCloseTo(orig.width + local.x);
      expect(result.height).toBeCloseTo(orig.height + local.y);
   });

   it('pins the opposite (top-left) corner in world space', () => {
      const orig: BoxRect = { x: 10, y: 20, width: 100, height: 80 };
      const deg = 37;
      const before = topLeftWorld(orig, deg);
      const after = topLeftWorld(rotatedResize(orig, { x: 25, y: -12 }, deg, min), deg);
      expect(after.x).toBeCloseTo(before.x);
      expect(after.y).toBeCloseTo(before.y);
   });

   it('floors each local axis at its minimum while keeping the corner pinned', () => {
      const orig: BoxRect = { x: 0, y: 0, width: 60, height: 60 };
      const deg = 20;
      // A large negative local drag collapses both axes onto the floor.
      const shrink = rotateVec({ x: -500, y: -500 }, deg);
      const result = rotatedResize(orig, shrink, deg, min);
      expect(result.width).toBe(40);
      expect(result.height).toBe(40);
      const before = topLeftWorld(orig, deg);
      const after = topLeftWorld(result, deg);
      expect(after.x).toBeCloseTo(before.x);
      expect(after.y).toBeCloseTo(before.y);
   });
});
