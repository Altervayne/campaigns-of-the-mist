// -- React Imports --
import { useCallback, useEffect, useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent, type RefObject, type SetStateAction } from 'react';

// -- Utils Imports --
import { pointsBounds, strokeHitsPoint, strokeIntersectsRect, type WorldRect } from '@/lib/drawing/strokeGeometry';
import { rotateVec } from '@/lib/board/boardRotation';
import { applyMatrixToPoints, flip, translate, type Mat } from '@/lib/drawing/strokeTransform';

// -- Custom Hooks --
import { useStrokeStructureEditing } from './useStrokeStructureEditing';
import { HANDLE_HIT_PX, MIN_HANDLE_BOX_PX, ROTATE_STALK_PX, handleLayoutBox, handleMatrix, pickHandle, type HandleId } from '@/lib/drawing/strokeHandles';

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

/** Whether any selected stroke is a 2-corner shape (ellipse/rect), which can't carry a rotated/skewed box. */
function selectionHasShape(strokes: Stroke[], strokeIds: Set<string>): boolean {
   return strokes.some((stroke) => strokeIds.has(stroke.id) && (stroke.shape === 'ellipse' || stroke.shape === 'rect'));
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
 * The Transform gesture: click / marquee stroke selection scoped to one drawing layer, plus the free-transform
 * box - move, plus scale / rotate / skew / flip off the handles. Each drag previews via the overlay's SVG group
 * transform (a live local matrix) and bakes into the points on pointerup, committing ONE `transformStrokes`
 * command. Owns the selection, the live preview matrix (layer-local), and the marquee rect. Window listeners for
 * an in-flight drag are torn down on unmount (a tab switch), so a mid-drag switch discards the preview - only a
 * pointerup commits. Selection re-targets its owning layer active; a marquee grabs only the active layer. A
 * selection holding a shape (ellipse/rect) has no rotate/skew (its 2-corner box can't carry them).
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
   // The live transform in the layer's LOCAL frame, driving the overlay's group transform (null when idle). A
   // move is a translate; a handle drag is a scale/rotate/skew. Baked into points and committed on pointerup.
   const [preview, setPreview] = useState<Mat | null>(null);
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

   /** Bakes a transform: applies the local matrix to the selected strokes' points, leaving the rest untouched. */
   const commitMatrix = useCallback((layerId: string, strokeIds: Set<string>, matrix: Mat) => {
      const layer = store.getState().items[layerId];
      if (!layer || layer.content.kind !== 'drawing') return;
      const nextStrokes = layer.content.strokes.map((stroke) =>
         strokeIds.has(stroke.id) ? { ...stroke, points: applyMatrixToPoints(stroke.points, matrix) } : stroke,
      );
      void actions.transformStrokes(layerId, nextStrokes);
   }, [store, actions]);

   /**
    * Mirrors the selection about its bounding-box center on the given axis - a style-toolbar Flip button.
    * Runs through the SAME geometry commit as a handle drag (`commitMatrix` -> `transformStrokes`), so the
    * flip co-writes the box (rotation compensation for free) and lands as ONE undo step.
    */
   const flipSelection = useCallback((axis: 'x' | 'y') => {
      if (!selection) return;
      const layer = store.getState().items[selection.layerId];
      if (!layer || layer.content.kind !== 'drawing') return;
      const bounds = selectionLocalBounds(layer.content.strokes, selection.strokeIds);
      if (!bounds) return;
      const center = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
      commitMatrix(selection.layerId, selection.strokeIds, flip(axis, center));
   }, [selection, store, commitMatrix]);

   // The structural half (delete / duplicate / reorder-within-layer) lives in its own hook; it reads the
   // selection and re-targets it (duplicate re-selects the copies, delete clears).
   const { deleteSelection, duplicateSelection, reorderSelection } = useStrokeStructureEditing({ store, actions, selection, setSelection });

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

      // A press on a transform handle scales / rotates / skews the current selection. Resolved BEFORE move, so
      // a grip near a corner wins over a move of the box. Handles live in the layer's local frame (they respect
      // its rotation), so the pointer maps in through the same `worldToLayerLocal` the box render uses.
      if (current && currentLayer && currentLayer.content.kind === 'drawing' && !additive) {
         const bounds = selectionLocalBounds(currentLayer.content.strokes, current.strokeIds);
         if (bounds) {
            const zoom = viewportRef.current.zoom;
            const frame: LayerFrame = { x: currentLayer.x, y: currentLayer.y, width: currentLayer.width, height: currentLayer.height, rotation: currentLayer.rotation ?? 0 };
            const box = handleLayoutBox(bounds, MIN_HANDLE_BOX_PX / zoom);
            const grabLocal = worldToLayerLocal(frame, world.x, world.y);
            const hasShape = selectionHasShape(currentLayer.content.strokes, current.strokeIds);
            const handle: HandleId | null = pickHandle(grabLocal, box, ROTATE_STALK_PX / zoom, HANDLE_HIT_PX / zoom, hasShape);
            if (handle) {
               const layerId = current.layerId;
               const strokeIds = current.strokeIds;
               const startClientX = event.clientX;
               const startClientY = event.clientY;
               let handleMoved = false;
               // Ctrl/Cmd skews an edge; Shift constrains (aspect on a corner, 15deg on the knob). Read live.
               const matrixAt = (clientX: number, clientY: number, shiftKey: boolean, skew: boolean): Mat | null => {
                  const to = cursorToWorld(clientX, clientY);
                  if (!to) return null;
                  const curLocal = worldToLayerLocal(frame, to.x, to.y);
                  return handleMatrix(handle, box, grabLocal, curLocal, { shiftKey, skew, hasShape });
               };
               const onMove = (moveEvent: PointerEvent) => {
                  if (!handleMoved && Math.hypot(moveEvent.clientX - startClientX, moveEvent.clientY - startClientY) < MOVE_THRESHOLD) return;
                  handleMoved = true;
                  const m = matrixAt(moveEvent.clientX, moveEvent.clientY, moveEvent.shiftKey, moveEvent.ctrlKey || moveEvent.metaKey);
                  if (m) setPreview(m);
               };
               const cleanup = () => {
                  window.removeEventListener('pointermove', onMove);
                  window.removeEventListener('pointerup', onUp);
                  cleanupRef.current = null;
               };
               const onUp = (upEvent: PointerEvent) => {
                  cleanup();
                  setPreview(null);
                  if (!handleMoved) return;
                  const m = matrixAt(upEvent.clientX, upEvent.clientY, upEvent.shiftKey, upEvent.ctrlKey || upEvent.metaKey);
                  if (m) commitMatrix(layerId, strokeIds, m);
               };
               cleanupRef.current = cleanup;
               window.addEventListener('pointermove', onMove);
               window.addEventListener('pointerup', onUp);
               return;
            }
         }
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
            const localDelta = gesture.rotation ? rotateVec(worldDelta, -gesture.rotation) : worldDelta;
            setPreview(translate(localDelta.x, localDelta.y));
         };
         const cleanup = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            cleanupRef.current = null;
         };
         const onUp = (upEvent: PointerEvent) => {
            cleanup();
            setPreview(null);
            if (!moved) return;
            const to = cursorToWorld(upEvent.clientX, upEvent.clientY);
            if (!to) return;
            const worldDelta = { x: to.x - world.x, y: to.y - world.y };
            const localDelta = gesture.rotation ? rotateVec(worldDelta, -gesture.rotation) : worldDelta;
            commitMatrix(gesture.layerId, gesture.strokeIds, translate(localDelta.x, localDelta.y));
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
      setPreview(null);
      setMarquee(null);
   }, [activeTool]);

   /** Resets the transform half on a board switch: drop the selection + any in-flight preview. */
   const resetForBoard = useCallback(() => {
      setSelection(null);
      setPreview(null);
      setMarquee(null);
   }, []);

   return {
      selection,
      preview,
      marquee,
      handleTransformPointerDown,
      flipSelection,
      deleteSelection,
      duplicateSelection,
      reorderSelection,
      resetForBoard,
   };
}
