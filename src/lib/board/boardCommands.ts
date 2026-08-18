// -- Local Imports --
import { BoardNotFoundError } from './boardErrors';
import { appendStrokeToDrawing, mergeDrawings, rebasePoints, recomputeDrawingBoxWithout, recomputeDrawingBoxWithoutMany } from './drawingStyle';
import {
   addItem,
   deleteItem,
   getItem,
   listItems,
   putItem,
   updateItem,
} from './boardRepository';

// -- Type Imports --
import type { BoardItemRecord } from './boardRecords';
import type { BoardItemContent, Stroke } from '@/lib/types/board';

/*
 * Operation/command-based undo for the board, mirroring the drawer's command engine.
 * Each command captures only the inverse delta it needs to revert itself; the engine
 * keeps in-memory undo/redo stacks. Pure logic over the repository - no React, no
 * store, no toasts. Commands operate by id, so they revert correctly regardless of
 * the current viewport.
 *
 * Connections need no special commands: they are board items with `kind: 'connection'`,
 * so create/delete/update-content reach them like any other item (a connection's
 * {from, to, style} lives in its content, so restyling is an update-content command).
 *
 * The viewport (pan/zoom) is not a command: it persists on the board record and is
 * never undoable.
 */

/**
 * A single reversible board operation.
 *
 * `do()` performs the operation (and is re-run for redo); `undo()` reverts it using
 * data the command captured. A command captures whatever it needs to revert
 * before/while `do()` mutates, and is written so re-running `do()` from that captured
 * state is id-stable (a create re-inserts its original record rather than minting a
 * new id).
 */
export interface BoardCommand {
   /** Diagnostic label (not shown to users). */
   readonly label: string;
   /**
    * Optional coalescing key. Consecutive commands with the same key, executed within
    * the engine's coalescing window, merge into one undo step.
    */
   readonly coalesceKey?: string;
   /** Performs (or redoes) the operation. */
   do(): Promise<void>;
   /** Reverts the operation using captured inverse data. */
   undo(): Promise<void>;
   /**
    * Folds a later coalescing-compatible command into this one: this command keeps its
    * original "before" state and adopts the other's "after" state. Present only on
    * coalescible commands (move, resize).
    */
   mergeCoalesced?(next: BoardCommand): void;
}

// ==================
//  z helpers
// ==================

/**
 * The z to put a new (or brought-to-front) item above everything else: `max(z) + 1`.
 * z is a free integer, so this never reindexes the rest. Empty board -> 0.
 */
export async function nextZ(boardId: string): Promise<number> {
   const items = await listItems(boardId);
   if (items.length === 0) return 0;
   return Math.max(...items.map((item) => item.z)) + 1;
}

/** The z to send an item below everything else: `min(z) - 1`. Empty board -> 0. */
export async function bottomZ(boardId: string): Promise<number> {
   const items = await listItems(boardId);
   if (items.length === 0) return 0;
   return Math.min(...items.map((item) => item.z)) - 1;
}

// ==================
//  Command set - one per current board mutation
// ==================

/**
 * Add an item (any kind, including connection). The record carries its own id, so
 * `do()` re-puts it verbatim on redo (id-stable); undo deletes it by id.
 */
export function createAddItemCommand(record: BoardItemRecord): BoardCommand {
   return {
      label: 'add-item',
      async do() {
         await putItem(record);
      },
      async undo() {
         await deleteItem(record.id);
      },
   };
}

/**
 * Move an item. Captures the original x,y on first `do()`; undo restores it.
 * Coalescible (`move:<id>`): a drag burst collapses to one undo step that keeps the
 * burst's original "before" and adopts the latest "after".
 */
class BoardMoveCommand implements BoardCommand {
   readonly label = 'move-item';
   readonly coalesceKey: string;
   private readonly id: string;
   private before: { x: number; y: number } | null = null;
   /** Public so a coalescing merge can adopt a later command's target position. */
   after: { x: number; y: number };

   constructor(id: string, position: { x: number; y: number }) {
      this.id = id;
      this.after = position;
      this.coalesceKey = `move:${id}`;
   }

   async do(): Promise<void> {
      if (this.before === null) {
         const item = await getItem(this.id);
         if (!item) throw new BoardNotFoundError(`Board item not found: ${this.id}`);
         this.before = { x: item.x, y: item.y };
      }
      await updateItem(this.id, { x: this.after.x, y: this.after.y });
   }

   async undo(): Promise<void> {
      if (this.before !== null) await updateItem(this.id, { x: this.before.x, y: this.before.y });
   }

   mergeCoalesced(next: BoardCommand): void {
      if (next instanceof BoardMoveCommand) this.after = next.after;
   }
}

/** Move an item to a new position (coalescible). */
export function createMoveItemCommand(id: string, position: { x: number; y: number }): BoardCommand {
   return new BoardMoveCommand(id, position);
}

