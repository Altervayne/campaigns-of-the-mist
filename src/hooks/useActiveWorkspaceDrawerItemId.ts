// -- React Imports --
import { useSyncExternalStore } from 'react';

// -- Store Imports --
import { useCharacterStore } from '@/lib/stores/characterStore';

/*
 * The saved drawer item id of the ACTIVE workspace (note / pdf / board / character), or null when it is
 * unsaved or nothing is open. Lets ONE sidebar Find-in-Drawer affordance serve every workspace kind instead
 * of a per-chrome button. Character is the app-global store; note / pdf / board are per-instance, so their
 * currently-active stores are passed in from the workspace contexts. Exactly one instance store is mounted
 * at a time, so the active kind is read from presence in resolveActiveWindow's pdf > note > board > character
 * priority - no separate active-window input, so this stays callable before the page's early returns. Reads
 * are reactive, so the affordance appears the moment a workspace is first saved.
 */

/** The minimal shape read here: every workspace instance store carries `drawerItemId` at the top of its state. */
interface DrawerIdStore {
   getState(): { drawerItemId: string | null };
   subscribe(listener: () => void): () => void;
}

const EMPTY_SUBSCRIBE = () => () => {};

/** Reactively reads `drawerItemId` off a possibly-null instance store; null-safe so the hook stays unconditional. */
function useInstanceDrawerId(store: DrawerIdStore | null): string | null {
   return useSyncExternalStore(
      store ? store.subscribe : EMPTY_SUBSCRIBE,
      store ? () => store.getState().drawerItemId : () => null,
   );
}

interface ActiveWorkspaceStores {
   note: DrawerIdStore | null;
   pdf: DrawerIdStore | null;
   board: DrawerIdStore | null;
}

export function useActiveWorkspaceDrawerItemId({ note, pdf, board }: ActiveWorkspaceStores): string | null {
   const characterDrawerId = useCharacterStore((state) => state.character?.drawerItemId ?? null);
   const hasCharacter = useCharacterStore((state) => state.character != null);
   const noteDrawerId = useInstanceDrawerId(note);
   const pdfDrawerId = useInstanceDrawerId(pdf);
   const boardDrawerId = useInstanceDrawerId(board);

   // The active kind is whichever instance store is mounted (pdf > note > board), else a loaded character.
   if (pdf) return pdfDrawerId;
   if (note) return noteDrawerId;
   if (board) return boardDrawerId;
   if (hasCharacter) return characterDrawerId;
   return null;
}
