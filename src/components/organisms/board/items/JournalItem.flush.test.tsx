// @vitest-environment jsdom

// -- Library Imports --
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

// -- Component Imports --
import { JournalItem } from './JournalItem';

// -- Store Imports --
import { useJournalViewStore } from '@/lib/stores/journalViewStore';

// -- Type Imports --
import type { BoardItem, BoardItemContent, Journal, JournalBoardContent } from '@/lib/types/board';

/*
 * Locks every flush path of the journal's four buffered text fields - the active page, the title, a bookmark
 * side tab's label and a bookmark list row's label. Each is held locally and committed on blur, but the board
 * host unmounts on a tab switch WITHOUT a blur, and leaving the editing sub-state swaps the editor for its
 * rendered form IN PLACE, which fires no blur either. `useCommitOnUnmount` carries the first path, the
 * falling-edge effect the second; every commit is dirty-guarded, so a clean exit no-ops. Two more paths lose
 * a pending page edit without any unmount at all: navigating commits the buffer first, and inserting a page
 * folds it into the one command.
 */

// The mention-mint hook reaches into board context; a no-op is all the journal needs to render in isolation.
vi.mock('@/hooks/board/useBoardMentionMint', () => ({ useBoardMentionMint: () => () => {} }));
// Echo the i18n key instead of standing up a provider - the journal only reads placeholder/label strings.
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

