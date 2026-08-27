// -- Utils Imports --
import { cn } from '@/lib/utils';
import { getGameVisual } from '@/lib/constants/gameVisuals';

// -- Type Imports --
import type { GameSystem } from '@/lib/types/drawer';

/**
 * Solid game-identity badge: the game's brand color (from `gameVisuals`) filled behind a white glyph, the same
 * treatment the type badge uses, so a game reads at a glance. NEUTRAL items carry no game and render nothing.
 * Size defaults to the meta-row badge; a caller can override it via `className`.
 */
export function GameBadge({ game, className }: { game: GameSystem; className?: string }) {
   if (game === 'NEUTRAL') return null;
   const { Icon, solidBg } = getGameVisual(game);
   return (
      <span className={cn('flex size-5 shrink-0 items-center justify-center rounded text-white', solidBg, className)}>
         <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
   );
}
