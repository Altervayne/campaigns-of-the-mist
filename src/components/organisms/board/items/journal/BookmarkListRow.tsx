// -- React Imports --
import { useEffect, useRef, useState } from 'react';

// -- Icon Imports --
import { X } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Hook Imports --
import { useCommitOnUnmount } from '@/hooks/useCommitOnUnmount';

/**
 * One row in the sheet journal's Bookmarks popover list: the same functionality the side tab gives (jump
 * to its page, an editable label while editing, a remove control), laid out as a horizontal list row
 * inside a body-portaled popover so it floats above flex-wrap neighbours instead of z-burying under them.
 */
export function BookmarkListRow({
   label,
   pageNumber,
   active,
   editable,
   placeholder,
   removeLabel,
   onJump,
   onRemove,
   onLabelCommit,
}: {
   label?: string;
   pageNumber: number;
   active: boolean;
   editable: boolean;
   placeholder: string;
   removeLabel: string;
   onJump: () => void;
   onRemove: () => void;
   onLabelCommit: (value: string) => void;
}) {
   const [value, setValue] = useState(label ?? '');
   const [synced, setSynced] = useState(label ?? '');
   if ((label ?? '') !== synced) {
      setSynced(label ?? '');
      setValue(label ?? '');
   }
   const commit = () => {
      const trimmed = value.trim();
      if (trimmed !== (label ?? '')) onLabelCommit(trimmed);
   };
   // A remount (tab switch / popover close) flushes the label buffer so an edit isn't lost.
   useCommitOnUnmount(commit);
   // Deselecting while the popover stays open drops `editable` and removes the <input> in place without
   // unmounting the row - the same stranded-buffer gap the side tab has; flush on that falling edge.
   const wasEditable = useRef(editable);
   useEffect(() => {
      const was = wasEditable.current;
      wasEditable.current = editable;
      if (was && !editable) commit();
   });

   return (
      <div className={cn(
         'flex items-center gap-1 rounded-sm px-1.5 py-1 text-xs',
         active ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
      )}>
         {/* The page badge doubles as the jump target, so a labelled row still shows (and jumps to) its page. */}
         <button
            type="button"
            aria-label={String(pageNumber)}
            onClick={onJump}
            className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded bg-muted px-1 tabular-nums text-[0.65rem] text-muted-foreground hover:bg-primary hover:text-primary-foreground cursor-pointer"
         >
            {pageNumber}
         </button>
         {editable ? (
            <input
               type="text"
               value={value}
               onChange={(event) => setValue(event.target.value)}
               onBlur={commit}
               placeholder={placeholder}
               className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground/50"
            />
         ) : (
            <button
               type="button"
               title={label && label.length > 0 ? label : undefined}
               onClick={onJump}
               className="min-w-0 flex-1 truncate text-left cursor-pointer"
            >
               {label && label.length > 0 ? label : placeholder}
            </button>
         )}
         {editable && (
            <button
               type="button"
               title={removeLabel}
               aria-label={removeLabel}
               onClick={onRemove}
               className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-background/50 hover:text-destructive cursor-pointer"
            >
               <X className="h-3 w-3" />
            </button>
         )}
      </div>
   );
}
