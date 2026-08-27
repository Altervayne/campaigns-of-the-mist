// -- React Imports --
import { createContext, useContext } from 'react';

/**
 * True once the drawer's open / expand animation has settled. While a populated drawer slides in, its rich
 * previews hold as cheap shells (deferred) and fill in AFTER, so heavy content (game cards, sheet overviews,
 * markdown) never renders mid-animation and the open stays smooth. Defaults true: a preview outside the
 * animated drawer (search results, mobile, the drag overlay) is always ready.
 */
export const DrawerReadyContext = createContext(true);

export function useDrawerReady(): boolean {
   return useContext(DrawerReadyContext);
}
