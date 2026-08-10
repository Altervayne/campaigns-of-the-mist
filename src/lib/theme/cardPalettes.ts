/*
 * Per-game card palettes: the data model + CSS emission for user-editable `.card-type-*` colors. A card
 * palette is structurally a set of PaperSets (the 10 paper tokens = the 10 card tokens, only renamed), one
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

/** Each game's card types in editor order. Slugs are palette keys; classes are the CSS targets. */
export const CARD_TYPES_BY_GAME: Record<CardPaletteGame, CardTypeDef[]> = {
   LEGENDS: [
      cardType('hero'),
      cardType('fellowship'),
      cardType('story-theme'),
      cardType('origin'),
      cardType('adventure'),
      cardType('greatness'),
      cardType('tracker-legends'),
      cardType('challenge'),
   ],
   CITY_OF_MIST: [
      cardType('mythos-com'),
      cardType('logos-com'),
      cardType('crew-com'),
      cardType('character-com'),
      cardType('rift-com'),
      cardType('tracker-city'),
   ],
   OTHERSCAPE: [
      cardType('mythos-otherscape'),
      cardType('self-otherscape'),
      cardType('noise-otherscape'),
      cardType('crew-otherscape'),
      cardType('loadout-otherscape'),
      cardType('challenge-otherscape'),
      cardType('tracker-otherscape'),
      // The board overview and the sheet card both represent an Otherscape character; one slug paints both
      // so they stay in sync.
      cardType('character-otherscape', ['card-type-character-otherscape', 'card-type-character-os']),
   ],
};

/** The id of the managed `<style>` element that holds the active custom card-palette rules. */
export const CARD_PALETTE_STYLE_ID = 'cotm-card-palettes';

/** A game's palette: a named set of that game's card-type colors, keyed by CardTypeDef slug. */
export interface CardPalette {
   id: string;
   game: CardPaletteGame;
   name: string;
   cardTypes: Record<string, PaperSet>;
}

/** Emits one card-type's rule: `.class-a, .class-b { --card-...: value; ... }` over all 10 tokens. */
export function cardTypeCss(def: CardTypeDef, set: PaperSet): string {
   const selector = def.classes.map((cls) => `.${cls}`).join(', ');
   const declarations = PAPER_TOKEN_KEYS.map((key) => `--${PAPER_TO_CARD_VAR[key]}: ${set[key]};`);
   return `${selector} { ${declarations.join(' ')} }`;
}

/** Emits the full palette: one rule per card-type of the palette's game that has an entry. */
export function cardPaletteCss(palette: CardPalette): string {
   return CARD_TYPES_BY_GAME[palette.game]
      .filter((def) => palette.cardTypes[def.slug])
      .map((def) => cardTypeCss(def, palette.cardTypes[def.slug]))
      .join('\n');
}
