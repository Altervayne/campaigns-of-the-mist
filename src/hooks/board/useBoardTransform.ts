// -- React Imports --
import { useCallback, useEffect, useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent, type RefObject, type SetStateAction } from 'react';

// -- Utils Imports --
import { pointsBounds, strokeHitsPoint, strokeIntersectsRect, type WorldRect } from '@/lib/board/drawingStyle';
import { rotateVec } from '@/lib/board/boardRotation';
import { applyMatrixToPoints, translate } from '@/lib/board/strokeTransform';

// -- Type Imports --
import type { BoardState, BoardStore } from '@/lib/stores/boardStore';
import type { ActiveTool, BoardItem, Stroke, Viewport } from '@/lib/types/board';
import type { Point } from '@/lib/board/boardConnections';

/** Click-pick reach around the cursor, in screen px (÷ zoom to world), added to half a stroke's width. */
const STROKE_PICK_TOLERANCE = 6;

/** Screen-px a press must travel before it counts as a move (below this a press is a click-select). */
const MOVE_THRESHOLD = 3;

/** A drawing layer's live origin/size/rotation plus its strokes - the frame the box + hit-tests read. */
type LayerFrame = Pick<BoardItem, 'x' | 'y' | 'width' | 'height' | 'rotation'>;

/** A stroke selection scoped to one (active) drawing layer. */
export interface StrokeSelection {
   layerId: string;
   strokeIds: Set<string>;
}

/**
 * Maps a WORLD point into a layer's LOCAL, axis-aligned frame (relative to its origin), undoing the layer's
 * own center-origin rotation. At rotation 0 this is a plain origin subtract. Lets a hit-test reuse the
 * rotation-naive stroke helpers on a rotated layer (INVARIANT: the manipulator respects the layer's rotation).
 */
function worldToLayerLocal(layer: LayerFrame, wx: number, wy: number): Point {
   const rotation = layer.rotation ?? 0;
   if (!rotation) return { x: wx - layer.x, y: wy - layer.y };
   const cx = layer.x + layer.width / 2;
   const cy = layer.y + layer.height / 2;
   const un = rotateVec({ x: wx - cx, y: wy - cy }, -rotation);
   return { x: un.x + layer.width / 2, y: un.y + layer.height / 2 };
}

/** The local-frame bounds of the selected strokes (union of their point bounds), or null when empty. */
function selectionLocalBounds(strokes: Stroke[], strokeIds: Set<string>): WorldRect | null {
   let box: WorldRect | null = null;
   for (const stroke of strokes) {
      if (!strokeIds.has(stroke.id)) continue;
      const b = pointsBounds(stroke.points);
      if (!b) continue;
      box = box
         ? { minX: Math.min(box.minX, b.minX), minY: Math.min(box.minY, b.minY), maxX: Math.max(box.maxX, b.maxX), maxY: Math.max(box.maxY, b.maxY) }
         : b;
   }
   return box;
}

interface UseBoardTransformArgs {
   store: BoardStore;
   actions: BoardState['actions'];
   cursorToWorld: (clientX: number, clientY: number) => Point | null;
   beginPan: (clientX: number, clientY: number) => void;
   viewportRef: RefObject<Viewport>;
   spaceHeldRef: RefObject<boolean>;
   activeTool: ActiveTool;
   activeLayerId: string | null;
   setActiveLayerId: Dispatch<SetStateAction<string | null>>;
}

/*
 * The Transform gesture: click / marquee stroke selection scoped to one drawing layer, plus a move (translate)
 * drag that previews via the overlay's SVG group transform and commits ONE `transformStrokes` command on
 * pointerup. Owns the selection, the live move delta (layer-local), and the marquee rect. Window listeners for
 * an in-flight drag are torn down on unmount (a tab switch), so a mid-drag switch discards the preview - only a
 * pointerup commits. Selection re-targets its owning layer active; a marquee grabs only the active layer.
 */
