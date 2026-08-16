// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { AnimatePresence, motion } from 'framer-motion';

// -- Icon Imports --
import { X } from 'lucide-react';

// -- Component Imports --
import { DiceTray } from '@/components/molecules/dice/DiceTray';

// -- Store Imports --
import { useAppSettingsStore, useAppSettingsActions } from '@/lib/stores/appSettingsStore';

/*
 * The app-wide dice tray: a panel that slides up from the bottom, mounted at the app shell so it overlays
 * any tab (board or character). It hosts the reusable DiceTray core over the persisted `diceTray` setting -
 * always editable, NO undo (both writes go straight to `setDiceTrayContent`), content-sized (no canvas
 * drag-resize spacer). App chrome, theme-tokened, palette-adaptive. Desktop-scoped: it mounts in the
 * desktop shell and `md:` keeps it off mobile, which gets its own dice screen later.
 */

export function DiceTrayPanel() {
   const { t } = useTranslation();
   const content = useAppSettingsStore((state) => state.diceTray.content);
   const isOpen = useAppSettingsStore((state) => state.diceTray.isOpen);
   const pendingRoll = useAppSettingsStore((state) => state.pendingDiceRoll);
   const { setDiceTrayContent, setDiceTrayOpen, clearPendingDiceRoll } = useAppSettingsActions();

   return (
      <AnimatePresence>
         {isOpen && (
            <motion.div
               initial={{ y: '100%' }}
               animate={{ y: 0 }}
               exit={{ y: '100%' }}
               transition={{ type: 'spring', stiffness: 400, damping: 40 }}
               className="fixed inset-x-0 bottom-0 z-50 mx-auto hidden w-full max-w-78.5 md:block"
            >
               <div data-tutorial="dice-tray-panel" className="overflow-hidden rounded-t-lg border-2 border-b-0 border-border bg-card shadow-2xl">
                  <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
                     <span className="text-sm font-semibold">{t('Common.diceTray')}</span>
                     <button
                        type="button"
                        onClick={() => setDiceTrayOpen(false)}
                        aria-label={t('Common.close')}
                        title={t('Common.close')}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                     >
                        <X className="h-4 w-4" />
                     </button>
                  </div>
                  {/* The core migrates content defensively on read; both writes go straight to the persisted
                      setting (no undo). growToFill off - the panel sizes to its content; showTitle off - the
                      app-wide tray is a generic "roll from anywhere" tray, not a named one. */}
                  <DiceTray content={content} editable onChange={setDiceTrayContent} onCacheRoll={setDiceTrayContent} growToFill={false} showTitle={false} pendingRoll={pendingRoll} onPendingRollHandled={clearPendingDiceRoll} />
               </div>
            </motion.div>
         )}
      </AnimatePresence>
   );
}
