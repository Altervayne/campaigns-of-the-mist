// -- Icon Imports --
import { ScrollText } from 'lucide-react';

// -- Store Imports --
import { useAppGeneralStateStore } from '@/lib/stores/appGeneralStateStore';
import { getActiveCharacterStore } from '@/lib/character/characterStoreRegistry';

// -- Local Imports --
import { DEMO_CHARACTER_ID } from '../demo/demoSentinels';

// -- Type Imports --
import type { Character } from '@/lib/types/character';
import type { TutorialDefinition } from '../tutorialTypes';

/**
 * D2 - Character Sheet. Build a sheet end to end, by doing: rename, Edit vs Play, then real
 * creations - a status, a story tag, a card, a journal, a portrait - each gated on the store
 * result of the user's own action. Edit mode is entered once (a gate) and PERSISTS through the
 * whole creation frame - hooks never auto-reverse it - so nothing closes between steps; each
 * creation step's `onArrive` idempotently ensures Edit is on, so back-navigation re-establishes
 * it, and the explicit "Back to Play" gate is the one place it flips off. Save / export / import /
 * create-character stay driven + `blocked`: each has a real side effect (a drawer row, a file
 * emit/read, a new workspace) that must never fire from a gate. Every creation runs on the seeded
 * demo character, whose store carries no persistence handle, so the mutations live purely in
 * memory. Card / journal / portrait route through the `Add...` dropdown (and Card its dialog), all
 * at z-50 under the scrim, so those gates run `scrim:'none'`. Gate predicates read the active
 * character store fresh; hooks go through `runTutorialAction`.
 */

/** The active (demo) character, read fresh for a gate predicate. Null before the sheet mounts. */
function activeCharacter(): Character | null {
   return getActiveCharacterStore()?.getState().character ?? null;
}