// The bookmark popover positions itself through Radix, which observes its trigger; jsdom ships no
// ResizeObserver, so the list row is unreachable without one.
class ResizeObserverStub {
   observe() {}
   unobserve() {}
   disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

// The page position is module state keyed by journal id; clear it so a test never inherits another's page.
beforeEach(() => useJournalViewStore.setState({ journalView: {} }));
afterEach(cleanup);

const journalContent = (id: string, journal: Partial<Journal> = {}): JournalBoardContent => ({
   kind: 'journal',
   mode: 'copy',
   data: { id, title: '', pages: [{ id: 'page-1', text: '' }], bookmarks: [], ...journal },
});

const boardItem = (content: JournalBoardContent): BoardItem => ({ id: 'item-1', kind: 'journal', x: 0, y: 0, width: 300, height: 400, z: 0, content });

interface JournalProps {
   content: JournalBoardContent;
   onContentChange: (next: BoardItemContent) => void;
   isSelected?: boolean;
   isEditing?: boolean;
   toolbarSlot?: HTMLElement | null;
   sideSlot?: HTMLElement | null;
   bookmarkMode?: 'side-tabs' | 'popover';
}

const journalElement = ({ content, onContentChange, isSelected = true, isEditing = true, toolbarSlot = null, sideSlot = null, bookmarkMode }: JournalProps) => (
   <JournalItem
      item={boardItem(content)}
      content={content}
      isSelected={isSelected}
      isEditing={isEditing}
      toolbarSlot={toolbarSlot}
      sideSlot={sideSlot}
      bookmarkMode={bookmarkMode}
      onContentChange={onContentChange}
      onRequestSelect={() => {}}
   />
);

/** A slot element in the document, so the portaled side tabs / toolbar controls actually mount. */
const mountSlot = () => {
   const slot = document.createElement('div');
   document.body.appendChild(slot);
   return slot;
};

const PAGE_PLACEHOLDER = 'BoardView.journalPlaceholder';
const TITLE_PLACEHOLDER = 'BoardView.journalTitlePlaceholder';
const BOOKMARK_PLACEHOLDER = 'BoardView.journalBookmarkPlaceholder';

describe('JournalItem page-text buffer', () => {
   it('commits the buffered page when the surface unmounts without a blur (tab switch)', () => {
      const onContentChange = vi.fn();
      const content = journalContent('j-page-unmount', { pages: [{ id: 'page-1', text: 'before' }] });
      const { getByPlaceholderText, unmount } = render(journalElement({ content, onContentChange }));

      fireEvent.change(getByPlaceholderText(PAGE_PLACEHOLDER), { target: { value: 'after' } });
      unmount();

      expect(onContentChange).toHaveBeenCalledTimes(1);
      expect(onContentChange.mock.calls[0][0].data.pages[0].text).toBe('after');
   });

   it('commits the buffered page on the editing->false swap-in-place (no unmount, no blur)', () => {
      const onContentChange = vi.fn();
      const content = journalContent('j-page-edge', { pages: [{ id: 'page-1', text: 'before' }] });
      const { getByPlaceholderText, rerender } = render(journalElement({ content, onContentChange }));

      fireEvent.change(getByPlaceholderText(PAGE_PLACEHOLDER), { target: { value: 'after' } });
      rerender(journalElement({ content, onContentChange, isEditing: false }));

      expect(onContentChange).toHaveBeenCalledTimes(1);
      expect(onContentChange.mock.calls[0][0].data.pages[0].text).toBe('after');
   });

   it('does not commit a page buffer typed back to its stored text on unmount (dirty-guarded)', () => {
      const onContentChange = vi.fn();
      const content = journalContent('j-page-clean', { pages: [{ id: 'page-1', text: 'before' }] });
      const { getByPlaceholderText, unmount } = render(journalElement({ content, onContentChange }));

      fireEvent.change(getByPlaceholderText(PAGE_PLACEHOLDER), { target: { value: 'after' } });
      fireEvent.change(getByPlaceholderText(PAGE_PLACEHOLDER), { target: { value: 'before' } });
      unmount();

      expect(onContentChange).not.toHaveBeenCalled();
   });
});

describe('JournalItem title buffer', () => {
   it('commits the buffered title when the surface unmounts without a blur (tab switch)', () => {
      const onContentChange = vi.fn();
      const content = journalContent('j-title-unmount', { title: 'before' });
      const { getByPlaceholderText, unmount } = render(journalElement({ content, onContentChange }));

      fireEvent.change(getByPlaceholderText(TITLE_PLACEHOLDER), { target: { value: 'after' } });
      unmount();

      expect(onContentChange).toHaveBeenCalledTimes(1);
      expect(onContentChange.mock.calls[0][0].data.title).toBe('after');
   });

   it('commits the buffered title on the editing->false swap-in-place (no unmount, no blur)', () => {
      const onContentChange = vi.fn();
      const content = journalContent('j-title-edge', { title: 'before' });
      const { getByPlaceholderText, rerender } = render(journalElement({ content, onContentChange }));

      fireEvent.change(getByPlaceholderText(TITLE_PLACEHOLDER), { target: { value: 'after' } });
      rerender(journalElement({ content, onContentChange, isEditing: false }));

      expect(onContentChange).toHaveBeenCalledTimes(1);
      expect(onContentChange.mock.calls[0][0].data.title).toBe('after');
   });

   it('does not commit a title typed back to its stored value on unmount (dirty-guarded)', () => {
      const onContentChange = vi.fn();
      const content = journalContent('j-title-clean', { title: 'before' });
      const { getByPlaceholderText, unmount } = render(journalElement({ content, onContentChange }));

      fireEvent.change(getByPlaceholderText(TITLE_PLACEHOLDER), { target: { value: 'after' } });
      fireEvent.change(getByPlaceholderText(TITLE_PLACEHOLDER), { target: { value: 'before' } });
      unmount();

      expect(onContentChange).not.toHaveBeenCalled();
   });
});

describe('JournalItem bookmark side-tab label buffer', () => {
   const tabContent = (id: string) =>
      journalContent(id, { pages: [{ id: 'page-1', text: '' }], bookmarks: [{ id: 'bm-1', pageId: 'page-1', label: 'before' }] });

   it('commits the buffered tab label when the surface unmounts without a blur (tab switch)', () => {
      const onContentChange = vi.fn();
      const content = tabContent('j-tab-unmount');
      const sideSlot = mountSlot();
      const { getByPlaceholderText, unmount } = render(journalElement({ content, onContentChange, isEditing: false, sideSlot }));

      fireEvent.change(getByPlaceholderText(BOOKMARK_PLACEHOLDER), { target: { value: 'after' } });
      unmount();

      expect(onContentChange).toHaveBeenCalledTimes(1);
      expect(onContentChange.mock.calls[0][0].data.bookmarks[0].label).toBe('after');
   });

   it('commits the buffered tab label on the editable->false swap-in-place (no unmount, no blur)', () => {
      const onContentChange = vi.fn();
      const content = tabContent('j-tab-edge');
      const sideSlot = mountSlot();
      const { getByPlaceholderText, rerender } = render(journalElement({ content, onContentChange, isEditing: false, sideSlot }));

      fireEvent.change(getByPlaceholderText(BOOKMARK_PLACEHOLDER), { target: { value: 'after' } });
      rerender(journalElement({ content, onContentChange, isSelected: false, isEditing: false, sideSlot }));

      expect(onContentChange).toHaveBeenCalledTimes(1);
      expect(onContentChange.mock.calls[0][0].data.bookmarks[0].label).toBe('after');
   });

   it('does not commit a tab label typed back to its stored value on unmount (dirty-guarded)', () => {
      const onContentChange = vi.fn();
      const content = tabContent('j-tab-clean');
      const sideSlot = mountSlot();
      const { getByPlaceholderText, unmount } = render(journalElement({ content, onContentChange, isEditing: false, sideSlot }));

      fireEvent.change(getByPlaceholderText(BOOKMARK_PLACEHOLDER), { target: { value: 'after' } });
      fireEvent.change(getByPlaceholderText(BOOKMARK_PLACEHOLDER), { target: { value: 'before' } });
      unmount();

      expect(onContentChange).not.toHaveBeenCalled();
   });
});

describe('JournalItem bookmark list-row label buffer', () => {
   const rowContent = (id: string) =>
      journalContent(id, { pages: [{ id: 'page-1', text: '' }], bookmarks: [{ id: 'bm-1', pageId: 'page-1', label: 'before' }] });

   /** Opens the sheet journal's Bookmarks popover, where the list row (and its label input) lives. */
   const openBookmarks = (getByLabelText: (text: string) => HTMLElement) =>
      fireEvent.click(getByLabelText('BoardView.journalBookmarks'));

   it('commits the buffered row label when the surface unmounts without a blur (tab switch)', () => {
      const onContentChange = vi.fn();
      const content = rowContent('j-row-unmount');
      const { getByLabelText, getByPlaceholderText, unmount } = render(journalElement({ content, onContentChange, isEditing: false, bookmarkMode: 'popover' }));

      openBookmarks(getByLabelText);
      fireEvent.change(getByPlaceholderText(BOOKMARK_PLACEHOLDER), { target: { value: 'after' } });
      unmount();

      expect(onContentChange).toHaveBeenCalledTimes(1);
      expect(onContentChange.mock.calls[0][0].data.bookmarks[0].label).toBe('after');
   });

   it('commits the buffered row label on the editable->false swap-in-place (no unmount, no blur)', () => {
      const onContentChange = vi.fn();
      const content = rowContent('j-row-edge');
      const { getByLabelText, getByPlaceholderText, rerender } = render(journalElement({ content, onContentChange, isEditing: false, bookmarkMode: 'popover' }));

      openBookmarks(getByLabelText);
      fireEvent.change(getByPlaceholderText(BOOKMARK_PLACEHOLDER), { target: { value: 'after' } });
      rerender(journalElement({ content, onContentChange, isSelected: false, isEditing: false, bookmarkMode: 'popover' }));

      expect(onContentChange).toHaveBeenCalledTimes(1);
      expect(onContentChange.mock.calls[0][0].data.bookmarks[0].label).toBe('after');
   });

   it('does not commit a row label typed back to its stored value on unmount (dirty-guarded)', () => {
      const onContentChange = vi.fn();
      const content = rowContent('j-row-clean');
      const { getByLabelText, getByPlaceholderText, unmount } = render(journalElement({ content, onContentChange, isEditing: false, bookmarkMode: 'popover' }));

      openBookmarks(getByLabelText);
      fireEvent.change(getByPlaceholderText(BOOKMARK_PLACEHOLDER), { target: { value: 'after' } });
      fireEvent.change(getByPlaceholderText(BOOKMARK_PLACEHOLDER), { target: { value: 'before' } });
      unmount();

      expect(onContentChange).not.toHaveBeenCalled();
   });
});

describe('JournalItem page-buffer entanglement', () => {
   it('commits the pending page buffer before navigating to the next page', () => {
      const onContentChange = vi.fn();
      const content = journalContent('j-nav', { pages: [{ id: 'page-1', text: 'before' }, { id: 'page-2', text: 'second' }] });
      const { getByLabelText, getByPlaceholderText } = render(journalElement({ content, onContentChange }));

      fireEvent.change(getByPlaceholderText(PAGE_PLACEHOLDER), { target: { value: 'after' } });
      fireEvent.click(getByLabelText('BoardView.nextPage'));

      expect(onContentChange).toHaveBeenCalledTimes(1);
      expect(onContentChange.mock.calls[0][0].data.pages[0].text).toBe('after');
      expect(useJournalViewStore.getState().journalView['j-nav']).toBe(1);
   });

   it('folds the pending page buffer into the single command that adds a page', () => {
      const onContentChange = vi.fn();
      const content = journalContent('j-insert', { pages: [{ id: 'page-1', text: 'before' }] });
      const toolbarSlot = mountSlot();
      const { getByLabelText, getByPlaceholderText } = render(journalElement({ content, onContentChange, toolbarSlot }));

      fireEvent.change(getByPlaceholderText(PAGE_PLACEHOLDER), { target: { value: 'after' } });
      fireEvent.click(getByLabelText('BoardView.addPage'));

      expect(onContentChange).toHaveBeenCalledTimes(1);
      const pages = onContentChange.mock.calls[0][0].data.pages;
      expect(pages).toHaveLength(2);
      expect(pages[0].text).toBe('after');
      expect(pages[1].text).toBe('');
   });
});
