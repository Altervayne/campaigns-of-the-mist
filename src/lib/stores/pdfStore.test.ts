// -- Library Imports --
import { beforeEach, describe, expect, it, vi } from 'vitest';

// -- Local Imports --
import { drawerDatabase } from '@/lib/drawer/drawerDatabase';
import { createPdfStore } from './pdfStore';
import { useAppGeneralStateStore } from '@/lib/stores/appGeneralStateStore';
import * as repository from '@/lib/pdf/pdfRepository';
import { getPdfBlob } from '@/lib/pdf/pdfAssetRepository';
import { DRAWER_ROOT_PARENT_ID } from '@/lib/drawer/drawerRecords';

// -- Type Imports --
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PdfDocument } from '@/lib/types/pdf';
import type { PdfAnnotation, PdfInk } from '@/lib/types/pdfAnnotation';
import type { SearchMatch } from './pdfStore';
import type { DrawerItemRecord } from '@/lib/drawer/drawerRecords';

/*
 * Unit tests for the pdf store's writable annotation surface: add/update/remove mutate the live
 * doc, the debounced autosave writes through to both the row and the linked drawer copy, and
 * `flush` disarms the pending timer while landing the write exactly once. Bytes/pdf.js are never
 * loaded here - the doc is seeded directly, so no worker transport spins up. The one exception is
 * the hydrate block, which stubs the asset blob + pdf.js loader so the reading-position restore runs.
 */

// The reading-position restore drives hydrate through to `ready`; stub the two native-resource deps so
// no real asset blob or worker is needed (no other test in this file calls hydrate).
vi.mock('@/lib/pdf/pdfAssetRepository', () => ({
   getPdfBlob: vi.fn(async () => new Blob([new Uint8Array([37, 80, 68, 70])])),
}));
vi.mock('@/lib/pdf/pdfjsLoader', () => ({
   loadPdfjs: vi.fn(async () => ({
      getDocument: () => ({ promise: Promise.resolve({ numPages: 24 }), destroy: async () => {} }),
   })),
}));

const ink: PdfInk = { id: 'a1', kind: 'ink', page: 1, color: '#e11d48', createdAt: 1, points: [0.1, 0.1], width: 0.01 };

/** Imports a working row + a linked drawer item, then seeds a store instance's live doc without touching pdf.js. */
async function seedStore(saveDebounceMs: number) {
   const doc: PdfDocument = { id: 'pdf-1', title: 'Book', assetHash: 'hash-a', pageCount: 4 };
   await repository.importPdf(doc, 'item-1');
   const item: DrawerItemRecord = {
      id: 'item-1', name: 'Book', parentFolderId: DRAWER_ROOT_PARENT_ID, order: 0,
      game: 'NEUTRAL', type: 'PDF', createdAt: 1, updatedAt: 1, content: doc,
   };
   await drawerDatabase.items.add(item);

   const useStore = createPdfStore({ saveDebounceMs });
   useStore.setState({ pdfId: 'pdf-1', doc, drawerItemId: 'item-1', status: 'ready' });
   return useStore;
}

/** Reads the annotations currently persisted on the working row. */
async function rowAnnotations(): Promise<Record<string, PdfAnnotation> | undefined> {
   return (await repository.getPdf('pdf-1'))?.annotations;
}

beforeEach(async () => {
   await drawerDatabase.pdfDocs.clear();
   await drawerDatabase.items.clear();
});

