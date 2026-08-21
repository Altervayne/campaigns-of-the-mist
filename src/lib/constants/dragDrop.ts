/**
 * Constants for drag-and-drop operations
 */

export const DROP_ZONES = {
   CHARACTER_SHEET: 'character-sheet-drop-zone',
   DRAWER: 'drawer-drop-zone',
   DRAWER_ROOT: 'drawer-drop-zone-root',
} as const;

export const DRAG_TYPES = {
   SHEET_CARD: 'sheet-card',
   SHEET_JOURNAL: 'sheet-journal',
   DRAWER_CARD: 'drawer-card',
   DRAWER_TRACKER: 'drawer-tracker',
   DRAWER_FOLDER: 'drawer-folder',
   DRAWER_ITEM: 'drawer-item',
   TRACKER: 'tracker',
   SHEET_TRACKER: 'sheet-tracker',
   DRAWER_BACK_BUTTON: 'drawer-back-button',
   TAB: 'tab',
   THEME: 'theme',
   CARD_PALETTE: 'card-palette',
   STENCIL: 'stencil',
   JOURNAL_PAGE: 'journal-page',
} as const;

export type DropZone = typeof DROP_ZONES[keyof typeof DROP_ZONES];
export type DragType = typeof DRAG_TYPES[keyof typeof DRAG_TYPES];
