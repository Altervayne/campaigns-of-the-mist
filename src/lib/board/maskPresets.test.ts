// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { MASK_PRESETS, getMaskPreset } from './maskPresets';

/*
 * The mask registry is pure data (path strings + viewBoxes), so it is fully unit-testable.
 * These guard the invariants the bake and the stored `maskId` rely on: unique stable ids,
 * non-empty paths, and positive viewBoxes.
 */

describe('MASK_PRESETS', () => {
   it('ships the v1 set', () => {
      expect(MASK_PRESETS.length).toBeGreaterThanOrEqual(5);
   });

   it('has unique ids', () => {
      const ids = MASK_PRESETS.map((mask) => mask.id);
      expect(new Set(ids).size).toBe(ids.length);
   });

   it('has a non-empty path and label key for every mask', () => {
      for (const mask of MASK_PRESETS) {
         expect(mask.path.length).toBeGreaterThan(0);
         expect(mask.path.trim().startsWith('M')).toBe(true);
         expect(mask.labelKey.length).toBeGreaterThan(0);
      }
   });

   it('has a positive viewBox for every mask', () => {
      for (const mask of MASK_PRESETS) {
         expect(mask.viewBox.width).toBeGreaterThan(0);
         expect(mask.viewBox.height).toBeGreaterThan(0);
      }
   });
});

describe('getMaskPreset', () => {
   it('resolves a known id', () => {
      const first = MASK_PRESETS[0];
      expect(getMaskPreset(first.id)).toBe(first);
   });

   it('returns undefined for an unknown id', () => {
      expect(getMaskPreset('no-such-mask')).toBeUndefined();
   });
});
