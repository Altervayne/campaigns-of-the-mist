// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { MessageSquare } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { denormalizeRect } from '@/lib/pdf/annotationGeometry';
import { usePdfMarkup } from '@/lib/pdf/PdfMarkupContext';

// -- Type Imports --
import type { PdfAnnotation, PdfComment } from '@/lib/types/pdfAnnotation';

/*
 * Per-page comment zones: this layer paints each comment's region (a comment-colored border + faint fill)
 * and pins a speech-bubble badge in its corner, so a comment reads as an openable note - distinct from a
 * highlight (a plain fill, no border, no badge). The whole region is the hit target, riding the same box-px
 * space as the annotation overlay so it scales with the column's CSS zoom in lockstep.
 *
 * In read mode the zone is clickable (and hover-blooms) to focus the comment's card in the side panel. In
 * markup mode the capture layer owns comment interaction, so the zone goes inert (visual only) - its hit-area
 * never swallows a draw gesture. A focused comment (its card open) gets a stronger border + fill in its own
 * color, binding the in-doc mark to its card. The badge tracks page zoom (it's the type-signifier, not the
 * affordance - the zone is).
 */

/** The corner badge's side, in box px; scales with the page zoom. */
const BADGE_SIZE = 16;

function isComment(annotation: PdfAnnotation): annotation is PdfComment {
   return annotation.kind === 'comment';
}

interface PdfCommentLayerProps {
   annotations: PdfAnnotation[];
   width: number;
   height: number;
}

export function PdfCommentLayer({ annotations, width, height }: PdfCommentLayerProps) {
   const { t } = useTranslation();
   const { mode, focusComment, focusedCommentId } = usePdfMarkup();

   const comments = annotations.filter(isComment);
   if (comments.length === 0) return null;

   const interactive = mode === 'read';
   return (
      <div className="pointer-events-none absolute inset-0">
         {comments.map((comment) => {
            const rect = denormalizeRect(comment.rect, width, height);
            const focused = comment.id === focusedCommentId;
            return (
               <button
                  key={comment.id}
                  type="button"
                  disabled={!interactive}
                  title={interactive ? t('PdfMarkup.commentTooltip') : undefined}
                  aria-label={comment.body || t('PdfMarkup.commentTooltip')}
                  onClick={interactive ? () => focusComment(comment.id) : undefined}
                  className={cn('group absolute block', interactive ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none')}
                  style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
               >
                  <svg className="absolute inset-0 overflow-visible" width={rect.w} height={rect.h} viewBox={`0 0 ${rect.w} ${rect.h}`} aria-hidden>
                     <rect
                        x={0}
                        y={0}
                        width={rect.w}
                        height={rect.h}
                        rx={3}
                        fill={comment.color}
                        stroke={comment.color}
                        strokeWidth={focused ? 2 : 1.5}
                        className={cn(
                           'transition-[fill-opacity,stroke-opacity]',
                           focused
                              ? '[fill-opacity:0.18] [stroke-opacity:1]'
                              : '[fill-opacity:0.08] [stroke-opacity:0.7] group-hover:[fill-opacity:0.15] group-hover:[stroke-opacity:1]',
                        )}
                     />
                  </svg>
                  {/* Required signifier: a filled speech-bubble badge pinned at the top-left corner. */}
                  <span
                     className="absolute left-0 top-0 flex -translate-x-1/4 -translate-y-1/4 items-center justify-center rounded-[3px] text-white shadow-sm"
                     style={{ width: BADGE_SIZE, height: BADGE_SIZE, backgroundColor: comment.color }}
                     aria-hidden
                  >
                     <MessageSquare style={{ width: BADGE_SIZE * 0.65, height: BADGE_SIZE * 0.65 }} strokeWidth={2.5} />
                  </span>
               </button>
            );
         })}
      </div>
   );
}
