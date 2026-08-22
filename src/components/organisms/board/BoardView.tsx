// -- Hook Imports --
import { useBreakpoint } from '@/hooks/useAdaptive';

// -- Component Imports --
import { BoardCanvas } from './BoardCanvas';
import { BoardTouchNotice } from './BoardTouchNotice';

// -- Store Imports --
import { useActiveBoardInstance } from '@/lib/board/ActiveBoardStoreContext';

/**
 * The canvas; renders nothing when no board tab is active. On a coarse pointer the pointer-dependent canvas
 * is swapped for a static notice, so none of its wheel/keydown/pointer machinery mounts on touch. The tab
 * stays open either way. Gated on the detected pointer, not the form factor, so a hybrid tablet with a
 * trackpad still gets the real board.
 */
export function BoardView() {
   const instance = useActiveBoardInstance();
   const { isCoarse } = useBreakpoint();
   if (!instance) return null;
   if (isCoarse) return <BoardTouchNotice />;
   return <BoardCanvas store={instance} />;
}
