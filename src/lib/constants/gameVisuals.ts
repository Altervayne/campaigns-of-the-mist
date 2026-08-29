// -- Icon Imports --
import { ScrollText, Building2, CircuitBoard, Dices, LayoutGrid, NotebookPen, FileType } from 'lucide-react';

// -- Type Imports --
import type { LucideIcon } from 'lucide-react';
import type { GameSystem, ChallengeGame } from '@/lib/types/common';

/*
 * Single source of truth for per-game visuals (icon + colors), shared by the
 * MainMenu game picker, the New Tab dialog, and the tab strip's game-icon block.
 * Previously the icon/color mapping was duplicated inline in `MainMenu` and
 * `NewTabDialog`; this consolidates it so the three surfaces stay in sync.
 */

/** The icon + color treatment for one game system. */
export interface GameVisual {
   /** The lucide icon component for the game. */
   Icon: LucideIcon;
   /** Tailwind text-color class for the game's accent (a coloured icon on a card). */
   accentText: string;
   /** Tailwind background class for the game's solid colour (a white icon on a tab block). */
   solidBg: string;
   /** Tailwind gradient classes for the faded wash behind a game card. */
   gradient: string;
}

/**
 * Visuals for every {@link GameSystem}. `NEUTRAL` doubles as the placeholder for a
 * tab whose game is momentarily unavailable (it is never offered in the pickers).
 */
export const GAME_VISUALS: Record<GameSystem, GameVisual> = {
   LEGENDS: {
      Icon: ScrollText,
      accentText: 'text-amber-500',
      solidBg: 'bg-amber-500',
      gradient: 'bg-gradient-to-br from-amber-500 via-orange-400 to-rose-500',
   },
   CITY_OF_MIST: {
      Icon: Building2,
      accentText: 'text-purple-500',
      solidBg: 'bg-purple-500',
      gradient: 'bg-gradient-to-br from-purple-500 via-fuchsia-500 to-pink-600',
   },
   OTHERSCAPE: {
      Icon: CircuitBoard,
      accentText: 'text-cyan-500',
      solidBg: 'bg-cyan-500',
      gradient: 'bg-gradient-to-br from-cyan-500 via-blue-500 to-indigo-600',
   },
   NEUTRAL: {
      Icon: Dices,
      accentText: 'text-muted-foreground',
      solidBg: 'bg-muted-foreground',
      gradient: 'bg-gradient-to-br from-slate-400 via-slate-500 to-slate-600',
   },
};

/** Resolves a game's visual, falling back to the neutral placeholder for an absent game. */
export function getGameVisual(game: GameSystem | undefined | null): GameVisual {
   return GAME_VISUALS[game ?? 'NEUTRAL'];
}

/**
 * The Board's fixed identity accent - emerald/green, deliberately outside the games' palette (Legends
 * amber, City purple, Otherscape cyan) so a board tab never reads as an Otherscape one. A
 * feature-identity colour like the game brands above, NOT a theme token. Shared by the board tab badge,
 * its drag clone, and the New Tab "New Board" card so the three can't drift.
 */
export const BOARD_VISUAL = {
   /** The board's glyph, shared by the tab badge, drag clone, and the picker card so they can't drift. */
   Icon: LayoutGrid,
   /** Coloured icon on a card (the New Tab board card's glyph). */
   accentText: 'text-emerald-500',
   /** The solid wash behind a white board glyph (the tab badge + its drag clone, the chooser card). */
   gradient: 'bg-gradient-to-br from-emerald-500 to-green-600',
   /** Space-separated RGB triple (emerald-500) for the workspace card's `--accent`. */
   accentRgb: '16 185 129',
} as const;

/**
 * The Note's fixed identity accent - a muted stone/slate cool grey, deliberately outside the games'
 * palette (Legends amber, City purple, Otherscape cyan) and the board's emerald, so a note tab never
 * reads as another kind (its former sky/indigo sat too close to Otherscape's blues). A feature-identity
 * colour like the game brands above, NOT a theme token. Shared by the note tab badge, its drag clone, and
 * the New Tab "New Note" card so the three can't drift.
 */
export const NOTE_VISUAL = {
   /** The note's glyph, shared by the tab badge, drag clone, and the picker card so they can't drift. */
   Icon: NotebookPen,
   /** Coloured icon on a card (the New Tab note card's glyph). */
   accentText: 'text-slate-400',
   /** The solid wash behind a white note glyph (the tab badge + its drag clone, the chooser card). */
   gradient: 'bg-gradient-to-br from-slate-500 to-stone-600',
   /** Space-separated RGB triple (slate-400) for the workspace card's `--accent`. */
   accentRgb: '148 163 184',
} as const;

/**
 * The PDF's fixed identity accent - a deep red/crimson, deliberately outside the games' palette
 * (Legends' warm gold-to-rose, City purple, Otherscape cyan), the board's emerald, and the note's
 * slate, so a pdf tab never reads as another kind. A feature-identity colour like the ones above,
 * NOT a theme token. Shared by the pdf tab badge and its drag clone so the two can't drift.
 */
export const PDF_VISUAL = {
   /** The pdf's glyph, shared by the tab badge, drag clone, and the picker card so they can't drift. */
   Icon: FileType,
   /** Coloured icon on a card. */
   accentText: 'text-red-500',
   /** The solid wash behind a white pdf glyph (the tab badge + its drag clone). */
   gradient: 'bg-gradient-to-br from-red-600 to-rose-700',
   /** Space-separated RGB triple (a soft rose/red) for the workspace card's `--accent`. */
   accentRgb: '224 90 90',
} as const;

/** A selectable game in the MainMenu / New Tab pickers, with its translation keys. */
export interface GameCardOption {
   game: GameSystem;
   titleKey: string;
   subtitleKey: string;
}

/** The games offered in the pickers, in display order (excludes `NEUTRAL`). */
export const GAME_CARD_OPTIONS: GameCardOption[] = [
   { game: 'LEGENDS', titleKey: 'MainMenu.games.legends.title', subtitleKey: 'MainMenu.games.legends.subtitle' },
   { game: 'CITY_OF_MIST', titleKey: 'MainMenu.games.cityOfMist.title', subtitleKey: 'MainMenu.games.cityOfMist.subtitle' },
   { game: 'OTHERSCAPE', titleKey: 'MainMenu.games.otherscape.title', subtitleKey: 'MainMenu.games.otherscape.subtitle' },
];

/** The games with a Challenge Card variant, in display order. */
export const CHALLENGE_GAME_OPTIONS: ChallengeGame[] = ['LEGENDS', 'OTHERSCAPE', 'CITY_OF_MIST'];
