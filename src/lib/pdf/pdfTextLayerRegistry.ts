// -- Type Imports --
import type { PDFDocumentProxy } from 'pdfjs-dist';

/*
 * A registry of the rendered text layers, keyed by document then 1-based page, so the search overlay can
 * reach a page's live spans and paint match highlights over the exact glyph rects. It holds only DOM handles
 * (no pdf.js import, so `pdf-vendor` stays deferred). A page's entry auto-GCs with its document proxy; within
 * a document the slot is dropped once no handle and no subscriber remain. Mirrors the text-content cache.
 */

/** A page's rendered text layer: its per-item spans and the strings they carry, in text-item order. */
export interface TextLayerHandle {
   textDivs: HTMLElement[];
   itemsStr: string[];
}

interface PageSlot {
   handle: TextLayerHandle | null;
   subscribers: Set<() => void>;
}

const registry = new WeakMap<PDFDocumentProxy, Map<number, PageSlot>>();

function ensureSlot(proxy: PDFDocumentProxy, page: number): PageSlot {
   let pages = registry.get(proxy);
   if (!pages) {
      pages = new Map();
      registry.set(proxy, pages);
   }
   let slot = pages.get(page);
   if (!slot) {
      slot = { handle: null, subscribers: new Set() };
      pages.set(page, slot);
   }
   return slot;
}

/** Drops an empty slot (no handle, no subscribers) so a closed document leaves nothing behind. */
function pruneSlot(proxy: PDFDocumentProxy, page: number, slot: PageSlot): void {
   if (slot.handle || slot.subscribers.size > 0) return;
   registry.get(proxy)?.delete(page);
}

/** Publishes a page's rendered text layer and notifies its subscribers so they can recompute against it. */
export function registerTextLayer(proxy: PDFDocumentProxy, page: number, handle: TextLayerHandle): void {
   const slot = ensureSlot(proxy, page);
   slot.handle = handle;
   for (const cb of slot.subscribers) cb();
}

/** Retracts a page's text layer, but only if it's still the one registered - a stale unmount can't wipe a newer render. */
export function unregisterTextLayer(proxy: PDFDocumentProxy, page: number, handle: TextLayerHandle): void {
   const slot = registry.get(proxy)?.get(page);
   if (!slot || slot.handle !== handle) return;
   slot.handle = null;
   for (const cb of slot.subscribers) cb();
   pruneSlot(proxy, page, slot);
}

/** The page's rendered text layer, or null if none is currently mounted. */
export function getTextLayerHandle(proxy: PDFDocumentProxy, page: number): TextLayerHandle | null {
   return registry.get(proxy)?.get(page)?.handle ?? null;
}

/** Subscribes to a page's text-layer register/unregister; returns an unsubscribe. Fires on every (re-)render. */
export function subscribeTextLayer(proxy: PDFDocumentProxy, page: number, cb: () => void): () => void {
   const slot = ensureSlot(proxy, page);
   slot.subscribers.add(cb);
   return () => {
      slot.subscribers.delete(cb);
      pruneSlot(proxy, page, slot);
   };
}
