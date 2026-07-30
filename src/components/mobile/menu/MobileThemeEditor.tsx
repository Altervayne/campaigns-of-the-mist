// -- React Imports --
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Hook Imports --
import { useThemeMode } from '@/hooks/useThemeMode';

// -- Basic UI Imports --
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';

// -- Component Imports --
import { MobileBottomSheet } from '@/components/mobile/shared/MobileBottomSheet';
import { EscapeHatchBanner } from '@/components/mobile/menu/EscapeHatchBanner';
import { ThemePreview } from '@/components/organisms/dialogs/ThemePreview';
import { SeedPanel } from '@/components/organisms/theme/SeedPanel';
import { PaperPreview } from '@/components/organisms/theme/PaperPreview';
import { TokenSwatch } from '@/components/molecules/theme/TokenSwatch';
import { HexInput } from '@/components/molecules/theme/HexInput';
import { InfoTip } from '@/components/molecules/theme/InfoTip';

// -- Icon Imports --
import { ChevronLeft, ChevronDown, ChevronRight, Sun, Moon, Save, SlidersHorizontal } from 'lucide-react';

// -- Utils and Store Imports --
import { cn } from '@/lib/utils';
import { TOKEN_GROUPS, PAPER_GROUPS, customThemeIdFromClass, themeEditorFieldsEqual } from '@/lib/theme/themeTokens';
import { lowContrastPairs } from '@/lib/theme/contrastWarnings';
import { useAppSettingsStore, useAppSettingsActions } from '@/lib/stores/appSettingsStore';

// -- Type Imports --
import type { ChromeTokenKey, PaperTokenKey, TokenSet } from '@/lib/theme/themeTokens';
import type { ContrastWarning } from '@/lib/theme/contrastWarnings';

/*
 * The mobile theme editor: generator-first (a live preview + seed generator + radius), with the chrome
 * tokens under an Advanced disclosure and edited ONE mode at a time. It edits the ACTIVE custom theme
 * (reached only after selecting/creating one), through the draft, so the preview and the whole app update
 * live and Save persists. A Light/Dark switch flips which mode the single preview shows and the manual rows
 * edit, without touching the app's real appearance.
 */

/** The radius slider range (rem); presets sit at 0.5. */
const RADIUS_MIN = 0;
const RADIUS_MAX = 1.5;
const RADIUS_STEP = 0.05;

interface MobileThemeEditorProps {
   onBack?: () => void;
}

