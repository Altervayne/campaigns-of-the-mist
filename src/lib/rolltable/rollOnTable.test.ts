// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { appendRollResult, rollOnTable } from './rollOnTable';
import { ROLL_TABLE_HISTORY_CAP } from './types';

// -- Type Imports --
import type { RollResultEntry, RollTableEntry } from './types';

/*
 * Tests for the pure weighted-pick roll. A fixed / scripted RNG makes the chosen entry deterministic so
 * the cumulative-weight walk, bias, and boundaries can be asserted exactly.
 */

const entry = (id: string, weight: number, text = id): RollTableEntry => ({ id, weight, text });

describe('rollOnTable', () => {
   it('returns null for an empty table', () => {
      expect(rollOnTable([], () => 0)).toBeNull();
   });

   it('always returns the only entry of a single-entry table', () => {
      const only = entry('a', 1);
      expect(rollOnTable([only], () => 0)).toBe(only);
      expect(rollOnTable([only], () => 0.999)).toBe(only);
   });

   it('walks cumulative weights: draw lands in the entry whose band contains it', () => {
      // weights [1,1,2] -> total 4, bands: a=[0,1) b=[1,2) c=[2,4).
      const table = [entry('a', 1), entry('b', 1), entry('c', 2)];
      expect(rollOnTable(table, () => 0 / 4)?.id).toBe('a');
      expect(rollOnTable(table, () => 1 / 4)?.id).toBe('b');
      expect(rollOnTable(table, () => 2 / 4)?.id).toBe('c');
      expect(rollOnTable(table, () => 3.9 / 4)?.id).toBe('c');
   });

   it('respects bias: a heavier entry claims proportionally more of the range', () => {
      // weights [3,1] -> total 4, a owns [0,3), b owns [3,4).
      const table = [entry('a', 3), entry('b', 1)];
      expect(rollOnTable(table, () => 2.9 / 4)?.id).toBe('a');
      expect(rollOnTable(table, () => 3.1 / 4)?.id).toBe('b');
   });

   it('floors a sub-1 weight to 1 so no entry is unreachable and the total is never zero', () => {
      // weights [0,0] both floored to 1 -> total 2, a=[0,1) b=[1,2).
      const table = [entry('a', 0), entry('b', 0)];
      expect(rollOnTable(table, () => 0)?.id).toBe('a');
      expect(rollOnTable(table, () => 0.75)?.id).toBe('b');
   });

   it('assigns the top-of-range sliver (rng at exactly 1) to the last entry', () => {
      const table = [entry('a', 1), entry('b', 1)];
      expect(rollOnTable(table, () => 1)?.id).toBe('b');
   });

   it('produces a bias-consistent distribution over many draws', () => {
      const table = [entry('a', 3), entry('b', 1)];
      const seq = Array.from({ length: 1000 }, (_, i) => i / 1000);
      let i = 0;
      const rng = () => seq[i++ % seq.length];
      const counts = { a: 0, b: 0 } as Record<string, number>;
      for (let n = 0; n < 1000; n++) counts[rollOnTable(table, rng)!.id]++;
      // a owns 3/4 of the uniform sweep, b owns 1/4.
      expect(counts.a).toBe(750);
      expect(counts.b).toBe(250);
   });
});

describe('appendRollResult', () => {
   const result = (id: string): RollResultEntry => ({ id, entryId: id, text: id });

   it('prepends newest-first without mutating the input', () => {
      const history = [result('old')];
      const next = appendRollResult(history, result('new'));
      expect(next.map((r) => r.id)).toEqual(['new', 'old']);
      expect(history.map((r) => r.id)).toEqual(['old']);
   });

   it('drops the oldest past the cap', () => {
      let history: RollResultEntry[] = [];
      for (let i = 0; i < ROLL_TABLE_HISTORY_CAP + 5; i++) history = appendRollResult(history, result(`r${i}`));
      expect(history).toHaveLength(ROLL_TABLE_HISTORY_CAP);
      expect(history[0].id).toBe(`r${ROLL_TABLE_HISTORY_CAP + 4}`);
   });
});
