// -- Type Imports --
import type { RollEntry } from '@/lib/dice/diceTrayTypes';

/*
 * Pure display formatters for the dice tray, shared by the tray body, its modifier rows, and the
 * history log. No React, no state - just string shaping over already-computed values.
 */

/** Formats a signed modifier value for display (`+2` / `-1`). */
export const signed = (value: number): string => (value >= 0 ? `+${value}` : `${value}`);

/** A compact one-line summary of a past roll, e.g. `2d6 -1d8 +3` (dice grouped by sides + sign, then mods). */
export function summarizeRoll(entry: RollEntry): string {
   const groups: { sides: number; negative: boolean; count: number }[] = [];
   for (const die of entry.dice) {
      const group = groups.find((g) => g.sides === die.sides && g.negative === !!die.negative);
      if (group) group.count += 1;
      else groups.push({ sides: die.sides, negative: !!die.negative, count: 1 });
   }
   const parts = [
      ...groups.map((g) => `${g.negative ? '-' : ''}${g.count}d${g.sides}`),
      ...entry.modifiers.map((m) => signed(m.value)),
   ];
   return parts.length > 0 ? parts.join(' ') : '—';
}
