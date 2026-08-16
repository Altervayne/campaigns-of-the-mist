// -- Type Imports --
import type { RollTableContent, RollTableDisplay, RollTableEntry } from './types';

/*
 * The roll table's display layer: a non-destructive default for the `display` mode and the per-entry
 * leading-cell text for each mode. Pure and framework-free so the label math is directly testable.
 */

/**
 * Fills in `display` when a table lacks it (data saved before the field existed), defaulting to 'range'.
 * Idempotent: a table already carrying a mode is returned unchanged, so this never rewrites identity.
 * Generic over the concrete content so a caller keeps its own shape (the board adds `kind`). Mirrors the
 * dice tray's read-time normalize; the field then persists once a commit spreads the returned content.
 */
export function normalizeRollTableContent<T extends RollTableContent>(content: T): T {
   if (content.display) return content;
   return { ...content, display: 'range' };
}

/**
 * Each entry's cumulative range START (the running sum of preceding weights, plus 1), index-aligned with
 * `entries`. The band an entry owns is `start .. start + weight - 1`; the next entry starts one past it.
 */
export function computeRangeStarts(entries: RollTableEntry[]): number[] {
   let lo = 1;
   return entries.map((entry) => {
      const start = lo;
      lo += entry.weight;
      return start;
   });
}

/** The weight implied by editing a range END, given the row's fixed START: `end - start + 1`, floored to 1. */
export function rangeEndToWeight(end: number, start: number): number {
   return Math.max(1, end - start + 1);
}

/**
 * The leading-cell text for each entry under the given display mode:
 * - 'weight'  the raw pick weight.
 * - 'range'   the cumulative dice-style band the entry owns (running lo/hi); a width-1 band shows a
 *             single number, wider bands show "lo-hi".
 * - 'percent' the entry's rounded share of the total weight; a zero total yields "0%".
 * Presentational only, so weights are read as-is (the roll's sub-1 floor never surfaces here).
 */
export function computeEntryLabels(entries: RollTableEntry[], display: RollTableDisplay): string[] {
   if (display === 'weight') return entries.map((entry) => String(entry.weight));

   if (display === 'percent') {
      const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
      return entries.map((entry) => (total === 0 ? '0%' : `${Math.round((entry.weight / total) * 100)}%`));
   }

   const starts = computeRangeStarts(entries);
   return entries.map((entry, index) => {
      const start = starts[index];
      const hi = start + entry.weight - 1;
      return entry.weight <= 1 ? String(start) : `${start}-${hi}`;
   });
}
