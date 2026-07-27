// -- React Imports --
import { useCallback, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { useStore } from 'zustand';
import toast from 'react-hot-toast';

// -- Utils Imports --
import { centerViewport } from '@/lib/board/boardCoordinates';
import { isMergeableSelection } from '@/lib/board/layersReorder';
import { isAppendTool } from '@/lib/board/drawingStyle';

// -- Type Imports --
import type { BoardState, BoardStore } from '@/lib/stores/boardStore';
import type { ActiveTool, Viewport } from '@/lib/types/board';

interface UseBoardLayersArgs {
   store: BoardStore;
   actions: BoardState['actions'];
   items: BoardState['items'];
   clipRef: RefObject<HTMLDivElement | null>;
   viewportRef: RefObject<Viewport>;
   activeTool: ActiveTool;
   activeLayerId: string | null;
}

/*
 * The layers-panel wiring: the row handlers (select / activate / rename / reorder / merge / zone-collapse)
 * and the canvas-side render cues the panel drives (the hovered-row highlight, the active drawing-layer focus,
 * and the "new layer" armed flag). The handlers read live refs / store, so their identity stays stable and the
 * panel never re-renders on a pan; `handleLayerMerge` is shared with the palette's merge command.
 */
export function useBoardLayers({
   store,
   actions,
   items,
   clipRef,
   viewportRef,
   activeTool,
   activeLayerId,
}: UseBoardLayersArgs) {
   const { t } = useTranslation();

   // The hovered item drives a canvas highlight for a layers-panel row hover (row -> canvas only). Discrete
   // enter/leave, so subscribing here re-renders on a boundary crossing, never per pointer move.
   const hoveredId = useStore(store, (state) => state.hoveredId);

   /** Layers panel: a plain click selects just that row (no pan); Shift/Ctrl-click toggles it in the selection. */
   const handleLayerSelect = useCallback((id: string, additive: boolean) => actions.selectItem(id, additive), [actions]);

   /** Layers panel: a row's double-click centers the view on the item (keeping zoom). Reads live refs so
    *  its identity stays stable (the panel subscribes to items/selection, not to it). */
   const handleLayerActivate = useCallback((id: string) => {
      const item = store.getState().items[id];
      const el = clipRef.current;
      if (!item || !el) return;
      const rect = el.getBoundingClientRect();
      const center = { x: item.x + item.width / 2, y: item.y + item.height / 2 };
      actions.setViewport(centerViewport(center, { width: rect.width, height: rect.height }, viewportRef.current.zoom));
   }, [store, actions, clipRef, viewportRef]);

   /** Layers panel: commit a row rename (or clear the label with `undefined`) as one undoable edit. */
   const handleLayerCommitLabel = useCallback((id: string, label: string | undefined) => void actions.setItemLabel(id, label), [actions]);

   /** Layers panel: a drag-reorder lands the item at `(zoneId, index)` within its destination scope. */
   const handleLayerReorder = useCallback((id: string, zoneId: string | null, index: number) => void actions.reorderItem(id, zoneId, index), [actions]);

   /** Layers panel + palette: merge the selected drawing layers into one. Re-checks mergeability (the footer
    *  button is pre-guarded, but the palette command reaches here on any selection) and toasts when it can't. */
   const handleLayerMerge = useCallback(() => {
      const state = store.getState();
      if (!isMergeableSelection(state.items, state.selectedIds)) {
         toast.error(t('Notifications.board.layersNotMergeable'));
         return;
      }
      void actions.mergeDrawings([...state.selectedIds]);
   }, [store, actions, t]);

   /** Layers panel: the group chevron toggles the zone's collapse - the SAME content field the canvas edits. */
   const handleZoneCollapseToggle = useCallback((id: string) => {
      const zone = store.getState().items[id];
      if (zone?.content.kind !== 'zone') return;
      void actions.updateItemContent(id, { ...zone.content, collapsed: !zone.content.collapsed });
   }, [store, actions]);

   // The element a layers-panel row is hovering, highlighted on the canvas. Skipped when it's already
   // selected (its selection ring covers it) so the two cues never stack.
   const hoveredItem = hoveredId ? items[hoveredId] : undefined;

   // Active drawing-layer focus cue. On only while a drawing (append) gesture is armed AND the append target
   // is a live drawing layer - guards a stale `activeLayerId` (deleted / no longer a drawing) to null. When
   // on: the target layer stays full, every other drawing layer dims (via context), and a dashed accent box
   // wraps the target. Off in Select/eraser, or with no active layer (a fresh layer pending its first stroke).
   const focusLayer = isAppendTool(activeTool) && activeLayerId && items[activeLayerId]?.content.kind === 'drawing' ? items[activeLayerId] : undefined;
   const focusLayerId = focusLayer?.id ?? null;
   // The "new layer" button reads armed while a drawing gesture is set but no layer is the target yet, so
   // "fresh layer pending - the next stroke mints one" is legible. Un-arms the instant a layer becomes active.
   const newLayerArmed = isAppendTool(activeTool) && activeLayerId === null;

   return {
      handleLayerSelect,
      handleLayerActivate,
      handleLayerCommitLabel,
      handleLayerReorder,
      handleLayerMerge,
      handleZoneCollapseToggle,
      hoveredItem,
      focusLayer,
      focusLayerId,
      newLayerArmed,
   };
}
