// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { effectiveSnapRect } from './snapTargets';
import { EXPANDED_CARD_SIZE } from './embedDrawerItem';
import { COLLAPSED_BAR_WIDTH, COLLAPSED_BAR_HEIGHT } from './zoneCollapse';
import type { BoardItem } from '@/lib/types/board';

/*
 * The rect snapping treats an item as occupying. Most kinds are their stored rect; an expanded card copy and
 * a collapsed zone render at a fixed footprint their stored size never tracks, so snapping must use that.
 */
function item(over: Partial<BoardItem> & Pick<BoardItem, 'id' | 'kind'>): BoardItem {
   return { x: 0, y: 0, width: 10, height: 10, z: 0, content: {}, ...over } as BoardItem;
}

describe('effectiveSnapRect', () => {
   it('returns the stored rect for a plain kind', () => {
      const it0 = item({ id: 'a', kind: 'post-it', x: 30, y: 40, width: 120, height: 80 });
      expect(effectiveSnapRect(it0)).toEqual({ x: 30, y: 40, width: 120, height: 80 });
   });

   it('uses the fixed sheet footprint for an expanded card copy (not the stored card size)', () => {
      const card = item({
         id: 'b',
         kind: 'card',
         x: 200,
         y: 100,
         width: 250,
         height: 600,
         content: { kind: 'card', mode: 'copy', data: { expanded: true } },
      });
      expect(effectiveSnapRect(card)).toEqual({ x: 200, y: 100, width: EXPANDED_CARD_SIZE.width, height: EXPANDED_CARD_SIZE.height });
   });

   it('keeps the stored rect for a collapsed card copy', () => {
      const card = item({
         id: 'c',
         kind: 'card',
         x: 200,
         y: 100,
         width: 250,
         height: 600,
         content: { kind: 'card', mode: 'copy', data: { expanded: false } },
      });
      expect(effectiveSnapRect(card)).toEqual({ x: 200, y: 100, width: 250, height: 600 });
   });

   it('uses the collapsed bar footprint for a collapsed zone', () => {
      const zone = item({
         id: 'd',
         kind: 'zone',
         x: 10,
         y: 20,
         width: 400,
         height: 300,
         content: { kind: 'zone', collapsed: true },
      });
      expect(effectiveSnapRect(zone)).toEqual({ x: 10, y: 20, width: COLLAPSED_BAR_WIDTH, height: COLLAPSED_BAR_HEIGHT });
   });

   it('keeps the stored extent for an expanded zone', () => {
      const zone = item({
         id: 'e',
         kind: 'zone',
         x: 10,
         y: 20,
         width: 400,
         height: 300,
         content: { kind: 'zone', collapsed: false },
      });
      expect(effectiveSnapRect(zone)).toEqual({ x: 10, y: 20, width: 400, height: 300 });
   });
});
