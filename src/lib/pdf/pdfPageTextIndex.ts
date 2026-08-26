// -- Pdf Library Imports --
import { getPageTextContent } from './pdfTextContent';
import { buildPageTextIndex } from './textLayerGeometry';

// -- Type Imports --
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PageTextIndex, RawTextItem } from './textLayerGeometry';

/*
 * Per-document search index cache. A page's folded text + per-run rects are built once and held on a
 * WeakMap keyed by the document proxy, so every search over the same document reuses them (the index is
 * query-independent). It reads the page's runs through the shared text-content cache, so a page parses
 * once for both the text layer and search. Destroying the loading task drops the proxy, and its entry
 * auto-GCs with it.
 */

const cache = new WeakMap<PDFDocumentProxy, Map<number, Promise<PageTextIndex>>>();

/** The page's search index, built once per (document, page) and memoized; a failed build is evicted so it can retry. */
export function getPageTextIndex(proxy: PDFDocumentProxy, pageNumber: number): Promise<PageTextIndex> {
   let pages = cache.get(proxy);
   if (!pages) {
      pages = new Map();
      cache.set(proxy, pages);
   }
   const existing = pages.get(pageNumber);
   if (existing) return existing;
   const entry = buildIndex(proxy, pageNumber);
   entry.catch(() => pages.delete(pageNumber));
   pages.set(pageNumber, entry);
   return entry;
}

/** Pulls the page's text runs + its scale-1 viewport and folds them into a searchable index. */
async function buildIndex(proxy: PDFDocumentProxy, pageNumber: number): Promise<PageTextIndex> {
   const content = await getPageTextContent(proxy, pageNumber);
   const page = await proxy.getPage(pageNumber);
   const viewport = page.getViewport({ scale: 1 });
   return buildPageTextIndex(content.items as RawTextItem[], viewport.transform, viewport.width, viewport.height);
}
