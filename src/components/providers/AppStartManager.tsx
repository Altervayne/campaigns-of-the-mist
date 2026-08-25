// -- React Imports --
import React, { useState, useEffect, startTransition } from 'react';

// -- Other Library Imports --
import { gt as isVersionGreaterThan } from 'semver';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';

// -- Utils Imports --
import { APP_VERSION } from '@/lib/config';
import { patchNotes } from '@/lib/patch-notes';

// -- Component Imports --
import { LocalStorageError } from '../molecules/LocalStorageError';
import { LegacyDataDialog } from '@/components/organisms/dialogs/LegacyDataDialog';
import MobileOnboarding from '@/components/mobile/onboarding/MobileOnboarding';
import DesktopOnboarding from '@/components/organisms/onboarding/DesktopOnboarding';
import { MigrationNoticeDialog } from '@/components/organisms/dialogs/MigrationNoticeDialog';
import TutorialRunner from '@/components/organisms/tutorial/TutorialRunner';

// -- Store and Hook Imports --
import { useAppGeneralStateStore, useAppGeneralStateActions } from '@/lib/stores/appGeneralStateStore';
import { useAppSettingsActions, useAppSettingsStore } from '@/lib/stores/appSettingsStore';
import { useTutorialStore } from '@/lib/tutorial/tutorialStore';
import { useDeviceType } from '@/hooks/useDeviceType';

// -- Migrations --
import { runDrawerMigrationIfNeeded } from '@/lib/drawer/runDrawerMigration';
import { runCharacterMigrationIfNeeded } from '@/lib/character/runCharacterMigration';

// -- Character Persistence / Tabs --
import { runCharacterBoot } from '@/lib/character/tabManagerStore';
import { ensureMenuFallbackInstance } from '@/lib/character/characterStoreRegistry';

// -- Asset garbage collection --
import { runSweep } from '@/lib/assets/assetGarbageCollector';
import { runPdfSweep } from '@/lib/pdf/pdfGarbageCollector';
import { useAssetGarbageCollection } from '@/hooks/useAssetGarbageCollection';
import { runWhenIdle } from '@/lib/utils/idle';



type DialogStep = 'legacy' | 'desktopOnboarding' | 'mobileOnboarding' | 'patchNotes' | null;

const LEGACY_STORAGE_KEY = 'characterData';

const isLocalStorageAvailable = (): boolean => {
   try {
      const testKey = '__test__';
      localStorage.setItem(testKey, testKey);
      localStorage.removeItem(testKey);
      return true;
   } catch {
      return false;
   }
};



