// -- React Imports --
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

// -- Utils Imports --
import { ROTATE_SNAP_DEG, normalizeAngle, pointerAngleDeg, snapAngle } from '@/lib/board/boardRotation';

// -- Type Imports --
import type { BoardItem } from '@/lib/types/board';

/*
 * The rotate gesture for one board item, owned here so the box component stays lean. The handle sits above
 * the box (inside its transformed frame), so a pointer-down grabs the box's screen center from its bounding
 * rect - which is the center-origin rotation pivot, invariant under the current angle. The angle math runs
 * in screen coords: a uniform world scale + translate preserves angles about a point, so no camera plumbing
 * is needed. The live angle drives a preview via local state; one command commits on pointer-up.
 */

interface UseBoardItemRotateArgs {
   item: BoardItem;
   /** Commits the final angle (undoable). */
   onRotate: (id: string, rotation: number) => void;
}

interface RotateGesture {
   /** The box's screen-space center (the rotation pivot), fixed for the gesture. */
   centerX: number;
   centerY: number;
   /** The pointer's angle at grab, and the item's angle at grab. */
   startAngle: number;
   startRotation: number;
   /** The latest live angle, committed on release. */
   latest: number;
}

export function useBoardItemRotate({ item, onRotate }: UseBoardItemRotateArgs) {
   // The live angle during a drag (null when idle); the box reads it in place of the stored rotation.
   const [liveRotation, setLiveRotation] = useState<number | null>(null);
   const gesture = useRef<RotateGesture | null>(null);

   const onPointerDown = (event: ReactPointerEvent) => {
      if (event.button !== 0) return; // right-click is for the radial menu
      event.stopPropagation();
      const box = event.currentTarget.closest('[data-board-item-id]');
      if (!box) return;
      const rect = box.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const startRotation = item.rotation ?? 0;
      gesture.current = {
         centerX,
         centerY,
         startAngle: pointerAngleDeg(centerX, centerY, event.clientX, event.clientY),
         startRotation,
         latest: normalizeAngle(startRotation),
      };
      setLiveRotation(normalizeAngle(startRotation));
      event.currentTarget.setPointerCapture(event.pointerId);
   };

   const onPointerMove = (event: ReactPointerEvent) => {
      const active = gesture.current;
      if (!active) return;
      const angle = pointerAngleDeg(active.centerX, active.centerY, event.clientX, event.clientY);
      let next = active.startRotation + (angle - active.startAngle);
      if (event.shiftKey) next = snapAngle(next, ROTATE_SNAP_DEG); // Shift snaps to common angles, read live
      next = normalizeAngle(next);
      active.latest = next;
      setLiveRotation(next);
   };

   const onPointerUp = (event: ReactPointerEvent) => {
      const active = gesture.current;
      gesture.current = null;
      // Commit before releasing capture so a release-time throw can't lose the angle; skip a no-op turn.
      if (active && active.latest !== normalizeAngle(active.startRotation)) onRotate(item.id, active.latest);
      setLiveRotation(null);
      event.currentTarget.releasePointerCapture(event.pointerId);
   };

   return { liveRotation, onPointerDown, onPointerMove, onPointerUp };
}
