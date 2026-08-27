// -- Library Imports --
import { useTranslation } from 'react-i18next';



interface FolderCountLabelProps {
	/** Number of subfolders in the folder. */
	folders: number;
	/** Number of items in the folder. */
	items: number;
}

/**
 * The drawer folder's summary line: "N folders, N items", or an "empty" label
 * when the folder has neither. Renders the standard muted caption paragraph used
 * by both the drawer folder rows and the folder picker, keeping the (slightly
 * fiddly) count/separator/empty i18n logic in one place.
 *
 * @param props - Folder and item counts (see {@link FolderCountLabelProps}).
 *
 * @example
 * ```tsx
 * <FolderCountLabel folders={folder.folders.length} items={folder.items.length} />
 * ```
 */
export function FolderCountLabel({ folders, items }: FolderCountLabelProps) {
	const { t } = useTranslation();

	return (
		<p className="text-xs text-muted-foreground">
			{folders > 0 && t('Drawer.folderCount', { count: folders })}
			{folders > 0 && items > 0 && ', '}
			{items > 0 && t('Common.itemCount', { count: items })}
			{folders === 0 && items === 0 && t('Drawer.empty')}
		</p>
	);
}
