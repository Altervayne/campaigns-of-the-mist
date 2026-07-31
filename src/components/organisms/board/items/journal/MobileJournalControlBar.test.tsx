// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// -- Type Imports --
import type { JournalControlsContext } from '@/components/organisms/board/items/JournalItem';

/*
 * The bespoke mobile control surface: a read strip (prev - N/M - bookmarks - next) with an edit strip above
 * it while editing (add - remove - bookmark). Every control routes to the injected journal handler - never a
 * parallel implementation - with prev/next disabled at the ends and >=44px targets. In FAB mode it reserves a
 * leading-edge slot for the floating navigation FAB; side-panel mode is a flush full-width bar.
 */

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { MobileJournalControlBar } from './MobileJournalControlBar';

const handlers = () => ({
   onPrev: vi.fn(),
   onNext: vi.fn(),
   onGoToPageNumber: vi.fn(),
   onAddPage: vi.fn(),
   onRemovePage: vi.fn(),
   onToggleBookmark: vi.fn(),
   onJumpToPage: vi.fn(),
   onReorderPages: vi.fn(),
   onRemoveBookmark: vi.fn(),
   onSetBookmarkLabel: vi.fn(),
});

const renderBar = (overrides: Partial<JournalControlsContext & { isMobileFABMode: boolean; isLeftHanded: boolean }> = {}) => {
   const h = handlers();
   const props = {
      pageIndex: 1,
      pageCount: 3,
      pages: [{ id: 'p1', text: 'Alpha' }, { id: 'p2', text: '' }, { id: 'p3', text: 'Gamma' }],
      activePageId: 'p2',
      isSelected: false,
      isEditing: false,
      tabs: [],
      isBookmarked: false,
      removeDisabled: false,
      stopDrag: vi.fn(),
      isMobileFABMode: false,
      isLeftHanded: false,
      ...h,
      ...overrides,
   };
   const result = render(<MobileJournalControlBar {...props} />);
   return { ...result, ...h };
};

afterEach(cleanup);

describe('MobileJournalControlBar', () => {
   it('routes prev / next to the injected handlers', () => {
      const { onPrev, onNext } = renderBar({ pageIndex: 1 });

      fireEvent.click(screen.getByLabelText('BoardView.prevPage'));
      fireEvent.click(screen.getByLabelText('BoardView.nextPage'));

      expect(onPrev).toHaveBeenCalledTimes(1);
      expect(onNext).toHaveBeenCalledTimes(1);
   });

   it('disables prev on the first page and next on the last', () => {
      renderBar({ pageIndex: 0, pageCount: 3 });
      expect((screen.getByLabelText('BoardView.prevPage') as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByLabelText('BoardView.nextPage') as HTMLButtonElement).disabled).toBe(false);
      cleanup();

      renderBar({ pageIndex: 2, pageCount: 3 });
      expect((screen.getByLabelText('BoardView.prevPage') as HTMLButtonElement).disabled).toBe(false);
      expect((screen.getByLabelText('BoardView.nextPage') as HTMLButtonElement).disabled).toBe(true);
   });

   it('hides the edit strip at rest and shows it while editing', () => {
      renderBar({ isEditing: false });
      expect(screen.queryByLabelText('BoardView.addPage')).toBeNull();
      cleanup();

      renderBar({ isEditing: true });
      expect(screen.getByLabelText('BoardView.addPage')).toBeTruthy();
   });

   it('routes the edit-strip actions to the injected handlers, disabling remove on the lone empty page', () => {
      const { onAddPage, onRemovePage, onToggleBookmark } = renderBar({ isEditing: true, removeDisabled: true });

      fireEvent.click(screen.getByLabelText('BoardView.addPage'));
      fireEvent.click(screen.getByLabelText('BoardView.journalBookmark'));
      expect(onAddPage).toHaveBeenCalledTimes(1);
      expect(onToggleBookmark).toHaveBeenCalledTimes(1);

      const remove = screen.getByLabelText('BoardView.removePage') as HTMLButtonElement;
      expect(remove.disabled).toBe(true);
      fireEvent.click(remove);
      expect(onRemovePage).not.toHaveBeenCalled();
   });

   it('grows every target to a >=44px touch box', () => {
      renderBar({ isEditing: true });
      for (const label of ['BoardView.prevPage', 'BoardView.nextPage', 'BoardView.addPage', 'BoardView.removePage']) {
         expect(screen.getByLabelText(label).className).toContain('min-h-11');
      }
   });

   it('opens the pages overview sheet from the pages button', () => {
      renderBar();
      expect(screen.queryByRole('heading', { name: 'BoardView.journalPages' })).toBeNull();

      fireEvent.click(screen.getByLabelText('BoardView.journalPages'));
      expect(screen.getByRole('heading', { name: 'BoardView.journalPages' })).toBeTruthy();
   });

   it('opens the bookmark sheet from the bookmarks button', () => {
      renderBar({ tabs: [] });
      expect(screen.queryByRole('heading', { name: 'BoardView.journalBookmarks' })).toBeNull();

      fireEvent.click(screen.getByLabelText('BoardView.journalBookmarks'));
      // The sheet mounts with its heading and, given no bookmarks, the empty-state line.
      expect(screen.getByRole('heading', { name: 'BoardView.journalBookmarks' })).toBeTruthy();
      expect(screen.getByText('BoardView.journalNoBookmarks')).toBeTruthy();
   });

   // The reservation lives on the paper-filled strip (not the bg-less wrapper) so the notebook color runs
   // under the FAB rather than leaving an uncolored notch.
   it('reserves a handedness-leading FAB slot on the colored strip in FAB mode only', () => {
      const right = renderBar({ isMobileFABMode: true, isLeftHanded: false });
      expect((right.container.querySelector('.bg-paper-primary') as HTMLElement).style.paddingRight).toBe('4rem');
      cleanup();

      const left = renderBar({ isMobileFABMode: true, isLeftHanded: true });
      expect((left.container.querySelector('.bg-paper-primary') as HTMLElement).style.paddingLeft).toBe('4rem');
      cleanup();

      const panel = renderBar({ isMobileFABMode: false });
      const el = panel.container.querySelector('.bg-paper-primary') as HTMLElement;
      expect(el.style.paddingLeft).toBe('');
      expect(el.style.paddingRight).toBe('');
   });
});
