// -- React Imports --
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { useStore } from 'zustand';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';

// -- Icon Imports --
import { Combine, Layers, X } from 'lucide-react';

// -- Component Imports --
import { LayersPanelRow } from './LayersPanelRow';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { boardItemDisplayName, boardItemKindIcon, boardItemMetadata } from '@/lib/board/boardItemDisplay';
import { staticListSortingStrategy } from '@/lib/utils/dnd';
import { buildLayerRows, isMergeableSelection, resolveLayerDrop, LAYERS_ROOT_END } from '@/lib/board/layersReorder';

// -- Type Imports --
import type { LayerRow } from '@/lib/board/layersReorder';
import type { CollisionDetection, DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import type { BoardItem } from '@/lib/types/board';
import type { BoardStore } from '@/lib/stores/boardStore';

/*
 * The board's layers panel: a right-edge overlay listing every element top-of-stack first, two-way synced
 * with the canvas selection/hover, with zones as collapsible group nodes and drag-to-reorder. It subscribes
 * to items/selection ONLY (never the viewport), so a pan never re-renders it. Its drag lives in its OWN
 * DndContext, scoped to this list, so the vertical reorder never collides with the app-wide drawer->canvas
 * drag; the layout stays static during a drag (a single insertion line marks the drop, resting rows don't move).
 */
interface LayersPanelProps {
   store: BoardStore;
   onClose: () => void;
   /** Click a row: select it alone (plain), or toggle it in the multi-selection (additive = Shift/Ctrl). */
   onSelect: (id: string, additive: boolean) => void;
   /** Double-click a row: select and center the canvas on it. */
   onActivate: (id: string) => void;
   /** Row hover -> highlight the element on the canvas. */
   onHover: (id: string | null) => void;
   /** Commits a row rename (or clears with `undefined`). */
   onCommitLabel: (id: string, label: string | undefined) => void;
   /** Reorders an item into `(zoneId, index)` within its destination scope (one undo step). */
   onReorder: (id: string, zoneId: string | null, index: number) => void;
   /** Toggles a zone's collapse (shared with the canvas). */
   onToggleZoneCollapse: (id: string) => void;
   /** Merges the current mergeable drawing selection into one layer (footer button + palette share this). */
   onMerge: () => void;
}

/** Where the insertion line sits during a drag: on a row, on its `before` (top) or `after` (bottom) edge. */
interface DropIndicator {
   overId: string;
   position: 'before' | 'after';
}

/*
 * The pointer being inside the trailing root zone wins - that's how you pull an item OUT the bottom of a
 * zone, and its large flex area sits too far from any row's center for center-based detection to catch it.
 * Every other drop (row-to-row reorder) keeps the center-based rule, so that feel is unchanged.
 */
const layersCollision: CollisionDetection = (args) => {
   const overRoot = pointerWithin(args).find((collision) => collision.id === LAYERS_ROOT_END);
   return overRoot ? [overRoot] : closestCenter(args);
};

export function LayersPanel({ store, onClose, onSelect, onActivate, onHover, onCommitLabel, onReorder, onToggleZoneCollapse, onMerge }: LayersPanelProps) {
   const { t } = useTranslation();
   const items = useStore(store, (state) => state.items);
   const selectedIds = useStore(store, (state) => state.selectedIds);

   // The merge footer shows for any multi-selection (a merge might be intended) and enables only for a
   // contiguous drawing-only run; otherwise it greys the button and explains, never silently restacking.
   const mergeable = useMemo(() => isMergeableSelection(items, selectedIds), [items, selectedIds]);
   const selectedDrawingCount = useMemo(() => {
      let count = 0;
      for (const id of selectedIds) if (items[id]?.content.kind === 'drawing') count += 1;
      return count;
   }, [items, selectedIds]);

   // Collapse lives on each zone's content (the same field the canvas reads/writes), so the panel and the
   // canvas share ONE collapse state - no second panel-only flag.
   const collapsedZoneIds = useMemo(() => {
      const ids = new Set<string>();
      for (const item of Object.values(items)) {
         if (item.content.kind === 'zone' && item.content.collapsed) ids.add(item.id);
      }
      return ids;
   }, [items]);

   // The top-down group rows (front-first), and the sortable id list in the same order.
   const rows = useMemo(() => buildLayerRows(items, collapsedZoneIds), [items, collapsedZoneIds]);
   const rowIds = useMemo(() => rows.map((row) => row.item.id), [rows]);

   // Fold the flat rows into render groups: a zone header + its members share ONE container so the group
   // reads as a single object; every other row stands alone. buildLayerRows emits a header immediately
   // followed by its members, so a single pass collects them.
   const groups = useMemo(() => {
      const out: ({ zone: LayerRow; members: LayerRow[] } | { solo: LayerRow })[] = [];
      for (const row of rows) {
         const last = out[out.length - 1];
         if (row.isZone) out.push({ zone: row, members: [] });
         else if (row.depth === 1 && last && 'zone' in last) last.members.push(row);
         else out.push({ solo: row });
      }
      return out;
   }, [rows]);

   // Members per zone, so a zone row can show its count without each row walking the whole map.
   const zoneMemberCounts = useMemo(() => {
      const counts = new Map<string, number>();
      for (const item of Object.values(items)) {
         if (item.zoneId) counts.set(item.zoneId, (counts.get(item.zoneId) ?? 0) + 1);
      }
      return counts;
   }, [items]);

   // A zone's tint color (its own content color), for the group rail; undefined falls back to a theme token.
   const zoneColor = (zoneId: string | null): string | undefined => {
      if (!zoneId) return undefined;
      const zone = items[zoneId];
      return zone?.content.kind === 'zone' ? zone.content.color : undefined;
   };

   const [activeId, setActiveId] = useState<string | null>(null);
   const [indicator, setIndicator] = useState<DropIndicator | null>(null);
   // Read the live indicator inside onDragEnd without a stale closure.
   const indicatorRef = useRef<DropIndicator | null>(null);
   const setDrop = (next: DropIndicator | null) => { indicatorRef.current = next; setIndicator(next); };

   // A LOCAL drag context; the small activation distance lets a grip CLICK (select) fire without a drag.
   const sensors = useSensors(
      useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
      useSensor(KeyboardSensor),
   );

   const handleDragStart = (event: DragStartEvent) => {
      setActiveId(String(event.active.id));
      setDrop(null);
   };

   const handleDragOver = (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over || over.id === active.id) { if (indicatorRef.current) setDrop(null); return; }
      // Which edge: the dragged row's live center vs the over row's center (static layout, so rects are stable).
      const activeRect = active.rect.current.translated;
      const overRect = over.rect;
      const position: 'before' | 'after' = activeRect && activeRect.top + activeRect.height / 2 < overRect.top + overRect.height / 2 ? 'before' : 'after';
      const overId = String(over.id);
      // State-on-change: only re-render when the drop edge actually moves.
      const current = indicatorRef.current;
      if (!current || current.overId !== overId || current.position !== position) setDrop({ overId, position });
   };

   const handleDragEnd = (event: DragEndEvent) => {
      const drop = indicatorRef.current;
      const draggedId = String(event.active.id);
      setActiveId(null);
      setDrop(null);
      if (!drop) return;
      const target = resolveLayerDrop(store.getState().items, draggedId, drop.overId, drop.position);
      if (target) onReorder(draggedId, target.zoneId, target.index);
   };

   const handleDragCancel = () => { setActiveId(null); setDrop(null); };

   const activeItem = activeId ? items[activeId] : null;

   // One row, whether it stands alone or sits inside a zone container (the container owns the group tint).
   const renderRow = (row: LayerRow) => (
      <LayersPanelRow
         key={row.item.id}
         item={row.item}
         metadata={boardItemMetadata(row.item, t, zoneMemberCounts.get(row.item.id))}
         isSelected={selectedIds.has(row.item.id)}
         depth={row.depth}
         isZone={row.isZone}
         collapsed={row.isZone ? collapsedZoneIds.has(row.item.id) : undefined}
         insertion={indicator?.overId === row.item.id ? indicator.position : null}
         onSelect={onSelect}
         onActivate={onActivate}
         onHover={onHover}
         onCommitLabel={onCommitLabel}
         onToggleCollapse={row.isZone ? onToggleZoneCollapse : undefined}
      />
   );

   return (
      <div
         data-tutorial="board-layers-panel"
         // The panel sits inside the board clip, so its wheel events reach the canvas zoom listener; this
         // opt-out makes that listener bail here, so the row list scrolls natively instead of zooming the board.
         data-board-wheel-scroll
         onPointerDown={(event) => event.stopPropagation()}
         className="absolute inset-y-0 right-0 z-40 flex w-64 flex-col border-l border-border bg-card shadow-sm"
      >
         <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2.5">
            <Layers className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="text-sm font-semibold text-foreground">{t('LayersPanel.title')}</span>
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">{rows.length}</span>
            <button
               type="button"
               onClick={onClose}
               title={t('LayersPanel.close')}
               aria-label={t('LayersPanel.close')}
               className="flex shrink-0 cursor-pointer items-center justify-center rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
               <X className="size-4" />
            </button>
         </div>

         {rows.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-muted-foreground">
               <Layers className="size-8 opacity-40" aria-hidden />
               <p className="text-xs">{t('LayersPanel.empty')}</p>
            </div>
         ) : (
            <DndContext
               sensors={sensors}
               collisionDetection={layersCollision}
               onDragStart={handleDragStart}
               onDragOver={handleDragOver}
               onDragEnd={handleDragEnd}
               onDragCancel={handleDragCancel}
            >
               <SortableContext items={rowIds} strategy={staticListSortingStrategy}>
                  <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain p-1.5">
                     {groups.map((group) => {
                        if (!('zone' in group)) return renderRow(group.solo);
                        const color = zoneColor(group.zone.item.id);
                        return (
                           <div
                              key={group.zone.item.id}
                              className={cn('shrink-0 space-y-0.5 rounded-md border border-border/60 bg-muted/20 p-0.5', !color && 'border-l-2 border-l-primary/40')}
                              style={color ? { borderLeftWidth: 2, borderLeftColor: color } : undefined}
                           >
                              {renderRow(group.zone)}
                              {group.members.map(renderRow)}
                           </div>
                        );
                     })}
                     {/* The empty tail below every group is a drop target: release here to pull an item out to
                         the root stack - the way out the bottom of a zone that has nothing under it. */}
                     <RootEndDropZone showLine={indicator?.overId === LAYERS_ROOT_END} />
                  </div>
               </SortableContext>
               <DragOverlay dropAnimation={null}>
                  {activeItem ? <LayerDragPreview item={activeItem} t={t} /> : null}
               </DragOverlay>
            </DndContext>
         )}

         {/* Contextual footer, horizontal so a future Mask button slots beside Merge. Shows for any multi-
             selection; the Merge button enables only for a contiguous drawing run, else greys + explains. */}
         {selectedIds.size >= 2 && (
            <div className="flex items-center gap-2 border-t border-border bg-muted/40 px-3 py-2">
               <button
                  type="button"
                  disabled={!mergeable}
                  onClick={mergeable ? onMerge : undefined}
                  className={cn(
                     'flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-sm',
                     mergeable
                        ? 'cursor-pointer bg-primary/10 text-foreground ring-1 ring-primary/40 hover:bg-primary/20'
                        : 'cursor-not-allowed text-muted-foreground/50',
                  )}
               >
                  <Combine className="size-4 shrink-0" aria-hidden />
                  <span>{t('LayersPanel.mergeCount', { count: selectedDrawingCount })}</span>
               </button>
               {!mergeable && <span className="min-w-0 flex-1 text-xs text-muted-foreground">{t('LayersPanel.mergeHint')}</span>}
            </div>
         )}
      </div>
   );
}

/** The floating preview under the cursor while a row drags: the item's glyph + name, on a frosted chip. */
function LayerDragPreview({ item, t }: { item: BoardItem; t: ReturnType<typeof useTranslation>['t'] }) {
   const Icon = boardItemKindIcon(item);
   return (
      <div className="flex items-center gap-1.5 rounded border border-border bg-popover/95 px-2 py-1 text-sm text-foreground shadow-lg">
         {/* eslint-disable-next-line react-hooks/static-components */}
         <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
         <span className="truncate">{boardItemDisplayName(item, t)}</span>
      </div>
   );
}

/** The trailing droppable filling the list's empty tail; a drop here resolves to the back of the root stack. */
function RootEndDropZone({ showLine }: { showLine: boolean }) {
   const { setNodeRef } = useDroppable({ id: LAYERS_ROOT_END });
   return (
      <div ref={setNodeRef} className="relative min-h-10 flex-1">
         {showLine && <div aria-hidden className="pointer-events-none absolute inset-x-2 top-1 h-0.5 rounded-full bg-primary" />}
      </div>
   );
}
