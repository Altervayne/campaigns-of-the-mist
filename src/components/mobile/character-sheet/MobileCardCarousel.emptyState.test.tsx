// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

/*
 * With no cards there is no overview, so the carousel's placeholder is the only route to creating one.
 * It used to be edit-gated, which left a Play-mode user on a fresh sheet with no way to add a card
 * short of the toolbelt.
 */

const mocks = vi.hoisted(() => ({ isEditing: false }));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/stores/appGeneralStateStore', () => ({
   useAppGeneralStateStore: (selector: (state: { isEditing: boolean }) => unknown) => selector({ isEditing: mocks.isEditing }),
}));

import MobileCardCarousel from './MobileCardCarousel';

const addButton = () => document.querySelector('[data-tutorial="add-card-button"]') as HTMLElement | null;

beforeEach(() => {
   mocks.isEditing = false;
});
afterEach(cleanup);

describe('empty carousel add-card placeholder', () => {
   it('offers the placeholder in Play mode', () => {
      const onOpenAddCard = vi.fn();
      render(<MobileCardCarousel cards={[]} currentIndex={0} onOpenAddCard={onOpenAddCard} />);

      const button = addButton();
      expect(button).not.toBeNull();

      fireEvent.click(button!);
      expect(onOpenAddCard).toHaveBeenCalledTimes(1);
   });

   it('offers the placeholder in Edit mode', () => {
      mocks.isEditing = true;
      render(<MobileCardCarousel cards={[]} currentIndex={0} onOpenAddCard={() => {}} />);

      expect(addButton()).not.toBeNull();
   });

   it('is omitted with no add handler', () => {
      render(<MobileCardCarousel cards={[]} currentIndex={0} />);

      expect(addButton()).toBeNull();
   });
});
