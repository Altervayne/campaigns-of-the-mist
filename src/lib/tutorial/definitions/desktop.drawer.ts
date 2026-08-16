// -- Icon Imports --
import { Library } from 'lucide-react';

// -- Store Imports --
import { useAppGeneralStateStore } from '@/lib/stores/appGeneralStateStore';

// -- Type Imports --
import type { TutorialDefinition } from '../tutorialTypes';

/**
 * D6 - Drawer + Expanded Drawer. A tour of the library where everything you save lives: what the drawer is,
 * the three modes (Collapsed, Open, and the Drawer expanded), folders and items, the See-Workspace drag, search,
 * undo/redo, import/export, and the expand into the roomy full-width Drawer. Two gates carry it - open the drawer,
 * then expand it - both mode transitions on `appGeneralStateStore` (`isDrawerOpen` / `isDrawerExpanded`), which the
 * runner already subscribes to. Every beat only READS the drawer, so `needsDemo:'drawer'` seeds a small curated
 * library behind a read-only overlay and nothing here can reach Dexie. The See-Workspace drag and import/export are
 * narrated, never driven: the drag mutates the real workspace and the pickers write files, both out of the sandbox.
 *
 * Mount-swap: the Open panel (`Drawer.tsx`) and the Expanded surface (`ExpandedDrawer.tsx`) are separate
 * components, so an Open-panel anchor (`drawer-folders` / `drawer-items` / `drawer-search` / `drawer-import`)
 * unmounts on expand. The expanded beat anchors `drawer-expanded` on the Expanded surface; `drawer-expand` sits on
 * the shared header so it resolves in both. `onArrive: setDrawer 'open'` on the Open-panel beats idempotently
 * ensures open-and-not-expanded, so a Back from the expanded Drawer re-contracts; the wrap's teardown contracts the
 * drawer, so no onLeave fights it.
 */

