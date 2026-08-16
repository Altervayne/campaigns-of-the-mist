/*
 * Roll-table content shapes. A roll table is a named list of weighted entries; rolling returns one
 * entry chosen by weight. These types are standalone here and get wired into the board-item and
 * drawer-item unions where those surfaces consume them.
 */

/** One row of a table: its pick weight (>= 1; higher = more likely) and the result text it yields. */
export interface RollTableEntry {
   id: string;
   weight: number;
   text: string;
}

/** A settled roll, kept in history: which entry landed and the text it produced (self-contained). */
export interface RollResultEntry {
   id: string;
   entryId: string;
   text: string;
}

/** How many past rolls a table keeps (newest first); bounded since it rides board / drawer content. */
export const ROLL_TABLE_HISTORY_CAP = 20;

/**
 * How an entry's leading cell reads: its raw pick `weight`, the cumulative dice-style `range` it owns,
 * or its `percent` share of the total. Purely presentational; the roll always weights by raw weight.
 */
export type RollTableDisplay = 'range' | 'weight' | 'percent';

/**
 * A roll table's content: its title, weighted entries, the entry-cell display mode, the last settled
 * roll, and a capped history. The board-item and drawer-item wrappers add their own discriminants
 * (`kind` / item `type`); the game lives on the wrapper (game-agnostic, so `NEUTRAL`), never in here.
 * `display` is optional so tables saved before it existed open unchanged; readers normalize to 'range'.
 */
export interface RollTableContent {
   title: string;
   entries: RollTableEntry[];
   display?: RollTableDisplay;
   lastRoll?: RollResultEntry | null;
   history?: RollResultEntry[];
}
