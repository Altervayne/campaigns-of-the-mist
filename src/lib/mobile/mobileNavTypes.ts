/**
 * The canonical mobile navigation vocabulary, shared by the store bridge, the page that owns the
 * local nav state, and the tutorial runner - one source of truth so none of the three can drift.
 * Kept dependency-free (pure types) so importing it never forms a cycle between the store and the page.
 */

/** Every full-screen destination the mobile shell can show (the page's `activeTab`). */
export type MobileTabId =
   | 'sheet'
   | 'drawer'
   | 'menu'
   | 'settings'
   | 'settingsGeneral'
   | 'settingsAppearance'
   | 'settingsCardPalettes'
   | 'settingsData'
   | 'settingsLearn'
   | 'themeEditor'
   | 'cardPaletteEditor'
   | 'about'
   | 'patchNotes'
   | 'announcements'
   | 'addCard'
   | 'editPortrait';

/** The two sub-tabs inside the character sheet. */
export type MobileSheetTab = 'trackers' | 'cards';

/**
 * The page's nav position, published so a tutorial can capture and restore it. The page never reads it
 * back to drive itself, but a tutorial gate may observe it - `reordering` is the card-reorder mode, the
 * one nav flag a step waits on rather than only restores.
 */
export interface MobileNavSnapshot {
   tab: MobileTabId;
   sheetTab: MobileSheetTab;
   toolbeltOpen: boolean;
   fabExpanded: boolean;
   reordering: boolean;
}

/**
 * A serializable nav request the page consumes against its own setters (mirrors `BoardAction`). A
 * definition never captures a page setter, so the runner drives the mobile shell through these instead.
 * `restore` reinstates a captured landing position (used on tutorial exit).
 */
export type MobileNavAction =
   | { kind: 'navTab'; tab: MobileTabId }
   | { kind: 'sheetTab'; tab: MobileSheetTab }
   | { kind: 'toolbelt'; open: boolean }
   | { kind: 'fab'; expanded: boolean }
   | { kind: 'reorder'; active: boolean }
   | { kind: 'restore'; snapshot: MobileNavSnapshot };
