// -- Icon Imports --
import { Waypoints } from 'lucide-react';

// -- Store Imports --
import { useNavigatorStore } from '@/lib/navigator/navigatorStore';
import { useTabManagerStore } from '@/lib/character/tabManagerStore';

// -- Local Imports --
import { DEMO_PORTAL_BOARD_ID } from '../demo/demoSentinels';

// -- Type Imports --
import type { TutorialDefinition } from '../tutorialTypes';

/**
 * D5 - Portals + Navigator. A tour of the link graph: what a portal is, how you make one, then the
 * Navigator as the map that reads the whole graph - the tree, a crawl down a caret, a jump through a
 * row, the re-centered tree that lands you deeper, and the trail that tracks the dive back out. The
 * demo graph is a board that portals to a note that links on to a second board (`needsDemo:'portal-graph'`),
 * so the crawl has real depth and the jump crosses entity types. Making a portal is NARRATED, never gated:
 * the real target picker lists the user's own drawer, so a minted link would point out of the sandbox. The
 * two gates land on the results the demo graph can satisfy - a caret expanded (`expandedIds.size`) and a
 * dive begun (`journey.entries.length`) - both read fresh, both with the skip-step escape. The pre-jump
 * board beats carry `setActiveTab: Vault` so backing up after a dive re-lands on the entry board (the D1
 * home-base idempotence); the Navigator beats each ensure the panel is open on arrive. The working gate
 * beats run `scrim:'none'` + `anchor-only` so the panel and trail stay lit and live under the user's hands.
 */

/** Expanded-node count on the Navigator's live tree; the root auto-expands to a baseline of 1. */
function navigatorExpandedCount(): number {
   return useNavigatorStore.getState().expandedIds.size;
}

/** Portal-trail length; a dive pushes both endpoints, so 2 is the first crumb pair (and un-hides the bar). */
function journeyLength(): number {
   return useTabManagerStore.getState().journey.entries.length;
}

