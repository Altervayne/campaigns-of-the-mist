// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Basic UI Imports --
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

// -- Icon Imports --
import { Check, GraduationCap, RotateCcw } from 'lucide-react';

// -- Store Imports --
import { useAppGeneralStateActions } from '@/lib/stores/appGeneralStateStore';
import { useAppSettingsActions, useAppSettingsStore } from '@/lib/stores/appSettingsStore';
import { useTutorialStore } from '@/lib/tutorial/tutorialStore';

// -- Utils Imports --
import { getTutorialsForPlatform } from '@/lib/tutorial/definitions';

/**
 * The desktop tutorial list, rendered inside the Learn section. Each row teaches one tutorial and launches
 * it (closing the hub first, so the runner isn't left behind the wash); a completed run shows a check and
 * flips its action to Replay. The `dev.` throwaway scenarios surface only in dev, so prod stays empty until
 * the real tutorials are authored - when the list is empty this renders nothing (no orphan header).
 */
export function DesktopTutorialList() {
   const { t } = useTranslation();
   const { setSettingsOpen } = useAppGeneralStateActions();
   const startTutorial = useTutorialStore((state) => state.actions.start);
   const completedTutorials = useAppSettingsStore((state) => state.completedTutorials);
   const { resetTutorialProgress } = useAppSettingsActions();

   const tutorials = getTutorialsForPlatform('desktop');
   if (tutorials.length === 0) return null;

   const launch = (id: string) => {
      setSettingsOpen(false);
      startTutorial(id, 'settings');
   };

   const hasProgress = completedTutorials.length > 0;

   return (
      <div className="grid gap-2">
         <Label className="text-left">{t('Common.tutorials')}</Label>

         <div className="grid gap-1.5">
            {tutorials.map((definition) => {
               const Glyph = definition.icon ?? GraduationCap;
               const done = completedTutorials.includes(definition.id);
               return (
                  <div key={definition.id} className="flex items-start gap-3 rounded-md border border-border p-3">
                     <Glyph className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
                     <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{t(definition.titleKey)}</p>
                        <p className="text-xs text-muted-foreground">{t(definition.teachKey)}</p>
                     </div>
                     {done && <Check className="size-4 shrink-0 text-primary" aria-label={t('TutorialsDialog.status.done')} />}
                     <Button
                        variant={done ? 'ghost' : 'default'}
                        size="sm"
                        onClick={() => launch(definition.id)}
                        className="shrink-0 cursor-pointer"
                     >
                        {done && <RotateCcw className="mr-1.5 size-4" />}
                        {done ? t('TutorialsDialog.action.replay') : t('TutorialsDialog.action.start')}
                     </Button>
                  </div>
               );
            })}
         </div>

         {hasProgress && (
            <div className="flex justify-end">
               <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetTutorialProgress}
                  className="cursor-pointer text-muted-foreground"
               >
                  {t('TutorialsDialog.resetProgress')}
               </Button>
            </div>
         )}
      </div>
   );
}