export default function MobileThemeEditor({ onBack }: MobileThemeEditorProps) {
   const { t } = useTranslation();
   const { resolvedMode } = useThemeMode();
   const activeTheme = useAppSettingsStore((state) => state.theme);
   const customThemes = useAppSettingsStore((state) => state.customThemes);
   const themeDraft = useAppSettingsStore((state) => state.themeDraft);
   const { beginThemeDraft, patchThemeDraft, saveThemeDraft, discardThemeDraft, setTheme } = useAppSettingsActions();

   const activeId = customThemeIdFromClass(activeTheme);
   const activeCustom = activeId ? customThemes.find((entry) => entry.id === activeId) ?? null : null;

   // Which mode is being previewed and edited. Local to the editor - flipping it never changes the app's
   // real appearance (next-themes), only the single preview + which token column the manual rows write.
   const [editorMode, setEditorMode] = useState<'light' | 'dark'>(resolvedMode === 'dark' ? 'dark' : 'light');
   const [showAdvanced, setShowAdvanced] = useState(false);
   const [confirmLeave, setConfirmLeave] = useState(false);

   // Edits live in a draft, previewed across the whole app, and only reach the saved theme on Save. Start
   // the draft from the saved theme when this editor opens (read fresh, so a rename isn't clobbered).
   const themeId = activeCustom?.id;
   useEffect(() => {
      if (!themeId) return;
      const saved = useAppSettingsStore.getState().customThemes.find((entry) => entry.id === themeId);
      if (saved) beginThemeDraft(saved);
   }, [themeId, beginThemeDraft]);

   // Reached only after a custom is selected/created, so this is defensive: back out if none is active.
   if (!activeCustom) {
      return (
         <div className="h-full flex flex-col items-center justify-center gap-4 p-6 pt-[calc(1.5rem+env(safe-area-inset-top))]">
            <p className="text-center text-muted-foreground">{t('SettingsDialog.themes.noActiveCustom')}</p>
            <Button onClick={onBack} className="cursor-pointer">{t('SettingsDialog.dangerZone.resetDialog.cancel')}</Button>
         </div>
      );
   }

   // Render from the draft once it matches this theme; until then fall back to the saved theme (identical,
   // since the draft starts as a copy).
   const draft = themeDraft && themeDraft.id === activeCustom.id ? themeDraft : activeCustom;
   const dirty = themeDraft !== null && themeDraft.id === activeCustom.id && !themeEditorFieldsEqual(themeDraft, activeCustom);

   const setToken = (token: ChromeTokenKey, hex: string) => {
      const next: TokenSet = { ...draft[editorMode], [token]: hex };
      patchThemeDraft({ [editorMode]: next });
   };
   const setPaper = (token: PaperTokenKey, hex: string) => {
      patchThemeDraft({ paper: { ...draft.paper, [token]: hex } });
   };
   const radiusValue = parseFloat(draft.radius) || 0;

   // Contrast flags for the mode being edited, indexed by the offending foreground so its row can mark it.
   const warnings = editorMode === 'dark' ? lowContrastPairs(draft.dark) : lowContrastPairs(draft.light);
   const byForeground = new Map(warnings.map((warning) => [warning.foreground, warning]));
   const warningText = (warning: ContrastWarning | undefined): string | undefined =>
      warning && t('SettingsDialog.themes.contrastWarning', {
         fg: t(`SettingsDialog.themes.tokens.${warning.foreground}`),
         bg: t(`SettingsDialog.themes.tokens.${warning.surface}`),
         ratio: warning.ratio.toFixed(1),
      });

   const handleBack = () => { if (dirty) setConfirmLeave(true); else onBack?.(); };
   const handleEscapeHatch = () => { discardThemeDraft(); setTheme('theme-neutral'); onBack?.(); };

   const modeButton = (mode: 'light' | 'dark', icon: React.ReactNode, label: string) => (
      <button
         type="button"
         onClick={() => setEditorMode(mode)}
         className={cn('flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm cursor-pointer', editorMode === mode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
      >
         {icon}{label}
      </button>
   );

   return (
      <div className="h-full flex flex-col">
         {/* Sticky header: title row (back + name + Save), the Light/Dark switch, then the reset banner -
             all pinned so a broken draft's reset is always one tap away. */}
         <div className="shrink-0 border-b border-border bg-background pt-safe">
            <div className="flex items-center gap-2 px-4 pt-2">
               <IconButton variant="ghost" size="lg" onClick={handleBack} className="h-10 w-10 p-0">
                  <ChevronLeft className="h-8 w-8" />
               </IconButton>
               <span className="min-w-0 flex-1 truncate text-lg font-semibold">{draft.name}</span>
               <Button onClick={saveThemeDraft} disabled={!dirty} className="h-10 shrink-0 cursor-pointer">
                  <Save className="mr-1 h-4 w-4" />{t('SettingsDialog.themes.saveChanges')}
               </Button>
            </div>
            <div className="flex items-center gap-2 px-4 py-2">
               <div className="inline-flex rounded-md border border-border p-0.5">
                  {modeButton('light', <Sun className="h-4 w-4" />, t('SettingsDialog.light'))}
                  {modeButton('dark', <Moon className="h-4 w-4" />, t('SettingsDialog.dark'))}
               </div>
            </div>
            {/* Full-width reset banner. FIXED colors on purpose: a broken draft previews app-wide, so its
                reset must never be able to hide behind the theme it broke. No chrome tokens, no dark variant. */}
            <div className="border-t border-border px-4 py-2">
               <EscapeHatchBanner onReset={handleEscapeHatch} />
            </div>
         </div>

         <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {/* Live preview of the mode being edited (its own inline vars; the whole app also previews). */}
            <ThemePreview
               tokenSet={editorMode === 'dark' ? draft.dark : draft.light}
               radius={draft.radius}
               dark={editorMode === 'dark'}
               label={editorMode === 'dark' ? t('SettingsDialog.themes.previewDark') : t('SettingsDialog.themes.previewLight')}
            />

            {/* Generator-first: fill everything from seeds, then refine below. */}
            <SeedPanel theme={draft} isMobile />

            {/* Radius (one value, both modes). */}
            <div className="flex items-center gap-3">
               <span className="w-20 shrink-0 text-sm font-medium">{t('SettingsDialog.themes.radius')}</span>
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

            {/* Advanced: the per-token rows for the current mode, then the mode-agnostic paper section. */}
            <div className="rounded-md border border-border">
               <button
                  type="button"
                  onClick={() => setShowAdvanced((value) => !value)}
                  className="flex w-full items-center gap-2 px-3 py-3 text-left text-sm font-medium cursor-pointer"
               >
                  {showAdvanced ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                  <SlidersHorizontal className="h-4 w-4 shrink-0" />
                  <span>{t('SettingsDialog.themes.advanced')}</span>
               </button>

               {showAdvanced && (
                  <div className="flex flex-col gap-4 border-t border-border p-3">
                     {/* Chrome tokens for the mode being edited (one column, unlike desktop's light+dark). */}
                     <div className="flex flex-col gap-4">
                        {TOKEN_GROUPS.map((group) => (
                           <div key={group.id} className="flex flex-col gap-1 rounded-md border border-border/60 p-2">
                              <span className="text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground">{t(`SettingsDialog.themes.groups.${group.id}`)}</span>
                              {group.tokens.map((token) => {
                                 const tokenLabel = t(`SettingsDialog.themes.tokens.${token}`);
                                 return (
                                    <div key={token} className="flex items-center gap-2">
                                       <div className="flex min-w-0 flex-1 items-center gap-1">
                                          <span className="truncate text-sm">{tokenLabel}</span>
                                          <InfoTip text={t(`SettingsDialog.themes.tokenPurpose.${token}`)} isMobile />
                                       </div>
                                       <TokenSwatch value={draft[editorMode][token]} label={tokenLabel} onPick={(hex) => setToken(token, hex)} warning={warningText(byForeground.get(token))} isMobile />
                                       <HexInput value={draft[editorMode][token]} label={tokenLabel} onCommit={(hex) => setToken(token, hex)} className="w-24" isMobile />
                                    </div>
                                 );
                              })}
                           </div>
                        ))}
                     </div>

                     {/* Paper: game-agnostic palette for "paper" elements, one value per token (both modes). */}
                     <div className="flex flex-col gap-3 border-t border-border pt-4">
                        <div className="flex flex-col gap-1">
                           <span className="text-sm font-semibold">{t('SettingsDialog.themes.paper.title')}</span>
                           <p className="text-xs text-muted-foreground">{t('SettingsDialog.themes.paper.intro')}</p>
                        </div>

                        <PaperPreview paper={draft.paper} />

                        {PAPER_GROUPS.map((group) => (
                           <div key={group.id} className="flex flex-col gap-1 rounded-md border border-border/60 p-2">
                              <span className="text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground">{t(`SettingsDialog.themes.paper.groups.${group.id}`)}</span>
                              {group.tokens.map((token) => {
                                 const paperLabel = t(`SettingsDialog.themes.paper.tokens.${token}`);
                                 return (
                                    <div key={token} className="flex items-center gap-2">
                                       <div className="flex min-w-0 flex-1 items-center gap-1">
                                          <span className="truncate text-sm">{paperLabel}</span>
                                          <InfoTip text={t(`SettingsDialog.themes.paper.tokenPurpose.${token}`)} isMobile />
                                       </div>
                                       <TokenSwatch value={draft.paper[token]} label={paperLabel} onPick={(hex) => setPaper(token, hex)} isMobile />
                                       <HexInput value={draft.paper[token]} label={paperLabel} onCommit={(hex) => setPaper(token, hex)} className="w-24" isMobile />
                                    </div>
                                 );
                              })}
                           </div>
                        ))}
                     </div>
                  </div>
               )}
            </div>
         </div>

         {/* Dirty-guard on leave: discard the draft and go, or stay. A clean draft leaves directly. */}
         <MobileBottomSheet isOpen={confirmLeave} onClose={() => setConfirmLeave(false)}>
            <div className="p-4 pb-3 border-b border-border">
               <h2 className="text-lg font-semibold">{t('SettingsDialog.themes.discardTitle')}</h2>
               <p className="text-sm text-muted-foreground mt-2">{t('SettingsDialog.themes.discardBody')}</p>
            </div>
            <div className="p-4">
               <div className="flex gap-2 pb-safe">
                  <Button variant="outline" onClick={() => setConfirmLeave(false)} className="flex-1 h-11 cursor-pointer">
                     {t('SettingsDialog.dangerZone.resetDialog.cancel')}
                  </Button>
                  <Button
                     variant="destructive"
                     onClick={() => { discardThemeDraft(); setConfirmLeave(false); onBack?.(); }}
                     className="flex-1 h-11 cursor-pointer"
                  >
                     {t('SettingsDialog.themes.discardConfirm')}
                  </Button>
               </div>
            </div>
         </MobileBottomSheet>
      </div>
   );
}
