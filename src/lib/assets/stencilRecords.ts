/**
 * One row per user stencil in the `stencils` store (Dexie `version(7)`).
 *
 * A stencil is a named entry in the user's reusable mask LIBRARY. It OWNS its mask
 * asset: `maskAssetId` points at a normalized alpha-mask asset in the `assets` store
 * (produced by `normalizeMaskUpload` -> `storeAsset`), and the library entry is the
 * sole keeper that holds that asset against the garbage collector. Two entries may
 * share one `maskAssetId` (content-addressed dedup); each is deleted independently.
 *
 * `order` drives manual reorder in the library manager; `id` is a `cuid()`. Unlike an
 * `AssetRecord`, this row is plain metadata (no blob), so it carries a normal
 * created/updated pair.
 */
export interface StencilRecord {
   /** Primary key: a minted `cuid()`. */
   id: string;
   /** User-facing name. */
   name: string;
   /** The owned normalized alpha-mask asset's hash, in the `assets` store. */
   maskAssetId: string;
   /** Manual sort position (ascending); assigned at add, rewritten on reorder. */
   order: number;
   /** Epoch milliseconds the entry was created. */
   createdAt: number;
   /** Epoch milliseconds of the last name change. */
   updatedAt: number;
}
