// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// -- Type Imports --
import type { JournalBookmark } from '@/lib/types/board';

/*
 * The mobile bookmark bottom sheet: thumb-sized rows, each jumping to its page (and closing) on tap; while
 * editing, the label renames and the bookmark removes - all through the injected journal handlers, never a
 * parallel implementation. Empty when there are no bookmarks.
 */

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { MobileJournalBookmarkSheet } from './MobileJournalBookmarkSheet';

const bookmark = (id: string, pageId: string, label = ''): JournalBookmark => ({ id, pageId, label });

const renderSheet = (overrides: Partial<Parameters<typeof MobileJournalBookmarkSheet>[0]> = {}) => {
   const props = {
      isOpen: true,
      onClose: vi.fn(),
      tabs: [
         { bookmark: bookmark('b1', 'p1', 'Intro'), page: 0 },
         { bookmark: bookmark('b2', 'p3', 'Fight'), page: 2 },
      ],
      pageIndex: 2,
      editable: false,
      onJump: vi.fn(),
      onRemove: vi.fn(),
      onSetBookmarkLabel: vi.fn(),
      ...overrides,
   };
   return { props, ...render(<MobileJournalBookmarkSheet {...props} />) };
};

afterEach(cleanup);

describe('MobileJournalBookmarkSheet', () => {
   it('lists each bookmark with its label and 1-based page', () => {
      renderSheet();
      expect(screen.getByText('Intro')).toBeTruthy();
      expect(screen.getByText('Fight')).toBeTruthy();
      // The page badge is a jump target labelled by its 1-based number.
      expect(screen.getByLabelText('1')).toBeTruthy();
      expect(screen.getByLabelText('3')).toBeTruthy();
   });

   it('jumps to the bookmark page by id and closes on a row tap', () => {
      const { props } = renderSheet();
      fireEvent.click(screen.getByText('Intro'));
      expect(props.onJump).toHaveBeenCalledWith('p1');
      expect(props.onClose).toHaveBeenCalledTimes(1);
   });

   it('renames and removes only while editing, through the injected handlers', () => {
      const { props } = renderSheet({ editable: true });

      const input = screen.getByDisplayValue('Intro');
      fireEvent.change(input, { target: { value: 'Prologue' } });
      fireEvent.blur(input);
      expect(props.onSetBookmarkLabel).toHaveBeenCalledWith('b1', 'Prologue');

      fireEvent.click(screen.getAllByLabelText('BoardView.journalRemoveBookmark')[0]);
      expect(props.onRemove).toHaveBeenCalledWith('b1');
   });

   it('shows the empty state with no bookmarks', () => {
      renderSheet({ tabs: [] });
      expect(screen.getByText('BoardView.journalNoBookmarks')).toBeTruthy();
   });
});
