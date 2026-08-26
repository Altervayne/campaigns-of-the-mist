// -- Testing Imports --
import { describe, expect, it } from 'vitest';

// -- Unit Under Test --
import { getPageTextContent } from './pdfTextContent';

// -- Type Imports --
import type { PDFDocumentProxy } from 'pdfjs-dist';

/*
 * A fake document proxy that counts getTextContent calls per page, so the cache's one-fetch-per-page
 * behavior is observable without pdf.js.
 */
function makeFakeProxy() {
   const calls = new Map<number, number>();
   const proxy = {
      getPage: (pageNumber: number) =>
         Promise.resolve({
            getTextContent: () => {
               calls.set(pageNumber, (calls.get(pageNumber) ?? 0) + 1);
               return Promise.resolve({ items: [], styles: {}, lang: null });
            },
         }),
   } as unknown as PDFDocumentProxy;
   return { proxy, calls };
}

describe('getPageTextContent', () => {
   it('fetches a page once and returns the same promise on repeat', async () => {
      const { proxy, calls } = makeFakeProxy();

      const first = getPageTextContent(proxy, 1);
      const second = getPageTextContent(proxy, 1);
      expect(second).toBe(first);

      await Promise.all([first, second]);
      expect(calls.get(1)).toBe(1);
   });

   it('fetches distinct pages independently', async () => {
      const { proxy, calls } = makeFakeProxy();

      await Promise.all([getPageTextContent(proxy, 1), getPageTextContent(proxy, 2)]);

      expect(calls.get(1)).toBe(1);
      expect(calls.get(2)).toBe(1);
   });

   it('keys the cache per document, so a different proxy fetches afresh', async () => {
      const a = makeFakeProxy();
      const b = makeFakeProxy();

      await Promise.all([getPageTextContent(a.proxy, 1), getPageTextContent(b.proxy, 1)]);

      expect(a.calls.get(1)).toBe(1);
      expect(b.calls.get(1)).toBe(1);
   });
});
