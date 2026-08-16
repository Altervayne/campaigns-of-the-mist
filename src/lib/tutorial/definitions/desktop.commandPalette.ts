// -- Icon Imports --
import { Command } from 'lucide-react';

// -- Store Imports --
import { useAppGeneralStateStore } from '@/lib/stores/appGeneralStateStore';

// -- Type Imports --
import type { TutorialDefinition } from '../tutorialTypes';

/**
 * D8 - The Command Palette. The last desktop tutorial and a keyboard-first tour of the bar that reaches almost
 * everything: the Ctrl/Cmd+K hotkey, the grouped results scoped to the current context, the search that matches
 * hidden aliases, running a command, and the multi-step commands that ask a follow-up. One gate carries it - the
 * user presses the hotkey - watched on `isCommandPaletteOpen` (the runner subscribes to it). A demo character is
 * seeded so the bar shows its full character-and-creation set, and so the multi-step invite can finish a create
 * wizard safely on the throwaway sheet (in-memory, discarded on teardown, zero repository writes).
 *
 * The palette sits at `z-1000`, below the tutorial band, so every in-palette beat runs `scrim:'none'` (a dim veil
 * would bury it) and `interaction:'anchor-only'` so the bar stays live and typeable. Each carries `onArrive:
 * setCommandPalette open:true` to idempotently keep it open across back-navigation. The engine executes no command:
 * searching, running, and walking a wizard are narrated invitations, never driven - query and page state are
 * component-local and un-observable, and running mutates. The teardown's chrome snapshot closes the palette and the
 * character-demo teardown discards the demo, so the wrap needs no onLeave.
 */

export const DESKTOP_COMMAND_PALETTE_TUTORIAL: TutorialDefinition = {
   id: 'desktop.commandPalette',
   platform: 'desktop',
   system: 'palette',
   titleKey: 'Common.theCommandPalette',
   teachKey: 'TutorialsDialog.tutorials.commandPalette.teach',
   icon: Command,
   needsDemo: 'character',
   steps: [
      {
         id: 'welcome',
         titleKey: 'Common.theCommandPalette',
         bodyKey: 'Tutorial.commandPalette.welcome_body',
         placement: 'center',
         advance: { on: 'next-click' },
      },
      {
         // Gate: the hotkey is taught by pressing it, so there is no launcher to anchor - the beat is centered.
         // The signal is `isCommandPaletteOpen` flipping true. `onArrive: setCommandPalette open:false` keeps the
         // gate honest (not pre-satisfied) and re-closes it on a Back. If the user takes the skip-step escape,
         // beat 3's `onArrive: open:true` re-opens the palette so the downstream beats still hold.
         id: 'open',
         onArrive: { type: 'setCommandPalette', open: false },
         titleKey: 'Tutorial.commandPalette.open_title',
         bodyKey: 'Tutorial.commandPalette.open_body',
         placement: 'center',
         scrim: 'none',
         advance: {
            on: 'user-action',
            signal: { kind: 'store', predicate: () => useAppGeneralStateStore.getState().isCommandPaletteOpen === true },
         },
      },
      {
         // The anatomy: an input on top, results grouped below, scoped to the current context. `open:true` keeps
         // the palette open (and re-opens it on a Back from the search beat, or after the gate's skip-step escape).
         id: 'anatomy',
         onArrive: { type: 'setCommandPalette', open: true },
         anchorKey: 'command-palette',
         titleKey: 'Tutorial.commandPalette.anatomy_title',
         bodyKey: 'Tutorial.commandPalette.anatomy_body',
         placement: 'right',
         interaction: 'anchor-only',
         scrim: 'none',
         advance: { on: 'next-click' },
      },
      {
         // Search: type to filter, and it matches hidden aliases too (`die` finds the dice tray, `roll` finds
         // Roll). Narrated, never gated - the query is component-local and the engine cannot read it. `anchor-only`
         // keeps the field live so the reader can try a query.
         id: 'search',
         onArrive: { type: 'setCommandPalette', open: true },
         anchorKey: 'command-palette-input',
         titleKey: 'Tutorial.commandPalette.search_title',
         bodyKey: 'Tutorial.commandPalette.search_body',
         placement: 'right',
         interaction: 'anchor-only',
         scrim: 'none',
         advance: { on: 'next-click' },
      },
      {
         // Run: Enter runs the highlighted command. The mutation line - narrated, the engine fires nothing.
         id: 'run',
         onArrive: { type: 'setCommandPalette', open: true },
         anchorKey: 'command-palette',
         titleKey: 'Tutorial.commandPalette.run_title',
         bodyKey: 'Tutorial.commandPalette.run_body',
         placement: 'right',
         interaction: 'anchor-only',
         scrim: 'none',
         advance: { on: 'next-click' },
      },
      {
         // Multi-step: some commands ask a follow-up. A lit invite (page state is component-local, un-observable,
         // so it cannot be gated) to walk New Tracker - what kind, then name it - and finish it on the demo sheet;
         // safe, since the demo character is in-memory and discarded. Backspace steps back a page. `onLeave` closes
         // the palette on the way to the wrap.
         id: 'multi-step',
         onArrive: { type: 'setCommandPalette', open: true },
         onLeave: { type: 'setCommandPalette', open: false },
         anchorKey: 'command-palette-list',
         titleKey: 'Tutorial.commandPalette.multiStep_title',
         bodyKey: 'Tutorial.commandPalette.multiStep_body',
         placement: 'right',
         interaction: 'anchor-only',
         scrim: 'none',
         advance: { on: 'next-click' },
      },
      {
         // Closes the loop on the desktop tour. The teardown's chrome snapshot closes the palette and the
         // character-demo teardown discards the demo, so no onLeave is needed here.
         id: 'wrap',
         titleKey: 'Tutorial.commandPalette.wrap_title',
         bodyKey: 'Tutorial.commandPalette.wrap_body',
         placement: 'center',
         advance: { on: 'next-click' },
      },
   ],
};
