// -- React Imports --
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

// -- Library Imports --
import cuid from 'cuid';
import toast from 'react-hot-toast';

// -- Utils Imports --
import { isExportedCardPalette } from '@/lib/utils/export-import';
import { normalizePaper } from '@/lib/theme/themeTokens';

// -- Store Imports --
import { useAppSettingsActions } from '@/lib/stores/appSettingsStore';

// -- Type Imports --
import type { ExportFile } from '@/lib/utils/export-import';
import type { CardPalette } from '@/lib/theme/cardPalettes';
import type { PaperSet } from '@/lib/theme/themeTokens';

/**
 * The one place a card palette is imported, shared by every entry point (manager button, any future drop). Given
 * an already-parsed envelope: if it's a palette, add it with a fresh id (so the same file never collides) and
 * select it for its OWN game; otherwise report failure. The palette routes to its intrinsic game - there is no
 * cross-game import. Returns whether a palette was imported.
 */
export function useCardPaletteImport() {
   const { t } = useTranslation();
   const { addCardPalette, setActiveCardPalette } = useAppSettingsActions();

   return useCallback((file: ExportFile): boolean => {
      if (!isExportedCardPalette(file)) {
         toast.error(t('Notifications.general.importFailed'));
         return false;
      }
      // Rebuild every card-type set through normalizePaper so an older export missing a token (e.g.
      // paper-accent-foreground) backfills instead of feeding undefined to the editor's color pickers.
      const content = file.content as CardPalette;
      const cardTypes: Record<string, PaperSet> = Object.fromEntries(
         Object.entries(content.cardTypes).map(([slug, set]) => [slug, normalizePaper(set)]),
      );
      const palette: CardPalette = { id: cuid(), game: content.game, name: content.name, cardTypes };
      addCardPalette(palette);
      setActiveCardPalette(palette.game, palette.id);
      toast.success(t('Notifications.cardPalette.imported'));
      return true;
   }, [addCardPalette, setActiveCardPalette, t]);
}
