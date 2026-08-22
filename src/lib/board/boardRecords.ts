// -- Type Imports --
import type { BoardBackground, BoardGrid, BoardItemContent, BoardItemKind, Viewport } from '@/lib/types/board';

/**
 * The per-record schema version for board rows, written to
 * `BoardRecord.schemaVersion`. Tracks the Dexie `version(4)` `boards`/`boardItems`
 * stores declared in `drawerDatabase.ts`; bump it (with a Dexie version upgrade)
 * when the record shape itself changes.
 */
export const BOARD_SCHEMA_VERSION = 1;

/** The grid a new board gets, and the fallback for boards saved before grids existed. */
export const DEFAULT_BOARD_GRID: BoardGrid = { type: 'dots' };

/**
 * One row per board in the `boards` store. The board's items are NOT embedded - they
 * are flat rows in `boardItems` keyed by `boardId` (normalized like the drawer, so a
 * large board loads lazily). The `viewport` is stored inline; `updatedAt` powers the
 * recents ordering.
 */
export interface BoardRecord {
   /** Primary key (a stable cuid assigned at creation). */
   id: string;
   /** Display name. */
   name: string;
   /** Epoch milliseconds of the last save; drives recents ordering and last-write-wins. */
   updatedAt: number;
   /** Persisted camera (pan offset + zoom). */
   viewport: Viewport;
   /** The drawer `FULL_BOARD` item this board is linked to, or null when unsaved (mirrors `CharacterRecord.drawerItemId`). */
   drawerItemId?: string | null;
   /** Background grid style. Absent on pre-grid boards - defaulted to dots on read. */
   grid?: BoardGrid;
   /** Surface backdrop (fill + texture). Absent means the plain theme canvas; not defaulted. */
   background?: BoardBackground;
   /** Monotonic source of drawing-layer name ordinals; set at creation, carried through fork/import. */
   nextLayerSeq: number;
   /** Per-record schema marker for future record-shape migrations. */
   schemaVersion: number;
}

/**
 * A flat board-item row in the `boardItems` store - the normalized form of
 * {@link import('@/lib/types/board').BoardItem}. Back-references its board via
 * `boardId` and carries an explicit `z` for stacking order. The `content` is stored
 * inline as a single serialized value, opaque to persistence and never shredded
 * (mirroring `DrawerItemRecord.content`).
 *
 * Connections (`kind: 'connection'`) ignore the placement fields - their geometry
 * derives from their endpoints - and store zeros there.
 */
export interface BoardItemRecord {
   /** Stable unique identifier (primary key). */
   id: string;
   /** Owning board id (indexed, plus the compound `[boardId+z]` for z-ordered loads). */
   boardId: string;
   /** Discriminant for the item's kind; mirrors `content.kind`. */
   kind: BoardItemKind;
   /** World-space left. */
   x: number;
   /** World-space top. */
   y: number;
   /** World-space width. */
   width: number;
   /** World-space height. */
   height: number;
   /** Stacking order within the board. */
   z: number;
   /** Optional rotation in degrees. */
   rotation?: number;
   /** The zone this item belongs to (geometric membership, captured on drop), or absent when in none. */
   zoneId?: string;
   /** A presentational display name (non-unique, never an identifier); absent until the user renames the item. */
   label?: string;
   /** The serialized, kind-discriminated payload; stored inline, opaque to the repo. */
   content: BoardItemContent;
}
