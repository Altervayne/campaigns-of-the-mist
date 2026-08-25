// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { X } from 'lucide-react';

// -- Component Imports --
import { PdfCommentCard } from './PdfCommentCard';

// -- Type Imports --
import type { PdfComment } from '@/lib/types/pdfAnnotation';

/*
 * The comments side panel: every comment across the PDF, ordered top-to-bottom by page, each rendered as a
 * read/edit card. A card is where a comment is read AND authored - clicking a marker or region in the doc
 * focuses its card here. A review aid, so it stays available in read and markup mode. Chrome uses theme
 * tokens; a card's color dot is the comment's own hex (user content, not chrome).
 */

interface PdfCommentsPanelProps {
   comments: PdfComment[];
   focusedCommentId: string | null;
   editingCommentId: string | null;
   onJump: (comment: PdfComment) => void;
   onStartEdit: (id: string) => void;
   onChangeBody: (id: string, body: string) => void;
   onEndEdit: (id: string) => void;
   onDelete: (id: string) => void;
   onLinkActivate: (href: string) => void;
   onClose: () => void;
}

export function PdfCommentsPanel({ comments, focusedCommentId, editingCommentId, onJump, onStartEdit, onChangeBody, onEndEdit, onDelete, onLinkActivate, onClose }: PdfCommentsPanelProps) {
   const { t } = useTranslation();

   return (
      <aside className="flex h-full w-full flex-col border-l border-border bg-card text-card-foreground shadow-[-4px_0_12px_-4px_rgba(0,0,0,0.15)]">
         <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2">
            <h2 className="flex-1 text-sm font-semibold">{t('PdfMarkup.commentsTitle')}</h2>
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
            <div className="flex flex-1 items-center justify-center bg-muted/30 px-6 text-center text-sm text-muted-foreground">
               {t('PdfMarkup.commentsEmpty')}
            </div>
         ) : (
            // A recessed tray so the raised cards read figure-ground; the extra left padding gives a focused
            // card room to lean out toward the page-facing edge.
            <ul className="flex-1 space-y-2 overflow-y-auto bg-muted/30 p-2 pl-3">
               {comments.map((comment) => (
                  <li key={comment.id}>
                     <PdfCommentCard
                        comment={comment}
                        isFocused={comment.id === focusedCommentId}
                        isEditing={comment.id === editingCommentId}
                        onJump={() => onJump(comment)}
                        onStartEdit={() => onStartEdit(comment.id)}
                        onChangeBody={(body) => onChangeBody(comment.id, body)}
                        onEndEdit={() => onEndEdit(comment.id)}
                        onDelete={() => onDelete(comment.id)}
                        onLinkActivate={onLinkActivate}
                     />
                  </li>
               ))}
            </ul>
         )}
      </aside>
   );
}
