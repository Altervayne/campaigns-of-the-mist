// -- React Imports --
import { useState, type PointerEvent as ReactPointerEvent } from 'react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Hook Imports --
import { useCommitOnUnmount } from '@/hooks/useCommitOnUnmount';

/** The tray's title: held locally and committed on blur, like the other text bodies. */
export function DiceTrayTitleInput({
   title,
   editable,
   placeholder,
   stopDrag,
   onCommit,
   onFocus,
}: {
   title: string | undefined;
   editable: boolean;
   placeholder: string;
   stopDrag: (event: ReactPointerEvent) => void;
   onCommit: (title: string) => void;
   onFocus?: () => void;
}) {
   const [draft, setDraft] = useState(title ?? '');
   const [synced, setSynced] = useState(title ?? '');
   if ((title ?? '') !== synced) {
      setSynced(title ?? '');
      setDraft(title ?? '');
   }
   const commit = () => {
      const trimmed = draft.trim();
      if (trimmed !== (title ?? '')) onCommit(trimmed);
   };

   // The board host unmounts on a tab switch without a blur; flush the buffered title so it isn't lost.
   useCommitOnUnmount(commit);

   return (
      <input
         type="text"
         value={draft}
         onChange={(event) => setDraft(event.target.value)}
         onFocus={onFocus}
         onBlur={commit}
         onPointerDown={stopDrag}
         placeholder={placeholder}
         className={cn(
            'shrink-0 border-b border-border bg-transparent px-2 py-1.5 text-sm font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground/60',
            editable ? 'pointer-events-auto' : 'pointer-events-none',
         )}
      />
   );
}
