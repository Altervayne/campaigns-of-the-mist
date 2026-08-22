// -- Library Imports --
import { KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';

// -- Hook Imports --
import { useBreakpoint } from '@/hooks/useAdaptive';

/*
 * The desktop-tree drag sensors, adapted to the pointer. On a FINE pointer a PointerSensor arms a drag
 * after a small move - the unchanged mouse feel. On a COARSE pointer (a touch tablet on the desktop tree)
 * that same small move IS a scroll, so the PointerSensor (which would catch the touch and start an
 * immediate drag) is dropped for a TouchSensor that arms only after a stationary press-and-hold: a quick
 * touch-move past the tolerance scrolls the surface instead of picking an item up. The KeyboardSensor is
 * always present for the a11y drag.
 *
 * `delay` mirrors the mobile idiom (see `useMobileDragSensors`): 500ms where the drag target shares real
 * estate with a tap (drawer rows, tabs), shorter for a dedicated grip. `tolerance` is the px of movement
 * allowed during the hold before activation is abandoned to a scroll.
 */
export function useDesktopDragSensors(delay = 500) {
   const { isCoarse } = useBreakpoint();
   const pointer = useSensor(PointerSensor, { activationConstraint: { distance: 5 } });
   const touch = useSensor(TouchSensor, { activationConstraint: { delay, tolerance: 8 } });
   const keyboard = useSensor(KeyboardSensor);
   // isCoarse is stable for a session (a width-routed tablet freezes its base), so the sensor set never
   // churns mid-session; only the primary-pointer input decides which drag sensor is live.
   return useSensors(...(isCoarse ? [touch, keyboard] : [pointer, keyboard]));
}
