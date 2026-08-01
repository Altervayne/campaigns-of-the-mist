// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Component Imports --
import { NoteOutlineTree } from '@/components/organisms/note/NoteOutlineTree';

// -- Type Imports --
import type { NoteHeading } from '@/lib/notes/noteOutline';

/*
 * The note document OUTLINE panel: a real SLIDING rail of workspace CHROME (flush to the sidebar + toolbar
 * edges, a right-border divider from the canvas) that animates its width open/closed - the fixed-width panel is
 * clipped by the wrapper's `overflow-hidden` so the paper reflows into the freed space, never a pop. A sticky
 * muted "OUTLINE" header tops it; below, the shared {@link NoteOutlineTree} renders the collapsible heading
 * tree. Reactive to `body` (live-updates); a row click jumps (the caller routes CM6 scroll vs `#slug` per mode).
 */

/** Rail width when open (Tailwind `w-64` = 16rem). The closed rail is `w-0`; the delta animates. */
const RAIL_OPEN_CLASS = 'w-64';

export function NoteOutline({ body, isOpen, onJump }: { body: string; isOpen: boolean; onJump: (heading: NoteHeading) => void }) {
   const { t } = useTranslation();

   return (
      <div
         className={cn(
            'shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out',
            isOpen ? RAIL_OPEN_CLASS : 'w-0',
         )}
         aria-hidden={!isOpen}
      >
         {/* Full-height chrome panel flush to the content-row edges; the RIGHT border divides it from the canvas
             (on the inner nav so a closed w-0 rail shows no stray line). Fixed width so it never squishes mid-slide. */}
         <nav
            aria-labelledby="note-outline-title"
            className={cn('flex h-full flex-col border-r border-border bg-popover text-popover-foreground', RAIL_OPEN_CLASS)}
         >
            {/* Panel title: a muted, uppercase-tracked chrome header with its own padding + a divider under it. */}
            <div
               id="note-outline-title"
               className="shrink-0 border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
               {t('NoteView.outline.title')}
            </div>

            <NoteOutlineTree body={body} onJump={onJump} />
         </nav>
      </div>
   );
}
