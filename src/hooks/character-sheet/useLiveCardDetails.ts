// -- Store and Hook Imports --
import { useActiveCharacterInstance } from '@/lib/character/ActiveCharacterStoreContext';

// -- Type Imports --
import type { CardDetails } from '@/lib/types/character';

/**
 * Returns a getter for a card's details read from the store at CALL time rather than at render time.
 *
 * A commit that rebuilds an object from the render's `card.details` writes every sibling key back at the
 * value that render saw. Debounced fields commit after the keystroke that produced them, so their render
 * can be older than a write that already landed, and the rebuild silently reverts it. Reading live keeps
 * each patch on top of current state - `set` is synchronous, so a read after a write already sees it.
 *
 * Falls back to the render's details when the card is no longer in the store (nothing to write then).
 *
 * @param cardId - Id of the card whose details to read.
 * @param fallback - The render's details, used only when the card has vanished.
 * @returns A getter for the card's current details.
 */
export function useLiveCardDetails<T extends CardDetails>(cardId: string, fallback: T): () => T {
   const storeInstance = useActiveCharacterInstance();
   return () =>
      (storeInstance.getState().character?.cards.find((entry) => entry.id === cardId)?.details as T | undefined) ?? fallback;
}
