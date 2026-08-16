// -- React Imports --
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

// -- Basic UI Imports --
import { Button } from '@/components/ui/button';

// -- Component Imports --
import { ThemePreview } from '@/components/organisms/dialogs/ThemePreview';
import { TokenSwatch } from '@/components/molecules/theme/TokenSwatch';
import { HexInput } from '@/components/molecules/theme/HexInput';
import { InfoTip } from '@/components/molecules/theme/InfoTip';
import { SeedPanel } from '@/components/organisms/theme/SeedPanel';
import { PaperPreview } from '@/components/organisms/theme/PaperPreview';

// -- Icon Imports --
import { Save } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { PAPER_GROUPS, PRESET_LABELS, PRESET_THEMES, TOKEN_GROUPS, themeEditorFieldsEqual } from '@/lib/theme/themeTokens';
import { useCreateCustomTheme } from '@/lib/theme/useCreateCustomTheme';
import { useThemeSwitchGuard } from '@/components/organisms/dialogs/themeSwitchGuard';
import { lowContrastPairs } from '@/lib/theme/contrastWarnings';

// -- Store Imports --
import { useAppSettingsActions, useAppSettingsStore } from '@/lib/stores/appSettingsStore';

// -- Type Imports --
import type { ReactNode } from 'react';
import type { ChromeTokenKey, CustomTheme, PaperTokenKey, TokenSet } from '@/lib/theme/themeTokens';
import type { ContrastWarning } from '@/lib/theme/contrastWarnings';

/*
 * The per-custom theme editor: every chrome token editable for light AND dark (side by side via the shared
 * color picker), a radius slider, and two live previews (light + dark) built from real chrome. Each pick
 * commits immediately through `updateCustomTheme`, so the previews - and the whole app, if this theme is
 * active - update live. The picker speaks hex; tokens are stored as the hex it emits (valid CSS, mixes fine
 * with the presets' hsl).
 *
 * Two optional accelerants sit beside the manual rows: a collapsible seed generator (fill the whole theme
 * from an accent + neutral seed, then keep editing on top) and non-blocking low-contrast warnings on any
 * foreground that reads too faintly on its surface. Manual editing stays the first-class default.
 */

/** The radius slider range (rem); presets sit at 0.5. */
const RADIUS_MIN = 0;
const RADIUS_MAX = 1.5;
const RADIUS_STEP = 0.05;