/** A resize patch: new dimensions, plus x/y when a corner resize also repositions. */
export interface ResizePatch {
   width: number;
   height: number;
   x?: number;
   y?: number;
}

/**
 * Resize an item. Captures the original dimensions on first `do()`, plus x,y when the
 * patch repositions (corner resize); undo restores them. Coalescible (`resize:<id>`):
 * a resize burst collapses to one undo step, keeping the original "before".
 */
class BoardResizeCommand implements BoardCommand {
   readonly label = 'resize-item';
   readonly coalesceKey: string;
   private readonly id: string;
   private before: ResizePatch | null = null;
   /** Public so a coalescing merge can adopt a later command's target size. */
   after: ResizePatch;

   constructor(id: string, patch: ResizePatch) {
      this.id = id;
      this.after = patch;
      this.coalesceKey = `resize:${id}`;
   }

   async do(): Promise<void> {
      if (this.before === null) {
         const item = await getItem(this.id);
         if (!item) throw new BoardNotFoundError(`Board item not found: ${this.id}`);
         const before: ResizePatch = { width: item.width, height: item.height };
         if (this.after.x !== undefined) before.x = item.x;
         if (this.after.y !== undefined) before.y = item.y;
         this.before = before;
      }
      await updateItem(this.id, this.after);
   }

   async undo(): Promise<void> {
      if (this.before !== null) await updateItem(this.id, this.before);
   }

   mergeCoalesced(next: BoardCommand): void {
      if (next instanceof BoardResizeCommand) this.after = next.after;
   }
}

/** Resize (and optionally reposition) an item (coalescible). */
export function createResizeItemCommand(id: string, patch: ResizePatch): BoardCommand {
   return new BoardResizeCommand(id, patch);
}

/**
 * Rotate an item to an absolute angle (degrees). Captures the original rotation on first `do()`; undo
 * restores it. Coalescible (`rotate:<id>`): a rotate burst collapses to one undo step, keeping the
 * original "before".
 */
class BoardRotateCommand implements BoardCommand {
   readonly label = 'rotate-item';
   readonly coalesceKey: string;
   private readonly id: string;
   private before: number | null = null;
   /** Public so a coalescing merge can adopt a later command's target angle. */
   after: number;

   constructor(id: string, rotation: number) {
      this.id = id;
      this.after = rotation;
      this.coalesceKey = `rotate:${id}`;
   }

   async do(): Promise<void> {
      if (this.before === null) {
         const item = await getItem(this.id);
         if (!item) throw new BoardNotFoundError(`Board item not found: ${this.id}`);
         this.before = item.rotation ?? 0;
      }
      await updateItem(this.id, { rotation: this.after });
   }

   async undo(): Promise<void> {
      if (this.before !== null) await updateItem(this.id, { rotation: this.before });
   }

   mergeCoalesced(next: BoardCommand): void {
      if (next instanceof BoardRotateCommand) this.after = next.after;
   }
}

/** Rotate an item to an absolute angle in degrees (coalescible). */
export function createRotateItemCommand(id: string, rotation: number): BoardCommand {
   return new BoardRotateCommand(id, rotation);
}

/**
 * Set an item's z. Captures the previous z on first `do()`; undo restores it. z is a
 * free integer (see {@link nextZ}/{@link bottomZ}), so this never reindexes siblings.
 */
export function createSetItemZCommand(id: string, z: number): BoardCommand {
   let previousZ: number | null = null;
   return {
      label: 'set-item-z',
      async do() {
         if (previousZ === null) {
            const item = await getItem(id);
            if (!item) throw new BoardNotFoundError(`Board item not found: ${id}`);
            previousZ = item.z;
         }
         await updateItem(id, { z });
      },
      async undo() {
         if (previousZ !== null) await updateItem(id, { z: previousZ });
      },
   };
}

/**
 * Set (or clear) an item's display label. Captures the previous label on first `do()`; undo restores it.
 * `undefined` clears the label (the panel falls back to the kind-derived name). Undoable, so a rename is a
 * Ctrl+Z-reachable edit - unlike the board rename, which is a direct write.
 */
export function createSetItemLabelCommand(id: string, label: string | undefined): BoardCommand {
   let previousLabel: string | undefined;
   let captured = false;
   return {
      label: 'set-item-label',
      async do() {
         if (!captured) {
            const item = await getItem(id);
            if (!item) throw new BoardNotFoundError(`Board item not found: ${id}`);
            previousLabel = item.label;
            captured = true;
         }
         await updateItem(id, { label });
      },
      async undo() {
         if (captured) await updateItem(id, { label: previousLabel });
      },
   };
}

