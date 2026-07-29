// -- Icon Imports --
import { ScrollText } from 'lucide-react';

// -- Store Imports --
import { useAppGeneralStateStore } from '@/lib/stores/appGeneralStateStore';
import { getActiveCharacterStore } from '@/lib/character/characterStoreRegistry';

// -- Type Imports --
import type { Character } from '@/lib/types/character';
import type { MobileSheetTab } from '@/lib/mobile/mobileNavTypes';
import type { TutorialAction, TutorialDefinition } from '../tutorialTypes';

/**
 * Mobile Character Sheet. The touch port of the desktop sheet tour: rename, the Trackers / Cards
 * tabs, the toolbelt, Edit vs Play, then real creations. Only three actions are observable to a store
 * the runner can reach, so only three beats gate - flipping Edit on, adding a status, and opening the
 * reorder mode (which the nav bridge mirrors) - each on the fresh store result of the user's own tap.
 * Every other affordance is a raw touch gesture whose result is local component state or nothing at
 * all (long-press select, card swipe, the drag itself, flip), so those beats NARRATE and draw a
 * looping `gestureCue` instead of gating. EVERY beat's `onArrive` idempotently establishes all five
 * axes it depends on - main tab, sheet sub-tab, toolbelt, reorder mode, Edit mode - because arrival is
 * the only hook that runs in both directions: a beat that only set up its own state on the way forward
 * would strand the user on a surface where its anchor does not exist when they walk back into it. Nav is
 * driven through the serializable `mobileNav` bridge (the page owns its own local nav state); the
 * runner never captures a setter.
 * The toolbelt is opened for the Edit-toggle gate and closed again for the add-status gate so the
 * section's own add buttons show. Creations run on the seeded demo character, whose store carries no
 * persistence handle, so the mutations live purely in memory. Gate predicates read the active
 * character store fresh; hooks go through `runTutorialAction`.
 */

/** The active (demo) character, read fresh for a gate predicate. Null before the sheet mounts. */
function activeCharacter(): Character | null {
   return getActiveCharacterStore()?.getState().character ?? null;
}

/** The four sheet axes a beat can depend on. Every beat names all of them. */
interface SheetPosition {
   sheetTab: MobileSheetTab;
   toolbelt: boolean;
   reorder: boolean;
   editing: boolean;
}

/**
 * The arrival descriptors that put the sheet in `position`. Every beat of this tour lives on the sheet, so
 * arrival claims the main tab first: the run can be launched from anywhere in the app, and a user with no
 * character of their own only has a sheet to stand on once the demo is seeded - which arrival is ordered
 * after. Spelling out all four sheet axes on top of it is the point: whichever direction a beat is entered
 * from, it lands on the surface its anchor lives on and with its gate re-armed. Each verb is idempotent, so
 * re-asserting an axis already held costs nothing.
 */
function arriveAt(position: SheetPosition): TutorialAction[] {
   return [
      { type: 'mobileNav', action: { kind: 'navTab', tab: 'sheet' } },
      { type: 'mobileNav', action: { kind: 'sheetTab', tab: position.sheetTab } },
      { type: 'mobileNav', action: { kind: 'toolbelt', open: position.toolbelt } },
      { type: 'mobileNav', action: { kind: 'reorder', active: position.reorder } },
      { type: 'setEditing', value: position.editing },
   ];
}

