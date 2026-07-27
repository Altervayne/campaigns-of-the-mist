// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { signed, summarizeRoll } from './diceFormat';

// -- Type Imports --
import type { RollEntry } from '@/lib/dice/diceTrayTypes';

/*
 * Tests for the dice-tray display formatters. Both are pure over already-rolled data, so the
 * assertions are on the rendered string alone.
 */

/** A history entry with only the fields the summary reads; the rest are filler. */
const entry = (dice: RollEntry['dice'], modifiers: RollEntry['modifiers'] = []): RollEntry =>
   ({ id: 'e1', at: 0, dice, modifiers, faces: [], total: 0 });

describe('signed', () => {
   it('prefixes a plus on zero and positives, keeps the minus on negatives', () => {
      expect(signed(0)).toBe('+0');
      expect(signed(2)).toBe('+2');
      expect(signed(-1)).toBe('-1');
   });
});

describe('summarizeRoll', () => {
   it('groups dice by side count, in first-seen order', () => {
      expect(summarizeRoll(entry([{ sides: 6 }, { sides: 20 }, { sides: 6 }]))).toBe('2d6 1d20');
   });

   it('keeps penalty dice in a separate group from normal dice of the same size', () => {
      expect(summarizeRoll(entry([{ sides: 6 }, { sides: 6, negative: true }, { sides: 6 }]))).toBe('2d6 -1d6');
   });

   it('appends the signed modifiers after the dice', () => {
      const summary = summarizeRoll(entry([{ sides: 6 }], [{ label: 'Strength', value: 3 }, { value: -1 }]));
      expect(summary).toBe('1d6 +3 -1');
   });

   it('summarizes a modifier-only roll', () => {
      expect(summarizeRoll(entry([], [{ value: 2 }]))).toBe('+2');
   });

   it('falls back to a dash when there is nothing to summarize', () => {
      expect(summarizeRoll(entry([]))).toBe('—');
   });
});
