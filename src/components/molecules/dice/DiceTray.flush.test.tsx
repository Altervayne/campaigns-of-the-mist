// @vitest-environment jsdom

// -- Library Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

// -- Component Imports --
import { DiceTray } from './DiceTray';

// -- Type Imports --
import type { DiceTrayContent } from '@/lib/dice/diceTrayTypes';

/*
 * Locks the flush-on-unmount invariant for the tray's two buffered text fields: the title and a modifier
 * label are held locally and committed on blur, but the board host unmounts on a tab switch WITHOUT a blur.
 * Each buffer's `useCommitOnUnmount` registration is what carries the edit out, so both must survive any
 * relocation of the buffer. The commit is dirty-guarded, so a clean exit no-ops.
 */

// Echo the i18n key instead of standing up a provider - the tray only reads placeholder/label strings.
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

afterEach(cleanup);

const trayContent = (overrides: Partial<DiceTrayContent> = {}): DiceTrayContent => ({ dice: [], modifiers: [], ...overrides });

const renderTray = (content: DiceTrayContent, onChange: (next: DiceTrayContent) => void) =>
   render(<DiceTray content={content} editable onChange={onChange} onCacheRoll={() => {}} />);

describe('DiceTray flush-on-unmount invariant', () => {
   it('commits the buffered title when the surface unmounts without a blur (tab switch)', () => {
      const onChange = vi.fn();
      const { getByPlaceholderText, unmount } = renderTray(trayContent({ title: 'before' }), onChange);

      fireEvent.change(getByPlaceholderText('BoardView.diceTitlePlaceholder'), { target: { value: 'after' } });
      unmount();

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange.mock.calls[0][0].title).toBe('after');
   });

   it('does not commit an unchanged title on unmount (dirty-guarded)', () => {
      const onChange = vi.fn();
      const { unmount } = renderTray(trayContent({ title: 'before' }), onChange);

      unmount();

      expect(onChange).not.toHaveBeenCalled();
   });

   it('commits a buffered modifier label when the surface unmounts without a blur (tab switch)', () => {
      const onChange = vi.fn();
      const content = trayContent({ modifiers: [{ id: 'mod-1', label: 'before', value: 2 }] });
      const { getByPlaceholderText, unmount } = renderTray(content, onChange);

      fireEvent.change(getByPlaceholderText('BoardView.diceModifierPlaceholder'), { target: { value: 'after' } });
      unmount();

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange.mock.calls[0][0].modifiers[0].label).toBe('after');
   });

   it('does not commit an unchanged modifier label on unmount (dirty-guarded)', () => {
      const onChange = vi.fn();
      const content = trayContent({ modifiers: [{ id: 'mod-1', label: 'before', value: 2 }] });
      const { unmount } = renderTray(content, onChange);

      unmount();

      expect(onChange).not.toHaveBeenCalled();
   });
});