export const MOBILE_SHEET_TUTORIAL: TutorialDefinition = {
   id: 'mobile.sheet',
   platform: 'mobile',
   system: 'sheet',
   titleKey: 'TutorialsDialog.tutorials.mobileSheet.title',
   teachKey: 'TutorialsDialog.tutorials.mobileSheet.teach',
   icon: ScrollText,
   needsDemo: 'character',
   steps: [
      {
         id: 'overview',
         onArrive: arriveAt({ sheetTab: 'trackers', toolbelt: false, reorder: false, editing: false }),
         titleKey: 'Tutorial.mobileSheet.overview_title',
         bodyKey: 'Tutorial.mobileSheet.overview_body',
         placement: 'center',
         advance: { on: 'next-click' },
      },
      {
         id: 'name',
         onArrive: arriveAt({ sheetTab: 'trackers', toolbelt: false, reorder: false, editing: false }),
         anchorKey: 'character-name-input',
         titleKey: 'Tutorial.mobileSheet.name_title',
         bodyKey: 'Tutorial.mobileSheet.name_body',
         placement: 'bottom',
         interaction: 'anchor-only',
         gestureCue: { kind: 'tap' },
         advance: { on: 'next-click' },
      },
      {
         id: 'tabs',
         onArrive: arriveAt({ sheetTab: 'trackers', toolbelt: false, reorder: false, editing: false }),
         anchorKey: 'trackers-tab',
         titleKey: 'Tutorial.mobileSheet.tabs_title',
         bodyKey: 'Tutorial.mobileSheet.tabs_body',
         placement: 'bottom',
         interaction: 'anchor-only',
         gestureCue: { kind: 'tap' },
         advance: { on: 'next-click' },
      },
      {
         id: 'trackers',
         onArrive: arriveAt({ sheetTab: 'trackers', toolbelt: false, reorder: false, editing: false }),
         anchorKey: 'trackers-section',
         titleKey: 'Tutorial.mobileSheet.trackers_title',
         bodyKey: 'Tutorial.mobileSheet.trackers_body',
         placement: 'top',
         advance: { on: 'next-click' },
      },
      {
         // The toolbelt holds the tools the desktop sidebar carries. Open it and keep it lit
         // (`scrim:'none'`) so the tiles inside stay visible; the coach only points, no gate.
         id: 'toolbelt',
         onArrive: arriveAt({ sheetTab: 'trackers', toolbelt: true, reorder: false, editing: false }),
         anchorKey: 'toolbelt',
         titleKey: 'Tutorial.mobileSheet.toolbelt_title',
         bodyKey: 'Tutorial.mobileSheet.toolbelt_body',
         placement: 'top',
         interaction: 'anchor-only',
         scrim: 'none',
         advance: { on: 'next-click' },
      },
      {
         // Gate: the toolbelt stays open (the Edit tile lives inside it) and Edit starts off, so the
         // gate is meaningful; both are re-established on arrival for back-navigation. The tile stays
         // lit and tappable (`scrim:'none'` + `anchor-only`).
         id: 'enter-edit',
         onArrive: arriveAt({ sheetTab: 'trackers', toolbelt: true, reorder: false, editing: false }),
         anchorKey: 'edit-mode-toggle',
         titleKey: 'Tutorial.mobileSheet.enterEdit_title',
         bodyKey: 'Tutorial.mobileSheet.enterEdit_body',
         placement: 'top',
         interaction: 'anchor-only',
         scrim: 'none',
         gestureCue: { kind: 'tap' },
         advance: {
            on: 'user-action',
            signal: { kind: 'store', predicate: () => useAppGeneralStateStore.getState().isEditing },
         },
      },
      {
         // Gate: Edit persists, and the toolbelt closes so the section's own add buttons show. The
         // add button mutates the store inline (no dialog), so it is the cleanest gate in the set.
         id: 'add-status',
         onArrive: arriveAt({ sheetTab: 'trackers', toolbelt: false, reorder: false, editing: true }),
         anchorKey: 'add-status-button',
         titleKey: 'Tutorial.mobileSheet.addStatus_title',
         bodyKey: 'Tutorial.mobileSheet.addStatus_body',
         placement: 'top',
         interaction: 'anchor-only',
         gestureCue: { kind: 'tap' },
         advance: {
            on: 'user-action',
            // Fixture ships one status; a second means the user added one.
            signal: { kind: 'store', predicate: () => (activeCharacter()?.trackers.statuses.length ?? 0) > 1 },
         },
      },
      {
         // A locator, not an invite: point at the story-tag and story-theme buttons to show they add
         // the same way. No cue. Edit stays on so the buttons remain visible.
         id: 'add-more',
         onArrive: arriveAt({ sheetTab: 'trackers', toolbelt: false, reorder: false, editing: true }),
         anchorKey: 'add-story-tag-button',
         titleKey: 'Tutorial.mobileSheet.addMore_title',
         bodyKey: 'Tutorial.mobileSheet.addMore_body',
         placement: 'top',
         advance: { on: 'next-click' },
      },
      {
         // The long-press signature. Selection is a Play-mode gesture whose result is local state, so
         // it can't gate: narrate and cue. Back to Play on arrival.
         id: 'tracker-select',
         onArrive: arriveAt({ sheetTab: 'trackers', toolbelt: false, reorder: false, editing: false }),
         anchorKey: 'trackers-section',
         titleKey: 'Tutorial.mobileSheet.trackerSelect_title',
         bodyKey: 'Tutorial.mobileSheet.trackerSelect_body',
         placement: 'top',
         interaction: 'anchor-only',
         gestureCue: { kind: 'long-press' },
         advance: { on: 'next-click' },
      },
      {
         // Cross to the cards half. It arrives on the TRACKERS tab - the beat points at the Cards tab and
         // invites the tap, so the copy is only true from the other side; the next beat establishes the
         // carousel itself either way, so nothing has to be handed forward from here.
         id: 'cards',
         onArrive: arriveAt({ sheetTab: 'trackers', toolbelt: false, reorder: false, editing: false }),
         anchorKey: 'cards-tab',
         titleKey: 'Tutorial.mobileSheet.cards_title',
         bodyKey: 'Tutorial.mobileSheet.cards_body',
         placement: 'bottom',
         interaction: 'anchor-only',
         gestureCue: { kind: 'tap' },
         advance: { on: 'next-click' },
      },
      {
         // The swipe signature, on the carousel.
         id: 'card-swipe',
         onArrive: arriveAt({ sheetTab: 'cards', toolbelt: false, reorder: false, editing: false }),
         anchorKey: 'card-carousel',
         titleKey: 'Tutorial.mobileSheet.cardSwipe_title',
         bodyKey: 'Tutorial.mobileSheet.cardSwipe_body',
         placement: 'top',
         interaction: 'anchor-only',
         gestureCue: { kind: 'swipe', direction: 'left', intensity: 'wide' },
         advance: { on: 'next-click' },
      },
      {
         id: 'card-nav',
         onArrive: arriveAt({ sheetTab: 'cards', toolbelt: false, reorder: false, editing: false }),
         anchorKey: 'card-navigation-bar',
         titleKey: 'Tutorial.mobileSheet.cardNav_title',
         bodyKey: 'Tutorial.mobileSheet.cardNav_body',
         placement: 'top',
         interaction: 'anchor-only',
         gestureCue: { kind: 'tap' },
         advance: { on: 'next-click' },
      },
      {
         // Gate: the overview is a mode, not a gesture on the nav bar, so this beat points at its front
         // door and waits on the mode itself. Off on arrival so the gate is meaningful and back-nav from
         // the beats inside re-establishes it.
         id: 'open-reorder',
         onArrive: arriveAt({ sheetTab: 'cards', toolbelt: false, reorder: false, editing: false }),
         anchorKey: 'card-reorder-button',
         titleKey: 'Tutorial.mobileSheet.openOverview_title',
         bodyKey: 'Tutorial.mobileSheet.openOverview_body',
         placement: 'top',
         interaction: 'anchor-only',
         gestureCue: { kind: 'tap' },
         advance: {
            on: 'user-action',
            signal: { kind: 'store', predicate: () => useAppGeneralStateStore.getState().mobileNav?.reordering === true },
         },
      },
      {
         // A locator, not an invite (like `add-more`): tapping the add row leaves for the full-screen
         // creator, which would take this beat's own surface with it. Ordered before the drag beat,
         // whose `onLeave` drops the mode - a beat after it would exit the overview and re-enter it
         // just to be shown.
         id: 'overview-add-card',
         onArrive: arriveAt({ sheetTab: 'cards', toolbelt: false, reorder: true, editing: false }),
         anchorKey: 'card-overview-add',
         titleKey: 'Tutorial.mobileSheet.overviewAddCard_title',
         bodyKey: 'Tutorial.mobileSheet.overviewAddCard_body',
         placement: 'top',
         advance: { on: 'next-click' },
      },
      {
         // The drag signature, taught where it actually lives. The anchor is the first row's grip - the
         // only thing in the list that answers to a drag - so the cue lands on the handle rather than
         // mid-list, and the exposed hole can't be a card preview (tapping one jumps to that card and
         // drops reorder mode, destroying the beat's own surface). The drag itself is unaffected: the
         // touch sensor binds its move/end listeners straight to the grip the press landed on.
         // `onArrive` is idempotent - the user may have tapped in already, and back-nav re-enters the
         // mode; `onLeave` returns to the carousel in either direction, exit included.
         id: 'reorder-drag',
         onArrive: arriveAt({ sheetTab: 'cards', toolbelt: false, reorder: true, editing: false }),
         onLeave: { type: 'mobileNav', action: { kind: 'reorder', active: false } },
         anchorKey: 'card-reorder-grip',
         titleKey: 'Tutorial.mobileSheet.reorderDrag_title',
         bodyKey: 'Tutorial.mobileSheet.reorderDrag_body',
         placement: 'top',
         interaction: 'anchor-only',
         gestureCue: { kind: 'press-drag', direction: 'down', intensity: 'wide' },
         advance: { on: 'next-click' },
      },
      {
         id: 'wrap',
         onArrive: arriveAt({ sheetTab: 'cards', toolbelt: false, reorder: false, editing: false }),
         titleKey: 'Tutorial.mobileSheet.wrap_title',
         bodyKey: 'Tutorial.mobileSheet.wrap_body',
         placement: 'center',
         advance: { on: 'next-click' },
      },
   ],
};
