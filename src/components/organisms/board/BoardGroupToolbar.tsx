// -- React Imports --
import { useTranslation } from 'react-i18next';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';

// -- Icon Imports --
import {
   AlignCenterHorizontal,
   AlignCenterVertical,
   AlignEndHorizontal,
   AlignEndVertical,
   AlignHorizontalDistributeCenter,
   AlignStartHorizontal,
   AlignStartVertical,
   AlignVerticalDistributeCenter,
   Copy,
   GripVertical,
   Trash2,
} from 'lucide-react';

// -- Component Imports --
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Type Imports --
import type { AlignEdge, DistributeAxis } from '@/lib/board/boardAlign';

/*
 * The floating action bar for a MULTI-selection: move the whole group, duplicate it, or
 * delete it, anchored above the selection's bounding box. Same frosted look and 1/zoom
 * counter-scale as the per-item toolbar. The per-item toolbars are suppressed while
 * multi-selected, so the move grip lives HERE.
 *
 * Its host spans the whole selection bbox and must stay inert so a press still reaches the items inside
 * it, so the bar re-arms pointer events on itself.
 *
 * When the selection runs off an edge the bar would float out of reach; `clampDown` (world px, from the
 * canvas) shifts it vertically to stick just inside the clip: positive lowers it off the top edge,
 * negative raises it off the bottom, floating over the selection instead. `clampX` does the same sideways
 * against the clip's left/right edges, where the adjacent panels begin: the bar gives up its left-alignment
 * near an edge rather than being cut off by the clip.
 */

interface BoardGroupToolbarProps {
   zoom: number;
   /** Pointer-down on the grip starts the group move (canvas-owned). */
   onMoveStart: (event: ReactPointerEvent) => void;
   onDuplicate: () => void;
   onDelete: () => void;
   /** Non-connection selected count: under 3 the two distribute buttons disable (align needs only 2). */
   alignableCount: number;
   onAlign: (edge: AlignEdge) => void;
   onDistribute: (axis: DistributeAxis) => void;
   /** World-px to shift the bar vertically so it clears the clip: positive lowers it off the top edge,
       negative raises it off the bottom; 0 = no clamp. */
   clampDown?: number;
   /** World-px to slide the bar sideways so it clears the clip's left/right edge; 0 = no clamp. */
   clampX?: number;
   /** Measurement mount point for the off-edge clamps; the canvas owns the arithmetic. */
   measureRef: (node: HTMLDivElement | null) => void;
}

