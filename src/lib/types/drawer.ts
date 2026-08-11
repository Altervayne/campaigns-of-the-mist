// -- Type Imports --
import type { Card, Tracker, Character } from './character.ts';
import type { Board, PostItNote, Journal, Note } from './board.ts';
import type { GameSystem, GeneralItemType } from './common.ts';
import type { RollTableContent } from '@/lib/rolltable/types';

// Re-export common types for backward compatibility
export type { GameSystem, GeneralItemType };

// A drawer item wraps one saved aggregate: a card, a tracker, a whole character
// (`FULL_CHARACTER_SHEET`), a whole board (`FULL_BOARD`), a post-it (`POST_IT`), a
// journal (`JOURNAL`), a note (`NOTE`), or a roll table (`ROLL_TABLE`).
export type DrawerItemContent = Card | Tracker | Character | Board | PostItNote | Journal | Note | RollTableContent;

export interface DrawerItem {
   id: string;
   game: GameSystem;
   type: GeneralItemType;
   name: string;
   content: DrawerItemContent;
}

export interface Folder {
   id: string;
   name: string;
   items: DrawerItem[];
   folders: Folder[];
}


export interface Drawer {
   version?: string;
   folders: Folder[];
   rootItems: DrawerItem[];
}