export function ThemeEditor({ theme, headerLeft, headerRight }: { theme: CustomTheme; headerLeft?: ReactNode; headerRight?: ReactNode }) {
   const { t } = useTranslation();
   const { beginThemeDraft, patchThemeDraft, saveThemeDraft } = useAppSettingsActions();
   const themeDraft = useAppSettingsStore((state) => state.themeDraft);

   // Edits live in a draft, previewed across the whole app, and only reach the saved theme on Save. Start
   // the draft from the saved theme when this editor opens or switches themes (read fresh, so a rename made
   // mid-edit isn't clobbered). The editor is keyed by id, so it re-mounts per theme.
   const themeId = theme.id;
   useEffect(() => {
      const saved = useAppSettingsStore.getState().customThemes.find((entry) => entry.id === themeId);
      if (saved) beginThemeDraft(saved);
   }, [themeId, beginThemeDraft]);

   // Render from the draft once it matches this theme; until then (first paint) fall back to the saved theme,
   // which looks identical since the draft starts as a copy.
   const draft = themeDraft && themeDraft.id === theme.id ? themeDraft : theme;
   const dirty = themeDraft !== null && themeDraft.id === theme.id && !themeEditorFieldsEqual(themeDraft, theme);

   const setToken = (mode: 'light' | 'dark', token: ChromeTokenKey, hex: string) => {
      const next: TokenSet = { ...draft[mode], [token]: hex };
      patchThemeDraft({ [mode]: next });
   };
   // Paper is mode-agnostic, so one swatch writes one value (no light/dark split).
   const setPaper = (token: PaperTokenKey, hex: string) => {
      patchThemeDraft({ paper: { ...draft.paper, [token]: hex } });
   };
   const radiusValue = parseFloat(draft.radius) || 0;

   // Per-mode low-contrast flags, indexed by the offending foreground token so its row's swatch can mark it.
   const lightWarnings = lowContrastPairs(draft.light);
   const darkWarnings = lowContrastPairs(draft.dark);
   const byForeground = (warnings: ContrastWarning[]) => new Map(warnings.map((warning) => [warning.foreground, warning]));
   const lightByFg = byForeground(lightWarnings);
   const darkByFg = byForeground(darkWarnings);
   const warningText = (warning: ContrastWarning | undefined): string | undefined =>
      warning && t('SettingsDialog.themes.contrastWarning', {
         fg: t(`SettingsDialog.themes.tokens.${warning.foreground}`),
         bg: t(`SettingsDialog.themes.tokens.${warning.surface}`),
         ratio: warning.ratio.toFixed(1),
      });
   const summary = (count: number): string | undefined =>
      count > 0 ? t('SettingsDialog.themes.contrastSummary', { count }) : undefined;

   return (
      <div className="flex h-full min-h-0 flex-col">
         {/* Opaque, non-scrolling header: the body scrolls beneath it. An optional left slot carries the hub's
             Back affordance + theme name; Save stays at the right. Edits preview live but only persist on Save,
             which enables only when dirty. */}
         <div className="flex shrink-0 items-center gap-3 border-b border-border bg-background px-4 py-2">
            {headerLeft}
            <div className="ml-auto flex shrink-0 items-center gap-3">
               {dirty && <span className="text-xs text-muted-foreground">{t('SettingsDialog.themes.unsavedChanges')}</span>}
               {headerRight}
               <Button size="sm" onClick={saveThemeDraft} disabled={!dirty} className="cursor-pointer">
                  <Save className="mr-1 h-4 w-4" />{t('SettingsDialog.themes.saveChanges')}
               </Button>
            </div>
         </div>

         <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
         {/* Live previews: real chrome under the draft's inline vars; the dark pane also carries `.dark`. */}
         <div className="flex gap-2">
            <ThemePreview tokenSet={draft.light} radius={draft.radius} dark={false} label={t('SettingsDialog.themes.previewLight')} warning={summary(lightWarnings.length)} />
            <ThemePreview tokenSet={draft.dark} radius={draft.radius} dark={true} label={t('SettingsDialog.themes.previewDark')} warning={summary(darkWarnings.length)} />
         </div>

         {/* Optional accelerator: fill everything from seeds, then keep editing the rows below on top. */}
         <SeedPanel theme={draft} />

         {/* Radius (one value, both modes). */}
         <div className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-sm font-medium">{t('SettingsDialog.themes.radius')}</span>
            <input
               type="range"
               min={RADIUS_MIN}
               max={RADIUS_MAX}
               step={RADIUS_STEP}
               value={radiusValue}
               onChange={(event) => patchThemeDraft({ radius: `${event.target.value}rem` })}
               className="flex-1 cursor-pointer accent-primary"
            />
            <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">{draft.radius}</span>
         </div>

         {/* Per-token rows: each surface paired with its foreground, two group-blocks per row on a wide
             window (one when narrow). Each block carries its own Light/Dark markers so the columns line up. */}
         <div className="grid grid-cols-1 gap-x-6 gap-y-4 lg:grid-cols-2">
            {TOKEN_GROUPS.map((group) => (
               <div key={group.id} className="flex flex-col gap-1 rounded-md border border-border/60 p-2">
                  <div className="flex items-center gap-2">
                     <span className="min-w-0 flex-1 text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground">{t(`SettingsDialog.themes.groups.${group.id}`)}</span>
                     <span className="w-24 text-center text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground">{t('Common.light')}</span>
                     <span className="w-24 text-center text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground">{t('Common.dark')}</span>
                  </div>
                  {group.tokens.map((token) => {
                     const tokenLabel = t(`SettingsDialog.themes.tokens.${token}`);
                     return (
                        <div key={token} className="flex items-center gap-2">
                           <div className="flex min-w-0 flex-1 items-center gap-1">
                              <span className="truncate text-sm">{tokenLabel}</span>
                              <InfoTip text={t(`SettingsDialog.themes.tokenPurpose.${token}`)} />
                           </div>
                           <div className="flex w-24 items-center gap-1">
                              <TokenSwatch value={draft.light[token]} label={`${tokenLabel} · ${t('Common.light')}`} onPick={(hex) => setToken('light', token, hex)} warning={warningText(lightByFg.get(token))} />
                              <HexInput value={draft.light[token]} label={`${tokenLabel} · ${t('Common.light')}`} onCommit={(hex) => setToken('light', token, hex)} className="min-w-0 flex-1" />
                           </div>
                           <div className="flex w-24 items-center gap-1">
                              <TokenSwatch value={draft.dark[token]} label={`${tokenLabel} · ${t('Common.dark')}`} onPick={(hex) => setToken('dark', token, hex)} warning={warningText(darkByFg.get(token))} />
                              <HexInput value={draft.dark[token]} label={`${tokenLabel} · ${t('Common.dark')}`} onCommit={(hex) => setToken('dark', token, hex)} className="min-w-0 flex-1" />
                           </div>
                        </div>
                     );
                  })}
               </div>
            ))}
         </div>

         {/* Paper: the game-agnostic palette for "paper" elements (drawer trackers, NEUTRAL items). One value
             per token (mode-agnostic - same in light and dark), with a live mock-tracker preview. */}
         <div className="flex flex-col gap-3 border-t border-border pt-4">
            <div className="flex flex-col gap-1">
               <span className="text-sm font-semibold">{t('SettingsDialog.themes.paper.title')}</span>
               <p className="text-xs text-muted-foreground">{t('SettingsDialog.themes.paper.intro')}</p>
            </div>

            <PaperPreview paper={draft.paper} />

            <div className="grid grid-cols-1 gap-x-6 gap-y-4 lg:grid-cols-2">
               {PAPER_GROUPS.map((group) => (
                  <div key={group.id} className="flex flex-col gap-1 rounded-md border border-border/60 p-2">
                     <span className="text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground">{t(`SettingsDialog.themes.paper.groups.${group.id}`)}</span>
                     {group.tokens.map((token) => {
                        const paperLabel = t(`SettingsDialog.themes.paper.tokens.${token}`);
                        return (
                           <div key={token} className="flex items-center gap-2">
                              <div className="flex min-w-0 flex-1 items-center gap-1">
                                 <span className="truncate text-sm">{paperLabel}</span>
                                 <InfoTip text={t(`SettingsDialog.themes.paper.tokenPurpose.${token}`)} />
                              </div>
                              <div className="flex w-24 items-center gap-1">
                                 <TokenSwatch value={draft.paper[token]} label={paperLabel} onPick={(hex) => setPaper(token, hex)} />
                                 <HexInput value={draft.paper[token]} label={paperLabel} onCommit={(hex) => setPaper(token, hex)} className="min-w-0 flex-1" />
                              </div>
                           </div>
                        );
                     })}
                  </div>
               ))}
            </div>
         </div>
         </div>
      </div>
   );
}

