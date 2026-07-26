// -- React Imports --
import { useState } from 'react';

// -- Hook Imports --
import { useCommitOnUnmount } from '@/hooks/useCommitOnUnmount';

/**
 * The board name, living as the leading element of the top-left bar: click to edit, commit on
 * blur/Enter, revert on Escape. Controlled, with the buffer resyncing when `name` changes externally
 * (undo elsewhere, a fresh hydrate) via adjust-state-during-render. It auto-sizes to its content - a
 * hidden mirror span (same font/padding) measures the text (or placeholder when empty) and drives the
 * input width - so the title always shows fully and the bar grows to fit it; no truncation.
 */
export function BoardNameField({ name, placeholder, onCommit }: { name: string; placeholder: string; onCommit: (value: string) => void }) {
   const [text, setText] = useState(name);
   const [synced, setSynced] = useState(name);
   if (name !== synced) {
      setSynced(name);
      setText(name);
   }

   const commit = () => {
      const trimmed = text.trim();
      if (trimmed && trimmed !== name) onCommit(trimmed);
      else setText(name); // empty or unchanged -> revert to the stored name
   };

   // A tab switch unmounts the board without a blur; flush the buffered name so it isn't lost.
   useCommitOnUnmount(commit);

   return (
      <div className="relative shrink-0">
         {/* Invisible mirror: its width (text or the placeholder when empty) sizes the field. */}
         <span aria-hidden className="invisible block whitespace-pre px-2.5 text-base font-semibold">{text || placeholder}</span>
         <input
            type="text"
            value={text}
            placeholder={placeholder}
            onChange={(event) => setText(event.target.value)}
            onPointerDown={(event) => event.stopPropagation()}
            onBlur={commit}
            onKeyDown={(event) => {
               if (event.key === 'Enter') event.currentTarget.blur();
               else if (event.key === 'Escape') {
                  setText(name);
                  event.currentTarget.blur();
               }
            }}
            className="pointer-events-auto absolute inset-0 h-full w-full rounded bg-transparent px-2.5 text-base font-semibold text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground/60 hover:bg-muted/60 focus:bg-muted/50"
         />
      </div>
   );
}
