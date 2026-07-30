// -- Utility Imports --
import cuid from 'cuid';

// -- Types Imports --
import type { TFunction } from 'i18next';
import type { Card, CardDetails, ChallengeDetails, Character, CityChallengeDetails, CityRiftDetails, LegendsChallengeDetails, LegendsHeroDetails, OtherscapeCharacterDetails, OtherscapeChallengeDetails } from '@/lib/types/character';
import type { Journal } from '@/lib/types/board';
import type { GameSystem } from '../types/drawer';
import type { ChallengeGame } from '@/lib/types/common';

/**
 * Converts a card theme type string into a CSS class name.
 * Example: "Mythos" -> "card-type-mythos", "Self & Noise" -> "card-type-self-&-noise"
 */
export function getCardTypeClass(type: string): string {
   return `card-type-${type.toLowerCase().replace(/\s+/g, '-')}`;
}

// Type guards for card details
function hasCharacterName(details: CardDetails): details is { characterName: string } & CardDetails {
   return 'characterName' in details;
}

function hasThemebook(details: CardDetails): details is { themebook: string } & CardDetails {
   return 'themebook' in details;
}

function hasMainTag(details: CardDetails): details is { mainTag: { name: string } } & CardDetails {
   return 'mainTag' in details && details.mainTag !== null;
}

/**
 * Derives a card's human-readable display title.
 *
 * Character cards resolve to a game-specific name (Hero/Rift/Merc card); loadout
 * and group/fellowship cards prefer their main tag's name (falling back to a
 * game-specific label); character theme cards show "Themebook - Main Tag" (or
 * whichever of the two is present). The translator is passed in so this stays a
 * pure helper usable from any component. Mirrors the (now-removed) inline mobile
 * `getCardTitle`.
 *
 * @param card - The card whose title to derive.
 * @param t - The i18next translator (from `useTranslation`).
 * @returns The localized display title.
 */
export function deriveCardTitle(card: Card, t: TFunction): string {
   // Character cards: show character name
   if (card.cardType === 'CHARACTER_CARD' && hasCharacterName(card.details)) {
      switch (card.details.game) {
         case 'LEGENDS':
            return t('Cards.heroCard');
         case 'CITY_OF_MIST':
            return t('Cards.riftCard');
         case 'OTHERSCAPE':
            return t('Cards.mercCard');
         default:
            return t('Cards.characterCard');
      }
   }

   // Loadout cards: show main tag name
   if (card.cardType === 'LOADOUT_THEME') {
      const mainTag = hasMainTag(card.details) ? card.details.mainTag.name : null;
      return mainTag || t('Cards.otherscapeLoadoutCard');
   }

   if (card.cardType === 'GROUP_THEME') {
      const mainTag = hasMainTag(card.details) ? card.details.mainTag.name : null;

      if (mainTag) {
         switch (card.details.game) {
            case 'LEGENDS':
               return `${t('Cards.fellowshipCard')} - ${mainTag}`;
            case 'CITY_OF_MIST':
               return `${t('Cards.crewCard')} - ${mainTag}`;
            case 'OTHERSCAPE':
               return `${t('Cards.otherscapeCrewCard')} - ${mainTag}`;
            default:
               return mainTag;
         }
      }
      return t('Cards.fellowshipCard');
   }

   // Theme cards: show "Themebook - Main Tag" or just themebook
   if (card.cardType === 'CHARACTER_THEME') {
      const themebook = hasThemebook(card.details) ? card.details.themebook : null;
      const mainTag = hasMainTag(card.details) ? card.details.mainTag.name : null;

      if (themebook && mainTag) {
         return `${themebook} - ${mainTag}`;
      }
      if (themebook) {
         return themebook;
      }
      if (mainTag) {
         return mainTag;
      }
   }

   if (card.cardType === 'IMAGE_CARD') {
      return t('Cards.portraitCard');
   }

   // Challenge cards carry their own name (the challenge's identity).
   if (card.cardType === 'CHALLENGE_CARD') {
      return card.title || t('Cards.challenge.untitled');
   }

   // Fallback to card type
   return t('Cards.themeCard');
}

/**
 * Derives a journal's display title, falling back to a generic label when unnamed.
 *
 * @param journal - The journal whose title to derive.
 * @param t - The i18next translator (from `useTranslation`).
 * @returns The journal's title, or the localized untitled label when it is empty.
 */
export function deriveJournalTitle(journal: Journal, t: TFunction): string {
   return journal.title.trim() || t('Cards.journalUntitled');
}

