// -- Library Imports --
import { Dexie, type EntityTable } from 'dexie';

// -- Type Imports --
import type { DrawerFolderRecord, DrawerItemRecord, DrawerMetaRecord } from './drawerRecords';
import type { CharacterRecord } from '@/lib/character/characterRecords';
import type { AssetRecord } from '@/lib/assets/assetRecords';
import type { BoardRecord, BoardItemRecord } from '@/lib/board/boardRecords';
import type { NoteRecord } from '@/lib/notes/noteRecords';
import type { StencilRecord } from '@/lib/assets/stencilRecords';
import type { PdfAssetRecord } from '@/lib/pdf/pdfAssetRecords';
import type { PdfRecord } from '@/lib/pdf/pdfRecords';

/**
 * The Dexie database for the normalized drawer.
 *
 * Three object stores:
 * - `folders`: flat folder records, keyed by `id`. Indexed on `parentFolderId`
 *   and the compound `[parentFolderId+order]` (the workhorse for "ordered
 *   children of folder X").
 * - `items`: flat item records, keyed by `id`. Same parent/order indexes, plus
 *   `game` and `type` to pre-empt future filtering/search.
 * - `meta`: singleton key/value bookkeeping (schema version, migration flags),
 *   keyed by `key`.
 * - `characters`: one row per character, the full character stored inline
 *   (added in `version(2)`).
 * - `assets`: one row per content-addressed image, keyed by `hash` (the SHA-256
 *   of the processed webp), indexed on `createdAt` for the GC grace window; the
 *   blob and metadata are stored inline (added in `version(3)`).
 * - `boards`: one row per board, keyed by `id`, indexed on `updatedAt`; viewport
 *   stored inline (added in `version(4)`).
 * - `boardItems`: flat board-item rows, keyed by `id`, indexed on `boardId` and
 *   the compound `[boardId+z]` (z-ordered load of a board's items); placement and
 *   `content` stored inline (added in `version(4)`).
 * - `stencils`: one row per user stencil-library entry, keyed by `id`, indexed on
 *   `order` (manual sort) and `createdAt`; name + owned `maskAssetId` stored inline
 *   (added in `version(7)`).
 * - `pdfAssets`: one row per content-addressed PDF, keyed by `hash` (the SHA-256 of the
 *   raw pdf bytes), indexed on `createdAt` for the GC grace window; the blob and metadata
 *   are stored inline (added in `version(8)`).
 * - `pdfDocs`: one row per working PDF, keyed by `id`, indexed on `updatedAt`; the rest
 *   stored inline (added in `version(8)`).
 *
 * Despite the database name, it holds both the drawer and the character domains:
 * keeping them in one database lets a save-character-to-drawer update both the
 * `characters` row and the linked drawer `items` row in a single transaction.
 *
 * Only indexed properties are declared in the schema string; non-indexed columns
 * such as `name` and `content` are stored but not listed. Schema changes going
 * forward are made via additional `version(n)` declarations rather than blob
 * re-harmonization.
 */
export class DrawerDatabase extends Dexie {
   /** Flat folder records. */
   folders!: EntityTable<DrawerFolderRecord, 'id'>;
   /** Flat item records (content stored inline). */
   items!: EntityTable<DrawerItemRecord, 'id'>;
   /** Singleton meta key/value rows. */
   meta!: EntityTable<DrawerMetaRecord, 'key'>;
   /** One row per character, the full character stored inline (version(2)). */
   characters!: EntityTable<CharacterRecord, 'id'>;
   /** One row per content-addressed image asset, keyed by `hash` (version(3)). */
   assets!: EntityTable<AssetRecord, 'hash'>;
   /** One row per board, the viewport stored inline (version(4)). */
   boards!: EntityTable<BoardRecord, 'id'>;
   /** Flat board-item rows, content stored inline (version(4)). */
   boardItems!: EntityTable<BoardItemRecord, 'id'>;
   /** One row per working Note, the whole flat document stored inline (version(6)). */
   notes!: EntityTable<NoteRecord, 'id'>;
   /** One row per user stencil-library entry, name + owned mask asset stored inline (version(7)). */
   stencils!: EntityTable<StencilRecord, 'id'>;
   /** One row per content-addressed PDF asset, keyed by `hash` (version(8)). */
   pdfAssets!: EntityTable<PdfAssetRecord, 'hash'>;
   /** One row per working PDF, the whole aggregate stored inline (version(8)). */
   pdfDocs!: EntityTable<PdfRecord, 'id'>;