export const DESKTOP_DRAWER_TUTORIAL: TutorialDefinition = {
   id: 'desktop.drawer',
   platform: 'desktop',
   system: 'drawer',
   titleKey: 'Common.theDrawer',
   teachKey: 'TutorialsDialog.tutorials.drawer.teach',
   icon: Library,
   needsDemo: 'drawer',
   steps: [
      {
         id: 'welcome',
         titleKey: 'Common.theDrawer',
         bodyKey: 'Tutorial.drawer.welcome_body',
         placement: 'center',
         advance: { on: 'next-click' },
      },
      {
         // Gate: Collapsed is mode one; the user summons the drawer from the side button. The signal is the
         // `isDrawerOpen` flag flipping true - the honest "you opened it" read. Dim + `anchor-only` so the
         // toggle is clickable through the veil; the skip-step escape covers a back-nav into an open drawer.
         id: 'open',
         anchorKey: 'drawer-toggle',
         titleKey: 'Common.openTheDrawer',
         bodyKey: 'Tutorial.drawer.open_body',
         placement: 'right',
         interaction: 'anchor-only',
         advance: {
            on: 'user-action',
            signal: { kind: 'store', predicate: () => useAppGeneralStateStore.getState().isDrawerOpen === true },
         },
      },
      {
         // Folders sort the library. Dim read over the folder section; `setDrawer:'open'` keeps the panel open
         // (and re-contracts on a Back from the Library).
         id: 'folders',
         onArrive: { type: 'setDrawer', mode: 'open' },
         anchorKey: 'drawer-folders',
         titleKey: 'Common.folders',
         bodyKey: 'Tutorial.drawer.folders_body',
         placement: 'left',
         advance: { on: 'next-click' },
      },
      {
         // Each card is a saved thing; the preview + date line and the rich/list toggle fold in here. Dim read.
         id: 'items',
         onArrive: { type: 'setDrawer', mode: 'open' },
         anchorKey: 'drawer-items',
         titleKey: 'Tutorial.drawer.items_title',
         bodyKey: 'Tutorial.drawer.items_body',
         placement: 'left',
         advance: { on: 'next-click' },
      },
      {
         // The See-Workspace drag: DESCRIBE-ONLY. A real drag lands in the user's live workspace (there is no
         // demo target), so it is narrated, never a "try it" invite. Keep the items lit (`scrim:'none'` +
         // `anchor-only`) so the reader can look them over while they read.
         id: 'see-workspace',
         onArrive: { type: 'setDrawer', mode: 'open' },
         anchorKey: 'drawer-items',
         titleKey: 'Tutorial.drawer.seeWorkspace_title',
         bodyKey: 'Tutorial.drawer.seeWorkspace_body',
         placement: 'left',
         interaction: 'anchor-only',
         scrim: 'none',
         advance: { on: 'next-click' },
      },
      {
         // Search the whole library; the Filters line folds in here. The dim returns after the lit drag beat,
         // with the search field cut out (`anchor-only`) so it stays typeable if the user wants to try a query.
         // Not gated - a search is a read, and its result state lives on the un-subscribed `drawerStore`.
         id: 'search',
         onArrive: { type: 'setDrawer', mode: 'open' },
         anchorKey: 'drawer-search',
         titleKey: 'Tutorial.drawer.search_title',
         bodyKey: 'Tutorial.drawer.search_body',
         placement: 'left',
         interaction: 'anchor-only',
         advance: { on: 'next-click' },
      },
      {
         // Import brings items in, export shares them out. Narrated, never driven - both pickers touch files, out
         // of the sandbox. Dim read over the import/export controls.
         id: 'import-export',
         onArrive: { type: 'setDrawer', mode: 'open' },
         anchorKey: 'drawer-import',
         titleKey: 'Tutorial.drawer.importExport_title',
         bodyKey: 'Tutorial.drawer.importExport_body',
         placement: 'left',
         advance: { on: 'next-click' },
      },
      {
         // Undo/redo for the drawer itself: a move, rename, or delete steps back and forward. Its own beat - it
         // has nothing to do with import/export. The buttons sit in the header. Dim read.
         id: 'undo-redo',
         onArrive: { type: 'setDrawer', mode: 'open' },
         anchorKey: 'drawer-undo-redo-buttons',
         titleKey: 'Common.undoAndRedo',
         bodyKey: 'Tutorial.drawer.undoRedo_body',
         placement: 'left',
         advance: { on: 'next-click' },
      },
      {
         // Gate: the user expands the drawer into the Library from the shared header's mode button. The signal
         // is `isDrawerExpanded` flipping true. `setDrawer:'open'` on arrive re-contracts a Back from the
         // Library so the expand is performed fresh; dim + `anchor-only` so the button is clickable; skip-step
         // escape covers a back-nav into an already-expanded drawer.
         id: 'expand',
         onArrive: { type: 'setDrawer', mode: 'open' },
         anchorKey: 'drawer-expand',
         titleKey: 'Tutorial.drawer.expand_title',
         bodyKey: 'Tutorial.drawer.expand_body',
         placement: 'left',
         interaction: 'anchor-only',
         advance: {
            on: 'user-action',
            signal: { kind: 'store', predicate: () => useAppGeneralStateStore.getState().isDrawerExpanded === true },
         },
      },
      {
         // Mode three: the same Drawer with the whole width to spread out; the recede-dwell line (drag, hold the
         // bottom edge, the expanded Drawer slides aside) folds in here. `setDrawer:'expanded'` ensures the
         // expanded surface is open on arrive; the anchor lives on it, so the observer waits out the Open->
         // Expanded remount.
         id: 'expanded',
         onArrive: { type: 'setDrawer', mode: 'expanded' },
         anchorKey: 'drawer-expanded',
         titleKey: 'Tutorial.drawer.expanded_title',
         bodyKey: 'Tutorial.drawer.expanded_body',
         placement: 'left',
         advance: { on: 'next-click' },
      },
      {
         id: 'wrap',
         titleKey: 'Tutorial.drawer.wrap_title',
         bodyKey: 'Tutorial.drawer.wrap_body',
         placement: 'center',
         advance: { on: 'next-click' },
      },
   ],
};
