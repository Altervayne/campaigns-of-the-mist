// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

/*
 * The creator's type list gains a Journal option alongside Portrait: both carry no themebook/type, so
 * both act immediately rather than selecting a card type. Journal appears only when its handler is
 * supplied (create mode), mirroring Portrait's gating.
 */

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { MobileAddCardTypeSelector } from './MobileAddCardTypeSelector';

const journalButton = () => screen.queryByText('WorkspacePage.addJournal')?.closest('button') ?? null;

afterEach(cleanup);

describe('creator Journal option', () => {
   it('offers Journal and fires its handler on tap', () => {
      const onSelectJournal = vi.fn();
      render(
         <MobileAddCardTypeSelector game="LEGENDS" mode="create" cardType="" onSelect={vi.fn()} onSelectJournal={onSelectJournal} />
      );

      const button = journalButton();
      expect(button).not.toBeNull();

      fireEvent.click(button!);
      expect(onSelectJournal).toHaveBeenCalledTimes(1);
   });

   it('acts immediately - selecting Journal is not a card-type selection', () => {
      const onSelect = vi.fn();
      render(
         <MobileAddCardTypeSelector game="LEGENDS" mode="create" cardType="" onSelect={onSelect} onSelectJournal={vi.fn()} />
      );

      fireEvent.click(journalButton()!);
      expect(onSelect).not.toHaveBeenCalled();
   });

   it('omits Journal without a handler', () => {
      render(<MobileAddCardTypeSelector game="LEGENDS" mode="create" cardType="" onSelect={vi.fn()} />);

      expect(journalButton()).toBeNull();
   });
});
