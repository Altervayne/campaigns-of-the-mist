// -- React Imports --
import { useMemo, type ReactNode } from 'react';

// -- Local Imports --
import { ActivePdfStoreContext } from './ActivePdfStoreContext';
import { getOrCreatePdfInstance } from './pdfStoreRegistry';
import { useTabManagerStore } from '@/lib/character/tabManagerStore';

/*
 * Provider for {@link ActivePdfStoreContext}. Kept in its own component-only file so the context
 * object and the resolving hook can live in a plain `.ts` module (mirrors the board/note providers).
 */

/**
 * Provides the ACTIVE pdf store instance to its subtree, following the TabManager's `activeTabId`:
 * the instance for the active tab when that tab is a pdf, else `null` (a character/board/note tab or
 * the menu). The value is memoized on the active id + type so its reference is stable per active pdf.
 * Inert until a pdf tab is opened.
 *
 * @param props.children - The app subtree; every pdf consumer must be inside it.
 */
export function ActivePdfStoreProvider({ children }: { children: ReactNode }) {
   const activeTabId = useTabManagerStore((state) => state.activeTabId);
   const activeTabType = useTabManagerStore(
      (state) => state.openTabs.find((tab) => tab.id === state.activeTabId)?.type ?? null,
   );

   const activeStore = useMemo(
      () => (activeTabId !== null && activeTabType === 'pdf' ? getOrCreatePdfInstance(activeTabId) : null),
      [activeTabId, activeTabType],
   );

   return <ActivePdfStoreContext.Provider value={activeStore}>{children}</ActivePdfStoreContext.Provider>;
}
