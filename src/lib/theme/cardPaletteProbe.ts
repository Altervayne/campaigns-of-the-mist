/*
 * Reads the built-in card palettes straight from the live stylesheet, so the defaults are never duplicated
 * from global.css into TS. Mounts a hidden element carrying a `.card-type-*` class, reads its computed
 * --card-* values, and maps them back to a PaperSet. Powers "duplicate Default", editor seeding, and reset.
 * Memoized per class - the built-in rules are static, so one read stands for the session.
 */

// -- Type Imports --
import type { PaperTokenKey, PaperSet } from '@/lib/theme/themeTokens';
import { PAPER_TOKEN_KEYS } from '@/lib/theme/themeTokens';

// -- Local Imports --
import { PAPER_TO_CARD_VAR, CARD_TYPES_BY_GAME } from '@/lib/theme/cardPalettes';
import type { CardPaletteGame } from '@/lib/theme/cardPalettes';

const cache = new Map<string, PaperSet | null>();

/**
 * Reads the default PaperSet a `.card-type-*` class resolves to, or null when the DOM is unavailable or any
 * token reads empty (a class that sets no card vars). Result is cached per class.
 */
export function readDefaultPaperSet(cssClass: string): PaperSet | null {
   if (cache.has(cssClass)) return cache.get(cssClass) ?? null;

   if (typeof document === 'undefined') return null;

   const probe = document.createElement('div');
   probe.style.position = 'absolute';
   probe.style.visibility = 'hidden';
   probe.style.pointerEvents = 'none';
   probe.classList.add(cssClass);
   document.body.appendChild(probe);

   const computed = getComputedStyle(probe);
   const set = {} as PaperSet;
   let complete = true;
   for (const key of PAPER_TOKEN_KEYS) {
      const value = computed.getPropertyValue(`--${PAPER_TO_CARD_VAR[key]}`).trim();
      if (!value) {
         complete = false;
         break;
      }
      set[key as PaperTokenKey] = value;
   }

   probe.remove();

   const result = complete ? set : null;
   cache.set(cssClass, result);
   return result;
}

/** Probes each of a game's card types (its primary class) into a slug -> PaperSet map, skipping any that read empty. */
export function defaultCardTypesForGame(game: CardPaletteGame): Record<string, PaperSet> {
   const result: Record<string, PaperSet> = {};
   for (const def of CARD_TYPES_BY_GAME[game]) {
      const set = readDefaultPaperSet(def.classes[0]);
      if (set) result[def.slug] = set;
   }
   return result;
}
