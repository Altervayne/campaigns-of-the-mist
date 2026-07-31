// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

/*
 * With no cards or journals the pager shows one placeholder page, the only route to creating a first sheet
 * element. It is not edit-gated, so a Play-mode user on a fresh sheet still has a way to add a card.
 */

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { MobileSheetCardSlot } from './MobileSheetCardSlot';

const addButton = () => document.querySelector('[data-tutorial="add-card-button"]') as HTMLElement | null;
const addJournalButton = () => document.querySelector('[data-tutorial="carousel-add-journal"]') as HTMLElement | null;

afterEach(cleanup);

describe('empty pager add-card placeholder', () => {
   it('offers the placeholder in Play mode', () => {
      const onOpenAddCard = vi.fn();
      render(<MobileSheetCardSlot item={undefined} isLeftHanded={false} isEditing={false} onOpenAddCard={onOpenAddCard} />);

      const button = addButton();
      expect(button).not.toBeNull();

      fireEvent.click(button!);
      expect(onOpenAddCard).toHaveBeenCalledTimes(1);
   });

   it('offers the placeholder in Edit mode', () => {
      render(<MobileSheetCardSlot item={undefined} isLeftHanded={false} isEditing onOpenAddCard={() => {}} />);

      expect(addButton()).not.toBeNull();
   });

   it('is omitted with no add handler', () => {
      render(<MobileSheetCardSlot item={undefined} isLeftHanded={false} isEditing={false} />);

      expect(addButton()).toBeNull();
   });

   it('offers a single add affordance - no separate journal button', () => {
      render(<MobileSheetCardSlot item={undefined} isLeftHanded={false} isEditing={false} onOpenAddCard={() => {}} />);

      expect(addButton()).not.toBeNull();
      expect(addJournalButton()).toBeNull();
   });
});
