// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

// -- Type Imports --
import type { Card } from '@/lib/types/character';

/*
 * The creator offers Journal only while creating: editing a card changes its themebook/type, so adding a
 * journal there makes no sense. The Journal option is gated on create mode, mirroring Portrait.
 */

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import MobileAddCard from './MobileAddCard';

const journalOption = () => screen.queryByText('WorkspacePage.addJournal');

afterEach(cleanup);

describe('creator Journal option gating', () => {
   it('offers Journal in create mode', () => {
      render(
         <MobileAddCard onBack={vi.fn()} onConfirm={vi.fn()} mode="create" game="LEGENDS" onCreateJournal={vi.fn()} />
      );

      expect(journalOption()).not.toBeNull();
   });

   it('hides Journal in edit mode', () => {
      const cardData = {
         id: 'c1',
         cardType: 'GROUP_THEME',
         details: { game: 'LEGENDS', themeType: 'Origin', themebook: 'tb', powerTags: [], weaknessTags: [] },
      } as unknown as Card;
      render(
         <MobileAddCard onBack={vi.fn()} onConfirm={vi.fn()} mode="edit" cardData={cardData} game="LEGENDS" onCreateJournal={vi.fn()} />
      );

      expect(journalOption()).toBeNull();
   });
});
