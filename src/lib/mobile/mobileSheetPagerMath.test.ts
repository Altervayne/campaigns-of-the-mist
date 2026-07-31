// -- Testing Imports --
import { describe, expect, it } from 'vitest';

// -- Unit Under Test --
import {
   PAGER_FLICK_VELOCITY,
   PAGER_RUBBER_BAND,
   PAGER_SETTLE_DISTANCE,
   isHorizontalPagerDrag,
   isVerticalPagerDrag,
   resolvePageTrackOffset,
   resolvePagerDragOffset,
   resolvePagerSettle,
} from './mobileSheetPagerMath';

describe('mobileSheetPagerMath — axis gate', () => {
   it('claims a clearly-horizontal drag', () => {
      expect(isHorizontalPagerDrag(40, 5)).toBe(true);
      expect(isVerticalPagerDrag(40, 5)).toBe(false);
   });

   it('yields a clearly-vertical drag to native scroll', () => {
      expect(isHorizontalPagerDrag(5, 40)).toBe(false);
      expect(isVerticalPagerDrag(5, 40)).toBe(true);
   });

   it('claims neither until past the activation distance', () => {
      expect(isHorizontalPagerDrag(6, 1)).toBe(false);
      expect(isVerticalPagerDrag(1, 6)).toBe(false);
   });

   it('treats a diagonal drag as vertical (dominance not met)', () => {
      expect(isHorizontalPagerDrag(30, 25)).toBe(false);
      expect(isVerticalPagerDrag(30, 25)).toBe(true);
   });
});

describe('mobileSheetPagerMath — settle resolver', () => {
   it('advances a page on a distance-threshold drag', () => {
      expect(resolvePagerSettle({ currentPage: 1, deltaX: -PAGER_SETTLE_DISTANCE, velocity: 0, lastPage: 4 })).toBe(2);
      expect(resolvePagerSettle({ currentPage: 1, deltaX: PAGER_SETTLE_DISTANCE, velocity: 0, lastPage: 4 })).toBe(0);
   });

   it('advances a page on a fast flick under the distance threshold', () => {
      expect(resolvePagerSettle({ currentPage: 2, deltaX: -10, velocity: -PAGER_FLICK_VELOCITY, lastPage: 4 })).toBe(3);
      expect(resolvePagerSettle({ currentPage: 2, deltaX: 10, velocity: PAGER_FLICK_VELOCITY, lastPage: 4 })).toBe(1);
   });

   it('snaps back on a short, slow drag', () => {
      expect(resolvePagerSettle({ currentPage: 2, deltaX: -10, velocity: -0.05, lastPage: 4 })).toBe(2);
   });

   it('clamps at both ends', () => {
      expect(resolvePagerSettle({ currentPage: 0, deltaX: 200, velocity: 2, lastPage: 4 })).toBe(0);
      expect(resolvePagerSettle({ currentPage: 4, deltaX: -200, velocity: -2, lastPage: 4 })).toBe(4);
   });
});

describe('mobileSheetPagerMath — drag offset', () => {
   it('tracks the finger 1:1 in-range', () => {
      expect(resolvePagerDragOffset({ baseX: -200, deltaX: -60, startPage: 1, lastPage: 4 })).toBe(-260);
   });

   it('rubber-bands past the first page (dragging back)', () => {
      expect(resolvePagerDragOffset({ baseX: 0, deltaX: 100, startPage: 0, lastPage: 4 })).toBe(100 * PAGER_RUBBER_BAND);
   });

   it('rubber-bands past the last page (dragging forward)', () => {
      const baseX = -4 * 300;
      expect(resolvePagerDragOffset({ baseX, deltaX: -100, startPage: 4, lastPage: 4 })).toBe(baseX + -100 * PAGER_RUBBER_BAND);
   });
});

describe('mobileSheetPagerMath — page track offset', () => {
   it('resolves the resting offset for a page from the live width', () => {
      expect(resolvePageTrackOffset({ page: 1, liveWidth: 375, fallbackWidth: 0 })).toBe(-375);
      expect(resolvePageTrackOffset({ page: 0, liveWidth: 375, fallbackWidth: 375 })).toBe(0);
   });

   it('prefers the live width over a stale fallback (the lag-fix invariant)', () => {
      // A stale/zero cache must never win: a jump resolved against the live pitch, not the cache.
      expect(resolvePageTrackOffset({ page: 2, liveWidth: 375, fallbackWidth: 0 })).toBe(-750);
      expect(resolvePageTrackOffset({ page: 2, liveWidth: 411, fallbackWidth: 375 })).toBe(-822);
   });

   it('falls back to the cached width when no live width is available', () => {
      expect(resolvePageTrackOffset({ page: 1, liveWidth: 0, fallbackWidth: 375 })).toBe(-375);
   });

   it('defers (null) when the pitch is not yet measurable', () => {
      expect(resolvePageTrackOffset({ page: 1, liveWidth: 0, fallbackWidth: 0 })).toBeNull();
   });
});
