// -- Other Library Imports --
import { create } from 'zustand';

// -- Stencil Data Layer Imports --
import { addStencil, deleteStencil, listStencils, renameStencil, reorderStencils } from '@/lib/assets/stencilRepository';

// -- Type Imports --
import type { StencilRecord } from '@/lib/assets/stencilRecords';

/*
 * The React-facing, in-memory view of the user's stencil library, fronting the Dexie
 * `stencilRepository`. A module-level singleton (one global library, unlike the per-board
 * board store), it holds the order-sorted list plus a loaded flag. The repository stays the
 * sole writer of `db.stencils`: each action calls it, then re-reads the list so the in-memory
 * view always matches persisted truth (the drawer store's mutate-then-reload discipline).
 */

export interface StencilLibraryState {
   /** Every stencil, order-sorted (the manager's display order). */
   stencils: StencilRecord[];
   /** True once the first load has settled; gates the idempotent first-use load. */
   loaded: boolean;
   /** True while a load is in flight. */
   isLoading: boolean;
   actions: {
      /** Reads the library into memory once; a no-op after the first successful load or while one runs. */
      load: () => Promise<void>;
      /** Adds a stencil owning `maskAssetId`, reconciles the list, and returns the new record. */
      add: (name: string, maskAssetId: string) => Promise<StencilRecord>;
      /** Renames a stencil, then reconciles the list. */
      rename: (id: string, name: string) => Promise<void>;
      /** Deletes a stencil, then reconciles the list. */
      remove: (id: string) => Promise<void>;
      /** Rewrites the manual order to `orderedIds`, then reconciles the list. */
      reorder: (orderedIds: string[]) => Promise<void>;
   };
}

export const useStencilLibraryStore = create<StencilLibraryState>()((set, get) => {
   /** Re-reads the repository into the in-memory list, so the view matches persisted truth. */
   const reconcile = async (): Promise<void> => {
      set({ stencils: await listStencils() });
   };

   return {
      stencils: [],
      loaded: false,
      isLoading: false,
      actions: {
         load: async () => {
            if (get().loaded || get().isLoading) return;
            set({ isLoading: true });
            try {
               set({ stencils: await listStencils(), loaded: true });
            } finally {
               set({ isLoading: false });
            }
         },
         add: async (name, maskAssetId) => {
            const record = await addStencil(name, maskAssetId);
            await reconcile();
            return record;
         },
         rename: async (id, name) => {
            await renameStencil(id, name);
            await reconcile();
         },
         remove: async (id) => {
            await deleteStencil(id);
            await reconcile();
         },
         reorder: async (orderedIds) => {
            await reorderStencils(orderedIds);
            await reconcile();
         },
      },
   };
});
