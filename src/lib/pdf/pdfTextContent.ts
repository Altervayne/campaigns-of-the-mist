// -- Type Imports --
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

/*
 * Per-document text-content cache. A page's parsed text runs are fetched once and held on a WeakMap
 * keyed by the document proxy, so the text layer and (later) search read the same TextContent and
 * never re-parse a page. Destroying the loading task drops the proxy, and its entry auto-GCs with it.
 */

type TextContent = Awaited<ReturnType<PDFPageProxy['getTextContent']>>;

const cache = new WeakMap<PDFDocumentProxy, Map<number, Promise<TextContent>>>();

/** The page's text content, fetched once per (document, page) and memoized; a failed fetch is evicted so it can retry. */
export function getPageTextContent(proxy: PDFDocumentProxy, pageNumber: number): Promise<TextContent> {
   let pages = cache.get(proxy);
   if (!pages) {
      pages = new Map();
      cache.set(proxy, pages);
   }
   const existing = pages.get(pageNumber);
   if (existing) return existing;
   const entry = proxy.getPage(pageNumber).then((page) => page.getTextContent());
   entry.catch(() => pages.delete(pageNumber));
   pages.set(pageNumber, entry);
   return entry;
}
