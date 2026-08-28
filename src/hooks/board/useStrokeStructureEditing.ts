// -- React Imports --
import { useCallback, type Dispatch, type SetStateAction } from 'react';

// -- Library Imports --
import cuid from 'cuid';

// -- Utils Imports --
import { duplicateStrokes, reorderStrokes, type StrokeReorder } from '@/lib/drawing/strokeStructure';

// -- Type Imports --
import type { BoardState, BoardStore } from '@/lib/stores/boardStore';
import type { StrokeSelection } from './useBoardTransform';

interface UseStrokeStructureEditingArgs {
   store: BoardStore;
   actions: BoardState['actions'];
   selection: StrokeSelection | null;
   setSelection: Dispatch<SetStateAction<StrokeSelection | null>>;
}

/*
 * The transform tool's STRUCTURAL editing half: delete / duplicate / reorder-within-layer on the stroke
 * selection, each committing as ONE undo step. Delete reuses `eraseStrokes` (which already handles the
 * empty-layer cleanup); duplicate appends offset copies through `transformStrokes` (box refits to the grown
 * ink) and re-selects the copies; reorder is a content-only paint-order splice. Split out of
 * `useBoardTransform`, which owns the selection state and passes it plus its setter in.
 */
export function useStrokeStructureEditing({ store, actions, selection, setSelection }: UseStrokeStructureEditingArgs) {
   /**
    * Deletes the selected strokes and clears the selection. Reuses `eraseStrokes`, which already handles the
    * two cases as ONE undo step: a layer stripped of every stroke is deleted (id-stable), a partial removal
    * drops the strokes and re-fits the box.
    */
   const deleteSelection = useCallback(() => {
      if (!selection || selection.strokeIds.size === 0) return;
      void actions.eraseStrokes([{ layerId: selection.layerId, strokeIds: [...selection.strokeIds] }]);
      setSelection(null);
   }, [selection, actions, setSelection]);

   /**
    * Duplicates the selected strokes: fresh ids + a small offset, appended after the originals (so the copies
    * paint on top), committed through `transformStrokes` so the box re-fits to the grown ink in ONE undo step.
    * Selects the copies, so the next drag grabs them (the copy is offset off the original for exactly that).
    */
   const duplicateSelection = useCallback(() => {
      if (!selection || selection.strokeIds.size === 0) return;
      const layer = store.getState().items[selection.layerId];
      if (!layer || layer.content.kind !== 'drawing') return;
      const { strokes: nextStrokes, newIds } = duplicateStrokes(layer.content.strokes, selection.strokeIds, cuid);
      if (newIds.size === 0) return;
      void actions.transformStrokes(selection.layerId, nextStrokes);
      setSelection({ layerId: selection.layerId, strokeIds: newIds });
   }, [selection, store, actions, setSelection]);

   /**
    * Reorders the selected strokes within the layer's paint order (array order = paint order). Content-only
    * (no point moves, box unchanged), so it commits through `updateItemContent` as ONE undo step and keeps
    * the selection.
    */
   const reorderSelection = useCallback((edge: StrokeReorder) => {
      if (!selection || selection.strokeIds.size === 0) return;
      const layer = store.getState().items[selection.layerId];
      if (!layer || layer.content.kind !== 'drawing') return;
      const nextStrokes = reorderStrokes(layer.content.strokes, selection.strokeIds, edge);
      if (nextStrokes === layer.content.strokes) return;
      void actions.updateItemContent(selection.layerId, { ...layer.content, strokes: nextStrokes });
   }, [selection, store, actions]);

   return { deleteSelection, duplicateSelection, reorderSelection };
}
