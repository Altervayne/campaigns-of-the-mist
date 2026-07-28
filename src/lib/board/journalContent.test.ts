// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { migrateJournalContent, orderedBookmarkTabs, pageSnippet, withPageInserted, withPagesReordered, withPageRemoved } from './journalContent';

// -- Type Imports --
import type { Journal, JournalBookmark, JournalPage } from '@/lib/types/board';

/*
 * Tests for the journal page/bookmark helpers: the legacy string-pages migration and the
 * remove-page cascade (it drops only the removed page's bookmarks, by pageId).
 */

describe('migrateJournalContent', () => {
   it('turns a legacy string-pages journal into id\'d pages (text + order preserved) with empty bookmarks', () => {
      const legacy = { id: 'j1', pages: ['one', 'two', 'three'] } as unknown as Journal;
      const migrated = migrateJournalContent(legacy);
      expect(migrated.pages.map((p) => p.text)).toEqual(['one', 'two', 'three']);
      expect(migrated.pages.every((p) => typeof p.id === 'string' && p.id.length > 0)).toBe(true);
      expect(new Set(migrated.pages.map((p) => p.id)).size).toBe(3); // distinct ids
      expect(migrated.bookmarks).toEqual([]);
   });

   it('is idempotent for a journal already on the object shape', () => {
      const objectShape: Journal = { id: 'j1', title: '', pages: [{ id: 'p1', text: 'a' }], bookmarks: [] };
      expect(migrateJournalContent(objectShape)).toBe(objectShape);
   });

   it('preserves the title through both the idempotent and legacy-normalize paths (export round-trip)', () => {
      const titled: Journal = { id: 'j1', title: '**Session** 5', pages: [{ id: 'p1', text: 'a' }], bookmarks: [] };
      expect(migrateJournalContent(titled).title).toBe('**Session** 5');
      // Legacy string-pages journal: the title rides the aggregate spread through the reconstruct path.
      const legacy = { id: 'j2', title: 'Legacy', pages: ['one'] } as unknown as Journal;
      expect(migrateJournalContent(legacy).title).toBe('Legacy');
   });
});

describe('withPageInserted', () => {
   const base: Journal = {
      id: 'j1',
      title: '',
      pages: [{ id: 'p1', text: 'a' }, { id: 'p2', text: 'b' }],
      bookmarks: [{ id: 'bm', pageId: 'p2', label: 'Two' }],
   };

   it('inserts a blank page at the index and returns its fresh id; existing ids + bookmarks untouched', () => {
      const { journal, pageId } = withPageInserted(base, 1);
      expect(journal.pages.map((p) => p.id)).toEqual(['p1', pageId, 'p2']);
      expect(journal.pages[1].text).toBe('');
      expect(pageId === 'p1' || pageId === 'p2').toBe(false);
      // The p2 bookmark still resolves - inserting never re-points a pageId.
      expect(journal.bookmarks).toEqual(base.bookmarks);
   });

   it('inserts before the first page at index 0', () => {
      const { journal, pageId } = withPageInserted(base, 0);
      expect(journal.pages.map((p) => p.id)).toEqual([pageId, 'p1', 'p2']);
   });

   it('appends at index === length and clamps a past-the-end index (the add-page behaviour)', () => {
      const end = withPageInserted(base, base.pages.length);
      expect(end.journal.pages.map((p) => p.id)).toEqual(['p1', 'p2', end.pageId]);
      const past = withPageInserted(base, 99);
      expect(past.journal.pages.at(-1)?.id).toBe(past.pageId);
   });
});

describe('withPagesReordered', () => {
   const base: Journal = {
      id: 'j1',
      title: '',
      pages: [{ id: 'p1', text: 'a' }, { id: 'p2', text: 'b' }, { id: 'p3', text: 'c' }],
      bookmarks: [{ id: 'bm', pageId: 'p3', label: 'Third' }],
   };

   it('moves a page into another page\'s slot, keeping ids stable so bookmarks never strand', () => {
      const next = withPagesReordered(base, 'p1', 'p3');
      expect(next.pages.map((p) => p.id)).toEqual(['p2', 'p3', 'p1']);
      // The pageId a bookmark references is untouched - it still resolves to the moved page.
      expect(next.bookmarks).toEqual(base.bookmarks);
      expect(next.pages.find((p) => p.id === 'p3')?.text).toBe('c');
   });

   it('is a no-op (same reference) when an id is missing or the ids match', () => {
      expect(withPagesReordered(base, 'p1', 'p1')).toBe(base);
      expect(withPagesReordered(base, 'nope', 'p2')).toBe(base);
   });
});

describe('withPageRemoved', () => {
   const content: Journal = {
      id: 'j1',
      title: '',
      pages: [{ id: 'p1', text: 'a' }, { id: 'p2', text: 'b' }, { id: 'p3', text: 'c' }],
      bookmarks: [{ id: 'b1', pageId: 'p1', label: 'First' }, { id: 'b2', pageId: 'p3', label: 'Third' }],
   };

   it('drops the removed page\'s bookmark(s) and leaves the others intact (by id)', () => {
      const result = withPageRemoved(content, 'p1');
      expect(result.pages.map((p) => p.id)).toEqual(['p2', 'p3']);
      // p1's bookmark is gone; p3's survives untouched.
      expect(result.bookmarks).toEqual([{ id: 'b2', pageId: 'p3', label: 'Third' }]);
   });

   it('leaves bookmarks alone when removing an unbookmarked page', () => {
      expect(withPageRemoved(content, 'p2').bookmarks).toEqual(content.bookmarks);
   });

   it('removing the last page leaves one fresh empty page and no bookmarks', () => {
      const single: Journal = { id: 'j1', title: '', pages: [{ id: 'only', text: 'x' }], bookmarks: [{ id: 'b', pageId: 'only' }] };
      const result = withPageRemoved(single, 'only');
      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].text).toBe('');
      expect(result.bookmarks).toEqual([]);
   });
});

describe('pageSnippet', () => {
   it('takes the first non-blank line, trimmed', () => {
      expect(pageSnippet('\n   \n  # A heading  \nsecond line')).toBe('# A heading');
   });

   it('is empty for a blank page', () => {
      expect(pageSnippet('')).toBe('');
      expect(pageSnippet('\n   \n\t\n')).toBe('');
   });
});

describe('orderedBookmarkTabs', () => {
   const pages: JournalPage[] = [{ id: 'p1', text: 'a' }, { id: 'p2', text: 'b' }, { id: 'p3', text: 'c' }];

   it('pairs each bookmark with its page index and sorts by page order', () => {
      const bookmarks: JournalBookmark[] = [{ id: 'b3', pageId: 'p3' }, { id: 'b1', pageId: 'p1' }];
      expect(orderedBookmarkTabs(pages, bookmarks)).toEqual([
         { bookmark: bookmarks[1], page: 0 },
         { bookmark: bookmarks[0], page: 2 },
      ]);
   });

   it('skips a bookmark whose page is gone', () => {
      const bookmarks: JournalBookmark[] = [{ id: 'b1', pageId: 'p1' }, { id: 'bx', pageId: 'gone' }];
      expect(orderedBookmarkTabs(pages, bookmarks)).toEqual([{ bookmark: bookmarks[0], page: 0 }]);
   });
});
