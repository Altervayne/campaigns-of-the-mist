// -- Icon Imports --
import { Gamepad, LayoutGrid, ListChecks, Shapes, Skull, VectorSquare } from 'lucide-react';

// -- Type Imports --
import type { CreatableKind } from './creatableRegistry';
import type { LucideIcon } from 'lucide-react';
import type { TrackerType } from '@/lib/trackers/emptyTracker';
import type { GeneralItemType } from '@/lib/types/drawer';

/*
 * The creatable-element taxonomy: ONE ordered tree the creation surfaces (the toolbar Add popover +
 * the radial) both read, so their catalogs can't drift. Three flat groups at the root -
 * Basic, Rich, Game - with no umbrella node. The board-furniture groups list registry kinds and
 * pull their icon/label/factory from `CREATABLE_BY_KIND`; the Game group carries the three
 * non-registry paths (trackers, cards by game, challenge) with their own handler identity.
 */

/** The three root groups, in presentation order. */
export type CreationGroupKey = 'basic' | 'rich' | 'game';

/** A tracker row under the Game group's Trackers branch (glyph resolved from its drawer item type). */
export interface CreationTrackerRow {
   id: string;
   trackerType: TrackerType;
   itemType: GeneralItemType;
   labelKey: string;
}

/**
 * A Game-group row. Each carries the handler identity a surface routes to: `trackers` opens a
 * sub-branch of tracker kinds, `cards` opens a sub-branch of games (the card creation form), and
 * `challenge` drops immediately.
 */
export type CreationGameRow =
   | { kind: 'trackers'; icon: LucideIcon; labelKey: string; rows: CreationTrackerRow[] }
   | { kind: 'cards'; icon: LucideIcon; labelKey: string }
   | { kind: 'challenge'; icon: LucideIcon; labelKey: string };

/** A board-furniture group (Basic / Rich): registry kinds in presentation order. */
export interface CreationBoardGroup {
   key: 'basic' | 'rich';
   icon: LucideIcon;
   labelKey: string;
   kinds: CreatableKind[];
}

/** The Game group: non-registry rows with their own handlers. */
export interface CreationGameGroup {
   key: 'game';
   icon: LucideIcon;
   labelKey: string;
   rows: CreationGameRow[];
}

export type CreationGroup = CreationBoardGroup | CreationGameGroup;

/** The tracker kinds the Game group offers, mirroring the drawer's tracker glyphs. */
const TRACKER_ROWS: CreationTrackerRow[] = [
   { id: 'status', trackerType: 'STATUS', itemType: 'STATUS_TRACKER', labelKey: 'Common.addStatus' },
   { id: 'story-tag', trackerType: 'STORY_TAG', itemType: 'STORY_TAG_TRACKER', labelKey: 'Trackers.addStoryTag' },
   { id: 'story-theme', trackerType: 'STORY_THEME', itemType: 'STORY_THEME_TRACKER', labelKey: 'Trackers.addStoryTheme' },
];

/**
 * The root groups in order: Basic -> Rich -> Game. The board-furniture kinds reference
 * {@link CREATABLE_BY_KIND} for their icon/label/factory; the Game rows keep their handler identity.
 */
export const CREATION_TAXONOMY: CreationGroup[] = [
   { key: 'basic', icon: Shapes, labelKey: 'BoardView.creationBasic', kinds: ['text', 'image', 'pin', 'portal'] },
   { key: 'rich', icon: VectorSquare, labelKey: 'BoardView.creationRich', kinds: ['post-it', 'journal', 'zone', 'dice-tray', 'roll-table'] },
   {
      key: 'game',
      icon: Gamepad,
      labelKey: 'BoardView.creationGame',
      rows: [
         { kind: 'trackers', icon: ListChecks, labelKey: 'BoardView.radialTrackers', rows: TRACKER_ROWS },
         { kind: 'cards', icon: LayoutGrid, labelKey: 'BoardView.radialCards' },
         { kind: 'challenge', icon: Skull, labelKey: 'BoardView.addChallenge' },
      ],
   },
];
