// -- React Imports --
import { useEffect } from 'react';

// -- Local Imports --
import { isPeriodicSweepWarranted, runSweep, PERIODIC_INTERVAL_MS } from '@/lib/assets/assetGarbageCollector';
import { isPeriodicPdfSweepWarranted, runPdfSweep } from '@/lib/pdf/pdfGarbageCollector';
import { runWhenIdle } from '@/lib/utils/idle';

/*
 * Mounts the conditional periodic asset sweep once at app level. A coarse timer gates
 * WHEN we check; each tick then runs on idle and only sweeps under pressure (the
 * count grew, or storage is over the soft cap), so a quiet session never churns. The
 * anti-ballooning guard for long image-heavy sessions; not a dumb unconditional
 * rescan. Failures are swallowed so a sweep can never disrupt the session; the next
 * tick retries.
 */
export function useAssetGarbageCollection(): void {
   useEffect(() => {
      let pendingIdle: { cancel: () => void } | null = null;

      const timer = window.setInterval(() => {
         pendingIdle = runWhenIdle(() => {
            void (async () => {
               try {
                  if (await isPeriodicSweepWarranted()) await runSweep('periodic');
                  if (await isPeriodicPdfSweepWarranted()) await runPdfSweep('periodic');
               } catch {
                  // Swallowed: GC must never surface into the session; the next tick retries.
               }
            })();
         });
      }, PERIODIC_INTERVAL_MS);

      return () => {
         window.clearInterval(timer);
         pendingIdle?.cancel();
      };
   }, []);
}
