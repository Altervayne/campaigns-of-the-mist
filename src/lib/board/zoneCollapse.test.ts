// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { collapsedBarRect, isConnectionCollapsedAway, resolveEndpointAnchor } from './zoneCollapse';
import { COLLAPSED_BAR_WIDTH, COLLAPSED_BAR_HEIGHT } from './zoneHeader';

// -- Type Imports --
import type { BoardItem } from '@/lib/types/board';

/*
 * Tests for the collapsed-zone connection re-anchor: a hidden member resolves to its collapsed
 * zone's bar; an unrelated/expanded item resolves to itself; a line between two members of the same
 * collapsed zone is hidden. All render-only - no data changes here.
 */

const zoneCollapsed: BoardItem = { id: 'Z', kind: 'zone', x: 100, y: 100, width: 400, height: 300, z: 0, content: { kind: 'zone', collapsed: true } };
const zoneOpen: BoardItem = { id: 'O', kind: 'zone', x: 0, y: 0, width: 400, height: 300, z: 0, content: { kind: 'zone', collapsed: false } };
const memberOfCollapsed: BoardItem = { id: 'm1', kind: 'post-it', x: 150, y: 150, width: 50, height: 50, z: 1, zoneId: 'Z', content: { kind: 'post-it', mode: 'copy', data: { id: 'n9', text: 'a' } } };
const memberOfCollapsed2: BoardItem = { id: 'm2', kind: 'post-it', x: 300, y: 200, width: 50, height: 50, z: 2, zoneId: 'Z', content: { kind: 'post-it', mode: 'copy', data: { id: 'n10', text: 'b' } } };
const memberOfOpen: BoardItem = { id: 'o1', kind: 'post-it', x: 50, y: 50, width: 50, height: 50, z: 1, zoneId: 'O', content: { kind: 'post-it', mode: 'copy', data: { id: 'n11', text: 'c' } } };
const outsider: BoardItem = { id: 'out', kind: 'post-it', x: 900, y: 900, width: 50, height: 50, z: 1, content: { kind: 'post-it', mode: 'copy', data: { id: 'n12', text: 'd' } } };

const items: Record<string, BoardItem> = { Z: zoneCollapsed, O: zoneOpen, m1: memberOfCollapsed, m2: memberOfCollapsed2, o1: memberOfOpen, out: outsider };
const collapsed = new Set(['Z']);

describe('collapsedBarRect', () => {
   it('is a fixed-size bar at the zone origin (bounds untouched)', () => {
      expect(collapsedBarRect(zoneCollapsed)).toEqual({ x: 100, y: 100, width: COLLAPSED_BAR_WIDTH, height: COLLAPSED_BAR_HEIGHT });
   });

   it('scales the bar height by the zone title scale (width fixed)', () => {
      const scaled: BoardItem = { ...zoneCollapsed, content: { kind: 'zone', collapsed: true, titleScale: 2 } };
      expect(collapsedBarRect(scaled)).toEqual({ x: 100, y: 100, width: COLLAPSED_BAR_WIDTH, height: COLLAPSED_BAR_HEIGHT * 2 });
   });
});

describe('resolveEndpointAnchor', () => {
   const cases: { name: string; item: BoardItem; anchorId: string; isBar: boolean }[] = [
      { name: 'a hidden member resolves to its collapsed zone (bar)', item: memberOfCollapsed, anchorId: 'Z', isBar: true },
      { name: 'the collapsed zone item itself resolves to its own bar', item: zoneCollapsed, anchorId: 'Z', isBar: true },
      { name: 'a member of an EXPANDED zone resolves to itself', item: memberOfOpen, anchorId: 'o1', isBar: false },
      { name: 'an item in no zone resolves to itself', item: outsider, anchorId: 'out', isBar: false },
   ];
   for (const c of cases) {
      it(c.name, () => {
         const { anchor, isBar } = resolveEndpointAnchor(c.item, items, collapsed);
         expect(anchor.id).toBe(c.anchorId);
         expect(isBar).toBe(c.isBar);
      });
   }
});

describe('isConnectionCollapsedAway', () => {
   it('hides a line between two members of the SAME collapsed zone', () => {
      expect(isConnectionCollapsedAway(memberOfCollapsed, memberOfCollapsed2, items, collapsed)).toBe(true);
   });

   it('hides a line between a member and its own collapsed zone', () => {
      expect(isConnectionCollapsedAway(memberOfCollapsed, zoneCollapsed, items, collapsed)).toBe(true);
   });

   it('keeps a line from a hidden member to an outside item (re-anchors, not hidden)', () => {
      expect(isConnectionCollapsedAway(memberOfCollapsed, outsider, items, collapsed)).toBe(false);
   });

   it('keeps a line between two items of an expanded zone', () => {
      expect(isConnectionCollapsedAway(memberOfOpen, outsider, items, collapsed)).toBe(false);
   });
});
