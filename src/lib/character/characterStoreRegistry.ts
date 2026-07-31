// -- Store Imports --
import { createCharacterStore } from '@/lib/stores/characterStore';

// -- Local Imports --
import { isDemoId } from '@/lib/tutorial/demo/demoSentinels';

// -- Type Imports --
import type { CharacterStore } from '@/lib/stores/characterStore';

/*
 * Module-level registry of character store instances, keyed by character id. Each
 * entry is a fully isolated `createCharacterStore()` with its own state and its own
 * zundo undo stack, so N tabs give N independent undo stacks with no shared mutable
 * state.
 *
 * Non-React callers (persistence, the undo-router keydown handler) reach the active
 * instance through `getActiveCharacterStore()`; React callers resolve it through
 * `ActiveCharacterStoreContext`. This is NOT a React module, it holds no JSX and
 * no hooks, only the instance map and the active-id pointer.
 */

/**
 * The fixed key of the permanent **menu fallback** instance. Real characters are
 * keyed by their own id; this dedicated instance keeps `character` null and is active
 * whenever no character tab is open, so the root provider always has a non-null store
 * to supply (the menu shell resolves to it). Characters are never loaded into it.
 */
export const SINGLE_ACTIVE_INSTANCE_ID = '__single-active__';

/** characterId -> store instance. Distinct instances are fully isolated. */
const registry = new Map<string, CharacterStore>();

/** The id of the instance `getActiveCharacterStore()` resolves to, or `null` when none is active. */
let activeInstanceId: string | null = null;

/**
 * Returns the instance for `id`, creating and registering it on first request.
 * Idempotent: the same id always yields the same instance (so a StrictMode double
 * invocation cannot create two stores for one character).
 *
 * @param id - The character id (or the menu-fallback sentinel) keying the instance.
 * @returns The existing or freshly created store instance.
 */
export function getOrCreateInstance(id: string): CharacterStore {
   const existing = registry.get(id);
   if (existing) return existing;

   const instance = createCharacterStore();
   registry.set(id, instance);
   return instance;
}

/**
 * Returns the already-registered instance for `id`, or `undefined` when none exists.
 * Never creates one, so a caller can inspect a tab's liveness without materializing an
 * empty instance (which would otherwise register as a live character).
 *
 * @param id - The id to look up.
 * @returns The instance, or `undefined` when the id is not registered.
 */
export function peekInstance(id: string): CharacterStore | undefined {
   return registry.get(id);
}

/**
 * The currently active store instance, or `null` when none is active. The accessor
 * for non-React callers; it never creates an instance, so callers must tolerate
 * `null` (the menu fallback is ensured at startup, so it is non-null in normal flow).
 */
export function getActiveCharacterStore(): CharacterStore | null {
   if (activeInstanceId === null) return null;
   return registry.get(activeInstanceId) ?? null;
}

/**
 * Points the active accessor and context at the instance for `id`. The instance
 * must already exist (via {@link getOrCreateInstance}); pointing at an unknown id
 * makes {@link getActiveCharacterStore} return `null`.
 *
 * @param id - The id to activate.
 */
export function setActiveInstance(id: string): void {
   activeInstanceId = id;
}

/**
 * Drops the instance for `id` from the registry, clearing the active pointer if it
 * referenced that id. Idempotent. (The persistence handle is flushed and detached by
 * the caller before disposing.)
 *
 * @param id - The id to dispose.
 */
export function disposeInstance(id: string): void {
   registry.delete(id);
   if (activeInstanceId === id) {
      activeInstanceId = null;
   }
}

/**
 * Lists the ids of all live character instances, EXCLUDING the permanent menu
 * fallback and any tutorial demo instance. Backs the mobile single-live invariant
 * (dispose every character instance but the menu fallback before opening the next);
 * the demo sentinel is filtered so no per-instance consumer ever touches ephemeral
 * demo content.
 *
 * @returns The character instance ids currently held in the registry.
 */
export function getCharacterInstanceIds(): string[] {
   return [...registry.keys()].filter((id) => id !== SINGLE_ACTIVE_INSTANCE_ID && !isDemoId(id));
}

/**
 * Returns the permanent menu fallback instance, creating it on first request.
 * Idempotent and side-effect-free with respect to the active pointer, so the root
 * provider can call it during render to resolve the zero-character state without
 * repointing `activeInstance`.
 *
 * @returns The menu fallback store instance.
 */
export function getMenuFallbackInstance(): CharacterStore {
   return getOrCreateInstance(SINGLE_ACTIVE_INSTANCE_ID);
}

/**
 * Ensures the menu fallback instance exists and, if nothing is active yet, makes it
 * the active instance. Idempotent. Called once at startup so `getActiveCharacterStore()`
 * is non-null before any character tab opens; a subsequent character open repoints
 * the active instance to that character's id.
 *
 * @returns The menu fallback store instance.
 */
export function ensureMenuFallbackInstance(): CharacterStore {
   const instance = getMenuFallbackInstance();
   if (activeInstanceId === null) {
      setActiveInstance(SINGLE_ACTIVE_INSTANCE_ID);
   }
   return instance;
}
