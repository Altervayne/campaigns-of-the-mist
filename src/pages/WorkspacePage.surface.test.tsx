// @vitest-environment jsdom

// -- Library Imports --
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

// -- Component Imports --
import WorkspacePage from './WorkspacePage';

// -- Store Imports --
import { useAppGeneralStateStore } from '@/lib/stores/appGeneralStateStore';
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';

/*
 * Locks the workspace shell's surface switch: the note -> board -> character -> menu precedence, the fact
 * that the switch is ONE chained ternary in ONE JSX position (so the outgoing branch unmounts outright),
 * and the `activeWindow` string the sidebar is handed for each state.
 *
 * The load-bearing case is the flush across the switch. The sheet's name header holds a debounced buffer
 * and no blur fires when a tab switch unmounts it, so the write only survives because the header sits in
 * the branch that unmounts and commits through the active character's own `updateCharacterName`.
 *
 * Everything below the shell is mocked: this covers the page's wiring, not its children.
 */

interface CharacterLike {
   id: string;
   name: string;
   game: string;
}

const mocks = vi.hoisted(() => {
   // One commit spy per character id, mirroring the real `useCharacterActions()`: the action is resolved
   // from the active character context, so it is that character's own writer. Which spy receives a name is
   // the whole point of the contamination case below.
   const commits = new Map<string, ReturnType<typeof vi.fn>>();
   return {
      character: null as { id: string; name: string; game: string } | null,
      activeBoard: null as object | null,
      activeNote: null as object | null,
      // Renders of the shell, counted from the sidebar mock (an unmemoized direct child of the shell, so
      // it renders once per shell render). The chrome-subscription cases below read it.
      shellRenders: 0,
      sheetZoom: 1,
      commits,
      commitFor: (id: string) => {
         const known = commits.get(id);
         if (known) return known;
         const fresh = vi.fn();
         commits.set(id, fresh);
         return fresh;
      },
   };
});

const characterActions = () => ({
   updateCharacterName: mocks.commitFor(mocks.character?.id ?? 'none'),
   addStatus: () => {},
   addStoryTag: () => {},
   addPortrait: () => {},
   addJournal: () => {},
});

// The surface inputs. Each is read at render time, so a test sets them and re-renders to switch surfaces.
// `getState` resolves against whichever character is active AT CALL TIME, like the real registry - a name
// commit routed through it instead of through the render-time action lands on the wrong character.
vi.mock('@/lib/stores/characterStore', () => ({
   useCharacterStore: Object.assign(
      (selector: (state: { character: CharacterLike | null }) => unknown) => selector({ character: mocks.character }),
      { getState: () => ({ character: mocks.character, actions: characterActions() }) },
   ),
   useCharacterActions: () => characterActions(),
}));
vi.mock('@/lib/board/ActiveBoardStoreContext', () => ({ useActiveBoardInstance: () => mocks.activeBoard }));
vi.mock('@/lib/notes/ActiveNoteStoreContext', () => ({ useActiveNoteInstance: () => mocks.activeNote }));
vi.mock('@/lib/character/characterPersistence', () => ({ useIsBootHydrating: () => false }));
vi.mock('@/lib/character/tabManagerStore', () => ({
   useActiveSheetZoom: () => mocks.sheetZoom,
   useTabManagerStore: (selector: (state: { activeTabId: string }) => unknown) => selector({ activeTabId: 'tab-1' }),
}));

// The desktop fork; the mobile shell is its own page.
vi.mock('@/hooks/useDeviceType', () => ({ useDeviceType: () => ({ isMobile: false, deviceType: 'desktop' }) }));
// Echo the i18n key instead of standing up a provider - the shell only reads a placeholder here.
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

