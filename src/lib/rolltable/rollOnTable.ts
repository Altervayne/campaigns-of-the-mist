// -- Type Imports --
import type { RollResultEntry, RollTableEntry } from '@/lib/rolltable/types';

import { ROLL_TABLE_HISTORY_CAP } from '@/lib/rolltable/types';

/*
 * The weighted-pick roll, a pure function over a table's entry list. Kept framework-free with an
 * injected RNG so distribution and bias are deterministically testable. The one genuinely new
 * primitive the feature needs; the dice engine has no weighted pick.
 */

/**
 * Picks one entry at random, biased by weight (an entry with weight 2 is twice as likely as weight 1;
 * equal weights are uniform). A weight below 1 is floored to 1 so no entry is unreachable and the total
 * is never zero. `rng` (default `Math.random`) is injectable for deterministic tests. Returns `null`
 * for an empty table.
 */
export function rollOnTable(entries: RollTableEntry[], rng: () => number = Math.random): RollTableEntry | null {
   if (entries.length === 0) return null;
   const weightOf = (entry: RollTableEntry) => (entry.weight >= 1 ? entry.weight : 1);
   const total = entries.reduce((sum, entry) => sum + weightOf(entry), 0);
   let draw = rng() * total;
   for (const entry of entries) {
      draw -= weightOf(entry);
      if (draw < 0) return entry;
   }
   // Floating-point drift can leave draw at the total; the last entry owns that sliver.
   return entries[entries.length - 1];
}

/** Prepends a roll to the history, newest first, dropping the oldest past the cap. Pure (no mutation). */
export function appendRollResult(history: RollResultEntry[], entry: RollResultEntry, cap: number = ROLL_TABLE_HISTORY_CAP): RollResultEntry[] {
   return [entry, ...history].slice(0, cap);
}
