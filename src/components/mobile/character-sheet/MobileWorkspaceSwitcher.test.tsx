// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

/*
 * The switcher lists the open workspaces: character rows switch (lossless keep-alive), board/note
 * rows are desktop-only and render inert. The active row carries the accent and reflects the live name.
 */

const mocks = vi.hoisted(() => ({
   openTabs: [] as Array<{ id: string; type: string; title?: string; game?: string; dirty?: boolean }>,
   activeTabId: null as string | null,
   activeName: undefined as string | undefined,
   mobileSetActiveTab: vi.fn(),
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/stores/appSettingsStore', () => ({
   useAppSettingsStore: (selector: (state: { mobileHandedness: string }) => unknown) => selector({ mobileHandedness: 'right' }),
}));
vi.mock('@/lib/stores/characterStore', () => ({
   useCharacterStore: (selector: (state: { character: { name: string } | null }) => unknown) =>
      selector({ character: mocks.activeName ? { name: mocks.activeName } : null }),
}));
vi.mock('@/lib/character/tabManagerStore', () => ({
   useTabManagerStore: (selector: (state: { openTabs: unknown; activeTabId: unknown }) => unknown) =>
      selector({ openTabs: mocks.openTabs, activeTabId: mocks.activeTabId }),
   useTabManagerActions: () => ({ mobileSetActiveTab: mocks.mobileSetActiveTab }),
}));

import { MobileWorkspaceSwitcher } from './MobileWorkspaceSwitcher';

afterEach(() => {
   cleanup();
   mocks.mobileSetActiveTab.mockReset();
});

describe('MobileWorkspaceSwitcher', () => {
   it('renders a row per open tab, active row showing the live name', () => {
      mocks.openTabs = [
         { id: 'c1', type: 'character', title: 'Alice', game: 'LEGENDS', dirty: true },
         { id: 'c2', type: 'character', title: 'Bob', game: 'CITY_OF_MIST' },
      ];
      mocks.activeTabId = 'c1';
      mocks.activeName = 'Alice Live';

      const { getByText } = render(<MobileWorkspaceSwitcher isOpen onClose={() => {}} onSwitched={() => {}} />);

      // Active row reflects the live character name; cold row falls back to its denorm title. The active
      // accent lives on the row's wrapper (the switch button's parent), beside the per-row close control.
      const activeRow = getByText('Alice Live').closest('button')!.parentElement!;
      expect(activeRow.className).toContain('border-primary');
      expect(getByText('Bob').closest('button')!.parentElement!.className).not.toContain('border-primary');
   });

   it('switches on a character-row tap and closes', () => {
      mocks.openTabs = [
         { id: 'c1', type: 'character', title: 'Alice', game: 'LEGENDS' },
         { id: 'c2', type: 'character', title: 'Bob', game: 'CITY_OF_MIST' },
      ];
      mocks.activeTabId = 'c1';
      mocks.activeName = 'Alice';
      const onSwitched = vi.fn();

      const { getByText } = render(<MobileWorkspaceSwitcher isOpen onClose={() => {}} onSwitched={onSwitched} />);
      fireEvent.click(getByText('Bob').closest('button')!);

      expect(mocks.mobileSetActiveTab).toHaveBeenCalledWith('c2');
      expect(onSwitched).toHaveBeenCalledTimes(1);
   });

   it('renders a board tab greyed and non-tappable', () => {
      mocks.openTabs = [
         { id: 'c1', type: 'character', title: 'Alice', game: 'LEGENDS' },
         { id: 'b1', type: 'board', title: 'My Board' },
      ];
      mocks.activeTabId = 'c1';
      mocks.activeName = 'Alice';

      const { getByText } = render(<MobileWorkspaceSwitcher isOpen onClose={() => {}} onSwitched={() => {}} />);

      // Desktop-only: not a switchable button, marked with a hint.
      expect(getByText('My Board').closest('button')).toBeNull();
      expect(getByText('Workspace.desktopOnly')).not.toBeNull();
   });
});