/**
 * Creates a fresh character sheet for the specified game system.
 * Initializes with appropriate default cards - Hero Card for Legend, Character Card for City/Otherscape.
 * Empty trackers to start, ready for you to build your character!
 */
/**
 * The empty CHARACTER_CARD details for a game (Hero / Merc / Rift). Shared by new-character creation
 * and the board's card builder, so the per-game schema lives in one place. `characterName` is empty
 * for a board-native card (no character behind it).
 */
export function emptyCharacterCardDetails(game: GameSystem, characterName: string): LegendsHeroDetails | OtherscapeCharacterDetails | CityRiftDetails {
   switch (game) {
      case 'CITY_OF_MIST':
         return { game: 'CITY_OF_MIST', characterName, mythos: '', logos: '', crewMembers: [], buildup: 0, nemeses: [] };
      case 'OTHERSCAPE':
         return { game: 'OTHERSCAPE', characterName, essence: { mythos: 0, self: 0, noise: 0 }, crewRelationships: [], specials: [] };
      case 'LEGENDS':
      default:
         return { game: 'LEGENDS', characterName, fellowshipRelationships: [], promise: 0, quintessences: [], backpack: [] };
   }
}

/** The empty details for a fresh LitM Challenge Card: every list starts empty, level at 1. */
export function emptyLegendsChallengeDetails(): LegendsChallengeDetails {
   return { game: 'LEGENDS', assetId: null, types: [], challengeLevel: 1, flavor: '', limits: [], statuses: [], tags: [], mightyTags: [], specials: [], abilities: [] };
}

/** The empty details for a fresh Otherscape Challenge Card: the shared floor only (no Types, no Mighty tags). */
export function emptyOtherscapeChallengeDetails(): OtherscapeChallengeDetails {
   return { game: 'OTHERSCAPE', assetId: null, challengeLevel: 1, flavor: '', limits: [], statuses: [], tags: [], specials: [], abilities: [] };
}

/** The empty details for a fresh City of Mist Challenge Card: Logos-themed, level 1, every list/string empty. */
export function emptyCityChallengeDetails(): CityChallengeDetails {
   return { game: 'CITY_OF_MIST', primaryType: 'Logos', assetId: null, challengeLevel: 1, flavor: '', logosSubtitle: '', mythosSubtitle: '', spectrums: [], customMoves: [], hardMoves: [], softMoves: [] };
}

/** The empty Challenge Card details for a game. */
export function emptyChallengeDetails(game: ChallengeDetails['game']): ChallengeDetails {
   switch (game) {
      case 'OTHERSCAPE':
         return emptyOtherscapeChallengeDetails();
      case 'CITY_OF_MIST':
         return emptyCityChallengeDetails();
      case 'LEGENDS':
      default:
         return emptyLegendsChallengeDetails();
   }
}

/** Whether a game has a Challenge Card variant (Legends / Otherscape / City); NEUTRAL does not. */
export function hasChallengeVariant(game: GameSystem): game is ChallengeGame {
   return game === 'LEGENDS' || game === 'OTHERSCAPE' || game === 'CITY_OF_MIST';
}

export function createNewCharacter(name: string, game: GameSystem): Character {
   const baseCharacter: Omit<Character, 'cards' | 'game'> = {
      id: cuid(),
      name: name,
      journals: [],
      sheetLayout: [],
      trackers: {
         statuses: [],
         storyTags: [],
         storyThemes: [],
      },
   };



   switch (game) {
      case 'CITY_OF_MIST': {
         const card: Card = { id: cuid(), cardType: 'CHARACTER_CARD', title: 'Character Card', isFlipped: false, details: emptyCharacterCardDetails('CITY_OF_MIST', name) };
         return { ...baseCharacter, game: 'CITY_OF_MIST', cards: [card], sheetLayout: [{ kind: 'card', id: card.id }] };
      }

      case 'OTHERSCAPE': {
         const card: Card = { id: cuid(), cardType: 'CHARACTER_CARD', title: 'Character Card', isFlipped: false, details: emptyCharacterCardDetails('OTHERSCAPE', name) };
         return { ...baseCharacter, game: 'OTHERSCAPE', cards: [card], sheetLayout: [{ kind: 'card', id: card.id }] };
      }

      case 'LEGENDS':
      default: {
         const card: Card = { id: cuid(), cardType: 'CHARACTER_CARD', title: 'Hero Card', isFlipped: false, details: emptyCharacterCardDetails('LEGENDS', name) };
         return { ...baseCharacter, game: 'LEGENDS', cards: [card], sheetLayout: [{ kind: 'card', id: card.id }] };
      }
   }
}