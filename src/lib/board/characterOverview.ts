// -- Type Imports --
import type { Card, Character, Tag } from '@/lib/types/character';

/*
 * Pure derivation of a character's board OVERVIEW data: the condensed theme rows (and a tracker
 * count). Framework-free so the cross-game row mapping is table-testable; the component formats and
 * translates. The deep card stats stay in the character tab - this is the scannable summary.
 */

/**
 * Which source a character element reads from: the LIVE open tab (saved or unsaved), the saved DRAWER
 * entry, or - a never-persisted character whose tab was closed - nothing (`unsaved-removed`).
 */
export type CharacterElementSource = 'live' | 'drawer' | 'unsaved-removed';

/**
 * Resolves a character element's source: an open tab always wins (live); else a saved source reads the
 * drawer; else (closed + no source) the character was unsaved and is gone.
 */
export function characterElementSource(content: { sourceDrawerItemId?: string }, isOpen: boolean): CharacterElementSource {
   if (isOpen) return 'live';
   return content.sourceDrawerItemId ? 'drawer' : 'unsaved-removed';
}

/** How a theme card reads on a row: a proper theme (themebook + type), a group (fellowship/crew), or a loadout. */
export type ThemeRowKind = 'theme' | 'group' | 'loadout';

/** The card types that become a theme row (the character/image cards are the identity, not rows). */
const THEME_CARD_TYPES = new Set(['CHARACTER_THEME', 'GROUP_THEME', 'LOADOUT_THEME']);

/** The condensed data for one theme row, across games and card types. */
export interface CondensedThemeRow {
   id: string;
   rowKind: ThemeRowKind;
   /** The theme type (e.g. `Origin`, `Mythos`) for a CHARACTER_THEME; null for group/loadout. */
   themeType: string | null;
   /** The themebook for a CHARACTER_THEME; null when absent or not applicable. */
   themebook: string | null;
   /** The main tag's name, or null when unnamed (the component shows a fallback). */
   mainTagName: string | null;
   mainTagScratched: boolean;
   mainTagActive: boolean;
   /** Power tags / gear count. */
   powerCount: number;
   /** Weakness tags / flaws count. */
   weaknessCount: number;
   /** Wildcard slots for a loadout; null otherwise. */
   wildcardSlots: number | null;
}

/** Whether a card renders as a theme row. */
export function isThemeCard(card: Card): boolean {
   return THEME_CARD_TYPES.has(card.cardType);
}

/** Derives the condensed row for one theme card (any game/type). */
export function condensedThemeRow(card: Card): CondensedThemeRow {
   const rowKind: ThemeRowKind = card.cardType === 'LOADOUT_THEME' ? 'loadout' : card.cardType === 'GROUP_THEME' ? 'group' : 'theme';
   const details = card.details as Partial<{
      themebook: string;
      themeType: string;
      mainTag: Tag;
      powerTags: Tag[];
      weaknessTags: Tag[];
      wildcardSlots: number;
   }>;
   const name = details.mainTag?.name?.trim();
   return {
      id: card.id,
      rowKind,
      themeType: rowKind === 'theme' ? details.themeType ?? null : null,
      themebook: rowKind === 'theme' ? (details.themebook?.trim() || null) : null,
      mainTagName: name ? name : null,
      mainTagScratched: details.mainTag?.isScratched ?? false,
      mainTagActive: details.mainTag?.isActive ?? false,
      powerCount: details.powerTags?.length ?? 0,
      weaknessCount: details.weaknessTags?.length ?? 0,
      wildcardSlots: rowKind === 'loadout' ? details.wildcardSlots ?? 0 : null,
   };
}

/** The condensed theme rows for a character, in card order. */
export function condensedThemeRows(character: Character): CondensedThemeRow[] {
   return character.cards.filter(isThemeCard).map(condensedThemeRow);
}

/** The character's portrait asset id (from its IMAGE_CARD), or null when it has none. */
export function characterPortraitAssetId(character: Character | null): string | null {
   const portrait = character?.cards.find((card) => card.cardType === 'IMAGE_CARD');
   return (portrait?.details as { assetId?: string | null } | undefined)?.assetId ?? null;
}

/**
 * The game card-theme class for the overview PANEL, mirroring the character card the element stands
 * in for (Legends hero / City character / Otherscape character). This is game CONTENT, so it keeps
 * its game look (the `--card-*` paper palette), not the app palette.
 */
export function overviewPanelCardClass(game: Character['game']): string {
   switch (game) {
      case 'CITY_OF_MIST': return 'card-type-rift-com';
      case 'OTHERSCAPE': return 'card-type-character-otherscape';
      default: return 'card-type-hero';
   }
}

/**
 * The card-theme class for one theme ROW, matching the type's own card (so a row reads as "a Mythos
 * theme" or "the Fellowship" at a glance via that card-type's palette). Mirrors each theme card's own
 * class derivation; an absent theme type yields no class (the row stays on the panel palette).
 */
export function rowCardTypeClass(game: Character['game'], row: CondensedThemeRow): string {
   if (row.rowKind === 'group') {
      return game === 'CITY_OF_MIST' ? 'card-type-crew-com' : game === 'OTHERSCAPE' ? 'card-type-crew-otherscape' : 'card-type-fellowship';
   }
   if (row.rowKind === 'loadout') return 'card-type-loadout-otherscape'; // loadout is Otherscape-only
   const slug = row.themeType?.toLowerCase().replace(/\s+/g, '-');
   if (!slug) return '';
   switch (game) {
      case 'CITY_OF_MIST': return `card-type-${slug}-com`;
      case 'OTHERSCAPE': return `card-type-${slug}-otherscape`;
      default: return `card-type-${slug}`;
   }
}

/** Tracker counts for the light footer line. */
export function trackerCounts(character: Character): { statuses: number; tags: number; themes: number; total: number } {
   const statuses = character.trackers?.statuses.length ?? 0;
   const tags = character.trackers?.storyTags.length ?? 0;
   const themes = character.trackers?.storyThemes.length ?? 0;
   return { statuses, tags, themes, total: statuses + tags + themes };
}
