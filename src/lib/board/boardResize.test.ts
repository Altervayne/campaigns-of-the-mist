// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { MIN_ITEM_SIZE, aspectResize, computeResize, effectiveHeight, fitContentHeight, fitContentWidth, shouldSyncMeasuredHeight, shouldSyncMeasuredSize } from './boardResize';

/*
 * Resize math: the bottom-right grip grows width/height with x/y pinned, and a min-height item
 * (its content height passed as the floor) can be dragged taller but never shorter than content.
 */

const orig = { x: 10, y: 20, width: 200, height: 150 };

describe('computeResize', () => {
   it('grows width and height by the delta, leaving x/y fixed', () => {
      expect(computeResize(orig, { x: 40, y: 30 })).toEqual({ x: 10, y: 20, width: 240, height: 180 });
   });

   it('floors width and height at MIN_ITEM_SIZE for an ordinary item', () => {
      const result = computeResize(orig, { x: -1000, y: -1000 });
      expect(result.width).toBe(MIN_ITEM_SIZE);
      expect(result.height).toBe(MIN_ITEM_SIZE);
   });

   it('clamps height to the content floor: a min-height item cannot be dragged shorter than its content', () => {
      const contentHeight = 130;
      // A big negative vertical drag stops at the content height, not at MIN_ITEM_SIZE.
      const result = computeResize(orig, { x: 0, y: -1000 }, { height: contentHeight });
      expect(result.height).toBe(contentHeight);
   });

   it('lets a min-height item be dragged taller than its content', () => {
      const result = computeResize(orig, { x: 0, y: 90 }, { height: 130 });
      expect(result.height).toBe(240); // 150 + 90, above the floor
   });

   it('clamps width to a custom floor (a zone cannot shrink below its member extent)', () => {
      const result = computeResize(orig, { x: -1000, y: -1000 }, { width: 160, height: 120 });
      expect(result.width).toBe(160);
      expect(result.height).toBe(120);
   });

   it('still floors the other axis at MIN_ITEM_SIZE when only one is given', () => {
      const result = computeResize(orig, { x: -1000, y: -1000 }, { width: 160 });
      expect(result.width).toBe(160);
      expect(result.height).toBe(MIN_ITEM_SIZE);
   });

   it('locks to the aspect: a horizontal drag drives width, height follows', () => {
      const poster = { x: 0, y: 0, width: 200, height: 100 }; // already at aspect 2
      expect(computeResize(poster, { x: 40, y: 0 }, {}, 2)).toMatchObject({ x: 0, y: 0, width: 240, height: 120 });
   });

   it('aspect-lock follows whichever axis is dragged furthest', () => {
      const poster = { x: 0, y: 0, width: 200, height: 100 };
      // A big DOWN drag drives the size even though width did not move (height*aspect wins).
      expect(computeResize(poster, { x: 0, y: 60 }, {}, 2)).toMatchObject({ width: 320, height: 160 });
   });

   it('aspect-lock scales up so neither axis drops below its floor, ratio preserved', () => {
      const poster = { x: 0, y: 0, width: 200, height: 100 };
      // Shrink hard at aspect 0.5 (portrait) against a {56,32} floor: the 56 width floor forces height to
      // 112 to hold the ratio, which clears the 32 height floor.
      const result = computeResize(poster, { x: -1000, y: -1000 }, { width: 56, height: 32 }, 0.5);
      expect(result.width).toBe(56);
      expect(result.height).toBe(112);
      expect(result.width / result.height).toBeCloseTo(0.5);
   });
});

describe('aspectResize', () => {
   it('keeps the width and derives the height from the ratio', () => {
      expect(aspectResize(400, 1)).toEqual({ width: 400, height: 400 });
      expect(aspectResize(400, 4 / 3)).toEqual({ width: 400, height: 300 });
      expect(aspectResize(320, 16 / 9)).toEqual({ width: 320, height: 180 });
   });

   it('rounds the derived height', () => {
      expect(aspectResize(400, 3 / 2)).toEqual({ width: 400, height: 267 });
   });

   it('floors both axes at MIN_ITEM_SIZE', () => {
      expect(aspectResize(10, 1)).toEqual({ width: MIN_ITEM_SIZE, height: MIN_ITEM_SIZE });
      // A wide-but-short ratio at a small width clamps the height at the floor.
      expect(aspectResize(60, 16 / 9)).toEqual({ width: 60, height: MIN_ITEM_SIZE });
   });
});

describe('effectiveHeight', () => {
   it('renders at the content height when content exceeds the stored height (auto-grow floor)', () => {
      expect(effectiveHeight(150, 220)).toBe(220);
   });

   it('keeps the larger stored height when the user dragged it taller than the content', () => {
      expect(effectiveHeight(300, 220)).toBe(300);
   });
});

describe('shouldSyncMeasuredHeight', () => {
   it('fit-content tracks the content exactly: it syncs when content GROWS', () => {
      expect(shouldSyncMeasuredHeight('fit', 260, 132)).toBe(true);
   });

   it('fit-content tracks the content exactly: it syncs when content SHRINKS (removing a card)', () => {
      expect(shouldSyncMeasuredHeight('fit', 132, 260)).toBe(true);
   });

   it('fit-content does not thrash within the epsilon', () => {
      expect(shouldSyncMeasuredHeight('fit', 200, 200)).toBe(false);
      expect(shouldSyncMeasuredHeight('fit', 200.5, 200)).toBe(false); // sub-epsilon jitter
      expect(shouldSyncMeasuredHeight('fit', 202, 200)).toBe(true);    // beyond epsilon
   });

   it('min-height grows but never shrinks (the dice tray keeps the user size)', () => {
      expect(shouldSyncMeasuredHeight('min', 260, 132)).toBe(true);  // content overflows -> grow
      expect(shouldSyncMeasuredHeight('min', 132, 260)).toBe(false); // content smaller -> stay (no shrink)
   });
});

describe('fitContentHeight', () => {
   it('renders at the measured content height', () => {
      expect(fitContentHeight(132, 260)).toBe(260);
      expect(fitContentHeight(300, 180)).toBe(180); // shrinks below the stored height too
   });

   it('falls back to the stored height until the content is measured', () => {
      expect(fitContentHeight(132, 0)).toBe(132);
   });
});

describe('shouldSyncMeasuredSize (width axis: a card toggling flip <-> side-by-side)', () => {
   it('syncs when the card widens (flip -> two faces side by side)', () => {
      expect(shouldSyncMeasuredSize('fit', 504, 250)).toBe(true);
   });

   it('syncs when the card narrows back (side-by-side -> one face)', () => {
      expect(shouldSyncMeasuredSize('fit', 250, 504)).toBe(true);
   });

   it('does not thrash within the epsilon once converged', () => {
      expect(shouldSyncMeasuredSize('fit', 504, 504)).toBe(false);
      expect(shouldSyncMeasuredSize('fit', 504.5, 504)).toBe(false);
      expect(shouldSyncMeasuredSize('fit', 506, 504)).toBe(true);
   });

   it('is the same function the height alias points at', () => {
      expect(shouldSyncMeasuredHeight).toBe(shouldSyncMeasuredSize);
   });
});

describe('fitContentWidth', () => {
   it('renders at the measured content width (grows AND shrinks)', () => {
      expect(fitContentWidth(250, 504)).toBe(504);
      expect(fitContentWidth(504, 250)).toBe(250);
   });

   it('falls back to the stored width until the content is measured', () => {
      expect(fitContentWidth(250, 0)).toBe(250);
   });
});
