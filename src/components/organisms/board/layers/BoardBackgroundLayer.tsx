// -- Lib Imports --
import { boardBackgroundStyle } from '@/lib/board/boardBackgroundStyle';

// -- Type Imports --
import type { BoardBackground } from '@/lib/types/board';

/**
 * Screen-space surface backdrop behind the grid layer: the board's fill color plus its texture overlay.
 * Inert (never tracks the world transform, never interactive) so it can't eat a pan or a click. Renders
 * nothing for an absent/empty background, leaving the plain theme canvas (today's look).
 */
export function BoardBackgroundLayer({ background }: { background: BoardBackground | undefined }) {
   if (!background || (!background.color && !background.texture)) return null;
   return <div className="pointer-events-none absolute inset-0" style={boardBackgroundStyle(background)} />;
}
