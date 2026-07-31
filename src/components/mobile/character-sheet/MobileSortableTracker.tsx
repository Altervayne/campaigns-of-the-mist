// -- React Imports --
import { type ReactNode } from 'react';

// -- Library Imports --
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import SelectableTracker from '@/components/mobile/character-sheet/SelectableTracker';

// -- DnD Component Imports --
import { Sortable, DragStaticWrapper } from '@/components/dnd';

// -- Store Imports --
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';

// -- Icon Imports --
import { GripVertical } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { DRAG_TYPES } from '@/lib/constants/dragDrop';

// -- Type Imports --
import type { StatusTracker, StoryTagTracker, StoryThemeTracker } from '@/lib/types/character';



interface MobileSortableTrackerProps {
	tracker: StatusTracker | StoryTagTracker | StoryThemeTracker;
	isSelected: boolean;
	onSelect: (id: string) => void;
	isLeftHanded: boolean;
	dragEnabled: boolean;
	children: ReactNode;
}

/**
 * A drag-sortable tracker chip for the mobile character sheet: a grip handle
 * paired with a {@link SelectableTracker} body.
 *
 * Selection for the toolbelt is by long-press on the body (a familiar mobile
 * pattern; the one-time long-press hint and the selected-state badge in
 * {@link SelectableTracker} make it discoverable and show its state). A dedicated
 * >=44px grip handle owns drag-to-reorder. Handle and body are siblings (the
 * long-press handlers live inside `SelectableTracker`), so the @dnd-kit
 * `TouchSensor` and the long-press timer never share an element: dragging the
 * handle never selects, and selecting never starts a drag. The handle is rendered
 * (and dragging enabled) only when `dragEnabled`, matching the trackers' editable
 * state; otherwise the chip is just the selectable body. The handle sits on the
 * handedness-leading edge and is touch-action: none so an intentional drag is not
 * pre-empted by the trackers list's vertical scroll.
 *
 * No standalone select button is rendered - it was removed to reclaim the
 * horizontal space it took beside each (already narrow) tracker card; selection
 * relies on the long-press gesture instead.
 *
 * @param tracker - The tracker rendered in this chip (carries `trackerType` for group-scoped reorder).
 * @param isSelected - Whether this tracker is the toolbelt's selected tracker (drives the body's selection visual).
 * @param onSelect - Called with the tracker id on long-press (select/deselect toggle).
 * @param isLeftHanded - Places the grip handle on the handedness-leading edge: right for right-handed (default), left when true.
 * @param dragEnabled - Shows the handle and enables dragging when true.
 * @param children - The tracker card to render inside the selectable body.
 */
export default function MobileSortableTracker({
	tracker,
	isSelected,
	onSelect,
	isLeftHanded,
	dragEnabled,
	children,
}: MobileSortableTrackerProps) {
	const { t } = useTranslation();
	const areGestureHintsEnabled = useAppSettingsStore((state) => state.areGestureHintsEnabled);

	return (
		<Sortable
			id={tracker.id}
			data={{ type: DRAG_TYPES.SHEET_TRACKER, item: tracker }}
			disabled={!dragEnabled}
		>
			{({ dragAttributes, dragListeners, isBeingDragged }) => (
				<DragStaticWrapper isBeingDragged={isBeingDragged}>
					<div className={cn("flex items-center gap-1", !isLeftHanded && "flex-row-reverse")}>
						{dragEnabled && (
							// Keep a drag (which sweeps the finger across the trackers area) from
							// being read as a trackers-area edge-swipe that opens the toolbelt:
							// dnd-kit's own handlers on the button run first and track the drag via
							// document listeners, so stopping the synthetic event from bubbling to
							// the scroll container's swipe detector does not affect dragging.
							<div
								className="shrink-0"
								// The sheet pager reads touches on a native (non-React) listener, which React's
								// synthetic stopPropagation cannot reach; this attribute makes the pager stand
								// down when a gesture starts on the grip so a reorder drag never also pages.
								data-sheet-pager-ignore
								onTouchStart={(event) => event.stopPropagation()}
								onTouchEnd={(event) => event.stopPropagation()}
							>
								<button
									type="button"
									aria-label={t('Common.dragHandle')}
									className={cn(
										"flex items-center justify-center h-11 w-11 text-muted-foreground touch-none cursor-grab active:cursor-grabbing",
										// Drag affordance cue, gated on the gesture-tips setting.
										areGestureHintsEnabled && "bg-muted/50 rounded-md"
									)}
									{...dragAttributes}
									{...dragListeners}
								>
									<GripVertical className="w-5 h-5" />
								</button>
							</div>
						)}

						<SelectableTracker tracker={tracker} isSelected={isSelected} onSelect={onSelect}>
							{children}
						</SelectableTracker>
					</div>
				</DragStaticWrapper>
			)}
		</Sortable>
	);
}
