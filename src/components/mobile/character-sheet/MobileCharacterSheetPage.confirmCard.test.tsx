// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// -- Type Imports --
import type { Character } from '@/lib/types/character';
import type { CreateCardOptions } from '@/lib/types/creation';

/*
 * Add Card is reachable from the card overview, so confirming a creation has to leave the overview:
 * without that the user is returned to the list they started from and the `initialCardId` jump onto
 * the new card never lands. The surfaces around the handler are stubbed - the page's own confirm path
 * is what is under test - and the sheet stub reports the reorder flag it is handed.
 */

const character = { id: 'char-1', game: 'LEGENDS', cards: [], trackers: { statuses: [], storyTags: [], storyThemes: [] } } as unknown as Character;

const mocks = vi.hoisted(() => ({ addCard: vi.fn(() => 'new-card') }));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

// The sheet surfaces its nav state so the assertion reads the value the page actually handed down.
vi.mock('@/components/mobile/character-sheet/MobileCharacterSheet', () => ({
   default: (props: { isReorderingCards?: boolean; initialCardId?: string | null; onReorderingCardsChange?: (v: boolean) => void; onOpenAddCard?: () => void }) => (
      <div data-testid="sheet" data-reordering={String(props.isReorderingCards)} data-initial-card={String(props.initialCardId)}>
         <button data-testid="enter-overview" onClick={() => props.onReorderingCardsChange?.(true)} />
         <button data-testid="open-add-card" onClick={() => props.onOpenAddCard?.()} />
      </div>
   ),
}));
// Faithful to the real creator, which calls `onConfirm` and then `onBack` - the trailing back is what
// makes the confirm path's own history push the second-to-last entry rather than the last.
vi.mock('@/components/mobile/menu/MobileAddCard', () => ({
   default: ({ onConfirm, onBack }: { onConfirm: (options: CreateCardOptions) => void; onBack: () => void }) => (
      <button
         data-testid="confirm-card"
         onClick={() => {
            onConfirm({ themebook: 'tb', themeType: 'tt' } as unknown as CreateCardOptions);
            onBack();
         }}
      />
   ),
}));
vi.mock('@/components/mobile/menu/MobileBottomTabs', () => ({ default: () => null }));
vi.mock('@/components/mobile/menu/MobileFAB', () => ({ default: () => null }));
vi.mock('@/components/mobile/dice/MobileDiceTraySheet', () => ({ MobileDiceTraySheet: () => null }));

// The store modules are partially mocked: their other exports are pulled in transitively by the page's
// module graph (backup keys, persistence helpers) and must keep their real values.
vi.mock('@/lib/stores/characterStore', async (importOriginal) => ({
   ...(await importOriginal<object>()),
   useCharacterStore: (selector: (state: { character: Character }) => unknown) => selector({ character }),
   useCharacterActions: () => ({
      addCard: mocks.addCard,
      updateCardDetails: vi.fn(),
      addImportedCard: vi.fn(),
      addImportedTracker: vi.fn(),
   }),
}));
vi.mock('@/lib/character/characterStoreRegistry', async (importOriginal) => ({
   ...(await importOriginal<object>()),
   getActiveCharacterStore: () => ({ getState: () => ({ character }) }),
}));
vi.mock('@/lib/character/characterPersistence', async (importOriginal) => ({
   ...(await importOriginal<object>()),
   useIsBootHydrating: () => false,
   useCharacterBootStore: { getState: () => ({ isBootHydrating: false }) },
}));
vi.mock('@/lib/character/tabManagerStore', async (importOriginal) => ({
   ...(await importOriginal<object>()),
   useTabManagerActions: () => ({ mobileOpenCharacter: vi.fn() }),
}));
vi.mock('@/lib/tutorial/tutorialStore', async (importOriginal) => ({
   ...(await importOriginal<object>()),
   useTutorialStore: { getState: () => ({ actions: { start: vi.fn() } }) },
}));
vi.mock('@/lib/stores/appSettingsStore', async (importOriginal) => ({
   ...(await importOriginal<object>()),
   useAppSettingsStore: (selector: (state: { isMobileFABMode: boolean }) => unknown) => selector({ isMobileFABMode: false }),
}));
vi.mock('@/lib/stores/appGeneralStateStore', async (importOriginal) => ({
   ...(await importOriginal<object>()),
   useAppGeneralStateStore: (selector: (state: { pendingMobileNavActions: unknown[] }) => unknown) => selector({ pendingMobileNavActions: [] }),
   useAppGeneralStateActions: () => ({
      setMobileOnboardingOpen: vi.fn(),
      setMobileNavSnapshot: vi.fn(),
      clearMobileNavActions: vi.fn(),
   }),
}));

import MobileCharacterSheetPage from './MobileCharacterSheetPage';

afterEach(cleanup);

describe('confirming a card created from the overview', () => {
   it('leaves the overview and jumps to the new card', () => {
      render(<MobileCharacterSheetPage />);

      fireEvent.click(screen.getByTestId('enter-overview'));
      expect(screen.getByTestId('sheet').getAttribute('data-reordering')).toBe('true');

      fireEvent.click(screen.getByTestId('open-add-card'));
      fireEvent.click(screen.getByTestId('confirm-card'));

      const sheet = screen.getByTestId('sheet');
      expect(sheet.getAttribute('data-reordering')).toBe('false');
      expect(sheet.getAttribute('data-initial-card')).toBe('new-card');
   });

   it('records the destination in history with the overview left behind', () => {
      const pushed: unknown[] = [];
      const push = vi.spyOn(window.history, 'pushState').mockImplementation((state) => { pushed.push(state); });

      try {
         render(<MobileCharacterSheetPage />);

         fireEvent.click(screen.getByTestId('enter-overview'));
         fireEvent.click(screen.getByTestId('open-add-card'));
         pushed.length = 0;
         fireEvent.click(screen.getByTestId('confirm-card'));

         // The confirm pushes its destination once, with the overview left behind.
         expect(pushed[0]).toEqual({ tab: 'sheet', sheetTab: 'cards', isReordering: false });
      } finally {
         push.mockRestore();
      }
   });
});
