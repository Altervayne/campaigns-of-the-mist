// -- Icon Imports --
import { Navigation } from 'lucide-react';

// -- Type Imports --
import type { MobileTabId } from '@/lib/mobile/mobileNavTypes';
import type { TutorialAction, TutorialDefinition } from '../tutorialTypes';

/**
 * Mobile App Navigation. Where things live, rather than how to work them: the nav control itself, the three
 * destinations behind it (including the Sheet greying out with no character loaded), the toolbelt, and the
 * Settings hub. The Character Sheet lesson teaches operating the sheet; this one only points.
 * It runs on the REAL app - no demo - so every beat stands on the Menu, the Drawer or Settings, never on the
 * sheet: a user with no character of their own is redirected off it, and the Main Menu beat narrates Create
 * and Import rather than gating them, because those are real writes against the user's own workspace.
 * The mobile shell has two forms and they expose different controls, so the beats that differ carry a
 * `fabMode` override for the anchor, the copy, or the arrival, and the beats that work the ring carry a
 * `shell` that keeps them out of the bar entirely - one arc, branched only where the app is. The ring's pills
 * only exist while it is fanned out, which is why the ring is an arrival axis in that shell and not an axis
 * at all in the other.
 * Picking a destination closes the ring: that is the ring doing its job, not an obstacle, so the arc lets it
 * happen and then teaches it. Each destination gets a beat that says where the user has landed and hands off
 * to that surface's own lesson for the depth, and the user re-opens the ring themselves to move on. The ring
 * is never fanned out for them as a way past a gate - every arrival that opens it only re-establishes what
 * their own tap did a beat earlier, so back-navigation lands somewhere the next tap still means something.
 * Every gate is the user's own tap of the control the beat points at, watched as a `dom-event` on the resolved
 * anchor: the tap's outcome is the page's own nav state, whose store mirror is published a commit later than
 * the arrival that re-arms the gate - so a predicate reading it would still see the position the beat just
 * left and hand back a Next instead of arming. The tap is the signal; watch the tap.
 * Nav is driven through the serializable `mobileNav` bridge (the page owns its own local nav state).
 */

/** The nav axes a beat can depend on. `fab` is FAB-shell only - the bottom bar has no ring. */
interface NavPosition {
   tab: MobileTabId;
   /** Whether the ring is fanned out. Its destination pills do not exist while it is closed. */
   fab?: boolean;
}

/**
 * The arrival descriptors that put the shell in `position`. Every beat names every axis it depends on:
 * arrival is the only hook that runs in both directions, so a beat that set up its state on the way forward
 * alone would strand the user on a surface where its anchor does not exist when they walk back into it. The
 * toolbelt and reorder mode are closed on every arrival - both hide or cover the nav control this tour is
 * about - and each verb is idempotent, so re-asserting an axis already held costs nothing.
 */
function arriveAt(position: NavPosition): TutorialAction[] {
   return [
      { type: 'mobileNav', action: { kind: 'navTab', tab: position.tab } },
      { type: 'mobileNav', action: { kind: 'fab', expanded: position.fab ?? false } },
      { type: 'mobileNav', action: { kind: 'toolbelt', open: false } },
      { type: 'mobileNav', action: { kind: 'reorder', active: false } },
   ];
}

