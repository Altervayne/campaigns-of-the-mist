// -- Other Library Imports --
import { create } from 'zustand';
import cuid from 'cuid';

// -- Board Data Layer Imports --
import { getBoard, linkBoardToDrawerItem, listItems, loadBoard, renameBoard as renameBoardRecord, saveBoard, saveBoardLayerSeq, saveBoardToLinkedDrawerItem, updateItem } from '@/lib/board/boardRepository';
import { DEFAULT_BOARD_GRID } from '@/lib/board/boardRecords';
import { createBoardCommandEngine } from '@/lib/board/boardCommandEngine';
import {
   createAddItemCommand,
   createAppendStrokeCommand,
   createCompoundCommand,
   createDeleteItemCommand,
   createMergeDrawingsCommand,
   createMoveItemCommand,
   createRemoveStrokesCommand,
   createResizeItemCommand,
   createRotateItemCommand,
   createSetItemLabelCommand,
   createSetItemZCommand,
   createSetItemZoneCommand,
   createUpdateItemContentCommand,
   createUpdateItemContentAndSizeCommand,
} from '@/lib/board/boardCommands';
import { connectionsReferencing } from '@/lib/board/boardConnections';
import { normalizeAngle } from '@/lib/board/boardRotation';
import { byZThenId, flattenBoardOrder, repairBoardZ } from '@/lib/board/boardTree';
import { appendStrokeToDrawing, mergeDrawings, recomputeDrawingBoxWithoutMany } from '@/lib/board/drawingStyle';
import { zoneContaining } from '@/lib/board/zoneMembership';

// -- Store Imports --
import { useAppGeneralStateStore } from './appGeneralStateStore';

// -- Type Imports --
import type { BoardCommand, ResizePatch } from '@/lib/board/boardCommands';
import type { BoardItemRecord } from '@/lib/board/boardRecords';
import type { Board, BoardGrid, BoardItem, BoardItemContent, DrawingBoardContent, Stroke, Viewport } from '@/lib/types/board';

/*
 * Board store - the React-facing, in-memory view of one open board, backed by the
 * normalized repository and a command/undo engine. It is a synthesis of two existing
 * stores: the per-instance factory shape of the character store (one store per open
 * board, hence one undo stack), and the command-engine wiring of the drawer store
 * (each mutation persists through a command, then the in-memory view resyncs).
 *
 * Item mutations persist inside their commands (each `do()` writes to the repository),
 * so there is no debounced item-save bridge. The only non-command persistence is the
 * viewport (camera state, debounce-saved on the board record) and hydration
 * (`loadBoard` on open). The store is the single owner of both.
 */

/** A fresh board's camera, used until hydration or a missing-board fallback. */
const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };

/** How long the camera settles before its position is written back to the board record. */
const VIEWPORT_SAVE_DEBOUNCE_MS = 300;

