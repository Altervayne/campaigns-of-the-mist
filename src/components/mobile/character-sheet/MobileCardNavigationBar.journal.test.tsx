// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

// -- Type Imports --
import type { ResolvedSheetItem } from '@/lib/character/sheetLayout';

/*
 * A journal has no faces, so the nav bar hides the flip control on a journal entry and reads its title
 * from the journal (not the card deriver). A card entry keeps the flip control.
 */

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/stores/appSettingsStore', () => ({ useAppSettingsStore: () => false }));
vi.mock('@/lib/utils/character', () => ({
   deriveCardTitle: () => 'A Card',
   deriveJournalTitle: (journal: { title: string }) => journal.title,
}));

import { MobileCardNavigationBar } from './MobileCardNavigationBar';

const cardItem = (id: string): ResolvedSheetItem => ({ kind: 'card', id, card: { id } } as unknown as ResolvedSheetItem);
const journalItem = (id: string, title: string): ResolvedSheetItem => ({ kind: 'journal', id, journal: { id, title, pages: [], bookmarks: [] } });

const mount = (items: ResolvedSheetItem[], safeCardIndex: number) =>
   render(
      <MobileCardNavigationBar
         items={items}
         safeCardIndex={safeCardIndex}
         isLeftHanded={false}
         onPrevious={() => {}}
         onNext={() => {}}
         onSelectCard={() => {}}
         onFlip={() => {}}
         onReorder={() => {}}
      />
   );

afterEach(cleanup);

describe('nav bar on a journal entry', () => {
   it('hides the flip control when the active entry is a journal', () => {
      mount([cardItem('c1'), journalItem('j1', 'Session Notes')], 1);

      expect(screen.queryByLabelText('Toolbelt.flipCard')).toBeNull();
   });

   it('keeps the flip control when the active entry is a card', () => {
      mount([cardItem('c1'), journalItem('j1', 'Session Notes')], 0);

      expect(screen.getByLabelText('Toolbelt.flipCard')).toBeTruthy();
   });

   it('reads the title from the journal on a journal entry', () => {
      mount([cardItem('c1'), journalItem('j1', 'Session Notes')], 1);

      expect(screen.getByText('Session Notes')).toBeTruthy();
   });

   it('reads the card title on a card entry', () => {
      mount([cardItem('c1'), journalItem('j1', 'Session Notes')], 0);

      expect(screen.getByText('A Card')).toBeTruthy();
   });
});
