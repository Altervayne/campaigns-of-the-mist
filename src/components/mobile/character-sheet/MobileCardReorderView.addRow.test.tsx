// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

// -- Type Imports --
import type { ReactNode } from 'react';
import type { ResolvedSheetItem } from '@/lib/character/sheetLayout';

/*
 * The overview's add row must sit OUTSIDE the SortableContext and after the list. Inside it, a dashed
 * row reads as a drop slot rather than an action - the one way to get this placement visually wrong,
 * and a one-line move for anyone editing the list later. The real SortableContext is wrapped in a
 * marker element so containment can be asserted; a provider renders no DOM of its own.
 */

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/stores/characterStore', () => ({ useCharacterActions: () => ({ reorderSheetLayout: vi.fn() }) }));
vi.mock('@/lib/stores/appSettingsStore', () => ({ useAppSettingsStore: () => false }));
// The previews route through the card registry; a stub keeps this about the list's shape.
vi.mock('@/components/organisms/cards/resolveCardComponent', () => ({
   resolveCardComponent: () => () => <div data-testid="card-preview" />,
}));
vi.mock('@dnd-kit/sortable', async (importOriginal) => {
   const actual = await importOriginal<typeof import('@dnd-kit/sortable')>();
   const Real = actual.SortableContext;
   return {
      ...actual,
      SortableContext: (props: { children?: ReactNode; items: unknown[]; strategy?: unknown }) => (
         <div data-testid="sortable-context">
            <Real {...(props as Parameters<typeof Real>[0])} />
         </div>
      ),
   };
});

import { MobileCardReorderView } from './MobileCardReorderView';

const cardItem = (id: string): ResolvedSheetItem =>
   ({ kind: 'card', id, card: { id, cardType: 'CHARACTER_THEME', details: { game: 'LEGENDS' } } } as unknown as ResolvedSheetItem);

const mount = (onOpenAddCard?: () => void, onCreateJournal?: () => void) =>
   render(
      <MobileCardReorderView
         items={[cardItem('c1'), cardItem('c2')]}
         isMobileFABMode={false}
         isLeftHanded={false}
         onSelectItem={() => {}}
         onOpenAddCard={onOpenAddCard}
         onCreateJournal={onCreateJournal}
      />
   );

afterEach(cleanup);

describe('card overview add row', () => {
   it('renders after the list and outside the sortable context', () => {
      mount(() => {});

      const sortable = screen.getByTestId('sortable-context');
      const addRow = document.querySelector('[data-tutorial="card-overview-add"]');

      expect(addRow).not.toBeNull();
      expect(sortable.contains(addRow)).toBe(false);
      // Follows the list rather than preceding it.
      expect(sortable.compareDocumentPosition(addRow!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
   });

   it('carries no grip handle', () => {
      mount(() => {});

      const addRow = document.querySelector('[data-tutorial="card-overview-add"]') as HTMLElement;
      expect(within(addRow).queryByLabelText('Common.dragHandle')).toBeNull();
   });

   it('is omitted with no add handler', () => {
      mount(undefined);

      expect(document.querySelector('[data-tutorial="card-overview-add"]')).toBeNull();
   });
});

describe('card overview add-journal row', () => {
   it('follows the add-card row, outside the sortable context, with no grip', () => {
      mount(() => {}, () => {});

      const sortable = screen.getByTestId('sortable-context');
      const addCard = document.querySelector('[data-tutorial="card-overview-add"]')!;
      const addJournal = document.querySelector('[data-tutorial="card-overview-add-journal"]') as HTMLElement;

      expect(addJournal).not.toBeNull();
      expect(sortable.contains(addJournal)).toBe(false);
      // Sits after the add-card row.
      expect(addCard.compareDocumentPosition(addJournal) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(within(addJournal).queryByLabelText('Common.dragHandle')).toBeNull();
   });

   it('creates a journal on tap', () => {
      const onCreateJournal = vi.fn();
      mount(() => {}, onCreateJournal);

      fireEvent.click(document.querySelector('[data-tutorial="card-overview-add-journal"]')!);
      expect(onCreateJournal).toHaveBeenCalledTimes(1);
   });

   it('is omitted with no create handler', () => {
      mount(() => {}, undefined);

      expect(document.querySelector('[data-tutorial="card-overview-add-journal"]')).toBeNull();
   });
});