describe('pdf store annotations', () => {
   it('addAnnotation puts the annotation on the live doc', async () => {
      const useStore = await seedStore(400);
      useStore.getState().actions.addAnnotation(ink);
      expect(useStore.getState().doc?.annotations).toEqual({ a1: ink });
   });

   it('updateAnnotation merges a patch, keeping the discriminant and id', async () => {
      const useStore = await seedStore(400);
      useStore.getState().actions.addAnnotation(ink);
      useStore.getState().actions.updateAnnotation('a1', { color: '#2563eb', width: 0.02 });

      const updated = useStore.getState().doc?.annotations?.a1 as PdfInk;
      expect(updated).toEqual({ ...ink, color: '#2563eb', width: 0.02 });
      expect(updated.kind).toBe('ink');
   });

   it('updateAnnotation is a no-op on an absent id', async () => {
      const useStore = await seedStore(400);
      useStore.getState().actions.updateAnnotation('missing', { color: '#000000' });
      expect(useStore.getState().doc?.annotations ?? {}).toEqual({});
   });

   it('removeAnnotation drops the key', async () => {
      const useStore = await seedStore(400);
      useStore.getState().actions.addAnnotation(ink);
      useStore.getState().actions.removeAnnotation('a1');
      expect(useStore.getState().doc?.annotations).toEqual({});
   });

   it('setAnnotations replaces the whole map and persists on flush', async () => {
      const useStore = await seedStore(400);
      const next: Record<string, PdfAnnotation> = { b1: { ...ink, id: 'b1', page: 2 }, b2: { ...ink, id: 'b2', page: 3 } };
      useStore.getState().actions.setAnnotations(next);
      expect(useStore.getState().doc?.annotations).toEqual(next);

      await useStore.getState().actions.flush();
      expect(await rowAnnotations()).toEqual(next);
   });

   it('setAnnotations is bracketed into one undo step by the caller', async () => {
      const useStore = await seedStore(400);
      const { beginHistory, addAnnotation, setAnnotations, commitHistory, undo } = useStore.getState().actions;

      addAnnotation(ink); // a pre-existing mark
      beginHistory();
      setAnnotations({ b1: { ...ink, id: 'b1', page: 2 } });
      commitHistory();
      expect(useStore.getState().undoStack).toHaveLength(1);

      // One undo restores the pre-apply map wholesale.
      undo();
      expect(useStore.getState().doc?.annotations).toEqual({ a1: ink });
   });

   it('flush writes through to the row and the linked drawer item, then resolves', async () => {
      const useStore = await seedStore(400);
      useStore.getState().actions.addAnnotation(ink);

      await useStore.getState().actions.flush();

      expect(await rowAnnotations()).toEqual({ a1: ink });
      const item = await drawerDatabase.items.get('item-1');
      expect((item?.content as PdfDocument).annotations).toEqual({ a1: ink });
   });

   it('a rapid add then flush lands exactly once and disarms the pending timer', async () => {
      const useStore = await seedStore(5);
      useStore.getState().actions.addAnnotation(ink);
      await useStore.getState().actions.flush();

      expect(await rowAnnotations()).toEqual({ a1: ink });

      // Mutate the row underneath, then let the (disarmed) debounce window elapse: a late timer would
      // clobber this back to the flushed snapshot.
      await repository.patchPdf('pdf-1', { annotations: { a1: ink, a2: ink } as Record<string, PdfAnnotation> });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(Object.keys((await rowAnnotations()) ?? {})).toEqual(['a1', 'a2']);
   });

   it('flush resolves without writing when no doc is loaded', async () => {
      const useStore = createPdfStore({ saveDebounceMs: 5 });
      await expect(useStore.getState().actions.flush()).resolves.toBeUndefined();
   });
});

