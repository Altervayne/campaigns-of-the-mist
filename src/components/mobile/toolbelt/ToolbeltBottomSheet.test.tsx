// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// -- Icon Imports --
import { Undo2 } from 'lucide-react';

// -- Type Imports --
import type { ToolbeltAction } from '@/lib/types/toolbelt';

/*
 * The bottom-sheet's close-after-run contract: a tile runs its action and closes the sheet, unless the
 * action opts out with `keepOpen` (undo/redo, run repeatedly in a row). Pinned here so the flag can't be
 * dropped in this renderer while surviving in the FAB one.
 */

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import ToolbeltBottomSheet from './ToolbeltBottomSheet';

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

describe('toolbelt bottom sheet close-after-run', () => {
   it('closes the sheet after a normal action', () => {
      const onOpenChange = vi.fn();
      const normal = action({ id: 'normal', label: 'Normal' });

      render(<ToolbeltBottomSheet isOpen onOpenChange={onOpenChange} itemActions={[]} globalActions={[normal]} />);
      fireEvent.click(tile('Normal'));

      expect(normal.onClick).toBeDefined();
      expect(onOpenChange).toHaveBeenCalledWith(false);
   });

   it('leaves the sheet open after a keepOpen action', () => {
      const onOpenChange = vi.fn();
      const onClick = vi.fn();
      const keep = action({ id: 'keep', label: 'Keep', onClick, keepOpen: true });

      render(<ToolbeltBottomSheet isOpen onOpenChange={onOpenChange} itemActions={[]} globalActions={[keep]} />);
      fireEvent.click(tile('Keep'));

      expect(onClick).toHaveBeenCalledOnce();
      expect(onOpenChange).not.toHaveBeenCalled();
   });
});
