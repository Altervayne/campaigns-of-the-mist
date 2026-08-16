// -- Icon Imports --
import { Palette } from 'lucide-react';

// -- Store Imports --
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';
import { useTutorialStore } from '@/lib/tutorial/tutorialStore';

// -- Type Imports --
import type { TutorialDefinition } from '../tutorialTypes';
import type { ActiveTheme } from '@/lib/stores/appSettingsStore';

/**
 * D7 - Custom Themes. A tour of the app's colors, taught in the Settings hub's Appearance pane: what a theme is,
 * the light/dark mode, the theme list where selecting a preset applies it live, then a narrated look at the editor
 * behind the Edit-themes button and at import/export. The one gate watches the active theme against a per-run
 * baseline - the honest "you applied a preset" signal - while the rest read. Every in-hub beat runs `scrim:'none'`
 * (the Settings modal supplies its own dim) and carries `openSettings: appearance` on arrive, so back-nav re-opens
 * the hub on Appearance. The applied preset rides through the rest of the tour and reverts only at the very end,
 * via the chrome snapshot (theme + mode), which the wrap says out loud. The editor and import/export are narrated,
 * never driven: the editor takeover is Settings-local state the engine can't restore (and on a preset it shows only
 * the duplicate-to-edit placeholder), and a file picker sits out of the sandbox. No demo seam - a theme is an app
 * setting, not a repository record.
 */

// The active theme at the run's first gate check, keyed on the run id so each run re-baselines. Holds across
// back-nav within a run; an already-applied preset reads gate-satisfied-on-arrival and shows Next.
let baselineRunId: string | null;
let baselineTheme: ActiveTheme;

/** The apply-preset gate: true once the active theme diverges from this run's baseline. */
function themeChanged(): boolean {
   const runId = useTutorialStore.getState().activeTutorialId;
   const current = useAppSettingsStore.getState().theme;
   if (runId !== baselineRunId) {
      baselineRunId = runId;
      baselineTheme = current;
   }
   return current !== baselineTheme;
}

export const DESKTOP_THEMES_TUTORIAL: TutorialDefinition = {
   id: 'desktop.themes',
   platform: 'desktop',
   system: 'themes',
   titleKey: 'Common.themes',
   teachKey: 'TutorialsDialog.tutorials.themes.teach',
   icon: Palette,
   steps: [
      {
         id: 'welcome',
         onArrive: { type: 'openSettings', section: 'appearance' },
         titleKey: 'Common.themes',
         bodyKey: 'Tutorial.themes.welcome_body',
         placement: 'center',
         advance: { on: 'next-click' },
      },
      {
         // The coarse choice: light, dark, or follow the device. Dim read over the mode track; `scrim:'none'`
         // keeps the hub's own dim in charge. `openSettings:'appearance'` re-opens the pane on a Back.
         id: 'mode',
         onArrive: { type: 'openSettings', section: 'appearance' },
         anchorKey: 'appearance-mode',
         titleKey: 'Common.lightAndDark',
         bodyKey: 'Tutorial.themes.mode_body',
         placement: 'right',
         scrim: 'none',
         advance: { on: 'next-click' },
      },
      {
         // The list: presets plus the user's own customs, where a click applies a theme live. A read before
         // the gate hands them the click.
         id: 'theme-list',
         onArrive: { type: 'openSettings', section: 'appearance' },
         anchorKey: 'themes-list',
         titleKey: 'Common.theThemeList',
         bodyKey: 'Tutorial.themes.themeList_body',
         placement: 'right',
         scrim: 'none',
         advance: { on: 'next-click' },
      },
      {
         // Gate: the user clicks a preset and watches the app (this window too) re-skin. The signal is the active
         // theme diverging from this run's baseline - the honest "you applied one" read. `anchor-only` so the row
         // is clickable through the veil; the skip-step escape covers a back-nav into an already-changed theme.
         id: 'apply-preset',
         onArrive: { type: 'openSettings', section: 'appearance' },
         anchorKey: 'themes-list',
         titleKey: 'Common.tryOneOn',
         bodyKey: 'Tutorial.themes.applyPreset_body',
         placement: 'right',
         interaction: 'anchor-only',
         scrim: 'none',
         advance: {
            on: 'user-action',
            signal: { kind: 'store', predicate: themeChanged },
         },
      },
      {
         // The editor is narrated over the Edit-themes button, never entered: the takeover is Settings-local state
         // the engine can't set or restore, and on a preset it opens only the duplicate-to-edit placeholder. Dim
         // read describing what waits behind the button (per-color swatches, light + dark, live preview, the seed
         // generator, the editable copy a preset offers).
         id: 'make-your-own',
         onArrive: { type: 'openSettings', section: 'appearance' },
         anchorKey: 'themes-edit',
         titleKey: 'Common.makeYourOwn',
         bodyKey: 'Tutorial.themes.makeYourOwn_body',
         placement: 'left',
         scrim: 'none',
         advance: { on: 'next-click' },
      },
      {
         // Import brings a theme in from a file, export sends one out from its row menu. Narrated, never driven -
         // the file picker sits out of the sandbox. Dim read over the import button.
         id: 'import-export',
         onArrive: { type: 'openSettings', section: 'appearance' },
         anchorKey: 'themes-import',
         titleKey: 'Common.shareThemes',
         bodyKey: 'Common.aThemeYouMake',
         placement: 'left',
         scrim: 'none',
         advance: { on: 'next-click' },
      },
      {
         // The applied preset reverts here, in the tutorial teardown's chrome-snapshot restore (theme + mode);
         // the copy says so. No onLeave fights that restore.
         id: 'wrap',
         titleKey: 'Tutorial.themes.wrap_title',
         bodyKey: 'Tutorial.themes.wrap_body',
         placement: 'center',
         advance: { on: 'next-click' },
      },
   ],
};
