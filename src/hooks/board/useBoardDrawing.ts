// -- React Imports --
import { useCallback, useEffect, useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent, type RefObject, type SetStateAction } from 'react';

// -- Other Library Imports --
import cuid from 'cuid';

// -- Utils Imports --
import { ERASER_RADIUS, MIN_LINE_LENGTH } from '@/lib/drawing/constants';
import { isLineDegenerate, pointsBounds, rebasePoints, regularPolygonVertices, shapeBoxCorners, snapAngle, strokeHitsPoint } from '@/lib/drawing/strokeGeometry';
import { makeStroke } from '@/lib/drawing/strokeFactory';
import { nextScopeZ } from '@/lib/board/boardTree';
import { EMPTY_STROKE_IDS } from '@/lib/board/PendingEraseContext';
import { isEditableTarget } from '@/lib/utils/textEntry';

// -- Type Imports --
import type { BoardState, BoardStore } from '@/lib/stores/boardStore';
import type { ActiveTool, BrushKind, Stroke, Viewport } from '@/lib/types/board';
import type { Point } from '@/lib/board/boardConnections';

/** Screen-px radius around a freeform polygon's first vertex where a click closes the shape (>= 3 vertices). */
const POLYGON_CLOSE_THRESHOLD = 12;

/** The regular polygon's rotation snap step (radians) while Shift is held: 15deg detents. */
const ROTATION_SNAP = Math.PI / 12;

interface UseBoardDrawingArgs {
   store: BoardStore;
   actions: BoardState['actions'];
   cursorToWorld: (clientX: number, clientY: number) => Point | null;
   beginPan: (clientX: number, clientY: number) => void;
   viewportRef: RefObject<Viewport>;
   spaceHeldRef: RefObject<boolean>;
   activeTool: ActiveTool;
   setActiveTool: Dispatch<SetStateAction<ActiveTool>>;
   activeLayerId: string | null;
   setActiveLayerId: Dispatch<SetStateAction<string | null>>;
   penSettings: { brush: BrushKind; color: string | null; width: number; shapeBase: 'circle' | 'square'; shapeFilled: boolean };
   polygonSides: number;
}

/*
 * Every drawing gesture: the pen / line / shape / regular-polygon / freeform-polygon pointerdowns, the eraser
 * scrub, their commits, and the live previews. Owns the in-flight stroke + cleanup refs and the mid-stroke
 * unmount teardown, so a tab switch during a stroke can't leak its window listeners. Reads the camera + tool
 * state it needs through injected params; `resetForBoard` clears the drawing half on a board switch (the
 * parent orchestrates it alongside the tool/layer reset).
 */
