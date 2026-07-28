// -- Store Imports --
import { useJournalViewStore } from '@/lib/stores/journalViewStore';

// -- Type Imports --
import type { JournalPage } from '@/lib/types/board';

/*
 * The current page is EPHEMERAL view state (not character data): read/write an id-keyed store so it
 * survives the sheet's tab-switch unmount, and one store serves both the sheet journal and its board
 * copy (same journal id). Clamp on read - a stored index can outlive a page deletion.
 */
export function useJournalPageIndex(journalId: string, pages: JournalPage[]) {
   const storedIndex = useJournalViewStore((state) => state.journalView[journalId] ?? 0);
   const setJournalPage = useJournalViewStore((state) => state.setJournalPage);
   const pageIndex = Math.min(storedIndex, pages.length - 1);
   const setIndex = (next: number) => setJournalPage(journalId, next);
   const activePage = pages[pageIndex];

   return { pageIndex, setIndex, activePage };
}
