// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { connectionsZIndex, groupToolbarZIndex, itemZIndex } from './boardLayering';

/*
 * The board's z-index bands. The point is that the bands are disjoint by construction, so a selected
 * item ALWAYS layers above the connection layer and above every unselected item, for any board z.
 */

describe('board layering bands', () => {
   const n = 5; // five non-connection items, ranks 0..4

   it('invariant 1: every selected item is above the connection layer', () => {
      const conn = connectionsZIndex(n);
      for (let rank = 0; rank < n; rank++) {
         expect(itemZIndex(rank, true, n)).toBeGreaterThan(conn);
      }
   });

   it('invariant 2: the connection layer is above every unselected item', () => {
      const conn = connectionsZIndex(n);
      for (let rank = 0; rank < n; rank++) {
         expect(conn).toBeGreaterThan(itemZIndex(rank, false, n));
      }
   });

   it('invariant 3: a selected item with the LOWEST z still outranks an unselected item with the HIGHEST z', () => {
      const selectedLowest = itemZIndex(0, true, n);
      const unselectedHighest = itemZIndex(n - 1, false, n);
      expect(selectedLowest).toBeGreaterThan(unselectedHighest);
   });

   it('invariant 4: within each band, rank preserves the stored z order', () => {
      for (let rank = 1; rank < n; rank++) {
         expect(itemZIndex(rank, false, n)).toBeGreaterThan(itemZIndex(rank - 1, false, n));
         expect(itemZIndex(rank, true, n)).toBeGreaterThan(itemZIndex(rank - 1, true, n));
      }
   });

   it('invariant 5: the group toolbar tops the whole selected band', () => {
      const group = groupToolbarZIndex(n);
      for (let rank = 0; rank < n; rank++) {
         expect(group).toBeGreaterThan(itemZIndex(rank, true, n));
      }
   });

   it('a selected zone keeps its unselected rank so its members stay on top', () => {
      for (const rank of [0, 2, 4]) {
         // Selecting a zone does not lift it into the raised band...
         expect(itemZIndex(rank, true, n, true)).toBe(itemZIndex(rank, false, n, true));
         // ...so an unselected member ranked above it still paints over it and stays clickable.
         expect(itemZIndex(rank + 1, false, n)).toBeGreaterThan(itemZIndex(rank, true, n, true));
      }
   });

   it('the bands are disjoint for small N (0, 1) too', () => {
      for (const count of [0, 1]) {
         const conn = connectionsZIndex(count);
         for (let rank = 0; rank < count; rank++) {
            expect(itemZIndex(rank, false, count)).toBeLessThan(conn);
            expect(itemZIndex(rank, true, count)).toBeGreaterThan(conn);
         }
      }
   });
});
