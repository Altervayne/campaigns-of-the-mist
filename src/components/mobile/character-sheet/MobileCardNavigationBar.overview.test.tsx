// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// -- Type Imports --
import type { ResolvedSheetItem } from '@/lib/character/sheetLayout';

/*
 * The overview button used to hide below two cards, back when the overview only reordered. It now
 * carries Add Card, so a one-card character that cannot reach it cannot add a second card from the
 * cards tab at all.
 */

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/stores/appSettingsStore', () => ({ useAppSettingsStore: () => false }));
vi.mock('@/lib/utils/character', () => ({ deriveCardTitle: () => 'Card', deriveJournalTitle: () => 'Journal' }));

import { MobileCardNavigationBar } from './MobileCardNavigationBar';

const cardItem = (id: string): ResolvedSheetItem => ({ kind: 'card', id, card: { id } } as unknown as ResolvedSheetItem);

const mount = (items: ResolvedSheetItem[], onReorder = vi.fn()) => {
   render(
      <MobileCardNavigationBar
         items={items}
         safeCardIndex={0}
         isLeftHanded={false}
         onPrevious={() => {}}
         onNext={() => {}}
         onSelectCard={() => {}}
         onFlip={() => {}}
         onReorder={onReorder}
         touchHandlers={{ onTouchStart: () => {}, onTouchEnd: () => {} }}
      />
   );
   return onReorder;
};

afterEach(cleanup);

describe('card nav bar overview button', () => {
   it('shows with a single card', () => {
      const onReorder = mount([cardItem('c1')]);

      const button = screen.getByLabelText('Toolbelt.cardOverview');
      fireEvent.click(button);

      expect(onReorder).toHaveBeenCalledTimes(1);
   });

   it('shows with several cards', () => {
      mount([cardItem('c1'), cardItem('c2'), cardItem('c3')]);

      expect(screen.getByLabelText('Toolbelt.cardOverview')).toBeTruthy();
   });
});
