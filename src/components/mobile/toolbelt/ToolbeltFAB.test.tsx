// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// -- Icon Imports --
import { Undo2 } from 'lucide-react';

// -- Type Imports --
import type { ToolbeltAction } from '@/lib/types/toolbelt';

/*
 * The FAB ring's close-after-run contract, the twin of the bottom sheet's: a tapped action closes the ring
 * unless it opts out with `keepOpen`. Both modes must agree, so a keepOpen action that still closes in one is
 * the bug this pins against.
 */

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/stores/appSettingsStore', () => ({
   useAppSettingsStore: (selector: (state: { mobileHandedness: string }) => unknown) =>
      selector({ mobileHandedness: 'right' }),
}));
vi.mock('@/hooks/mobile/useWindowHeight', () => ({ useWindowHeight: () => 800 }));
vi.mock('@/lib/utils/mobileFloating', () => ({ getFloatingBottom: () => 0 }));

import ToolbeltFAB from './ToolbeltFAB';

const action = (overrides: Partial<ToolbeltAction>): ToolbeltAction => ({
   id: 'action',
   label: 'action',
   icon: Undo2,
   onClick: vi.fn(),
   group: 'edit',
   show: true,
   ...overrides,
});

const tile = (name: string) => screen.getByRole('button', { name });

afterEach(cleanup);

describe('toolbelt FAB close-after-run', () => {
   it('closes the ring after a normal action', () => {
      const onOpenChange = vi.fn();
      const normal = action({ id: 'normal', label: 'Normal' });

      render(<ToolbeltFAB isOpen onOpenChange={onOpenChange} itemActions={[]} globalActions={[normal]} />);
      fireEvent.click(tile('Normal'));

      expect(onOpenChange).toHaveBeenCalledWith(false);
   });

   it('leaves the ring open after a keepOpen action', () => {
      const onOpenChange = vi.fn();
      const onClick = vi.fn();
      const keep = action({ id: 'keep', label: 'Keep', onClick, keepOpen: true });

      render(<ToolbeltFAB isOpen onOpenChange={onOpenChange} itemActions={[]} globalActions={[keep]} />);
      fireEvent.click(tile('Keep'));

      expect(onClick).toHaveBeenCalledOnce();
      expect(onOpenChange).not.toHaveBeenCalled();
   });
});
