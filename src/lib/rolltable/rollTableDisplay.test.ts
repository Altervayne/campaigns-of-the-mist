// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { computeEntryLabels, computeRangeStarts, normalizeRollTableContent, rangeEndToWeight } from './rollTableDisplay';

// -- Type Imports --
import type { RollTableContent, RollTableEntry } from './types';

/*
 * Tests for the display layer: the non-destructive `display` default and the per-mode entry-cell labels.
 */

const entry = (weight: number): RollTableEntry => ({ id: `e${weight}`, weight, text: '' });

describe('normalizeRollTableContent', () => {
   const base: RollTableContent = { title: 't', entries: [] };

   it('defaults a table with no display to range', () => {
      expect(normalizeRollTableContent(base).display).toBe('range');
   });

   it('leaves an existing mode untouched and keeps identity', () => {
      const weighted: RollTableContent = { ...base, display: 'weight' };
      expect(normalizeRollTableContent(weighted)).toBe(weighted);
   });
});

describe('computeEntryLabels', () => {
   it('passes raw weights through in weight mode', () => {
      expect(computeEntryLabels([entry(1), entry(3), entry(2)], 'weight')).toEqual(['1', '3', '2']);
   });

   it('shows a single number for a width-1 band and lo-hi for wider bands (cumulative)', () => {
      // weights [1,3,2] -> bands 1, 2-4, 5-6.
      expect(computeEntryLabels([entry(1), entry(3), entry(2)], 'range')).toEqual(['1', '2-4', '5-6']);
   });

   it('renders every width-1 entry as its own number in range mode', () => {
      expect(computeEntryLabels([entry(1), entry(1), entry(1)], 'range')).toEqual(['1', '2', '3']);
   });

   it('rounds each entry share in percent mode', () => {
      // weights [1,1,2] -> total 4 -> 25%, 25%, 50%.
      expect(computeEntryLabels([entry(1), entry(1), entry(2)], 'percent')).toEqual(['25%', '25%', '50%']);
   });

   it('guards a zero total in percent mode', () => {
      expect(computeEntryLabels([entry(0), entry(0)], 'percent')).toEqual(['0%', '0%']);
   });

   it('returns an empty list for an empty table', () => {
      expect(computeEntryLabels([], 'range')).toEqual([]);
      expect(computeEntryLabels([], 'percent')).toEqual([]);
   });
});

describe('computeRangeStarts', () => {
   it('runs the cumulative start of each band from 1', () => {
      // weights [1,3,2] -> starts 1, 2, 5.
      expect(computeRangeStarts([entry(1), entry(3), entry(2)])).toEqual([1, 2, 5]);
   });
});

describe('rangeEndToWeight', () => {
   it('turns an end into the width from its start', () => {
      expect(rangeEndToWeight(1, 1)).toBe(1); // single-width band
      expect(rangeEndToWeight(4, 2)).toBe(3); // 2-4 spans 3
   });

   it('floors an end below its start to weight 1', () => {
      expect(rangeEndToWeight(1, 3)).toBe(1);
      expect(rangeEndToWeight(0, 5)).toBe(1);
   });
});

describe('editing a range end reflows subsequent bands', () => {
   it('recomputes the following rows starts after one row grows', () => {
      const entries = [entry(1), entry(1), entry(1)];
      expect(computeEntryLabels(entries, 'range')).toEqual(['1', '2', '3']);

      // Widen the first row by dragging its end from 1 to 3.
      const start = computeRangeStarts(entries)[0];
      const widened = [{ ...entries[0], weight: rangeEndToWeight(3, start) }, entries[1], entries[2]];

      expect(widened[0].weight).toBe(3);
      expect(computeRangeStarts(widened)).toEqual([1, 4, 5]);
      expect(computeEntryLabels(widened, 'range')).toEqual(['1-3', '4', '5']);
   });
});