/**
 * Replace an item's content. Captures the previous content on first `do()`; undo
 * restores it. Covers note/journal text edits, image assetId swaps, and connection
 * restyling (a connection's {from, to, style} lives in its content).
 */
export function createUpdateItemContentCommand(id: string, content: BoardItemContent): BoardCommand {
   let previousContent: BoardItemContent | null = null;
   return {
      label: 'update-item-content',
      async do() {
         if (previousContent === null) {
            const item = await getItem(id);
            if (!item) throw new BoardNotFoundError(`Board item not found: ${id}`);
            previousContent = item.content;
         }
         await updateItem(id, { content });
      },
      async undo() {
         if (previousContent !== null) await updateItem(id, { content: previousContent });
      },
   };
}

/**
 * Replace an item's content AND box size together, so undo reverts both as one step (a portal poster
 * wearing its crop shape: the visual + the reshaped box move together). Captures the previous
 * {content, width, height} on first `do()`; x/y never change.
 */
export function createUpdateItemContentAndSizeCommand(id: string, content: BoardItemContent, width: number, height: number): BoardCommand {
   let before: { content: BoardItemContent; width: number; height: number } | null = null;
   return {
      label: 'update-item-content-and-size',
      async do() {
         if (before === null) {
            const item = await getItem(id);
            if (!item) throw new BoardNotFoundError(`Board item not found: ${id}`);
            before = { content: item.content, width: item.width, height: item.height };
         }
         await updateItem(id, { content, width, height });
      },
      async undo() {
         if (before !== null) await updateItem(id, before);
      },
   };
}

/**
 * Append a stroke to a drawing layer, growing the layer's box to the full ink extent. A pure DELTA both
 * ways (holds only the added stroke, O(1) memory): `do()` reads the layer live and folds the stroke into
 * the box (origin/size + re-based strokes); `undo()` reads live and re-fits the box to the strokes that
 * remain. The stroke's `points` are WORLD coords - its ink position is invariant under the box re-basing,
 * so `do()` is idempotent for redo and stays id-stable via the stroke's own id. Unlike
 * {@link createUpdateItemContentCommand} it never snapshots the whole strokes array, so a long sketch
 * stays O(N) memory across N per-stroke undo entries. No-ops if the target is missing or no longer a
 * drawing (a concurrent delete raced the append).
 */
export function createAppendStrokeCommand(id: string, stroke: Stroke): BoardCommand {
   const makeStroke = (points: number[]): Stroke => ({ ...stroke, points });
   return {
      label: 'append-stroke',
      async do() {
         const item = await getItem(id);
         if (!item) throw new BoardNotFoundError(`Board item not found: ${id}`);
         if (item.content.kind !== 'drawing') return;
         const next = appendStrokeToDrawing({ x: item.x, y: item.y, content: item.content }, stroke.points, makeStroke);
         await updateItem(id, { x: next.x, y: next.y, width: next.width, height: next.height, content: { ...item.content, strokes: next.strokes } });
      },
      async undo() {
         const item = await getItem(id);
         if (!item || item.content.kind !== 'drawing') return;
         const next = recomputeDrawingBoxWithout({ x: item.x, y: item.y, content: item.content }, stroke.id);
         await updateItem(id, { x: next.x, y: next.y, width: next.width, height: next.height, content: { ...item.content, strokes: next.strokes } });
      },
   };
}

/**
 * Remove several strokes from a drawing layer as one step (an eraser gesture's forward action). A pure DELTA
 * (holds only the erased strokes, O(erased) memory): `do()` reads the layer live, captures the removed strokes
 * in WORLD coords, and re-fits the box to the survivors; `undo()` folds each captured world-stroke back via
 * {@link appendStrokeToDrawing}, so the box re-grows and points re-base to whatever the current origin is.
 * World capture makes re-insertion frame-independent - exactly like an append - so undo lands the ink at its
 * original place regardless of how the box shifted meanwhile. No-ops if the target is missing or no longer a
 * drawing. Used only for a PARTIAL removal; a layer whose last stroke is erased is deleted instead.
 */
export function createRemoveStrokesCommand(id: string, strokeIds: string[]): BoardCommand {
   const idSet = new Set(strokeIds);
   let removedWorld: Stroke[] | null = null;
   return {
      label: 'remove-strokes',
      async do() {
         const item = await getItem(id);
         if (!item) throw new BoardNotFoundError(`Board item not found: ${id}`);
         if (item.content.kind !== 'drawing') return;
         if (!removedWorld) {
            removedWorld = item.content.strokes
               .filter((stroke) => idSet.has(stroke.id))
               .map((stroke) => ({ ...stroke, points: rebasePoints(stroke.points, -item.x, -item.y) }));
         }
         const next = recomputeDrawingBoxWithoutMany({ x: item.x, y: item.y, content: item.content }, idSet);
         await updateItem(id, { x: next.x, y: next.y, width: next.width, height: next.height, content: { ...item.content, strokes: next.strokes } });
      },
      async undo() {
         if (!removedWorld) return;
         const item = await getItem(id);
         if (!item || item.content.kind !== 'drawing') return;
         let x = item.x;
         let y = item.y;
         let width = item.width;
         let height = item.height;
         let content = item.content;
         for (const stroke of removedWorld) {
            const next = appendStrokeToDrawing({ x, y, content }, stroke.points, (points) => ({ ...stroke, points }));
            x = next.x;
            y = next.y;
            width = next.width;
            height = next.height;
            content = { ...content, strokes: next.strokes };
         }
         await updateItem(id, { x, y, width, height, content });
      },
   };
}

