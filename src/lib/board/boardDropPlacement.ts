// -- Other Library Imports --
import cuid from 'cuid';

// -- Local Imports --
import { screenToWorld } from './boardCoordinates';
import { zoneContaining } from './zoneMembership';
import { nextScopeZ } from './boardTree';

// -- Type Imports --
import type { BoardStore } from '@/lib/stores/boardStore';

/**
 * The placement (id, world rect centred on the drop, top z, joined zone) for a new board item of
 * `size` dropped at `dropPointer`. Falls back to the viewport centre when the cursor/clip is missing.
 * Shared by every board drop (a dragged drawer item, a dragged tab).
 */
export function boardDropPlacement(boardStore: BoardStore, dropPointer: { x: number; y: number } | null, size: { width: number; height: number }) {
   const { viewport, items } = boardStore.getState();
   const clip = document.querySelector('[data-board-clip]') as HTMLElement | null;
   const rect = clip?.getBoundingClientRect() ?? null;
   const screenPoint = dropPointer && rect ? dropPointer : rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
   const world = rect && screenPoint ? screenToWorld(screenPoint.x, screenPoint.y, { left: rect.left, top: rect.top }, viewport) : { x: 0, y: 0 };
   const placement = { id: cuid(), x: world.x - size.width / 2, y: world.y - size.height / 2, width: size.width, height: size.height };
   const zoneId = zoneContaining(placement, Object.values(items).filter((item) => item.kind === 'zone')) ?? undefined;
   const z = nextScopeZ(items, zoneId ?? null);
   return { ...placement, z, zoneId };
}
