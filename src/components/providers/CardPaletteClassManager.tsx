// -- React Imports --
import { useEffect } from 'react';

// -- Store and Hook Imports --
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';

// -- Theme Imports --
import { CARD_PALETTE_GAMES, CARD_PALETTE_STYLE_ID, cardPaletteCss } from '@/lib/theme/cardPalettes';

export function CardPaletteClassManager({ children }: { children: React.ReactNode }) {
   const cardPalettes = useAppSettingsStore((state) => state.cardPalettes);
   const activeCardPalettes = useAppSettingsStore((state) => state.activeCardPalettes);
   const cardPaletteDraft = useAppSettingsStore((state) => state.cardPaletteDraft);

   useEffect(() => {
      // Per game: a draft for that game drives the live preview (so editing shows on the cards); else the
      // active custom palette; else nothing (`'default'` lets the global.css rules show through). Every
      // rendered palette's per-card-type overrides go into one managed <style>.
      const css = CARD_PALETTE_GAMES.map((game) => {
         const palette = cardPaletteDraft?.game === game
            ? cardPaletteDraft
            : cardPalettes.find((entry) => entry.id === activeCardPalettes[game]);
         return palette ? cardPaletteCss(palette) : '';
      })
         .filter(Boolean)
         .join('\n');

      let styleEl = document.getElementById(CARD_PALETTE_STYLE_ID) as HTMLStyleElement | null;
      if (!styleEl) {
         styleEl = document.createElement('style');
         styleEl.id = CARD_PALETTE_STYLE_ID;
         document.head.appendChild(styleEl);
      }
      // Emptied when nothing is active, so a switch never leaves stale card rules behind.
      styleEl.textContent = css;
   }, [cardPalettes, activeCardPalettes, cardPaletteDraft]);

   return <>{children}</>;
}
