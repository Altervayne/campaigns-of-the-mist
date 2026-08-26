// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { resolveOutline } from './pdfOutline';

// -- Type Imports --
import type { PDFDocumentProxy } from 'pdfjs-dist';

/*
 * A stub proxy exposing only the three methods the resolver touches. `getPageIndex` maps a fake ref to a
 * 0-based index via its `num`, throwing on an unknown ref so an unresolvable dest is exercised.
 */
interface FakeProxyOptions {
   outline: unknown;
   destinations?: Record<string, unknown[] | null>;
   pageIndexByNum?: Record<number, number>;
}

function fakeProxy({ outline, destinations = {}, pageIndexByNum = {} }: FakeProxyOptions): PDFDocumentProxy {
   return {
      getOutline: async () => outline,
      getDestination: async (name: string) => destinations[name] ?? null,
      getPageIndex: async (ref: { num: number }) => {
         const index = pageIndexByNum[ref.num];
         if (index === undefined) throw new Error('unknown ref');
         return index;
      },
   } as unknown as PDFDocumentProxy;
}

describe('resolveOutline', () => {
   it('returns [] when the document has no outline', async () => {
      const proxy = fakeProxy({ outline: null });
      expect(await resolveOutline(proxy)).toEqual([]);
   });

   it('resolves nested entries to 1-based pages with their children', async () => {
      const proxy = fakeProxy({
         outline: [
            {
               title: 'Chapter 1',
               dest: [{ num: 10, gen: 0 }],
               items: [
                  { title: 'Section 1.1', dest: [{ num: 12, gen: 0 }], items: [] },
                  // A named dest resolves through getDestination before the ref lookup.
                  { title: 'Section 1.2', dest: 'named-1-2', items: [] },
               ],
            },
            { title: 'Chapter 2', dest: [{ num: 40, gen: 0 }], items: [] },
         ],
         destinations: { 'named-1-2': [{ num: 15, gen: 0 }] },
         pageIndexByNum: { 10: 0, 12: 4, 15: 7, 40: 39 },
      });

      expect(await resolveOutline(proxy)).toEqual([
         {
            title: 'Chapter 1',
            page: 1,
            children: [
               { title: 'Section 1.1', page: 5, children: [] },
               { title: 'Section 1.2', page: 8, children: [] },
            ],
         },
         { title: 'Chapter 2', page: 40, children: [] },
      ]);
   });

   it('yields page: null for a dest that cannot be resolved', async () => {
      const proxy = fakeProxy({
         outline: [
            { title: 'Missing ref', dest: [{ num: 99, gen: 0 }], items: [] },
            { title: 'No dest', dest: null, items: [] },
            { title: 'Unknown name', dest: 'nope', items: [] },
         ],
         pageIndexByNum: { 10: 0 },
      });

      expect(await resolveOutline(proxy)).toEqual([
         { title: 'Missing ref', page: null, children: [] },
         { title: 'No dest', page: null, children: [] },
         { title: 'Unknown name', page: null, children: [] },
      ]);
   });
});