// The orchestration hooks: real ones reach into four drag surfaces, the drawer, Dexie and the palette
// registries. The shell only threads their outputs through, so stubs of the right shape are enough.
vi.mock('@/hooks/character-sheet/useCharacterSheetDnD', () => ({
   useCharacterSheetDnD: () => ({
      activeDragItem: null,
      activeTabDrag: null,
      overDragId: null,
      isOverDrawer: false,
      drawerDropTarget: null,
      statusIds: [],
      storyTagIds: [],
      storyThemeIds: [],
      handleDragStart: () => {},
      handleDragOver: () => {},
      handleDragEnd: () => {},
      handleDragCancel: () => {},
      isOverTabLane: false,
      springTarget: null,
      sheetHighlight: null,
      isIncompatibleComponentDrag: false,
      isDrawerItemDragActive: false,
      isFolderDragActive: false,
      workspaceDwellKey: null,
      renderClone: (node: ReactNode) => node,
      renderCluster: () => null,
   }),
}));
vi.mock('@/hooks/character-sheet/useCardDialogState', () => ({
   useCardDialogState: () => ({
      isCardDialogOpen: false,
      setCardDialogOpen: () => {},
      dialogMode: 'create',
      cardToEdit: null,
      challengeCardToEdit: null,
      closeChallengeEditor: () => {},
      handleCreateChallenge: () => {},
      handleEditCard: () => {},
      handleAddCardClick: () => {},
      handleDialogConfirm: () => {},
   }),
}));
vi.mock('@/hooks/character-sheet/useCharacterSheetExport', () => ({ useCharacterSheetExport: () => ({ handleExportComponent: () => {} }) }));
vi.mock('@/hooks/character-sheet/useCharacterSheetFileImport', () => ({
   useCharacterSheetFileImport: () => ({
      getRootProps: () => ({}),
      isDragActive: false,
      handleFileSelected: () => {},
      triggerImport: () => {},
      formRef: { current: null },
      fileInputRef: { current: null },
   }),
}));
vi.mock('@/hooks/character-sheet/useCharacterSheetUndoRedo', () => ({ useCharacterSheetUndoRedo: () => {} }));
vi.mock('@/hooks/character-sheet/useSheetZoomShortcuts', () => ({ useSheetZoomShortcuts: () => {} }));
vi.mock('@/hooks/useCommandPaletteActions', () => ({ useCommandPaletteActions: () => [] }));
vi.mock('@/hooks/useNoteMarkdownIO', () => ({
   useNoteMarkdownIO: () => ({ exportActiveNoteAsMarkdown: () => {}, importMarkdownFile: () => {}, dialogs: null }),
}));

// The four surfaces, each tagged so a test can assert which one rendered.
vi.mock('@/components/organisms/note/NoteView', () => ({ NoteView: () => <div data-testid="note-view" /> }));
vi.mock('@/components/organisms/board/BoardView', () => ({ BoardView: () => <div data-testid="board-view" /> }));
vi.mock('@/components/organisms/MainMenu', () => ({ default: () => <div data-testid="main-menu" /> }));
vi.mock('@/components/organisms/TrackersSection', () => ({ TrackersSection: () => <div data-testid="trackers-section" /> }));
vi.mock('@/components/organisms/CardsSection', () => ({ CardsSection: () => <div data-testid="cards-section" /> }));
vi.mock('@/components/organisms/SheetMainDropZone', () => ({ SheetMainDropZone: ({ children }: { children: ReactNode }) => <div>{children}</div> }));

// The sidebar records the `activeWindow` it is handed, which is the second copy of the precedence chain,
// and doubles as the shell's render probe.
vi.mock('@/components/organisms/SidebarMenu', () => ({
   SidebarMenu: ({ activeWindow }: { activeWindow: string }) => {
      mocks.shellRenders += 1;
      return <div data-testid="sidebar" data-active-window={activeWindow} />;
   },
}));

// The remaining shell chrome: mounted on every render, irrelevant to the switch.
vi.mock('@/components/organisms/command-palette/CommandPalette', () => ({ CommandPalette: () => null }));
vi.mock('@/components/organisms/character-sheet/SheetZoomControl', () => ({ SheetZoomControl: () => null }));
vi.mock('@/components/molecules/FileDragOverlay', () => ({ FileDragOverlay: () => null }));
vi.mock('@/components/molecules/DragOverlayContent', () => ({ DragOverlayContent: () => null }));
vi.mock('@/components/organisms/dialogs/CreateCardDialog', () => ({ CreateCardDialog: () => null }));
vi.mock('@/components/organisms/dialogs/ChallengeCardEditor', () => ({ ChallengeCardEditor: () => null }));
vi.mock('@/components/organisms/drawer/Drawer', () => ({ Drawer: () => null }));
vi.mock('@/components/organisms/drawer/ExpandedDrawer', () => ({ ExpandedDrawer: () => null }));
vi.mock('@/components/organisms/dice/DiceTrayPanel', () => ({ DiceTrayPanel: () => null }));
vi.mock('@/components/organisms/tabs/TabStrip', () => ({ TabStrip: () => null }));
vi.mock('@/components/organisms/tabs/PortalTrailBar', () => ({ PortalTrailBar: () => null }));
vi.mock('@/components/organisms/tabs/TabDragPreview', () => ({ TabDragPreview: () => null }));
vi.mock('@/components/organisms/navigator/NavigatorPanel', () => ({ NavigatorPanel: () => null }));
vi.mock('@/components/organisms/CharacterLoadDropzone', () => ({ CharacterLoadDropZone: () => null }));
vi.mock('@/components/organisms/CannotDropOverlay', () => ({ CannotDropOverlay: () => null }));
vi.mock('@/components/organisms/dialogs/settings/SettingsShell', () => ({ SettingsShell: () => null }));
vi.mock('@/components/mobile/character-sheet/MobileCharacterSheetPage', () => ({ default: () => <div data-testid="mobile-page" /> }));
vi.mock('@/components/molecules/CharacterBootLoading', () => ({ CharacterBootLoading: () => null }));
vi.mock('@/components/molecules/TabViewLoading', () => ({ TabViewLoading: () => null }));

