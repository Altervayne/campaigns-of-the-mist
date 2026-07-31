// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

/*
 * The mobile pages overview sheet: every page as a thumb-sized row (number + first-line snippet), the current
 * page marked. A row tap jumps to that page (by id) and closes - available at rest too. A >=44px reorder grip
 * appears only while editing; jump stays live in both modes.
 */

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { MobileJournalPagesSheet } from './MobileJournalPagesSheet';

const pages = [{ id: 'p1', text: 'Alpha line\nmore' }, { id: 'p2', text: '' }, { id: 'p3', text: 'Gamma line' }];

const renderSheet = (overrides: Partial<Parameters<typeof MobileJournalPagesSheet>[0]> = {}) => {
   const props = {
      isOpen: true,
      onClose: vi.fn(),
      pages,
      activePageId: 'p2',
      editable: false,
      isLeftHanded: false,
      onJump: vi.fn(),
      onReorder: vi.fn(),
      ...overrides,
   };
   return { props, ...render(<MobileJournalPagesSheet {...props} />) };
};

afterEach(cleanup);

describe('MobileJournalPagesSheet', () => {
   it('lists every page with its first-line snippet, empty pages flagged', () => {
      renderSheet();
      expect(screen.getByText('Alpha line')).toBeTruthy();
      expect(screen.getByText('Gamma line')).toBeTruthy();
      // The empty page falls back to the empty-page label.
      expect(screen.getByText('BoardView.journalEmptyPage')).toBeTruthy();
   });

   it('marks the active page row', () => {
      renderSheet({ activePageId: 'p2' });
      const activeRow = screen.getByText('BoardView.journalEmptyPage').closest('div');
      expect(activeRow?.className).toContain('bg-accent');
   });

   it('jumps to the tapped page by id and closes', () => {
      const { props } = renderSheet();
      fireEvent.click(screen.getByText('Alpha line'));
      expect(props.onJump).toHaveBeenCalledWith('p1');
      expect(props.onClose).toHaveBeenCalledTimes(1);
   });

   it('shows a reorder grip per page only while editing', () => {
      renderSheet({ editable: false });
      expect(screen.queryAllByLabelText('BoardView.journalReorderPages')).toHaveLength(0);
      cleanup();

      renderSheet({ editable: true });
      const grips = screen.getAllByLabelText('BoardView.journalReorderPages');
      expect(grips).toHaveLength(3);
      expect(grips[0].className).toContain('h-11');
   });
});