export function useBoardTransform({
   store,
   actions,
   cursorToWorld,
   beginPan,
   viewportRef,
   spaceHeldRef,
   activeTool,
   activeLayerId,
   setActiveLayerId,
}: UseBoardTransformArgs) {
   const [selection, setSelection] = useState<StrokeSelection | null>(null);
   // The live move delta in the layer's LOCAL frame, driving the overlay's group transform (null when idle).
   const [moveDelta, setMoveDelta] = useState<Point | null>(null);
   // The live marquee rect in WORLD coords (null when idle).
   const [marquee, setMarquee] = useState<WorldRect | null>(null);
   // Tears down the in-flight drag's window listeners; stashed so an unmount mid-drag can't leak them.
   const cleanupRef = useRef<null | (() => void)>(null);

   /** The topmost stroke under a world point, across every drawing layer (higher z / later in paint order wins). */
   const pickStroke = useCallback((world: Point): { layerId: string; strokeId: string } | null => {
      const tolerance = STROKE_PICK_TOLERANCE / viewportRef.current.zoom;
      let best: { layerId: string; strokeId: string; z: number; index: number } | null = null;
      for (const item of Object.values(store.getState().items)) {
         if (item.content.kind !== 'drawing') continue;
         const local = worldToLayerLocal(item, world.x, world.y);
         const strokes = item.content.strokes;
         for (let index = 0; index < strokes.length; index++) {
            const stroke = strokes[index];
            if (!strokeHitsPoint({ x: 0, y: 0 }, stroke, local.x, local.y, tolerance)) continue;
            if (!best || item.z > best.z || (item.z === best.z && index >= best.index)) {
               best = { layerId: item.id, strokeId: stroke.id, z: item.z, index };
            }
         }
      }
      return best ? { layerId: best.layerId, strokeId: best.strokeId } : null;
   }, [store, viewportRef]);

   /** The active layer's stroke ids whose bbox intersects a world rect (rotation-aware). */
   const marqueeHits = useCallback((layer: BoardItem, worldRect: WorldRect): string[] => {
      if (layer.content.kind !== 'drawing') return [];
      const rotation = layer.rotation ?? 0;
      if (!rotation) return layer.content.strokes.filter((stroke) => strokeIntersectsRect(layer, stroke, worldRect)).map((stroke) => stroke.id);
      // Rotated layer: map the rect's corners into the local frame, take their AABB, test zero-origin strokes.
      const corners: Point[] = [
         worldToLayerLocal(layer, worldRect.minX, worldRect.minY),
         worldToLayerLocal(layer, worldRect.maxX, worldRect.minY),
         worldToLayerLocal(layer, worldRect.maxX, worldRect.maxY),
         worldToLayerLocal(layer, worldRect.minX, worldRect.maxY),
      ];
      const localRect: WorldRect = {
         minX: Math.min(...corners.map((p) => p.x)),
         minY: Math.min(...corners.map((p) => p.y)),
         maxX: Math.max(...corners.map((p) => p.x)),
         maxY: Math.max(...corners.map((p) => p.y)),
      };
      return layer.content.strokes.filter((stroke) => strokeIntersectsRect({ x: 0, y: 0 }, stroke, localRect)).map((stroke) => stroke.id);
   }, []);

   /** Bakes the move: applies the local translate to the selected strokes' points, leaving the rest untouched. */
   const commitMove = useCallback((layerId: string, strokeIds: Set<string>, localDelta: Point) => {
      const layer = store.getState().items[layerId];
      if (!layer || layer.content.kind !== 'drawing') return;
      const matrix = translate(localDelta.x, localDelta.y);
      const nextStrokes = layer.content.strokes.map((stroke) =>
         strokeIds.has(stroke.id) ? { ...stroke, points: applyMatrixToPoints(stroke.points, matrix) } : stroke,
      );
      void actions.transformStrokes(layerId, nextStrokes);
   }, [store, actions]);

   /**
    * Transform-overlay pointerdown, geometry-resolved in priority order: the pan escape hatch first
    * (middle / Space+drag), then a move of the current selection (press inside its box or on a selected
    * stroke), then a stroke pick (top-most across layers, re-targeting its layer active), then a marquee on
    * the active layer's empty space. The move/marquee run as deferred drags off window listeners (mirroring
    * the item move), so a press with no travel stays a click-select.
    */
   const handleTransformPointerDown = (event: ReactPointerEvent) => {
      event.stopPropagation();
      if (event.button === 1) { event.preventDefault(); beginPan(event.clientX, event.clientY); return; }
      if (event.button === 0 && spaceHeldRef.current) { beginPan(event.clientX, event.clientY); return; }
      if (event.button !== 0) return; // right-click falls through to the overlay's radial menu
      const world = cursorToWorld(event.clientX, event.clientY);
      if (!world) return;
      const additive = event.shiftKey;
      const items = store.getState().items;

      // A press on the current selection (its box interior or a selected stroke) starts a move of it.
      const current = selection;
      const currentLayer = current ? items[current.layerId] : undefined;
      let onSelection = false;
      if (current && currentLayer && currentLayer.content.kind === 'drawing' && !additive) {
         const local = worldToLayerLocal(currentLayer, world.x, world.y);
         const bounds = selectionLocalBounds(currentLayer.content.strokes, current.strokeIds);
         const inBox = bounds ? local.x >= bounds.minX && local.x <= bounds.maxX && local.y >= bounds.minY && local.y <= bounds.maxY : false;
         const tolerance = STROKE_PICK_TOLERANCE / viewportRef.current.zoom;
         const onStroke = currentLayer.content.strokes.some((stroke) => current.strokeIds.has(stroke.id) && strokeHitsPoint({ x: 0, y: 0 }, stroke, local.x, local.y, tolerance));
         onSelection = inBox || onStroke;
      }

      // Resolve the gesture's target: a move of an existing/newly-picked selection, or a marquee on empty.
      let move: { layerId: string; strokeIds: Set<string>; rotation: number } | null = null;
      if (onSelection && current && currentLayer) {
         move = { layerId: current.layerId, strokeIds: current.strokeIds, rotation: currentLayer.rotation ?? 0 };
      } else {
         const picked = pickStroke(world);
         if (picked) {
            const layer = items[picked.layerId];
            const rotation = layer?.rotation ?? 0;
            let strokeIds: Set<string>;
            if (additive && current && current.layerId === picked.layerId) {
               strokeIds = new Set(current.strokeIds);
               if (strokeIds.has(picked.strokeId)) strokeIds.delete(picked.strokeId);
               else strokeIds.add(picked.strokeId);
            } else {
               strokeIds = new Set([picked.strokeId]);
            }
            setSelection(strokeIds.size > 0 ? { layerId: picked.layerId, strokeIds } : null);
            if (picked.layerId !== activeLayerId) setActiveLayerId(picked.layerId);
            // A press on a freshly-picked stroke can drag straight into a move of the resulting selection.
            if (strokeIds.size > 0) move = { layerId: picked.layerId, strokeIds, rotation };
         }
      }

      const startX = event.clientX;
      const startY = event.clientY;
      let moved = false;

      if (move) {
         const gesture = move;
         const onMove = (moveEvent: PointerEvent) => {
            const to = cursorToWorld(moveEvent.clientX, moveEvent.clientY);
            if (!to) return;
            if (!moved && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < MOVE_THRESHOLD) return;
            moved = true;
            // Fold the world delta into the layer's local frame so a rotated layer moves along its own axes.
            const worldDelta = { x: to.x - world.x, y: to.y - world.y };
            setMoveDelta(gesture.rotation ? rotateVec(worldDelta, -gesture.rotation) : worldDelta);
         };
         const cleanup = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            cleanupRef.current = null;
         };
         const onUp = (upEvent: PointerEvent) => {
            cleanup();
            setMoveDelta(null);
            if (!moved) return;
            const to = cursorToWorld(upEvent.clientX, upEvent.clientY);
            if (!to) return;
            const worldDelta = { x: to.x - world.x, y: to.y - world.y };
            const localDelta = gesture.rotation ? rotateVec(worldDelta, -gesture.rotation) : worldDelta;
            commitMove(gesture.layerId, gesture.strokeIds, localDelta);
         };
         cleanupRef.current = cleanup;
         window.addEventListener('pointermove', onMove);
         window.addEventListener('pointerup', onUp);
         return;
      }

      // Empty press: a marquee on the ACTIVE layer (a plain press clears; Shift unions with what's held).
      const baseLayer = activeLayerId ? items[activeLayerId] : undefined;
      if (!additive) setSelection(null);
      const baseIds = additive && current && baseLayer && current.layerId === baseLayer.id ? new Set(current.strokeIds) : new Set<string>();
      const onMove = (moveEvent: PointerEvent) => {
         const to = cursorToWorld(moveEvent.clientX, moveEvent.clientY);
         if (!to) return;
         if (!moved && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < MOVE_THRESHOLD) return;
         moved = true;
         const rect: WorldRect = { minX: Math.min(world.x, to.x), minY: Math.min(world.y, to.y), maxX: Math.max(world.x, to.x), maxY: Math.max(world.y, to.y) };
         setMarquee(rect);
         if (!baseLayer || baseLayer.content.kind !== 'drawing') return;
         const hits = new Set(baseIds);
         for (const id of marqueeHits(baseLayer, rect)) hits.add(id);
         setSelection(hits.size > 0 ? { layerId: baseLayer.id, strokeIds: hits } : additive ? current : null);
      };
      const cleanup = () => {
         window.removeEventListener('pointermove', onMove);
         window.removeEventListener('pointerup', onUp);
         cleanupRef.current = null;
      };
      const onUp = () => {
         cleanup();
         setMarquee(null);
      };
      cleanupRef.current = cleanup;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
   };

   // A mid-drag unmount (tab switch) fires no pointerup; tear the in-flight listeners down so they never point
   // at a dead store. Because only pointerup commits, the half-done move/marquee is simply discarded.
   useEffect(() => () => cleanupRef.current?.(), []);

   // Leaving the Transform tool clears the stroke selection (and any stray preview), so it never lingers into
   // another gesture. A board switch routes through `resetForBoard` too.
   useEffect(() => {
      if (activeTool === 'transform') return;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelection(null);
      setMoveDelta(null);
      setMarquee(null);
   }, [activeTool]);

   /** Resets the transform half on a board switch: drop the selection + any in-flight preview. */
   const resetForBoard = useCallback(() => {
      setSelection(null);
      setMoveDelta(null);
      setMarquee(null);
   }, []);

   return {
      selection,
      moveDelta,
      marquee,
      handleTransformPointerDown,
      resetForBoard,
   };
}
