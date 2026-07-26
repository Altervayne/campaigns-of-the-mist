// -- React Imports --
import { forwardRef, useState } from 'react';

/**
 * One axis of the view-center coordinate (X or Y) in the positioning cluster: shows the rounded world
 * value the view is centered on, editable to recenter the viewport on that axis. Controlled buffer,
 * commit on blur/Enter, revert on Escape; the buffer resyncs when the value changes externally (a pan /
 * zoom / fit) via adjust-state-during-render. A non-numeric or unchanged entry reverts. Stops the pointer
 * so editing never pans; the X field forwards its ref so the palette's jump command can focus it.
 */
export const BoardCoordinateField = forwardRef<HTMLInputElement, { prefix: string; label: string; value: number; onCommit: (value: number) => void }>(
   function BoardCoordinateField({ prefix, label, value, onCommit }, ref) {
      const [text, setText] = useState(String(value));
      const [synced, setSynced] = useState(value);
      if (value !== synced) {
         setSynced(value);
         setText(String(value));
      }

      const commit = () => {
         const parsed = Number.parseInt(text, 10);
         if (Number.isFinite(parsed) && parsed !== value) onCommit(parsed);
         else setText(String(value)); // invalid or unchanged -> revert to the live value
      };

      return (
         <label className="flex items-center gap-0.5">
            <span aria-hidden className="font-mono text-md text-muted-foreground">{prefix}</span>
            <input
               ref={ref}
               type="text"
               inputMode="numeric"
               value={text}
               aria-label={label}
               title={label}
               onChange={(event) => setText(event.target.value)}
               onPointerDown={(event) => event.stopPropagation()}
               onBlur={commit}
               onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                  else if (event.key === 'Escape') {
                     setText(String(value));
                     event.currentTarget.blur();
                  }
               }}
               className="h-6 w-12 rounded bg-transparent px-1 text-center font-mono text-xs tabular-nums text-foreground outline-none hover:bg-muted/60 focus:bg-muted/50"
            />
         </label>
      );
   },
);
