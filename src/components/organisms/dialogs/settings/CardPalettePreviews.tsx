// -- React Imports --
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

// -- Library Imports --
import cuid from 'cuid';

// -- Component Imports --
import { StatusTrackerCard } from '@/components/organisms/trackers/StatusTracker';
import { StoryThemeTrackerCard } from '@/components/organisms/trackers/StoryThemeTracker';
import { CardPalettePreview } from '@/components/organisms/dialogs/settings/CardPalettePreview';

// -- Tracker Imports --
import { emptyTracker } from '@/lib/trackers/emptyTracker';

// -- Utils Imports --
import { PAPER_TOKEN_KEYS } from '@/lib/theme/themeTokens';
import { PAPER_TO_CARD_VAR } from '@/lib/theme/cardPalettes';

// -- Type Imports --
import type { CSSProperties, ReactNode } from 'react';
import type { PaperSet } from '@/lib/theme/themeTokens';

/** One captioned preview cell, so each rendering is labeled with what it is. */
function PreviewBlock({ label, children }: { label: string; children: ReactNode }) {
   return (
      <div className="flex flex-col items-center gap-1.5">
         <span className="text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
         {children}
      </div>
   );
}

/*
 * The card-palette editor's preview stack: the edited PaperSet shown three ways - the abstract mock card plus
 * two REAL game-agnostic components (a Status tracker and a Story Theme card), so the colors are seen in real
 * contexts. The components render `isDrawerPreview`, which makes them read-only AND drops the card-type class,
 * so their `--card-*` colors come from the wrapper. The wrapper sets BOTH the palette's `--card-*` (bridged)
 * AND its `--paper-*`: setting `--card-*` directly is load-bearing, because the `:root` fallback
 * `--card-*: var(--paper-*)` is computed at `:root` and inherits as the app default - overriding `--paper-*`
 * alone would not re-resolve it, leaving the components on the generic paper.
 */
export function CardPalettePreviews({ set }: { set: PaperSet }) {
   const { t } = useTranslation();
   const style = Object.fromEntries(
      PAPER_TOKEN_KEYS.flatMap((key) => [
         [`--${key}`, set[key]],
         [`--${PAPER_TO_CARD_VAR[key]}`, set[key]],
      ]),
   ) as CSSProperties;

   // Stable samples (fresh cuids only when the language changes), so the read-only preview never churns.
   const { sampleStatus, sampleStoryTheme } = useMemo(() => {
      const status = emptyTracker('STATUS');
      status.name = t('SettingsDialog.themes.paper.sampleStatus');
      status.tiers = [true, true, false, false, false, false]; // a couple active, so the ink reads on both

      const storyTheme = emptyTracker('STORY_THEME');
      storyTheme.mainTag = { id: cuid(), name: t('SettingsDialog.themes.paper.sampleTheme'), isActive: false, isScratched: false };
      storyTheme.powerTags = [{ id: cuid(), name: t('SettingsDialog.themes.paper.samplePower'), isActive: false, isScratched: false }];
      // A weakness tag so paper-destructive is exercised.
      storyTheme.weaknessTags = [{ id: cuid(), name: t('SettingsDialog.themes.paper.sampleWeakness'), isActive: false, isScratched: false }];
      return { sampleStatus: status, sampleStoryTheme: storyTheme };
   }, [t]);

   return (
      <div style={style} className="flex flex-wrap items-start justify-center gap-4">
         <PreviewBlock label={t('SettingsDialog.cardPalettes.preview.mockLabel')}>
            <CardPalettePreview set={set} />
         </PreviewBlock>
         <PreviewBlock label={t('SettingsDialog.cardPalettes.preview.trackerLabel')}>
            <StatusTrackerCard tracker={sampleStatus} isDrawerPreview />
         </PreviewBlock>
         <PreviewBlock label={t('SettingsDialog.cardPalettes.preview.cardLabel')}>
            <StoryThemeTrackerCard tracker={sampleStoryTheme} isDrawerPreview />
         </PreviewBlock>
      </div>
   );
}
