// -- Library Imports --
import cuid from 'cuid';

// -- Local Imports --
import { drawerDatabase as db } from '@/lib/drawer/drawerDatabase';

// -- Type Imports --
import type { StencilRecord } from './stencilRecords';

/*
 * Framework-agnostic data-access layer for the user stencil library. Pure persistence:
 * no React, no zustand, no toasts, no console. A stencil is plain metadata pointing at a
 * mask asset in the `assets` store; the library entry is that asset's sole reference
 * keeper (see the fifth root in `collectReferencedAssetHashes`). Nothing outside this
 * module touches `db.stencils`; the reactive store fronting it for the manager comes later.
 */

/** Lists every stencil, sorted by `order` ascending (the manager's display order). */
export function listStencils(): Promise<StencilRecord[]> {
   return db.stencils.orderBy('order').toArray();
}

/**
 * Adds a stencil owning `maskAssetId`, appended last (`order` = current max + 1, or 0 when
 * the library is empty). Mints a `cuid()` and stamps created/updated. The read of the current
 * max and the insert run in one transaction so concurrent adds cannot collide on `order`.
 */
export function addStencil(name: string, maskAssetId: string): Promise<StencilRecord> {
   return db.transaction('rw', db.stencils, async () => {
      const last = await db.stencils.orderBy('order').last();
      const now = Date.now();
      const record: StencilRecord = {
         id: cuid(),
         name,
         maskAssetId,
         order: last ? last.order + 1 : 0,
         createdAt: now,
         updatedAt: now,
      };
      await db.stencils.add(record);
      return record;
   });
}

/** Renames a stencil, bumping `updatedAt`. A no-op when the id is absent. */
export async function renameStencil(id: string, name: string): Promise<void> {
   await db.stencils.update(id, { name, updatedAt: Date.now() });
}

/** Deletes a stencil. Idempotent: deleting an absent id is a no-op. */
export async function deleteStencil(id: string): Promise<void> {
   await db.stencils.delete(id);
}

/** Rewrites each stencil's `order` to its index in `orderedIds`, in one transaction. */
export async function reorderStencils(orderedIds: string[]): Promise<void> {
   await db.transaction('rw', db.stencils, async () => {
      await Promise.all(orderedIds.map((id, index) => db.stencils.update(id, { order: index })));
   });
}

/** Deletes every stencil row (powers "Reset app"); the mask assets they kept fall to the next GC sweep. */
export async function clearAllStencils(): Promise<void> {
   await db.stencils.clear();
}
