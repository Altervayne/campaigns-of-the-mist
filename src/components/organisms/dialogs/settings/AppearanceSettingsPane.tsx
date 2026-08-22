// -- React Imports --
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Hook Imports --
import { useThemeMode } from '@/hooks/useThemeMode';

// -- Basic UI Imports --
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

// -- Icon Imports --
import { ChevronLeft, LifeBuoy, Monitor, Moon, Palette, Sun } from 'lucide-react';

// -- Component Imports --
import { ThemeManager } from '@/components/organisms/dialogs/ThemeManager';
import { ThemeEditor, ThemeEditorPlaceholder } from '@/components/organisms/dialogs/ThemeEditor';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { ThemeSwitchGuardProvider } from '@/components/organisms/dialogs/themeSwitchGuard';
import { useSettingsFocus } from './settingsFocus';

// -- Theme Imports --
import { PRESET_LABELS, customThemeClass, customThemeIdFromClass, themeEditorFieldsEqual } from '@/lib/theme/themeTokens';

// -- Store and Hook Imports --
import { useAppSettingsActions, useAppSettingsStore } from '@/lib/stores/appSettingsStore';

// -- Type Imports --
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { ThemeMode } from '@/lib/theme/themeMode';

/** The three light/dark modes as a segmented track: `system` exposed alongside the two pinned modes. */
const MODE_OPTIONS: { value: ThemeMode; icon: LucideIcon; labelKey: string }[] = [
   { value: 'light', icon: Sun, labelKey: 'Common.light' },
   { value: 'system', icon: Monitor, labelKey: 'SettingsDialog.modeSystem' },
   { value: 'dark', icon: Moon, labelKey: 'Common.dark' },
];

/**
 * The Appearance section: light/dark MODE at the top (a 3-way segmented track keyed on the chosen mode, so a
 * `system` pick reads correctly), then the theme block - a live theme list plus a button into the editor
 * takeover. The editor takeover reuses the standalone theme editor; the whole pane is wrapped in the theme
 * switch guard so abandoning an unsaved draft (Back, closing the hub, switching theme) always confirms first.
 */
