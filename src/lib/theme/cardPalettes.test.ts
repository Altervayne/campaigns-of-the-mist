// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import {
   PAPER_TO_CARD_VAR,
   CARD_TYPES_BY_GAME,
   cardTypeCss,
   cardPaletteCss,
} from './cardPalettes';
import type { CardPalette, CardPaletteGame } from './cardPalettes';

// -- Type Imports --
import { PAPER_TOKEN_KEYS } from './themeTokens';
import type { PaperSet } from './themeTokens';

const GAMES: CardPaletteGame[] = ['LEGENDS', 'CITY_OF_MIST', 'OTHERSCAPE'];

/** A PaperSet whose value encodes its token, so assertions can trace each var back to its source. */
const makePaper = (tag: string): PaperSet =>
   Object.fromEntries(PAPER_TOKEN_KEYS.map((key) => [key, `${tag}-${key}`])) as PaperSet;

describe('PAPER_TO_CARD_VAR bridge', () => {
   it('maps every paper token to a card var', () => {
      expect(Object.keys(PAPER_TO_CARD_VAR).sort()).toEqual([...PAPER_TOKEN_KEYS].sort());
   });

   it('maps to distinct card vars', () => {
      const vars = Object.values(PAPER_TO_CARD_VAR);
      expect(new Set(vars).size).toBe(vars.length);
   });
});

describe('CARD_TYPES_BY_GAME', () => {
   it('has unique slugs within each game', () => {
      for (const game of GAMES) {
         const slugs = CARD_TYPES_BY_GAME[game].map((def) => def.slug);
         expect(new Set(slugs).size).toBe(slugs.length);
      }
   });

   it('paints the Otherscape character on both its board and sheet classes', () => {
      const def = CARD_TYPES_BY_GAME.OTHERSCAPE.find((entry) => entry.slug === 'character-otherscape');
      expect(def?.classes).toEqual(['card-type-character-otherscape', 'card-type-character-os']);
   });

   it('excludes the game-agnostic image card', () => {
      const allClasses = GAMES.flatMap((game) => CARD_TYPES_BY_GAME[game].flatMap((def) => def.classes));
      expect(allClasses).not.toContain('card-type-image');
   });
});

describe('cardTypeCss', () => {
   it('emits all 10 card vars with the bridged names', () => {
      const css = cardTypeCss({ slug: 'hero', labelKey: 'x', classes: ['card-type-hero'] }, makePaper('t'));
      for (const key of PAPER_TOKEN_KEYS) {
         expect(css).toContain(`--${PAPER_TO_CARD_VAR[key]}: t-${key};`);
      }
      // No paper-* names leak into the emitted card rule.
      expect(css).not.toContain('--paper-');
   });

   it('joins multiple classes into one selector', () => {
      const def = { slug: 'character-otherscape', labelKey: 'x', classes: ['card-type-character-otherscape', 'card-type-character-os'] };
      const css = cardTypeCss(def, makePaper('t'));
      expect(css.startsWith('.card-type-character-otherscape, .card-type-character-os {')).toBe(true);
   });
});

describe('cardPaletteCss', () => {
   const palette: CardPalette = {
      id: 'p1',
      game: 'LEGENDS',
      name: 'Test',
      cardTypes: { hero: makePaper('hero'), fellowship: makePaper('fellowship') },
   };

   it('emits a rule only for card-types present in the palette', () => {
      const css = cardPaletteCss(palette);
      expect(css).toContain('.card-type-hero {');
      expect(css).toContain('.card-type-fellowship {');
      // A game card-type with no entry is not emitted.
      expect(css).not.toContain('.card-type-origin {');
   });

   it('emits rules in the game roster order, not the object insertion order', () => {
      const reversed: CardPalette = { ...palette, cardTypes: { fellowship: makePaper('f'), hero: makePaper('h') } };
      const css = cardPaletteCss(reversed);
      expect(css.indexOf('.card-type-hero {')).toBeLessThan(css.indexOf('.card-type-fellowship {'));
   });
});
