// -- Utils Imports --
import { toolbarClampDown, toolbarClampX } from '@/lib/board/boardCoordinates';
import { groupToolbarZIndex } from '@/lib/board/boardLayering';

// -- Custom Hooks --
import { useToolbarMetrics } from '@/hooks/board/useToolbarMetrics';

// -- Component Imports --
import { BoardStrokeStyleToolbar } from '../BoardStrokeStyleToolbar';

// -- Type Imports --
import type { Viewport } from '@/lib/types/board';
import type { StrokeStyleFold, StrokeStylePatch } from '@/lib/drawing/strokeStyle';
import type { StrokeStructureOp } from '@/lib/drawing/strokeStructure';

interface Bbox {
   x: number;
   y: number;
   width: number;
   height: number;
}

/*
 * Positions the transform style toolbar over the stroke selection's world bbox and re-arms its sideways clamp
 * from its own measured width - the same inert-anchor pattern as the group toolbar. Mounted only while a
 * stroke selection is being styled, so its toolbar-metrics observer lives and dies with the selection.
 */
export function BoardStrokeStyleToolbarSlot({ toolbar, viewport, clipWidth, clipHeight, layerCount, onPreviewStyle, onCommitStyle, onFlip, onStructure }: {
   toolbar: { bbox: Bbox; fold: StrokeStyleFold };
   viewport: Viewport;
   clipWidth: number;
   clipHeight: number;
   layerCount: number;
   onPreviewStyle: (patch: StrokeStylePatch) => void;
   onCommitStyle: (patch: StrokeStylePatch) => void;
   onFlip: (axis: 'x' | 'y') => void;
   onStructure: (op: StrokeStructureOp) => void;
}) {
   const bar = useToolbarMetrics();
   const { bbox } = toolbar;
   return (
      <div className="pointer-events-none absolute" style={{ left: bbox.x, top: bbox.y, width: bbox.width, height: bbox.height, zIndex: groupToolbarZIndex(layerCount) }}>
         <BoardStrokeStyleToolbar
            zoom={viewport.zoom}
            fold={toolbar.fold}
            onPreviewStyle={onPreviewStyle}
            onCommitStyle={onCommitStyle}
            onFlip={onFlip}
            onStructure={onStructure}
            clampDown={toolbarClampDown(bbox.y, viewport, clipHeight)}
            clampX={toolbarClampX(bbox.x + bar.metrics.anchorOffset, bar.metrics.screenWidth, 'left', clipWidth, viewport)}
            measureRef={bar.measureRef}
         />
      </div>
   );
}
