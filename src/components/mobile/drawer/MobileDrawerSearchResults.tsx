// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { DrawerListRow } from '@/components/molecules/drawer/DrawerListRow';

// -- Type Imports --
import type { DrawerItemSummary } from '@/lib/drawer/drawerRepository';



interface MobileDrawerSearchResultsProps {
   isSearching: boolean;
   /** Matches for the active search; `null` before the first run completes. */
   results: DrawerItemSummary[] | null;
   onOpenResultMenu: (summary: DrawerItemSummary, event: React.MouseEvent<HTMLButtonElement>) => void;
}

/**
 * The search half of the drawer body: a flat, non-reorderable list of matches
 * with an in-flight message and a no-matches fallback. Renders its own scroll
 * container - it replaces the browse tree in the same space, so it owns the
 * same overflow rules.
 */
export default function MobileDrawerSearchResults({ isSearching, results, onOpenResultMenu }: MobileDrawerSearchResultsProps) {
   const { t } = useTranslation();

   return (
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3">
         {isSearching ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('Drawer.search.searching')}</p>
         ) : results && results.length > 0 ? (
            <div className="flex flex-col gap-1">
               {results.map((summary) => (
                  <button
                     key={summary.id}
                     type="button"
                     onClick={(event) => onOpenResultMenu(summary, event)}
                     className="min-h-11 w-full rounded text-left hover:bg-muted cursor-pointer"
                  >
                     <DrawerListRow type={summary.type} name={summary.name} game={summary.game} createdAt={summary.createdAt} updatedAt={summary.updatedAt} />
                  </button>
               ))}
            </div>
         ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('Drawer.search.noMatches')}</p>
         )}
      </div>
   );
}
