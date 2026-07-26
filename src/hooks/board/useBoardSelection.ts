// -- React Imports --
import { useCallback, useEffect, useState } from 'react';

// -- Other Library Imports --
import { useStore } from 'zustand';

// -- Type Imports --
import type { BoardState, BoardStore } from '@/lib/stores/boardStore';

/*
 * Selection + text-editing sub-state. Owns the delete / duplicate handlers, the sole-selection derivation,
 * the multi-select group bounding box, and the editing lifecycle (an item enters editing on a body click,
 * exits the moment it stops being the sole selection or on Escape). Subscribes to `selectedIds` in the store;
 * `moveDeltaFor` (the live group-move delta) is injected so the group bbox tracks an in-progress drag.
 */
export function useBoardSelection(
   store: BoardStore,
   actions: BoardState['actions'],
   items: BoardState['items'],
   moveDeltaFor: (id: string) => { x: number; y: number } | null,
) {
   // Selection lives in the board store as ephemeral state (shared with the layers panel), never
   // persisted or routed through commands. Read here; mutated via the store's selection actions.
   const selectedIds = useStore(store, (state) => state.selectedIds);
   // The item in its text-edit sub-state (post-it / journal / text), or null. Ephemeral canvas state,
   // decoupled from selection: a text item is selected first, then a body click promotes it to editing
   // (a focused editor). Cleared when it stops being the sole selection or on Escape (see the effects below).
   const [editingId, setEditingId] = useState<string | null>(null);

   /** Deletes one item plus the connections referencing it (cascade + dedupe), as one undo step. */
   const handleDelete = useCallback(
      (id: string) => {
         void actions.deleteItems([id]);
         actions.deselectItem(id);
      },
      [actions],
   );

   /** Deletes the whole selection (with connection cascade) as one undo step, then clears it. */
   const handleDeleteSelection = useCallback(() => {
      if (selectedIds.size === 0) return;
      void actions.deleteItems([...selectedIds]);
      actions.clearSelection();
   }, [actions, selectedIds]);

   /** Duplicates the selection (copies + in-selection connections, offset), then selects the copies. */
   const handleDuplicateSelection = useCallback(async () => {
      if (selectedIds.size === 0) return;
      const newIds = await actions.duplicateItems([...selectedIds]);
      actions.setSelection(newIds);
   }, [actions, selectedIds]);

   // Derived selection chrome. One selected -> the per-item toolbar.
   const soleSelectedId = selectedIds.size === 1 ? [...selectedIds][0] : null;

   // Editing exits the moment its item stops being the sole selection - clicking away, selecting another
   // item, multi-selecting, or the item's deletion all flow through here (the editor's own falling-edge
   // and unmount flushes then commit the buffer). Editing is only ever the sole selection.
   useEffect(() => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (editingId && editingId !== soleSelectedId) setEditingId(null);
   }, [editingId, soleSelectedId]);

   // Escape leaves editing (back to a plain selection) without deleting anything; the editor's falling-edge
   // flush commits the buffer as it unmounts. Armed only while editing, so it never shadows other Escape uses.
   useEffect(() => {
      if (!editingId) return;
      const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setEditingId(null); };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
   }, [editingId]);

   // Two+ selected spatial items -> a group toolbar over their bounding box (shifted live
   // during a group move). Connections (zero-size) don't anchor it.
   const groupBbox = (() => {
      if (selectedIds.size < 2) return null;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, count = 0;
      for (const id of selectedIds) {
         const item = items[id];
         if (!item || item.kind === 'connection') continue;
         const delta = moveDeltaFor(id) ?? { x: 0, y: 0 };
         minX = Math.min(minX, item.x + delta.x);
         minY = Math.min(minY, item.y + delta.y);
         maxX = Math.max(maxX, item.x + item.width + delta.x);
         maxY = Math.max(maxY, item.y + item.height + delta.y);
         count++;
      }
      return count >= 2 ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : null;
   })();

   return {
      selectedIds,
      editingId,
      setEditingId,
      soleSelectedId,
      groupBbox,
      handleDelete,
      handleDeleteSelection,
      handleDuplicateSelection,
   };
}