export interface BoardState {
   /** The open board's id, or `null` before the first successful hydrate. */
   boardId: string | null;
   name: string;
   viewport: Viewport;
   /** The background grid style for this board (persisted on the board record). */
   grid: BoardGrid;
   /** The linked drawer `FULL_BOARD` item, or `null` when this board was never saved. */
   drawerItemId: string | null;
   /** True when the board differs from its saved drawer copy, or was never saved. */
   hasUnsavedChanges: boolean;
   /**
    * Items keyed by id for O(1) optimistic updates; the canvas renders them sorted by
    * `z`. Connections are items too (`kind: 'connection'`), in this same map.
    */
   items: Record<string, BoardItem>;
   /**
    * The current selection, ephemeral view state shared with the canvas: never persisted,
    * never a command, never dirties the board (same discipline as the viewport / lastKnown caches).
    */
   selectedIds: Set<string>;
   /** The hovered item id, or `null`. Ephemeral view state, same discipline as the selection. */
   hoveredId: string | null;
   /**
    * The next drawing-layer name ordinal, seeded on hydrate (above the board's stored counter and its live
    * drawings) and advanced at each drawing mint. Persisted on the board record so a number is never reused.
    */
   nextLayerSeq: number;
   canUndo: boolean;
   canRedo: boolean;
   isLoading: boolean;
   error: string | null;
   actions: {
      /** Loads a board into the store, clearing undo history so it can't cross boards. Tolerates a missing board. */
      hydrate: (boardId: string) => Promise<void>;
      addItem: (item: BoardItem) => Promise<void>;
      moveItem: (id: string, position: { x: number; y: number }) => Promise<void>;
      /**
       * Moves several items by a shared world delta as ONE undo step (single-select is a group of
       * one). `reevaluateIds` (default: all moved ids) are the DIRECTLY-moved non-zone items whose
       * zone membership is recomputed against the post-move zone rects and folded into the same
       * compound; members dragged along by a moved zone are excluded so they keep their membership.
       */
      moveItems: (ids: string[], delta: { x: number; y: number }, reevaluateIds?: string[]) => Promise<void>;
      /**
       * Moves several items to ABSOLUTE positions (align / distribute) as ONE undo step. Each moved non-zone
       * item's membership is recomputed against the zones at their POST-move positions and folded into the
       * same compound; a member carried by a moved zone (its own zone in the move set) keeps its membership.
       */
      moveItemsTo: (positions: Record<string, { x: number; y: number }>) => Promise<void>;
      /** Deletes several items plus the connections referencing any of them (deduped) as ONE undo step. */
      deleteItems: (ids: string[]) => Promise<void>;
      /**
       * Duplicates the spatial items in `ids` (offset, fresh ids) plus any connection whose
       * BOTH endpoints were duplicated (remapped), as ONE undo step. Returns the new spatial ids.
       */
      duplicateItems: (ids: string[]) => Promise<string[]>;
      resizeItem: (id: string, patch: ResizePatch) => Promise<void>;
      /** Rotates an item to an absolute angle in degrees (normalized to [0,360)) as one undo step. */
      rotateItem: (id: string, rotation: number) => Promise<void>;
      /**
       * Writes an item's width/height WITHOUT a command (no undo entry) - for the auto-height
       * follow, where the box measures its content and syncs the true height. User resizes
       * still go through the undoable {@link resizeItem}.
       */
      syncItemSize: (id: string, size: { width?: number; height?: number }) => Promise<void>;
      setItemZ: (id: string, z: number) => Promise<void>;
      /**
       * Sets (or clears with `undefined`) an item's display label as one undo step. NON-additive; the layers
       * panel row buffers the text and commits once on blur/Enter, so this never spams the undo stack.
       */
      setItemLabel: (id: string, label: string | undefined) => Promise<void>;
      /** Sets (or clears with `null`) an item's zone membership as one undo step. */
      setItemZone: (id: string, zoneId: string | null) => Promise<void>;
      /**
       * Moves an item to `dropIndex` within its destination scope (`newZoneId`, or `null` for root) as ONE
       * undo step: a membership change (when the scope differs) plus a dense renumber of the DESTINATION scope
       * to realize the index. The source scope is left with a harmless gap (z is scope-relative). Drives the
       * layers-panel drag-reorder; the panel resolves a drop to `(scope, index)` and calls this.
       */
      reorderItem: (id: string, newZoneId: string | null, dropIndex: number) => Promise<void>;
      /**
       * Merges >= 2 selected DRAWING layers into the bottom-most one (lowest paint order) as ONE undo step:
       * folds every other layer's strokes into the target (box unioned, z-order preserved), deletes the
       * merged-away layers plus any connection referencing them (cascade), and leaves the target selected.
       * A defensive no-op unless every id is a live drawing and there are at least two - adjacency is the
       * panel's enablement guard, not a store invariant.
       */
      mergeDrawings: (ids: string[]) => Promise<void>;
      /** Raises an item to the front of ITS scope (`max(z) + 1` among siblings sharing its `zoneId`). */
      bringToFront: (id: string) => Promise<void>;
      /** Drops an item to the back of ITS scope (`min(z) - 1` among siblings sharing its `zoneId`). */
      sendToBack: (id: string) => Promise<void>;
      updateItemContent: (id: string, content: BoardItemContent) => Promise<void>;
      /** Replaces an item's content AND box size as one undo step (a portal poster wearing its crop shape). */
      updateItemContentAndSize: (id: string, content: BoardItemContent, size: { width: number; height: number }) => Promise<void>;
      /**
       * Appends a stroke (its `points` in WORLD coords) to a drawing layer as one undo step, via a pure
       * delta command (not a full content snapshot). Grows the layer's box to the ink extent and re-bases
       * points to layer-local, optimistically then on the additive fast path (no reload). The overlay mints
       * a layer with {@link addItem} for the first stroke, then appends here.
       */
      appendStroke: (itemId: string, stroke: Stroke) => Promise<void>;
      /**
       * Removes strokes from one or more drawing layers as ONE undo step (a whole eraser scrub). A layer whose
       * entire stroke set is erased is deleted; the rest re-fit to their survivors. Applied optimistically then
       * persisted NON-additively (a multi-item removal keeps the full resync), so the map matches the repo.
       */
      eraseStrokes: (erasures: { layerId: string; strokeIds: string[] }[]) => Promise<void>;
      /**
       * Caches a reference item's `lastKnown` snapshot via a DIRECT repo write, never a
       * command - so a passive source-driven re-read never lands on the board undo stack.
       */
      cacheReferenceLastKnown: (id: string, content: BoardItemContent) => Promise<void>;
      /**
       * Adopts a freshly minted drawer id onto a copy item's `content.sourceDrawerItemId` via a
       * DIRECT repo write, never a command - a Save-As link is bookkeeping, not a user edit, so it
       * must never land on the undo stack (Ctrl+Z would silently unlink the twin it just created).
       */
      adoptItemDrawerSource: (id: string, sourceDrawerItemId: string) => Promise<void>;
      /**
       * Caches a portal's `lastKnownName` via a live-read DIRECT repo write, never a command - a
       * passive liveness cache must not land on the undo stack, and reading live then patching ONLY
       * the name keeps it from clobbering a concurrent style/target edit. No-op off a portal item.
       */
      cachePortalLastKnown: (id: string, name: string) => Promise<void>;
      deleteItem: (id: string) => Promise<void>;
      /** Sets the camera and debounce-persists it. The viewport is never undoable. */
      setViewport: (viewport: Viewport) => void;
      /** Sets the background grid, persisting it immediately. Marks the board dirty; not undoable. */
      setGrid: (grid: BoardGrid) => Promise<void>;
      /** Renames the board, persisting immediately. Marks the board dirty; not undoable (the tab label is bound to `name`). */
      renameBoard: (name: string) => Promise<void>;
      /** Sets the unsaved-changes flag directly (e.g. a save site marks the board clean). */
      setHasUnsavedChanges: (value: boolean) => void;
      /**
       * Saves the board to its LINKED drawer item (if any), flushing the live viewport.
       * Marks the board clean on success. Returns the outcome, or `null` when no board is
       * loaded; `{ linkedItemUpdated: false }` means the caller should "Save As".
       */
      saveToDrawer: () => Promise<{ linkedItemUpdated: boolean } | null>;
      /**
       * Links the board to a new drawer item id (for "Save As"), flushes the viewport,
       * marks the board clean, and returns the aggregate to seed that drawer item.
       */
      linkToDrawerItem: (drawerItemId: string) => Promise<Board | null>;
      undo: () => Promise<void>;
      redo: () => Promise<void>;
      /** Selects `id`: `additive` (Shift/Ctrl) toggles it in/out, else it replaces the selection. Ephemeral view state. */
      selectItem: (id: string, additive: boolean) => void;
      /** Replaces the selection with exactly `ids`. */
      setSelection: (ids: string[]) => void;
      /** Unions `ids` into the selection (a marquee sweep adds to what's already held). */
      addToSelection: (ids: string[]) => void;
      /** Drops `id` from the selection; a no-op (stable reference) when it isn't selected. */
      deselectItem: (id: string) => void;
      /** Clears the selection. */
      clearSelection: () => void;
      /** Sets (or clears with `null`) the hovered item. Ephemeral view state. */
      setHovered: (id: string | null) => void;
   };
}

