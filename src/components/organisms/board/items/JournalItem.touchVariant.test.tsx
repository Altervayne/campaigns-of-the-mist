// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

// -- Component Imports --
import { JournalItem } from './JournalItem';

// -- Store Imports --
import { useJournalViewStore } from '@/lib/stores/journalViewStore';

// -- Type Imports --
import type { BoardItem, JournalBoardContent } from '@/lib/types/board';

/*
 * The mobile body variants ride a single `touch` prop, default false. This pins that the board / sheet-card
 * hosts (which pass nothing) render the desktop sizing - 14px editors, a clipped resting page - and
 * mutation-proves the prop is load-bearing: flipping it to true is what swaps in 16px editors and the resting
 * page scroll. If the default ever changed, the desktop half of these pairs would fail. (The >=44px page
 * controls are the injected mobile control bar's concern, pinned in MobileJournalControlBar's own test.)
 */

vi.mock('@/hooks/board/useBoardMentionMint', () => ({ useBoardMentionMint: () => () => {} }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

const content: JournalBoardContent = { kind: 'journal', mode: 'copy', data: { id: 'j', title: 'T', pages: [{ id: 'p1', text: 'body' }], bookmarks: [] } };
const boardItem = (c: JournalBoardContent): BoardItem => ({ id: 'item', kind: 'journal', x: 0, y: 0, width: 300, height: 400, z: 0, content: c });

const mount = (touch: boolean) =>
   render(
      <JournalItem
         item={boardItem(content)}
         content={content}
         isSelected
         isEditing
         touch={touch}
         toolbarSlot={null}
         sideSlot={null}
         bookmarkMode="popover"
         onContentChange={() => {}}
         onRequestSelect={() => {}}
      />,
   );

// Omits `touch` entirely - the board/sheet-card hosts pass nothing, so this is the path they render on.
// Pins the DEFAULT (not the prop): flipping the default to `true` regresses every desktop journal here.
const mountHostDefault = () =>
   render(
      <JournalItem
         item={boardItem(content)}
         content={content}
         isSelected
         isEditing
         toolbarSlot={null}
         sideSlot={null}
         bookmarkMode="popover"
         onContentChange={() => {}}
         onRequestSelect={() => {}}
      />,
   );

// At rest (no editing) the page renders its Markdown in a container the desktop box clips and the mobile
// surface scrolls.
const mountResting = (touch: boolean) =>
   render(
      <JournalItem
         item={boardItem(content)}
         content={content}
         isSelected={false}
         isEditing={false}
         touch={touch}
         toolbarSlot={null}
         sideSlot={null}
         bookmarkMode="popover"
         onContentChange={() => {}}
         onRequestSelect={() => {}}
      />,
   );

beforeEach(() => useJournalViewStore.setState({ journalView: {} }));
afterEach(cleanup);

describe('JournalItem touch gating', () => {
   it('renders 14px editors when touch is false', () => {
      const { getByPlaceholderText } = mount(false);
      const page = getByPlaceholderText('BoardView.journalPlaceholder');
      const title = getByPlaceholderText('BoardView.journalTitlePlaceholder');

      expect(page.className).toContain('text-sm');
      expect(page.className).not.toContain('text-base');
      expect(title.className).toContain('text-sm');
      expect(title.className).not.toContain('text-base');
   });

   it('defaults to desktop sizing with no touch prop (a default flip regresses every desktop journal)', () => {
      const { getByPlaceholderText } = mountHostDefault();
      const page = getByPlaceholderText('BoardView.journalPlaceholder');
      const title = getByPlaceholderText('BoardView.journalTitlePlaceholder');

      expect(page.className).toContain('text-sm');
      expect(page.className).not.toContain('text-base');
      expect(title.className).toContain('text-sm');
      expect(title.className).not.toContain('text-base');
   });

   it('grows the editors to 16px under touch (the prop is load-bearing)', () => {
      const { getByPlaceholderText } = mount(true);
      const page = getByPlaceholderText('BoardView.journalPlaceholder');
      const title = getByPlaceholderText('BoardView.journalTitlePlaceholder');

      expect(page.className).toContain('text-base');
      expect(page.className).not.toContain('text-sm');
      expect(title.className).toContain('text-base');
   });

   it('clips the resting page by default and scrolls it under touch (the prop is load-bearing)', () => {
      const compact = mountResting(false);
      expect(compact.container.querySelector('.overflow-hidden')).toBeTruthy();
      expect(compact.container.querySelector('.overflow-y-auto')).toBeNull();
      cleanup();

      const touch = mountResting(true);
      expect(touch.container.querySelector('.overflow-y-auto')).toBeTruthy();
   });
});
