// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { isSheetScaledDragItem } from './sheetZoom';

/*
 * The drag clone's scale predicate. It duck-types the item, so each sheet-sourced kind is pinned
 * separately: a miss here silently renders a clone at the wrong size on a zoomed sheet.
 */

describe('isSheetScaledDragItem', () => {
   it('matches a sheet card', () => {
      expect(isSheetScaledDragItem({ id: 'c1', cardType: 'CHARACTER_THEME' })).toBe(true);
   });

   it('matches a tracker', () => {
      expect(isSheetScaledDragItem({ id: 't1', trackerType: 'STATUS' })).toBe(true);
   });

   it('matches a journal, which needs both `pages` and `bookmarks`', () => {
      expect(isSheetScaledDragItem({ id: 'j1', pages: [], bookmarks: [] })).toBe(true);
      expect(isSheetScaledDragItem({ id: 'j1', pages: [] })).toBe(false);
      expect(isSheetScaledDragItem({ id: 'j1', bookmarks: [] })).toBe(false);
   });

   it('rejects a drawer item, which is unscaled', () => {
      expect(isSheetScaledDragItem({ id: 'd1', game: 'LEGENDS', name: 'Alice' })).toBe(false);
   });

   it('rejects nothing being dragged', () => {
      expect(isSheetScaledDragItem(null)).toBe(false);
   });
});
