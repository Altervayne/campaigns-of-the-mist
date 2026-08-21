// -- Library Imports --
import { beforeEach, describe, expect, it } from 'vitest';

// -- Local Imports --
import { drawerDatabase } from '@/lib/drawer/drawerDatabase';
import * as repository from '@/lib/assets/stencilRepository';
import { useStencilLibraryStore } from './stencilLibraryStore';

/*
 * Tests for the reactive stencil-library store against fake-indexeddb: load hydrates from
 * the repo (and is idempotent), and add/rename/remove/reorder each reconcile the in-memory
 * list against persisted truth. The repository stays the sole writer of `db.stencils`.
 */

beforeEach(async () => {
   await drawerDatabase.stencils.clear();
   useStencilLibraryStore.setState({ stencils: [], loaded: false, isLoading: false });
});

/** The store's actions, fetched fresh each call (the object is stable across renders). */
const actions = () => useStencilLibraryStore.getState().actions;

describe('stencil library store', () => {
   it('loads the order-sorted list and marks itself loaded', async () => {
      const a = await repository.addStencil('A', 'mask-a');
      const b = await repository.addStencil('B', 'mask-b');

      await actions().load();

      const state = useStencilLibraryStore.getState();
      expect(state.loaded).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.stencils.map((entry) => entry.id)).toEqual([a.id, b.id]);
   });

   it('does not re-read after the first successful load', async () => {
      await actions().load();
      // A row added straight through the repo bypasses the store; a second load must NOT pick it up.
      await repository.addStencil('Late', 'mask-late');

      await actions().load();

      expect(useStencilLibraryStore.getState().stencils).toHaveLength(0);
   });

   it('adds a stencil, returns the new record, and appends it to the list', async () => {
      await actions().load();

      const record = await actions().add('Torn Edge', 'mask-a');

      expect(record.maskAssetId).toBe('mask-a');
      const { stencils } = useStencilLibraryStore.getState();
      expect(stencils.map((entry) => entry.id)).toEqual([record.id]);
      expect(stencils[0].name).toBe('Torn Edge');
   });

   it('renames a stencil and reconciles the list', async () => {
      const record = await actions().add('Old Name', 'mask-a');

      await actions().rename(record.id, 'New Name');

      expect(useStencilLibraryStore.getState().stencils[0].name).toBe('New Name');
   });

   it('removes a stencil and reconciles the list', async () => {
      const first = await actions().add('First', 'mask-a');
      const second = await actions().add('Second', 'mask-b');

      await actions().remove(first.id);

      const { stencils } = useStencilLibraryStore.getState();
      expect(stencils.map((entry) => entry.id)).toEqual([second.id]);
   });

   it('reorders stencils and reconciles the list', async () => {
      const a = await actions().add('A', 'mask-a');
      const b = await actions().add('B', 'mask-b');
      const c = await actions().add('C', 'mask-c');

      await actions().reorder([c.id, a.id, b.id]);

      expect(useStencilLibraryStore.getState().stencils.map((entry) => entry.id)).toEqual([c.id, a.id, b.id]);
   });
});
