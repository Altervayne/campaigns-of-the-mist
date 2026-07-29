// -- Store Imports --
import { isSearchFilterActive, useDrawerActions, useDrawerStore } from '@/lib/stores/drawerStore';

/**
 * Whether a search is active, driving the browse-vs-results body branch every drawer surface renders.
 *
 * The selector returns the derived boolean rather than the criteria, so editing a filter while a
 * search stays active does not re-render the surface.
 */
export function useIsDrawerSearchActive(): boolean {
   return useDrawerStore((state) => isSearchFilterActive(state.searchCriteria));
}

/**
 * A search result's "Jump to": navigate to its folder (null = root), then exit search.
 *
 * @returns The jump handler, taking the result's parent folder id.
 */
export function useJumpToSearchResult(): (folderId: string | null) => void {
   const { setDrawerCurrentFolderId, clearSearch } = useDrawerActions();

   return (folderId) => {
      // Fire-and-forget, as the surfaces' own navigation is: the store sets the id and loads the folder.
      void setDrawerCurrentFolderId(folderId);
      clearSearch();
   };
}
