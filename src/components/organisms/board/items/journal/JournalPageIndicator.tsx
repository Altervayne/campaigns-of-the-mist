// -- React Imports --
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Type Imports --
import type { PointerEvent as ReactPointerEvent } from 'react';

/**
 * The `N / M` page indicator: the current number is click-to-edit (a typed 1..M jumps there on Enter/blur,
 * anything else is ignored), the total stays static. Renders as a fragment so its three cells sit as direct
 * siblings of whatever bar hosts it. `touch` grows the target to >=44px and the editor to 16px (no iOS
 * focus-zoom); the compact default is the board / sheet-card sizing.
 */
export function JournalPageIndicator({
   pageIndex,
   pageCount,
   touch = false,
   stopDrag,
   onGoToPageNumber,
}: {
   pageIndex: number;
   pageCount: number;
   touch?: boolean;
   stopDrag: (event: ReactPointerEvent) => void;
   /** Jump to a validated 1..M page number. */
   onGoToPageNumber: (pageNumber: number) => void;
}) {
   const { t } = useTranslation();

   // Ephemeral view state (the typed number), so it lives here, not on the journal aggregate.
   const [editing, setEditing] = useState(false);
   const [text, setText] = useState('');
   const startEdit = () => { setText(String(pageIndex + 1)); setEditing(true); };
   const commit = () => {
      const target = Number.parseInt(text, 10);
      if (Number.isFinite(target) && target >= 1 && target <= pageCount) onGoToPageNumber(target);
      setEditing(false);
   };

   return (
      <>
         {editing ? (
            <input
               type="text"
               inputMode="numeric"
               value={text}
               autoFocus
               onChange={(event) => setText(event.target.value.replace(/[^0-9]/g, ''))}
               onFocus={(event) => event.target.select()}
               onKeyDown={(event) => { if (event.key === 'Enter') commit(); else if (event.key === 'Escape') setEditing(false); }}
               onBlur={commit}
               onPointerDown={stopDrag}
               aria-label={t('BoardView.journalGoToPage')}
               // The editable number reads as a small parchment inset on the header band (the current-page indicator).
               className={cn('rounded bg-paper-background px-1 text-center tabular-nums text-paper-foreground outline-none', touch ? 'h-11 w-11 text-base' : 'w-7')}
            />
         ) : (
            <button
               type="button"
               title={t('BoardView.journalGoToPage')}
               aria-label={t('BoardView.journalGoToPage')}
               onPointerDown={stopDrag}
               onClick={startEdit}
               className={cn('rounded px-1 text-center tabular-nums text-paper-primary-foreground/80 hover:bg-paper-primary-foreground/10 hover:text-paper-primary-foreground cursor-pointer', touch ? 'inline-flex min-h-11 min-w-11 items-center justify-center' : 'min-w-7')}
            >
               {pageIndex + 1}
            </button>
         )}
         <span className="text-paper-primary-foreground/70">/</span>
         <span className="min-w-7 px-1 text-center tabular-nums text-paper-primary-foreground/80">{pageCount}</span>
      </>
   );
}
