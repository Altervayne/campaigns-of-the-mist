// -- React Imports --
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { Tag } from 'lucide-react';

// -- Component Imports --
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { CONNECTION_TRIGGER_CLASS } from './connectionToolbarButton';

// -- Type Imports --
import type { ConnectionStyle } from '@/lib/types/board';

/*
 * The Label group in the connection toolbar: a trigger (filled tag when a label is set) opening a text
 * field. The label commits ONE undoable command when the popover closes (outside click / Escape /
 * Enter) or the connection is deselected, not per keystroke. Trimmed; an empty field clears the label.
 */
export function ConnectionLabelPopover({ style, onChange }: { style: ConnectionStyle; onChange: (style: ConnectionStyle) => void }) {
   const { t } = useTranslation();
   const [open, setOpen] = useState(false);
   const [value, setValue] = useState('');

   // The commit reads from refs so it is correct from any close path and unaffected by stale closures.
   // `null` = nothing was edited (the popover never opened), so commit is a no-op; without this an
   // unmount right after mount (StrictMode, a remount) would commit an empty string and wipe the label.
   const pendingRef = useRef<string | null>(null);
   const styleRef = useRef(style);
   useEffect(() => { styleRef.current = style; });

   const commit = useCallback(() => {
      const pending = pendingRef.current;
      if (pending === null) return;
      pendingRef.current = null;
      const current = styleRef.current;
      const next = pending.trim();
      const label = current.label ?? '';
      if (next === label) return;
      const nextStyle: ConnectionStyle = { ...current };
      if (next) nextStyle.label = next;
      else delete nextStyle.label;
      onChange(nextStyle);
   }, [onChange]);

   // Commit any pending edit if the control unmounts (the connection is deselected) while open.
   const commitRef = useRef(commit);
   useEffect(() => { commitRef.current = commit; });
   useEffect(() => () => { commitRef.current(); }, []);

   const openWith = (next: boolean) => {
      if (next) {
         const seed = styleRef.current.label ?? '';
         setValue(seed);
         pendingRef.current = seed;
      } else {
         commit();
      }
      setOpen(next);
   };

   return (
      <Popover open={open} onOpenChange={openWith}>
         <PopoverTrigger asChild>
            <button
               type="button"
               title={t('BoardView.connectionLabel')}
               aria-label={t('BoardView.connectionLabel')}
               onPointerDown={(event) => event.stopPropagation()}
               className={cn(CONNECTION_TRIGGER_CLASS, style.label && 'ring-1 ring-primary')}
            >
               <Tag className={cn('h-4 w-4', style.label && 'fill-current')} />
            </button>
         </PopoverTrigger>
         {/* Stop the pointer or the canvas background handler reads it as a click-away and drops the selection. */}
         <PopoverContent align="center" className="w-56 p-2" onPointerDown={(event) => event.stopPropagation()}>
            <Input
               autoFocus
               value={value}
               placeholder={t('BoardView.connectionLabelPlaceholder')}
               onChange={(event) => { setValue(event.target.value); pendingRef.current = event.target.value; }}
               onKeyDown={(event) => {
                  if (event.key === 'Enter') { event.preventDefault(); openWith(false); }
               }}
               className="h-8"
            />
         </PopoverContent>
      </Popover>
   );
}
