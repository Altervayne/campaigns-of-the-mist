// -- Testing Imports --
import { describe, expect, it } from 'vitest';

// -- Unit Under Test --
import { getPageTextIndex } from './pdfPageTextIndex';

// -- Type Imports --
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { RawTextItem } from './textLayerGeometry';

/*
 * The index cache mirrors the text-content cache: one build per (document, page), evicted on failure so a
 * retry can succeed. A fake proxy supplies both the page text and a scale-1 viewport, and counts parses, so
 * the memoization is observable without pdf.js.
 */

function textRun(str: string, x: number): RawTextItem {
   return { str, transform: [10, 0, 0, 10, x, 80], width: 40, height: 10 };
}

/** A fake proxy that counts getTextContent calls per page and returns a fixed scale-1 viewport. */
function makeFakeProxy(pages: Record<number, RawTextItem[]>) {
   const calls = new Map<number, number>();
   const proxy = {
      getPage: (pageNumber: number) =>
         Promise.resolve({
            getTextContent: () => {
               calls.set(pageNumber, (calls.get(pageNumber) ?? 0) + 1);
               return Promise.resolve({ items: pages[pageNumber] ?? [], styles: {}, lang: null });
            },
            getViewport: () => ({ transform: [1, 0, 0, -1, 0, 100], width: 200, height: 100 }),
         }),
   } as unknown as PDFDocumentProxy;
   return { proxy, calls };
}

describe('getPageTextIndex', () => {
   it('builds a page once and returns the same promise on repeat', async () => {
      const { proxy, calls } = makeFakeProxy({ 1: [textRun('Fire', 20)] });

      const first = getPageTextIndex(proxy, 1);
      const second = getPageTextIndex(proxy, 1);
      expect(second).toBe(first);

      const index = await first;
      expect(index.folded).toBe('fire');
      expect(index.items[0].rect).toEqual({ x: 0.1, y: 0.1, w: 0.2, h: 0.1 });
      expect(calls.get(1)).toBe(1);
   });

   it('builds distinct pages independently', async () => {
      const { proxy, calls } = makeFakeProxy({ 1: [textRun('Fire', 20)], 2: [textRun('Ball', 20)] });

      const [one, two] = await Promise.all([getPageTextIndex(proxy, 1), getPageTextIndex(proxy, 2)]);
      expect(one.folded).toBe('fire');
      expect(two.folded).toBe('ball');
      expect(calls.get(1)).toBe(1);
      expect(calls.get(2)).toBe(1);
   });

   it('evicts a failed build so a later call can retry', async () => {
      let attempts = 0;
      const proxy = {
         getPage: (pageNumber: number) =>
            Promise.resolve({
               getTextContent: () => {
                  attempts += 1;
                  if (attempts === 1) return Promise.reject(new Error('parse failed'));
                  return Promise.resolve({ items: [textRun('Fire', 20)], styles: {}, lang: null });
               },
               getViewport: () => ({ transform: [1, 0, 0, -1, 0, 100], width: 200, height: 100 }),
               _page: pageNumber,
            }),
      } as unknown as PDFDocumentProxy;

      await expect(getPageTextIndex(proxy, 1)).rejects.toThrow('parse failed');

      const index = await getPageTextIndex(proxy, 1);
      expect(index.folded).toBe('fire');
      expect(attempts).toBe(2);
   });
});