/**
 * Shown in the detail area when a preset (un-editable) is active: a big clickable card that makes an editable
 * copy of the CURRENT preset and selects it, so editing is one click away without hunting for Duplicate.
 */
export function ThemeEditorPlaceholder() {
   const { t } = useTranslation();
   const activeTheme = useAppSettingsStore((state) => state.theme);
   const createCustomFrom = useCreateCustomTheme();
   const guardedSwitch = useThemeSwitchGuard();

   // The placeholder only renders for an active preset, so these are defined; fall back to Neutral defensively.
   const source = PRESET_THEMES[activeTheme] ?? PRESET_THEMES['theme-neutral'];
   const label = PRESET_LABELS[activeTheme] ?? PRESET_LABELS['theme-neutral'];

   // The editor pane no longer pads its content, so the placeholder pads itself off the dialog edges.
   return (
      <div className="h-full p-4">
         <button
            type="button"
            onClick={() => guardedSwitch(() => createCustomFrom(source, t('SettingsDialog.themes.copyName', { name: label })))}
            className={cn(
               'flex h-full w-full cursor-pointer items-center justify-center rounded-md border border-dashed border-border p-6',
               'text-center text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:bg-muted/40 hover:text-foreground',
            )}
         >
            {t('SettingsDialog.themes.createFromPreset', { name: label })}
         </button>
      </div>
   );
}
