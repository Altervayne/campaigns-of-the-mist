// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { X } from 'lucide-react';

// -- Type Imports --
import type { PdfComment } from '@/lib/types/pdfAnnotation';

/*
 * The comments side panel: every comment across the PDF, ordered top-to-bottom by page. Clicking a row jumps
 * the reader to that page and flashes the region. A review aid, so it stays available in read and markup mode.
 * Chrome uses theme tokens; the per-row color dot is the comment's own hex (user content, not chrome).
 */

interface PdfCommentsPanelProps {
   comments: PdfComment[];
   onJump: (comment: PdfComment) => void;
   onClose: () => void;
}

export function PdfCommentsPanel({ comments, onJump, onClose }: PdfCommentsPanelProps) {
   const { t } = useTranslation();

   return (
      <aside className="flex h-full w-full flex-col border-l border-border bg-muted/30 text-card-foreground">
         <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <h2 className="flex-1 text-sm font-medium">{t('PdfMarkup.commentsTitle')}</h2>
            <span className="text-xs tabular-nums text-muted-foreground">{comments.length}</span>
            <button
               type="button"
               title={t('Common.close')}
               aria-label={t('Common.close')}
               onClick={onClose}
               className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-card-foreground"
            >
               <X className="h-4 w-4" />
            </button>
         </div>

         {comments.length === 0 ? (
            <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
               {t('PdfMarkup.commentsEmpty')}
            </div>
         ) : (
            <ul className="flex-1 space-y-2 overflow-y-auto p-2">
               {comments.map((comment) => (
                  <li key={comment.id}>
                     <button
                        type="button"
                        onClick={() => onJump(comment)}
                        className="flex w-full flex-col gap-1.5 rounded-lg border border-border bg-card p-2.5 text-left shadow-sm transition-shadow hover:border-primary/50 hover:shadow-md"
                     >
                        <span className="flex items-center gap-2">
                           <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: comment.color }} aria-hidden />
                           <span className="text-xs font-medium tabular-nums text-muted-foreground">
                              {t('PdfMarkup.commentPage', { page: comment.page })}
                           </span>
                        </span>
                        <span className="line-clamp-3 text-sm leading-snug">{comment.body}</span>
                     </button>
                  </li>
               ))}
            </ul>
         )}
      </aside>
   );
}