describe('pdf store annotation history', () => {
   const inkAt = (id: string): PdfInk => ({ id, kind: 'ink', page: 1, color: '#e11d48', createdAt: 1, points: [0.1, 0.1], width: 0.01 });

   it('undo reverts an add and redo reapplies it', async () => {
      const useStore = await seedStore(400);
      const { beginHistory, addAnnotation, commitHistory, undo, redo } = useStore.getState().actions;

      beginHistory();
      addAnnotation(ink);
      commitHistory();
      expect(useStore.getState().doc?.annotations).toEqual({ a1: ink });
      expect(useStore.getState().undoStack).toHaveLength(1);

      undo();
      expect(useStore.getState().doc?.annotations).toEqual({});
      expect(useStore.getState().undoStack).toHaveLength(0);
      expect(useStore.getState().redoStack).toHaveLength(1);

      redo();
      expect(useStore.getState().doc?.annotations).toEqual({ a1: ink });
      expect(useStore.getState().redoStack).toHaveLength(0);
   });

   it('beginHistory takes undo focus for the pdf', async () => {
      const useStore = await seedStore(400);
      useAppGeneralStateStore.getState().actions.setLastModifiedStore('drawer');
      useStore.getState().actions.beginHistory();
      expect(useAppGeneralStateStore.getState().lastModifiedStore).toBe('pdf');
   });

   it('an eraser scrub removing several marks is one undo step', async () => {
      const useStore = await seedStore(400);
      const a1 = inkAt('a1');
      const a2 = inkAt('a2');
      useStore.setState({ doc: { ...useStore.getState().doc!, annotations: { a1, a2 } } });
      const { beginHistory, removeAnnotation, commitHistory, undo } = useStore.getState().actions;

      // A scrub brackets one begin / one commit around every contact-removal.
      beginHistory();
      removeAnnotation('a1');
      removeAnnotation('a2');
      commitHistory();
      expect(useStore.getState().undoStack).toHaveLength(1);
      expect(useStore.getState().doc?.annotations).toEqual({});

      undo();
      expect(useStore.getState().doc?.annotations).toEqual({ a1, a2 });
   });

   it('a gesture that changes nothing records no step', async () => {
      const useStore = await seedStore(400);
      const { beginHistory, commitHistory } = useStore.getState().actions;

      // A scrub over empty space (never-marked page: annotations still undefined) mutates nothing.
      beginHistory();
      commitHistory();
      expect(useStore.getState().undoStack).toHaveLength(0);
      expect(useStore.getState().redoStack).toHaveLength(0);
   });

   it('cancelHistory drops an open checkpoint so an abandoned add leaves no step', async () => {
      const useStore = await seedStore(400);
      const { beginHistory, addAnnotation, removeAnnotation, cancelHistory } = useStore.getState().actions;

      // A comment created then abandoned empty: add under an open checkpoint, then remove and cancel.
      beginHistory();
      addAnnotation(inkAt('a1'));
      removeAnnotation('a1');
      cancelHistory();
      expect(useStore.getState().undoStack).toHaveLength(0);
      expect(useStore.getState().doc?.annotations).toEqual({});
   });

   it('a checkpoint left open by begin commits on a later commitHistory', async () => {
      const useStore = await seedStore(400);
      const { beginHistory, addAnnotation, commitHistory, undo } = useStore.getState().actions;

      // A comment authored across two calls: add on create (checkpoint stays open), commit on close.
      beginHistory();
      addAnnotation(inkAt('a1'));
      commitHistory();
      expect(useStore.getState().undoStack).toHaveLength(1);

      undo();
      expect(useStore.getState().doc?.annotations).toEqual({});
   });

   it('a fresh mutation after an undo clears the redo stack', async () => {
      const useStore = await seedStore(400);
      const { beginHistory, addAnnotation, commitHistory, undo } = useStore.getState().actions;

      beginHistory();
      addAnnotation(inkAt('a1'));
      commitHistory();
      undo();
      expect(useStore.getState().redoStack).toHaveLength(1);

      beginHistory();
      addAnnotation(inkAt('a2'));
      commitHistory();
      expect(useStore.getState().redoStack).toHaveLength(0);
      expect(useStore.getState().undoStack).toHaveLength(1);
   });

   it('the undo stack caps at 50, dropping the oldest snapshot', async () => {
      const useStore = await seedStore(400);
      const { beginHistory, addAnnotation, commitHistory, undo } = useStore.getState().actions;

      // 51 committed adds push 51 snapshots; the pre-first-add (empty) snapshot falls off the bottom.
      for (let i = 1; i <= 51; i += 1) {
         beginHistory();
         addAnnotation(inkAt(`a${i}`));
         commitHistory();
      }
      expect(useStore.getState().undoStack).toHaveLength(50);

      // Undo the full stack: the earliest recoverable state is after the first add, not the empty page.
      for (let i = 0; i < 50; i += 1) undo();
      expect(Object.keys(useStore.getState().doc?.annotations ?? {})).toEqual(['a1']);
      expect(useStore.getState().undoStack).toHaveLength(0);
   });

   it('undo and redo persist through the autosave', async () => {
      const useStore = await seedStore(5);
      const { beginHistory, addAnnotation, commitHistory, undo, redo, flush } = useStore.getState().actions;

      beginHistory();
      addAnnotation(ink);
      commitHistory();
      await flush();
      expect(await rowAnnotations()).toEqual({ a1: ink });

      undo();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(await rowAnnotations()).toEqual({});

      redo();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(await rowAnnotations()).toEqual({ a1: ink });
   });
});

