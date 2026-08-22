// -- React Imports --
import { createContext, useContext } from 'react';

// -- Hook Imports --
import { useToolbarHover, type ToolbarHoverHandlers } from '@/hooks/useToolbarHover';

/*
 * Reveal coordination for a sheet card/tracker's grab toolbar. On a fine pointer the toolbar
 * still reveals purely on hover (unchanged). On a coarse pointer there is no hover, so a single
 * active card - set by tap - drives the reveal instead: tapping a card selects it, tapping another
 * moves the selection, tapping outside every card dismisses. Only one card is active at a time.
 *
 * The active card is coordinated through this context, tracked by `SheetToolbarRevealProvider` off a
 * document pointerdown keyed by the `data-toolbar-reveal-id` a coarse card stamps on its root. Kept in
 * a `.ts` split from the provider so the provider stays a `.tsx` without tripping
 * `react-refresh/only-export-components`.
 */

export interface ToolbarRevealContextValue {
   /** The single active card's id on a coarse pointer; null when nothing is selected or on a fine pointer. */
   activeId: string | null;
   /** Whether the current pointer is coarse (touch), gating tap-reveal vs hover-reveal. */
   isCoarse: boolean;
}

export const ToolbarRevealContext = createContext<ToolbarRevealContextValue>({ activeId: null, isCoarse: false });

/**
 * Props a card spreads on its root to drive the toolbar reveal. On a fine pointer these are the
 * Framer hover handlers; on a coarse pointer they are the `data-toolbar-reveal-id` marker the
 * provider reads (and the hover handlers are intentionally absent, so an emulated-hover tap can't
 * also drive the state).
 */
export interface ToolbarRevealHandlers extends Partial<ToolbarHoverHandlers> {
   'data-toolbar-reveal-id'?: string;
}

export interface UseToolbarRevealReturn {
   /** Whether the grab toolbar should be shown for this card. */
   isRevealed: boolean;
   /** Handlers/markers to spread on the card's root element. */
   revealHandlers: ToolbarRevealHandlers;
}

/**
 * Reveal state for one sheet card/tracker's grab toolbar, keyed by a stable per-card id. Fine pointer:
 * hover reveal, identical to `useToolbarHover`. Coarse pointer: revealed while this card is the single
 * active one. `isDisabled` (drawer preview) keeps it inert on both, matching the old hover behavior.
 */
export function useToolbarReveal(id: string, isDisabled = false): UseToolbarRevealReturn {
   const { isHovered, hoverHandlers } = useToolbarHover(isDisabled);
   const { activeId, isCoarse } = useContext(ToolbarRevealContext);

   if (isCoarse && !isDisabled) {
      return {
         isRevealed: activeId === id,
         revealHandlers: { 'data-toolbar-reveal-id': id },
      };
   }

   return { isRevealed: isHovered, revealHandlers: hoverHandlers };
}
