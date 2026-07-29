// -- React Imports --
import { useEffect } from 'react';
import type { RefObject } from 'react';

// -- Store and Hook Imports --
import { getActiveSheetZoom, useTabManagerActions } from '@/lib/character/tabManagerStore';

// -- Utils Imports --
import { isEditableTarget } from '@/lib/utils/textEntry';

// -- Constants --
import { DEFAULT_SHEET_ZOOM, stepSheetZoom } from '@/lib/character/sheetZoom';

/**
 * Wires the sheet-zoom gestures for a desktop character tab: Ctrl/Cmd + wheel over the
 * scroll area, and Ctrl/Cmd + `=`/`-`/`0`. The wheel listener is native and non-passive so
 * it can `preventDefault` ONLY when the modifier is held - a plain wheel still scrolls the
 * sheet. Both are no-ops unless a character tab is active.
 *
 * @param scrollRef - The sheet's scroll container (the wheel listener's host).
 * @param activeTabId - The active tab id (the zoom target), or null at the menu.
 */
export function useSheetZoomShortcuts(scrollRef: RefObject<HTMLElement | null>, activeTabId: string | null): void {
   const { setTabZoom } = useTabManagerActions();

   useEffect(() => {
      const el = scrollRef.current;
      if (!el || !activeTabId) return;
      const onWheel = (event: WheelEvent) => {
         if (!event.ctrlKey && !event.metaKey) return; // plain wheel scrolls the sheet
         event.preventDefault();
         setTabZoom(activeTabId, stepSheetZoom(getActiveSheetZoom(), event.deltaY < 0 ? 1 : -1));
      };
      el.addEventListener('wheel', onWheel, { passive: false });
      return () => el.removeEventListener('wheel', onWheel);
   }, [scrollRef, activeTabId, setTabZoom]);

   useEffect(() => {
      if (!activeTabId) return;
      const onKeyDown = (event: KeyboardEvent) => {
         if (!event.ctrlKey && !event.metaKey) return;
         // Leave text entry alone: a field's own Ctrl/Cmd combos win.
         if (isEditableTarget(event.target)) return;
         if (event.key === '=' || event.key === '+') {
            event.preventDefault();
            setTabZoom(activeTabId, stepSheetZoom(getActiveSheetZoom(), 1));
         } else if (event.key === '-' || event.key === '_') {
            event.preventDefault();
            setTabZoom(activeTabId, stepSheetZoom(getActiveSheetZoom(), -1));
         } else if (event.key === '0') {
            event.preventDefault();
            setTabZoom(activeTabId, DEFAULT_SHEET_ZOOM);
         }
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
   }, [activeTabId, setTabZoom]);
}
