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
 * A roll table's content: its title, weighted entries, the last settled roll, and a capped history.
 * The board-item and drawer-item wrappers add their own discriminants (`kind` / item `type`); the
 * game lives on the wrapper (game-agnostic, so `NEUTRAL`), never in here.
 */
export interface RollTableContent {
   title: string;
   entries: RollTableEntry[];
   lastRoll?: RollResultEntry | null;
   history?: RollResultEntry[];
}
