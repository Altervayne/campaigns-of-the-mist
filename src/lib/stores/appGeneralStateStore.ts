// -- Other Library Imports --
import { create } from 'zustand';

// -- Type Imports --
import type { CreatableKind } from '@/lib/creation/creatableRegistry';
import type { BoardGridType, BoardTexture, BrushKind } from '@/lib/types/board';
import type { ChallengeGame } from '@/lib/types/common';
import type { MobileNavAction, MobileNavSnapshot } from '@/lib/mobile/mobileNavTypes';



type StoreName = 'character' | 'drawer' | 'board' | 'note';

export type MobileDrawerSnapPoint = 'closed' | 'half' | 'full';

/*
 * A one-shot request the palette hands the active board (which owns the drop point, the selection, and the
 * ephemeral pointer tool): mint a challenge of a game (`createChallenge:<game>`) or a board-native element at the view center, switch the active
 * tool (`setTool:<tool>`), pick a brush (`setBrush:<brush>`, which also switches to the pen), save the
 * selected copy card/tracker back to the drawer / as a new drawer item, or embed a saved note as a live
 * reference tile. The canvas consumes it against its own state and clears it. The `create:<kind>` members
 * mirror the toolbar/radial's `CreatableKind` set (explicit per-kind, not a free-form parameter), so a
 * palette create can't drift from the registry; `setGrid:<type>` swaps the background grid and
 * `setTexture:<texture|none>` swaps the surface texture (keeping any fill);
 * `align:<edge>` / `distribute:<axis>` align or spread the current selection; `embedNote:<drawerItemId>`
 * carries the picked note's id.
 */
export type BoardAction =
   | `createChallenge:${ChallengeGame}`
   | 'setTool:select'
   | 'setTool:pen'
   | 'setTool:line'
   | 'setTool:freeformPolygon'
   | 'setTool:regularPolygon'
   | 'setTool:shape'
   | 'setTool:eraser'
   | `setBrush:${BrushKind}`
   | 'saveItemToDrawer'
   | 'saveItemToDrawerAs'
   | `create:${CreatableKind}`
   | `setGrid:${BoardGridType}`
   | `setTexture:${'none' | BoardTexture}`
   | 'focusJumpToCoordinate'
   | 'mergeSelectedLayers'
   | 'resetRotation'
   | 'frameConnections'
   | 'framePortals'
   | 'align:left'
   | 'align:centerX'
   | 'align:right'
   | 'align:top'
   | 'align:middleY'
   | 'align:bottom'
   | 'distribute:horizontal'
   | 'distribute:vertical'
   | `embedNote:${string}`;

interface AppGeneralState {
   // Undo/Redo Context
   lastModifiedStore: StoreName | null;

   // Command Palette
   isCommandPaletteOpen: boolean;

   // Patch Notes. The version the What's-new pane should land on when the hub next opens (boot auto-open +
   // manual deep-link both set it), read and cleared by the pane.
   initialPatchNotesVersion: string | null;

   // Dialogs
   isSettingsOpen: boolean;
   // One-shot deep-link into the settings hub: the section to land on the next time it opens, read
   // and cleared by the shell (mirrors `initialPatchNotesVersion`). Null lands on the default section.
   settingsInitialSection: string | null;
   isCardDialogOpen: boolean;
   isDesktopOnboardingOpen: boolean;
   isLegacyDataDialogOpen: boolean;
   isMobileOnboardingOpen: boolean;

   // Edit Mode
   isEditing: boolean;

   // Drawer. Three modes: Collapsed (!isDrawerOpen), Open (open + !expanded), Expanded (open + expanded).
   // `isDrawerExpanded` is only meaningful while open; closing clears it.
   isDrawerOpen: boolean;
   isDrawerExpanded: boolean;
   // The Expanded overlay slides aside mid-drag so an item can be dropped on the revealed workspace.
   // Only meaningful while Expanded + dragging; any contract/close clears it.
   isDrawerReceded: boolean;

   // Mobile Drawer
   mobileDrawerSnapPoint: MobileDrawerSnapPoint;

   // A one-shot request the active board consumes and clears (e.g. a palette command minting an item
   // with no cursor point to drop at, or one saving the selection to the drawer). Null when nothing is
   // pending. The canvas owns the drop point AND the selection, so the palette signals through here.
   pendingBoardAction: BoardAction | null;

   // Nav requests the mobile page consumes against its own local setters and drains (mirrors
   // `pendingBoardAction`). The mobile shell keeps its nav state component-local, above the store the
   // tutorial runner can reach, so a drive signals through here. It is a QUEUE, not a slot: one arrival
   // legitimately establishes several nav axes at once (sub-tab AND toolbelt AND reorder mode), and a
   // single slot would keep only the last of them. Empty when nothing is pending.
   pendingMobileNavActions: MobileNavAction[];
   // A write-only mirror the mobile page publishes as its landing position changes. Nothing drives the
   // page FROM it - it exists purely so a tutorial can snapshot the pre-run position and restore it on exit.
   mobileNav: MobileNavSnapshot | null;

