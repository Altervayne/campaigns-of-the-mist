// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/react';

/*
 * The switcher lists the open workspaces: character + note rows switch (lossless keep-alive), board
 * rows are desktop-only and render inert. The active row carries the accent and reflects the live name.
 */

const mocks = vi.hoisted(() => ({
   openTabs: [] as Array<{ id: string; type: string; title?: string; game?: string; dirty?: boolean }>,
   activeTabId: null as string | null,
   activeName: undefined as string | undefined,
   mobileSetActiveTab: vi.fn(),
   mobileCloseTab: vi.fn(() => Promise.resolve()),
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/stores/appSettingsStore', () => ({
   useAppSettingsStore: (selector: (state: { mobileHandedness: string }) => unknown) => selector({ mobileHandedness: 'right' }),
}));
vi.mock('@/lib/stores/characterStore', () => ({
   useCharacterStore: (selector: (state: { character: { name: string } | null }) => unknown) =>
      selector({ character: mocks.activeName ? { name: mocks.activeName } : null }),
}));
vi.mock('@/lib/character/tabManagerStore', () => {
   const readState = () => ({ openTabs: mocks.openTabs, activeTabId: mocks.activeTabId });
   // A function store with a `getState`: the close confirm's async `.then` reads `getState().openTabs` after the
   // tab is reaped, so the mock must answer it (else an unhandled rejection leaks into the full-suite run).
   const useTabManagerStore = (selector: (state: { openTabs: unknown; activeTabId: unknown }) => unknown) => selector(readState());
   useTabManagerStore.getState = readState;
   return {
      useTabManagerStore,
      useTabManagerActions: () => ({ mobileSetActiveTab: mocks.mobileSetActiveTab, mobileCloseTab: mocks.mobileCloseTab }),
   };
});

import { MobileWorkspaceSwitcher } from './MobileWorkspaceSwitcher';

afterEach(() => {
   cleanup();
   mocks.mobileSetActiveTab.mockReset();
   mocks.mobileCloseTab.mockClear();
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

   it('closes a note row through a delete-worded confirm', () => {
      mocks.openTabs = [
         { id: 'c1', type: 'character', title: 'Alice', game: 'LEGENDS' },
         { id: 'n1', type: 'note', title: 'My Note', dirty: true },
      ];
      mocks.activeTabId = 'c1';
      mocks.activeName = 'Alice';

      const { getByText, queryByText } = render(<MobileWorkspaceSwitcher isOpen onClose={() => {}} onSwitched={() => {}} />);

      // The note row carries a close control (character-only before); the character close body must not show.
      const noteRow = getByText('My Note').closest('button')!.parentElement!;
      fireEvent.click(within(noteRow).getByLabelText('Common.close'));

      // Note-specific, deletion-honest confirm (not the character's "unsaved changes" / "reopen from drawer").
      expect(getByText('Workspace.closeNoteConfirmTitle')).not.toBeNull();
      expect(getByText('Workspace.closeNoteConfirmDirtyBody')).not.toBeNull();
      expect(queryByText('Workspace.closeConfirmDirtyBody')).toBeNull();

      // Confirming reaps the note tab.
      fireEvent.click(getByText('Common.close'));
      expect(mocks.mobileCloseTab).toHaveBeenCalledWith('n1');
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
