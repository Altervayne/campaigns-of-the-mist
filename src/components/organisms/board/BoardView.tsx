// -- Component Imports --
import { BoardCanvas } from './BoardCanvas';

// -- Store Imports --
import { useActiveBoardInstance } from '@/lib/board/ActiveBoardStoreContext';

/** The canvas; renders nothing when no board tab is active. */
export function BoardView() {
   const instance = useActiveBoardInstance();
   if (!instance) return null;
   return <BoardCanvas store={instance} />;
}
