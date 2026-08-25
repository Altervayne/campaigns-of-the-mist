// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { Trash2 } from 'lucide-react';

// -- Component Imports --
import { PopoverContent } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

// -- Type Imports --
import type { PdfComment } from '@/lib/types/pdfAnnotation';

/*
 * A comment's editor: a plain-text body (markdown/mentions deferred) that rides the debounced autosave, plus a
 * delete action. Rendered as a Radix popover anchored to the comment's marker by the comment layer.
 *
 * The content stops pointerdown from bubbling: Radix portals the popover to `document.body`, but React still
 * routes its synthetic pointer events up the component tree - straight into the page's capture layer, which
 * would start a fresh mark inside the open editor. Inner controls sit below the root, so they still work.
 */

interface PdfCommentPopoverProps {
   comment: PdfComment;
   onChangeBody: (body: string) => void;
   onDelete: () => void;
}

export function PdfCommentPopover({ comment, onChangeBody, onDelete }: PdfCommentPopoverProps) {
   const { t } = useTranslation();

   return (
      <PopoverContent
         align="start"
         className="w-72 space-y-2 p-2"
         onPointerDown={(event) => event.stopPropagation()}
      >
         <Textarea
            autoFocus
            value={comment.body}
            placeholder={t('PdfMarkup.commentPlaceholder')}
            onChange={(event) => onChangeBody(event.target.value)}
            // Keep Ctrl/Cmd+Z / +Y from reaching the window-level shortcut so the field's own native
            // undo/redo runs; an annotation undo must not fire while editing a comment.
            onKeyDown={(event) => {
               if ((event.ctrlKey || event.metaKey) && (event.key === 'z' || event.key === 'y')) event.stopPropagation();
            }}
            className="min-h-20 resize-none"
         />
         <div className="flex justify-end">
            <Button type="button" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={onDelete}>
               <Trash2 className="size-4" />
               {t('PdfMarkup.deleteComment')}
            </Button>
         </div>
      </PopoverContent>
   );
}
