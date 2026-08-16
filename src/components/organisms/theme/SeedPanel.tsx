// -- React Imports --
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Basic UI Imports --
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

// -- Icon Imports --
import { ChevronDown, ChevronRight, Shuffle, Sparkles } from 'lucide-react';

// -- Component Imports --
import { SegmentedControl } from '@/components/molecules/theme/SegmentedControl';
import { SeedField } from '@/components/molecules/theme/SeedField';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { deriveFromGenerator, randomGeneratorSettings } from '@/lib/theme/deriveTheme';

// -- Store Imports --
import { useAppSettingsActions } from '@/lib/stores/appSettingsStore';

// -- Type Imports --
import type { ContrastLevel, CustomTheme, GeneratorSettings, GeneratorTier, SaturationLevel, SeedSet } from '@/lib/theme/themeTokens';

/** A seed set with every role present, so the panel can show a value even for roles the current tier hides. */
type FullSeedSet = { primary: string; background: string; accent: string; secondary: string };

/** The seeds the panel opens on for a never-generated theme: a blue primary, a neutral surface, amber + violet. */
const DEFAULT_SEEDS: FullSeedSet = { primary: '#2563eb', background: '#6b7280', accent: '#f59e0b', secondary: '#8b5cf6' };

/** The panel state restored from a theme's `generator`, falling back to sensible defaults when there is none. */
interface GeneratorPanelState {
   tier: GeneratorTier;
   separateModes: boolean;
   saturation: SaturationLevel;
   contrast: ContrastLevel;
   light: FullSeedSet;
   dark: FullSeedSet;
}

/** Restores the generator panel from a saved theme's `generator` (splitting light/dark seeds when separate). */
function restoreGenerator(theme: CustomTheme): GeneratorPanelState {
   const g = theme.generator;
   if (!g) return { tier: 3, separateModes: false, saturation: 'balanced', contrast: 'normal', light: { ...DEFAULT_SEEDS }, dark: { ...DEFAULT_SEEDS } };
   const lightSeeds = (g.separateModes ? (g.seeds as { light: SeedSet; dark: SeedSet }).light : (g.seeds as SeedSet)) ?? {};
   const darkSeeds = (g.separateModes ? (g.seeds as { light: SeedSet; dark: SeedSet }).dark : (g.seeds as SeedSet)) ?? {};
   return {
      tier: g.tier,
      separateModes: g.separateModes,
      saturation: g.saturation,
      contrast: g.contrast,
      light: { ...DEFAULT_SEEDS, ...lightSeeds },
      dark: { ...DEFAULT_SEEDS, ...darkSeeds },
   };
}

/** The seed inputs for one mode, gated by tier (Accent at tier>=3, Secondary at tier 4). */
export function SeedGroup({ heading, seeds, onChange, tier, isMobile = false }: { heading?: string; seeds: FullSeedSet; onChange: (next: FullSeedSet) => void; tier: GeneratorTier; isMobile?: boolean }) {
   const { t } = useTranslation();
   const set = (key: keyof FullSeedSet) => (hex: string) => onChange({ ...seeds, [key]: hex });
   return (
      <div className="flex flex-col gap-1.5">
         {heading && <span className="text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground">{heading}</span>}
         <div className="grid grid-cols-2 gap-3">
            <SeedField label={t('SettingsDialog.themes.seeds.primary')} info={t('SettingsDialog.themes.seeds.primaryInfo')} value={seeds.primary} onPick={set('primary')} isMobile={isMobile} />
            <SeedField label={t('SettingsDialog.themes.seeds.background')} info={t('SettingsDialog.themes.seeds.backgroundInfo')} value={seeds.background} onPick={set('background')} isMobile={isMobile} />
            {tier >= 3 && <SeedField label={t('SettingsDialog.themes.seeds.accent')} info={t('SettingsDialog.themes.seeds.accentInfo')} value={seeds.accent} onPick={set('accent')} isMobile={isMobile} />}
            {tier >= 4 && <SeedField label={t('SettingsDialog.themes.seeds.secondary')} info={t('SettingsDialog.themes.seeds.secondaryInfo')} value={seeds.secondary} onPick={set('secondary')} isMobile={isMobile} />}
         </div>
      </div>
   );
}

