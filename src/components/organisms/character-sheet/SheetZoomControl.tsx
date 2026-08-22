// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { Minus, Plus } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Store and Hook Imports --
import { useActiveSheetZoom, useTabManagerActions, useTabManagerStore } from '@/lib/character/tabManagerStore';

// -- Constants --
import { DEFAULT_SHEET_ZOOM, SHEET_MAX_ZOOM, SHEET_MIN_ZOOM, stepSheetZoom } from '@/lib/character/sheetZoom';

/**
 * The floating sheet-zoom control: a frosted cluster bottom-right of the sheet content area
 * (desktop character tabs only). Minus / percentage / plus, with the percentage doubling as a
 * reset-to-100% button. Mirrors the board view toolbar's look; chrome is app tokens only.
 */
export function SheetZoomControl() {
   const { t } = useTranslation();
   const zoom = useActiveSheetZoom();
   const activeTabId = useTabManagerStore((state) => state.activeTabId);
   const { setTabZoom } = useTabManagerActions();

   if (!activeTabId) return null;

   const step = (dir: 1 | -1) => setTabZoom(activeTabId, stepSheetZoom(zoom, dir));

   return (
      <div className="absolute bottom-4 right-4 z-20 flex items-center gap-0.5 rounded-md border border-border bg-card/90 p-1 shadow-sm backdrop-blur-sm">
         <button
            type="button"
            onClick={() => step(-1)}
            disabled={zoom <= SHEET_MIN_ZOOM}
            title={t('SheetZoom.zoomOut')}
            aria-label={t('SheetZoom.zoomOut')}
            className={cn(
               'flex size-6 coarse:size-11 shrink-0 items-center justify-center rounded text-foreground hover:bg-muted cursor-pointer',
               'disabled:pointer-events-none disabled:opacity-40',
            )}
         >
            <Minus className="h-4 w-4 coarse:h-5 coarse:w-5" />
         </button>
         <button
            type="button"
            onClick={() => setTabZoom(activeTabId, DEFAULT_SHEET_ZOOM)}
            title={t('SheetZoom.reset')}
            aria-label={t('SheetZoom.reset')}
            className="min-w-12 coarse:min-h-11 coarse:px-3 coarse:text-sm shrink-0 rounded px-1 py-0.5 text-xs tabular-nums text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
         >
            {Math.round(zoom * 100)}%
         </button>
         <button
            type="button"
            onClick={() => step(1)}
            disabled={zoom >= SHEET_MAX_ZOOM}
            title={t('SheetZoom.zoomIn')}
            aria-label={t('SheetZoom.zoomIn')}
            className={cn(
               'flex size-6 coarse:size-11 shrink-0 items-center justify-center rounded text-foreground hover:bg-muted cursor-pointer',
               'disabled:pointer-events-none disabled:opacity-40',
            )}
         >
            <Plus className="h-4 w-4 coarse:h-5 coarse:w-5" />
         </button>
      </div>
   );
}
