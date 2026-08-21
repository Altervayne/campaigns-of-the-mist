// -- Library Imports --
import { beforeEach, describe, expect, it } from 'vitest';

// -- Local Imports --
import { drawerDatabase } from '@/lib/drawer/drawerDatabase';
import * as repository from './stencilRepository';

/*
 * Unit tests for the stencil-library repository against fake-indexeddb. Covers add
 * (id mint + appended order + timestamps), order-sorted listing, rename (updatedAt bump),
 * delete, reorder, and independent entries sharing one mask asset (content-addressed dedup).
 * A stencil is plain metadata, so no canvas/blob machinery is needed here.
 */

beforeEach(async () => {
   await drawerDatabase.stencils.clear();
});

describe('stencil repository', () => {
   it('adds a stencil with a minted id, order 0, and matching created/updated timestamps', async () => {
      const record = await repository.addStencil('Torn Edge', 'mask-a');

      expect(typeof record.id).toBe('string');
      expect(record.id.length).toBeGreaterThan(0);
      expect(record.name).toBe('Torn Edge');
      expect(record.maskAssetId).toBe('mask-a');
      expect(record.order).toBe(0);
      expect(typeof record.createdAt).toBe('number');
      expect(record.updatedAt).toBe(record.createdAt);
   });

   it('appends each new stencil after the current maximum order', async () => {
      const first = await repository.addStencil('A', 'mask-a');
      const second = await repository.addStencil('B', 'mask-b');
      const third = await repository.addStencil('C', 'mask-c');

      expect(first.order).toBe(0);
      expect(second.order).toBe(1);
      expect(third.order).toBe(2);
   });

   it('lists stencils sorted by order ascending', async () => {
      const a = await repository.addStencil('A', 'mask-a');
      const b = await repository.addStencil('B', 'mask-b');
      const c = await repository.addStencil('C', 'mask-c');
      // Scramble the stored order, then confirm the list re-sorts.
      await repository.reorderStencils([c.id, a.id, b.id]);

      const listed = await repository.listStencils();

      expect(listed.map((entry) => entry.id)).toEqual([c.id, a.id, b.id]);
      expect(listed.map((entry) => entry.order)).toEqual([0, 1, 2]);
   });

   it('renames a stencil and bumps updatedAt without touching createdAt', async () => {
      const record = await repository.addStencil('Old Name', 'mask-a');
      await new Promise((resolve) => setTimeout(resolve, 3)); // would-be-later timestamp

      await repository.renameStencil(record.id, 'New Name');

      const [updated] = await repository.listStencils();
      expect(updated.name).toBe('New Name');
      expect(updated.createdAt).toBe(record.createdAt);
      expect(updated.updatedAt).toBeGreaterThan(record.updatedAt);
   });

   it('deletes a stencil and is idempotent for an absent id', async () => {
      const record = await repository.addStencil('A', 'mask-a');

      await repository.deleteStencil(record.id);
      expect(await repository.listStencils()).toEqual([]);

      await repository.deleteStencil(record.id); // already gone -> no throw
   });

   it('reorders stencils by rewriting order to the given sequence', async () => {
      const a = await repository.addStencil('A', 'mask-a');
      const b = await repository.addStencil('B', 'mask-b');
      const c = await repository.addStencil('C', 'mask-c');

      await repository.reorderStencils([b.id, c.id, a.id]);

      const byId = new Map((await repository.listStencils()).map((entry) => [entry.id, entry.order]));
      expect(byId.get(b.id)).toBe(0);
      expect(byId.get(c.id)).toBe(1);
      expect(byId.get(a.id)).toBe(2);
   });

   it('clears every stencil row', async () => {
      await repository.addStencil('A', 'mask-a');
      await repository.addStencil('B', 'mask-b');

      await repository.clearAllStencils();

      expect(await repository.listStencils()).toEqual([]);
   });

   it('lets two stencils share one mask asset as independent entries', async () => {
      const first = await repository.addStencil('First', 'mask-shared');
      const second = await repository.addStencil('Second', 'mask-shared');

      expect(first.id).not.toBe(second.id);
      expect(first.maskAssetId).toBe('mask-shared');
      expect(second.maskAssetId).toBe('mask-shared');

      // Deleting one leaves the other (and its shared mask reference) intact.
      await repository.deleteStencil(first.id);
      const remaining = await repository.listStencils();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(second.id);
      expect(remaining[0].maskAssetId).toBe('mask-shared');
   });
});
