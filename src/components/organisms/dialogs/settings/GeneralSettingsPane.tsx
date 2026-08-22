// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Basic UI Imports --
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// -- Icon Imports --
import { BookOpen, FlipHorizontal, Lock, UnlockIcon, Navigation, Menu } from 'lucide-react';

// -- Store and Hook Imports --
import { useAppSettingsActions, useAppSettingsStore } from '@/lib/stores/appSettingsStore';
import { useDeviceType } from '@/hooks/useDeviceType';

// -- Localization Imports --
import { LOCALES, resolveLocaleCode } from '@/i18n/locales';



/** The General section: language, card view, tracker-edit lock, and the mobile-only FAB layout row. */
export function GeneralSettingsPane() {
   const { t, i18n } = useTranslation();
   const locale = resolveLocaleCode(i18n.language);

   const { isMobile } = useDeviceType();

   const { isSideBySideView, isTrackersAlwaysEditable, isMobileFABMode } = useAppSettingsStore();
   const { setSideBySideView, setTrackersAlwaysEditable, setMobileFABMode } = useAppSettingsActions();

   const handleLocaleChange = (newLocale: string) => {
      i18n.changeLanguage(newLocale);
   };

   return (
      <div className="grid gap-6">
         <div className="grid grid-cols-3 items-center gap-4">
            <Label htmlFor="language-select" className="text-left">
               {t('SettingsDialog.language')}
            </Label>
            <Select value={locale} onValueChange={handleLocaleChange}>
               <SelectTrigger id="language-select" className="col-span-2 cursor-pointer">
                  <SelectValue placeholder={t('SettingsDialog.selectLanguagePlaceholder')} />
               </SelectTrigger>
               <SelectContent>
                  {LOCALES.map((loc) => (
                     <SelectItem key={loc.code} value={loc.code}>
                        {loc.nativeName}
                     </SelectItem>
                  ))}
               </SelectContent>
            </Select>
         </div>

         <div className="grid grid-cols-3 items-center gap-4">
            <Label className="text-left">{t('SettingsDialog.cardView.title')}</Label>
            <div className="col-span-2 flex items-center space-x-2">
               <Button
                  variant={!isSideBySideView ? 'default' : 'outline'}
                  onClick={() => setSideBySideView(false)}
                  title={t('SettingsDialog.cardView.flipping')}
                  className="flex-1 min-w-0 cursor-pointer"
               >
                  <FlipHorizontal className="mr-2 h-4 w-4 shrink-0" />
                  <span className="truncate">{t('SettingsDialog.cardView.flipping')}</span>
               </Button>
               <Button
                  variant={isSideBySideView ? 'default' : 'outline'}
                  onClick={() => setSideBySideView(true)}
                  title={t('SettingsDialog.cardView.sideBySide')}
                  className="flex-1 min-w-0 cursor-pointer"
               >
                  <BookOpen className="mr-2 h-4 w-4 shrink-0" />
                  <span className="truncate">{t('SettingsDialog.cardView.sideBySide')}</span>
               </Button>
            </div>
         </div>

         <div className="grid grid-cols-3 items-center gap-4">
            <Label className="text-left">{t('SettingsDialog.trackerEdit.title')}</Label>
            <div className="col-span-2 flex items-center space-x-2">
               <Button
                  variant={!isTrackersAlwaysEditable ? 'default' : 'outline'}
                  onClick={() => setTrackersAlwaysEditable(false)}
                  title={t('SettingsDialog.trackerEdit.unlocked')}
                  className="flex-1 min-w-0 cursor-pointer"
               >
                  <UnlockIcon className="mr-2 h-4 w-4 shrink-0" />
                  <span className="truncate">{t('SettingsDialog.trackerEdit.unlocked')}</span>
               </Button>
               <Button
                  variant={isTrackersAlwaysEditable ? 'default' : 'outline'}
                  onClick={() => setTrackersAlwaysEditable(true)}
                  title={t('SettingsDialog.trackerEdit.locked')}
                  className="flex-1 min-w-0 cursor-pointer"
               >
                  <Lock className="mr-2 h-4 w-4 shrink-0" />
                  <span className="truncate">{t('SettingsDialog.trackerEdit.locked')}</span>
               </Button>
            </div>
         </div>

         {/* Mobile FAB mode - only meaningful on mobile, so it stays behind the device guard. */}
         {isMobile && (
            <div className="grid grid-cols-3 items-center gap-4">
               <Label className="text-left">{t('SettingsDialog.mobileFABMode.title')}</Label>
               <div className="col-span-2 flex items-center space-x-2">
                  <Button
                     variant={!isMobileFABMode ? 'default' : 'outline'}
                     onClick={() => setMobileFABMode(false)}
                     title={t('SettingsDialog.mobileFABMode.bottomTabs')}
                     className="flex-1 min-w-0 cursor-pointer"
                  >
                     <Navigation className="mr-2 h-4 w-4 shrink-0" />
                     <span className="truncate">{t('SettingsDialog.mobileFABMode.bottomTabs')}</span>
                  </Button>
                  <Button
                     variant={isMobileFABMode ? 'default' : 'outline'}
                     onClick={() => setMobileFABMode(true)}
                     title={t('Common.floatingButtons')}
                     className="flex-1 min-w-0 cursor-pointer"
                  >
                     <Menu className="mr-2 h-4 w-4 shrink-0" />
                     <span className="truncate">{t('Common.floatingButtons')}</span>
                  </Button>
               </div>
            </div>
         )}
      </div>
   );
}
