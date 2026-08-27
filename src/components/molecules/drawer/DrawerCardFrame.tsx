// -- React Imports --
import type { ReactNode } from 'react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Component Imports --
import { FitToBox } from '@/components/molecules/drawer/FitToBox';

/*
 * The shared shell for every drawer item card: a fixed 4:3 stage wearing the type's own surface palette,
 * the name row, then the meta row. The live preview, the search skeleton, and the loaded search card all
 * build on this, so the footprint and chrome stay identical - one place to keep them from drifting.
 *
 * `children` is the per-type preview, fit into the stage by FitToBox: `cover` for portrait/square content
 * (fills the width, bleeds off the faded bottom), `contain` for landscape content (centered as its own
 * canvas). The shell stays app-token chrome; the stage bg is the one seam that carries type identity.
 */
export function DrawerCardFrame({
   stageClassName,
   fit,
   name,
   meta,
   headerAction,
   headerActionLeft = false,
   children,
}: {
   stageClassName?: string;
   fit: 'cover' | 'contain';
   name: ReactNode;
   meta?: ReactNode;
   headerAction?: ReactNode;
   headerActionLeft?: boolean;
   children: ReactNode;
}) {
   return (
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-2 shadow-sm transition-[transform,box-shadow] hover:shadow-md motion-safe:hover:-translate-y-px">
         <div className={cn('aspect-[4/3] w-full overflow-hidden rounded-md', stageClassName)}>
            <FitToBox fit={fit} className="pointer-events-none h-full w-full">
               {children}
            </FitToBox>
         </div>

         <div className={cn('flex items-center gap-2', headerActionLeft && 'flex-row-reverse')}>
            <p className="min-w-0 flex-1 truncate px-1 text-sm font-semibold">{name}</p>
            {headerAction}
         </div>

         {/* Meta: app-themed muted chrome; the caller composes the type glyph + game glyph + date. */}
         {meta ? <div className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">{meta}</div> : null}
      </div>
   );
}