export function BoardGroupToolbar({ zoom, onMoveStart, onDuplicate, onDelete, alignableCount, onAlign, onDistribute, measureRef, clampDown = 0, clampX = 0 }: BoardGroupToolbarProps) {
   const { t } = useTranslation();

   // The bar anchors at the bbox's top edge (bottom:100%), lowered by the off-top clamp (world px), which
   // can push the anchor down past the bbox interior.
   const bottom = clampDown ? `calc(100% - ${clampDown}px)` : '100%';
   // The sideways clamp rides the transform rather than `left`, so the anchor offset measured off this node
   // stays the bbox's own left edge instead of feeding the clamp back into itself.
   const transform = clampX ? `translateX(${clampX}px) scale(${1 / zoom})` : `scale(${1 / zoom})`;

   return (
      <div ref={measureRef} className="pointer-events-auto absolute left-0" style={{ bottom, transformOrigin: '0 100%', transform }}>
         {/* The padding is the screen-constant gap above the selection (it scales with the bar). */}
         <div className="pb-2">
            <div className="flex items-center gap-0.5 rounded-lg border border-border bg-popover/90 p-1 shadow-md backdrop-blur-sm">
               <div
                  onPointerDown={(event) => {
                     event.stopPropagation();
                     onMoveStart(event);
                  }}
                  title={t('BoardView.moveItem')}
                  aria-label={t('BoardView.moveItem')}
                  // The grip icon is its own affordance; the cursor stays the regular default (the hand is pan-only).
                  className="flex cursor-default items-center justify-center rounded p-1 text-popover-foreground hover:bg-muted"
               >
                  <GripVertical className="h-4 w-4" />
               </div>
               <Popover>
                  <PopoverTrigger asChild>
                     <button
                        type="button"
                        title={t('BoardView.alignSelection')}
                        aria-label={t('BoardView.alignSelection')}
                        onPointerDown={(event) => event.stopPropagation()}
                        className="flex cursor-pointer items-center justify-center rounded p-1 text-popover-foreground hover:bg-muted"
                     >
                        <AlignCenterHorizontal className="h-4 w-4" />
                     </button>
                  </PopoverTrigger>
                  {/* Portals to the body at z-50, above the z-45 transformed overlay, so it renders at natural
                      screen size with no counter-scale. A React portal still bubbles events up the React tree,
                      so stop the pointer here or the canvas's background handler reads it as a click-away and
                      clears the selection before the align runs. */}
                  <PopoverContent align="center" className="w-auto p-1" onPointerDown={(event) => event.stopPropagation()}>
                     <div className="flex flex-col gap-1">
                        <div className="flex gap-0.5">
                           <AlignButton title={t('BoardView.alignLeft')} onClick={() => onAlign('left')}><AlignStartVertical className="h-4 w-4" /></AlignButton>
                           <AlignButton title={t('BoardView.alignCenterX')} onClick={() => onAlign('centerX')}><AlignCenterVertical className="h-4 w-4" /></AlignButton>
                           <AlignButton title={t('BoardView.alignRight')} onClick={() => onAlign('right')}><AlignEndVertical className="h-4 w-4" /></AlignButton>
                        </div>
                        <div className="flex gap-0.5">
                           <AlignButton title={t('BoardView.alignTop')} onClick={() => onAlign('top')}><AlignStartHorizontal className="h-4 w-4" /></AlignButton>
                           <AlignButton title={t('BoardView.alignMiddleY')} onClick={() => onAlign('middleY')}><AlignCenterHorizontal className="h-4 w-4" /></AlignButton>
                           <AlignButton title={t('BoardView.alignBottom')} onClick={() => onAlign('bottom')}><AlignEndHorizontal className="h-4 w-4" /></AlignButton>
                        </div>
                        <div className="flex gap-0.5">
                           <AlignButton title={t('BoardView.distributeHorizontal')} disabled={alignableCount < 3} onClick={() => onDistribute('horizontal')}><AlignHorizontalDistributeCenter className="h-4 w-4" /></AlignButton>
                           <AlignButton title={t('BoardView.distributeVertical')} disabled={alignableCount < 3} onClick={() => onDistribute('vertical')}><AlignVerticalDistributeCenter className="h-4 w-4" /></AlignButton>
                        </div>
                     </div>
                  </PopoverContent>
               </Popover>
               <GroupButton title={t('BoardView.duplicateSelection')} onClick={onDuplicate}>
                  <Copy className="h-4 w-4" />
               </GroupButton>
               <GroupButton title={t('BoardView.deleteSelection')} destructive onClick={onDelete}>
                  <Trash2 className="h-4 w-4" />
               </GroupButton>
            </div>
         </div>
      </div>
   );
}

/** A frosted icon button in the group bar; stops the pointer from starting a move/pan, click still fires. */
function GroupButton({ title, destructive = false, onClick, children }: { title: string; destructive?: boolean; onClick: () => void; children: ReactNode }) {
   return (
      <button
         type="button"
         title={title}
         aria-label={title}
         onPointerDown={(event) => event.stopPropagation()}
         onClick={onClick}
         className={cn(
            'flex cursor-pointer items-center justify-center rounded p-1',
            destructive ? 'text-destructive hover:bg-destructive/15' : 'text-popover-foreground hover:bg-muted',
         )}
      >
         {children}
      </button>
   );
}

/** A square icon button in the align popover grid; disables (dimmed, inert) when its op isn't available. */
function AlignButton({ title, disabled = false, onClick, children }: { title: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
   return (
      <button
         type="button"
         title={title}
         aria-label={title}
         disabled={disabled}
         onClick={onClick}
         className="flex cursor-pointer items-center justify-center rounded p-1.5 text-popover-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
      >
         {children}
      </button>
   );
}
