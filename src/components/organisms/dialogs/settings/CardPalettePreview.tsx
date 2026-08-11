// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Utils Imports --
import { PAPER_TOKEN_KEYS } from '@/lib/theme/themeTokens';
import { PAPER_TO_CARD_VAR } from '@/lib/theme/cardPalettes';

// -- Type Imports --
import type { CSSProperties } from 'react';
import type { PaperSet } from '@/lib/theme/themeTokens';

/*
 * A compact mock card that paints the edited PaperSet through the `--card-*` roles, so the preview matches the
 * card type being tuned (unlike the generic tracker preview). The wrapper sets the palette's 11 card vars
 * inline; every inner element reads its color from `var(--card-*)`, so edits show at once.
 */
export function CardPalettePreview({ set }: { set: PaperSet }) {
   const { t } = useTranslation();
   const style = Object.fromEntries(
      PAPER_TOKEN_KEYS.map((key) => [`--${PAPER_TO_CARD_VAR[key]}`, set[key]]),
   ) as CSSProperties;

   return (
      <div style={style} className="flex justify-center">
         <div className="w-56 overflow-hidden rounded-lg border-2" style={{ borderColor: 'var(--card-border)' }}>
            <div
               className="px-3 py-2 text-sm font-semibold"
               style={{ background: 'var(--card-header-bg)', color: 'var(--card-header-fg)' }}
            >
               {t('SettingsDialog.cardPalettes.preview.title')}
            </div>
            <div
               className="flex flex-col gap-2 px-3 py-3"
               style={{ background: 'var(--card-paper-bg)', color: 'var(--card-paper-fg)' }}
            >
               <p className="text-xs">{t('SettingsDialog.cardPalettes.preview.body')}</p>
               <div className="flex flex-wrap items-center gap-1.5">
                  <span
                     className="rounded px-2 py-0.5 text-[0.65rem] font-medium"
                     style={{ background: 'var(--card-accent)', color: 'var(--card-accent-fg)' }}
                  >
                     {t('SettingsDialog.cardPalettes.preview.accent')}
                  </span>
                  <span
                     className="rounded px-2 py-0.5 text-[0.65rem]"
                     style={{ background: 'var(--card-popover-bg)', color: 'var(--card-popover-fg)' }}
                  >
                     {t('SettingsDialog.cardPalettes.preview.popover')}
                  </span>
                  <span
                     className="rounded px-2 py-0.5 text-[0.65rem]"
                     style={{ background: 'var(--card-destructive-bg)', color: 'var(--card-destructive-fg)' }}
                  >
                     {t('SettingsDialog.cardPalettes.preview.destructive')}
                  </span>
               </div>
            </div>
         </div>
      </div>
   );
}
