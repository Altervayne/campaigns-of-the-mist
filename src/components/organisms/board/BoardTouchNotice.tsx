// -- i18n Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { MousePointer2 } from 'lucide-react';

/*
 * The board's coarse-pointer stand-in: shown in place of the canvas when the board would render on a touch
 * device. The canvas is pointer-dependent (right-click radial, wheel zoom, Space/middle-drag pan, sub-44px
 * handles), so touch gets this calm notice instead of a hostile surface. It mounts none of the canvas
 * machinery. Fills the board region and matches the canvas ground so the swap reads as intentional.
 */
export function BoardTouchNotice() {
   const { t } = useTranslation();

   return (
      <div className="absolute inset-0 flex items-center justify-center bg-muted/10 p-8">
         <div className="flex max-w-xs flex-col items-center gap-3 text-center text-muted-foreground">
            <MousePointer2 className="h-10 w-10 opacity-50" />
            <p className="text-sm font-medium text-foreground">{t('BoardView.touchNoticeTitle')}</p>
            <p className="text-xs opacity-80">{t('BoardView.touchNoticeBody')}</p>
         </div>
      </div>
   );
}
