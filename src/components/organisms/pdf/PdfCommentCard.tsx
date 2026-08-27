// -- React Imports --
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { Check, Pencil, Trash2 } from 'lucide-react';

// -- Component Imports --
import { NoteDocument } from '@/components/molecules/NoteDocument';
import { Textarea } from '@/components/ui/textarea';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Type Imports --
import type { PdfComment } from '@/lib/types/pdfAnnotation';

/*
 * One comment as a card in the side panel: the read/edit home for a PDF comment. Read state renders the body
 * as markdown (mentions + `cotm://` chips via NoteDocument); a click on the body itself jumps the reader to
 * the region. Edit state swaps in a textarea over the literal markdown source, committing on blur or Done.
 *
 * The focused card pops out of the stack: extra margin, a leftward lean toward the page-facing edge, a lifted
 * shadow, and a left accent bar in the comment's OWN color (not --primary, which stays the select-tool
 * language) - binding it to its in-doc zone. It scrolls itself into view with a soft one-shot entrance
 * (static under reduced motion). Chrome uses tokens; the accent bar and color dot are the comment's hex.
 */

/** Short, locale-aware date for the meta row. */
const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

interface PdfCommentCardProps {
   comment: PdfComment;
   isFocused: boolean;
   isEditing: boolean;
   onJump: () => void;
   onStartEdit: () => void;
   onChangeBody: (body: string) => void;
   onEndEdit: () => void;
   onDelete: () => void;
   onLinkActivate: (href: string) => void;
}

export function PdfCommentCard({ comment, isFocused, isEditing, onJump, onStartEdit, onChangeBody, onEndEdit, onDelete, onLinkActivate }: PdfCommentCardProps) {
   const { t } = useTranslation();
   const ref = useRef<HTMLDivElement>(null);

   // Focusing a card (a marker/region click, or the create flow) scrolls it into view in the panel.
   useEffect(() => {
      if (isFocused) ref.current?.scrollIntoView({ block: 'nearest' });
   }, [isFocused]);

   return (
      <div
         ref={ref}
         className={cn(
            // Transition the lift/lean/reflow, NOT the border - animating border-width reads as jank, so the
            // focused card's thicker accent edge pops in instantly.
            'rounded-lg border border-border bg-card p-2.5 shadow-sm transition-[transform,box-shadow,margin]',
            isFocused && 'my-3 -translate-x-1.5 border-l-4 shadow-lg motion-safe:animate-[cotm-comment-pop_240ms_ease-out]',
         )}
         style={isFocused ? { borderLeftColor: comment.color } : undefined}
      >
         <div className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: comment.color }} aria-hidden />
            <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">{t('PdfMarkup.commentPage', { page: comment.page })}</span>
            <span className="flex-1 truncate text-xs tabular-nums text-muted-foreground">{dateFormatter.format(comment.createdAt)}</span>
            {isEditing ? (
               <button
                  type="button"
                  title={t('Common.done')}
                  aria-label={t('Common.done')}
                  // Keep the textarea focused through the click so it commits via onClick, not a premature blur.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={onEndEdit}
                  className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-card-foreground"
               >
                  <Check className="size-4" />
               </button>
            ) : (
               <button
                  type="button"
                  title={t('Common.edit')}
                  aria-label={t('Common.edit')}
                  onClick={onStartEdit}
                  className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-card-foreground"
               >
                  <Pencil className="size-4" />
               </button>
            )}
            {/* No mousedown guard: while editing, the textarea must blur FIRST so an abandoned empty comment
                self-deletes (leaving no undo trace) before this delete runs. */}
            <button
               type="button"
               title={t('PdfMarkup.deleteComment')}
               aria-label={t('PdfMarkup.deleteComment')}
               onClick={onDelete}
               className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-destructive"
            >
               <Trash2 className="size-4" />
            </button>
         </div>

         {isEditing ? (
            <Textarea
               autoFocus
               value={comment.body}
               placeholder={t('PdfMarkup.commentPlaceholder')}
               onChange={(event) => onChangeBody(event.target.value)}
               onBlur={onEndEdit}
               // Keep Ctrl/Cmd+Z / +Y from reaching the window-level shortcut so the field's own native
               // undo/redo runs; an annotation undo must not fire while editing a comment.
               onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && (event.key === 'z' || event.key === 'y')) event.stopPropagation();
               }}
               className="mt-2 min-h-20 resize-none"
            />
         ) : (
            <div
               onClick={(event) => {
                  // Links, chips, and mentions own their clicks; a click on the body itself jumps to the region.
                  if ((event.target as HTMLElement).closest('a, button')) return;
                  onJump();
               }}
               className="mt-1.5 max-h-64 cursor-pointer overflow-y-auto text-sm"
            >
               <NoteDocument body={comment.body} compact onLinkActivate={onLinkActivate} />
            </div>
         )}
      </div>
   );
}
