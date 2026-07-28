// -- Icon Imports --
import { GripVertical } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Type Imports --
import type { SortableChildProps } from '@/components/dnd';

/**
 * One row in the pages overview: a hover-revealed grip that carries the drag listeners, then the page's
 * number + first-line snippet as a jump button. Click jumps to the page; the grip's click is swallowed so
 * a grip tap never doubles as a jump, and the row's pointerdown so a press never also drags the board item.
 */
export function PageReorderRow({
   label,
   snippet,
   emptyLabel,
   reorderLabel,
   active,
   dragAttributes,
   dragListeners,
   onJump,
}: {
   label: string;
   snippet: string;
   emptyLabel: string;
   reorderLabel: string;
   active: boolean;
   dragAttributes?: SortableChildProps['dragAttributes'];
   dragListeners?: SortableChildProps['dragListeners'];
   onJump: () => void;
}) {
   return (
      <div
         className={cn('flex items-center rounded-sm', active ? 'bg-accent text-accent-foreground' : 'hover:bg-muted')}
         // React events bubble through the component tree, not the DOM, so the popover's body portal does NOT
         // keep a press off the board item. Stopping here covers the grip and the jump button alike: React
         // dispatches to the target first, so dnd-kit's own pointerdown has already run and the sortable drag
         // still starts; the bubble is only cut before it reaches the item's move gesture.
         onPointerDown={(event) => event.stopPropagation()}
      >
         <button
            type="button"
            {...dragAttributes}
            {...dragListeners}
            onClick={(event) => event.stopPropagation()}
            title={reorderLabel}
            aria-label={reorderLabel}
            className="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground"
         >
            <GripVertical className="h-4 w-4" />
         </button>
         <button type="button" onClick={onJump} className="flex min-w-0 flex-1 items-center gap-2 py-1 pr-2 text-left cursor-pointer">
            <span className="shrink-0 text-xs font-medium tabular-nums">{label}</span>
            <span className={cn('min-w-0 flex-1 truncate text-xs', snippet ? 'text-muted-foreground' : 'italic text-muted-foreground/60')}>
               {snippet || emptyLabel}
            </span>
         </button>
      </div>
   );
}