export const DESKTOP_SHEET_TUTORIAL: TutorialDefinition = {
   id: 'desktop.sheet',
   platform: 'desktop',
   system: 'sheet',
   titleKey: 'Common.characterSheet',
   teachKey: 'TutorialsDialog.tutorials.sheet.teach',
   icon: ScrollText,
   needsDemo: 'character',
   steps: [
      {
         id: 'overview',
         anchorKey: 'character-sheet',
         titleKey: 'Tutorial.sheet.overview_title',
         bodyKey: 'Tutorial.sheet.overview_body',
         placement: 'top',
         advance: { on: 'next-click' },
      },
      {
         id: 'name',
         anchorKey: 'character-name-input',
         titleKey: 'Common.theName',
         bodyKey: 'Tutorial.sheet.name_body',
         placement: 'bottom',
         advance: { on: 'next-click' },
      },
      {
         id: 'modes',
         anchorKey: 'edit-mode-toggle',
         titleKey: 'Tutorial.sheet.modes_title',
         bodyKey: 'Tutorial.sheet.modes_body',
         placement: 'right',
         advance: { on: 'next-click' },
      },
      {
         // Gate: start in Play, advance when the user flips Edit on. The whole creation frame below
         // renders only in Edit mode, so this ordering is load-bearing. `onArrive` ensures Play so the
         // gate is meaningful (and re-establishes it if the user backed in from a later step).
         id: 'enter-edit',
         onArrive: { type: 'setEditing', value: false },
         anchorKey: 'edit-mode-toggle',
         titleKey: 'Common.enterEditMode',
         bodyKey: 'Tutorial.sheet.enterEdit_body',
         placement: 'right',
         interaction: 'anchor-only',
         advance: {
            on: 'user-action',
            signal: { kind: 'store', predicate: () => useAppGeneralStateStore.getState().isEditing },
         },
      },
      {
         // The creation frame: Edit stays on and persists across all of these (no auto-undo). Each step's
         // `onArrive` idempotently ensures Edit is on so back-navigation re-establishes the build tools.
         id: 'trackers',
         onArrive: { type: 'setEditing', value: true },
         anchorKey: 'trackers-section',
         titleKey: 'Tutorial.sheet.trackers_title',
         bodyKey: 'Tutorial.sheet.trackers_body',
         placement: 'bottom',
         advance: { on: 'next-click' },
      },
      {
         // Cleanest gate in the set: the add button mutates the store inline (no popover, no dialog).
         id: 'add-status',
         onArrive: { type: 'setEditing', value: true },
         anchorKey: 'add-status-button',
         titleKey: 'Common.addAStatus',
         bodyKey: 'Tutorial.sheet.addStatus_body',
         placement: 'right',
         interaction: 'anchor-only',
         advance: {
            on: 'user-action',
            // Fixture ships one status; a second means the user added one.
            signal: { kind: 'store', predicate: () => (activeCharacter()?.trackers.statuses.length ?? 0) > 1 },
         },
      },
      {
         id: 'add-story-tag',
         onArrive: { type: 'setEditing', value: true },
         anchorKey: 'add-story-tag-button',
         titleKey: 'Tutorial.sheet.addStoryTag_title',
         bodyKey: 'Tutorial.sheet.addStoryTag_body',
         placement: 'right',
         interaction: 'anchor-only',
         advance: {
            on: 'user-action',
            // Fixture ships one story tag; a second means the user added one.
            signal: { kind: 'store', predicate: () => (activeCharacter()?.trackers.storyTags.length ?? 0) > 1 },
         },
      },
      {
         id: 'cards',
         onArrive: { type: 'setEditing', value: true },
         anchorKey: 'cards-section',
         titleKey: 'Tutorial.sheet.cards_title',
         bodyKey: 'Tutorial.sheet.cards_body',
         placement: 'top',
         advance: { on: 'next-click' },
      },
      {
         id: 'add-menu',
         onArrive: { type: 'setEditing', value: true },
         anchorKey: 'add-card-button',
         titleKey: 'Common.theAddMenu',
         bodyKey: 'Tutorial.sheet.addMenu_body',
         placement: 'left',
         advance: { on: 'next-click' },
      },
      {
         // Card creation opens a CENTERED dialog, so this is two beats. First: open the Add menu (it opens to
         // the RIGHT of the card) and choose Card - gate on the dialog opening. The coach sits LEFT of the Add
         // card, clear of both the right-opening dropdown and the centered dialog it spawns.
         id: 'open-card-dialog',
         onArrive: { type: 'setEditing', value: true },
         anchorKey: 'add-card-button',
         titleKey: 'Tutorial.sheet.openCardDialog_title',
         bodyKey: 'Tutorial.sheet.openCardDialog_body',
         placement: 'left',
         interaction: 'anchor-only',
         scrim: 'none',
         advance: {
            on: 'user-action',
            signal: { kind: 'store', predicate: () => useAppGeneralStateStore.getState().isCardDialogOpen },
         },
      },
      {
         // Second: the coach RE-ANCHORS to the dialog and sits to its RIGHT, clear of the form, so it never
         // covers what the user is filling in. Picking a type creates the card and closes the dialog, firing
         // this gate. (The dialog is guarded against outside-dismiss while a tutorial runs, so a stray click
         // can't strand this step.)
         id: 'create-card',
         onArrive: { type: 'setEditing', value: true },
         anchorKey: 'creation-dialog',
         titleKey: 'Tutorial.sheet.createCard_title',
         bodyKey: 'Tutorial.sheet.createCard_body',
         placement: 'right',
         interaction: 'anchor-only',
         scrim: 'none',
         advance: {
            on: 'user-action',
            // Fixture ships two cards (hero + theme); a third means the user created one.
            signal: { kind: 'store', predicate: () => (activeCharacter()?.cards.length ?? 0) > 2 },
         },
      },
      {
         id: 'add-journal',
         onArrive: { type: 'setEditing', value: true },
         anchorKey: 'add-card-button',
         titleKey: 'Tutorial.sheet.addJournal_title',
         bodyKey: 'Tutorial.sheet.addJournal_body',
         placement: 'left',
         interaction: 'anchor-only',
         scrim: 'none',
         advance: {
            on: 'user-action',
            // Fixture ships no journals; any journal means the user added one.
            signal: { kind: 'store', predicate: () => (activeCharacter()?.journals.length ?? 0) > 0 },
         },
      },
      {
         // Adding a portrait creates an EMPTY IMAGE_CARD (assetId null) - no asset-store write; the
         // image is only picked later. The fixture ships no portrait, so the Add-menu row is present.
         id: 'add-portrait',
         onArrive: { type: 'setEditing', value: true },
         anchorKey: 'add-card-button',
         titleKey: 'Tutorial.sheet.addPortrait_title',
         bodyKey: 'Tutorial.sheet.addPortrait_body',
         placement: 'left',
         interaction: 'anchor-only',
         scrim: 'none',
         advance: {
            on: 'user-action',
            signal: { kind: 'store', predicate: () => activeCharacter()?.cards.some((card) => card.cardType === 'IMAGE_CARD') ?? false },
         },
      },
      {
         // Gate: flip back to Play, closing the build frame. `onArrive` ensures Edit is on so the flip is
         // meaningful and back-nav re-enters Edit; this is the ONE place Edit turns off (by the user).
         id: 'play-mode',
         onArrive: { type: 'setEditing', value: true },
         anchorKey: 'edit-mode-toggle',
         titleKey: 'Tutorial.sheet.playMode_title',
         bodyKey: 'Tutorial.sheet.playMode_body',
         placement: 'right',
         interaction: 'anchor-only',
         advance: {
            on: 'user-action',
            signal: { kind: 'store', predicate: () => !useAppGeneralStateStore.getState().isEditing },
         },
      },
      {
         // Driven + blocked: a real save writes a drawer row. Never gated. `onArrive` ensures Play.
         id: 'save',
         onArrive: { type: 'setEditing', value: false },
         anchorKey: 'save-character-button',
         titleKey: 'Tutorial.sheet.save_title',
         bodyKey: 'Tutorial.sheet.save_body',
         placement: 'right',
         interaction: 'blocked',
         advance: { on: 'next-click' },
      },
      {
         // Driven + blocked: export emits a file, import reads one. Never gated.
         id: 'export-import',
         onArrive: { type: 'setEditing', value: false },
         anchorKey: 'export-character-button',
         titleKey: 'Tutorial.sheet.exportImport_title',
         bodyKey: 'Tutorial.sheet.exportImport_body',
         placement: 'right',
         interaction: 'blocked',
         advance: { on: 'next-click' },
      },
      {
         // Driven + blocked: creating a real character is a workspace write. Reveal the home chooser
         // (demo tab stays parked); `onLeave` re-activates the demo sheet whichever way the step is left.
         id: 'create-character',
         onArrive: { type: 'deactivateToMenu' },
         onLeave: { type: 'setActiveTab', tabId: DEMO_CHARACTER_ID },
         anchorKey: 'main-menu-chooser',
         titleKey: 'Tutorial.sheet.createCharacter_title',
         bodyKey: 'Tutorial.sheet.createCharacter_body',
         placement: 'top',
         interaction: 'blocked',
         advance: { on: 'next-click' },
      },
      {
         id: 'wrap',
         titleKey: 'Common.nicelyDone',
         bodyKey: 'Tutorial.sheet.wrap_body',
         placement: 'center',
         advance: { on: 'next-click' },
      },
   ],
};