describe('pdf last-page persistence', () => {
   it('savePdfLastPage writes the page onto the row and the linked drawer content', async () => {
      await seedStore(400); // creates row 'pdf-1' + linked drawer item 'item-1'
      await repository.savePdfLastPage('pdf-1', 3, 'item-1');

      expect((await repository.getPdf('pdf-1'))?.lastPage).toBe(3);
      const item = await drawerDatabase.items.get('item-1');
      expect((item?.content as PdfDocument).lastPage).toBe(3);
   });

   it('savePdfLastPage is a no-op when the row is absent', async () => {
      await repository.savePdfLastPage('missing', 5, null);
      expect(await repository.getPdf('missing')).toBeUndefined();
   });
});

describe('pdf hydrate restores the reading position', () => {
   it('seeds currentPage from the stored lastPage', async () => {
      const doc: PdfDocument = { id: 'pdf-1', title: 'Book', assetHash: 'hash-a', pageCount: 24, lastPage: 20 };
      await repository.importPdf(doc, 'item-1');

      const useStore = createPdfStore();
      await useStore.getState().actions.hydrate('pdf-1');

      expect(useStore.getState().status).toBe('ready');
      expect(useStore.getState().currentPage).toBe(20);
   });

   it('falls back to page 1 when no lastPage is stored', async () => {
      const doc: PdfDocument = { id: 'pdf-2', title: 'Book', assetHash: 'hash-a', pageCount: 24 };
      await repository.importPdf(doc, null);

      const useStore = createPdfStore();
      await useStore.getState().actions.hydrate('pdf-2');

      expect(useStore.getState().currentPage).toBe(1);
   });
});

describe('pdf hydrate placeholder / error branch discipline', () => {
   it('a null-hash record lands on placeholder without fetching a blob', async () => {
      const doc: PdfDocument = { id: 'pdf-ph', title: 'Book', assetHash: null, pageCount: 12, annotations: { a1: ink } };
      await repository.importPdf(doc, 'item-ph');
      vi.mocked(getPdfBlob).mockClear();

      const useStore = createPdfStore();
      await useStore.getState().actions.hydrate('pdf-ph');

      expect(useStore.getState().status).toBe('placeholder');
      expect(useStore.getState().doc?.assetHash).toBeNull();
      expect(useStore.getState().doc?.annotations).toEqual({ a1: ink }); // record intact, waiting on a file
      expect(getPdfBlob).not.toHaveBeenCalled(); // the null hash branches before the fetch
   });

   it('a real hash whose blob is missing lands on error, not placeholder', async () => {
      const doc: PdfDocument = { id: 'pdf-lost', title: 'Book', assetHash: 'hash-gone', pageCount: 12 };
      await repository.importPdf(doc, null);
      vi.mocked(getPdfBlob).mockResolvedValueOnce(undefined);

      const useStore = createPdfStore();
      await useStore.getState().actions.hydrate('pdf-lost');

      expect(useStore.getState().status).toBe('error');
   });

   it('re-hydrating a repaired placeholder loads the file in place, landing on lastPage', async () => {
      const doc: PdfDocument = { id: 'pdf-fix', title: 'Book', assetHash: null, pageCount: 12, lastPage: 7, annotations: { a1: ink } };
      await repository.importPdf(doc, 'item-fix');

      const useStore = createPdfStore();
      await useStore.getState().actions.hydrate('pdf-fix');
      expect(useStore.getState().status).toBe('placeholder');

      // Supply the file, then re-hydrate the SAME instance (hydrate bails only on loading/ready).
      await repository.repairPdf('pdf-fix', 'hash-real', 24);
      await useStore.getState().actions.hydrate('pdf-fix');

      expect(useStore.getState().status).toBe('ready');
      expect(useStore.getState().doc?.assetHash).toBe('hash-real');
      expect(useStore.getState().doc?.pageCount).toBe(24); // the supplied file's count wins
      expect(useStore.getState().currentPage).toBe(7); // seeded from the kept lastPage
      expect(useStore.getState().doc?.annotations).toEqual({ a1: ink }); // annotations survive the repair
   });
});

/** Lets an incremental scan finish: its per-page awaits and any macrotask yield drain within this window. */
function settleSearch(): Promise<void> {
   return new Promise((resolve) => setTimeout(resolve, 20));
}

/** A fake proxy that serves one text run per page and a scale-1 viewport, enough for the search scan. */
function makeSearchProxy(pageText: Record<number, string>): PDFDocumentProxy {
   return {
      getPage: (pageNumber: number) =>
         Promise.resolve({
            getTextContent: () =>
               Promise.resolve({ items: [{ str: pageText[pageNumber] ?? '', transform: [10, 0, 0, 10, 20, 80], width: 40, height: 10 }], styles: {}, lang: null }),
            getViewport: () => ({ transform: [1, 0, 0, -1, 0, 100], width: 200, height: 100 }),
         }),
   } as unknown as PDFDocumentProxy;
}

