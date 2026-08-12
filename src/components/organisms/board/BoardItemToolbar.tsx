// -- React Imports --
import { useTranslation } from 'react-i18next';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';

// -- Icon Imports --
import { ArrowDownToLine, ArrowUpToLine, GripVertical, Spline, Trash2 } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

/*
 * The floating action bar for a selected board item: a frosted row that pops up offset
 * above the item, holding every action (move, connect, raise/lower, the item's own
 * actions, delete). The body is left for content alone - move is the grip here, not a
 * body drag, so text items can be edited without a move stealing the pointer.
 *
 * The whole bar counter-scales by 1/zoom so it stays a constant on-screen size, and is
 * centered over the item (translateX(-50%) composed with the scale, origin center-bottom);
 * the gap above the item lives inside the scaled wrapper, so it stays constant too.
 *
 * When a tall item's top runs off the top of the canvas, the bar would float out of reach above it;
 * `clampDown` (world px, from the canvas) lowers the bar's anchor so it stays visible - it sticks just
 * below the clip's top edge and floats over the item's interior instead. `clampX` does the same sideways
 * against the clip's left/right edges, where the adjacent panels begin: the bar gives up its centring
 * near an edge rather than being cut off by the clip.
 */

interface BoardItemToolbarProps {
   zoom: number;
   /** Pointer-down on the grip; the move gesture itself is owned by the canvas (group-aware). */
   onMoveStart: (event: ReactPointerEvent) => void;
   onConnectStart: (event: ReactPointerEvent) => void;
   onBringToFront: () => void;
   onSendToBack: () => void;
   onDelete: () => void;
   /** Mount point for the selected item's own actions (the per-kind slot). */
   slotRef: (node: HTMLDivElement | null) => void;
   /** Extra world-px lift above the item's top edge (a zone passes its title-bar height so the bar shows). */
   extraBottom?: number;
   /** World-px to lower the bar so it clears the clip's top edge (a tall item off the top); 0 = no clamp. */
   clampDown?: number;
   /** World-px to slide the bar sideways so it clears the clip's left/right edge; 0 = no clamp. */
   clampX?: number;
   /** Measurement mount point for the off-edge clamps; the canvas owns the arithmetic. */
   measureRef: (node: HTMLDivElement | null) => void;
}

export function BoardItemToolbar({ zoom, onMoveStart, onConnectStart, onBringToFront, onSendToBack, onDelete, slotRef, measureRef, extraBottom = 0, clampDown = 0, clampX = 0 }: BoardItemToolbarProps) {
   const { t } = useTranslation();

   // The bar anchors at the item's top edge (bottom:100%), lifted by any zone title-bar and lowered by the
   // off-top clamp; both are world px, so a subtractive clamp can push the anchor past the box interior.
   const bottom = clampDown || extraBottom ? `calc(100% + ${extraBottom - clampDown}px)` : '100%';
   // The sideways clamp rides the transform rather than `left`, so the anchor offset measured off this node
   // stays the box's own half-width instead of feeding the clamp back into itself.
   const shiftX = clampX ? `calc(-50% + ${clampX}px)` : '-50%';

   return (
      <div
         ref={measureRef}
         className="pointer-events-auto absolute left-1/2"
         style={{ bottom, transformOrigin: '50% 100%', transform: `translateX(${shiftX}) scale(${1 / zoom})` }}
      >
         {/* The padding is the screen-constant gap above the item (it scales with the bar). */}
         <div className="pb-2">
            <div className="flex items-center gap-0.5 rounded-lg border border-border bg-popover/90 p-1 shadow-md backdrop-blur-sm">
               {/* Move grip: owns the move gesture. A separate element from connect so the two
                   drags never get confused. */}
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

               {/* Connect handle: pointer-down starts a connection drag (not a move). */}
               <div
                  onPointerDown={(event) => {
                     event.stopPropagation();
                     onConnectStart(event);
                  }}
                  title={t('BoardView.connect')}
                  aria-label={t('BoardView.connect')}
                  className="flex cursor-crosshair items-center justify-center rounded p-1 text-popover-foreground hover:bg-muted"
               >
                  <Spline className="h-4 w-4" />
               </div>

               <ToolbarButton title={t('BoardView.bringToFront')} onClick={onBringToFront}>
                  <ArrowUpToLine className="h-4 w-4" />
               </ToolbarButton>
               <ToolbarButton title={t('BoardView.sendToBack')} onClick={onSendToBack}>
                  <ArrowDownToLine className="h-4 w-4" />
               </ToolbarButton>

               {/* Per-kind action slot: the selected item portals its own actions in here, bracketed by
                   dividers that set it apart from the universal controls. The whole group hides when the
                   slot is empty, so an item with no own actions shows no dangling rule. */}
               <div className="flex items-center gap-0.5 [&:has([data-item-slot]:empty)]:hidden">
                  <div className="w-px self-stretch bg-border mx-1" />
                  <div ref={slotRef} data-item-slot className="flex items-center gap-0.5" />
                  <div className="w-px self-stretch bg-border mx-1" />
               </div>

               <ToolbarButton title={t('BoardView.deleteItem')} destructive onClick={onDelete}>
                  <Trash2 className="h-4 w-4" />
               </ToolbarButton>
            </div>
         </div>
      </div>
   );
}

/** A frosted icon button in the bar; stops the pointer from starting a move/pan, click still fires. */
function ToolbarButton({ title, destructive = false, onClick, children }: { title: string; destructive?: boolean; onClick: () => void; children: ReactNode }) {
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
