// @vitest-environment jsdom

// -- Library Imports --
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

// -- Component Imports --
import MobileDrawerContextMenu from './MobileDrawerContextMenu';

// -- Type Imports --
import type { ComponentProps } from 'react';
import type { DrawerItemContent, GeneralItemType } from '@/lib/types/drawer';

/*
 * The context menu offers its special actions by capability, not by exclusion: a type gets "Add to
 * character" only if it declares ADD_TO_CHARACTER, so a type nobody thought about gets no action it has
 * no handler for. The table below is the whole contract - it covers every `GeneralItemType`, and being a
 * full (non-partial) Record it fails to compile when a type is added to the union, forcing the decision
 * to be made rather than inherited.
 *
 * The last case renders a type that is not in the union at all: the safe default has to hold for a type
 * the registry has never seen, which is the reason the check is declarative in the first place.
 */

const ADD_TO_CHARACTER_ROW = 'Drawer.Actions.addToCharacter';
const LOAD_CHARACTER_ROW = 'Drawer.Actions.loadCharacter';

/** Whether each item type offers "Add to character" with a character loaded and the callback wired. */
const OFFERS_ADD_TO_CHARACTER: Record<GeneralItemType, boolean> = {
   CHARACTER_CARD: true,
   CHARACTER_THEME: true,
   GROUP_THEME: true,
   LOADOUT_THEME: true,
   STATUS_TRACKER: true,
   STORY_TAG_TRACKER: true,
   STORY_THEME_TRACKER: true,
   FULL_DRAWER: false,
   FOLDER: false,
   IMAGE_CARD: false,
   CHALLENGE_CARD: false,
   POST_IT: false,
   JOURNAL: false,
   NOTE: false,
   ROLL_TABLE: false,
   FULL_CHARACTER_SHEET: false,
   FULL_BOARD: false,
};

const mocks = vi.hoisted(() => ({
   itemType: 'CHARACTER_CARD' as GeneralItemType,
   character: { id: 'character-1', game: 'LEGENDS' } as unknown,
}));

// Echo the i18n key instead of standing up a provider - the rows are asserted by key.
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/lib/stores/drawerStore', () => ({
   useDrawerActions: () => ({
      renameFolder: vi.fn(),
      renameItem: vi.fn(),
      moveFolder: vi.fn(),
      moveItem: vi.fn(),
      deleteFolder: vi.fn(),
      deleteItem: vi.fn(),
   }),
}));
vi.mock('@/lib/stores/characterStore', () => ({
   useCharacterStore: (selector: (state: { character: unknown }) => unknown) => selector({ character: mocks.character }),
}));
// The menu resolves its target through the repository; serve a record of the type under test.
vi.mock('@/lib/drawer/drawerRepository', () => ({
   getItem: vi.fn(async (id: string) => ({
      id,
      name: 'Item A',
      parentFolderId: 'root',
      order: 0,
      game: 'LEGENDS',
      type: mocks.itemType,
      createdAt: 0,
      updatedAt: 0,
      content: { id: 'content-a' } as unknown as DrawerItemContent,
   })),
   exportFolderAsNestedTree: vi.fn(),
}));
vi.mock('@/components/mobile/drawer/MobileFolderPicker', () => ({ default: () => null }));
vi.mock('@/components/mobile/shared/MobileBottomSheet', () => ({ MobileBottomSheet: () => null }));

type MenuProps = ComponentProps<typeof MobileDrawerContextMenu>;

const defaults: MenuProps = {
   isOpen: true,
   onClose: () => {},
   target: { type: 'item', id: 'item-a', name: 'Item A' },
   onAddToCharacter: () => {},
   onLoadCharacter: () => {},
};

/** Renders the menu and flushes the async target resolution, so the rows have settled. */
async function renderMenu(props: Partial<MenuProps> = {}) {
   const view = render(<MobileDrawerContextMenu {...defaults} {...props} />);
   await act(async () => {});
   return view;
}

beforeEach(() => {
   mocks.itemType = 'CHARACTER_CARD';
   mocks.character = { id: 'character-1', game: 'LEGENDS' };
});
afterEach(cleanup);

describe('MobileDrawerContextMenu special actions', () => {
   it.each(Object.entries(OFFERS_ADD_TO_CHARACTER))(
      '%s offers "Add to character": %s',
      async (type, offers) => {
         mocks.itemType = type as GeneralItemType;
         await renderMenu();

         expect(screen.queryByText(ADD_TO_CHARACTER_ROW) != null).toBe(offers);
      },
   );

   it('offers nothing special for a type the registry has never seen', async () => {
      mocks.itemType = 'FUTURE_ITEM_TYPE' as GeneralItemType;
      await renderMenu();

      expect(screen.queryByText(ADD_TO_CHARACTER_ROW)).toBeNull();
      expect(screen.queryByText(LOAD_CHARACTER_ROW)).toBeNull();
      // The universal actions are unaffected by capabilities.
      expect(screen.getByText('Drawer.Actions.rename')).toBeTruthy();
      expect(screen.getByText('Drawer.Actions.delete')).toBeTruthy();
   });

   it('withholds the action from a supported type when no character is loaded', async () => {
      mocks.character = null;
      await renderMenu();

      expect(screen.queryByText(ADD_TO_CHARACTER_ROW)).toBeNull();
   });

   it('withholds the action from a supported type when the host wires no handler', async () => {
      await renderMenu({ onAddToCharacter: undefined });

      expect(screen.queryByText(ADD_TO_CHARACTER_ROW)).toBeNull();
   });

   it('passes the resolved item to the host handler', async () => {
      const onAddToCharacter = vi.fn();
      await renderMenu({ onAddToCharacter });

      fireEvent.click(screen.getByText(ADD_TO_CHARACTER_ROW));

      expect(onAddToCharacter).toHaveBeenCalledTimes(1);
      expect(onAddToCharacter.mock.calls[0][0]).toMatchObject({ id: 'item-a', type: 'CHARACTER_CARD' });
   });

   it('still offers a saved character its own load action', async () => {
      mocks.itemType = 'FULL_CHARACTER_SHEET';
      await renderMenu();

      expect(screen.getByText(LOAD_CHARACTER_ROW)).toBeTruthy();
      expect(screen.queryByText(ADD_TO_CHARACTER_ROW)).toBeNull();
   });

   it('offers a folder no special action, even after a supported item resolved', async () => {
      const { rerender } = await renderMenu();
      expect(screen.getByText(ADD_TO_CHARACTER_ROW)).toBeTruthy();

      rerender(<MobileDrawerContextMenu {...defaults} target={{ type: 'folder', id: 'folder-a', name: 'Folder A' }} />);
      await act(async () => {});

      expect(screen.queryByText(ADD_TO_CHARACTER_ROW)).toBeNull();
      expect(screen.getByText('Common.move')).toBeTruthy();
      expect(screen.getByText('Drawer.Actions.export')).toBeTruthy();
   });
});
