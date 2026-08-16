// -- Icon Imports --
import { Library } from 'lucide-react';

// -- Type Imports --
import type { TutorialAction, TutorialDefinition } from '../tutorialTypes';

/**
 * Mobile Drawer. The library: what is in it, searching and filtering it, the two row shapes, folders, the
 * per-item menu, rearranging, and the toolbar along the bottom.
 * NOTHING here gates, and that is the shape of the surface rather than a shortcut. Every affordance the tour
 * covers is one of two kinds. The first is component-local: folder navigation, the search text, the rich /
 * compact switch and the per-item menu all live in the drawer's own state, which the nav bridge does not
 * reach - so a beat could not re-establish them on arrival, and a gate that cannot be re-armed strands the
 * user the moment they walk back into it. The second is a real write against the user's own library: every
 * item action and every toolbar action adds, loads, renames, moves, deletes, imports or exports something
 * they own. Those are described and never invited. What is left is narration, so the teaching rides on
 * accurate copy and the gesture cue - and the beats that describe an affordance stay `blocked`, which also
 * keeps the drawer's local state exactly where each arrival left it for the beats that follow.
 * Rearranging is the one exception, and the only place a user's own hands are let through: the demo library
 * routes its records AND its undo history, so a drag here cannot reach the real drawer. The copy has to be
 * exact, because the drawer's rows have no grip - the row itself is the target - and its sensor asks for a
 * 500ms hold rather than the card list's 150ms.
 * It reads a seeded demo library through a read-only overlay (a new user's real drawer is empty, which would
 * gut every beat). That overlay is not a tab, so arrival claims the drawer tab itself; nav is driven through
 * the serializable `mobileNav` bridge (the page owns its own local nav state).
 */

/**
 * The arrival descriptors that put the shell on the drawer. Every beat of this tour lives there and depends on
 * the same four axes, so every beat names all four: arrival is the only hook that runs in both directions, and
 * a beat that set up its surface on the way forward alone would strand the user when they walk back into it.
 * The toolbelt and the card-reorder mode are the sheet's, not the drawer's, but they cover the screen the
 * drawer needs, so they are closed here too. Each verb is idempotent, so re-asserting an axis already held
 * costs nothing.
 */
function arriveAt(): TutorialAction[] {
   return [
      { type: 'mobileNav', action: { kind: 'navTab', tab: 'drawer' } },
      { type: 'mobileNav', action: { kind: 'fab', expanded: false } },
      { type: 'mobileNav', action: { kind: 'toolbelt', open: false } },
      { type: 'mobileNav', action: { kind: 'reorder', active: false } },
   ];
}

export const MOBILE_DRAWER_TUTORIAL: TutorialDefinition = {
   id: 'mobile.drawer',
   platform: 'mobile',
   system: 'drawer',
   titleKey: 'Common.theDrawer',
   teachKey: 'TutorialsDialog.tutorials.mobileDrawer.teach',
   icon: Library,
   needsDemo: 'drawer',
   steps: [
      {
         id: 'welcome',
         onArrive: arriveAt(),
         titleKey: 'Tutorial.mobileDrawer.welcome_title',
         bodyKey: 'Tutorial.mobileDrawer.welcome_body',
         placement: 'center',
         advance: { on: 'next-click' },
      },
      {
         // The anchor is the whole drawer, so the coach sits centred over it.
         id: 'content',
         onArrive: arriveAt(),
         anchorKey: 'drawer-content',
         titleKey: 'Common.whatIsInHere',
         bodyKey: 'Tutorial.mobileDrawer.content_body',
         placement: 'center',
         advance: { on: 'next-click' },
      },
      {
         // The ring lands on the field itself; the copy names the Filters button beside it, which is the
         // other half of a search and has no marker of its own.
         id: 'search',
         onArrive: arriveAt(),
         anchorKey: 'drawer-search',
         titleKey: 'Tutorial.mobileDrawer.search_title',
         bodyKey: 'Tutorial.mobileDrawer.search_body',
         placement: 'bottom',
         advance: { on: 'next-click' },
      },
      {
         id: 'view-toggle',
         onArrive: arriveAt(),
         anchorKey: 'drawer-view-toggle',
         titleKey: 'Tutorial.mobileDrawer.viewToggle_title',
         bodyKey: 'Tutorial.mobileDrawer.viewToggle_body',
         placement: 'top',
         advance: { on: 'next-click' },
      },
      {
         // A locator over the library as a whole. Blocked on purpose: entering a folder is the drawer's own
         // state, which no later arrival could put back, so the beats after this one would be pointing into a
         // folder the user had wandered into.
         id: 'folders',
         onArrive: arriveAt(),
         anchorKey: 'drawer-content',
         titleKey: 'Common.folders',
         bodyKey: 'Tutorial.mobileDrawer.folders_body',
         placement: 'center',
         advance: { on: 'next-click' },
      },
      {
         // Everything behind this button writes the user's own library, so the beat describes the menu and
         // never opens it.
         id: 'item-menu',
         onArrive: arriveAt(),
         anchorKey: 'drawer-item-menu',
         titleKey: 'Tutorial.mobileDrawer.itemMenu_title',
         bodyKey: 'Tutorial.mobileDrawer.itemMenu_body',
         placement: 'bottom',
         advance: { on: 'next-click' },
      },
      {
         // The signature, and the one beat the user's own hands are let through. The anchor is the first row's
         // drag BODY - the drawer has no grip, so the body is what answers to the press, and it frames the row
         // the cue draws on. Deliberately not the row root: that would put the item's own menu button inside
         // the exposed hole, and everything behind it is a real write. Nothing else in the body is tappable, so
         // the hole exposes the gesture and only it.
         // The reorder this invites lands entirely in the demo library - the session routes the records and the
         // demo's own engine holds the history - so the user's real drawer is not reachable from here.
         id: 'reorder',
         onArrive: arriveAt(),
         anchorKey: 'drawer-item-body',
         titleKey: 'Tutorial.mobileDrawer.reorder_title',
         bodyKey: 'Tutorial.mobileDrawer.reorder_body',
         placement: 'top',
         interaction: 'anchor-only',
         gestureCue: { kind: 'press-drag', direction: 'down', intensity: 'wide' },
         advance: { on: 'next-click' },
      },
      {
         id: 'toolbar',
         onArrive: arriveAt(),
         anchorKey: 'drawer-toolbar',
         titleKey: 'Tutorial.mobileDrawer.toolbar_title',
         bodyKey: 'Tutorial.mobileDrawer.toolbar_body',
         placement: 'top',
         advance: { on: 'next-click' },
      },
      {
         id: 'wrap',
         onArrive: arriveAt(),
         titleKey: 'Tutorial.mobileDrawer.wrap_title',
         bodyKey: 'Tutorial.mobileDrawer.wrap_body',
         placement: 'center',
         advance: { on: 'next-click' },
      },
   ],
};
