// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';

// -- Type Imports --
import type { Card } from '@/lib/types/character';
import type { ToolbeltContext } from '@/lib/types/toolbelt';

/*
 * What the Toolbelt still carries. The card overview, Add Card, the portrait's creation and Edit mode all
 * have permanent chrome of their own now, so keeping tiles for them would leave two routes to each; the
 * trackers adds have no other route, so they survive the cut. The portrait's editor is contextual to the
 * portrait card: as a global it would be a second route.
 */

const generalState = {
   actions: { setCardDialogOpen: vi.fn(), setDrawerOpen: vi.fn() },
};
const characterState = { character: null as unknown };

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/lib/stores/appGeneralStateStore', () => ({
   useAppGeneralStateStore: (selector: (state: typeof generalState) => unknown) => selector(generalState),
}));
vi.mock('@/lib/stores/characterStore', () => ({
   useCharacterStore: (selector: (state: typeof characterState) => unknown) => selector(characterState),
   useCharacterActions: () => new Proxy({}, { get: () => vi.fn() }),
}));
vi.mock('@/lib/character/characterStoreRegistry', () => ({ getActiveCharacterStore: () => null }));
vi.mock('@/lib/stores/drawerStore', () => ({
   useDrawerActions: () => ({ initiateItemDrop: vi.fn(), reloadCurrentFolder: vi.fn() }),
   useDrawerStore: { getState: () => ({ currentFolderId: null }) },
}));
vi.mock('@/lib/stores/appSettingsStore', () => ({ useAppSettingsActions: () => ({ setDiceTrayOpen: vi.fn() }) }));
vi.mock('@/lib/character/tabManagerStore', () => ({ useTabManagerActions: () => ({ mobileReturnToMenu: vi.fn() }) }));
vi.mock('@/hooks/useCharacterTemporalStore', () => ({
   default: (selector: (state: object) => unknown) => selector({ undo: vi.fn(), redo: vi.fn(), pastStates: [], futureStates: [] }),
}));
vi.mock('@/hooks/useSaveToDrawer', () => ({ useSaveToDrawer: () => ({ saveCharacterAsToDrawer: vi.fn() }) }));

import { useToolbeltActions } from './useToolbeltActions';

const card = (cardType: Card['cardType']): Card =>
   ({ id: `card-${cardType}`, cardType, viewMode: 'FLIP', details: { game: 'LEGENDS' } } as unknown as Card);

const none: ToolbeltContext = { type: 'none' };

const build = (context: ToolbeltContext, activeTab: 'trackers' | 'cards') =>
   renderHook(() => useToolbeltActions(context, activeTab, vi.fn(), vi.fn(), vi.fn(), vi.fn())).result.current;

const globalIds = (context: ToolbeltContext, activeTab: 'trackers' | 'cards') =>
   build(context, activeTab).globalActions.map((action) => action.id);

const itemIds = (context: ToolbeltContext, activeTab: 'trackers' | 'cards') =>
   build(context, activeTab).itemActions.map((action) => action.id);

afterEach(cleanup);

describe('toolbelt globals on the cards tab', () => {
   it('drops the entries the cards tab now carries itself', () => {
      const ids = globalIds(none, 'cards');

      expect(ids).not.toContain('reorder-cards');
      expect(ids).not.toContain('add-card');
      expect(ids).not.toContain('portrait');
   });

   it('drops Edit mode on both tabs: the sheet tab bar carries it', () => {
      expect(globalIds(none, 'cards')).not.toContain('toggle-edit-mode');
      expect(globalIds(none, 'trackers')).not.toContain('toggle-edit-mode');
   });

   it('keeps the menu-of-everything entries', () => {
      const ids = globalIds(none, 'cards');

      expect(ids).toEqual(expect.arrayContaining(['undo', 'redo', 'dice']));
   });

   it('keeps the trackers tab adds untouched', () => {
      const ids = globalIds(none, 'trackers');

      expect(ids).toEqual(expect.arrayContaining(['add-status', 'add-story-tag', 'add-story-theme']));
   });
});

describe('close sheet action', () => {
   afterEach(() => { characterState.character = null; });

   it('carries the close-sheet id and label when a character is loaded', () => {
      characterState.character = { id: 'x' };
      const actions = renderHook(() =>
         useToolbeltActions(none, 'cards', vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn()),
      ).result.current.globalActions;
      const closeSheet = actions.find((action) => action.id === 'close-sheet');

      expect(closeSheet).toBeDefined();
      expect(closeSheet?.label).toBe('Toolbelt.closeSheet');
   });

   it('routes a tap to the confirm-opener instead of returning to the menu', () => {
      characterState.character = { id: 'x' };
      const onCloseSheet = vi.fn();
      const actions = renderHook(() =>
         useToolbeltActions(none, 'cards', vi.fn(), vi.fn(), vi.fn(), vi.fn(), onCloseSheet),
      ).result.current.globalActions;
      const closeSheet = actions.find((action) => action.id === 'close-sheet');

      closeSheet?.onClick();

      expect(onCloseSheet).toHaveBeenCalledTimes(1);
   });
});

describe('portrait actions', () => {
   it('offers its editor and the shared delete on the portrait card', () => {
      const ids = itemIds({ type: 'card', card: card('IMAGE_CARD') }, 'cards');

      expect(ids).toContain('edit-portrait');
      expect(ids).toContain('delete-card');
   });

   it('offers neither on any other card', () => {
      const ids = itemIds({ type: 'card', card: card('CHARACTER_THEME') }, 'cards');

      expect(ids).not.toContain('edit-portrait');
   });
});

describe('journal actions', () => {
   const journalContext: ToolbeltContext = { type: 'journal', journal: { id: 'j1', title: '', pages: [], bookmarks: [] } };

   it('offers a destructive delete on the active journal (the desktop trash parity)', () => {
      const actions = build(journalContext, 'cards').itemActions;
      const del = actions.find((a) => a.id === 'delete-journal');

      expect(del).toBeTruthy();
      expect(del?.variant).toBe('destructive');
      expect(() => del?.onClick()).not.toThrow();
   });

   it('does not offer card-only actions on a journal', () => {
      const ids = itemIds(journalContext, 'cards');

      expect(ids).not.toContain('flip-card');
      expect(ids).not.toContain('delete-card');
   });
});