/** Seeds a ready store with a 4-page searchable document and a fake proxy over it. */
async function seedSearchStore(currentPage: number) {
   const useStore = await seedStore(400);
   const proxy = makeSearchProxy({ 1: 'alpha', 2: 'beta bravo', 3: 'alpha gamma', 4: 'delta' });
   useStore.setState({ proxy, currentPage });
   return useStore;
}

const matchesAt = (pages: number[]): SearchMatch[] => pages.map((page) => ({ page, start: 0, length: 5 }));

describe('pdf store search scan', () => {
   it('setSearchQuery sweeps every page and lands page-ordered matches, ending done', async () => {
      const useStore = await seedSearchStore(3); // scan order 3,1,2,4 - but matches stay page-ordered
      useStore.getState().actions.setSearchQuery('alpha');
      expect(useStore.getState().searchStatus).toBe('scanning');

      await settleSearch();
      const { searchMatches, searchStatus, searchScanned } = useStore.getState();
      expect(searchStatus).toBe('done');
      expect(searchScanned).toBe(4);
      expect(searchMatches).toEqual([{ page: 1, start: 0, length: 5 }, { page: 3, start: 0, length: 5 }]);
   });

   it('an empty query clears matches and returns to idle', async () => {
      const useStore = await seedSearchStore(1);
      useStore.getState().actions.setSearchQuery('alpha');
      await settleSearch();
      expect(useStore.getState().searchMatches).toHaveLength(2);

      useStore.getState().actions.setSearchQuery('');
      expect(useStore.getState().searchStatus).toBe('idle');
      expect(useStore.getState().searchMatches).toEqual([]);
      expect(useStore.getState().searchActiveIndex).toBe(-1);
      expect(useStore.getState().searchScanned).toBe(0);
   });

   it('a superseding query cancels the prior scan, leaving no late writes from it', async () => {
      const useStore = await seedSearchStore(1);
      // Kick 'alpha' (would match pages 1 and 3), then immediately supersede with 'delta' (page 4 only).
      useStore.getState().actions.setSearchQuery('alpha');
      useStore.getState().actions.setSearchQuery('delta');

      await settleSearch();
      const { searchMatches, searchStatus, searchScanned } = useStore.getState();
      expect(searchStatus).toBe('done');
      expect(searchScanned).toBe(4);
      expect(searchMatches).toEqual([{ page: 4, start: 0, length: 5 }]); // no alpha hit leaked in
   });

   it('dispose cancels an in-flight scan, leaving no late match writes', async () => {
      const useStore = await seedSearchStore(1);
      useStore.getState().actions.setSearchQuery('alpha');
      useStore.getState().actions.dispose();

      await settleSearch();
      expect(useStore.getState().searchStatus).toBe('idle'); // back to initial
      expect(useStore.getState().searchMatches).toEqual([]);
   });

   it('closeSearch hides the bar and clears the query, matches, and scan', async () => {
      const useStore = await seedSearchStore(1);
      useStore.getState().actions.openSearch();
      useStore.getState().actions.setSearchQuery('alpha');
      await settleSearch();
      expect(useStore.getState().searchOpen).toBe(true);

      useStore.getState().actions.closeSearch();
      expect(useStore.getState().searchOpen).toBe(false);
      expect(useStore.getState().searchQuery).toBe('');
      expect(useStore.getState().searchMatches).toEqual([]);
      expect(useStore.getState().searchStatus).toBe('idle');
   });

   it('clearSearch resets the search but leaves the bar open', async () => {
      const useStore = await seedSearchStore(1);
      useStore.getState().actions.openSearch();
      useStore.getState().actions.setSearchQuery('alpha');
      await settleSearch();

      useStore.getState().actions.clearSearch();
      expect(useStore.getState().searchOpen).toBe(true); // bar stays
      expect(useStore.getState().searchQuery).toBe('');
      expect(useStore.getState().searchMatches).toEqual([]);
      expect(useStore.getState().searchActiveIndex).toBe(-1);
      expect(useStore.getState().searchStatus).toBe('idle');
      expect(useStore.getState().searchScanned).toBe(0);
   });
});

