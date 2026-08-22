// @vitest-environment jsdom

// -- Library Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

/*
 * Locks the coarse-pointer gate: a fine pointer mounts the real canvas, a coarse pointer swaps in the static
 * touch notice instead. The gate reads the detected pointer, so the mocks below drive `isCoarse` directly
 * rather than relying on jsdom matchMedia.
 */

// Echo the i18n key instead of standing up a provider - only the notice's labels are read here.
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

// A non-null board instance, so the gate is reached (a null instance renders nothing regardless of pointer).
vi.mock('@/lib/board/ActiveBoardStoreContext', () => ({ useActiveBoardInstance: () => ({}) }));

// Stub the heavy canvas to a sentinel: the test asserts the branch, not the canvas machinery.
vi.mock('./BoardCanvas', () => ({ BoardCanvas: () => <div data-testid="board-canvas" /> }));

const breakpoint = { isCoarse: false };
vi.mock('@/hooks/useAdaptive', () => ({ useBreakpoint: () => breakpoint }));

import { BoardView } from './BoardView';

afterEach(cleanup);

describe('BoardView coarse-pointer gate', () => {
   it('mounts the canvas on a fine pointer', () => {
      breakpoint.isCoarse = false;
      const { queryByTestId, queryByText } = render(<BoardView />);
      expect(queryByTestId('board-canvas')).not.toBeNull();
      expect(queryByText('BoardView.touchNoticeTitle')).toBeNull();
   });

   it('swaps in the touch notice on a coarse pointer', () => {
      breakpoint.isCoarse = true;
      const { queryByTestId, queryByText } = render(<BoardView />);
      expect(queryByTestId('board-canvas')).toBeNull();
      expect(queryByText('BoardView.touchNoticeTitle')).not.toBeNull();
   });
});
