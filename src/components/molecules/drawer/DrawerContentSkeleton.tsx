// -- React Imports --
import { useEffect, useState } from 'react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

/*
 * Loading skeletons for the ITEM area while navigating to a new folder (the store nulls the items view on
 * navigation, never on a reload / optimistic mutation). The folder list is served from the cache and is
 * always present, so it never needs a skeleton. A 90ms threshold means an instant IndexedDB query never
 * flashes a skeleton - the items arrive first and the skeleton unmounts before it would appear; only a
 * load slow enough to notice fades one in. The shapes mirror the real rows / cards so the swap is seamless.
 */

const SKELETON_DELAY_MS = 90;

/** True only after the component has been mounted for `delayMs`; a fast load unmounts it before it flips. */
function useShowAfterDelay(delayMs = SKELETON_DELAY_MS): boolean {
   const [show, setShow] = useState(false);
   useEffect(() => {
      const timer = setTimeout(() => setShow(true), delayMs);
      return () => clearTimeout(timer);
   }, [delayMs]);
   return show;
}

const SHIMMER = 'animate-pulse rounded bg-muted/50';

function ItemRowSkeleton() {
   return (
      <div className="flex h-8 items-center gap-2 px-1">
         <div className={cn(SHIMMER, 'h-5 w-5 shrink-0')} />
         <div className={cn(SHIMMER, 'h-4 w-2/3')} />
      </div>
   );
}

function ItemCardSkeleton() {
   return (
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-2 shadow-sm">
         <div className={cn(SHIMMER, 'aspect-[4/3] w-full')} />
         <div className={cn(SHIMMER, 'h-4 w-2/3')} />
         <div className={cn(SHIMMER, 'h-3 w-1/2')} />
      </div>
   );
}

/** Side panel item area: item placeholders - cards in Rich, rows in List. */
export function DrawerItemsSkeleton({ compact }: { compact: boolean }) {
   const show = useShowAfterDelay();
   if (!show) return null;
   return (
      <div aria-hidden className="flex flex-col gap-2">
         {compact
            ? [0, 1, 2, 3].map((key) => <ItemRowSkeleton key={key} />)
            : [0, 1, 2].map((key) => <ItemCardSkeleton key={key} />)}
      </div>
   );
}

/** Library item area: a grid of card placeholders (rows in List). */
export function DrawerGridSkeleton({ compact }: { compact: boolean }) {
   const show = useShowAfterDelay();
   if (!show) return null;
   return (
      <div aria-hidden className={compact ? 'flex flex-col gap-1' : 'grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3'}>
         {[0, 1, 2, 3, 4, 5].map((key) => (compact ? <ItemRowSkeleton key={key} /> : <ItemCardSkeleton key={key} />))}
      </div>
   );
}
