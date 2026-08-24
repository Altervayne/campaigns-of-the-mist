// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { PaintBucket } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

/**
 * The interior-fill toggle, shared by the closed-shape tools and the transform tool's selection. `filled`
 * lights it; `indeterminate` (a mixed selection) shows a muted third state that resolves on the next click.
 */
export function StrokeFillToggle({ filled, indeterminate, onToggle }: { filled: boolean; indeterminate?: boolean; onToggle: () => void }) {
   const { t } = useTranslation();
   return (
      <button
         type="button"
         title={t('BoardView.shapeFill')}
         aria-label={t('BoardView.shapeFill')}
         aria-pressed={indeterminate ? 'mixed' : filled}
         onPointerDown={(event) => event.stopPropagation()}
         onClick={onToggle}
         className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded hover:bg-muted cursor-pointer',
            indeterminate ? 'bg-muted/50 text-muted-foreground ring-1 ring-primary/30' : filled ? 'bg-muted text-foreground ring-1 ring-primary/40' : 'text-foreground',
         )}
      >
         <PaintBucket className="h-4 w-4" />
      </button>
   );
}
