// -- React Imports --
import { useCallback, useEffect, useState } from 'react';

// -- Utils Imports --
import { applyStylePatchToStrokes, isClosedShape } from '@/lib/drawing/strokeStyle';

// -- Type Imports --
import type { BoardState, BoardStore } from '@/lib/stores/boardStore';
import type { StrokeSelection } from './useBoardTransform';
import type { StrokeStylePatch } from '@/lib/drawing/strokeStyle';
import type { StrokeStylePreview } from '@/lib/board/StrokeStylePreviewContext';

interface UseStrokeStyleEditingArgs {
   store: BoardStore;
   actions: BoardState['actions'];
   selection: StrokeSelection | null;
}

/*
 * The transform tool's STYLE editing half: a live, uncommitted style patch for the selection (previewed on
 * the layer without a store write) plus the one committed write. A color / width control drags -> `previewStyle`
 * paints live; release -> `commitStyle` writes ONE `updateItemContent` (content-only, the box is unchanged by a
 * style edit). A discrete toggle (brush / fill) commits straight away. The preview drops whenever the selection
 * clears. Flip is geometry (it moves points), so it lives in `useBoardTransform`, not here.
 */
export function useStrokeStyleEditing({ store, actions, selection }: UseStrokeStyleEditingArgs) {
   const [stylePreview, setStylePreview] = useState<StrokeStylePreview | null>(null);

   /** Paints the selection with a live patch (no store write); the swatch / slider drives it while dragging. */
   const previewStyle = useCallback((patch: StrokeStylePatch) => {
      if (!selection) return;
      setStylePreview({ layerId: selection.layerId, strokeIds: selection.strokeIds, patch });
   }, [selection]);

   /**
    * Commits a style patch to the selected strokes as ONE undo step and drops the live preview. A patch that
    * changes nothing (a re-picked identical color) clears the preview but skips the write, so the undo stack
    * stays clean. Content-only: a style edit never moves a point, so the box holds and no refit is needed.
    */
   const commitStyle = useCallback((patch: StrokeStylePatch) => {
      setStylePreview(null);
      if (!selection) return;
      const layer = store.getState().items[selection.layerId];
      if (!layer || layer.content.kind !== 'drawing') return;
      const changes = layer.content.strokes.some((stroke) => {
         if (!selection.strokeIds.has(stroke.id)) return false;
         if (patch.color !== undefined && stroke.color !== patch.color) return true;
         if (patch.width !== undefined && stroke.width !== patch.width) return true;
         if (patch.brush !== undefined && stroke.brush !== patch.brush) return true;
         if (patch.filled !== undefined && isClosedShape(stroke) && !!stroke.filled !== patch.filled) return true;
         return false;
      });
      if (!changes) return;
      const nextStrokes = applyStylePatchToStrokes(layer.content.strokes, selection.strokeIds, patch);
      void actions.updateItemContent(selection.layerId, { ...layer.content, strokes: nextStrokes });
   }, [selection, store, actions]);

   // A cleared selection (tool / board switch, Esc, marquee-to-empty) can't carry a preview.
   useEffect(() => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!selection) setStylePreview(null);
   }, [selection]);

   return { stylePreview, previewStyle, commitStyle };
}