   constructor() {
      super('CharactersOfTheMistDrawerDatabase');

      this.version(1).stores({
         folders: 'id, parentFolderId, [parentFolderId+order]',
         items: 'id, parentFolderId, [parentFolderId+order], game, type',
         meta: 'key',
      });

      // version(2): purely additive - declares only the NEW `characters` store.
      // Dexie carries the version(1) stores (folders/items/meta) forward unchanged,
      // so an existing drawer database upgrades by creating one empty store with no
      // transform of existing data.
      this.version(2).stores({
         characters: 'id, updatedAt, game, drawerItemId',
      });

      // version(3): purely additive - declares only the NEW `assets` store. Only
      // `hash` (primary key) and `createdAt` are indexed; the blob and metadata are
      // stored unindexed. An existing database upgrades by creating one empty store
      // with no transform of existing data.
      this.version(3).stores({
         assets: 'hash, createdAt',
      });

      // version(4): purely additive - declares only the NEW `boards` + `boardItems`
      // stores. `boardItems` indexes `boardId` (load a board's items) and the compound
      // `[boardId+z]` (load them in z-order); placement and content are stored
      // unindexed. An existing database upgrades by creating two empty stores with no
      // transform of existing data.
      this.version(4).stores({
         boards: 'id, updatedAt',
         boardItems: 'id, boardId, [boardId+z]',
      });

      // version(5): re-declares ONLY the `items` store to append `createdAt`/`updatedAt`
      // indexes (a re-declaration replaces the store's whole index list, so the prior
      // indexes are repeated). The upgrade backfills already-stored rows, which predate
      // the fields, so they sort/range cleanly - defaulting to "when the data landed",
      // the same rule the migration uses. Idempotent and content-free.
      this.version(5).stores({
         items: 'id, parentFolderId, [parentFolderId+order], game, type, createdAt, updatedAt',
      }).upgrade(async (tx) => {
         await tx.table('items').toCollection().modify((item) => {
            if (typeof item.createdAt !== 'number') item.createdAt = Date.now();
            if (typeof item.updatedAt !== 'number') item.updatedAt = item.createdAt;
         });
      });

      // version(6): purely additive - declares only the NEW `notes` store (one row per
      // working Note, keyed by `id`, indexed on `updatedAt` for future recents ordering).
      // The whole flat document is stored unindexed. An existing database upgrades by
      // creating one empty store with no transform of existing data.
      this.version(6).stores({
         notes: 'id, updatedAt',
      });

      // version(7): purely additive - declares only the NEW `stencils` store. `id` (primary key),
      // `order` (manual sort), and `createdAt` are indexed; the name and `maskAssetId` are stored
      // unindexed. An existing database upgrades by creating one empty store with no transform of
      // existing data.
      this.version(7).stores({
         stencils: 'id, order, createdAt',
      });

      // version(8): purely additive - declares only the NEW `pdfAssets` + `pdfDocs` stores.
      // `pdfAssets` indexes `hash` (primary key) and `createdAt` (the GC grace window);
      // `pdfDocs` indexes `id` (primary key) and `updatedAt`. Blobs and the rest are stored
      // unindexed. An existing database upgrades by creating two empty stores with no
      // transform of existing data.
      this.version(8).stores({
         pdfAssets: 'hash, createdAt',
         pdfDocs: 'id, updatedAt',
      });
   }
}

/**
 * The shared singleton database instance. The repository is the only module that
 * should read or write it directly; everything else goes through the repository
 * API.
 */
export const drawerDatabase = new DrawerDatabase();