/**
 * The next drawing-layer ordinal to hand out on hydrate: above the board's stored counter AND every live
 * drawing's `seq`, so a number is never reused. A board whose record predates the counter (`undefined`)
 * seeds to 1, and a stored counter that ever lags its drawings self-corrects. Never returns NaN.
 */
function seedNextLayerSeq(stored: number | undefined, items: Record<string, BoardItem>): number {
   // Number.isFinite screens out BOTH an unset seq and a NaN one left by an earlier buggy build, so a
   // corrupted drawing can't poison the counter - Math.max with NaN is NaN, and `?? 0` wouldn't catch NaN.
   let maxSeq = 0;
   for (const item of Object.values(items)) {
      if (item.content.kind === 'drawing' && Number.isFinite(item.content.seq)) maxSeq = Math.max(maxSeq, item.content.seq as number);
   }
   const base = Number.isFinite(stored) ? (stored as number) : 0;
   return Math.max(base, maxSeq + 1);
}

const initialState: Pick<
   BoardState,
   'boardId' | 'name' | 'viewport' | 'grid' | 'drawerItemId' | 'hasUnsavedChanges' | 'items' | 'selectedIds' | 'hoveredId' | 'nextLayerSeq' | 'canUndo' | 'canRedo' | 'isLoading' | 'error'
> = {
   boardId: null,
   name: '',
   viewport: { ...DEFAULT_VIEWPORT },
   grid: { ...DEFAULT_BOARD_GRID },
   drawerItemId: null,
   hasUnsavedChanges: false,
   items: {},
   selectedIds: new Set(),
   hoveredId: null,
   nextLayerSeq: 1,
   canUndo: false,
   canRedo: false,
   isLoading: false,
   error: null,
};

/** Normalizes a thrown value into the store's `error` message string. */
function toErrorMessage(error: unknown): string {
   return error instanceof Error ? error.message : String(error);
}

/** Marks the board as the most recently modified store, so Ctrl/Cmd+Z routes here (not the drawer). */
function markBoardModified(): void {
   useAppGeneralStateStore.getState().actions.setLastModifiedStore('board');
}

/** Projects a flat item record onto the in-memory {@link BoardItem} (drops `boardId`). */
function recordToItem(record: BoardItemRecord): BoardItem {
   return {
      id: record.id,
      kind: record.kind,
      x: record.x,
      y: record.y,
      width: record.width,
      height: record.height,
      z: record.z,
      rotation: record.rotation,
      zoneId: record.zoneId,
      label: record.label,
      content: record.content,
   };
}

/** A trailing-edge debouncer; at most one timer in flight. No new dependency. */
function createDebouncer<T>(delay: number, run: (value: T) => void): (value: T) => void {
   let timer: ReturnType<typeof setTimeout> | null = null;
   return (value: T) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
         timer = null;
         run(value);
      }, delay);
   };
}

/**
 * Builds a board store instance: the in-memory board view plus the action API, each
 * instance owning its own command engine (so N open boards = N undo stacks). The
 * `viewportSaveDebounceMs` option exists for tests; production uses the default.
 */
