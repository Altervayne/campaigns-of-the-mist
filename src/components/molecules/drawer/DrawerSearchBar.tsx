// -- React Imports --
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Basic UI Imports --
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

// -- Icon Imports --
import { Search, SlidersHorizontal, X } from 'lucide-react';

// -- Component Imports --
import { DrawerFiltersPanel } from '@/components/molecules/drawer/DrawerFiltersPanel';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Hook Imports --
import { useDrawerSearch } from '@/hooks/drawer/useDrawerSearch';
import { useBreakpoint } from '@/hooks/useAdaptive';

/*
 * The shared drawer search bar: the text field + result count + clear, a Filters toggle (with an
 * active-filter count badge) opening the inline filter panel. One component over the same `drawerStore`
 * search state, so the Open side panel and the Expanded view stay in sync without forking the search.
 */

export function DrawerSearchBar({ wide = false, isMobile = false }: { wide?: boolean; isMobile?: boolean }) {
   const { t } = useTranslation();
   const { text, setText, clear, isSearchActive, resultCount, activeFilterCount } = useDrawerSearch();
   const [filtersOpen, setFiltersOpen] = useState(false);
   // A tablet renders this desktop bar with a coarse pointer; give it the same touch sizing as mobile.
   const { isCoarse } = useBreakpoint();
   const touch = isMobile || isCoarse;

   return (
      <div>
         <div className="flex items-center gap-1">
            <div className="relative flex-1">
               <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
               <Input
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder={t('Drawer.search.placeholder')}
                  className={cn('h-9 pl-8 pr-20', touch && 'h-11 text-base')}
                  data-tutorial="drawer-search"
               />
               {isSearchActive && (
                  <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1">
                     <span className="text-[11px] tabular-nums text-muted-foreground">{t('Drawer.search.resultCount', { count: resultCount })}</span>
                     <button type="button" onClick={clear} className="rounded p-1 hover:bg-muted cursor-pointer" aria-label={t('Drawer.search.clear')}>
                        <X className="h-4 w-4" />
                     </button>
                  </div>
               )}
            </div>
            <Button
               variant={filtersOpen ? 'secondary' : 'ghost'}
               size="icon"
               className={cn('relative h-9 w-9 shrink-0 cursor-pointer', touch && 'h-11 w-11')}
               aria-label={t('Drawer.filters.title')}
               title={t('Drawer.filters.title')}
               onClick={() => setFiltersOpen((open) => !open)}
            >
               <SlidersHorizontal className={touch ? 'h-5 w-5' : 'h-4 w-4'} />
               {activeFilterCount > 0 && (
                  <Badge className="absolute -right-1 -top-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px] tabular-nums">{activeFilterCount}</Badge>
               )}
            </Button>
         </div>

         {filtersOpen && <DrawerFiltersPanel wide={wide} isMobile={isMobile} />}
      </div>
   );
}
