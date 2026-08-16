// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { X } from 'lucide-react';

// -- Component Imports --
import { MobileBottomSheet } from '@/components/mobile/shared/MobileBottomSheet';
import { DiceTray } from '@/components/molecules/dice/DiceTray';

// -- Store Imports --
import { useAppSettingsStore, useAppSettingsActions } from '@/lib/stores/appSettingsStore';

/*
 * The mobile app-wide dice tray: the shared DiceTray core in a bottom sheet, over the SAME persisted
 * `diceTray` setting the desktop panel uses - a roll made on either surface shows on the other, and it
 * survives reopen. Opened from the toolbelt's Dice action and mounted in the mobile shell so it overlays
 * any screen. Mobile-only; the desktop panel is `md:block`, so the two never both render.
 */
export function MobileDiceTraySheet() {
   const { t } = useTranslation();
   const content = useAppSettingsStore((state) => state.diceTray.content);
   const isOpen = useAppSettingsStore((state) => state.diceTray.isOpen);
   const { setDiceTrayContent, setDiceTrayOpen } = useAppSettingsActions();

   return (
      <MobileBottomSheet isOpen={isOpen} onClose={() => setDiceTrayOpen(false)} contentClassName="bg-card">
         <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-base font-semibold">{t('Common.diceTray')}</span>
            <button
               type="button"
               onClick={() => setDiceTrayOpen(false)}
               aria-label={t('Common.close')}
               title={t('Common.close')}
               className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
            >
               <X className="h-5 w-5" />
            </button>
         </div>
         {/* Same wiring as the desktop app-wide panel: both writes go straight to the persisted setting
             (no undo); unnamed (showTitle off) and content-sized (growToFill off). A max height keeps a
             tall tray (long history) scrollable instead of running off the top, and pb-safe clears the
             home indicator. */}
         <div className="max-h-[70dvh] overflow-y-auto pb-safe">
            <DiceTray content={content} editable growToFill={false} showTitle={false} isMobile onChange={setDiceTrayContent} onCacheRoll={setDiceTrayContent} />
         </div>
      </MobileBottomSheet>
   );
}
