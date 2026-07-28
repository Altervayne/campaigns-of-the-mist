// -- Library Imports --
import cuid from 'cuid';
import { arrayMove } from '@dnd-kit/sortable';

// -- Type Imports --
import type { Journal, JournalBookmark, JournalPage } from '@/lib/types/board';

/*
 * Pure helpers for a journal's pages + bookmarks. They operate on the {@link Journal} aggregate (the
 * inner `data` snapshot a board copy and a drawer item both hold), not the board wrapper. Bookmarks
 * reference a page by id (never an index), so adding/removing pages never strands or re-points them.
 * Board items have no central harmonize pass, so the migration runs defensively wherever a journal is read.
 */

/**
 * Normalizes a journal to id'd pages: an old `pages: string[]` becomes `[{id, text}]`
 * (text + order preserved), and `bookmarks` defaults to `[]`. Idempotent: a journal already
 * on the object shape with a bookmarks array is returned unchanged.
 */
export function migrateJournalContent(journal: Journal): Journal {
   // Runtime-typed: legacy data violates the current types, so read the fields as unknown.
   const raw = journal as unknown as { pages?: unknown; bookmarks?: unknown };
   const pagesAreObjects = Array.isArray(raw.pages) && (raw.pages.length === 0 || typeof raw.pages[0] === 'object');
   const hasBookmarks = Array.isArray(raw.bookmarks);
   if (pagesAreObjects && hasBookmarks) return journal;

   const pages: JournalPage[] = Array.isArray(raw.pages)
      ? raw.pages.map((page) => (typeof page === 'string' ? { id: cuid(), text: page } : (page as JournalPage)))
      : [{ id: cuid(), text: '' }];
   const bookmarks: JournalBookmark[] = hasBookmarks ? (raw.bookmarks as JournalBookmark[]) : [];
   return { ...journal, pages, bookmarks };
}

/**
 * Inserts a fresh blank page at `index` (clamped to 0..length) and returns the new aggregate plus the new
 * page's id, so the caller can navigate to it. Existing page ids are untouched, so bookmarks never strand;
 * `index === length` appends (the old add-page behaviour).
 */
export function withPageInserted(journal: Journal, index: number): { journal: Journal; pageId: string } {
   const pageId = cuid();
   const at = Math.max(0, Math.min(index, journal.pages.length));
   const pages = [...journal.pages.slice(0, at), { id: pageId, text: '' }, ...journal.pages.slice(at)];
   return { journal: { ...journal, pages }, pageId };
}

/**
 * Reorders pages by moving the page `activeId` into the slot of `overId` (a dnd-kit list reorder). Page
 * ids are untouched, so every bookmark keeps pointing at its page; a no-op when either id is missing or
 * they already match.
 */
export function withPagesReordered(journal: Journal, activeId: string, overId: string): Journal {
   const from = journal.pages.findIndex((page) => page.id === activeId);
   const to = journal.pages.findIndex((page) => page.id === overId);
   if (from < 0 || to < 0 || from === to) return journal;
   return { ...journal, pages: arrayMove(journal.pages, from, to) };
}

/**
 * Removes the page `pageId` and drops every bookmark pointing at it (no orphan tabs), leaving
 * other bookmarks untouched. Removing the last page leaves one fresh empty page.
 */
export function withPageRemoved(journal: Journal, pageId: string): Journal {
   const pages = journal.pages.filter((page) => page.id !== pageId);
   const finalPages = pages.length > 0 ? pages : [{ id: cuid(), text: '' }];
   const bookmarks = journal.bookmarks.filter((bookmark) => bookmark.pageId !== pageId);
   return { ...journal, pages: finalPages, bookmarks };
}

/** First non-blank line of a page's text, trimmed - the reorder row's snippet. */
export function pageSnippet(text: string): string {
   return text.split('\n').find((line) => line.trim().length > 0)?.trim() ?? '';
}

/**
 * Bookmarks paired with their page's current index, in page order; a bookmark to a missing page
 * (shouldn't happen - removal drops it) is skipped. The shape the side tabs and the popover list render.
 */
export function orderedBookmarkTabs(pages: JournalPage[], bookmarks: JournalBookmark[]): { bookmark: JournalBookmark; page: number }[] {
   return bookmarks
      .map((bookmark) => ({ bookmark, page: pages.findIndex((page) => page.id === bookmark.pageId) }))
      .filter((tab) => tab.page >= 0)
      .sort((a, b) => a.page - b.page);
}
