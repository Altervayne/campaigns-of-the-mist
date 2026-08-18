// -- React Imports --
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { RotateCcw } from 'lucide-react';

/**
 * The rotation angle field in a rotatable item's toolbar: shows the current angle in whole degrees,
 * editable to set an absolute rotation. Controlled buffer, commit on blur/Enter, revert on Escape; the
 * buffer resyncs when the angle changes externally (a handle drag, undo) via adjust-state-during-render.
 * A reset control clears the rotation to 0 once the item is turned. Stops the pointer so editing never
 * starts a move.
 */
export function BoardAngleField({ value, onCommit }: { value: number; onCommit: (deg: number) => void }) {
   const { t } = useTranslation();
   const rounded = Math.round(value);
   const [text, setText] = useState(String(rounded));
   const [synced, setSynced] = useState(rounded);
   if (rounded !== synced) {
      setSynced(rounded);
      setText(String(rounded));
   }

   const commit = () => {
      const parsed = Number.parseInt(text, 10);
      if (Number.isFinite(parsed) && parsed !== rounded) onCommit(parsed);
      else setText(String(rounded)); // invalid or unchanged -> revert to the live value
   };

   return (
      <div className="flex items-center">
         <label className="flex items-center">
            <input
               type="text"
               inputMode="numeric"
               value={text}
               aria-label={t('BoardView.rotationAngle')}
               title={t('BoardView.rotationAngle')}
               onChange={(event) => setText(event.target.value)}
               onPointerDown={(event) => event.stopPropagation()}
               onBlur={commit}
               onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                  else if (event.key === 'Escape') {
                     setText(String(rounded));
                     event.currentTarget.blur();
                  }
               }}
               className="h-6 w-9 rounded bg-transparent px-1 text-center font-mono text-xs tabular-nums text-popover-foreground outline-none hover:bg-muted/60 focus:bg-muted/50"
            />
            <span aria-hidden className="text-xs text-muted-foreground">&deg;</span>
         </label>
         {rounded !== 0 && (
            <button
               type="button"
               title={t('BoardView.resetRotation')}
               aria-label={t('BoardView.resetRotation')}
               onPointerDown={(event) => event.stopPropagation()}
               onClick={() => onCommit(0)}
               className="flex cursor-pointer items-center justify-center rounded p-1 text-popover-foreground hover:bg-muted"
            >
               <RotateCcw className="h-3.5 w-3.5" />
            </button>
         )}
      </div>
   );
}