export function AppearanceSettingsPane() {
   const { t } = useTranslation();
   const { mode, setMode } = useThemeMode();

   const theme = useAppSettingsStore((state) => state.theme);
   const customThemes = useAppSettingsStore((state) => state.customThemes);
   const themeDraft = useAppSettingsStore((state) => state.themeDraft);
   const { setTheme, discardThemeDraft, updateCustomTheme } = useAppSettingsActions();

   const { editorOpen, setEditorOpen, registerCloseGuard } = useSettingsFocus();

   // The editor edits the ACTIVE theme when it's a custom one; a preset shows the duplicate-to-edit placeholder.
   const editingTheme = customThemes.find((custom) => theme === customThemeClass(custom.id));

   // The escape hatch shows only while a custom theme is active (a preset can't make the UI unusable).
   const isCustomActive = customThemeIdFromClass(theme) !== null;

   // The draft has unsaved changes when its editor fields differ from the saved theme it belongs to.
   const draftSaved = themeDraft ? customThemes.find((entry) => entry.id === themeDraft.id) : undefined;
   const isDirty = !!(themeDraft && draftSaved && !themeEditorFieldsEqual(themeDraft, draftSaved));

   // One guard for every way of leaving the current draft (Back, closing the hub, selecting another theme,
   // Duplicate / New / Import). When dirty it parks the intended action behind a confirm; otherwise it drops
   // the (clean) draft and runs straight away.
   const [pendingProceed, setPendingProceed] = useState<(() => void) | null>(null);
   const guardedSwitch = (proceed: () => void) => {
      if (isDirty) { setPendingProceed(() => proceed); return; }
      discardThemeDraft();
      proceed();
   };
   const confirmDiscard = () => {
      discardThemeDraft();
      const proceed = pendingProceed;
      setPendingProceed(null);
      proceed?.();
   };

   // Hand the shell a guarded close, so shutting the hub with an unsaved draft confirms first. A latest-ref
   // wrapper keeps the registered guard pointed at fresh dirtiness without re-registering every render; it's
   // cleared on unmount (leaving the section) so no stale guard survives, and the takeover collapses with it.
   const guardedSwitchRef = useRef(guardedSwitch);
   useEffect(() => { guardedSwitchRef.current = guardedSwitch; });
   useEffect(() => {
      registerCloseGuard((proceed) => guardedSwitchRef.current(proceed));
      return () => registerCloseGuard(null);
   }, [registerCloseGuard]);
   useEffect(() => () => setEditorOpen(false), [setEditorOpen]);

   // Instant bail, no confirm: a broken theme/draft is exactly what you panic-click out of. Drops to Neutral,
   // clears any draft, and collapses the editor - the whole app renders usable again on the list view.
   const resetToDefaultTheme = () => { setTheme('theme-neutral'); discardThemeDraft(); setEditorOpen(false); };

   // FIXED colors on purpose: a broken theme or draft must never be able to hide its own escape. So this uses
   // no chrome tokens and no `dark:` variants - a white pill with a border + shadow stands out on any
   // background, light or dark.
   const escapeHatch = isCustomActive ? (
      <button
         type="button"
         onClick={resetToDefaultTheme}
         title={t('SettingsDialog.themes.escapeHatch')}
         className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-900 shadow-md transition-colors hover:bg-neutral-100"
      >
         <LifeBuoy className="h-4 w-4" />
         {t('SettingsDialog.themes.escapeHatch')}
      </button>
   ) : null;

   // The Back + theme-name cluster the editor takeover shows in its header (folded into the editor's own header
   // bar, so no second toolbar stacks up). Back routes through the guard, so an unsaved draft confirms first.
   // A custom theme's name is editable inline here; a preset's is a plain label (presets can't be renamed).
   const editorHeaderLeft = (nameNode: ReactNode) => (
      <div className="flex min-w-0 flex-1 items-center gap-2">
         <Button variant="ghost" size="sm" onClick={() => guardedSwitch(() => setEditorOpen(false))} className="shrink-0 cursor-pointer">
            <ChevronLeft className="h-4 w-4" />{t('Common.appearance')}
         </Button>
         {nameNode}
      </div>
   );

   if (editorOpen) {
      return (
         <ThemeSwitchGuardProvider value={guardedSwitch}>
            <div className="flex h-full min-h-0 flex-col bg-background">
               {editingTheme ? (
                  <ThemeEditor
                     key={editingTheme.id}
                     theme={editingTheme}
                     headerLeft={editorHeaderLeft(
                        <EditableThemeName
                           id={editingTheme.id}
                           name={editingTheme.name}
                           onRename={(id, name) => updateCustomTheme(id, { name })}
                           label={t('SettingsDialog.themes.rename')}
                        />,
                     )}
                     headerRight={escapeHatch}
                  />
               ) : (
                  <>
                     <div className="flex shrink-0 items-center gap-3 border-b border-border bg-background px-4 py-2">
                        {editorHeaderLeft(<span className="truncate text-sm font-medium">{PRESET_LABELS[theme] ?? ''}</span>)}
                     </div>
                     <div className="min-h-0 flex-1 overflow-hidden">
                        <ThemeEditorPlaceholder />
                     </div>
                  </>
               )}
            </div>
            <DiscardDraftDialog open={pendingProceed !== null} onCancel={() => setPendingProceed(null)} onConfirm={confirmDiscard} />
         </ThemeSwitchGuardProvider>
      );
   }

   return (
      <ThemeSwitchGuardProvider value={guardedSwitch}>
         <div className="grid gap-6">
            {/* The escape hatch rides the list view too, so a broken custom is always one click from safe. */}
            {escapeHatch && <div className="flex justify-end">{escapeHatch}</div>}

            {/* Mode: keyed on the CHOSEN mode (not the resolved one), so a `system` pick lights `system` rather
                than the light/dark it happens to resolve to. */}
            <div data-tutorial="appearance-mode" className="grid grid-cols-3 items-center gap-4">
               <Label className="text-left">{t('SettingsDialog.mode')}</Label>
               <div className="col-span-2 inline-flex w-full rounded-md border border-border bg-muted p-0.5">
                  {MODE_OPTIONS.map((option) => {
                     const Icon = option.icon;
                     const isActive = mode === option.value;
                     return (
                        <button
                           key={option.value}
                           type="button"
                           onClick={() => setMode(option.value)}
                           className={cn(
                              'flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-sm px-3 py-1.5 text-sm transition-colors coarse:py-2.5',
                              isActive ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                           )}
                        >
                           <Icon className="h-4 w-4 shrink-0" />
                           <span className="truncate">{t(option.labelKey)}</span>
                        </button>
                     );
                  })}
               </div>
            </div>

            {/* Theme: the live list (select = apply), plus a button into the editor takeover on the active theme. */}
            <div className="grid gap-3">
               <div className="flex items-center justify-between gap-2">
                  <Label className="text-left">{t('Common.theme')}</Label>
                  <Button data-tutorial="themes-edit" variant="outline" size="sm" onClick={() => setEditorOpen(true)} className="shrink-0 cursor-pointer">
                     <Palette className="h-4 w-4 shrink-0" />{t('SettingsDialog.themes.editThemes')}
                  </Button>
               </div>
               <ThemeManager onEnterEditor={() => setEditorOpen(true)} />
            </div>
         </div>
         <DiscardDraftDialog open={pendingProceed !== null} onCancel={() => setPendingProceed(null)} onConfirm={confirmDiscard} />
      </ThemeSwitchGuardProvider>
   );
}

