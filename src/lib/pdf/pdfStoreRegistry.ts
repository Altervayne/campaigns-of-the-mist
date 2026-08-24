// -- Store Imports --
import { createPdfStore } from '@/lib/stores/pdfStore';

// -- Type Imports --
import type { PdfStore } from '@/lib/stores/pdfStore';

/*
 * Module-level registry of pdf store instances, keyed by pdf id. Each entry is a fully isolated
 * `createPdfStore()`, so N pdf tabs read N independent documents with no shared state. Mirrors the
 * board/note registries: no menu fallback (a PDF shows only when its tab is active) and no
 * persistence handle (a PDF is read-only, nothing is written back).
 *
 * Unlike a note/board instance, a pdf instance owns a NATIVE resource (the pdf.js document + its
 * worker transport). `disposePdfInstance` therefore tears that down through the instance's own
 * `dispose` action BEFORE dropping the map entry, so every dispose path (closeTab, future eviction)
 * frees the worker document. This is NOT a React module - no JSX, no hooks.
 */

/** pdfId -> store instance. Distinct instances are fully isolated. */
const registry = new Map<string, PdfStore>();

/** The id of the instance `getActivePdfStore()` resolves to, or `null` when no pdf tab is active. */
let activePdfId: string | null = null;

/**
 * Returns the instance for `id`, creating and registering it on first request.
 * Idempotent: the same id always yields the same instance (so a StrictMode double
 * invocation cannot create two stores for one pdf).
 */
export function getOrCreatePdfInstance(id: string): PdfStore {
   const existing = registry.get(id);
   if (existing) return existing;

   const instance = createPdfStore();
   registry.set(id, instance);
   return instance;
}

/**
 * The instance for `id`, or `undefined` when the id is not registered. Never creates one, so a caller
 * can inspect a tab's liveness without materializing an empty instance.
 */
export function peekPdfInstance(id: string): PdfStore | undefined {
   return registry.get(id);
}

/**
 * The currently active pdf store instance, or `null` when no pdf tab is active
 * (a character/board/note tab or the menu). Never creates an instance.
 */
export function getActivePdfStore(): PdfStore | null {
   if (activePdfId === null) return null;
   return registry.get(activePdfId) ?? null;
}

/**
 * Points the active accessor and context at the pdf for `id`, or clears it with `null`.
 * Pointing at an unknown id makes {@link getActivePdfStore} return `null`.
 */
export function setActivePdfInstance(id: string | null): void {
   activePdfId = id;
}

/**
 * Disposes the instance for `id`: tears down its pdf.js document (frees the worker transport) via the
 * store's `dispose` action, then drops the map entry and clears the active pointer if it referenced
 * that id. Idempotent.
 */
export function disposePdfInstance(id: string): void {
   registry.get(id)?.getState().actions.dispose();
   registry.delete(id);
   if (activePdfId === id) {
      activePdfId = null;
   }
}

/** Lists the ids of all live pdf instances. */
export function getPdfInstanceIds(): string[] {
   return [...registry.keys()];
}