/** The collapsible, secondary "generate from seeds" accelerator (manual rows stay the primary way to author). */
export function SeedPanel({ theme, isMobile = false }: { theme: CustomTheme; isMobile?: boolean }) {
   const { t } = useTranslation();
   const { patchThemeDraft } = useAppSettingsActions();

   const restored = restoreGenerator(theme);
   const [open, setOpen] = useState(false);
   const [tier, setTier] = useState<GeneratorTier>(restored.tier);
   const [separateModes, setSeparateModes] = useState(restored.separateModes);
   const [saturation, setSaturation] = useState<SaturationLevel>(restored.saturation);
   const [contrast, setContrast] = useState<ContrastLevel>(restored.contrast);
   const [light, setLight] = useState<FullSeedSet>(restored.light);
   const [dark, setDark] = useState<FullSeedSet>(restored.dark);
   const [confirming, setConfirming] = useState(false);

   // Both Generate and Surprise me go through the draft (preview live, persist on Save). The `generator` is
   // recorded so the panel restores + re-generates later.
   const apply = (settings: GeneratorSettings) => {
      const { light: l, dark: d, paper } = deriveFromGenerator(settings);
      patchThemeDraft({ light: l, dark: d, paper, generator: settings });
   };
   const buildSettings = (s: { tier: GeneratorTier; separateModes: boolean; saturation: SaturationLevel; contrast: ContrastLevel; light: FullSeedSet; dark: FullSeedSet }): GeneratorSettings => ({
      tier: s.tier, separateModes: s.separateModes, saturation: s.saturation, contrast: s.contrast,
      seeds: s.separateModes ? { light: s.light, dark: s.dark } : s.light,
   });

   const generate = () => {
      apply(buildSettings({ tier, separateModes, saturation, contrast, light, dark }));
      setConfirming(false);
   };

   // Surprise me: keep the user's tier + light/dark choice, roll seeds + both axes, reflect them, generate now.
   const surprise = () => {
      const rolled = randomGeneratorSettings({ tier, separateModes });
      setSaturation(rolled.saturation);
      setContrast(rolled.contrast);
      const rolledLight = separateModes ? (rolled.seeds as { light: SeedSet; dark: SeedSet }).light : (rolled.seeds as SeedSet);
      const rolledDark = separateModes ? (rolled.seeds as { light: SeedSet; dark: SeedSet }).dark : (rolled.seeds as SeedSet);
      setLight({ ...DEFAULT_SEEDS, ...rolledLight });
      setDark({ ...DEFAULT_SEEDS, ...rolledDark });
      apply(rolled);
   };

   const saturationOptions = [
      { value: 'minimal' as const, label: t('SettingsDialog.themes.seeds.saturationMinimal'), desc: t('SettingsDialog.themes.seeds.saturationMinimalDesc') },
      { value: 'balanced' as const, label: t('SettingsDialog.themes.seeds.saturationBalanced'), desc: t('SettingsDialog.themes.seeds.saturationBalancedDesc') },
      { value: 'vivid' as const, label: t('SettingsDialog.themes.seeds.saturationVivid'), desc: t('SettingsDialog.themes.seeds.saturationVividDesc') },
   ];
   const contrastOptions = [
      { value: 'soft' as const, label: t('SettingsDialog.themes.seeds.contrastSoft'), desc: t('SettingsDialog.themes.seeds.contrastSoftDesc') },
      { value: 'normal' as const, label: t('SettingsDialog.themes.seeds.contrastNormal'), desc: t('SettingsDialog.themes.seeds.contrastNormalDesc') },
      { value: 'contrasted' as const, label: t('SettingsDialog.themes.seeds.contrastContrasted'), desc: t('SettingsDialog.themes.seeds.contrastContrastedDesc') },
   ];

   return (
      <div className="rounded-md border border-dashed border-border">
         <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-muted-foreground cursor-pointer"
         >
            {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
            <Sparkles className="h-4 w-4 shrink-0" />
            <span>{t('SettingsDialog.themes.seeds.title')}</span>
         </button>

         {open && (
            <div className="flex flex-col gap-3 border-t border-border px-3 py-3">
               {/* Tier: how many seed roles to expose (Accent at 3, Secondary at 4). */}
               <SegmentedControl
                  value={tier}
                  onChange={setTier}
                  isMobile={isMobile}
                  options={[
                     { value: 2, label: t('SettingsDialog.themes.seeds.tier2') },
                     { value: 3, label: t('SettingsDialog.themes.seeds.tier3') },
                     { value: 4, label: t('SettingsDialog.themes.seeds.tier4') },
                  ]}
               />

               {/* Declare light/dark separately: doubles only the SEEDS; the tier + axes stay shared. */}
               <Button variant={separateModes ? 'default' : 'outline'} size="sm" onClick={() => setSeparateModes((value) => !value)} className={cn('w-full cursor-pointer', isMobile && 'h-11')}>
                  {t('SettingsDialog.themes.seeds.separateModes')}
               </Button>

               {/* Modifier axes. */}
               <SegmentedControl label={t('SettingsDialog.themes.seeds.saturation')} value={saturation} onChange={setSaturation} options={saturationOptions} isMobile={isMobile} />
               <SegmentedControl label={t('SettingsDialog.themes.seeds.contrast')} value={contrast} onChange={setContrast} options={contrastOptions} isMobile={isMobile} />

               {/* Seeds: one group when shared, two aligned Light/Dark groups when separate. */}
               {separateModes ? (
                  <div className="flex flex-col gap-3">
                     <SeedGroup heading={t('Common.light')} seeds={light} onChange={setLight} tier={tier} isMobile={isMobile} />
                     <SeedGroup heading={t('Common.dark')} seeds={dark} onChange={setDark} tier={tier} isMobile={isMobile} />
                  </div>
               ) : (
                  <SeedGroup seeds={light} onChange={setLight} tier={tier} isMobile={isMobile} />
               )}

               <div className="flex gap-2">
                  <Button onClick={() => setConfirming(true)} className={cn('flex-1 cursor-pointer', isMobile && 'h-11')}>{t('SettingsDialog.themes.seeds.generate')}</Button>
                  <Button variant="outline" onClick={surprise} className={cn('flex-1 cursor-pointer', isMobile && 'h-11')}>
                     <Shuffle className="mr-1 h-4 w-4" />{t('SettingsDialog.themes.seeds.surprise')}
                  </Button>
               </div>
            </div>
         )}

         <AlertDialog open={confirming} onOpenChange={setConfirming}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>{t('SettingsDialog.themes.seeds.confirmTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>{t('SettingsDialog.themes.seeds.confirmDescription')}</AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel className="cursor-pointer">{t('SettingsDialog.dangerZone.resetDialog.cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={generate} className="cursor-pointer">{t('SettingsDialog.themes.seeds.generate')}</AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </div>
   );
}