export const MOBILE_NAV_TUTORIAL: TutorialDefinition = {
   id: 'mobile.nav',
   platform: 'mobile',
   system: 'navigation',
   titleKey: 'Common.appNavigation',
   teachKey: 'TutorialsDialog.tutorials.mobileNav.teach',
   icon: Navigation,
   steps: [
      {
         // The Menu is the one destination that is always standable: it needs no character, and it carries the
         // nav shell (the settings drill-down hides it), so the whole arc opens from there.
         id: 'welcome',
         onArrive: arriveAt({ tab: 'menu' }),
         titleKey: 'Tutorial.mobileNav.welcome_title',
         bodyKey: 'Tutorial.mobileNav.welcome_body',
         placement: 'center',
         advance: { on: 'next-click' },
      },
      {
         // The nav control at rest. The ring stays CLOSED here so the FAB shows the glyph the user knows, and
         // the copy describes the fan-out rather than inviting it - the overlay would eat the tap. The next
         // beat opens the ring itself, which shows what this one just described.
         id: 'nav-control',
         onArrive: arriveAt({ tab: 'menu' }),
         anchorKey: 'bottom-tabs',
         titleKey: 'Tutorial.mobileNav.navControl_title',
         bodyKey: 'Tutorial.mobileNav.navControl_body',
         placement: 'top',
         highlightPadding: 8,
         advance: { on: 'next-click' },
         fabMode: {
            anchorKey: 'mobile-fab',
            titleKey: 'Tutorial.mobileNav.navControl_title_fab',
            bodyKey: 'Tutorial.mobileNav.navControl_body_fab',
         },
      },
      {
         // The ring shell only: the bar has nothing to open. The user's own tap fans it out, which is what the
         // beat before described - and every later beat that needs the ring open only ever re-establishes this.
         id: 'open-ring',
         shell: 'fab',
         onArrive: arriveAt({ tab: 'menu' }),
         anchorKey: 'mobile-fab',
         titleKey: 'Tutorial.mobileNav.openRing_title',
         bodyKey: 'Tutorial.mobileNav.openRing_body',
         placement: 'top',
         interaction: 'anchor-only',
         gestureCue: { kind: 'tap' },
         advance: { on: 'user-action', signal: { kind: 'dom-event' } },
      },
      {
         id: 'sheet-dest',
         onArrive: arriveAt({ tab: 'menu' }),
         anchorKey: 'sheet-tab',
         titleKey: 'Tutorial.mobileNav.sheetDest_title',
         bodyKey: 'Tutorial.mobileNav.sheetDest_body',
         placement: 'top',
         advance: { on: 'next-click' },
         fabMode: {
            anchorKey: 'fab-sheet',
            onArrive: arriveAt({ tab: 'menu', fab: true }),
         },
      },
      {
         // Gate: the user's own tap on the Drawer control. Arrival lands on the Menu, so the tap is always
         // still to make - from either direction - and the gate is armed fresh on the anchor each time.
         id: 'drawer-dest',
         onArrive: arriveAt({ tab: 'menu' }),
         anchorKey: 'drawer-tab',
         titleKey: 'Common.theDrawer',
         bodyKey: 'Tutorial.mobileNav.drawerDest_body',
         placement: 'top',
         interaction: 'anchor-only',
         gestureCue: { kind: 'tap' },
         advance: { on: 'user-action', signal: { kind: 'dom-event' } },
         fabMode: {
            anchorKey: 'fab-drawer',
            onArrive: arriveAt({ tab: 'menu', fab: true }),
         },
      },
      {
         // The landing. It arrives with the ring CLOSED - the state the tap before it just produced - and says
         // where the user is, leaving the how to the Drawer's own lesson. The ring shell also names why the nav
         // went away, because that is the thing a user would otherwise read as the app losing their place.
         id: 'drawer-landing',
         onArrive: arriveAt({ tab: 'drawer' }),
         anchorKey: 'drawer-content',
         titleKey: 'Tutorial.mobileNav.drawerLanding_title',
         bodyKey: 'Tutorial.mobileNav.drawerLanding_body',
         placement: 'center',
         advance: { on: 'next-click' },
         fabMode: {
            bodyKey: 'Tutorial.mobileNav.drawerLanding_body_fab',
         },
      },
      {
         // Gate: the user brings the ring back themselves. Arrival closes it, so the tap is still to make from
         // either direction, and nothing is ever fanned out on their behalf to move them along.
         id: 'reopen-ring',
         shell: 'fab',
         onArrive: arriveAt({ tab: 'drawer' }),
         anchorKey: 'mobile-fab',
         titleKey: 'Tutorial.mobileNav.reopenRing_title',
         bodyKey: 'Tutorial.mobileNav.reopenRing_body',
         placement: 'top',
         interaction: 'anchor-only',
         gestureCue: { kind: 'tap' },
         advance: { on: 'user-action', signal: { kind: 'dom-event' } },
      },
      {
         // Gate: the tap onto the Menu, made from the Drawer the previous beat's tap opened. Arrival re-claims
         // the Drawer, so walking back into this beat puts the user where the tap means something again.
         id: 'menu-dest',
         onArrive: arriveAt({ tab: 'drawer' }),
         anchorKey: 'menu-tab',
         titleKey: 'Tutorial.mobileNav.menuDest_title',
         bodyKey: 'Tutorial.mobileNav.menuDest_body',
         placement: 'top',
         interaction: 'anchor-only',
         gestureCue: { kind: 'tap' },
         advance: { on: 'user-action', signal: { kind: 'dom-event' } },
         fabMode: {
            anchorKey: 'fab-menu',
            onArrive: arriveAt({ tab: 'drawer', fab: true }),
         },
      },
      {
         // The Menu's landing, in the same rhythm as the Drawer's: where you are, what it is for. Narrate only -
         // Create and Import write the user's real workspace, so nothing here is gated or invited. The anchor is
         // the whole screen, so the coach sits centred over it.
         id: 'menu-content',
         onArrive: arriveAt({ tab: 'menu' }),
         anchorKey: 'menu-content',
         titleKey: 'Tutorial.mobileNav.menuContent_title',
         bodyKey: 'Tutorial.mobileNav.menuContent_body',
         placement: 'center',
         advance: { on: 'next-click' },
      },
      {
         // A locator, not an invite. The bar's wrench is present on every nav tab (greyed off the sheet, where
         // it has nothing to act on), so it points cleanly from the Menu. The ring carries no toolbelt pill -
         // the toolbelt has its OWN floating button, which mounts with the sheet and so does not exist for a
         // user with no character - so that shell describes the button instead of pointing at one that may
         // not be there.
         id: 'toolbelt-locator',
         onArrive: arriveAt({ tab: 'menu' }),
         anchorKey: 'bottom-tabs-toolbelt',
         titleKey: 'Tutorial.mobileNav.toolbeltLocator_title',
         bodyKey: 'Tutorial.mobileNav.toolbeltLocator_body',
         placement: 'top',
         advance: { on: 'next-click' },
         fabMode: {
            anchorKey: undefined,
            bodyKey: 'Tutorial.mobileNav.toolbeltLocator_body_fab',
            placement: 'center',
         },
      },
      {
         // The last reopen. Same gate, briefer copy - by now it is a reminder rather than a lesson.
         id: 'reopen-ring-2',
         shell: 'fab',
         onArrive: arriveAt({ tab: 'menu' }),
         anchorKey: 'mobile-fab',
         titleKey: 'Tutorial.mobileNav.reopenRing2_title',
         bodyKey: 'Tutorial.mobileNav.reopenRing2_body',
         placement: 'top',
         interaction: 'anchor-only',
         gestureCue: { kind: 'tap' },
         advance: { on: 'user-action', signal: { kind: 'dom-event' } },
      },
      {
         // Gate: the tap into Settings. The bar shell keeps its entry as a row at the top of the Menu; the ring
         // carries its own pill, reachable from anywhere. Arrival re-claims the Menu either way, so the entry
         // is mounted and the tap is still to make.
         id: 'settings-entry',
         onArrive: arriveAt({ tab: 'menu' }),
         anchorKey: 'menu-settings',
         titleKey: 'Tutorial.mobileNav.settingsEntry_title',
         bodyKey: 'Tutorial.mobileNav.settingsEntry_body',
         placement: 'bottom',
         interaction: 'anchor-only',
         gestureCue: { kind: 'tap' },
         advance: { on: 'user-action', signal: { kind: 'dom-event' } },
         fabMode: {
            anchorKey: 'fab-settings',
            bodyKey: 'Tutorial.mobileNav.settingsEntry_body_fab',
            placement: 'top',
            onArrive: arriveAt({ tab: 'menu', fab: true }),
         },
      },
      {
         // Settings' landing, closing the same rhythm. The drill-down hides the nav shell, so there is nothing
         // to point at but the hub itself - and Learn, which is where this lesson came from and lives on.
         id: 'settings-content',
         onArrive: arriveAt({ tab: 'settings' }),
         anchorKey: 'settings-content',
         titleKey: 'Common.whatIsInHere',
         bodyKey: 'Tutorial.mobileNav.settingsContent_body',
         placement: 'center',
         advance: { on: 'next-click' },
      },
      {
         id: 'wrap',
         onArrive: arriveAt({ tab: 'settings' }),
         titleKey: 'Tutorial.mobileNav.wrap_title',
         bodyKey: 'Tutorial.mobileNav.wrap_body',
         placement: 'center',
         advance: { on: 'next-click' },
      },
   ],
};
