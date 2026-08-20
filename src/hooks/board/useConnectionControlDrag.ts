// -- React Imports --
import { useRef, type PointerEvent as ReactPointerEvent } from 'react';

// -- Utils Imports --
import { bezierControlPoints, draggedControlOffset } from '@/lib/board/connectionPath';

// -- Type Imports --
import type { Point } from '@/lib/board/boardConnections';
import type { ConnectionControls } from '@/lib/types/board';

/*
 * The drag gesture for a bezier connection's two control handles, owned here so the layer stays lean.
 * Pointer-capture based (like the item resize/rotate grips): a handle-down snapshots that control's start
 * world position + the other control's current offset, then each move re-derives the dragged offset and
 * drives a live preview; one command commits on release. The other control is held at its current
 * (stored-or-auto) offset so only the grabbed handle moves. Screen-space math (delta / zoom) needs no
 * camera plumbing - a uniform world scale preserves the drag direction.
 */

/** The selected bezier's live geometry the drag reads at grab time. */
interface ControlDragTarget {
   from: Point;
   to: Point;
   /** Current stored offsets, or absent for the auto placement. */
   controls?: ConnectionControls;
}

interface UseConnectionControlDragArgs {
   /** The selected bezier connection's endpoints + controls, or null when none is editable. */
   target: ControlDragTarget | null;
   zoom: number;
   /** Live preview during the drag (both offsets, dragged one updated), or null to clear. */
   onPreview: (controls: ConnectionControls | null) => void;
   /** The single undoable commit on release. */
   onCommit: (controls: ConnectionControls) => void;
}

type Which = 'c1' | 'c2';

interface DragGesture {
   which: Which;
   startClientX: number;
   startClientY: number;
   /** The dragged control's world position at grab. */
   startControlWorld: Point;
   /** The endpoint the dragged offset is relative to (`from` for c1, `to` for c2). */
   endpoint: Point;
   /** Both controls' offsets at grab; the untouched one is held here. */
   baseOffsets: ConnectionControls;
   zoom: number;
   /** The latest previewed controls, committed on release; null until the first real move. */
   latest: ConnectionControls | null;
}

export function useConnectionControlDrag({ target, zoom, onPreview, onCommit }: UseConnectionControlDragArgs) {
   const gesture = useRef<DragGesture | null>(null);

   const onPointerDown = (which: Which, event: ReactPointerEvent) => {
      if (event.button !== 0 || !target) return;
      event.stopPropagation();
      const { from, to, controls } = target;
      const world = bezierControlPoints(from, to, controls);
      // Both offsets at grab (whether stored or auto), so the untouched control stays put.
      const baseOffsets: ConnectionControls = {
         c1: { x: world.c1.x - from.x, y: world.c1.y - from.y },
         c2: { x: world.c2.x - to.x, y: world.c2.y - to.y },
      };
      gesture.current = {
         which,
         startClientX: event.clientX,
         startClientY: event.clientY,
         startControlWorld: which === 'c1' ? world.c1 : world.c2,
         endpoint: which === 'c1' ? from : to,
         baseOffsets,
         zoom,
         latest: null,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
   };

   const onPointerMove = (event: ReactPointerEvent) => {
      const active = gesture.current;
      if (!active) return;
      const screenDelta = { x: event.clientX - active.startClientX, y: event.clientY - active.startClientY };
      const offset = draggedControlOffset(active.startControlWorld, active.endpoint, screenDelta, active.zoom);
      const next: ConnectionControls = { ...active.baseOffsets, [active.which]: offset };
      active.latest = next;
      onPreview(next);
   };

   const onPointerUp = (event: ReactPointerEvent) => {
      const active = gesture.current;
      gesture.current = null;
      // Commit before releasing capture so a release-time throw can't lose the edit; skip a no-move turn.
      if (active?.latest) onCommit(active.latest);
      onPreview(null);
      event.currentTarget.releasePointerCapture(event.pointerId);
   };

   return { onPointerDown, onPointerMove, onPointerUp };
}
