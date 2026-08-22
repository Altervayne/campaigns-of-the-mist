// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { Check, Link } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { getItemTypeIconComponent } from '@/lib/utils/drawer-icons';

// -- Store Imports --
import { NAV_TYPE_FILTER_KINDS, useNavigatorActions, useNavigatorStore } from '@/lib/navigator/navigatorStore';

// -- Type Imports --
import type { LucideIcon } from 'lucide-react';
import type { NavTypeFilterKind } from '@/lib/navigator/navigatorStore';

/*
 * The Navigator's filter strip, directly under the header. Two controls, both DISPLAY filters (never the walk):
 *  - "This workspace only" (default ON) is the ROOT-SET switch - ON = the single current-workspace root, OFF =
 *    the whole app's portal-owning forest.
 *  - the per-kind chips (board/note/character/external, default all-on) hide non-matching rows while a filtered
 *    intermediate stays traversable to a lit descendant.
 * App tokens only.
 */

/** The chip glyph per filterable kind, reusing the drawer/trail icon vocabulary (external has no drawer type). */
const KIND_GLYPH: Record<NavTypeFilterKind, LucideIcon> = {
   board: getItemTypeIconComponent('FULL_BOARD'),
   note: getItemTypeIconComponent('NOTE'),
   character: getItemTypeIconComponent('FULL_CHARACTER_SHEET'),
   external: Link,
};

export function NavigatorFilterStrip() {
   const { t } = useTranslation();
   const rootScope = useNavigatorStore((state) => state.rootScope);
   const typeFilter = useNavigatorStore((state) => state.typeFilter);
   const { setScope, toggleTypeFilter } = useNavigatorActions();

   const workspaceOnly = rootScope === 'current-workspace';

   return (
      <div className="flex flex-col gap-2 border-b border-border bg-card px-3 py-2">
         {/* Root-set switch: its OWN row, full width, with a label free to wrap - ON crawls only the active
             workspace, OFF the whole forest. */}
         <button
            type="button"
            role="switch"
            aria-checked={workspaceOnly}
            onClick={() => setScope(workspaceOnly ? 'app-wide' : 'current-workspace')}
            className={cn(
               'flex w-full cursor-pointer items-start gap-1.5 rounded px-1.5 py-1 text-left text-xs',
               workspaceOnly ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
         >
            <span
               className={cn(
                  'mt-px flex size-4 shrink-0 items-center justify-center rounded-sm border',
                  workspaceOnly ? 'border-primary/50 bg-primary/15 text-primary' : 'border-border text-transparent',
               )}
            >
               <Check className="size-3" aria-hidden />
            </span>
            <span className="min-w-0">{t('Navigator.scopeToggle')}</span>
         </button>

         {/* Per-kind chips: their own row - icon toggles, active = tinted. Off-kind rows hide; the walk is untouched. */}
         <div className="flex items-center gap-1">
            {NAV_TYPE_FILTER_KINDS.map((kind) => {
               const Glyph = KIND_GLYPH[kind];
               const active = typeFilter.has(kind);
               const label = t(`Navigator.kinds.${kind}`);
               return (
                  <button
                     key={kind}
                     type="button"
                     aria-pressed={active}
                     title={label}
                     aria-label={label}
                     onClick={() => toggleTypeFilter(kind)}
                     className={cn(
                        'flex size-6 touch-target cursor-pointer items-center justify-center rounded',
                        active
                           ? 'bg-primary/15 text-foreground ring-1 ring-primary/40'
                           : 'text-muted-foreground/50 hover:bg-muted hover:text-muted-foreground',
                     )}
                  >
                     <Glyph className="size-3.5" aria-hidden />
                  </button>
               );
            })}
         </div>
      </div>
   );
}