export const DESKTOP_PORTALS_TUTORIAL: TutorialDefinition = {
   id: 'desktop.portals',
   platform: 'desktop',
   system: 'portals',
   titleKey: 'Common.portalsAndTheNavigator',
   teachKey: 'TutorialsDialog.tutorials.portals.teach',
   icon: Waypoints,
   needsDemo: 'portal-graph',
   steps: [
      {
         id: 'welcome',
         titleKey: 'Common.portalsAndTheNavigator',
         bodyKey: 'Tutorial.portals.welcome_body',
         placement: 'center',
         advance: { on: 'next-click' },
      },
      {
         // A read of the entry board's portal tile: land on the Vault and frame its portals into view, then
         // keep the canvas lit so the user can double-click the tile to dive if they like. `framePortals`
         // also restores select mode. Only ONE board action here - two would collide on the single pending
         // slot, but a tab switch and a board action touch different stores and pair fine.
         id: 'what-is-portal',
         onArrive: [{ type: 'setActiveTab', tabId: DEMO_PORTAL_BOARD_ID }, { type: 'board', action: 'framePortals' }],
         anchorKey: 'board-canvas',
         titleKey: 'Tutorial.portals.whatIsPortal_title',
         bodyKey: 'Tutorial.portals.whatIsPortal_body',
         placement: 'center',
         interaction: 'anchor-only',
         scrim: 'none',
         advance: { on: 'next-click' },
      },
      {
         // How you make one, narrated over the Add menu (Add -> Portal -> pick a target). Stay on the Vault
         // and ensure select mode so the add cluster is mounted and its anchor resolves. The picker is never
         // driven - it lists real drawer entities, so making a link is a read-only aside, not a gate.
         id: 'make-a-link',
         onArrive: [{ type: 'setActiveTab', tabId: DEMO_PORTAL_BOARD_ID }, { type: 'board', action: 'setTool:select' }],
         anchorKey: 'board-add-menu',
         titleKey: 'Tutorial.portals.makeALink_title',
         bodyKey: 'Tutorial.portals.makeALink_body',
         placement: 'top',
         advance: { on: 'next-click' },
      },
      {
         // Where the map lives: spotlight the Navigator button with the panel still CLOSED, so the beat shows
         // the button before it opens (the user reads what the toggle does, then the next beat opens it).
         id: 'open-navigator',
         onArrive: { type: 'setNavigator', open: false },
         anchorKey: 'navigator-button',
         titleKey: 'Tutorial.portals.openNavigator_title',
         bodyKey: 'Tutorial.portals.openNavigator_body',
         placement: 'right',
         advance: { on: 'next-click' },
      },
      {
         // Read the tree: the root is you-are-here (ringed), its children are destinations. Ensure the panel
         // is open on arrive (back-nav re-opens it), and zero the trail so an earlier lit-canvas dive can't
         // leave the jump gate two beats on pre-satisfied. A real rect on the left edge spotlights fine under dim.
         id: 'read-the-tree',
         onArrive: [{ type: 'setNavigator', open: true }, { type: 'clearJourney' }],
         anchorKey: 'navigator-panel',
         titleKey: 'Tutorial.portals.readTheTree_title',
         bodyKey: 'Tutorial.portals.readTheTree_body',
         placement: 'right',
         advance: { on: 'next-click' },
      },
      {
         // Gate: the user crawls a caret to grow the tree a level. The root auto-expands to a baseline of 1,
         // so a count above 1 means a child caret was opened. Panel stays lit + live (`scrim:'none'` +
         // `anchor-only`) so the caret is clickable; the skip-step escape covers a back-nav into a satisfied gate.
         id: 'crawl',
         onArrive: { type: 'setNavigator', open: true },
         anchorKey: 'navigator-panel',
         titleKey: 'Tutorial.portals.crawl_title',
         bodyKey: 'Tutorial.portals.crawl_body',
         placement: 'right',
         interaction: 'anchor-only',
         scrim: 'none',
         advance: {
            on: 'user-action',
            signal: { kind: 'store', predicate: () => navigatorExpandedCount() > 1 },
         },
      },
      {
         // Gate: the user double-clicks a row to dive through the link. The dive pushes both endpoints onto
         // the trail, so two entries means the jump happened (and un-hides the trail bar for the next beat).
         // The jump switches tabs and remounts the board, but the runner + Navigator + trail are app chrome
         // and survive; the anchor observer waits the remount out.
         id: 'jump',
         onArrive: { type: 'setNavigator', open: true },
         anchorKey: 'navigator-panel',
         titleKey: 'Tutorial.portals.jump_title',
         bodyKey: 'Tutorial.portals.jump_body',
         placement: 'right',
         interaction: 'anchor-only',
         scrim: 'none',
         advance: {
            on: 'user-action',
            signal: { kind: 'store', predicate: () => journeyLength() >= 2 },
         },
      },
      {
         // The tree re-centered on where the dive landed: the root ring is now the destination, its own
         // children below. Ensure the panel is open (back-nav from the trail beat re-opens it).
         id: 'map-recenters',
         onArrive: { type: 'setNavigator', open: true },
         anchorKey: 'navigator-panel',
         titleKey: 'Tutorial.portals.mapRecenters_title',
         bodyKey: 'Tutorial.portals.mapRecenters_body',
         placement: 'right',
         advance: { on: 'next-click' },
      },
      {
         // The breadcrumb that tracks the dive: it only exists after a jump, so this beat can only be reached
         // once the trail bar has mounted. Inert on arrive beyond keeping the panel open - there is no jump
         // action to re-perform, the dive is the user's own; the anchor observer waits out the board remount.
         id: 'back-trail',
         onArrive: { type: 'setNavigator', open: true },
         anchorKey: 'portal-trail',
         titleKey: 'Tutorial.portals.backTrail_title',
         bodyKey: 'Tutorial.portals.backTrail_body',
         placement: 'bottom',
         interaction: 'anchor-only',
         scrim: 'none',
         advance: { on: 'next-click' },
      },
      {
         id: 'wrap',
         titleKey: 'Tutorial.portals.wrap_title',
         bodyKey: 'Tutorial.portals.wrap_body',
         placement: 'center',
         advance: { on: 'next-click' },
      },
   ],
};
