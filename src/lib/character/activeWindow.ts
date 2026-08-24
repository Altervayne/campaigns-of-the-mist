/*
 * The workspace's active surface, as a single string. The sidebar's action set and the
 * page's surface switch both dispatch on it, so the precedence lives in one place instead
 * of once per reader.
 */

/** The surfaces the workspace can show. */
export type ActiveWindow = 'MAIN_MENU' | 'PLAY_AREA' | 'BOARD' | 'NOTE' | 'PDF';

/** The inputs, as plain booleans - the resolver stays free of the store shapes behind them. */
export interface ActiveWindowInputs {
   hasPdf: boolean;
   hasNote: boolean;
   hasBoard: boolean;
   hasCharacter: boolean;
}

/**
 * Resolves the active surface, precedence pdf -> note -> board -> character -> menu. A pdf, note, or
 * board tab takes the workspace over even while a character is loaded; nothing active falls back to
 * the menu. Exactly one of the entity flags is ever set (the TabManager's active-pointer park), so
 * the precedence only orders an impossible tie.
 */
export function resolveActiveWindow({ hasPdf, hasNote, hasBoard, hasCharacter }: ActiveWindowInputs): ActiveWindow {
   if (hasPdf) return 'PDF';
   if (hasNote) return 'NOTE';
   if (hasBoard) return 'BOARD';
   if (hasCharacter) return 'PLAY_AREA';
   return 'MAIN_MENU';
}
