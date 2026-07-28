// -- React Imports --
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

// -- Icon Imports --
import { X } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Hook Imports --
import { useCommitOnUnmount } from '@/hooks/useCommitOnUnmount';

/**
 * One side tab. Click jumps to its page (and makes it active); when the journal is selected
 * and this tab is the active page, its label becomes an inline input (commit on blur). A
 * small remove (x) shows while selected.
 */
export function BookmarkTab({
   label,
   pageNumber,
   active,
   editable,
   placeholder,
   removeLabel,
   stopDrag,
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
   stopDrag: (event: ReactPointerEvent) => void;
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

   // A tab switch unmounts the tab without a blur; flush the label buffer so it isn't lost.
   useCommitOnUnmount(commit);
   // Deselecting the journal drops `editable` and swaps the <input> for the <button> in place, WITHOUT
   // unmounting the tab - so neither onBlur nor useCommitOnUnmount fires and a label typed right before
   // deselecting is stranded in the buffer. Flush on that falling edge; the commit re-renders the tab
   // with the new label immediately (dirty-guarded, so a normal blur-then-deselect no-ops).
   const wasEditable = useRef(editable);
   useEffect(() => {
      const was = wasEditable.current;
      wasEditable.current = editable;
      if (was && !editable) commit();
   });

   return (
      <div
         className={cn(
            // Attached to the page's right edge (rounded on the outer side), protruding rightward. A paper
            // document tab: the header-band tone at rest, the paper accent when it marks the current page.
            'flex items-center gap-0.5 rounded-r-md border border-l-0 border-paper-border py-0.5 text-[0.65rem] shadow-sm',
            active ? 'bg-paper-accent text-paper-primary-foreground pl-3' : 'bg-paper-primary text-paper-primary-foreground pl-1.5',
            editable ? 'pr-0.5' : 'pr-1.5',
         )}
      >
         {active && editable ? (
            <input
               type="text"
               value={value}
               onChange={(event) => setValue(event.target.value)}
               onBlur={commit}
               onPointerDown={stopDrag}
               placeholder={placeholder}
               className="w-32 bg-transparent outline-none placeholder:text-current/50"
            />
         ) : (
            // Auto-widths to the label up to a max; a long label truncates and expands on hover
            // (growing rightward, so it never shoves the stacked tabs). `title` is the fallback.
            <button
               type="button"
               title={label && label.length > 0 ? label : undefined}
               onPointerDown={stopDrag}
               onClick={onJump}
               className="max-w-[150px] truncate text-left transition-[max-width] duration-150 hover:max-w-[320px] cursor-pointer"
            >
               {label && label.length > 0 ? label : pageNumber}
            </button>
         )}
         {editable && (
            <button
               type="button"
               title={removeLabel}
               aria-label={removeLabel}
               onPointerDown={stopDrag}
               onClick={onRemove}
               className="shrink-0 rounded ml-1 p-0.5 hover:bg-background/30 cursor-pointer"
            >
               <X className="h-2.5 w-2.5" />
            </button>
         )}
      </div>
   );
}