   actions: {
      // Undo/Redo Context
      setLastModifiedStore: (storeName: StoreName) => void;

      // Command Palette
      toggleCommandPalette: () => void;
      setCommandPaletteOpen: (isOpen: boolean) => void;

      // Patch Notes
      setInitialPatchNotesVersion: (version: string | null) => void;

      // Dialogs
      setSettingsOpen: (isOpen: boolean) => void;
      setSettingsInitialSection: (section: string | null) => void;
      setCardDialogOpen: (isOpen: boolean) => void;
      setDesktopOnboardingOpen: (isOpen: boolean) => void;
      setLegacyDataDialogOpen: (isOpen: boolean) => void;
      setMobileOnboardingOpen: (isOpen: boolean) => void;

      // Edit Mode
      setIsEditing: (isEditing: boolean) => void;
      toggleIsEditing: () => void;

      // Drawer
      setDrawerOpen: (isOpen: boolean) => void;
      toggleDrawer: () => void;
      setDrawerExpanded: (isExpanded: boolean) => void;
      expandDrawer: () => void;
      contractDrawer: () => void;
      setDrawerReceded: (isReceded: boolean) => void;

      // Mobile Drawer
      setMobileDrawerSnapPoint: (snapPoint: MobileDrawerSnapPoint) => void;

      // Pending board action
      requestBoardAction: (action: BoardAction) => void;
      clearBoardAction: () => void;

      // Pending mobile nav actions + the write-only landing-position mirror
      requestMobileNavAction: (action: MobileNavAction) => void;
      clearMobileNavActions: () => void;
      setMobileNavSnapshot: (snapshot: MobileNavSnapshot) => void;
   };
}



export const useAppGeneralStateStore = create<AppGeneralState>((set) => ({
   // Undo/Redo Context
   lastModifiedStore: null,

   // Command Palette
   isCommandPaletteOpen: false,

   // Patch Notes
   initialPatchNotesVersion: null,

   // Dialogs
   isSettingsOpen: false,
   settingsInitialSection: null,
   isCardDialogOpen: false,
   isDesktopOnboardingOpen: false,
   isLegacyDataDialogOpen: false,
   isMobileOnboardingOpen: false,

   // Edit Mode
   isEditing: false,

   // Drawer
   isDrawerOpen: false,
   isDrawerExpanded: false,
   isDrawerReceded: false,

   // Mobile Drawer
   mobileDrawerSnapPoint: 'closed',

   // Pending board action
   pendingBoardAction: null,

   // Pending mobile nav actions + landing-position mirror
   pendingMobileNavActions: [],
   mobileNav: null,

   actions: {
      // Undo/Redo Context
      setLastModifiedStore: (storeName) => set({ lastModifiedStore: storeName }),

      // Command Palette
      toggleCommandPalette: () => set((state) => ({ isCommandPaletteOpen: !state.isCommandPaletteOpen })),
      setCommandPaletteOpen: (isOpen) => set({ isCommandPaletteOpen: isOpen }),

      // Patch Notes
      setInitialPatchNotesVersion: (version) => set({ initialPatchNotesVersion: version }),

      // Dialogs
      setSettingsOpen: (isOpen) => set({ isSettingsOpen: isOpen }),
      setSettingsInitialSection: (section) => set({ settingsInitialSection: section }),
      setCardDialogOpen: (isOpen) => set({ isCardDialogOpen: isOpen }),
      setDesktopOnboardingOpen: (isOpen) => set({ isDesktopOnboardingOpen: isOpen }),
      setLegacyDataDialogOpen: (isOpen) => set({ isLegacyDataDialogOpen: isOpen }),
      setMobileOnboardingOpen: (isOpen) => set({ isMobileOnboardingOpen: isOpen }),

      // Edit Mode
      setIsEditing: (isEditing) => set({ isEditing }),
      toggleIsEditing: () => set((state) => ({ isEditing: !state.isEditing })),

      // Drawer. Closing always drops Expanded (and any recede) too (only meaningful while open).
      setDrawerOpen: (isOpen) => set(isOpen ? { isDrawerOpen: true } : { isDrawerOpen: false, isDrawerExpanded: false, isDrawerReceded: false }),
      toggleDrawer: () => set((state) => (state.isDrawerOpen ? { isDrawerOpen: false, isDrawerExpanded: false, isDrawerReceded: false } : { isDrawerOpen: true })),
      setDrawerExpanded: (isExpanded) => set({ isDrawerExpanded: isExpanded }),
      expandDrawer: () => set({ isDrawerOpen: true, isDrawerExpanded: true, isDrawerReceded: false }),
      contractDrawer: () => set({ isDrawerExpanded: false, isDrawerReceded: false }),
      setDrawerReceded: (isReceded) => set({ isDrawerReceded: isReceded }),

      // Mobile Drawer
      setMobileDrawerSnapPoint: (snapPoint) => set({ mobileDrawerSnapPoint: snapPoint }),

      // Pending board action
      requestBoardAction: (action) => set({ pendingBoardAction: action }),
      clearBoardAction: () => set({ pendingBoardAction: null }),

      // Pending mobile nav actions + landing-position mirror. Requests APPEND: a step's arrival dispatches
      // its axes one after another in the same tick, and every one of them has to reach the page.
      requestMobileNavAction: (action) => set((state) => ({ pendingMobileNavActions: [...state.pendingMobileNavActions, action] })),
      clearMobileNavActions: () => set({ pendingMobileNavActions: [] }),
      setMobileNavSnapshot: (snapshot) => set({ mobileNav: snapshot }),
   },
}));



export const useAppGeneralStateActions = () => useAppGeneralStateStore((state) => state.actions);