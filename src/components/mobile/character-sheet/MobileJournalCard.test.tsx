// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// -- Type Imports --
import type { Journal } from '@/lib/types/board';

/*
 * A journal filling the mobile card stage inline (its own frame, not a modal / screen), gated on the sheet's
 * global Edit mode: at rest the page renders its Markdown and no editor exists; in Edit mode the page is a
 * textarea and the bespoke control bar grows its edit strip, whose add-page folds the pending edit into the
 * one command committed back through `updateJournal`. In FAB mode the page reserves bottom padding so its last
 * line clears the floating FAB.
 */

const state = vi.hoisted(() => ({ isEditing: false, isMobileFABMode: false, handedness: 'right' as 'left' | 'right' }));
const mocks = vi.hoisted(() => ({ updateJournal: vi.fn() }));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/hooks/board/useBoardMentionMint', () => ({ useBoardMentionMint: () => () => {} }));
vi.mock('@/hooks/character-sheet/useSheetMentionCreate', () => ({ useSheetMentionCreate: () => () => {} }));
vi.mock('@/lib/stores/characterStore', async (importOriginal) => ({
   ...(await importOriginal<object>()),
   useCharacterActions: () => ({ updateJournal: mocks.updateJournal }),
}));
vi.mock('@/lib/stores/appGeneralStateStore', async (importOriginal) => ({
   ...(await importOriginal<object>()),
   useAppGeneralStateStore: (selector: (s: { isEditing: boolean }) => unknown) => selector({ isEditing: state.isEditing }),
}));
vi.mock('@/lib/stores/appSettingsStore', async (importOriginal) => ({
   ...(await importOriginal<object>()),
   useAppSettingsStore: (selector: (s: { isMobileFABMode: boolean; mobileHandedness: 'left' | 'right' }) => unknown) =>
      selector({ isMobileFABMode: state.isMobileFABMode, mobileHandedness: state.handedness }),
}));

// Radix's popover trigger observes its size; jsdom ships no ResizeObserver.
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

import { MobileJournalCard } from './MobileJournalCard';
import { useJournalViewStore } from '@/lib/stores/journalViewStore';

const journal: Journal = { id: 'j1', title: 'Session Notes', pages: [{ id: 'p1', text: 'The tavern burns.' }], bookmarks: [] };
const PAGE_PLACEHOLDER = 'BoardView.journalPlaceholder';

beforeEach(() => {
   state.isEditing = false;
   state.isMobileFABMode = false;
   state.handedness = 'right';
   mocks.updateJournal.mockClear();
   useJournalViewStore.setState({ journalView: {} });
});
afterEach(cleanup);

describe('MobileJournalCard', () => {
   it('renders the journal inline, filling its own frame (not a modal)', () => {
      const { container } = render(<MobileJournalCard journal={journal} />);

      const frame = container.firstChild as HTMLElement;
      expect(frame.className).toContain('h-full');
      expect(frame.className).toContain('border-paper-border');
      expect(screen.getByText('Session Notes')).toBeTruthy();
      expect(screen.getByText('The tavern burns.')).toBeTruthy();
      // The injected control bar provides page nav in place of the desktop nav bar.
      expect(screen.getByLabelText('BoardView.prevPage')).toBeTruthy();
   });

   it('is read-only when global Edit mode is off', () => {
      const { container } = render(<MobileJournalCard journal={journal} />);

      expect(container.querySelector('textarea')).toBeNull();
      expect(screen.queryByLabelText('BoardView.addPage')).toBeNull();
   });

   it('is editable when global Edit mode is on', () => {
      state.isEditing = true;
      render(<MobileJournalCard journal={journal} />);

      expect(screen.getByPlaceholderText(PAGE_PLACEHOLDER)).toBeTruthy();
      expect(screen.getByLabelText('BoardView.addPage')).toBeTruthy();
   });

   it('folds a pending edit into the one add-page commit through updateJournal', () => {
      state.isEditing = true;
      render(<MobileJournalCard journal={journal} />);

      fireEvent.change(screen.getByPlaceholderText(PAGE_PLACEHOLDER), { target: { value: 'edited' } });
      fireEvent.click(screen.getByLabelText('BoardView.addPage'));

      expect(mocks.updateJournal).toHaveBeenCalledTimes(1);
      const [id, data] = mocks.updateJournal.mock.calls[0];
      expect(id).toBe('j1');
      expect(data.pages).toHaveLength(2);
      expect(data.pages[0].text).toBe('edited');
   });

   it('reserves the FAB slot on the colored control-bar strip, not the page body', () => {
      state.isEditing = true;
      state.isMobileFABMode = true;
      const fab = render(<MobileJournalCard journal={journal} />);

      // The control bar sits between the page body and the FAB, so the page body carries no FAB padding
      // (which would read as a dissociated band below the text).
      expect((fab.getByPlaceholderText(PAGE_PLACEHOLDER) as HTMLTextAreaElement).style.paddingBottom).toBe('');

      // The reservation lives on the paper-filled control strip, so the notebook color runs under the FAB - no
      // notch. `.bg-paper-primary.justify-between` is the control strip, distinct from the same-token title band.
      const strip = fab.container.querySelector('.bg-paper-primary.justify-between') as HTMLElement;
      expect(strip).toBeTruthy();
      expect(strip.style.paddingRight === '4rem' || strip.style.paddingLeft === '4rem').toBe(true);
      cleanup();

      state.isMobileFABMode = false;
      const panel = render(<MobileJournalCard journal={journal} />);
      const flush = panel.container.querySelector('.bg-paper-primary.justify-between') as HTMLElement;
      expect(flush.style.paddingRight).toBe('');
      expect(flush.style.paddingLeft).toBe('');
   });
});
