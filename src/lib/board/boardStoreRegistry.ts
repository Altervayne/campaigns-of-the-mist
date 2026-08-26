// -- Store Imports --
import { createBoardStore } from '@/lib/stores/boardStore';

// -- Local Imports --
import { isDemoId } from '@/lib/tutorial/demo/demoSentinels';

// -- Type Imports --
import type { BoardStore } from '@/lib/stores/boardStore';

/*
 * Module-level registry of board store instances, keyed by board id. Each entry is a
 * fully isolated `createBoardStore()` with its own command engine and undo stack, so N
 * board tabs give N independent undo stacks with no shared mutable state.
 *
 * Simpler than the character registry: there is no menu fallback (a board is shown
 * only when its tab is active) and no persistence handle (board item mutations persist
 * via commands; the viewport debounce-saves inside the store). Non-React callers reach
 * the active instance through `getActiveBoardStore()`; React callers resolve it through
 * `ActiveBoardStoreContext`. This is NOT a React module - no JSX, no hooks.
 */

/** boardId -> store instance. Distinct instances are fully isolated. */
const registry = new Map<string, BoardStore>();

/** The id of the instance `getActiveBoardStore()` resolves to, or `null` when no board tab is active. */
let activeBoardId: string | null = null;

/**
 * Returns the instance for `id`, creating and registering it on first request.
 * Idempotent: the same id always yields the same instance (so a StrictMode double
 * invocation cannot create two stores for one board).
 */
export function getOrCreateBoardInstance(id: string): BoardStore {
   const existing = registry.get(id);
   if (existing) return existing;

   const instance = createBoardStore();
   registry.set(id, instance);
   return instance;
}

/**
 * The instance for `id`, or `undefined` when the id is not registered. Never creates one, so a caller can
 * inspect a board's liveness (open vs closed) without materializing an empty instance.
 */
export function peekBoardInstance(id: string): BoardStore | undefined {
   return registry.get(id);
}

/**
 * The currently active board store instance, or `null` when no board tab is active
 * (e.g. a character tab or the menu). Never creates an instance.
 */
export function getActiveBoardStore(): BoardStore | null {
   if (activeBoardId === null) return null;
   return registry.get(activeBoardId) ?? null;
}

/**
 * Points the active accessor and context at the board for `id`, or clears it with
 * `null`. Pointing at an unknown id makes {@link getActiveBoardStore} return `null`.
 */
export function setActiveBoardInstance(id: string | null): void {
   activeBoardId = id;
}

/** Drops the instance for `id` from the registry, clearing the active pointer if it referenced that id. Idempotent. */
export function disposeBoardInstance(id: string): void {
   registry.delete(id);
   if (activeBoardId === id) {
      activeBoardId = null;
   }
}

/**
 * Lists the ids of all live board instances, EXCLUDING any tutorial demo board. The demo sentinel is
 * filtered so no per-instance consumer ever reaches ephemeral demo content (mirrors the character lister).
 */
export function getBoardInstanceIds(): string[] {
   return [...registry.keys()].filter((id) => !isDemoId(id));
}
