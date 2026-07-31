// -- Library Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { Folder, MoreHorizontal } from 'lucide-react';

// -- Component Imports --
import { FolderCountLabel } from '@/components/mobile/shared/FolderCountLabel';

// -- DnD Component Imports --
import { Sortable, DragStaticWrapper } from '@/components/dnd';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { DRAG_TYPES } from '@/lib/constants/dragDrop';

// -- Type Imports --
import type { DrawerFolderRecord } from '@/lib/drawer/drawerRecords';



interface MobileFolderItemProps {
	folder: DrawerFolderRecord;
	/** Number of direct child folders (the flat record no longer embeds them). */
	folderCount: number;
	/** Number of direct child items. */
	itemCount: number;
	onNavigate: (folderId: string) => void;
	onLongPress: (folderId: string, folderName: string, position: { x: number; y: number }) => void;
	isLeftHanded: boolean;
}

/**
 * A drawer folder row on mobile: tap to navigate, long-press to drag, and an
 * inline context-menu button on the handedness-leading edge.
 *
 * Mirrors the {@link MobileDrawerItem} arrangement so the drawer's two row
 * types share one gesture model:
 *   - **Tap**: navigates into the folder (only folders have this; items have no
 *     tap action).
 *   - **Long-press (500ms hold)**: arms a drag via dnd-kit's `TouchSensor` -
 *     the longer hold time is configured in `useMobileDragSensors` for the
 *     drawer specifically, so a quick tap stays a tap and a scroll fling stays
 *     a scroll, while a deliberate hold picks the row up.
 *   - **`...` button** as a real flex sibling on the trailing edge of the row
 *     (right for right-handed, left when left-handed): always-present fallback
 *     for the context menu (rename / move / duplicate / delete), so the menu
 *     is reachable without any gesture. Touch events on the button stop
 *     propagating so a tap on it never also fires the folder's navigate.
 *
 * There is no dedicated grip handle, freeing up the row width for the folder
 * name (which can wrap over multiple lines if needed).
 *
 * @param folder - The folder to render.
 * @param onNavigate - Called with the folder id when the body is tapped.
 * @param onLongPress - Called with the folder id, name, and a screen position to anchor the context menu (from the corner button).
 * @param isLeftHanded - Places the menu button on the handedness-leading edge: right for right-handed (default), left when true.
 */
export default function MobileFolderItem({
	folder,
	folderCount,
	itemCount,
	onNavigate,
	onLongPress,
	isLeftHanded,
}: MobileFolderItemProps) {
	const { t } = useTranslation();

	return (
		<Sortable id={folder.id} data={{ type: DRAG_TYPES.DRAWER_FOLDER, item: folder }}>
			{({ dragAttributes, dragListeners, isBeingDragged }) => (
				<DragStaticWrapper isBeingDragged={isBeingDragged}>
					<div
						className={cn(
							"flex items-center rounded-lg border border-border bg-card overflow-hidden",
							isLeftHanded && "flex-row-reverse"
						)}
					>
						{/* Body = drag target + tap-to-navigate. The TouchSensor's
						    activation delay differentiates a tap (fires `onClick`)
						    from a held drag (preempts `onClick`); a scroll fling
						    that moves past the tolerance during the delay falls
						    through to vertical scroll. */}
						<div
							{...dragAttributes}
							{...dragListeners}
							onClick={() => onNavigate(folder.id)}
							className="flex flex-1 min-w-0 cursor-pointer active:cursor-grabbing select-none"
						>
							<div className="flex flex-1 min-w-0 items-center gap-2 p-2 min-h-11">
								<div className="shrink-0">
									<Folder className="w-6 h-6 text-primary" />
								</div>

								<div className="flex-1 min-w-0">
									<p className="font-medium text-foreground break-words">
										{folder.name}
									</p>
									<FolderCountLabel folders={folderCount} items={itemCount} />
								</div>
							</div>
						</div>

						{/* Inline context-menu button: sibling of the body, on the
						    trailing edge of the row. Stops touch events from bubbling
						    so a tap on the button doesn't also fire the folder's
						    navigate-on-tap. */}
						<button
							type="button"
							aria-label={t('Common.moreOptions')}
							onClick={(event) => {
								event.stopPropagation();
								const rect = event.currentTarget.getBoundingClientRect();
								onLongPress(folder.id, folder.name, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
							}}
							onTouchStart={(event) => event.stopPropagation()}
							onTouchEnd={(event) => event.stopPropagation()}
							className="flex shrink-0 items-center justify-center h-11 w-11 text-muted-foreground"
						>
							<MoreHorizontal className="w-5 h-5" />
						</button>
					</div>
				</DragStaticWrapper>
			)}
		</Sortable>
	);
}
