// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { drawerItemCardTypeClass, cardTypeBadgeStyle } from './drawerItemCardTypeClass';
import { CARD_TYPES_BY_GAME } from './cardPalettes';

// -- Type Imports --
import type { GameSystem, GeneralItemType } from '@/lib/types/common';
import type { DrawerItemContent } from '@/lib/types/drawer';

/** A minimal card stand-in: the resolver only reads `details.themeType` / `details.primaryType`. */
const card = (details: Record<string, unknown> = {}): DrawerItemContent =>
   ({ cardType: 'CHARACTER_THEME', details } as unknown as DrawerItemContent);

/** Every `.card-type-*` class in the palette registry, plus the game-agnostic image card. */
const KNOWN_CLASSES = new Set<string>([
   'card-type-image',
   ...(['LEGENDS', 'CITY_OF_MIST', 'OTHERSCAPE'] as const).flatMap((game) =>
      CARD_TYPES_BY_GAME[game].flatMap((def) => def.classes),
   ),
]);

describe('drawerItemCardTypeClass', () => {
   it('maps CHARACTER_THEME to its per-game theme-type class', () => {
      expect(drawerItemCardTypeClass('CHARACTER_THEME', 'LEGENDS', card({ themeType: 'Origin' }))).toBe('card-type-origin');
      expect(drawerItemCardTypeClass('CHARACTER_THEME', 'CITY_OF_MIST', card({ themeType: 'Mythos' }))).toBe('card-type-mythos-com');
      expect(drawerItemCardTypeClass('CHARACTER_THEME', 'CITY_OF_MIST', card({ themeType: 'Logos' }))).toBe('card-type-logos-com');
      expect(drawerItemCardTypeClass('CHARACTER_THEME', 'OTHERSCAPE', card({ themeType: 'Self' }))).toBe('card-type-self-otherscape');
      expect(drawerItemCardTypeClass('CHARACTER_THEME', 'OTHERSCAPE', card({ themeType: 'Noise' }))).toBe('card-type-noise-otherscape');
   });

   it('maps GROUP_THEME per game', () => {
      expect(drawerItemCardTypeClass('GROUP_THEME', 'LEGENDS', card())).toBe('card-type-fellowship');
      expect(drawerItemCardTypeClass('GROUP_THEME', 'CITY_OF_MIST', card())).toBe('card-type-crew-com');
      expect(drawerItemCardTypeClass('GROUP_THEME', 'OTHERSCAPE', card())).toBe('card-type-crew-otherscape');
   });

   it('maps LOADOUT_THEME only for Otherscape', () => {
      expect(drawerItemCardTypeClass('LOADOUT_THEME', 'OTHERSCAPE', card())).toBe('card-type-loadout-otherscape');
      expect(drawerItemCardTypeClass('LOADOUT_THEME', 'LEGENDS', card())).toBeNull();
   });

   it('maps CHARACTER_CARD per game', () => {
      expect(drawerItemCardTypeClass('CHARACTER_CARD', 'LEGENDS', card())).toBe('card-type-hero');
      expect(drawerItemCardTypeClass('CHARACTER_CARD', 'CITY_OF_MIST', card())).toBe('card-type-rift-com');
      expect(drawerItemCardTypeClass('CHARACTER_CARD', 'OTHERSCAPE', card())).toBe('card-type-character-os');
   });

   it('maps CHALLENGE_CARD per game, and City by primary type', () => {
      expect(drawerItemCardTypeClass('CHALLENGE_CARD', 'LEGENDS', card())).toBe('card-type-challenge-legends');
      expect(drawerItemCardTypeClass('CHALLENGE_CARD', 'OTHERSCAPE', card())).toBe('card-type-challenge-otherscape');
      expect(drawerItemCardTypeClass('CHALLENGE_CARD', 'CITY_OF_MIST', card({ primaryType: 'Mythos' }))).toBe('card-type-mythos-com');
      expect(drawerItemCardTypeClass('CHALLENGE_CARD', 'CITY_OF_MIST', card({ primaryType: 'Logos' }))).toBe('card-type-logos-com');
      // A malformed City challenge falls back to Logos, mirroring the card's default tint (never throws).
      expect(drawerItemCardTypeClass('CHALLENGE_CARD', 'CITY_OF_MIST', card())).toBe('card-type-logos-com');
   });

   it('maps IMAGE_CARD to the game-agnostic image class', () => {
      expect(drawerItemCardTypeClass('IMAGE_CARD', 'NEUTRAL', card())).toBe('card-type-image');
   });

   it('returns null for types with no card palette (notes, boards, sheets, trackers)', () => {
      const nonCard: GeneralItemType[] = [
         'NOTE', 'FULL_BOARD', 'PDF', 'JOURNAL', 'POST_IT', 'ROLL_TABLE', 'FULL_CHARACTER_SHEET',
         'STATUS_TRACKER', 'STORY_TAG_TRACKER', 'STORY_THEME_TRACKER',
      ];
      for (const type of nonCard) {
         expect(drawerItemCardTypeClass(type, 'CITY_OF_MIST', card())).toBeNull();
      }
   });

   it('returns null for a CHARACTER_THEME with no theme-type (never throws on odd content)', () => {
      expect(drawerItemCardTypeClass('CHARACTER_THEME', 'LEGENDS', card())).toBeNull();
      expect(drawerItemCardTypeClass('CHARACTER_THEME', 'LEGENDS', {} as DrawerItemContent)).toBeNull();
   });

   it('only ever emits classes that exist in the palette registry', () => {
      const cases: [GeneralItemType, GameSystem, DrawerItemContent][] = [
         ['CHARACTER_THEME', 'LEGENDS', card({ themeType: 'Adventure' })],
         ['CHARACTER_THEME', 'CITY_OF_MIST', card({ themeType: 'Logos' })],
         ['CHARACTER_THEME', 'OTHERSCAPE', card({ themeType: 'Mythos' })],
         ['GROUP_THEME', 'LEGENDS', card()],
         ['GROUP_THEME', 'OTHERSCAPE', card()],
         ['LOADOUT_THEME', 'OTHERSCAPE', card()],
         ['CHARACTER_CARD', 'CITY_OF_MIST', card()],
         ['CHALLENGE_CARD', 'CITY_OF_MIST', card({ primaryType: 'Mythos' })],
         ['CHALLENGE_CARD', 'LEGENDS', card()],
         ['IMAGE_CARD', 'NEUTRAL', card()],
      ];
      for (const [type, game, content] of cases) {
         const cssClass = drawerItemCardTypeClass(type, game, content);
         expect(cssClass).not.toBeNull();
         expect(KNOWN_CLASSES.has(cssClass!)).toBe(true);
      }
   });
});

describe('cardTypeBadgeStyle', () => {
   it('returns null for a null/absent class', () => {
      expect(cardTypeBadgeStyle(null)).toBeNull();
      expect(cardTypeBadgeStyle(undefined)).toBeNull();
   });

   it('returns null when the palette cannot be read (no loaded stylesheet in the test DOM)', () => {
      // The built-in rules live in global.css, which the unit env never loads, so the probe reads empty.
      expect(cardTypeBadgeStyle('card-type-hero')).toBeNull();
   });
});