const character = (id: string, name: string): CharacterLike => ({ id, name, game: 'LEGENDS' });

const setSurface = ({ char = null, board = null, note = null }: { char?: CharacterLike | null; board?: object | null; note?: object | null }) => {
   mocks.character = char;
   mocks.activeBoard = board;
   mocks.activeNote = note;
};

const sheet = () => document.querySelector('[data-tutorial="character-sheet"]');
// Read through the CSSOM, not the `style` attribute: jsdom's serializer drops `zoom` as unknown, so
// the attribute reads empty whether or not React set the property.
const zoomLayer = () => sheet()?.querySelector<HTMLElement>('.flex-1') ?? null;
const activeWindow = () => screen.getByTestId('sidebar').getAttribute('data-active-window');
const typeName = (value: string) =>
   fireEvent.change(screen.getByPlaceholderText('CharacterSheetPage.characterNamePlaceholder'), { target: { value } });

beforeEach(() => {
   setSurface({});
   mocks.commits.clear();
   mocks.shellRenders = 0;
   mocks.sheetZoom = 1;
   useAppGeneralStateStore.setState({ isDrawerOpen: false, isDrawerExpanded: false, isEditing: false, isSettingsOpen: false });
   useAppSettingsStore.setState({ isSidebarCollapsed: false, navigatorOpen: false, isCompactDrawer: false, isTrackersAlwaysEditable: false });
});
afterEach(cleanup);

describe('WorkspacePage surface switch', () => {
   it('renders the main menu when no surface is active', () => {
      render(<WorkspacePage />);

      expect(screen.getByTestId('main-menu')).toBeTruthy();
      expect(sheet()).toBeNull();
      expect(activeWindow()).toBe('MAIN_MENU');
   });

   it('renders the sheet when only a character is active', () => {
      setSurface({ char: character('char-a', 'Alice') });
      render(<WorkspacePage />);

      expect(sheet()).not.toBeNull();
      expect(screen.queryByTestId('main-menu')).toBeNull();
      expect(activeWindow()).toBe('PLAY_AREA');
   });

   it('renders the board over the character (board wins the precedence chain)', async () => {
      setSurface({ char: character('char-a', 'Alice'), board: {} });
      render(<WorkspacePage />);

      expect(await screen.findByTestId('board-view')).toBeTruthy();
      expect(sheet()).toBeNull();
      expect(screen.queryByTestId('main-menu')).toBeNull();
      expect(activeWindow()).toBe('BOARD');
   });

   it('renders the note over the board and the character (note wins the precedence chain)', async () => {
      setSurface({ char: character('char-a', 'Alice'), board: {}, note: {} });
      render(<WorkspacePage />);

      expect(await screen.findByTestId('note-view')).toBeTruthy();
      expect(screen.queryByTestId('board-view')).toBeNull();
      expect(sheet()).toBeNull();
      expect(activeWindow()).toBe('NOTE');
   });

   it('unmounts the sheet when the active tab switches to a board', () => {
      setSurface({ char: character('char-a', 'Alice') });
      const { rerender } = render(<WorkspacePage />);
      expect(sheet()).not.toBeNull();

      setSurface({ char: character('char-a', 'Alice'), board: {} });
      rerender(<WorkspacePage />);

      expect(sheet()).toBeNull();
   });
});