/**
 * The editing custom theme's name, editable inline in the editor header. Local while typing; commits a trimmed,
 * changed name on blur or Enter (Esc reverts). An empty name reverts to the current one rather than saving blank.
 */
function EditableThemeName({ id, name, onRename, label }: { id: string; name: string; onRename: (id: string, name: string) => void; label: string }) {
   const [value, setValue] = useState(name);
   // Re-sync to the saved name if it changes underneath us (a rename elsewhere, a theme switch) by adjusting
   // during render rather than in an effect - no extra commit, and it never fights what the user is typing.
   const [seenName, setSeenName] = useState(name);
   if (name !== seenName) { setSeenName(name); setValue(name); }
   const commit = () => {
      const trimmed = value.trim();
      if (trimmed && trimmed !== name) onRename(id, trimmed);
      else setValue(name);
   };
   return (
      <input
         value={value}
         aria-label={label}
         onChange={(event) => setValue(event.target.value)}
         onBlur={commit}
         onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            else if (event.key === 'Escape') { setValue(name); event.currentTarget.blur(); }
         }}
         className="min-w-0 flex-1 rounded-sm bg-transparent px-1.5 py-0.5 text-sm font-medium text-foreground outline-none hover:bg-muted focus:bg-muted focus:ring-1 focus:ring-ring"
      />
   );
}

/** Leaving a dirty draft (Back, close, or switching themes) asks before discarding, so work is never lost. */
function DiscardDraftDialog({ open, onCancel, onConfirm }: { open: boolean; onCancel: () => void; onConfirm: () => void }) {
   const { t } = useTranslation();
   return (
      <AlertDialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
         <AlertDialogContent>
            <AlertDialogHeader>
               <AlertDialogTitle>{t('SettingsDialog.themes.discardTitle')}</AlertDialogTitle>
               <AlertDialogDescription>{t('SettingsDialog.themes.discardBody')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
               <AlertDialogCancel className="cursor-pointer">{t('SettingsDialog.dangerZone.resetDialog.cancel')}</AlertDialogCancel>
               <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer">
                  {t('SettingsDialog.themes.discardConfirm')}
               </AlertDialogAction>
            </AlertDialogFooter>
         </AlertDialogContent>
      </AlertDialog>
   );
}