export const AppStartManagerProvider = ({ children }: { children: React.ReactNode }) => {
   const [currentDialog, setCurrentDialog] = useState<DialogStep>(null);
   const [isStartupFlow, setIsStartupFlow] = useState(true);
   const [shouldShowOnboarding, setShouldShowOnboarding] = useState(false);
   const [shouldShowPatchNotes, setShouldShowPatchNotes] = useState(false);
   const [didInit, setDidInit] = useState(false);
   const [showMigrationNotice, setShowMigrationNotice] = useState(false);

   const { t } = useTranslation();
   const { isMobile } = useDeviceType();

   const isLegacyDataDialogOpen = useAppGeneralStateStore((state) => state.isLegacyDataDialogOpen);
   const isDesktopOnboardingOpen = useAppGeneralStateStore((state) => state.isDesktopOnboardingOpen);
   const isMobileOnboardingOpen = useAppGeneralStateStore((state) => state.isMobileOnboardingOpen);
   const { setLegacyDataDialogOpen, setDesktopOnboardingOpen, setSettingsOpen, setSettingsInitialSection, setInitialPatchNotesVersion, setMobileOnboardingOpen } = useAppGeneralStateActions();
   const { setHasCompletedOnboarding } = useAppSettingsActions();

   // Conditional periodic asset sweep, mounted once for the app's lifetime.
   useAssetGarbageCollection();



   // ==================
   //  IndexedDB migrations + character boot (one-time)
   // ==================
   // Copies the legacy localStorage drawer blob into Dexie exactly once. Runs in
   // the background and never blocks startup; a failure surfaces as a non-blocking
   // toast and the migration retries on the next load. The call is self-guarded
   // and de-duplicates StrictMode's double mount.
   //
   // The character is sourced from IndexedDB: attach the save subscription, then,
   // after the one-time character migration, read the session
   // pointer and load the active character. The boot loading gate (set inside
   // runCharacterBoot) keeps first paint on a neutral loading screen until this
   // resolves, so the main menu never flashes before the sheet appears.
   useEffect(() => {
      // Ensure the menu fallback instance exists and is active before boot opens a
      // character into its id-keyed instance, independent of component render order.
      // Idempotent. Per-instance persistence is attached by the TabManager when a tab
      // opens, so there is no global subscription to start.
      ensureMenuFallbackInstance();

      // Drawer migration runs concurrently and never blocks the boot critical path
      // (only the character load gates first paint). We keep its outcome to decide
      // the one-time upgrade notice below.
      const drawerMigration = runDrawerMigrationIfNeeded().catch(() => {
         toast.error(t('Notifications.drawer.storageUpgradeFailed'));
         return 'error' as const;
      });

      void (async () => {
         let characterMigrated = false;
         try {
            characterMigrated = (await runCharacterMigrationIfNeeded()) === 'migrated';
         } catch (error) {
            // The migration sets the session pointer and writes the record before
            // its verify step, so even a verification failure leaves a usable
            // character to boot into; log and continue rather than block startup.
            console.error('Character IndexedDB migration failed (will retry next load):', error);
         }
         await runCharacterBoot();

         // Reclaim orphaned image + PDF assets once boot has settled, scheduled on idle so it
         // never blocks first paint. A GC failure must never break boot; swallow it and
         // let the next trigger retry.
         runWhenIdle(() => {
            void runSweep('startup').catch(() => {});
            void runPdfSweep('startup').catch(() => {});
         });

         // One-time transparency notice: shown only when data was actually moved
         // this load (each migration returns 'migrated' exactly once, so the notice
         // never repeats). Awaiting the drawer promise here, AFTER boot, keeps the
         // drawer migration off the first-paint critical path while still gating the
         // notice on both domains.
         const drawerMigrated = (await drawerMigration) === 'migrated';
         if (characterMigrated || drawerMigrated) {
            startTransition(() => setShowMigrationNotice(true));
         }
      })();
   }, [t]);

   // ==================
   //  Dialog queue generator and handler
   // ==================
   useEffect(() => {
      if (didInit) return;
      if (!isLocalStorageAvailable()) return;

      const legacyData = localStorage.getItem(LEGACY_STORAGE_KEY);
      const appSettings = useAppSettingsStore.getState();
      const lastVisitedVersion = appSettings.lastVisitedVersion;
      const hasCompletedOnboarding = appSettings.hasCompletedOnboarding;

      const willShowLegacy = !!legacyData;
      const willShowOnboarding = !hasCompletedOnboarding;
      const willShowPatchNotes = !willShowOnboarding && isVersionGreaterThan(APP_VERSION, lastVisitedVersion);

      startTransition(() => {
         setShouldShowOnboarding(willShowOnboarding);
         setShouldShowPatchNotes(willShowPatchNotes);

         if (willShowLegacy) {
            setCurrentDialog('legacy');
         } else if (willShowOnboarding) {
            // Each platform gets its own first-run onboarding surface.
            setCurrentDialog(isMobile ? 'mobileOnboarding' : 'desktopOnboarding');
         } else if (willShowPatchNotes) {
            let firstUnreadIndex = 0;

            for (let i = patchNotes.length - 1; i >= 0; i--) {
               if (isVersionGreaterThan(patchNotes[i].version, lastVisitedVersion)) {
                  firstUnreadIndex = i;
                  break;
               }
            }

            const firstUnreadVersion = patchNotes[firstUnreadIndex]?.version || patchNotes[0]?.version;
            setInitialPatchNotesVersion(firstUnreadVersion);
            // Boot patch-notes now deep-links the hub, which owns its own close, so the startup flow ends here.
            setIsStartupFlow(false);
            setCurrentDialog('patchNotes');
         } else {
            setIsStartupFlow(false)
            setCurrentDialog(null)
         }
      });

      appSettings.actions.setLastVisitedVersion(APP_VERSION);

      startTransition(() => {
         setDidInit(true);
      });
   }, [didInit]);

   useEffect(() => {
      switch (currentDialog) {
         case 'legacy':
            setLegacyDataDialogOpen(true);
            break;
         case 'desktopOnboarding':
            setLegacyDataDialogOpen(false);
            setDesktopOnboardingOpen(true);
            break;
         case 'mobileOnboarding':
            setLegacyDataDialogOpen(false);
            setMobileOnboardingOpen(true);
            break;
         case 'patchNotes':
            // Boot patch-notes now deep-links the hub to What's new rather than popping a standalone dialog. The
            // version target rides `initialPatchNotesVersion` (set by the queue generator); the pane reads it. The
            // startup flow is ended at the decision sites (queue generator + legacy chain), since the hub owns close.
            setLegacyDataDialogOpen(false);
            setSettingsInitialSection('whatsNew');
            setSettingsOpen(true);
            break;
         default:
            break;
      }
   }, [currentDialog]);

   

   // ==================
   //  Dialog closing handler
   // ==================
   const handleDialogClose = () => {
      if (!isStartupFlow) {
         if (isLegacyDataDialogOpen) setLegacyDataDialogOpen(false);
         if (isDesktopOnboardingOpen) setDesktopOnboardingOpen(false);
         if (isMobileOnboardingOpen) setMobileOnboardingOpen(false);
         setCurrentDialog(null);
         return;
      }

      if (currentDialog === 'legacy' && shouldShowOnboarding) {
         setCurrentDialog(isMobile ? 'mobileOnboarding' : 'desktopOnboarding');
         setShouldShowOnboarding(false);
         return;
      }

      // Boot patch-notes is the terminal step and now opens the hub (which owns its own close), so it needs no
      // close-handling here; advancing to it ends the startup flow now.
      if (currentDialog === 'legacy' && shouldShowPatchNotes) {
         setIsStartupFlow(false);
         setCurrentDialog('patchNotes');
         setShouldShowPatchNotes(false);
         return;
      }
   };

   // ==================
   //  Onboarding completion handlers (complete OR skip)
   // ==================
   // The single first-run flag gates both platforms; setting it on completion means onboarding never re-runs.
   const handleMobileOnboardingComplete = (startTutorial: boolean) => {
      setHasCompletedOnboarding(true);
      setMobileOnboardingOpen(false);
      setIsStartupFlow(false);
      setCurrentDialog(null);

      if (startTutorial) {
         // Let the onboarding sheet unmount before the runner mounts its first coach-mark. The nav lesson is
         // the no-character orientation, so it stands on its own with nothing loaded.
         setTimeout(() => {
            useTutorialStore.getState().actions.start('mobile.nav', 'onboarding');
         }, 300);
      }
   };

   const handleDesktopOnboardingComplete = () => {
      setHasCompletedOnboarding(true);
      setDesktopOnboardingOpen(false);
      setIsStartupFlow(false);
      setCurrentDialog(null);

      // Tour offer seam: once the tutorial engine and the `desktop.navigation` tutorial land, offer that
      // tutorial from the Ready step here (offer-not-force), mirroring the mobile onboarding's tutorial start.
   };



   if (!isLocalStorageAvailable) {
      return <LocalStorageError />;
   }



   return (
      <>
         {children}
         <LegacyDataDialog 
            isOpen={isLegacyDataDialogOpen} 
            onOpenChange={(open) => {
               if (!open) handleDialogClose();
            }} 
         />
         <DesktopOnboarding
            isOpen={isDesktopOnboardingOpen}
            onComplete={handleDesktopOnboardingComplete}
         />
         <MobileOnboarding
            isOpen={isMobileOnboardingOpen}
            onComplete={handleMobileOnboardingComplete}
         />
         <MigrationNoticeDialog
            isOpen={showMigrationNotice}
            onClose={() => setShowMigrationNotice(false)}
         />
         {/* App chrome above the tab-switch boundary, so a DRIVE-induced tab switch never unmounts it. */}
         <TutorialRunner />
      </>
   );
};