export function createBoardStore(options: { viewportSaveDebounceMs?: number } = {}) {
   const viewportSaveDebounceMs = options.viewportSaveDebounceMs ?? VIEWPORT_SAVE_DEBOUNCE_MS;
   // This instance's own engine, so its undo/redo stacks never cross-wire with another
   // board's. The `subscribe` mirror below is wired to THIS engine only. The deeper cap keeps a
   // long pen sketch (one stroke = one undo step) from overflowing the stack mid-drawing.
   const engine = createBoardCommandEngine({ undoLimit: 200 });

   const useStore = create<BoardState>()((set, get) => {
      /** Rebuilds the `items` map from persisted truth, leaving `name`/`viewport` (not item rows) alone. */
      const syncItemsFromRepo = async (): Promise<void> => {
         const boardId = get().boardId;
         if (!boardId) return;
         // v1 reloads every item; a per-item diff is a later optimization.
         const records = await listItems(boardId);
         const items: Record<string, BoardItem> = {};
         for (const record of records) items[record.id] = recordToItem(record);
         set({ items });
      };

      /**
       * Persists the camera onto the board record. Best-effort and decoupled from undo:
       * the viewport is never a command, so a failed save never corrupts a stack.
       */
      const debouncedSaveViewport = createDebouncer<Viewport>(viewportSaveDebounceMs, (viewport) => {
         const boardId = get().boardId;
         if (!boardId) return;
         void getBoard(boardId)
            .then((record) => (record ? saveBoard({ ...record, viewport }) : undefined))
            .catch((error) => {
               console.error('Board viewport save failed:', error);
            });
      });

      // A tail promise every item mutation chains onto, so commands run strictly one at a time. Each
      // command's `do()` is a read-modify-write of the repo; serializing them stops a rapid burst (fast
      // pen strokes) from interleaving - stroke 2 reading the array before stroke 1's write lands and
      // clobbering it. `.catch` keeps a rejection from breaking the chain for the next mutation.
      let mutationTail: Promise<void> = Promise.resolve();

      /**
       * Executes a command through this instance's engine, serialized behind any in-flight mutation.
       * On success it resyncs the in-memory map to persisted truth, EXCEPT on the `additive` fast path
       * (a pure add / single-item content delta), where the caller's optimistic `set` is already
       * authoritative and a full `listItems()` reload would be wasted - so a stroke append never triggers
       * one. On failure it records the error, resyncs (reverting the optimistic change), and rethrows;
       * an additive failure still resyncs to roll the optimistic change back.
       */
      const runItemMutation = (command: BoardCommand, { additive = false }: { additive?: boolean } = {}): Promise<void> => {
         const run = mutationTail.then(async () => {
            try {
               await engine.execute(command);
            } catch (error) {
               set({ error: toErrorMessage(error) });
               await syncItemsFromRepo();
               throw error;
            }
            if (!additive) await syncItemsFromRepo();
         });
         mutationTail = run.catch(() => {});
         return run;
      };

      /** Marks a real edit: routes Ctrl/Cmd+Z here AND flags the board dirty (so close warns). */
      const markDirty = (): void => {
         markBoardModified();
         set({ hasUnsavedChanges: true });
      };

      return {
         ...initialState,
         actions: {
            hydrate: async (boardId) => {
               // A freshly opened board starts with empty undo history.
               engine.clear();
               set({ isLoading: true, error: null });
               try {
                  const board = await loadBoard(boardId);
                  if (!board) {
                     set({ ...initialState, error: `Board not found: ${boardId}` });
                     return;
                  }
                  const loaded: Record<string, BoardItem> = {};
                  for (const item of board.items) loaded[item.id] = item;
                  // One-time tidy: normalize stored z to dense scope-relative order for any board written
                  // before the scope-relative model. The flatten derives a zone's band regardless, so this
                  // only cleans stored z (idempotent - a repaired board re-opens with nothing to change).
                  // Persisted directly (no command, no dirty), like the passive size/viewport caches, so
                  // memory and repo agree and a later resync reads the same dense z.
                  const { items, changed } = repairBoardZ(loaded);
                  // Opened from its records: it matches its saved copy (if any), so it
                  // starts clean. The first mutation dirties it.
                  set({ boardId, name: board.name, viewport: board.viewport, grid: board.grid ?? { ...DEFAULT_BOARD_GRID }, drawerItemId: board.drawerItemId ?? null, hasUnsavedChanges: false, items, nextLayerSeq: seedNextLayerSeq(board.nextLayerSeq, items), isLoading: false, error: null });
                  if (changed.length > 0) {
                     void Promise.all(changed.map((change) => updateItem(change.id, { z: change.z }))).catch((error) => console.error('Board z repair persist failed:', error));
                  }
               } catch (error) {
                  set({ isLoading: false, error: toErrorMessage(error) });
               }
            },

            addItem: async (item) => {
               const boardId = get().boardId;
               if (!boardId) return;
               markDirty();
               // A freshly minted drawing layer takes the next monotonic ordinal for its default "Layer N"
               // name; the counter advances and is persisted (a cosmetic, non-undoable board-record write) so
               // the number is never reused. Folded into the creation record - no separate command.
               let toAdd = item;
               if (item.kind === 'drawing' && item.content.kind === 'drawing' && item.content.seq === undefined) {
                  const seq = get().nextLayerSeq;
                  toAdd = { ...item, content: { ...item.content, seq } };
                  set({ nextLayerSeq: seq + 1 });
                  void saveBoardLayerSeq(boardId, seq + 1).catch((error) => console.error('Board layer counter save failed:', error));
               }
               const record: BoardItemRecord = { ...toAdd, boardId };
               set((state) => ({ items: { ...state.items, [toAdd.id]: toAdd } }));
               // A pure add: the optimistic insert above IS the truth, so skip the post-command reload.
               await runItemMutation(createAddItemCommand(record), { additive: true });
            },

            moveItem: async (id, position) => {
               markDirty();
               const existing = get().items[id];
               if (existing) set((state) => ({ items: { ...state.items, [id]: { ...existing, x: position.x, y: position.y } } }));
               await runItemMutation(createMoveItemCommand(id, position));
            },

            moveItems: async (ids, delta, reevaluateIds = ids) => {
               if (ids.length === 0 || (delta.x === 0 && delta.y === 0)) return;
               markDirty();
               const items = get().items;
               const moveSet = new Set(ids);
               const moves = ids
                  .map((id) => items[id])
                  .filter((item): item is BoardItem => !!item)
                  .map((item) => ({ id: item.id, position: { x: item.x + delta.x, y: item.y + delta.y } }));

               // Recompute membership for the directly-moved non-zone items against the zones at
               // their POST-move positions (a zone that moved with them shifts too). Members carried
               // along by a moved zone are not in `reevaluateIds`, so they keep their membership.
               const zonesAfter = Object.values(items)
                  .filter((item) => item.kind === 'zone')
                  .map((zone) => (moveSet.has(zone.id) ? { ...zone, x: zone.x + delta.x, y: zone.y + delta.y } : zone));
               const zoneChanges: { id: string; zoneId: string | null }[] = [];
               for (const id of reevaluateIds) {
                  const item = items[id];
                  if (!item || item.kind === 'zone') continue;
                  // A member whose own zone is moving with it shifts by the same delta, so their spatial
                  // relationship - and thus its membership - can't change; skip the recompute. This also
                  // protects a COLLAPSED zone's members: zoneContaining ignores a collapsed frame, so
                  // recomputing would wrongly orphan them when a marquee grabs the zone and its contents.
                  if (item.zoneId && moveSet.has(item.zoneId)) continue;
                  const moved = { id: item.id, x: item.x + delta.x, y: item.y + delta.y, width: item.width, height: item.height };
                  const newZone = zoneContaining(moved, zonesAfter);
                  if (newZone !== (item.zoneId ?? null)) zoneChanges.push({ id, zoneId: newZone });
               }

               // A membership change reinterprets the item's z as an order within its NEW scope; land it at
               // the front of that scope (a dragged-out member snaps to root-front, one dragged in to zone-
               // front) so it never inherits a stale in-zone rank. Several into one scope stack front-to-back.
               const scopeFront = new Map<string, number>();
               const zoneChangeZ: { id: string; z: number }[] = [];
               for (const change of zoneChanges) {
                  const key = change.zoneId ?? '';
                  let front = scopeFront.get(key);
                  if (front === undefined) {
                     let max = -Infinity;
                     for (const other of Object.values(items)) {
                        if (other.kind !== 'connection' && (other.zoneId ?? null) === change.zoneId) max = Math.max(max, other.z);
                     }
                     front = (max === -Infinity ? -1 : max) + 1;
                  } else {
                     front += 1;
                  }
                  scopeFront.set(key, front);
                  zoneChangeZ.push({ id: change.id, z: front });
               }
               const frontZById = new Map(zoneChangeZ.map((change) => [change.id, change.z]));

               set((state) => {
                  const next = { ...state.items };
                  for (const move of moves) {
                     const existing = next[move.id];
                     if (existing) next[move.id] = { ...existing, x: move.position.x, y: move.position.y };
                  }
                  for (const change of zoneChanges) {
                     const existing = next[change.id];
                     if (existing) next[change.id] = { ...existing, zoneId: change.zoneId ?? undefined, z: frontZById.get(change.id) ?? existing.z };
                  }
                  return { items: next };
               });
               await runItemMutation(createCompoundCommand([
                  ...moves.map((move) => createMoveItemCommand(move.id, move.position)),
                  ...zoneChanges.map((change) => createSetItemZoneCommand(change.id, change.zoneId)),
                  ...zoneChangeZ.map((change) => createSetItemZCommand(change.id, change.z)),
               ]));
            },

            moveItemsTo: async (positions) => {
               const entries = Object.entries(positions);
               if (entries.length === 0) return;
               markDirty();
               const items = get().items;
               const moveSet = new Set(entries.map(([id]) => id));

               // Recompute membership for the moved non-zone items against the zones at their POST-move
               // positions (a zone that moved shifts to its new absolute pos). Members carried along by a
               // moved zone (their own zone in the set) keep their membership - same guard as moveItems.
               const zonesAfter = Object.values(items)
                  .filter((item) => item.kind === 'zone')
                  .map((zone) => (positions[zone.id] ? { ...zone, x: positions[zone.id].x, y: positions[zone.id].y } : zone));
               const zoneChanges: { id: string; zoneId: string | null }[] = [];
               for (const [id, pos] of entries) {
                  const item = items[id];
                  if (!item || item.kind === 'zone') continue;
                  if (item.zoneId && moveSet.has(item.zoneId)) continue;
                  const moved = { id: item.id, x: pos.x, y: pos.y, width: item.width, height: item.height };
                  const newZone = zoneContaining(moved, zonesAfter);
                  if (newZone !== (item.zoneId ?? null)) zoneChanges.push({ id, zoneId: newZone });
               }

               // A membership change reinterprets z within the NEW scope; land the item at that scope's front.
               const scopeFront = new Map<string, number>();
               const zoneChangeZ: { id: string; z: number }[] = [];
               for (const change of zoneChanges) {
                  const key = change.zoneId ?? '';
                  let front = scopeFront.get(key);
                  if (front === undefined) {
                     let max = -Infinity;
                     for (const other of Object.values(items)) {
                        if (other.kind !== 'connection' && (other.zoneId ?? null) === change.zoneId) max = Math.max(max, other.z);
                     }
                     front = (max === -Infinity ? -1 : max) + 1;
                  } else {
                     front += 1;
                  }
                  scopeFront.set(key, front);
                  zoneChangeZ.push({ id: change.id, z: front });
               }
               const frontZById = new Map(zoneChangeZ.map((change) => [change.id, change.z]));

               set((state) => {
                  const next = { ...state.items };
                  for (const [id, pos] of entries) {
                     const existing = next[id];
                     if (existing) next[id] = { ...existing, x: pos.x, y: pos.y };
                  }
                  for (const change of zoneChanges) {
                     const existing = next[change.id];
                     if (existing) next[change.id] = { ...existing, zoneId: change.zoneId ?? undefined, z: frontZById.get(change.id) ?? existing.z };
                  }
                  return { items: next };
               });
               await runItemMutation(createCompoundCommand([
                  ...entries.map(([id, pos]) => createMoveItemCommand(id, pos)),
                  ...zoneChanges.map((change) => createSetItemZoneCommand(change.id, change.zoneId)),
                  ...zoneChangeZ.map((change) => createSetItemZCommand(change.id, change.z)),
               ]));
            },

            deleteItems: async (ids) => {
               if (ids.length === 0) return;
               markDirty();
               const items = get().items;
               // Expand with the connection cascade for every deleted item, deduped (two
               // selected items sharing a line must not delete it twice).
               const toDelete = new Set<string>(ids);
               for (const id of ids) for (const connectionId of connectionsReferencing(items, id)) toDelete.add(connectionId);
               const finalIds = [...toDelete];
               // Deleting a zone FREES its members (clears their zoneId) rather than deleting them;
               // a freed member that is itself being deleted needs no clear.
               const freedMembers: string[] = [];
               for (const id of finalIds) {
                  if (items[id]?.kind !== 'zone') continue;
                  for (const member of Object.values(items)) {
                     if (member.zoneId === id && !toDelete.has(member.id)) freedMembers.push(member.id);
                  }
               }
               set((state) => {
                  const next = { ...state.items };
                  for (const id of finalIds) delete next[id];
                  for (const id of freedMembers) {
                     const existing = next[id];
                     if (existing) next[id] = { ...existing, zoneId: undefined };
                  }
                  return { items: next };
               });
               await runItemMutation(createCompoundCommand([
                  ...finalIds.map((id) => createDeleteItemCommand(id)),
                  ...freedMembers.map((id) => createSetItemZoneCommand(id, null)),
               ]));
            },

            duplicateItems: async (ids) => {
               const boardId = get().boardId;
               if (!boardId || ids.length === 0) return [];
               markDirty();
               const items = get().items;
               const OFFSET = 16; // small world nudge so the copies don't hide under the originals

               // Copy each selected SPATIAL item with a fresh id; the map remaps connections.
               const spatial = ids.map((id) => items[id]).filter((item): item is BoardItem => !!item && item.kind !== 'connection');
               const idMap = new Map<string, string>();
               for (const item of spatial) idMap.set(item.id, cuid());
               let z = Object.values(items).reduce((max, item) => Math.max(max, item.z), 0) + 1;

               const newRecords: BoardItemRecord[] = [];
               const newSpatialIds: string[] = [];
               for (const item of spatial) {
                  const id = idMap.get(item.id)!;
                  newSpatialIds.push(id);
                  // Deep-copy the content so an embed copy is fully independent of its original (its own
                  // `content.data`, so the two per-embed stores never share an object).
                  newRecords.push({ ...item, id, boardId, x: item.x + OFFSET, y: item.y + OFFSET, z: z++, content: structuredClone(item.content) });
               }
               // A connection is duplicated only when BOTH its endpoints were duplicated; the
               // copy points at the new ids (never the originals). One-endpoint-outside is skipped.
               for (const item of Object.values(items)) {
                  if (item.content.kind !== 'connection') continue;
                  const from = idMap.get(item.content.from);
                  const to = idMap.get(item.content.to);
                  if (!from || !to) continue;
                  newRecords.push({ ...item, id: cuid(), boardId, z: z++, content: { ...item.content, from, to } });
               }

               set((state) => {
                  const next = { ...state.items };
                  for (const record of newRecords) next[record.id] = recordToItem(record);
                  return { items: next };
               });
               await runItemMutation(createCompoundCommand(newRecords.map((record) => createAddItemCommand(record))));
               return newSpatialIds;
            },

            resizeItem: async (id, patch) => {
               markDirty();
               const existing = get().items[id];
               if (existing) set((state) => ({ items: { ...state.items, [id]: { ...existing, ...patch } } }));
               await runItemMutation(createResizeItemCommand(id, patch));
            },

            rotateItem: async (id, rotation) => {
               markDirty();
               const normalized = normalizeAngle(rotation);
               const existing = get().items[id];
               if (existing) set((state) => ({ items: { ...state.items, [id]: { ...existing, rotation: normalized } } }));
               await runItemMutation(createRotateItemCommand(id, normalized));
            },

            syncItemSize: async (id, size) => {
               // Passive, like the lastKnown / viewport caches: a measurement-driven size
               // follow must not enter the undo stack or flag the board dirty (or merely
               // opening a board could mark it changed). Persisted so it survives reload/export.
               const existing = get().items[id];
               if (!existing) return;
               const patch: { width?: number; height?: number } = {};
               if (size.width != null && size.width !== existing.width) patch.width = size.width;
               if (size.height != null && size.height !== existing.height) patch.height = size.height;
               if (patch.width === undefined && patch.height === undefined) return;
               set((state) => ({ items: { ...state.items, [id]: { ...existing, ...patch } } }));
               try {
                  await updateItem(id, patch);
               } catch (error) {
                  set({ error: toErrorMessage(error) });
               }
            },

            setItemZ: async (id, z) => {
               // Also covers bringToFront/sendToBack, which delegate here.
               markDirty();
               const existing = get().items[id];
               if (existing) set((state) => ({ items: { ...state.items, [id]: { ...existing, z } } }));
               await runItemMutation(createSetItemZCommand(id, z));
            },

            setItemLabel: async (id, label) => {
               markDirty();
               const existing = get().items[id];
               if (existing) set((state) => ({ items: { ...state.items, [id]: { ...existing, label } } }));
               await runItemMutation(createSetItemLabelCommand(id, label));
            },

            setItemZone: async (id, zoneId) => {
               markDirty();
               const existing = get().items[id];
               if (existing) set((state) => ({ items: { ...state.items, [id]: { ...existing, zoneId: zoneId ?? undefined } } }));
               await runItemMutation(createSetItemZoneCommand(id, zoneId));
            },

            reorderItem: async (id, newZoneId, dropIndex) => {
               const target = get().items[id];
               if (!target || target.kind === 'connection') return;
               const newZone = newZoneId ?? null;
               const currentZone = target.zoneId ?? null;

               // The destination scope's final order: its current members (minus the target) by z, with the
               // target spliced in at the clamped drop index. A dense 0..k renumber of THAT order realizes the
               // drop; the source scope is untouched (a gap is harmless under scope-relative z).
               const siblings = Object.values(get().items)
                  .filter((item) => item.kind !== 'connection' && item.id !== id && (item.zoneId ?? null) === newZone)
                  .sort(byZThenId);
               const clamped = Math.max(0, Math.min(dropIndex, siblings.length));
               const ordered = [...siblings.slice(0, clamped), target, ...siblings.slice(clamped)];
               const zChanges = ordered
                  .map((item, index) => ({ id: item.id, z: index }))
                  .filter((change) => get().items[change.id]!.z !== change.z);

               const zoneChanged = newZone !== currentZone;
               if (!zoneChanged && zChanges.length === 0) return; // a drop in place: nothing to write

               markDirty();
               set((state) => {
                  const next = { ...state.items };
                  if (zoneChanged) {
                     const existing = next[id];
                     if (existing) next[id] = { ...existing, zoneId: newZone ?? undefined };
                  }
                  for (const change of zChanges) {
                     const existing = next[change.id];
                     if (existing) next[change.id] = { ...existing, z: change.z };
                  }
                  return { items: next };
               });
               // One compound: the membership change (if any) THEN the destination renumber, so undo reverts
               // both together. Keeps setItemZone/setItemZ dumb - the membership<->z coupling lives only here.
               await runItemMutation(createCompoundCommand([
                  ...(zoneChanged ? [createSetItemZoneCommand(id, newZone)] : []),
                  ...zChanges.map((change) => createSetItemZCommand(change.id, change.z)),
               ]));
            },

            mergeDrawings: async (ids) => {
               const items = get().items;
               // Every id must be a live drawing, and at least two (adjacency is the panel's guard). Any other
               // kind or a count below two is a defensive no-op (mirrors the eraseStrokes / reorder guards).
               const idSet = new Set(ids);
               if (idSet.size < 2) return;
               // Selected drawings in paint order (bottom -> top), so the fold keeps stacking and the bottom-most
               // is the target. flattenBoardOrder excludes connections, so a stray connection id can't slip in.
               const ordered = flattenBoardOrder(items).filter((item) => idSet.has(item.id));
               if (ordered.length !== idSet.size || !ordered.every((item) => item.content.kind === 'drawing')) return;

               const target = ordered[0];
               const sources = ordered.slice(1);
               const sourceIds = sources.map((source) => source.id);
               // Cascade: any connection to a merged-away layer would dangle, so it is deleted in the same
               // compound (deduped - a connection between two sources is referenced twice).
               const connectionIds = new Set<string>();
               for (const id of sourceIds) for (const connectionId of connectionsReferencing(items, id)) connectionIds.add(connectionId);

               markDirty();
               // Optimistic mirror, byte-identical to the command's write via the SAME fold helper: the merged
               // target grows, the sources and their cascaded connections vanish. The non-additive resync below
               // reconciles anyway, but matching it here avoids a flash.
               const merged = mergeDrawings(
                  { x: target.x, y: target.y, content: target.content as DrawingBoardContent },
                  sources.map((source) => ({ x: source.x, y: source.y, content: source.content as DrawingBoardContent })),
               );
               set((state) => {
                  const next = { ...state.items };
                  const existing = next[target.id];
                  if (existing && existing.content.kind === 'drawing') {
                     next[target.id] = { ...existing, x: merged.x, y: merged.y, width: merged.width, height: merged.height, content: { ...existing.content, strokes: merged.strokes } };
                  }
                  for (const id of sourceIds) delete next[id];
                  for (const id of connectionIds) delete next[id];
                  return { items: next };
               });
               // NON-additive (multi-item + deletes): the mergeWrite runs FIRST so it reads the sources live,
               // then the source + connection deletes; one compound, one undo step.
               await runItemMutation(createCompoundCommand([
                  createMergeDrawingsCommand(target.id, sourceIds),
                  ...sourceIds.map((id) => createDeleteItemCommand(id)),
                  ...[...connectionIds].map((id) => createDeleteItemCommand(id)),
               ]));
               // Leave the single merged layer selected.
               set({ selectedIds: new Set([target.id]) });
            },

            bringToFront: async (id) => {
               // Scope-relative: "front" means front of the item's OWN scope (siblings sharing its zoneId),
               // so a zone member goes to the top of its band, not ejected past its zone.
               const target = get().items[id];
               if (!target) return;
               const scope = target.zoneId ?? null;
               const zs = Object.values(get().items).filter((item) => (item.zoneId ?? null) === scope).map((item) => item.z);
               const z = zs.length > 0 ? Math.max(...zs) + 1 : 0;
               await get().actions.setItemZ(id, z);
            },

            sendToBack: async (id) => {
               const target = get().items[id];
               if (!target) return;
               const scope = target.zoneId ?? null;
               const zs = Object.values(get().items).filter((item) => (item.zoneId ?? null) === scope).map((item) => item.z);
               const z = zs.length > 0 ? Math.min(...zs) - 1 : 0;
               await get().actions.setItemZ(id, z);
            },

            updateItemContent: async (id, content) => {
               markDirty();
               const existing = get().items[id];
               if (existing) set((state) => ({ items: { ...state.items, [id]: { ...existing, content } } }));
               await runItemMutation(createUpdateItemContentCommand(id, content));
            },

            updateItemContentAndSize: async (id, content, size) => {
               markDirty();
               const existing = get().items[id];
               if (existing) set((state) => ({ items: { ...state.items, [id]: { ...existing, content, width: size.width, height: size.height } } }));
               await runItemMutation(createUpdateItemContentAndSizeCommand(id, content, size.width, size.height));
            },

            appendStroke: async (itemId, stroke) => {
               markDirty();
               const existing = get().items[itemId];
               if (existing && existing.content.kind === 'drawing') {
                  // Grow the box with the SAME helper the command persists with, so the optimistic view is
                  // byte-identical to the persisted one - the additive fast path (no reload) stays valid.
                  const next = appendStrokeToDrawing({ x: existing.x, y: existing.y, content: existing.content }, stroke.points, (points) => ({ ...stroke, points }));
                  const grown = { ...existing, x: next.x, y: next.y, width: next.width, height: next.height, content: { ...existing.content, strokes: next.strokes } };
                  set((state) => ({ items: { ...state.items, [itemId]: grown } }));
               }
               // Additive: a single-item content delta, so the optimistic apply above is authoritative -
               // no full reload per stroke.
               await runItemMutation(createAppendStrokeCommand(itemId, stroke), { additive: true });
            },

            eraseStrokes: async (erasures) => {
               if (erasures.length === 0) return;
               const items = get().items;
               // Build the compound: a layer stripped of every stroke is deleted (id-stable undo); the rest
               // drop the erased strokes and re-fit. Skip a layer that vanished or is no longer a drawing.
               const commands: BoardCommand[] = [];
               for (const { layerId, strokeIds } of erasures) {
                  const item = items[layerId];
                  if (!item || item.content.kind !== 'drawing') continue;
                  const removeSet = new Set(strokeIds);
                  const survivors = item.content.strokes.filter((stroke) => !removeSet.has(stroke.id));
                  commands.push(survivors.length === 0 ? createDeleteItemCommand(layerId) : createRemoveStrokesCommand(layerId, strokeIds));
               }
               if (commands.length === 0) return;
               markDirty();
               // Optimistically mirror the removals: delete emptied layers, re-fit the rest with the SAME
               // helper the command persists with, so the map is byte-identical to the repo.
               set((state) => {
                  const next = { ...state.items };
                  for (const { layerId, strokeIds } of erasures) {
                     const item = next[layerId];
                     if (!item || item.content.kind !== 'drawing') continue;
                     const removeSet = new Set(strokeIds);
                     if (item.content.strokes.every((stroke) => removeSet.has(stroke.id))) { delete next[layerId]; continue; }
                     const box = recomputeDrawingBoxWithoutMany({ x: item.x, y: item.y, content: item.content }, removeSet);
                     next[layerId] = { ...item, x: box.x, y: box.y, width: box.width, height: box.height, content: { ...item.content, strokes: box.strokes } };
                  }
                  return { items: next };
               });
               // NON-additive: a multi-item removal (+ possible layer deletes), so keep the full resync (the
               // additive fast path is only sound for a pure add / single-item content delta).
               await runItemMutation(createCompoundCommand(commands));
            },

            cacheReferenceLastKnown: async (id, content) => {
               // NOT a command and NOT markBoardModified: a reference passively mirroring
               // its source must never pollute the board's undo stack or Ctrl+Z routing.
               const existing = get().items[id];
               if (!existing) return;
               set((state) => ({ items: { ...state.items, [id]: { ...existing, content } } }));
               try {
                  await updateItem(id, { content });
               } catch (error) {
                  set({ error: toErrorMessage(error) });
               }
            },

            adoptItemDrawerSource: async (id, sourceDrawerItemId) => {
               // NOT a command and NOT markBoardModified: adopting a Save-As drawer id is
               // bookkeeping, not a user edit - it must never land on the undo stack (else Ctrl+Z
               // would unlink the twin it just created before undoing the real prior edit). Merges
               // just the source id; a copy content always carries `data`, so the merge is total.
               const existing = get().items[id];
               if (!existing) return;
               const content = { ...existing.content, sourceDrawerItemId } as BoardItemContent;
               set((state) => ({ items: { ...state.items, [id]: { ...existing, content } } }));
               try {
                  await updateItem(id, { content });
               } catch (error) {
                  set({ error: toErrorMessage(error) });
               }
            },

            cachePortalLastKnown: async (id, name) => {
               // NOT a command and NOT markBoardModified: a passive liveness cache must never touch the
               // undo stack. Read live and patch ONLY `lastKnownName`, so a concurrent style/target edit
               // (spread over the live content) survives.
               const existing = get().items[id];
               if (!existing || existing.content.kind !== 'portal') return;
               if (existing.content.lastKnownName === name) return;
               const content = { ...existing.content, lastKnownName: name };
               set((state) => ({ items: { ...state.items, [id]: { ...existing, content } } }));
               try {
                  await updateItem(id, { content });
               } catch (error) {
                  set({ error: toErrorMessage(error) });
               }
            },

            deleteItem: async (id) => {
               markDirty();
               set((state) => {
                  const items = { ...state.items };
                  delete items[id];
                  return { items };
               });
               await runItemMutation(createDeleteItemCommand(id));
            },

            setViewport: (viewport) => {
               // Camera state: applied in memory and debounce-saved, never undoable.
               set({ viewport });
               debouncedSaveViewport(viewport);
            },

            setGrid: async (grid) => {
               const boardId = get().boardId;
               if (!boardId) return;
               // A discrete choice: apply, persist immediately (with the live camera, so an
               // in-flight viewport debounce isn't clobbered), and dirty the board. Not undoable.
               set({ grid });
               markDirty();
               const record = await getBoard(boardId);
               if (record) await saveBoard({ ...record, grid, viewport: get().viewport });
            },

            renameBoard: async (name) => {
               const boardId = get().boardId;
               if (!boardId) return;
               // The tab label is bound to `name`, so this updates the tab live. Persisted
               // directly (name only), dirtying the board; not undoable, like the viewport.
               set({ name });
               markDirty();
               await renameBoardRecord(boardId, name);
            },

            setHasUnsavedChanges: (value) => {
               set({ hasUnsavedChanges: value });
            },

            saveToDrawer: async () => {
               const { boardId, viewport } = get();
               if (!boardId) return null;
               const result = await saveBoardToLinkedDrawerItem(boardId, viewport);
               if (result.linkedItemUpdated) set({ hasUnsavedChanges: false });
               return result;
            },

            linkToDrawerItem: async (drawerItemId) => {
               const { boardId, viewport } = get();
               if (!boardId) return null;
               const aggregate = await linkBoardToDrawerItem(boardId, drawerItemId, viewport);
               set({ drawerItemId, hasUnsavedChanges: false });
               return aggregate;
            },

            undo: async () => {
               // The engine reverts the repo; the in-memory view re-reads to match.
               await engine.undo();
               await syncItemsFromRepo();
            },
            redo: async () => {
               await engine.redo();
               await syncItemsFromRepo();
            },

            // Selection + hover: plain `set`s, never a command, never markDirty - view state, so it must
            // not touch the repo, the undo stack, or the dirty flag (merely clicking an item would else
            // flag the board changed and mis-route Ctrl+Z).
            selectItem: (id, additive) => {
               set((state) => {
                  if (!additive) return { selectedIds: new Set([id]) };
                  const next = new Set(state.selectedIds);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return { selectedIds: next };
               });
            },

            setSelection: (ids) => set({ selectedIds: new Set(ids) }),

            addToSelection: (ids) => set((state) => ({ selectedIds: new Set([...state.selectedIds, ...ids]) })),

            deselectItem: (id) => set((state) => {
               if (!state.selectedIds.has(id)) return state; // stable reference: no re-render when it wasn't selected
               const next = new Set(state.selectedIds);
               next.delete(id);
               return { selectedIds: next };
            }),

            clearSelection: () => set({ selectedIds: new Set() }),

            setHovered: (id) => set({ hoveredId: id }),
         },
      };
   });

   // Mirror THIS instance's engine into its own canUndo/canRedo so React tracks this
   // board's stacks (not a module-level singleton, unlike the drawer's single store).
   engine.subscribe(() => {
      useStore.setState({ canUndo: engine.canUndo(), canRedo: engine.canRedo() });
   });

   return useStore;
}

/** A single board store instance: the in-memory board view + actions, with its own undo stack. */
export type BoardStore = ReturnType<typeof createBoardStore>;
