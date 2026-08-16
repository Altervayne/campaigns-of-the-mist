// -- Icon Imports --
import { Palette } from 'lucide-react';

// -- Store Imports --
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';
import { useTutorialStore } from '@/lib/tutorial/tutorialStore';

// -- Type Imports --
import type { ActiveTheme } from '@/lib/stores/appSettingsStore';
import type { TutorialAction, TutorialDefinition } from '../tutorialTypes';

/**
 * Mobile Custom Themes. The touch tour of the app's colors, taught on the Appearance screen: what a theme is,
 * the light / dark / system mode, the theme list where tapping a preset repaints everything live, then a
 * narrated look at the editor behind the New button and at import / export. One gate watches the active theme
 * against a per-run baseline - the honest "you applied a preset" read - while every other beat reads. Each beat
 * arrives on the Appearance screen through the nav bridge, so back-navigation always lands where its anchor
 * lives; the sheet's own overlays are closed on arrival because they belong to a surface this tour is not on.
 * The applied preset rides through the rest of the tour and reverts only at the end, in the chrome-snapshot
 * restore (theme + mode), which the wrap says out loud. The editor and import / export are narrated, never
 * driven: the editor is a separate screen the engine does not enter, and a file picker sits out of the sandbox.
 * No demo seam - a theme is an app setting, not a saved record - and the run never writes a custom theme.
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

/**
 * The arrival descriptors that put the shell on the Appearance screen. Every beat of this tour lives there, so
 * every beat names the tab: arrival is the only hook that runs in both directions, and a beat that set up its
 * surface on the way forward alone would strand the user when they walk back into it. The sheet's toolbelt, FAB
 * ring and card-reorder mode belong to a surface this tour never stands on, so they are closed here too. Each
 * verb is idempotent, so re-asserting an axis already held costs nothing.
 */
function arriveAt(): TutorialAction[] {
   return [
      { type: 'mobileNav', action: { kind: 'navTab', tab: 'settingsAppearance' } },
      { type: 'mobileNav', action: { kind: 'fab', expanded: false } },
      { type: 'mobileNav', action: { kind: 'toolbelt', open: false } },
      { type: 'mobileNav', action: { kind: 'reorder', active: false } },
   ];
}

export const MOBILE_THEMES_TUTORIAL: TutorialDefinition = {
   id: 'mobile.themes',
   platform: 'mobile',
   system: 'themes',
   titleKey: 'Common.themes',
   teachKey: 'TutorialsDialog.tutorials.mobileThemes.teach',
   icon: Palette,
   steps: [
      {
         id: 'welcome',
         onArrive: arriveAt(),
         titleKey: 'Tutorial.mobileThemes.welcome_title',
         bodyKey: 'Tutorial.mobileThemes.welcome_body',
         placement: 'center',
         advance: { on: 'next-click' },
      },
      {
         // The coarse choice: light, dark, or follow the device. It sits at the top of the screen, so the coach
         // drops in below it.
         id: 'mode',
         onArrive: arriveAt(),
         anchorKey: 'appearance-mode',
         titleKey: 'Common.lightAndDark',
         bodyKey: 'Tutorial.mobileThemes.mode_body',
         placement: 'bottom',
         advance: { on: 'next-click' },
      },
      {
         // The presets: tapping one applies it live. A read before the gate, pointing at the rows the user will
         // tap next. The customs below and their buttons are covered by the beats that follow.
         id: 'theme-list',
         onArrive: arriveAt(),
         anchorKey: 'themes-list',
         titleKey: 'Common.theThemeList',
         bodyKey: 'Tutorial.mobileThemes.themeList_body',
         placement: 'bottom',
         advance: { on: 'next-click' },
      },
      {
         // Gate: the user taps a preset and watches the whole app re-skin. The signal is the active theme
         // diverging from this run's baseline - the honest "you applied one" read. `anchor-only` so the rows are
         // tappable through the veil; a back-nav into an already-changed theme reads satisfied on arrival.
         id: 'apply-preset',
         onArrive: arriveAt(),
         anchorKey: 'themes-list',
         titleKey: 'Common.tryOneOn',
         bodyKey: 'Tutorial.mobileThemes.applyPreset_body',
         placement: 'bottom',
         interaction: 'anchor-only',
         gestureCue: { kind: 'tap' },
         advance: {
            on: 'user-action',
            signal: { kind: 'store', predicate: themeChanged },
         },
      },
      {
         // The editor is narrated over the New button, never entered: it is a screen of its own the engine does
         // not drive into, and tapping the button would start a custom theme. A read describing what waits there
         // - each color set by hand for light and dark, a live preview, and the seed generator for a fast start.
         id: 'make-your-own',
         onArrive: arriveAt(),
         anchorKey: 'themes-edit',
         titleKey: 'Common.makeYourOwn',
         bodyKey: 'Tutorial.mobileThemes.makeYourOwn_body',
         placement: 'top',
         advance: { on: 'next-click' },
      },
      {
         // Import brings a theme in from a file; export sends one out from a saved theme's own menu. Narrated,
         // never driven - the file picker sits out of the sandbox. A read over the Import button.
         id: 'import-export',
         onArrive: arriveAt(),
         anchorKey: 'themes-import',
         titleKey: 'Common.shareThemes',
         bodyKey: 'Common.aThemeYouMake',
         placement: 'top',
         advance: { on: 'next-click' },
      },
      {
         // The applied preset reverts here, in the tutorial teardown's chrome-snapshot restore (theme + mode);
         // the copy says so.
         id: 'wrap',
         onArrive: arriveAt(),
         titleKey: 'Tutorial.mobileThemes.wrap_title',
         bodyKey: 'Tutorial.mobileThemes.wrap_body',
         placement: 'center',
         advance: { on: 'next-click' },
      },
   ],
};
