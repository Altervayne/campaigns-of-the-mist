/*
 * Per-game card palettes: the data model + CSS emission for user-editable `.card-type-*` colors. A card
 * palette is structurally a set of PaperSets (the 11 paper tokens = the 11 card tokens, only renamed), one
 * per card-type slug. The base `:root` in global.css maps each --card-* to its --paper-* twin 1:1, so the
 * bridge below is that mapping. global.css stays the single source of truth for the built-in defaults; those
 * are read at runtime by the probe, never duplicated here.
 */

// -- Type Imports --
import type { GameSystem } from '@/lib/types/common';
import type { PaperTokenKey, PaperSet } from '@/lib/theme/themeTokens';
import { PAPER_TOKEN_KEYS } from '@/lib/theme/themeTokens';

/** The games that own card palettes. NEUTRAL has no game cards, so it is excluded. */
export type CardPaletteGame = Exclude<GameSystem, 'NEUTRAL'>;

/**
 * The paper-token to card-var bridge: each PaperSet role maps to the `--card-*` variable that paints it,
 * matching the 1:1 `:root` fallback in global.css. Used both to emit palette CSS and (inverted) to read the
 * built-in defaults in the probe.
 */
export const PAPER_TO_CARD_VAR: Record<PaperTokenKey, string> = {
   'paper-background': 'card-paper-bg',
   'paper-foreground': 'card-paper-fg',
   'paper-primary': 'card-header-bg',
   'paper-primary-foreground': 'card-header-fg',
   'paper-secondary': 'card-popover-bg',
   'paper-secondary-foreground': 'card-popover-fg',
   'paper-border': 'card-border',
   'paper-accent': 'card-accent',
   'paper-accent-foreground': 'card-accent-fg',
   'paper-destructive': 'card-destructive-bg',
   'paper-destructive-foreground': 'card-destructive-fg',
};

/**
 * A logical card type shown in the editor, mapped to the `.card-type-*` class name(s) it paints. Usually one
 * class; a few slugs paint two classes that must stay in sync (an Otherscape character reads on both the
 * board overview and the sheet card).
 */
export interface CardTypeDef {
   slug: string;
   labelKey: string;
   classes: string[];
}

/** Builds a CardTypeDef whose slug paints the single matching `.card-type-<slug>` class. */
function cardType(slug: string, classes: string[] = [`card-type-${slug}`]): CardTypeDef {
   return { slug, labelKey: `SettingsDialog.cardPalettes.types.${slug}`, classes };
}

/**
 * Each game's card types in editor order: game-specific cards first, then the four shared cards (challenge +
 * the three tracker-derived neutrals). Slugs are palette keys, unique within a game; classes are the CSS
 * targets. The shared slugs (challenge/status/storytag/storytheme) repeat across games with a per-game class.
 */
export const CARD_TYPES_BY_GAME: Record<CardPaletteGame, CardTypeDef[]> = {
   LEGENDS: [
      cardType('hero'),
      cardType('fellowship'),
      cardType('origin'),
      cardType('adventure'),
      cardType('greatness'),
      cardType('challenge', ['card-type-challenge-legends']),
      cardType('status', ['card-type-status-legends']),
      cardType('storytag', ['card-type-storytag-legends']),
      cardType('storytheme', ['card-type-storytheme-legends']),
   ],
   CITY_OF_MIST: [
      // City has no separate character card; the Rift card is the City character.
      cardType('rift', ['card-type-rift-com']),
      cardType('crew', ['card-type-crew-com']),
      cardType('mythos', ['card-type-mythos-com']),
      cardType('logos', ['card-type-logos-com']),
      cardType('challenge', ['card-type-challenge-com']),
      cardType('status', ['card-type-status-com']),
      cardType('storytag', ['card-type-storytag-com']),
      cardType('storytheme', ['card-type-storytheme-com']),
   ],
   OTHERSCAPE: [
      // The board overview and the sheet card both represent an Otherscape character; one slug paints both
      // so they stay in sync.
      cardType('character', ['card-type-character-otherscape', 'card-type-character-os']),
      cardType('crew', ['card-type-crew-otherscape']),
      cardType('loadout', ['card-type-loadout-otherscape']),
      cardType('self', ['card-type-self-otherscape']),
      cardType('mythos', ['card-type-mythos-otherscape']),
      cardType('noise', ['card-type-noise-otherscape']),
      cardType('challenge', ['card-type-challenge-otherscape']),
      cardType('status', ['card-type-status-otherscape']),
      cardType('storytag', ['card-type-storytag-otherscape']),
      cardType('storytheme', ['card-type-storytheme-otherscape']),
   ],
};

/**
 * The games that own card palettes, in selector order. Derived from {@link CARD_TYPES_BY_GAME} (itself
 * compiler-forced exhaustive over {@link CardPaletteGame}), so adding a game to the union covers every
 * consumer - the class emitter, both settings selectors, and the import gate - from one source.
 */
export const CARD_PALETTE_GAMES = Object.keys(CARD_TYPES_BY_GAME) as CardPaletteGame[];

/** The id of the managed `<style>` element that holds the active custom card-palette rules. */
export const CARD_PALETTE_STYLE_ID = 'cotm-card-palettes';

/** A game's palette: a named set of that game's card-type colors, keyed by CardTypeDef slug. */
export interface CardPalette {
   id: string;
   game: CardPaletteGame;
   name: string;
   cardTypes: Record<string, PaperSet>;
}

/** Emits one card-type's rule: `.class-a, .class-b { --card-...: value; ... }` over all 11 tokens. */
export function cardTypeCss(def: CardTypeDef, set: PaperSet): string {
   const selector = def.classes.map((cls) => `.${cls}`).join(', ');
   const declarations = PAPER_TOKEN_KEYS.map((key) => `--${PAPER_TO_CARD_VAR[key]}: ${set[key]};`);
   return `${selector} { ${declarations.join(' ')} }`;
}

/**
 * Whether two palettes match on the EDITOR-owned fields (name + every card-type's every PaperSet token) - the
 * fields a draft tracks. Order-independent across slugs. Used to tell when an editor draft has unsaved changes.
 */
export function cardPaletteFieldsEqual(a: CardPalette, b: CardPalette): boolean {
   if (a.name !== b.name) return false;
   const aSlugs = Object.keys(a.cardTypes);
   if (aSlugs.length !== Object.keys(b.cardTypes).length) return false;
   for (const slug of aSlugs) {
      const aSet = a.cardTypes[slug];
      const bSet = b.cardTypes[slug];
      if (!bSet) return false;
      for (const key of PAPER_TOKEN_KEYS) {
         if (aSet[key] !== bSet[key]) return false;
      }
   }
   return true;
}

/** Emits the full palette: one rule per card-type of the palette's game that has an entry. */
export function cardPaletteCss(palette: CardPalette): string {
   return CARD_TYPES_BY_GAME[palette.game]
      .filter((def) => palette.cardTypes[def.slug])
      .map((def) => cardTypeCss(def, palette.cardTypes[def.slug]))
      .join('\n');
}