export function useBoardDrawing({
   store,
   actions,
   cursorToWorld,
   beginPan,
   viewportRef,
   spaceHeldRef,
   activeTool,
   setActiveTool,
   activeLayerId,
   setActiveLayerId,
   penSettings,
   polygonSides,
}: UseBoardDrawingArgs) {
   // The in-flight pen stroke's WORLD points (captured in screen, painted in world) + its live preview.
   // The cleanup ref tears the window listeners down on unmount so a mid-stroke tab switch can't leak them.
   const currentStrokeRef = useRef<{ points: number[] } | null>(null);
   const strokeCleanupRef = useRef<null | (() => void)>(null);
   const [penPreview, setPenPreview] = useState<number[] | null>(null);
   // The in-progress freeform polygon: the WORLD vertices dropped so far (a persistent multi-click gesture,
   // unlike the self-terminating pen/line) plus its live preview (the committed vertices + a rubber band to
   // the cursor). Null when no polygon is being drawn. Cleared on close/cancel, on leaving the polygon tool,
   // and on board switch. The ref is separate from the pan/select paths, so neither can touch it.
   const polygonRef = useRef<number[] | null>(null);
   const [polygonPreview, setPolygonPreview] = useState<number[] | null>(null);
   // Stroke ids the in-progress eraser scrub has crossed, hidden on contact and cleared when the scrub
   // commits (or on board switch). The removal is only made real, as ONE undo step, on pointer-up.
   const [pendingErase, setPendingErase] = useState<ReadonlySet<string>>(EMPTY_STROKE_IDS);

   // ==================
   //  Freehand capture (screen-space overlay owns the gesture; the preview paints in the world layer)
   // ==================
   /**
    * Commits a finished stroke (given its WORLD points): appends it to the active drawing layer, or mints
    * a fresh layer when none is active (its origin = the stroke's world bbox min, so points store
    * layer-local). The stroke carries the CURRENT brush/ink/width. Fewer than two points is a stray tap - dropped.
    */
   const commitStroke = useCallback(
      (worldPoints: number[], shape?: Stroke['shape'], filled?: boolean) => {
         // Min points is shape-aware: a polygon needs 3 vertices (6 numbers); a line, a bounding-box shape, and
         // freehand all need 2 (4 numbers), so a stray tap still drops but a valid stroke survives.
         if (worldPoints.length < (shape === 'polygon' ? 6 : 4)) return;
         // A Line from a pure click (endpoints all but coincident) is a zero-length dot; discard it.
         if (shape === 'line' && isLineDegenerate(worldPoints, MIN_LINE_LENGTH)) return;
         const width = penSettings.width;
         const liveItems = store.getState().items;
         const layer = activeLayerId ? liveItems[activeLayerId] : undefined;
         if (layer && layer.content.kind === 'drawing') {
            // World points: the store grows the box + re-bases to layer-local, so the box tracks every stroke.
            void actions.appendStroke(layer.id, makeStroke(cuid(), worldPoints, penSettings.brush, penSettings.color, width, shape, filled));
            return;
         }
         const bounds = pointsBounds(worldPoints);
         if (!bounds) return;
         const local = rebasePoints(worldPoints, bounds.minX, bounds.minY);
         // A freehand layer spawns at root (never auto-joins a zone); land it at the front of the root scope.
         const z = nextScopeZ(liveItems, null);
         const id = cuid();
         void actions.addItem({
            id,
            kind: 'drawing',
            x: bounds.minX,
            y: bounds.minY,
            width: bounds.maxX - bounds.minX,
            height: bounds.maxY - bounds.minY,
            z,
            content: { kind: 'drawing', strokes: [makeStroke(cuid(), local, penSettings.brush, penSettings.color, width, shape, filled)] },
         });
         setActiveLayerId(id);
      },
      [actions, activeLayerId, store, penSettings, setActiveLayerId],
   );

   /**
    * Closes the in-progress freeform polygon: commits its vertices as a closed geometric stroke (>= 3
    * needed; a shorter run is dropped by `commitStroke`'s shape-aware guard) and clears the gesture,
    * staying in the tool so the next click starts a new polygon.
    */
   const commitPolygon = useCallback(() => {
      const verts = polygonRef.current;
      polygonRef.current = null;
      setPolygonPreview(null);
      if (verts) commitStroke(verts, 'polygon', penSettings.shapeFilled);
   }, [commitStroke, penSettings.shapeFilled]);

   /**
    * Freeform-polygon pointerdown: a PERSISTENT multi-click gesture - each primary click drops a vertex,
    * unlike the self-terminating pen/line. The pan escape hatch runs first (middle / Space+drag); the right
    * button is owned by the clip's capture handler (right-drag pans, right-click closes the polygon). A
    * primary click starts a polygon, closes it (the click lands within the close threshold of the first
    * vertex and there are >= 3 vertices), or appends a vertex.
    */
   const handlePolygonPointerDown = (event: ReactPointerEvent) => {
      event.stopPropagation();
      if (event.button === 1) { event.preventDefault(); beginPan(event.clientX, event.clientY); return; }
      if (event.button === 0 && spaceHeldRef.current) { beginPan(event.clientX, event.clientY); return; }
      if (event.button !== 0) return;
      const world = cursorToWorld(event.clientX, event.clientY);
      if (!world) return;
      const verts = polygonRef.current;
      if (!verts) {
         // Start a fresh polygon; seed a zero-length rubber band (the next move extends it to the cursor).
         polygonRef.current = [world.x, world.y];
         setPolygonPreview([world.x, world.y, world.x, world.y]);
         return;
      }
      // Close when the click lands within the screen-px threshold of the first vertex (compared in world, so
      // it holds at any zoom) and there are >= 3 vertices; otherwise drop another vertex.
      const reach = POLYGON_CLOSE_THRESHOLD / viewportRef.current.zoom;
      if (verts.length >= 6 && Math.hypot(world.x - verts[0], world.y - verts[1]) <= reach) { commitPolygon(); return; }
      verts.push(world.x, world.y);
      setPolygonPreview([...verts, world.x, world.y]);
   };

   /** Freeform-polygon rubber band: redraws the committed vertices plus a live segment to the cursor. */
   const handlePolygonPointerMove = (event: ReactPointerEvent) => {
      const verts = polygonRef.current;
      if (!verts) return;
      const world = cursorToWorld(event.clientX, event.clientY);
      if (world) setPolygonPreview([...verts, world.x, world.y]);
   };

   /**
    * Double-click closes the freeform polygon. The two pointerdowns a dblclick fires already dropped a
    * trailing vertex on (or near) the last one, so dedupe that coincident vertex before closing to avoid a
    * zero-length edge.
    */
   const handlePolygonDoubleClick = () => {
      const verts = polygonRef.current;
      if (!verts) return;
      if (verts.length >= 4) {
         const dedupe = 2 / viewportRef.current.zoom; // a couple screen px: the dblclick's two points land together
         const lastX = verts[verts.length - 2];
         const lastY = verts[verts.length - 1];
         if (Math.hypot(lastX - verts[verts.length - 4], lastY - verts[verts.length - 3]) <= dedupe) verts.splice(-2, 2);
      }
      commitPolygon();
   };

   // Leaving the freeform-polygon tool (to Select or any other gesture) discards a half-drawn polygon. Board
   // switches route through here too (the boardId reset sets Select, and also clears the ref directly).
   useEffect(() => {
      if (activeTool === 'freeformPolygon') return;
      polygonRef.current = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPolygonPreview(null);
   }, [activeTool]);

   // One draw-mode keydown handler, branching on whether a freeform polygon is mid-draw. With a polygon in
   // progress the keys edit it: Esc cancels, Backspace pops the last vertex (emptying it cancels), Enter
   // closes (>= 3 vertices) - each swallowed so it never reaches the tool-exit path. With no polygon, Esc / V
   // leave the Draw gesture (they're sticky, so they need an explicit exit besides the segment). Mounted only
   // off Select, so V never shadows anything in the default mode.
   useEffect(() => {
      if (activeTool === 'select') return;
      const onKeyDown = (event: KeyboardEvent) => {
         if (isEditableTarget(event.target)) return;
         const verts = polygonRef.current;
         if (verts) {
            if (event.key === 'Escape') {
               event.preventDefault();
               polygonRef.current = null;
               setPolygonPreview(null);
            } else if (event.key === 'Backspace') {
               event.preventDefault();
               verts.splice(-2, 2); // pop the last vertex
               if (verts.length === 0) { polygonRef.current = null; setPolygonPreview(null); }
               else setPolygonPreview([...verts, verts[verts.length - 2], verts[verts.length - 1]]);
            } else if (event.key === 'Enter') {
               event.preventDefault();
               commitPolygon();
            }
            return;
         }
         if (event.key === 'Escape' || event.key === 'v' || event.key === 'V') {
            event.preventDefault();
            setActiveTool('select');
         }
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
   }, [activeTool, commitPolygon, setActiveTool]);

   /**
    * Freehand-overlay pointerdown: the pan escape hatch first (middle / Space+drag), then a primary-button
    * press starts a stroke. Points are captured in screen and converted to world via `cursorToWorld`;
    * `getCoalescedEvents` recovers the batched samples a fast stroke would otherwise skip. Window
    * listeners (mirroring the connect drag) keep the move/up landing off the overlay; the teardown is
    * stashed in a ref so an unmount mid-stroke can't leak them.
    */
   const handleFreehandPointerDown = (event: ReactPointerEvent) => {
      // The overlay owns every pointerdown in a draw gesture; stop it reaching the clip's background handler
      // (which would double-fire a middle/Space pan or clear the selection).
      event.stopPropagation();
      if (event.button === 1) { event.preventDefault(); beginPan(event.clientX, event.clientY); return; }
      if (event.button === 0 && spaceHeldRef.current) { beginPan(event.clientX, event.clientY); return; }
      if (event.button !== 0) return; // right-click falls through to the overlay's context menu (radial)
      const start = cursorToWorld(event.clientX, event.clientY);
      if (!start) return;
      currentStrokeRef.current = { points: [start.x, start.y] };
      setPenPreview([start.x, start.y]);

      const onMove = (moveEvent: PointerEvent) => {
         const stroke = currentStrokeRef.current;
         if (!stroke) return;
         const samples = moveEvent.getCoalescedEvents?.() ?? [];
         const batch = samples.length > 0 ? samples : [moveEvent];
         for (const sample of batch) {
            const world = cursorToWorld(sample.clientX, sample.clientY);
            if (world) stroke.points.push(world.x, world.y);
         }
         setPenPreview([...stroke.points]);
      };
      const cleanup = () => {
         window.removeEventListener('pointermove', onMove);
         window.removeEventListener('pointerup', onUp);
         strokeCleanupRef.current = null;
      };
      const onUp = () => {
         const stroke = currentStrokeRef.current;
         currentStrokeRef.current = null;
         cleanup();
         setPenPreview(null);
         if (stroke) commitStroke(stroke.points); // stays in freehand (sticky)
      };
      strokeCleanupRef.current = cleanup;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
   };

   // A mid-stroke unmount (tab switch) fires no pointerup; tear the in-flight listeners down so they
   // never point at a dead store. The half-drawn stroke is simply discarded.
   useEffect(() => () => strokeCleanupRef.current?.(), []);

   /**
    * Line-overlay pointerdown: the pan escape hatch first (middle / Space+drag), then a primary-button
    * press-drag from A to B. The live preview is a 2-point stroke; Shift snaps the A->B angle to 45deg
    * increments (length preserved). On release it commits a geometric `line` stroke and stays in Line
    * (sticky). Window listeners + the shared cleanup ref mirror the freehand gesture.
    */
   const handleLinePointerDown = (event: ReactPointerEvent) => {
      event.stopPropagation();
      if (event.button === 1) { event.preventDefault(); beginPan(event.clientX, event.clientY); return; }
      if (event.button === 0 && spaceHeldRef.current) { beginPan(event.clientX, event.clientY); return; }
      if (event.button !== 0) return; // right-click falls through to the overlay's context menu (radial)
      const start = cursorToWorld(event.clientX, event.clientY);
      if (!start) return;
      const sx = start.x;
      const sy = start.y;
      setPenPreview([sx, sy, sx, sy]);

      // The end point in world, angle-snapped to 45deg while Shift is held.
      const endPoint = (clientX: number, clientY: number, shift: boolean) => {
         const end = cursorToWorld(clientX, clientY);
         if (!end) return null;
         return shift ? snapAngle(sx, sy, end.x, end.y, Math.PI / 4) : end;
      };
      const onMove = (moveEvent: PointerEvent) => {
         const to = endPoint(moveEvent.clientX, moveEvent.clientY, moveEvent.shiftKey);
         if (to) setPenPreview([sx, sy, to.x, to.y]);
      };
      const cleanup = () => {
         window.removeEventListener('pointermove', onMove);
         window.removeEventListener('pointerup', onUp);
         strokeCleanupRef.current = null;
      };
      const onUp = (upEvent: PointerEvent) => {
         cleanup();
         setPenPreview(null);
         const to = endPoint(upEvent.clientX, upEvent.clientY, upEvent.shiftKey);
         if (to) commitStroke([sx, sy, to.x, to.y], 'line'); // stays in line (sticky)
      };
      strokeCleanupRef.current = cleanup;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
   };

   /**
    * Regular-polygon pointerdown: the pan escape hatch first (middle / Space+drag), then a primary-button
    * center-out drag - the press is the center, the drag vector sets both the circumradius and the rotation.
    * The live preview is the closed N-gon in the active brush; Shift snaps the rotation to 15deg increments.
    * On release it commits a geometric `polygon` stroke (when the radius clears the stray-click floor) and
    * stays in the tool (sticky). Window listeners + the shared cleanup ref mirror the line gesture.
    */
   const handleRegularPolygonPointerDown = (event: ReactPointerEvent) => {
      event.stopPropagation();
      if (event.button === 1) { event.preventDefault(); beginPan(event.clientX, event.clientY); return; }
      if (event.button === 0 && spaceHeldRef.current) { beginPan(event.clientX, event.clientY); return; }
      if (event.button !== 0) return; // right-click falls through to the overlay's context menu (radial)
      const center = cursorToWorld(event.clientX, event.clientY);
      if (!center) return;
      const cx = center.x;
      const cy = center.y;
      const sides = polygonSides;
      setPenPreview(regularPolygonVertices(cx, cy, 0, sides, 0));

      // The N-gon for the current cursor plus its radius: the drag vector is both circumradius and rotation
      // (Shift snaps the rotation to 15deg). Preview and commit share this, so the committed shape matches.
      const shapeAt = (clientX: number, clientY: number, shift: boolean) => {
         const p = cursorToWorld(clientX, clientY);
         if (!p) return null;
         const radius = Math.hypot(p.x - cx, p.y - cy);
         let rotation = Math.atan2(p.y - cy, p.x - cx);
         if (shift) rotation = Math.round(rotation / ROTATION_SNAP) * ROTATION_SNAP;
         return { verts: regularPolygonVertices(cx, cy, radius, sides, rotation), radius };
      };
      const onMove = (moveEvent: PointerEvent) => {
         const shape = shapeAt(moveEvent.clientX, moveEvent.clientY, moveEvent.shiftKey);
         if (shape) setPenPreview(shape.verts);
      };
      const cleanup = () => {
         window.removeEventListener('pointermove', onMove);
         window.removeEventListener('pointerup', onUp);
         strokeCleanupRef.current = null;
      };
      const onUp = (upEvent: PointerEvent) => {
         cleanup();
         setPenPreview(null);
         const shape = shapeAt(upEvent.clientX, upEvent.clientY, upEvent.shiftKey);
         // A press with no real drag (radius under the floor) makes nothing, mirroring the line's dot guard.
         if (shape && shape.radius >= MIN_LINE_LENGTH) commitStroke(shape.verts, 'polygon', penSettings.shapeFilled); // stays in the tool (sticky)
      };
      strokeCleanupRef.current = cleanup;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
   };

   /**
    * Shape pointerdown: the pan escape hatch first (middle / Space+drag), then a primary-button corner-anchored
    * bbox drag - the press is corner A, the drag sets the opposite corner B. The box is constrained to equal
    * axes (a circle/square) by default; Shift frees the aspect (an ellipse/rectangle), read live so it flips
    * mid-drag. The base toggle (not Shift) picks the stored ellipse/rect. On release it commits (when the box
    * clears the stray-click floor) and stays in the tool (sticky). Window listeners + the shared cleanup ref
    * mirror the line gesture.
    */
   const handleShapePointerDown = (event: ReactPointerEvent) => {
      event.stopPropagation();
      if (event.button === 1) { event.preventDefault(); beginPan(event.clientX, event.clientY); return; }
      if (event.button === 0 && spaceHeldRef.current) { beginPan(event.clientX, event.clientY); return; }
      if (event.button !== 0) return; // right-click falls through to the overlay's context menu (radial)
      const start = cursorToWorld(event.clientX, event.clientY);
      if (!start) return;
      const ax = start.x;
      const ay = start.y;
      const shape: Stroke['shape'] = penSettings.shapeBase === 'circle' ? 'ellipse' : 'rect';
      const filled = penSettings.shapeFilled;
      setPenPreview([ax, ay, ax, ay]);

      // The two box corners for the current cursor: equal axes unless Shift frees the aspect (read live).
      const cornersAt = (clientX: number, clientY: number, shift: boolean) => {
         const b = cursorToWorld(clientX, clientY);
         if (!b) return null;
         return shapeBoxCorners(ax, ay, b.x, b.y, !shift);
      };
      const onMove = (moveEvent: PointerEvent) => {
         const corners = cornersAt(moveEvent.clientX, moveEvent.clientY, moveEvent.shiftKey);
         if (corners) setPenPreview(corners);
      };
      const cleanup = () => {
         window.removeEventListener('pointermove', onMove);
         window.removeEventListener('pointerup', onUp);
         strokeCleanupRef.current = null;
      };
      const onUp = (upEvent: PointerEvent) => {
         cleanup();
         setPenPreview(null);
         const corners = cornersAt(upEvent.clientX, upEvent.clientY, upEvent.shiftKey);
         if (!corners) return;
         // A press with no real drag (both extents under the floor) makes nothing, mirroring the line's dot guard.
         if (Math.max(Math.abs(corners[2] - corners[0]), Math.abs(corners[3] - corners[1])) >= MIN_LINE_LENGTH) {
            commitStroke(corners, shape, filled); // stays in the tool (sticky)
         }
      };
      strokeCleanupRef.current = cleanup;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
   };

   /**
    * Commits a finished erase gesture: removes the collected strokes (per layer) as ONE undo step, then
    * clears the append target if the erase emptied the layer the pen was drawing on (so the next stroke
    * mints fresh instead of appending to a dead id).
    */
   const commitErase = useCallback(
      async (erasures: { layerId: string; strokeIds: string[] }[]) => {
         await actions.eraseStrokes(erasures);
         if (activeLayerId && !store.getState().items[activeLayerId]) setActiveLayerId(null);
      },
      [actions, activeLayerId, store, setActiveLayerId],
   );

   /**
    * Eraser-overlay pointerdown: the pan escape hatch first (middle / Space+drag), then a primary-button
    * scrub. Each sample whole-stroke hit-tests every drawing layer's strokes (any layer), collecting the
    * touched ids per layer; the whole scrub commits as one erase on pointerup. Window listeners mirror the
    * pen, and the teardown is stashed in the shared cleanup ref so an unmount mid-scrub can't leak them.
    */
   const handleEraserPointerDown = (event: ReactPointerEvent) => {
      event.stopPropagation();
      if (event.button === 1) { event.preventDefault(); beginPan(event.clientX, event.clientY); return; }
      if (event.button === 0 && spaceHeldRef.current) { beginPan(event.clientX, event.clientY); return; }
      if (event.button !== 0) return; // right-click falls through to the overlay's context menu (radial)

      const touched = new Map<string, Set<string>>();
      // Ids crossed this scrub, hidden on contact via the pending-erase set while the store's strokes stay
      // intact - so the commit below can still read them to decide survivors vs. emptied layers.
      const pending = new Set<string>();
      const eraseAt = (clientX: number, clientY: number) => {
         const world = cursorToWorld(clientX, clientY);
         if (!world) return;
         let grew = false;
         for (const item of Object.values(store.getState().items)) {
            if (item.content.kind !== 'drawing') continue;
            for (const stroke of item.content.strokes) {
               if (!strokeHitsPoint(item, stroke, world.x, world.y, ERASER_RADIUS)) continue;
               let set = touched.get(item.id);
               if (!set) { set = new Set(); touched.set(item.id, set); }
               set.add(stroke.id);
               if (!pending.has(stroke.id)) { pending.add(stroke.id); grew = true; }
            }
         }
         // Only when a new stroke is crossed: hand a fresh set so the drawing layers re-render it away now.
         if (grew) setPendingErase(new Set(pending));
      };
      eraseAt(event.clientX, event.clientY);

      // Last sample only: a scrub needs coverage, not per-coalesced-sample fidelity, and hit-testing every
      // stroke on every sample is O(strokes) - one test per move batch keeps it cheap on a dense board.
      const onMove = (moveEvent: PointerEvent) => eraseAt(moveEvent.clientX, moveEvent.clientY);
      const cleanup = () => {
         window.removeEventListener('pointermove', onMove);
         window.removeEventListener('pointerup', onUp);
         strokeCleanupRef.current = null;
      };
      const onUp = () => {
         cleanup();
         if (touched.size === 0) return;
         // `commitErase` runs the store's optimistic removal synchronously, so the strokes are already gone
         // from the layers by the time the pending set clears - no flash of the erased ink reappearing.
         void commitErase([...touched].map(([layerId, ids]) => ({ layerId, strokeIds: [...ids] })));
         setPendingErase(EMPTY_STROKE_IDS);
      };
      strokeCleanupRef.current = cleanup;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
   };

   /** Resets the drawing half on a board switch: drop any pending erase and discard a half-drawn polygon,
    *  so neither leaks across boards (the canvas stays mounted, a new `store` prop, no remount). The parent
    *  orchestrates this alongside the tool/layer reset. */
   const resetForBoard = useCallback(() => {
      setPendingErase(EMPTY_STROKE_IDS);
      polygonRef.current = null;
      setPolygonPreview(null);
   }, []);

   return {
      penPreview,
      polygonPreview,
      pendingErase,
      polygonRef,
      closePolygon: commitPolygon,
      handleFreehandPointerDown,
      handleLinePointerDown,
      handleRegularPolygonPointerDown,
      handleShapePointerDown,
      handleEraserPointerDown,
      handlePolygonPointerDown,
      handlePolygonPointerMove,
      handlePolygonDoubleClick,
      resetForBoard,
   };
}
