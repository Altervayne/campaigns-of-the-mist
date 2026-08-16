// -- Icon Imports --
import { Compass } from 'lucide-react';

// -- Store Imports --
import { useAppGeneralStateStore } from '@/lib/stores/appGeneralStateStore';
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';

// -- Local Imports --
import { DEMO_CHARACTER_ID } from '../demo/demoSentinels';

// -- Type Imports --
import type { TutorialDefinition } from '../tutorialTypes';

/**
 * D1 - Full App Navigation. A hands-on orientation to the whole desktop shell: the sidebar and its
 * controls, workspaces/tabs, the play area, then real clicks that each open a piece of chrome (Drawer,
 * Navigator, Dice Tray), a driven walk through every Settings section, and the command palette opened
 * as a live example, before the home base and the wrap. Hooks go through `runTutorialAction` (store-
 * fresh, never captured setters) and NEVER auto-reverse: each `onArrive` idempotently re-establishes
 * its step's state so back-navigation works, and each `onForward` hands off cleanly to the next section
 * (e.g. closes the panel it opened). A demo character is seeded so the play area always has a real sheet
 * and the user's own workspace is never touched. Panel-opening gates run `anchor-only` so the click
 * lands; the surfaces that sit under the tutorial scrim (`z-1100`) run `scrim:'none'` so they stay lit.
 */
