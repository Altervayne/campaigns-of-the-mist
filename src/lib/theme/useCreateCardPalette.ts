// -- Library Imports --
import cuid from 'cuid';

// -- Store Imports --
import { useAppSettingsActions } from '@/lib/stores/appSettingsStore';

// -- Type Imports --
import type { PaperSet } from '@/lib/theme/themeTokens';
import type { CardPaletteGame } from '@/lib/theme/cardPalettes';

/**
 * Returns a function that clones a set of card-type PaperSets into a brand-new custom palette (deep-copied so
 * no PaperSet reference is shared, fresh id) and selects it for its game. Backs Duplicate and the New button
 * so every "make me a palette" path runs through the same code.
 */
export function useCreateCardPalette() {
   const { addCardPalette, setActiveCardPalette } = useAppSettingsActions();
   return (game: CardPaletteGame, cardTypes: Record<string, PaperSet>, name: string): string => {
      const id = cuid();
      const copied: Record<string, PaperSet> = {};
      for (const [slug, set] of Object.entries(cardTypes)) copied[slug] = { ...set };
      addCardPalette({ id, game, name, cardTypes: copied });
      setActiveCardPalette(game, id);
      return id;
   };
}
