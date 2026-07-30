// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

/*
 * The sheet's Edit control against the real app-state store: it must both READ the flag (it is the sheet's
 * only persistent edit-state indicator) and write it. The control is icon-only, so `aria-pressed` and a
 * fixed label are the whole state report and are pinned here. Its own anchor key is pinned too - reusing
 * `edit-mode-toggle` would put a second node under a key three tutorial steps already spotlight.
 */

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { useAppGeneralStateStore } from '@/lib/stores/appGeneralStateStore';
import { MobileSheetModeToggle } from './MobileSheetModeToggle';

const toggle = () => screen.getByRole('button', { name: 'MobileCharacterSheet.modeToggle' });

const isEditing = () => useAppGeneralStateStore.getState().isEditing;

beforeEach(() => {
   useAppGeneralStateStore.getState().actions.setIsEditing(false);
});

afterEach(cleanup);

describe('mobile sheet mode toggle', () => {
   it('reads its pressed state from the sheet edit flag', () => {
      render(<MobileSheetModeToggle />);
      expect(toggle().getAttribute('aria-pressed')).toBe('false');

      act(() => useAppGeneralStateStore.getState().actions.setIsEditing(true));

      expect(toggle().getAttribute('aria-pressed')).toBe('true');
   });

   it('enters and leaves Edit mode from the one control', () => {
      render(<MobileSheetModeToggle />);
      expect(screen.getAllByRole('button')).toHaveLength(1);

      fireEvent.click(toggle());
      expect(isEditing()).toBe(true);

      fireEvent.click(toggle());
      expect(isEditing()).toBe(false);
   });

   it('keeps the same label and no text in either state', () => {
      render(<MobileSheetModeToggle />);
      expect(toggle().textContent).toBe('');

      act(() => useAppGeneralStateStore.getState().actions.setIsEditing(true));

      expect(toggle().getAttribute('aria-label')).toBe('MobileCharacterSheet.modeToggle');
      expect(toggle().textContent).toBe('');
   });

   it('carries an anchor of its own, not the shared edit-mode-toggle key', () => {
      render(<MobileSheetModeToggle />);

      expect(document.querySelector('[data-tutorial="sheet-mode-toggle"]')).not.toBeNull();
      expect(document.querySelector('[data-tutorial="edit-mode-toggle"]')).toBeNull();
   });
});
