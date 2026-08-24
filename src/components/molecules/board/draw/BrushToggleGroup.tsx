// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { Brush, Highlighter, Pen, type LucideIcon } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Type Imports --
import type { BrushKind } from '@/lib/types/board';

/** The brushes, in toolbar order, each with its glyph. */
const BRUSH_OPTIONS: { brush: BrushKind; icon: LucideIcon; labelKey: string }[] = [
   { brush: 'pen', icon: Pen, labelKey: 'brushPen' },
   { brush: 'brush', icon: Brush, labelKey: 'brushBrush' },
   { brush: 'highlighter', icon: Highlighter, labelKey: 'brushHighlighter' },
];

/**
 * The brush toggle set: one button per brush, the active one ringed. `brush` is `null` for an indeterminate
 * (mixed) selection, so no button lights. `className`/`disabled` let a host grey the whole group in place.
 */
export function BrushToggleGroup({ brush, onSelect, className, disabled }: { brush: BrushKind | null; onSelect: (brush: BrushKind) => void; className?: string; disabled?: boolean }) {
   const { t } = useTranslation();
   return (
      <div className={cn('flex shrink-0 items-center gap-0.5', className)} aria-disabled={disabled || undefined}>
         {BRUSH_OPTIONS.map(({ brush: option, icon: Icon, labelKey }) => (
            <button
               key={option}
               type="button"
               title={t(`BoardView.${labelKey}`)}
               aria-label={t(`BoardView.${labelKey}`)}
               aria-pressed={brush === option}
               onPointerDown={(event) => event.stopPropagation()}
               onClick={() => onSelect(option)}
               className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded hover:bg-muted cursor-pointer',
                  brush === option ? 'bg-muted text-foreground ring-1 ring-primary/40' : 'text-foreground',
               )}
            >
               <Icon className="h-4 w-4" />
            </button>
         ))}
      </div>
   );
}
