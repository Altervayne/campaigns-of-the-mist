import { describe, it, expect } from 'vitest';

import { advanceTarget } from './tableSheetTarget';
import type { TableDims } from './tableSheetTarget';

/*
 * The caret-follow rule for the mobile table sheet: after each op the logical target advances so consecutive
 * taps walk the same cell. Moves are edge-gated by the caller (never clamp here); deletes clamp into the
 * post-op dimensions.
 */

describe('advanceTarget', () => {
   const dims = (bodyRows: number, cols: number): TableDims => ({ bodyRows, cols });

   it('walks the target with a move so consecutive taps march it', () => {
      expect(advanceTarget('moveRowDown', { row: 0, col: 1 }, dims(3, 2))).toEqual({ row: 1, col: 1 });
      expect(advanceTarget('moveRowUp', { row: 2, col: 1 }, dims(3, 2))).toEqual({ row: 1, col: 1 });
      expect(advanceTarget('moveColumnRight', { row: 1, col: 0 }, dims(3, 2))).toEqual({ row: 1, col: 1 });
      expect(advanceTarget('moveColumnLeft', { row: 1, col: 2 }, dims(3, 3))).toEqual({ row: 1, col: 1 });
   });

   it('keeps the caret on the same content when inserting above/left, in place when below/right', () => {
      // Insert above pushes the original body cell down one; the header target is unmoved.
      expect(advanceTarget('insertRowAbove', { row: 1, col: 0 }, dims(4, 2))).toEqual({ row: 2, col: 0 });
      expect(advanceTarget('insertRowAbove', { row: -1, col: 0 }, dims(4, 2))).toEqual({ row: -1, col: 0 });
      expect(advanceTarget('insertColumnLeft', { row: 0, col: 1 }, dims(3, 3))).toEqual({ row: 0, col: 2 });
      expect(advanceTarget('insertRowBelow', { row: 1, col: 0 }, dims(4, 2))).toEqual({ row: 1, col: 0 });
      expect(advanceTarget('insertColumnRight', { row: 0, col: 1 }, dims(3, 3))).toEqual({ row: 0, col: 1 });
   });

   it('clamps a delete that drops the target cell into the shrunk table', () => {
      // Deleting the last body row: a target on it clamps up onto the new last row.
      expect(advanceTarget('deleteRow', { row: 2, col: 1 }, dims(2, 2))).toEqual({ row: 1, col: 1 });
      // Deleting an interior row leaves an in-range target where it is.
      expect(advanceTarget('deleteRow', { row: 0, col: 1 }, dims(2, 2))).toEqual({ row: 0, col: 1 });
      // Deleting the last column clamps the target onto the new last column.
      expect(advanceTarget('deleteColumn', { row: 0, col: 2 }, dims(3, 2))).toEqual({ row: 0, col: 1 });
   });

   it('leaves the target untouched when dims are unknown (block already gone)', () => {
      expect(advanceTarget('deleteRow', { row: 5, col: 3 }, null)).toEqual({ row: 5, col: 3 });
      expect(advanceTarget('deleteColumn', { row: 5, col: 3 }, null)).toEqual({ row: 5, col: 3 });
   });
});
