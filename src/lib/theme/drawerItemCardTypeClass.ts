/*
 * Resolves a drawer item's own `.card-type-*` palette class from its stored content, mirroring the class
 * each card component computes for itself so a preview's type badge can wear the card's real header color
 * instead of the game brand. Card-bearing types only; everything else (notes, boards, trackers, sheets)
 * returns null and keeps its fixed identity accent. The mapping is centralized here so the badge sites and
 * the search summary share one source of truth.
 */

// -- React Imports --
import type { CSSProperties } from 'react';

// -- Type Imports --
import type { GameSystem, GeneralItemType } from '@/lib/types/common';
import type { Card, CityChallengeDetails } from '@/lib/types/character';
import type { DrawerItemContent } from '@/lib/types/drawer';

// -- Local Imports --
import { getCardTypeClass } from '@/lib/utils/character';
import { challengePaletteClass, cityChallengePaletteClass } from '@/lib/cards/challengeCardFactories';
import { readDefaultPaperSet } from '@/lib/theme/cardPaletteProbe';
import { readableTextColor } from '@/lib/color';

/** Reads a stored card's theme-type string (present on a CHARACTER_THEME card), else null. */
function cardThemeType(content: DrawerItemContent): string | null {
   const details = (content as Card)?.details;
   if (details && typeof details === 'object' && 'themeType' in details && typeof details.themeType === 'string') {
      return details.themeType;
   }
   return null;
}

/** Reads a City challenge's primary type; defaults to Logos when absent (matches the card's fallback tint). */
function cityChallengePrimaryType(content: DrawerItemContent): CityChallengeDetails['primaryType'] {
   const details = (content as Card)?.details;
   if (details && typeof details === 'object' && 'primaryType' in details && details.primaryType === 'Mythos') {
      return 'Mythos';
   }
   return 'Logos';
}

/**
 * The `.card-type-*` class a drawer item's preview renders under, or null for a type with no card palette
 * (notes, boards, PDFs, journals, roll tables, full sheets, and the game-agnostic trackers, which render
 * on app tokens in the drawer). Trackers carry no game context here, so they resolve to null on purpose.
 */
export function drawerItemCardTypeClass(type: GeneralItemType, game: GameSystem, content: DrawerItemContent): string | null {
   switch (type) {
      case 'CHARACTER_THEME': {
         const themeType = cardThemeType(content);
         if (!themeType) return null;
         if (game === 'LEGENDS') return getCardTypeClass(themeType);
         if (game === 'CITY_OF_MIST') return `${getCardTypeClass(themeType)}-com`;
         if (game === 'OTHERSCAPE') return `${getCardTypeClass(themeType)}-otherscape`;
         return null;
      }
      case 'GROUP_THEME':
         if (game === 'LEGENDS') return 'card-type-fellowship';
         if (game === 'CITY_OF_MIST') return 'card-type-crew-com';
         if (game === 'OTHERSCAPE') return 'card-type-crew-otherscape';
         return null;
      case 'LOADOUT_THEME':
         return game === 'OTHERSCAPE' ? 'card-type-loadout-otherscape' : null;
      case 'CHARACTER_CARD':
         if (game === 'LEGENDS') return 'card-type-hero';
         if (game === 'CITY_OF_MIST') return 'card-type-rift-com';
         if (game === 'OTHERSCAPE') return 'card-type-character-os';
         return null;
      case 'CHALLENGE_CARD':
         if (game === 'CITY_OF_MIST') return cityChallengePaletteClass(cityChallengePrimaryType(content));
         if (game === 'LEGENDS' || game === 'OTHERSCAPE') return challengePaletteClass(game);
         return null;
      case 'IMAGE_CARD':
         return 'card-type-image';
      default:
         return null;
   }
}

/**
 * Inline style for a palette-colored type badge: the card's header color as the fill, with a luminance-
 * derived readable glyph color. The header hue is intentional card-palette CONTENT (the sanctioned
 * exception to chrome-token-only), so it renders as-is. Returns null when no palette class applies or the
 * palette can't be read (SSR, or a class that sets no card vars), so the caller keeps the fixed accent.
 */
export function cardTypeBadgeStyle(cssClass: string | null | undefined): CSSProperties | null {
   if (!cssClass) return null;
   const set = readDefaultPaperSet(cssClass);
   const background = set?.['paper-primary'];
   if (!background) return null;
   return { backgroundColor: background, color: readableTextColor(background) };
}
