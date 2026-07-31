// -- Local Imports --
import { getBreadcrumbPath, getItem } from './drawerRepository';
import { DRAWER_ROOT_PARENT_ID } from './drawerRecords';

/**
 * Human-readable location of a drawer item, for "saved to ..." messaging.
 *
 * Async replacement for the old tree-walking `getItemDisplayPath`: returns
 * `"Drawer Root"` when the item sits at the root, otherwise the bracketed folder
 * names joined by an arrow, down to its containing folder. Resolved from the
 * normalized store via the repository (the item's parent, then that folder's
 * breadcrumb). Returns `"Drawer Root"` if the item cannot be found.
 *
 * @param itemId - The drawer item whose location to describe.
 */
export async function getDrawerItemDisplayPath(itemId: string): Promise<string> {
   const item = await getItem(itemId);
   if (!item || item.parentFolderId === DRAWER_ROOT_PARENT_ID) return 'Drawer Root';

   const breadcrumb = await getBreadcrumbPath(item.parentFolderId);
   if (breadcrumb.length === 0) return 'Drawer Root';

   return breadcrumb.map((folder) => `[${folder.name}]`).join('→');
}