/**
 * Merge several drawing layers into `targetId` as one step: folds every source layer's strokes into the
 * target (growing its box to the union) and writes the target's new origin/size/content TOGETHER, so undo
 * reverts the box shift with the content. Captures the target's full before-state {x,y,width,height,content}
 * on first `do()` and restores it on undo (mirrors {@link createAppendStrokeCommand}'s co-write; unlike
 * {@link createUpdateItemContentCommand}, which would leave the shifted origin behind). Recomputes the fold
 * live each `do()` reading the sources - they still exist when this runs (it's ordered before their deletes
 * in the compound, and undo restores them), so redo folds identically. The source deletes ride the same
 * compound (see the store); this command only rewrites the target. No-ops if the target is missing or no
 * longer a drawing.
 */
export function createMergeDrawingsCommand(targetId: string, sourceIds: string[]): BoardCommand {
   let before: { x: number; y: number; width: number; height: number; content: BoardItemContent } | null = null;
   return {
      label: 'merge-drawings',
      async do() {
         const target = await getItem(targetId);
         if (!target) throw new BoardNotFoundError(`Board item not found: ${targetId}`);
         if (target.content.kind !== 'drawing') return;
         if (!before) before = { x: target.x, y: target.y, width: target.width, height: target.height, content: target.content };
         // Read every source live (they precede their own deletes in the compound); non-drawing / vanished
         // sources are skipped, so a raced delete can't corrupt the fold.
         const sources: { x: number; y: number; content: typeof target.content }[] = [];
         for (const id of sourceIds) {
            const source = await getItem(id);
            if (source && source.content.kind === 'drawing') sources.push({ x: source.x, y: source.y, content: source.content });
         }
         const merged = mergeDrawings({ x: target.x, y: target.y, content: target.content }, sources);
         await updateItem(targetId, { x: merged.x, y: merged.y, width: merged.width, height: merged.height, content: { ...target.content, strokes: merged.strokes } });
      },
      async undo() {
         if (before) await updateItem(targetId, before);
      },
   };
}

/**
 * Set (or clear) an item's zone membership. Captures the previous `zoneId` on first `do()`;
 * undo restores it. `null` clears membership (the item leaves every zone). Bundled into the
 * same compound as the move/delete that triggered it, so a membership change reverts as one step.
 */
export function createSetItemZoneCommand(id: string, zoneId: string | null): BoardCommand {
   let previousZoneId: string | null | undefined;
   let captured = false;
   return {
      label: 'set-item-zone',
      async do() {
         if (!captured) {
            const item = await getItem(id);
            if (!item) throw new BoardNotFoundError(`Board item not found: ${id}`);
            previousZoneId = item.zoneId;
            captured = true;
         }
         await updateItem(id, { zoneId: zoneId ?? undefined });
      },
      async undo() {
         if (captured) await updateItem(id, { zoneId: previousZoneId ?? undefined });
      },
   };
}

/**
 * Bundles several commands into one undo step: `do()` runs them in order, `undo()`
 * reverts in reverse order. Used for group move/delete/duplicate, where the whole
 * operation must be a single Ctrl+Z. Not coalescible (a group op is one discrete step).
 */
export function createCompoundCommand(commands: BoardCommand[]): BoardCommand {
   return {
      label: 'compound',
      async do() {
         for (const command of commands) await command.do();
      },
      async undo() {
         for (let i = commands.length - 1; i >= 0; i--) await commands[i].undo();
      },
   };
}

/**
 * Delete an item (any kind, including connection). Captures the full record before
 * deleting; undo re-adds it verbatim (id-stable), and redo deletes it again.
 */
export function createDeleteItemCommand(id: string): BoardCommand {
   let capturedRecord: BoardItemRecord | null = null;
   return {
      label: 'delete-item',
      async do() {
         if (!capturedRecord) {
            const item = await getItem(id);
            if (!item) throw new BoardNotFoundError(`Board item not found: ${id}`);
            capturedRecord = item;
         }
         await deleteItem(id);
      },
      async undo() {
         if (capturedRecord) await addItem(capturedRecord);
      },
   };
}
