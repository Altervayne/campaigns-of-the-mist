// @vitest-environment jsdom

// -- Library Imports --
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

// -- Component Imports --
import { JournalItem } from './JournalItem';
import { PageReorderRow } from './journal/PageReorderRow';

// -- Store Imports --
import { useJournalViewStore } from '@/lib/stores/journalViewStore';

// -- Type Imports --
import type { BoardItem, BoardItemContent, JournalBoardContent } from '@/lib/types/board';

/*
 * Locks the pages-reorder rows against leaking a press to the board item that hosts them. The popover is
 * body-portaled, but React events bubble through the COMPONENT tree, so the portal alone keeps nothing off
 * the item - an unswallowed pointerdown reaches the item's move gesture and the whole journal follows the
 * cursor while the pages are being reordered. The row stops it, which covers the grip and the jump button
 * alike; because React dispatches to the target first, dnd-kit's own pointerdown on the grip still runs and
 * the sortable drag still starts. Stopping pointerdown must also leave the jump click intact.
 */

// The mention-mint hook reaches into board context; a no-op is all the journal needs to render in isolation.
vi.mock('@/hooks/board/useBoardMentionMint', () => ({ useBoardMentionMint: () => () => {} }));
// Echo the i18n key instead of standing up a provider - the journal only reads placeholder/label strings.
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

// The pages popover positions itself through Radix, which observes its trigger; jsdom ships no
// ResizeObserver, so the reorder rows are unreachable without one.
class ResizeObserverStub {
   observe() {}
   unobserve() {}
   disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

// The page position is module state keyed by journal id; clear it so a test never inherits another's page.
beforeEach(() => useJournalViewStore.setState({ journalView: {} }));
afterEach(cleanup);

const REORDER_LABEL = 'BoardView.journalReorderPages';

const journalContent = (id: string): JournalBoardContent => ({
   kind: 'journal',
   mode: 'copy',
   data: { id, title: '', pages: [{ id: 'page-1', text: 'first' }, { id: 'page-2', text: 'second' }], bookmarks: [] },
});

const boardItem = (content: JournalBoardContent): BoardItem => ({ id: 'item-1', kind: 'journal', x: 0, y: 0, width: 300, height: 400, z: 0, content });

/** The journal as the board renders it (selected, so the pages-overview trigger is present), under a host spy. */
const hostedJournal = (content: JournalBoardContent, onHostPointerDown: (event: unknown) => void, onContentChange: (next: BoardItemContent) => void) => (
   <div onPointerDown={onHostPointerDown}>
      <JournalItem
         item={boardItem(content)}
         content={content}
         isSelected
         isEditing
         toolbarSlot={null}
         sideSlot={null}
         onContentChange={onContentChange}
         onRequestSelect={() => {}}
      />
   </div>
);

/** Opens the pages popover and returns its reorder rows; the grips carry the same label as the trigger. */
const openReorderRows = (getAllByLabelText: (label: string) => HTMLElement[], getByLabelText: (label: string) => HTMLElement) => {
   fireEvent.click(getByLabelText(REORDER_LABEL));
   const grips = getAllByLabelText(REORDER_LABEL).slice(1);
   return grips.map((grip) => ({ grip, body: grip.parentElement!.querySelectorAll('button')[1] }));
};

describe('PageReorderRow press', () => {
   it('runs the drag listeners it was given and still stops the event', () => {
      const onHostPointerDown = vi.fn();
      const onDragPointerDown = vi.fn();
      const { getByLabelText } = render(
         <div onPointerDown={onHostPointerDown}>
            <PageReorderRow
               label="1"
               snippet="first"
               emptyLabel="empty"
               reorderLabel={REORDER_LABEL}
               active
               dragListeners={{ onPointerDown: onDragPointerDown }}
               onJump={() => {}}
            />
         </div>,
      );

      fireEvent.pointerDown(getByLabelText(REORDER_LABEL));

      expect(onDragPointerDown).toHaveBeenCalledTimes(1);
      expect(onHostPointerDown).not.toHaveBeenCalled();
   });

   it('still jumps when the row body is pressed and released', () => {
      const onHostPointerDown = vi.fn();
      const onJump = vi.fn();
      const { getByText } = render(
         <div onPointerDown={onHostPointerDown}>
            <PageReorderRow label="1" snippet="first" emptyLabel="empty" reorderLabel={REORDER_LABEL} active={false} onJump={onJump} />
         </div>,
      );

      const body = getByText('first').closest('button')!;
      fireEvent.pointerDown(body);
      fireEvent.pointerUp(body);
      fireEvent.click(body);

      expect(onJump).toHaveBeenCalledTimes(1);
      expect(onHostPointerDown).not.toHaveBeenCalled();
   });
});

describe('JournalItem pages-reorder popover', () => {
   it('does not leak a grip press out to the host board item', () => {
      const onHostPointerDown = vi.fn();
      const content = journalContent('j-reorder-grip');
      const { getAllByLabelText, getByLabelText } = render(hostedJournal(content, onHostPointerDown, () => {}));

      const rows = openReorderRows(getAllByLabelText, getByLabelText);
      expect(rows).toHaveLength(2);
      fireEvent.pointerDown(rows[0].grip);

      expect(onHostPointerDown).not.toHaveBeenCalled();
   });

   it('does not leak a row-body press out to the host board item', () => {
      const onHostPointerDown = vi.fn();
      const content = journalContent('j-reorder-body');
      const { getAllByLabelText, getByLabelText } = render(hostedJournal(content, onHostPointerDown, () => {}));

      const rows = openReorderRows(getAllByLabelText, getByLabelText);
      expect(rows).toHaveLength(2);
      fireEvent.pointerDown(rows[1].body);

      expect(onHostPointerDown).not.toHaveBeenCalled();
   });
});