describe('pdf store match navigation', () => {
   it('nextMatch from none seeds the first match at or after the current page, then wraps', async () => {
      const useStore = await seedStore(400);
      useStore.setState({ searchMatches: matchesAt([1, 3, 5]), currentPage: 3, searchActiveIndex: -1 });
      const { nextMatch } = useStore.getState().actions;

      nextMatch();
      expect(useStore.getState().searchActiveIndex).toBe(1); // page 3
      nextMatch();
      expect(useStore.getState().searchActiveIndex).toBe(2);
      nextMatch();
      expect(useStore.getState().searchActiveIndex).toBe(0); // wraps
   });

   it('nextMatch from none falls back to the first match when none is at or after the page', async () => {
      const useStore = await seedStore(400);
      useStore.setState({ searchMatches: matchesAt([1, 3, 5]), currentPage: 9, searchActiveIndex: -1 });
      useStore.getState().actions.nextMatch();
      expect(useStore.getState().searchActiveIndex).toBe(0);
   });

   it('prevMatch from none seeds the last match at or before the current page, then wraps', async () => {
      const useStore = await seedStore(400);
      useStore.setState({ searchMatches: matchesAt([1, 3, 5]), currentPage: 3, searchActiveIndex: -1 });
      const { prevMatch } = useStore.getState().actions;

      prevMatch();
      expect(useStore.getState().searchActiveIndex).toBe(1); // page 3
      prevMatch();
      expect(useStore.getState().searchActiveIndex).toBe(0);
      prevMatch();
      expect(useStore.getState().searchActiveIndex).toBe(2); // wraps backward
   });

   it('prevMatch from none falls back to the last match when none is at or before the page', async () => {
      const useStore = await seedStore(400);
      useStore.setState({ searchMatches: matchesAt([3, 5, 7]), currentPage: 1, searchActiveIndex: -1 });
      useStore.getState().actions.prevMatch();
      expect(useStore.getState().searchActiveIndex).toBe(2);
   });

   it('nextMatch and prevMatch are no-ops with no matches', async () => {
      const useStore = await seedStore(400);
      useStore.setState({ searchMatches: [], searchActiveIndex: -1 });
      useStore.getState().actions.nextMatch();
      useStore.getState().actions.prevMatch();
      expect(useStore.getState().searchActiveIndex).toBe(-1);
   });

   it('dispose resets search state back to initial', async () => {
      const useStore = await seedStore(400);
      useStore.setState({ searchOpen: true, searchQuery: 'x', searchMatches: matchesAt([1]), searchActiveIndex: 0, searchStatus: 'done', searchScanned: 4 });
      useStore.getState().actions.dispose();
      const state = useStore.getState();
      expect(state.searchOpen).toBe(false);
      expect(state.searchQuery).toBe('');
      expect(state.searchMatches).toEqual([]);
      expect(state.searchActiveIndex).toBe(-1);
      expect(state.searchStatus).toBe('idle');
      expect(state.searchScanned).toBe(0);
   });
});

describe('pdf store annotation visibility', () => {
   it('defaults every kind visible', async () => {
      const useStore = await seedStore(400);
      expect(useStore.getState().annotationVisibility).toEqual({ ink: true, highlight: true, comment: true });
   });

   it('setAnnotationTypeVisible hides one kind, leaving the others', async () => {
      const useStore = await seedStore(400);
      useStore.getState().actions.setAnnotationTypeVisible('ink', false);
      expect(useStore.getState().annotationVisibility).toEqual({ ink: false, highlight: true, comment: true });
   });

   it('setAllAnnotationsVisible flips all three at once', async () => {
      const useStore = await seedStore(400);
      useStore.getState().actions.setAllAnnotationsVisible(false);
      expect(useStore.getState().annotationVisibility).toEqual({ ink: false, highlight: false, comment: false });
      useStore.getState().actions.setAllAnnotationsVisible(true);
      expect(useStore.getState().annotationVisibility).toEqual({ ink: true, highlight: true, comment: true });
   });

   it('dispose resets visibility back to all-visible', async () => {
      const useStore = await seedStore(400);
      useStore.getState().actions.setAllAnnotationsVisible(false);
      useStore.getState().actions.dispose();
      expect(useStore.getState().annotationVisibility).toEqual({ ink: true, highlight: true, comment: true });
   });
});