describe('WorkspacePage name flush across a switch', () => {
   it('commits a pending character name when the switch to a board unmounts the sheet (no blur fires)', () => {
      setSurface({ char: character('char-a', 'Alice') });
      const { rerender } = render(<WorkspacePage />);

      typeName('Alice the Bold');
      setSurface({ char: character('char-a', 'Alice'), board: {} });
      rerender(<WorkspacePage />);

      expect(mocks.commitFor('char-a')).toHaveBeenCalledTimes(1);
      expect(mocks.commitFor('char-a')).toHaveBeenCalledWith('Alice the Bold');
   });

   it('commits a pending name to the LEAVING character when the active character switches, never to the arriving one', () => {
      setSurface({ char: character('char-a', 'Alice') });
      const { rerender } = render(<WorkspacePage />);

      typeName('Alice the Bold');
      setSurface({ char: character('char-b', 'Bob') });
      rerender(<WorkspacePage />);

      expect(mocks.commitFor('char-a')).toHaveBeenCalledTimes(1);
      expect(mocks.commitFor('char-a')).toHaveBeenCalledWith('Alice the Bold');
      expect(mocks.commitFor('char-b')).not.toHaveBeenCalled();
      expect(screen.getByPlaceholderText('CharacterSheetPage.characterNamePlaceholder')).toHaveProperty('value', 'Bob');
   });

   it('does not commit an untouched name across a surface switch (dirty-guarded)', () => {
      setSurface({ char: character('char-a', 'Alice') });
      const { rerender } = render(<WorkspacePage />);

      setSurface({ char: character('char-a', 'Alice'), board: {} });
      rerender(<WorkspacePage />);

      expect(mocks.commitFor('char-a')).not.toHaveBeenCalled();
   });
});

/*
 * Pins the two silent failure modes of the sheet surface. Both lint clean, typecheck clean and look
 * correct in a diff: a `key` on the surface swaps the scroll container for a fresh element while the
 * zoom hook's wheel listener stays bound to the old one (Ctrl+wheel simply stops working), and an
 * unconditional `zoom` style feeds dnd-kit a scaled measuring path at 100% (reorder gaps drift).
 */
describe('WorkspacePage sheet surface', () => {
   it('keeps the same scroll container across a character switch, so the bound wheel listener survives', () => {
      setSurface({ char: character('char-a', 'Alice') });
      const { rerender } = render(<WorkspacePage />);
      const before = sheet();

      setSurface({ char: character('char-b', 'Bob') });
      rerender(<WorkspacePage />);

      expect(sheet()).not.toBeNull();
      expect(sheet()).toBe(before);
   });

   it('leaves the zoom layer without an inline zoom at 100%', () => {
      setSurface({ char: character('char-a', 'Alice') });
      render(<WorkspacePage />);

      expect(zoomLayer()).not.toBeNull();
      expect(zoomLayer()?.style.zoom).toBeFalsy();
   });

   it('applies the inline zoom when the tab is not at 100%', () => {
      mocks.sheetZoom = 1.5;
      setSurface({ char: character('char-a', 'Alice') });
      render(<WorkspacePage />);

      expect(zoomLayer()?.style.zoom).toBe('1.5');
   });
});

/*
 * Pins the shell's chrome subscriptions to one selector per value. Widening them - a selector returning an
 * object, or the whole store state - fails nothing and lints clean; it just re-renders the entire shell on
 * every unrelated settings write, which is felt only as jank mid-drag. The two negative cases below are the
 * only thing that catches it; the positive case proves the probe actually counts.
 */
describe('WorkspacePage chrome subscriptions', () => {
   const renderShell = () => {
      setSurface({ char: character('char-a', 'Alice') });
      render(<WorkspacePage />);
      return mocks.shellRenders;
   };

   it('does not re-render on an app-settings write the shell does not read', () => {
      const before = renderShell();

      act(() => { useAppSettingsStore.setState({ layersPanelOpen: true, isNoteOutlineOpen: true }); });

      expect(mocks.shellRenders).toBe(before);
   });

   it('does not re-render on a general-state write the shell does not read', () => {
      const before = renderShell();

      act(() => { useAppGeneralStateStore.setState({ isDrawerReceded: true, lastModifiedStore: 'board' }); });

      expect(mocks.shellRenders).toBe(before);
   });

   it('re-renders once on a chrome write the shell does read', () => {
      const before = renderShell();

      act(() => { useAppSettingsStore.setState({ isSidebarCollapsed: true }); });

      expect(mocks.shellRenders).toBe(before + 1);
   });
});
