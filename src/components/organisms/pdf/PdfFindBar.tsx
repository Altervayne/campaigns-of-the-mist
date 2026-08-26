// -- React Imports --
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { ChevronDown, ChevronUp, X } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { createDebouncer } from '@/lib/utils/createDebouncer';

// -- Type Imports --
import type { PdfSearchStatus } from '@/lib/stores/pdfStore';

/*
 * The reader's floating find bar, pinned top-center. Chrome, so it uses theme tokens; the page sheet stays
 * white on its own. It mirrors the bottom toolbar's panel offsets so it stays centered over the VISIBLE pages
 * (shrink from the open panel's edge). The input drives the query debounced - typing shows locally at once,
 * the scan starts once it settles - and the prev/next/close controls plus Enter/Shift+Enter/Escape drive the
 * store's match cursor.
 */

/** How long typing settles before the scan (re)starts, so each keystroke doesn't sweep the whole book. */
const SEARCH_DEBOUNCE_MS = 200;

interface PdfFindBarProps {
   navPanelOpen: boolean;
   commentsPanelOpen: boolean;
   /** The committed query, for seeding the input on mount. */
   query: string;
   status: PdfSearchStatus;
   scanned: number;
   pageCount: number;
   matchCount: number;
   /** The active match index, or -1 when none is active. */
   activeIndex: number;
   onQueryChange: (query: string) => void;
   onNext: () => void;
   onPrev: () => void;
   onClose: () => void;
}

export function PdfFindBar({ navPanelOpen, commentsPanelOpen, query, status, scanned, pageCount, matchCount, activeIndex, onQueryChange, onNext, onPrev, onClose }: PdfFindBarProps) {
   const { t } = useTranslation();
   const inputRef = useRef<HTMLInputElement>(null);

   // The live typed value; shown immediately so typing is responsive while the store scan settles behind it.
   const [value, setValue] = useState(query);

   // One debouncer for the bar's lifetime; disarmed on unmount so a settling keystroke can't fire after close.
   const debouncer = useMemo(() => createDebouncer<string>(SEARCH_DEBOUNCE_MS, onQueryChange), [onQueryChange]);
   useEffect(() => () => debouncer.cancel(), [debouncer]);

   // The bar mounts only while open, so a mount focus doubles as the open focus.
   useEffect(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
   }, []);

   const hasMatches = matchCount > 0;
   const statusText =
      status === 'scanning'
         ? t('PdfView.search.scanning', { scanned, total: pageCount })
         : hasMatches
            ? t('PdfView.search.count', { current: activeIndex >= 0 ? activeIndex + 1 : 0, total: matchCount })
            : status === 'done'
               ? t('PdfView.search.noResults')
               : '';

   return (
      // Mirror the bottom toolbar's offset wrapper: shrink from the open panel's edge so the centered bar stays
      // over the visible pages. `left`/`right` (the wrapper's own edges), not padding, moves the absolute child.
      <div className={cn('pointer-events-none absolute inset-y-0 transition-[left,right] duration-200 ease-out', navPanelOpen ? 'left-80' : 'left-0', commentsPanelOpen ? 'right-88' : 'right-0')}>
         <div className="absolute inset-x-0 top-4 flex justify-center">
            <div className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-border bg-card/95 px-2 py-1.5 text-card-foreground shadow-md backdrop-blur-sm">
               <input
                  ref={inputRef}
                  type="text"
                  value={value}
                  placeholder={t('PdfView.search.placeholder')}
                  aria-label={t('PdfView.search.placeholder')}
                  onChange={(event) => {
                     setValue(event.target.value);
                     debouncer.run(event.target.value);
                  }}
                  onKeyDown={(event) => {
                     if (event.key === 'Enter') {
                        event.preventDefault();
                        if (event.shiftKey) onPrev();
                        else onNext();
                     } else if (event.key === 'Escape') {
                        event.preventDefault();
                        onClose();
                     }
                  }}
                  className="w-56 rounded border border-border bg-muted px-2 py-1 text-sm outline-none focus:border-ring"
               />
               <span className="min-w-16 shrink-0 whitespace-nowrap px-0.5 text-center text-xs tabular-nums text-muted-foreground">{statusText}</span>
               <Divider />
               <FindButton title={t('PdfView.search.prev')} onClick={onPrev} disabled={!hasMatches}>
                  <ChevronUp className="h-4 w-4" />
               </FindButton>
               <FindButton title={t('PdfView.search.next')} onClick={onNext} disabled={!hasMatches}>
                  <ChevronDown className="h-4 w-4" />
               </FindButton>
               <Divider />
               <FindButton title={t('PdfView.search.close')} onClick={onClose}>
                  <X className="h-4 w-4" />
               </FindButton>
            </div>
         </div>
      </div>
   );
}

/** A square icon button in the bar; disabled dims and blocks the click. */
function FindButton({ title, onClick, disabled = false, children }: { title: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
   return (
      <button
         type="button"
         title={title}
         aria-label={title}
         onClick={onClick}
         disabled={disabled}
         className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded text-card-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
      >
         {children}
      </button>
   );
}

/** A thin vertical rule between bar groups. */
function Divider() {
   return <div className="mx-0.5 h-5 w-px shrink-0 bg-border" />;
}
