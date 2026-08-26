// -- Testing Imports --
import { describe, expect, it } from 'vitest';

// -- Unit Under Test --
import { buildPageTextIndex, findMatches, foldText, matchToQuads } from './textLayerGeometry';

// -- Type Imports --
import type { PageTextIndex, RawTextItem } from './textLayerGeometry';

/*
 * The search geometry is verified against pdf.js's own TextLayer math. A scale-1 rotation-0 viewport
 * transform flips Y as `[1,0,0,-1,0,H]`; feeding a run transform `[fontSize,0,0,fontSize,x,yBottom]`
 * through `Util.transform(viewport, run)` puts the run at device `x`, baseline `H - yBottom`, height
 * `fontSize`. The fixture below is chosen so every expected rect is an exact fraction.
 */

// A 200x100 page; the viewport transform flips Y about the page height.
const VW = 200;
const VH = 100;
const VT = [1, 0, 0, -1, 0, 100];

/** A run at fontSize 10, width 40, whose baseline sits at PDF-space `yBottom`. */
function run(str: string, yBottom: number, extra: Partial<RawTextItem> = {}): RawTextItem {
   return { str, transform: [10, 0, 0, 10, 20, yBottom], width: 40, height: 10, ...extra };
}

describe('foldText', () => {
   it('lowercases', () => {
      expect(foldText('Fire BALL')).toBe('fire ball');
   });

   it('strips diacritics to their base letter', () => {
      expect(foldText('Café Éclair')).toBe('cafe eclair');
      expect(foldText('naïve')).toBe('naive');
   });

   it('leaves the German sharp s intact (it does not decompose)', () => {
      expect(foldText('STRAßE')).toBe('straße');
   });

   it('collapses whitespace runs to a single space', () => {
      expect(foldText('a \t\n  b')).toBe('a b');
   });
});

describe('buildPageTextIndex', () => {
   it('maps a single run to its normalized rect', () => {
      const index = buildPageTextIndex([run('Fire', 80)], VT, VW, VH);
      expect(index.folded).toBe('fire');
      expect(index.items).toHaveLength(1);
      expect(index.items[0].start).toBe(0);
      expect(index.items[0].end).toBe(4);
      expect(index.items[0].rect).toEqual({ x: 0.1, y: 0.1, w: 0.2, h: 0.1 });
   });

   it('separates adjacent runs with one space owned by neither span', () => {
      const index = buildPageTextIndex([run('Fire', 80), run('ball', 60)], VT, VW, VH);
      expect(index.folded).toBe('fire ball');
      expect(index.items[0]).toMatchObject({ start: 0, end: 4 });
      expect(index.items[1]).toMatchObject({ start: 5, end: 9 });
      // The second run drops one line (baseline 60 -> device top 0.3).
      expect(index.items[1].rect).toEqual({ x: 0.1, y: 0.3, w: 0.2, h: 0.1 });
   });

   it('does not double-space when the previous run already ends in whitespace', () => {
      const index = buildPageTextIndex([run('Fire ', 80), run('ball', 60)], VT, VW, VH);
      expect(index.folded).toBe('fire ball');
      // The trailing space belongs to the first run's span; no separator is inserted.
      expect(index.items[0]).toMatchObject({ start: 0, end: 5 });
      expect(index.items[1]).toMatchObject({ start: 5, end: 9 });
   });

   it('still separates runs across a line break (hasEOL)', () => {
      const index = buildPageTextIndex([run('Fire', 80, { hasEOL: true }), run('ball', 60)], VT, VW, VH);
      expect(index.folded).toBe('fire ball');
   });

   it('skips empty-string runs, contributing no span', () => {
      const index = buildPageTextIndex([run('Fire', 80), run('', 70), run('ball', 60)], VT, VW, VH);
      expect(index.folded).toBe('fire ball');
      expect(index.items).toHaveLength(2);
   });
});

describe('findMatches', () => {
   it('finds every non-overlapping occurrence left-to-right', () => {
      expect(findMatches('ababab', 'ab')).toEqual([
         { start: 0, length: 2 },
         { start: 2, length: 2 },
         { start: 4, length: 2 },
      ]);
   });

   it('advances past a match so occurrences never overlap', () => {
      // 'aa' in 'aaaa' yields two matches (0 and 2), not three.
      expect(findMatches('aaaa', 'aa')).toEqual([
         { start: 0, length: 2 },
         { start: 2, length: 2 },
      ]);
   });

   it('returns nothing for a query that is absent', () => {
      expect(findMatches('fire ball', 'water')).toEqual([]);
   });

   it('returns nothing for an empty query', () => {
      expect(findMatches('fire ball', '')).toEqual([]);
   });
});

describe('matchToQuads', () => {
   const index: PageTextIndex = buildPageTextIndex([run('Fire', 80), run('ball', 60)], VT, VW, VH);

   it('narrows a single-run partial match on X by the covered fraction', () => {
      // 'ir' is offsets [1,3) of run 0 (span [0,4)): fraction 0.25..0.75 of a 0.2-wide rect.
      const quads = matchToQuads(index, 1, 2);
      expect(quads).toHaveLength(1);
      expect(quads[0].x).toBeCloseTo(0.15, 10);
      expect(quads[0].w).toBeCloseTo(0.1, 10);
      expect(quads[0].y).toBe(0.1);
      expect(quads[0].h).toBe(0.1);
   });

   it('covers a whole run when the match spans its full span', () => {
      // 'ball' is offsets [5,9): the whole second run.
      const quads = matchToQuads(index, 5, 4);
      expect(quads).toEqual([{ x: 0.1, y: 0.3, w: 0.2, h: 0.1 }]);
   });

   it('emits one quad per run for a match spanning multiple runs', () => {
      // 'fire ball' spans both runs; the separator space belongs to neither.
      const quads = matchToQuads(index, 0, 9);
      expect(quads).toEqual([
         { x: 0.1, y: 0.1, w: 0.2, h: 0.1 },
         { x: 0.1, y: 0.3, w: 0.2, h: 0.1 },
      ]);
   });

   it('skips a run the match only touches at a zero-width boundary', () => {
      // A match ending exactly at run 0's end (offset 4) never enters run 1; the separator is at [4,5).
      const quads = matchToQuads(index, 0, 4);
      expect(quads).toEqual([{ x: 0.1, y: 0.1, w: 0.2, h: 0.1 }]);
   });
});
