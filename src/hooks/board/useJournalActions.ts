// -- Library Imports --
import cuid from 'cuid';

// -- Utils Imports --
import { withPageInserted, withPagesReordered, withPageRemoved } from '@/lib/board/journalContent';

// -- Type Imports --
import type { Journal, JournalBookmark, JournalPage } from '@/lib/types/board';

interface UseJournalActionsArgs {
   journal: Journal;
   /** The rendered page list (the sentinel fallback already applied), so every op rebuilds what is shown. */
   pages: JournalPage[];
   activePage: JournalPage;
   bookmarks: JournalBookmark[];
   pageIndex: number;
   setIndex: (next: number) => void;
   /** The live page-text buffer, read by the ops that keep the current edit. */
   text: string;
   commit: () => void;
   commitJournal: (next: Journal) => void;
}

/*
 * The journal's stateless actions: page navigation, the structural page ops and the bookmark ops. Registers
 * no state and no effects, so its call position is free. The page buffer gets three deliberate treatments -
 * navigation commits it and then moves (two commands), insert / reorder FOLD it into the single command they
 * commit, and remove folds nothing (the buffer belongs to the page being deleted).
 */
export function useJournalActions({ journal, pages, activePage, bookmarks, pageIndex, setIndex, text, commit, commitJournal }: UseJournalActionsArgs) {
   const goPrev = () => { commit(); setIndex(Math.max(0, pageIndex - 1)); };
   const goNext = () => { commit(); setIndex(Math.min(pages.length - 1, pageIndex + 1)); };

   // Insert a blank page at `at` (clamped), keeping the current edit, and jump to the new page. Page ids are
   // stable and bookmarks reference pageId, so inserting never strands a tab. Append (`at = length`) is the
   // toolbar's Add-page; the bottom bar inserts immediately before/after the current page.
   const insertPage = (at: number) => {
      const kept = pages.map((page) => (page.id === activePage.id ? { ...page, text } : page));
      const { journal: next, pageId } = withPageInserted({ ...journal, pages: kept }, at);
      commitJournal(next);
      setIndex(next.pages.findIndex((page) => page.id === pageId));
   };
   const addPage = () => insertPage(pages.length);

   const removePage = () => {
      const result = withPageRemoved({ ...journal, pages }, activePage.id);
      commitJournal(result);
      setIndex(Math.min(pageIndex, result.pages.length - 1));
   };

   // Drag-reorder pages from the overview popover. Page ids stay stable (bookmarks reference pageId, so a
   // reorder never strands a tab), the current edit is kept, and the view follows the current page BY ID -
   // it re-derives the active page's new index so the reader lands on the same page, not the same slot.
   const reorderPages = (activeId: string, overId: string) => {
      const kept = pages.map((page) => (page.id === activePage.id ? { ...page, text } : page));
      const next = withPagesReordered({ ...journal, pages: kept }, activeId, overId);
      commitJournal(next);
      setIndex(next.pages.findIndex((page) => page.id === activePage.id));
   };

   // The destination of the page indicator's click-to-edit number, already validated as a 1..M page.
   const goToPageNumber = (pageNumber: number) => { commit(); setIndex(pageNumber - 1); };

   const isBookmarked = bookmarks.some((bookmark) => bookmark.pageId === activePage.id);
   const toggleBookmark = () => {
      const next = isBookmarked
         ? bookmarks.filter((bookmark) => bookmark.pageId !== activePage.id)
         : [...bookmarks, { id: cuid(), pageId: activePage.id, label: '' }];
      commitJournal({ ...journal, bookmarks: next });
   };
   const removeBookmark = (id: string) => commitJournal({ ...journal, bookmarks: bookmarks.filter((bookmark) => bookmark.id !== id) });
   const setBookmarkLabel = (id: string, label: string) =>
      commitJournal({ ...journal, bookmarks: bookmarks.map((bookmark) => (bookmark.id === id ? { ...bookmark, label } : bookmark)) });

   const jumpToPage = (pageId: string) => {
      const target = pages.findIndex((page) => page.id === pageId);
      if (target < 0) return;
      commit();
      setIndex(target);
   };

   return { goPrev, goNext, insertPage, addPage, removePage, reorderPages, goToPageNumber, isBookmarked, toggleBookmark, removeBookmark, setBookmarkLabel, jumpToPage };
}
