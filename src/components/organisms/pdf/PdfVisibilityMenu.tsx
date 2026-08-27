// -- React Imports --
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { Check, Eye, EyeOff, Highlighter, MessageSquare, Minus, Pen } from 'lucide-react';

// -- Component Imports --
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Type Imports --
import type { PdfAnnotationKind, PdfAnnotationVisibility } from '@/lib/types/pdfAnnotation';

/*
 * The reader's annotation-visibility control: a bar button opening a small menu that temporarily hides
 * each mark kind (ink / highlight / comment), or all at once. The highlight row governs both freehand and
 * text highlights together. Pure view state - nothing is deleted or persisted. Chrome, so theme tokens
 * throughout; the rows echo the markup tools' icons.
 */

interface PdfVisibilityMenuProps {
   visibility: PdfAnnotationVisibility;
   onSetTypeVisible: (kind: PdfAnnotationKind, visible: boolean) => void;
   onSetAllVisible: (visible: boolean) => void;
}

export function PdfVisibilityMenu({ visibility, onSetTypeVisible, onSetAllVisible }: PdfVisibilityMenuProps) {
   const { t } = useTranslation();
   const allVisible = visibility.ink && visibility.highlight && visibility.comment && visibility.textHighlight;
   const anyVisible = visibility.ink || visibility.highlight || visibility.comment || visibility.textHighlight;

   return (
      <Popover>
         <PopoverTrigger asChild>
            <button
               type="button"
               title={t('PdfMarkup.visibility')}
               aria-label={t('PdfMarkup.visibility')}
               className={cn(
                  'flex size-7 shrink-0 cursor-pointer items-center justify-center rounded text-card-foreground hover:bg-muted',
                  !allVisible && 'text-primary',
               )}
            >
               {allVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
         </PopoverTrigger>
         <PopoverContent side="top" align="center" className="w-56 p-1">
            <VisibilityRow
               label={t('PdfMarkup.allAnnotations')}
               emphasized
               checked={allVisible}
               indeterminate={anyVisible && !allVisible}
               onToggle={() => onSetAllVisible(!allVisible)}
            />
            <div className="my-1 h-px bg-border" />
            <VisibilityRow
               icon={<Pen className="h-3.5 w-3.5" />}
               label={t('PdfMarkup.ink')}
               checked={visibility.ink}
               onToggle={() => onSetTypeVisible('ink', !visibility.ink)}
            />
            {/* One row for both freehand and text highlights - a user thinks "highlights," not which kind. */}
            <VisibilityRow
               icon={<Highlighter className="h-3.5 w-3.5" />}
               label={t('PdfMarkup.highlight')}
               checked={visibility.highlight}
               onToggle={() => {
                  const next = !visibility.highlight;
                  onSetTypeVisible('highlight', next);
                  onSetTypeVisible('textHighlight', next);
               }}
            />
            <VisibilityRow
               icon={<MessageSquare className="h-3.5 w-3.5" />}
               label={t('PdfMarkup.comments')}
               checked={visibility.comment}
               onToggle={() => onSetTypeVisible('comment', !visibility.comment)}
            />
         </PopoverContent>
      </Popover>
   );
}

/** A toggle row: a leading check (or indeterminate dash) box, an optional kind icon, then the label. */
function VisibilityRow({
   icon,
   label,
   checked,
   indeterminate = false,
   emphasized = false,
   onToggle,
}: {
   icon?: ReactNode;
   label: string;
   checked: boolean;
   indeterminate?: boolean;
   emphasized?: boolean;
   onToggle: () => void;
}) {
   return (
      <button
         type="button"
         role="menuitemcheckbox"
         aria-checked={indeterminate ? 'mixed' : checked}
         onClick={onToggle}
         className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-popover-foreground hover:bg-muted"
      >
         <span className="flex size-4 shrink-0 items-center justify-center text-primary">
            {indeterminate ? <Minus className="h-3.5 w-3.5" /> : checked ? <Check className="h-3.5 w-3.5" /> : null}
         </span>
         <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">{icon}</span>
         <span className={cn('flex-1', emphasized && 'font-medium')}>{label}</span>
      </button>
   );
}
