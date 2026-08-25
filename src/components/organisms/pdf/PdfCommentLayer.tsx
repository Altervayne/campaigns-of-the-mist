// -- Utils Imports --
import { cn } from '@/lib/utils';
import { denormalizeRect } from '@/lib/pdf/annotationGeometry';
import { usePdfMarkup } from '@/lib/pdf/PdfMarkupContext';

// -- Component Imports --
import { Popover, PopoverAnchor } from '@/components/ui/popover';
import { PdfCommentPopover } from './PdfCommentPopover';

// -- Type Imports --
import type { PdfAnnotation, PdfComment } from '@/lib/types/pdfAnnotation';

/*
 * Per-page comment interaction: an invisible hit target + Radix anchor over each comment's corner marker (the
 * annotation overlay paints the visible marker; this layer never repaints it). Rides the same box-px space as
 * the overlay, so it scales with the column's CSS zoom in lockstep.
 *
 * In read mode the target is clickable to open the note's editor. In markup mode the capture layer owns comment
 * interaction (reopening via a click hit-test), so the target goes inert but stays the popover's anchor.
 *
 * The marker tracks page zoom for now; a constant-screen-size minimum hit target is a later pass.
 */

/** The anchor's side, in box px; matches the overlay's corner marker so the popover points at the visible glyph. */
const MARKER_SIZE = 12;

function isComment(annotation: PdfAnnotation): annotation is PdfComment {
   return annotation.kind === 'comment';
}

interface PdfCommentLayerProps {
   annotations: PdfAnnotation[];
   width: number;
   height: number;
}

export function PdfCommentLayer({ annotations, width, height }: PdfCommentLayerProps) {
   const { mode, openCommentId, openComment, closeComment, setCommentBody, deleteComment } = usePdfMarkup();

   const comments = annotations.filter(isComment);
   if (comments.length === 0) return null;

   const interactive = mode === 'read';
   return (
      <div className="pointer-events-none absolute inset-0">
         {comments.map((comment) => {
            const rect = denormalizeRect(comment.rect, width, height);
            return (
               <Popover key={comment.id} open={openCommentId === comment.id} onOpenChange={(open) => { if (!open) closeComment(comment.id); }}>
                  <PopoverAnchor asChild>
                     <button
                        type="button"
                        aria-label={comment.body || undefined}
                        onClick={interactive ? () => openComment(comment.id) : undefined}
                        className={cn('absolute cursor-pointer', interactive ? 'pointer-events-auto' : 'pointer-events-none')}
                        style={{ left: rect.x, top: rect.y, width: MARKER_SIZE, height: MARKER_SIZE }}
                     />
                  </PopoverAnchor>
                  <PdfCommentPopover
                     comment={comment}
                     onChangeBody={(body) => setCommentBody(comment.id, body)}
                     onDelete={() => deleteComment(comment.id)}
                  />
               </Popover>
            );
         })}
      </div>
   );
}
