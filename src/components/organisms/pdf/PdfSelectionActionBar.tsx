// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import toast from 'react-hot-toast';

// -- Icon Imports --
import { Copy, Highlighter } from 'lucide-react';

/*
 * The floating action bar over a live text selection (read mode). It carries Copy - which writes the
 * selection to the clipboard, toasts, and drops it - and Highlight, which turns the selection into a text
 * highlight. Positioned fixed in viewport coordinates just above the selection rect and clamped to the
 * viewport edges. Chrome, so it uses theme tokens; the page and its text stay neutral.
 */

/** Gap above the selection rect, in px. */
const OFFSET = 8;
/** Keep the bar this far from the viewport edges, in px. */
const MARGIN = 8;
/** Assumed bar half-width for horizontal clamping before it lays out, in px. */
const APPROX_HALF_WIDTH = 48;

interface PdfSelectionActionBarProps {
   rect: DOMRect;
   text: string;
   onHighlight: () => void;
}

export function PdfSelectionActionBar({ rect, text, onHighlight }: PdfSelectionActionBarProps) {
   const { t } = useTranslation();

   const copy = () => {
      void navigator.clipboard.writeText(text).then(() => {
         toast.success(t('Notifications.pdf.textCopied'));
         window.getSelection()?.removeAllRanges();
      });
   };

   const left = Math.min(Math.max(rect.left + rect.width / 2, MARGIN + APPROX_HALF_WIDTH), window.innerWidth - MARGIN - APPROX_HALF_WIDTH);
   const top = Math.max(rect.top - OFFSET, MARGIN);

   return (
      <div
         className="pointer-events-auto fixed z-50 -translate-x-1/2 -translate-y-full"
         style={{ left, top }}
         // Keep the selection alive so the click lands: a mousedown on the bar would otherwise collapse it.
         onMouseDown={(event) => event.preventDefault()}
      >
         <div className="flex items-center gap-1 rounded-lg border border-border bg-card/95 px-1 py-1 text-card-foreground shadow-md backdrop-blur-sm">
            <button
               type="button"
               onClick={copy}
               className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded px-2 text-xs font-medium text-card-foreground hover:bg-muted"
            >
               <Copy className="h-3.5 w-3.5" />
               {t('PdfView.selection.copy')}
            </button>
            <button
               type="button"
               onClick={onHighlight}
               className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded px-2 text-xs font-medium text-card-foreground hover:bg-muted"
            >
               <Highlighter className="h-3.5 w-3.5" />
               {t('PdfView.selection.highlight')}
            </button>
         </div>
      </div>
   );
}
