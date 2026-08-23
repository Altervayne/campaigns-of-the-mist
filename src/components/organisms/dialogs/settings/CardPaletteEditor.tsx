// -- React Imports --
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Basic UI Imports --
import { Button } from '@/components/ui/button';

// -- Component Imports --
import { TokenSwatch } from '@/components/molecules/theme/TokenSwatch';
import { HexInput } from '@/components/molecules/theme/HexInput';
import { InfoTip } from '@/components/molecules/theme/InfoTip';
import { CardPalettePreviews } from '@/components/organisms/dialogs/settings/CardPalettePreviews';

// -- Icon Imports --
import { Save } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { PAPER_GROUPS } from '@/lib/theme/themeTokens';
import { CARD_TYPES_BY_GAME, cardPaletteFieldsEqual } from '@/lib/theme/cardPalettes';

// -- Store Imports --
import { useAppSettingsActions, useAppSettingsStore } from '@/lib/stores/appSettingsStore';

// -- Type Imports --
import type { ReactNode } from 'react';
import type { PaperTokenKey } from '@/lib/theme/themeTokens';
import type { CardPalette } from '@/lib/theme/cardPalettes';

/*
 * The per-card-type palette editor: one card-type of the palette's game is selected at a time, and its 11 paper
 * tokens are edited exactly like the chrome theme's paper editor (the tokens ARE a PaperSet). Each pick commits
 * immediately into `cardPaletteDraft`, so the live preview - and the whole app, if this palette is active for
 * its game - updates as you edit. Edits reach the saved palette only on Save (enabled only when dirty). Reuses
 * the shared paper i18n and swatch/hex primitives; a card token is the same semantic role as its paper twin.
 */
export function CardPaletteEditor({ palette, headerLeft, headerRight }: { palette: CardPalette; headerLeft?: ReactNode; headerRight?: ReactNode }) {
   const { t } = useTranslation();
   const { beginCardPaletteDraft, patchCardPaletteDraft, saveCardPaletteDraft } = useAppSettingsActions();
   const cardPaletteDraft = useAppSettingsStore((state) => state.cardPaletteDraft);

   // Edits live in a draft, previewed across the app, and only reach the saved palette on Save. Start the draft
   // from the saved palette when this editor opens or switches palettes (read fresh, so a rename made mid-edit
   // isn't clobbered). The editor is keyed by id upstream, so it re-mounts per palette.
   const paletteId = palette.id;
   useEffect(() => {
      const saved = useAppSettingsStore.getState().cardPalettes.find((entry) => entry.id === paletteId);
      if (saved) beginCardPaletteDraft(saved);
   }, [paletteId, beginCardPaletteDraft]);

   // Render from the draft once it matches this palette; until then (first paint) fall back to the saved palette,
   // which looks identical since the draft starts as a copy.
   const draft = cardPaletteDraft && cardPaletteDraft.id === palette.id ? cardPaletteDraft : palette;
   const dirty = cardPaletteDraft !== null && cardPaletteDraft.id === palette.id && !cardPaletteFieldsEqual(cardPaletteDraft, palette);

   const cardTypes = CARD_TYPES_BY_GAME[palette.game];
   const [slug, setSlug] = useState<string>(cardTypes[0].slug);
   const activeSet = draft.cardTypes[slug];

   const setToken = (token: PaperTokenKey, hex: string) => {
      const current = draft.cardTypes[slug];
      if (!current) return;
      patchCardPaletteDraft({ cardTypes: { ...draft.cardTypes, [slug]: { ...current, [token]: hex } } });
   };

   return (
      <div className="flex h-full min-h-0 flex-col">
         {/* Opaque, non-scrolling header: the body scrolls beneath it. An optional left slot carries the hub's
             Back affordance + palette name; Save stays at the right and enables only when dirty. */}
         <div className="flex shrink-0 items-center gap-3 border-b border-border bg-background px-4 py-2">
            {headerLeft}
            <div className="ml-auto flex shrink-0 items-center gap-3">
               {dirty && <span className="text-xs text-muted-foreground">{t('SettingsDialog.themes.unsavedChanges')}</span>}
               {headerRight}
               <Button size="sm" onClick={saveCardPaletteDraft} disabled={!dirty} className="cursor-pointer">
                  <Save className="mr-1 h-4 w-4" />{t('SettingsDialog.themes.saveChanges')}
               </Button>
            </div>
         </div>

         <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            {/* Card-type selector: a wrapping chip row, one card type editable at a time. */}
            <div className="flex flex-col gap-1.5">
               <span className="text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground">{t('SettingsDialog.cardPalettes.cardTypeLabel')}</span>
               <div className="flex flex-wrap gap-1.5">
                  {cardTypes.map((def) => {
                     const isActive = def.slug === slug;
                     return (
                        <button
                           key={def.slug}
                           type="button"
                           onClick={() => setSlug(def.slug)}
                           className={cn(
                              'touch-target cursor-pointer rounded-md border px-2.5 py-1 text-xs transition-colors',
                              isActive
                                 ? 'border-primary bg-primary text-primary-foreground'
                                 : 'border-border bg-muted text-muted-foreground hover:text-foreground',
                           )}
                        >
                           {t(def.labelKey)}
                        </button>
                     );
                  })}
               </div>
            </div>

            {activeSet ? (
               <>
                  {/* Live previews of the selected card type under its DRAFT paper, so edits show at once. */}
                  <CardPalettePreviews set={activeSet} />

                  {/* Per-token rows, reusing the shared paper groups/labels (a card token is its paper twin). */}
                  <div className="grid grid-cols-1 gap-x-6 gap-y-4 lg:grid-cols-2">
                     {PAPER_GROUPS.map((group) => (
                        <div key={group.id} className="flex flex-col gap-1 rounded-md border border-border/60 p-2">
                           <span className="text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground">{t(`SettingsDialog.themes.paper.groups.${group.id}`)}</span>
                           {group.tokens.map((token) => {
                              const tokenLabel = t(`SettingsDialog.themes.paper.tokens.${token}`);
                              return (
                                 <div key={token} className="flex items-center gap-2">
                                    <div className="flex min-w-0 flex-1 items-center gap-1">
                                       <span className="truncate text-sm">{tokenLabel}</span>
                                       <InfoTip text={t(`SettingsDialog.themes.paper.tokenPurpose.${token}`)} />
                                    </div>
                                    <div className="flex w-24 items-center gap-1">
                                       <TokenSwatch value={activeSet[token]} label={tokenLabel} onPick={(hex) => setToken(token, hex)} />
                                       <HexInput value={activeSet[token]} label={tokenLabel} onCommit={(hex) => setToken(token, hex)} className="min-w-0 flex-1" />
                                    </div>
                                 </div>
                              );
                           })}
                        </div>
                     ))}
                  </div>
               </>
            ) : (
               <p className="px-1 py-2 text-xs text-muted-foreground">{t('SettingsDialog.cardPalettes.cardTypeMissing')}</p>
            )}
         </div>
      </div>
   );
}
