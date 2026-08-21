export type GameSystem = 'LEGENDS' | 'CITY_OF_MIST' | 'OTHERSCAPE' | 'NEUTRAL';

/** The games that have a Challenge Card variant. Only NEUTRAL has none. */
export type ChallengeGame = 'LEGENDS' | 'OTHERSCAPE' | 'CITY_OF_MIST';

export type GeneralItemType =
   | 'FULL_DRAWER'
   | 'FOLDER'
   | 'CHARACTER_CARD'
   | 'CHARACTER_THEME'
   | 'GROUP_THEME'
   | 'LOADOUT_THEME'
   | 'IMAGE_CARD'
   | 'CHALLENGE_CARD'
   | 'STATUS_TRACKER'
   | 'STORY_TAG_TRACKER'
   | 'STORY_THEME_TRACKER'
   | 'POST_IT'
   | 'JOURNAL'
   | 'NOTE'
   | 'ROLL_TABLE'
   | 'FULL_CHARACTER_SHEET'
   | 'FULL_BOARD';

/**
 * Drag-and-drop type utilities
 */

/**
 * Drag item types used in drag-and-drop operations
 */
export type DragItemType =
   | 'sheet-card'
   | 'sheet-journal'
   | 'drawer-card'
   | 'drawer-tracker'
   | 'drawer-folder'
   | 'drawer-item'
   | 'tracker'
   | 'sheet-tracker'
   | 'theme'
   | 'card-palette'
   | 'stencil'
   | 'journal-page';

/**
 * Draggable item type - represents the actual data being dragged
 * This is a forward declaration to avoid circular dependencies.
 * Uses object type to accept any structured data (cards, trackers, folders, etc.)
 * without requiring index signatures on those types.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DraggableItem = any;

/**
 * Drag data interface for drag-and-drop operations
 */
export interface DragData {
   type: DragItemType;
   item: DraggableItem;
   [key: string]: unknown;
}

/**
 * Check if drag data represents a card (from any source)
 * @param data - The drag data to check
 * @returns True if the data represents a card
 */
export function isCardType(data?: DragData): boolean {
   return data?.type === 'sheet-card' || data?.type === 'drawer-card';
}

/**
 * Check if drag data represents a tracker (from any source)
 * @param data - The drag data to check
 * @returns True if the data represents a tracker
 */
export function isTrackerType(data?: DragData): boolean {
   return data?.type === 'tracker' || data?.type === 'drawer-tracker';
}

/**
 * Check if drag data represents a drawer item
 * @param data - The drag data to check
 * @returns True if the data represents a drawer item
 */
export function isDrawerItemType(data?: DragData): boolean {
   return data?.type === 'drawer-card' ||
          data?.type === 'drawer-tracker' ||
          data?.type === 'drawer-item';
}

/**
 * Check if drag data represents a drawer folder
 * @param data - The drag data to check
 * @returns True if the data represents a drawer folder
 */
export function isDrawerFolderType(data?: DragData): boolean {
   return data?.type === 'drawer-folder';
}
