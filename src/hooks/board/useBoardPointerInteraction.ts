// -- React Imports --
import { useCallback, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

// -- Other Library Imports --
import { useStore } from 'zustand';
import cuid from 'cuid';

// -- Utils Imports --
import { itemsInMarquee, screenDeltaToWorld, screenToWorld } from '@/lib/board/boardCoordinates';
import { DEFAULT_CONNECTION_STYLE } from '@/lib/board/boardConnections';
import { MOVE_THRESHOLD } from '@/components/organisms/board/boardCanvasConstants';

// -- Type Imports --
import type { BoardState, BoardStore } from '@/lib/stores/boardStore';
import type { Viewport } from '@/lib/types/board';
import type { Point } from '@/lib/board/boardConnections';
import type { Card } from '@/lib/types/character';

interface UseBoardPointerInteractionArgs {
   store: BoardStore;
   actions: BoardState['actions'];
   cursorToWorld: (clientX: number, clientY: number) => Point | null;
   clipRef: RefObject<HTMLDivElement | null>;
   viewportRef: RefObject<Viewport>;
}

/*
 * Item pointer interaction: the group move (drag from a grip or body), the connect drag, the item double-click
 * deep action, and the background/item marquee. Owns the live move, connect-preview, and marquee state, plus
 * `moveDeltaFor` (the shared world delta the parent hands to the selection hook so its group bbox tracks a live
 * move). Subscribes to `selectedIds` directly (store state) rather than routing it through the selection hook,
 * so this hook can run BEFORE it and stay acyclic. The camera pieces it reads (`cursorToWorld`, `clipRef`,
 * `viewportRef`) are injected from the viewport hook.
 */
export function useBoardPointerInteraction({
   store,
   actions,
   cursorToWorld,
   clipRef,
   viewportRef,
}: UseBoardPointerInteractionArgs) {
   // Selection lives in the board store as ephemeral state; read here so the move gesture is group-aware
   // without routing through the selection hook (which depends on this hook's `moveDeltaFor`).
   const selectedIds = useStore(store, (state) => state.selectedIds);

   // A Shift+background marquee (null when idle); a plain drag pans instead. Corners are in
   // client coords; the clip origin is captured at start so the overlay + world math never
   // read a ref during render.
   const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number; clipLeft: number; clipTop: number } | null>(null);
   // The live group move: the moving id set + a shared world delta (null when idle).
   const [groupDrag, setGroupDrag] = useState<{ ids: Set<string>; delta: { x: number; y: number } } | null>(null);
   // The live group-move delta applies to every item in the active drag.
   const moveDeltaFor = (id: string) => (groupDrag && groupDrag.ids.has(id) ? groupDrag.delta : null);

   // The in-progress connect drag (preview line follows the cursor in world coords).
   const [connectPreview, setConnectPreview] = useState<{ fromId: string; cursor: Point } | null>(null);

   /**
    * Starts a group move from an item's move grip or its body (canvas-owned, like the connect drag). The
    * move arms only once the pointer clears `MOVE_THRESHOLD`, measured from the down origin so the item
    * never jumps; a sub-threshold release is a click - it dispatches no move and runs `onClickNoMove`
    * instead (the body passes a select there; the grip passes nothing, so a grip click is a no-op). The
    * whole selection moves if the grabbed item is in it; otherwise it selects just that item and moves it
    * alone. A shared world delta renders live; one compound command on release.
    */
   const handleMoveStart = useCallback(
      (id: string, event: ReactPointerEvent, options?: { onClickNoMove?: () => void }) => {
         if (event.button !== 0) return; // right-click is for the radial menu, not a move
         const startX = event.clientX;
         const startY = event.clientY;
         const zoom = viewportRef.current.zoom;
         const wasSelected = selectedIds.has(id);
         // Null until the move arms: the move set + the membership to re-evaluate on release. While null the
         // gesture is still a candidate click.
         let ids: Set<string> | null = null;
         let reevaluate: string[] = [];
         let delta = { x: 0, y: 0 };

         // Arms the (group-aware) move on the first past-threshold sample. Expand the set with every member
         // of any zone in it so a zone carries its contents; `reevaluate` is the directly-grabbed non-zone
         // items (their membership recomputed on release), members pulled in by a moved zone excluded.
         const arm = (moveEvent: PointerEvent) => {
            const liveItems = store.getState().items;
            const base = wasSelected ? new Set(selectedIds) : new Set([id]);
            if (!wasSelected) actions.setSelection([id]);
            const set = new Set(base);
            for (const baseId of base) {
               if (liveItems[baseId]?.kind !== 'zone') continue;
               for (const candidate of Object.values(liveItems)) if (candidate.zoneId === baseId) set.add(candidate.id);
            }
            ids = set;
            reevaluate = [...base].filter((baseId) => liveItems[baseId] && liveItems[baseId].kind !== 'zone');
            delta = screenDeltaToWorld(moveEvent.clientX - startX, moveEvent.clientY - startY, zoom);
            setGroupDrag({ ids, delta });
         };

         const onMove = (moveEvent: PointerEvent) => {
            if (!ids) {
               if (Math.abs(moveEvent.clientX - startX) < MOVE_THRESHOLD && Math.abs(moveEvent.clientY - startY) < MOVE_THRESHOLD) return;
               arm(moveEvent);
               return;
            }
            delta = screenDeltaToWorld(moveEvent.clientX - startX, moveEvent.clientY - startY, zoom);
            setGroupDrag({ ids, delta });
         };
         const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            if (ids) {
               setGroupDrag(null);
               if (delta.x !== 0 || delta.y !== 0) void actions.moveItems([...ids], delta, reevaluate);
            } else {
               options?.onClickNoMove?.();
            }
         };
         window.addEventListener('pointermove', onMove);
         window.addEventListener('pointerup', onUp);
      },
      [actions, selectedIds, store, viewportRef],
   );

   /**
    * A double-click's deep action for the kinds that own one: a challenge card copy toggles its expanded
    * display mode (persisted on the card copy). Note tiles + character elements open their tab from their
    * own double-click, so they aren't routed here.
    */
   const handleItemDoubleClick = useCallback(
      (id: string) => {
         const item = store.getState().items[id];
         if (!item || item.content.kind !== 'card' || item.content.mode !== 'copy') return;
         const card = item.content.data as Card;
         if (card.cardType !== 'CHALLENGE_CARD') return;
         void actions.updateItemContent(id, { ...item.content, data: { ...card, expanded: !(card.expanded === true) } });
      },
      [store, actions],
   );

   /**
    * Starts a connect drag from an item's connect handle: a preview line follows the
    * cursor, and a release over a different item creates a connection (otherwise cancel).
    * Custom pointer handling (window listeners), not dnd-kit.
    */
   const handleConnectStart = useCallback(
      (fromId: string, event: ReactPointerEvent) => {
         if (event.button !== 0) return; // right-click is for the radial menu, not a connect drag
         const start = cursorToWorld(event.clientX, event.clientY);
         setConnectPreview({ fromId, cursor: start ?? { x: 0, y: 0 } });

         const onMove = (moveEvent: PointerEvent) => {
            const world = cursorToWorld(moveEvent.clientX, moveEvent.clientY);
            if (world) setConnectPreview({ fromId, cursor: world });
         };
         const onUp = (upEvent: PointerEvent) => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            setConnectPreview(null);

            const hit = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
            const targetId = hit instanceof Element ? hit.closest('[data-board-item-id]')?.getAttribute('data-board-item-id') ?? null : null;
            const liveItems = store.getState().items;
            if (targetId && targetId !== fromId) {
               const target = liveItems[targetId];
               if (target && target.kind !== 'connection') {
                  const zValues = Object.values(liveItems).map((item) => item.z);
                  const z = zValues.length > 0 ? Math.max(...zValues) + 1 : 0;
                  void actions.addItem({
                     id: cuid(),
                     kind: 'connection',
                     x: 0, y: 0, width: 0, height: 0, z,
                     content: { kind: 'connection', from: fromId, to: targetId, style: { ...DEFAULT_CONNECTION_STYLE } },
                  });
               }
            }
         };
         window.addEventListener('pointermove', onMove);
         window.addEventListener('pointerup', onUp);
      },
      [cursorToWorld, store, actions],
   );

   /**
    * Starts a marquee from a screen point via WINDOW listeners (mirroring beginPan): the rectangle grows
    * with the cursor and, on release past the move threshold, selects the framed items - `additive` keeps
    * the current selection (adds the hits), otherwise it replaces it. The clip origin is captured up front
    * so the overlay + world math never read a ref during render.
    */
   const beginMarquee = useCallback((clientX: number, clientY: number, { additive }: { additive: boolean }) => {
      const el = clipRef.current;
      if (!el) return;
      const clip = el.getBoundingClientRect();
      setMarquee({ x0: clientX, y0: clientY, x1: clientX, y1: clientY, clipLeft: clip.left, clipTop: clip.top });
      const onMove = (moveEvent: PointerEvent) => {
         setMarquee((current) => (current ? { ...current, x1: moveEvent.clientX, y1: moveEvent.clientY } : null));
      };
      const onUp = (upEvent: PointerEvent) => {
         window.removeEventListener('pointermove', onMove);
         window.removeEventListener('pointerup', onUp);
         // Ignore a sub-threshold press (no real drag) so it never selects under the point.
         const dragged = Math.abs(upEvent.clientX - clientX) >= MOVE_THRESHOLD || Math.abs(upEvent.clientY - clientY) >= MOVE_THRESHOLD;
         if (dragged) {
            const origin = { left: clip.left, top: clip.top };
            const a = screenToWorld(clientX, clientY, origin, viewportRef.current);
            const b = screenToWorld(upEvent.clientX, upEvent.clientY, origin, viewportRef.current);
            const hits = itemsInMarquee(Object.values(store.getState().items), {
               minX: Math.min(a.x, b.x),
               minY: Math.min(a.y, b.y),
               maxX: Math.max(a.x, b.x),
               maxY: Math.max(a.y, b.y),
            });
            if (additive) actions.addToSelection(hits);
            else actions.setSelection(hits);
         }
         setMarquee(null);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
   }, [store, actions, clipRef, viewportRef]);

   return {
      marquee,
      groupDrag,
      connectPreview,
      moveDeltaFor,
      handleMoveStart,
      handleItemDoubleClick,
      handleConnectStart,
      beginMarquee,
   };
}
