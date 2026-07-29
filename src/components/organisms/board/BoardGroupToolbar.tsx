// -- React Imports --
import { useTranslation } from 'react-i18next';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';

// -- Icon Imports --
import { Copy, GripVertical, Trash2 } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

/*
 * The floating action bar for a MULTI-selection: move the whole group, duplicate it, or
 * delete it, anchored above the selection's bounding box. Same frosted look and 1/zoom
 * counter-scale as the per-item toolbar. The per-item toolbars are suppressed while
 * multi-selected, so the move grip lives HERE.
 *
 * Its host spans the whole selection bbox and must stay inert so a press still reaches the items inside
 * it, so the bar re-arms pointer events on itself.
 *
 * When the selection's top runs off the top of the canvas, the bar would float out of reach above it;
 * `clampDown` (world px, from the canvas) lowers the bar's anchor so it sticks just below the clip's top
 * edge and floats over the selection instead.
 */

interface BoardGroupToolbarProps {
   zoom: number;
   /** Pointer-down on the grip starts the group move (canvas-owned). */
   onMoveStart: (event: ReactPointerEvent) => void;
   onDuplicate: () => void;
   onDelete: () => void;
   /** World-px to lower the bar so it clears the clip's top edge (a selection off the top); 0 = no clamp. */
   clampDown?: number;
}

export function BoardGroupToolbar({ zoom, onMoveStart, onDuplicate, onDelete, clampDown = 0 }: BoardGroupToolbarProps) {
   const { t } = useTranslation();

   // The bar anchors at the bbox's top edge (bottom:100%), lowered by the off-top clamp (world px), which
   // can push the anchor down past the bbox interior.
   const bottom = clampDown ? `calc(100% - ${clampDown}px)` : '100%';

   return (
      <div className="pointer-events-auto absolute left-0" style={{ bottom, transformOrigin: '0 100%', transform: `scale(${1 / zoom})` }}>
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
