// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import {
   clampZoneTitleScale,
   COLLAPSED_BAR_HEIGHT,
   MAX_ZONE_TITLE_SCALE,
   MIN_ZONE_TITLE_SCALE,
   ZONE_TITLE_BAR_HEIGHT,
   ZONE_TITLE_FONT_SIZE,
   zoneCollapsedBarHeight,
   zoneTitleBarHeight,
   zoneTitleFontSize,
   zoneTitleScale,
} from './zoneHeader';

// -- Type Imports --
import type { ZoneBoardContent } from '@/lib/types/board';

const zone = (titleScale?: number): ZoneBoardContent => ({ kind: 'zone', collapsed: false, titleScale });

describe('clampZoneTitleScale', () => {
   it('clamps below the floor and above the ceiling', () => {
      expect(clampZoneTitleScale(0.2)).toBe(MIN_ZONE_TITLE_SCALE);
      expect(clampZoneTitleScale(99)).toBe(MAX_ZONE_TITLE_SCALE);
   });

   it('passes an in-range value through', () => {
      expect(clampZoneTitleScale(1.75)).toBe(1.75);
   });
});

describe('zoneTitleScale', () => {
   it('reads absent as the default scale (existing zones unchanged)', () => {
      expect(zoneTitleScale(zone(undefined))).toBe(1);
   });

   it('clamps a stored out-of-range scale', () => {
      expect(zoneTitleScale(zone(10))).toBe(MAX_ZONE_TITLE_SCALE);
   });
});

describe('height + font helpers', () => {
   it('use the base values at the default scale', () => {
      expect(zoneTitleBarHeight(zone(undefined))).toBe(ZONE_TITLE_BAR_HEIGHT);
      expect(zoneCollapsedBarHeight(zone(undefined))).toBe(COLLAPSED_BAR_HEIGHT);
      expect(zoneTitleFontSize(zone(undefined))).toBe(ZONE_TITLE_FONT_SIZE);
   });

   it('scale the base values by the title scale', () => {
      expect(zoneTitleBarHeight(zone(2))).toBe(ZONE_TITLE_BAR_HEIGHT * 2);
      expect(zoneCollapsedBarHeight(zone(2))).toBe(COLLAPSED_BAR_HEIGHT * 2);
      expect(zoneTitleFontSize(zone(2))).toBe(ZONE_TITLE_FONT_SIZE * 2);
   });
});
