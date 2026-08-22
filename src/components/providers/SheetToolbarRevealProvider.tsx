// -- React Imports --
import { useEffect, useMemo, useState, type ReactNode } from 'react';

// -- Hook Imports --
import { useBreakpoint } from '@/hooks/useAdaptive';
import { ToolbarRevealContext, type ToolbarRevealContextValue } from '@/hooks/toolbarReveal';

/*
 * Coordinates the single active sheet card for tap-to-reveal on a coarse pointer. Wraps the sheet's
 * card/tracker area so every card reads the active id from context. On a coarse pointer a document
 * pointerdown resolves the pressed card (the nearest ancestor carrying `data-toolbar-reveal-id`) and
 * makes it the sole active card; a press outside every card clears the selection. On a fine pointer the
 * listener is off and reveal stays on hover. The listener never prevents or stops the event, so the same
 * tap still lands on card content (a field focuses, a button fires) and a grip drag still starts; capture
 * phase keeps it firing even when card content stops propagation.
 */

export function SheetToolbarRevealProvider({ children }: { children: ReactNode }) {
   const { isCoarse } = useBreakpoint();
   const [activeId, setActiveId] = useState<string | null>(null);

   useEffect(() => {
      // Fine pointer keeps hover reveal; no listener, nothing to track.
      if (!isCoarse) return;

      const handlePointerDown = (event: PointerEvent) => {
         const target = event.target as Element | null;
         const card = target?.closest?.('[data-toolbar-reveal-id]') ?? null;
         setActiveId(card ? card.getAttribute('data-toolbar-reveal-id') : null);
      };

      document.addEventListener('pointerdown', handlePointerDown, { capture: true });
      // Clear the selection when leaving the coarse profile, so a stale active card can't reveal on re-entry.
      return () => {
         document.removeEventListener('pointerdown', handlePointerDown, { capture: true });
         setActiveId(null);
      };
   }, [isCoarse]);

   const value = useMemo<ToolbarRevealContextValue>(() => ({ activeId, isCoarse }), [activeId, isCoarse]);

   return <ToolbarRevealContext.Provider value={value}>{children}</ToolbarRevealContext.Provider>;
}
