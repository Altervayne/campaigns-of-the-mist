// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

/*
 * Desktop no-regression pin: the mobile journal moved its bookmark list + pages overview onto their own bottom
 * sheets, but the desktop nav bar must keep rendering `BookmarkPopover` (popover mode) and `PagesReorderPopover`
 * (while selected) exactly as before. The two popovers are stubbed to sentinels so this pins composition, not
 * their internals.
 */

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('./BookmarkPopover', () => ({ BookmarkPopover: () => <div data-testid="bookmark-popover" /> }));
vi.mock('./PagesReorderPopover', () => ({ PagesReorderPopover: () => <div data-testid="pages-reorder-popover" /> }));

import { JournalNavBar } from './JournalNavBar';

const pages = [{ id: 'p1', text: 'Alpha' }, { id: 'p2', text: 'Beta' }];

const renderBar = (overrides: Record<string, unknown> = {}) =>
   render(
      <JournalNavBar
         pages={pages}
         activePageId="p1"
         pageIndex={0}
         isSelected
         bookmarkMode="popover"
         tabs={[]}
         stopDrag={vi.fn()}
         onPrev={vi.fn()}
         onNext={vi.fn()}
         onInsertPage={vi.fn()}
         onGoToPageNumber={vi.fn()}
         onReorderPages={vi.fn()}
         onJumpToPage={vi.fn()}
         onRemoveBookmark={vi.fn()}
         onSetBookmarkLabel={vi.fn()}
         {...overrides}
      />,
   );

afterEach(cleanup);

describe('JournalNavBar (desktop) - unchanged popover composition', () => {
   it('renders the bookmark popover in popover mode and the pages overview while selected', () => {
      renderBar();
      expect(screen.getByTestId('bookmark-popover')).toBeTruthy();
      expect(screen.getByTestId('pages-reorder-popover')).toBeTruthy();
   });

   it('drops the pages overview when not selected and the bookmark popover in side-tabs mode', () => {
      renderBar({ isSelected: false, bookmarkMode: 'side-tabs' });
      expect(screen.queryByTestId('pages-reorder-popover')).toBeNull();
      expect(screen.queryByTestId('bookmark-popover')).toBeNull();
   });
});
