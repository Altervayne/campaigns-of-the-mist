// -- Store Imports --
import { createNoteStore } from '@/lib/stores/noteStore';

// -- Type Imports --
import type { NoteStore } from '@/lib/stores/noteStore';

/*
 * Module-level registry of note store instances, keyed by note id. Each entry is a fully
 * isolated `createNoteStore()`, so N note tabs edit N independent documents with no shared
 * mutable state. Mirrors the board registry: no menu fallback (a note shows only when its
 * tab is active) and no persistence handle (the note store debounce-saves onto its row).
 * Non-React callers reach the active instance through `getActiveNoteStore()`; React callers
 * resolve it through `ActiveNoteStoreContext`. This is NOT a React module - no JSX, no hooks.
 */

/** noteId -> store instance. Distinct instances are fully isolated. */
const registry = new Map<string, NoteStore>();

/** The id of the instance `getActiveNoteStore()` resolves to, or `null` when no note tab is active. */
let activeNoteId: string | null = null;

/**
 * Returns the instance for `id`, creating and registering it on first request.
 * Idempotent: the same id always yields the same instance (so a StrictMode double
 * invocation cannot create two stores for one note).
 */
export function getOrCreateNoteInstance(id: string): NoteStore {
   const existing = registry.get(id);
   if (existing) return existing;

   const instance = createNoteStore();
   registry.set(id, instance);
   return instance;
}

/**
 * The currently active note store instance, or `null` when no note tab is active
 * (e.g. a character/board tab or the menu). Never creates an instance.
 */
export function getActiveNoteStore(): NoteStore | null {
   if (activeNoteId === null) return null;
   return registry.get(activeNoteId) ?? null;
}

/**
 * Points the active accessor and context at the note for `id`, or clears it with `null`.
 * Pointing at an unknown id makes {@link getActiveNoteStore} return `null`.
 */
export function setActiveNoteInstance(id: string | null): void {
   activeNoteId = id;
}

/** Drops the instance for `id` from the registry, clearing the active pointer if it referenced that id. Idempotent. */
export function disposeNoteInstance(id: string): void {
   registry.delete(id);
   if (activeNoteId === id) {
      activeNoteId = null;
   }
}

/** Lists the ids of all live note instances. */
export function getNoteInstanceIds(): string[] {
   return [...registry.keys()];
}