export const DESKTOP_NAVIGATION_TUTORIAL: TutorialDefinition = {
   id: 'desktop.navigation',
   platform: 'desktop',
   system: 'navigation',
   titleKey: 'Common.appNavigation',
   teachKey: 'TutorialsDialog.tutorials.navigation.teach',
   icon: Compass,
   needsDemo: 'character',
   steps: [
      {
         id: 'welcome',
         titleKey: 'Tutorial.navigation.welcome_title',
         bodyKey: 'Tutorial.navigation.welcome_body',
         placement: 'center',
         advance: { on: 'next-click' },
      },
      {
         id: 'sidebar',
         anchorKey: 'sidebar-menu',
         titleKey: 'Tutorial.navigation.sidebar_title',
         bodyKey: 'Tutorial.navigation.sidebar_body',
         placement: 'right',
         advance: { on: 'next-click' },
      },
      {
         // Blank the active pointer so the play area shows the MainMenu chooser (the demo tab stays parked
         // in `openTabs`). Blocked so no real character is minted; `onArrive` re-shows the chooser on back-
         // nav, `onLeave` re-activates the demo sheet whichever way the step is left.
         id: 'home-base',
         onArrive: { type: 'deactivateToMenu' },
         onLeave: { type: 'setActiveTab', tabId: DEMO_CHARACTER_ID },
         anchorKey: 'main-menu-chooser',
         titleKey: 'Tutorial.navigation.homeBase_title',
         bodyKey: 'Tutorial.navigation.homeBase_body',
         placement: 'top',
         interaction: 'blocked',
         advance: { on: 'next-click' },
      },
      {
         id: 'collapse',
         anchorKey: 'menu-collapse-button',
         titleKey: 'Tutorial.navigation.collapse_title',
         bodyKey: 'Tutorial.navigation.collapse_body',
         placement: 'right',
         advance: { on: 'next-click' },
      },
      {
         id: 'undo-redo',
         anchorKey: 'menu-undo-redo-buttons',
         titleKey: 'Common.undoAndRedo',
         bodyKey: 'Tutorial.navigation.undoRedo_body',
         placement: 'right',
         advance: { on: 'next-click' },
      },
      {
         id: 'tabs',
         anchorKey: 'tab-strip',
         titleKey: 'Tutorial.navigation.tabs_title',
         bodyKey: 'Tutorial.navigation.tabs_body',
         placement: 'bottom',
         advance: { on: 'next-click' },
      },
      {
         // The + is spotlighted but blocked - a real click would mint a workspace we don't want.
         id: 'new-tab',
         anchorKey: 'tab-new',
         titleKey: 'Tutorial.navigation.newTab_title',
         bodyKey: 'Tutorial.navigation.newTab_body',
         placement: 'bottom',
         interaction: 'blocked',
         advance: { on: 'next-click' },
      },
      {
         id: 'play-area',
         anchorKey: 'character-sheet',
         titleKey: 'Tutorial.navigation.playArea_title',
         bodyKey: 'Tutorial.navigation.playArea_body',
         placement: 'top',
         advance: { on: 'next-click' },
      },
      {
         // Gate: advance when the user opens the Drawer. `onArrive` ensures it is closed so the gate is
         // always meaningful (a no-op forward; re-closes if the user backed in from the tour step).
         id: 'open-drawer',
         onArrive: { type: 'setDrawer', mode: 'closed' },
         anchorKey: 'drawer-toggle',
         titleKey: 'Common.openTheDrawer',
         bodyKey: 'Tutorial.navigation.openDrawer_body',
         placement: 'right',
         interaction: 'anchor-only',
         advance: {
            on: 'user-action',
            signal: { kind: 'store', predicate: () => useAppGeneralStateStore.getState().isDrawerOpen },
         },
      },
      {
         // In-flow panel: a real rect spotlights fine under the dim. `onArrive` ensures it is open (for
         // back-nav from the Navigator section); `onForward` closes it before the next section opens.
         id: 'drawer-tour',
         onArrive: { type: 'setDrawer', mode: 'open' },
         onForward: { type: 'setDrawer', mode: 'closed' },
         anchorKey: 'drawer',
         titleKey: 'Tutorial.navigation.drawerTour_title',
         bodyKey: 'Tutorial.navigation.drawerTour_body',
         placement: 'right',
         advance: { on: 'next-click' },
      },
      {
         id: 'open-navigator',
         onArrive: { type: 'setNavigator', open: false },
         anchorKey: 'navigator-button',
         titleKey: 'Tutorial.navigation.openNavigator_title',
         bodyKey: 'Tutorial.navigation.openNavigator_body',
         placement: 'right',
         interaction: 'anchor-only',
         advance: {
            on: 'user-action',
            signal: { kind: 'store', predicate: () => useAppSettingsStore.getState().navigatorOpen },
         },
      },
      {
         id: 'navigator-tour',
         onArrive: { type: 'setNavigator', open: true },
         onForward: { type: 'setNavigator', open: false },
         anchorKey: 'navigator-panel',
         titleKey: 'Tutorial.navigation.navigatorTour_title',
         bodyKey: 'Tutorial.navigation.navigatorTour_body',
         placement: 'right',
         advance: { on: 'next-click' },
      },
      {
         // Dim spotlight on the Dice-Tray button. The box-shadow cutout reveals it in the hole (it sits below
         // the scrim's z-band), matching the Drawer/Navigator gates. The tray has no backdrop of its own, so
         // dropping the veil here would leave the whole app lit - inconsistent, and the ring has nothing to
         // pop against.
         id: 'open-dice',
         onArrive: { type: 'setDiceTray', open: false },
         anchorKey: 'dice-tray-button',
         titleKey: 'Tutorial.navigation.openDice_title',
         bodyKey: 'Tutorial.navigation.openDice_body',
         placement: 'right',
         interaction: 'anchor-only',
         advance: {
            on: 'user-action',
            signal: { kind: 'store', predicate: () => useAppSettingsStore.getState().diceTray.isOpen },
         },
      },
      {
         // Dim spotlight on the open tray: the cutout reveals the fixed z-50 panel in the hole, dark around it.
         id: 'dice-tour',
         onArrive: { type: 'setDiceTray', open: true },
         onForward: { type: 'setDiceTray', open: false },
         anchorKey: 'dice-tray-panel',
         titleKey: 'Common.theDiceTray',
         bodyKey: 'Tutorial.navigation.diceTour_body',
         placement: 'top',
         advance: { on: 'next-click' },
      },
      {
         // Gate: the user opens Settings themselves. `onArrive` ensures it is closed (meaningful gate +
         // back-nav). Dim spotlight on the button - Settings is still CLOSED here, so it has no backdrop of
         // its own; the section walk that follows keeps `scrim:'none'` because once the hub is open its own
         // modal backdrop supplies the dim.
         id: 'open-settings',
         onArrive: { type: 'closeSettings' },
         anchorKey: 'settings-button',
         titleKey: 'Tutorial.navigation.openSettings_title',
         bodyKey: 'Tutorial.navigation.openSettings_body',
         placement: 'right',
         interaction: 'anchor-only',
         advance: {
            on: 'user-action',
            signal: { kind: 'store', predicate: () => useAppGeneralStateStore.getState().isSettingsOpen },
         },
      },
      // The Settings walk: the hub opens once (the gate above) and STAYS open across every section, each
      // step live-switching the active tab via `setSettingsSection` + ensuring the hub open for back-nav.
      // No between-step close; only the last section (About) closes it on `onForward`. All no-dim (z-50).
      {
         id: 'settings-general',
         onArrive: [{ type: 'setSettingsSection', section: 'general' }, { type: 'openSettings' }],
         anchorKey: 'settings-general',
         titleKey: 'Common.general',
         bodyKey: 'Tutorial.navigation.settingsGeneral_body',
         placement: 'right',
         scrim: 'none',
         advance: { on: 'next-click' },
      },
      {
         id: 'settings-appearance',
         onArrive: [{ type: 'setSettingsSection', section: 'appearance' }, { type: 'openSettings' }],
         anchorKey: 'settings-appearance',
         titleKey: 'Common.appearance',
         bodyKey: 'Tutorial.navigation.settingsAppearance_body',
         placement: 'right',
         scrim: 'none',
         advance: { on: 'next-click' },
      },
      {
         id: 'settings-data',
         onArrive: [{ type: 'setSettingsSection', section: 'data' }, { type: 'openSettings' }],
         anchorKey: 'settings-data',
         titleKey: 'Tutorial.navigation.settingsData_title',
         bodyKey: 'Tutorial.navigation.settingsData_body',
         placement: 'right',
         scrim: 'none',
         advance: { on: 'next-click' },
      },
      {
         id: 'settings-learn',
         onArrive: [{ type: 'setSettingsSection', section: 'learn' }, { type: 'openSettings' }],
         anchorKey: 'settings-learn',
         titleKey: 'Common.learn',
         bodyKey: 'Tutorial.navigation.settingsLearn_body',
         placement: 'right',
         scrim: 'none',
         advance: { on: 'next-click' },
      },
      {
         id: 'settings-whatsNew',
         onArrive: [{ type: 'setSettingsSection', section: 'whatsNew' }, { type: 'openSettings' }],
         anchorKey: 'settings-whatsNew',
         titleKey: 'Tutorial.navigation.settingsWhatsNew_title',
         bodyKey: 'Tutorial.navigation.settingsWhatsNew_body',
         placement: 'right',
         scrim: 'none',
         advance: { on: 'next-click' },
      },
      {
         // Last section: close the hub on the way forward to the palette beat.
         id: 'settings-about',
         onArrive: [{ type: 'setSettingsSection', section: 'about' }, { type: 'openSettings' }],
         onForward: { type: 'closeSettings' },
         anchorKey: 'settings-about',
         titleKey: 'Tutorial.navigation.settingsAbout_title',
         bodyKey: 'Tutorial.navigation.settingsAbout_body',
         placement: 'right',
         scrim: 'none',
         advance: { on: 'next-click' },
      },
      {
         // Opened as a live example: `onArrive` pops the palette so the user sees it (copy still teaches the
         // Ctrl/Cmd+K shortcut); `onLeave` closes it whichever way the step is left. Centered at z-1000, under
         // the scrim - no-dim, coach-mark placed `top` so it does not overlap the palette.
         id: 'command-palette',
         onArrive: { type: 'setCommandPalette', open: true },
         onLeave: { type: 'setCommandPalette', open: false },
         anchorKey: 'command-palette',
         titleKey: 'Common.theCommandPalette',
         bodyKey: 'Tutorial.navigation.commandPalette_body',
         placement: 'top',
         scrim: 'none',
         advance: { on: 'next-click' },
      },
      {
         id: 'wrap',
         titleKey: 'Tutorial.navigation.wrap_title',
         bodyKey: 'Tutorial.navigation.wrap_body',
         placement: 'center',
         advance: { on: 'next-click' },
      },
   ],
};
