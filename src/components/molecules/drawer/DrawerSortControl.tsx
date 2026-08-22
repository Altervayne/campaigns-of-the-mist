// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Basic UI Imports --
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// -- Icon Imports --
import { ArrowDownNarrowWide, ArrowUpNarrowWide } from 'lucide-react';

// -- Store Imports --
import { useDrawerActions, useDrawerStore } from '@/lib/stores/drawerStore';

// -- Type Imports --
import type { DrawerItemQuery } from '@/lib/drawer/drawerRepository';

/*
 * The results sort control: a `by` selector + a direction toggle, feeding `sort` into the same query.
 * Lives at the results header (frequently changed, not buried in the filters panel). Defaults to
 * `updatedAt` desc, matching `queryItems`.
 */

type SortBy = NonNullable<DrawerItemQuery['sort']>['by'];

const SORT_KEYS: SortBy[] = ['updatedAt', 'createdAt', 'name', 'type'];

export function DrawerSortControl() {
   const { t } = useTranslation();
   const sort = useDrawerStore((state) => state.searchCriteria?.sort);
   const { updateSearchCriteria } = useDrawerActions();

   const by: SortBy = sort?.by ?? 'updatedAt';
   const direction = sort?.direction ?? 'desc';

   return (
      <div className="flex items-center justify-end gap-1.5">
         <span className="text-xs text-muted-foreground">{t('Drawer.filters.sortBy')}</span>
         <Select value={by} onValueChange={(value) => void updateSearchCriteria({ sort: { by: value as SortBy, direction } })}>
            <SelectTrigger className="h-7 w-32 text-xs">
               <SelectValue />
            </SelectTrigger>
            <SelectContent>
               {SORT_KEYS.map((key) => (
                  <SelectItem key={key} value={key} className="text-xs">{t(`Drawer.filters.sort.${key}`)}</SelectItem>
               ))}
            </SelectContent>
         </Select>
         <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 cursor-pointer touch-target"
            aria-label={t(direction === 'asc' ? 'Drawer.filters.sortAsc' : 'Drawer.filters.sortDesc')}
            title={t(direction === 'asc' ? 'Drawer.filters.sortAsc' : 'Drawer.filters.sortDesc')}
            onClick={() => void updateSearchCriteria({ sort: { by, direction: direction === 'asc' ? 'desc' : 'asc' } })}
         >
            {direction === 'asc' ? <ArrowUpNarrowWide className="h-4 w-4" /> : <ArrowDownNarrowWide className="h-4 w-4" />}
         </Button>
      </div>
   );
}
