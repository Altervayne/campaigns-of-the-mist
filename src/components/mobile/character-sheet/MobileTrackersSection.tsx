// -- React Imports --
import { useEffect } from 'react';

// -- Library Imports --
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';

// -- Component Imports --
import { StatusTrackerCard } from '@/components/organisms/trackers/StatusTracker';
import { StoryTagTrackerCard } from '@/components/organisms/trackers/StoryTagTracker';
import { StoryThemeTrackerCard } from '@/components/organisms/trackers/StoryThemeTracker';
import { Button } from '@/components/ui/button';
import MobileSortableTracker from '@/components/mobile/character-sheet/MobileSortableTracker';

// -- Icon Imports --
import { PlusCircle } from 'lucide-react';

// -- Hook Imports --
import { useMobileDragSensors } from '@/hooks/mobile/useMobileDragSensors';
import { useMobileTrackerDragReorder } from '@/hooks/mobile/useMobileTrackerDragReorder';

// -- Store Imports --
import { useAppSettingsStore, useAppSettingsActions } from '@/lib/stores/appSettingsStore';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { getFloatingContentPadding } from '@/lib/utils/mobileFloating';

// -- Type Imports --
import type { Character } from '@/lib/types/character';



interface MobileTrackersSectionProps {
	character: Character;
	areTrackersEditable: boolean;
	isEditing: boolean;
	isMobileFABMode: boolean;
	selectedTrackerId: string | null;
	onSelectTracker: (id: string) => void;
	onAddStatus: () => void;
	onAddStoryTag: () => void;
	onAddStoryTheme: () => void;
	isLeftHanded: boolean;
}

/**
 * The trackers tab of the mobile character sheet: the statuses, story-tag, and
 * story-theme groups, each rendering its trackers wrapped in a
 * `MobileSortableTracker` (long-press-to-select for the toolbelt, plus a grip
 * handle for drag-to-reorder when editable) and (when editable) an add button.
 * The three groups are each their own `SortableContext` inside a single scoped
 * `DndContext`; reorder is constrained within a group via
 * {@link useMobileTrackerDragReorder}. The character, edit flags, selection, add
 * handlers, and handedness all come from the sheet. Horizontal paging is owned by
 * the sheet pager (this is page 0), so the surface carries no swipe handlers; its
 * vertical scroll and `data-tutorial` anchor are preserved.
 *
 * Note: the story-themes group intentionally gates its card's `isEditing` on
 * `isEditing` rather than `areTrackersEditable` (unlike the other two groups) -
 * preserved verbatim from the original; not a normalization target. Drag handles,
 * however, are gated uniformly on `areTrackersEditable` across all three groups.
 */
export function MobileTrackersSection({ character, areTrackersEditable, isEditing, isMobileFABMode, selectedTrackerId, onSelectTracker, onAddStatus, onAddStoryTag, onAddStoryTheme, isLeftHanded }: MobileTrackersSectionProps) {
	const { t } = useTranslation();

	// Drag-to-reorder within each tracker group
	const sensors = useMobileDragSensors();
	const { statusIds, storyTagIds, storyThemeIds, handleDragEnd } = useMobileTrackerDragReorder(character);

	// One-time long-press hint: shown once when gesture tips are enabled, then
	// remembered so it never repeats. Gated on the setting, so it never appears
	// when tips are off. The select button is the always-present fallback.
	const areGestureHintsEnabled = useAppSettingsStore((state) => state.areGestureHintsEnabled);
	const hasSeenTrackerSelectHint = useAppSettingsStore((state) => state.hasSeenTrackerSelectHint);
	const { setHasSeenTrackerSelectHint } = useAppSettingsActions();

	useEffect(() => {
		// StrictMode invokes effect setup twice synchronously; both invocations
		// would see the same committed `hasSeenTrackerSelectHint = false` closure
		// and toast twice. Re-read the store live, and set the flag before toasting
		// so the second invoke's live read is already `true`.
		if (!areGestureHintsEnabled) return;
		if (useAppSettingsStore.getState().hasSeenTrackerSelectHint) return;
		setHasSeenTrackerSelectHint(true);
		toast(t('MobileGestureHints.trackerLongPress'));
	}, [areGestureHintsEnabled, hasSeenTrackerSelectHint, setHasSeenTrackerSelectHint, t]);

	return (
		<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
		<div
			// `overflow-x-hidden` is the safeguard against horizontal drag runaway:
			// the trackers grid is 2D (rectSortingStrategy), so an axis lock would
			// break valid horizontal reorder moves; clipping the scroll container
			// instead caps the visual blast radius without changing drag semantics.
			className="h-full overflow-y-auto overflow-x-hidden p-3"
			// In FAB mode the resting FAB cluster (toolbelt FAB at stagger 1 is the
			// tallest) floats over this scroll area; derive the bottom clearance from
			// the same floating system instead of a fixed pb-32, so trackers always
			// scroll clear of the FAB.
			style={isMobileFABMode ? { paddingBottom: getFloatingContentPadding({ stagger: 1 }) } : undefined}
			data-tutorial="trackers-section"
		>
			<div className="max-w-7xl mx-auto space-y-4">
				{/* Statuses Section */}
				{(character.trackers.statuses.length > 0 || areTrackersEditable) && (
				<section>
					<h3 className="text-sm font-semibold text-muted-foreground mb-2 text-center">
						{t('MobileCharacterSheet.statuses')}
					</h3>
					<div className="flex flex-wrap justify-center gap-2">
						<SortableContext items={statusIds} strategy={rectSortingStrategy}>
							{character.trackers.statuses.map((tracker) => (
								<MobileSortableTracker
									key={tracker.id}
									tracker={tracker}
									isSelected={selectedTrackerId === tracker.id}
									onSelect={onSelectTracker}
									isLeftHanded={isLeftHanded}
									dragEnabled={areTrackersEditable}
								>
									<StatusTrackerCard
										tracker={tracker}
										isEditing={areTrackersEditable}
										onExport={() => {}}
									/>
								</MobileSortableTracker>
							))}
						</SortableContext>
						{areTrackersEditable && (
							<Button
								variant="ghost"
								data-tutorial="add-status-button"
								onClick={onAddStatus}
								className={cn(
									// Compact add affordance: a self-sizing >=44px pill, not a full
									// card-sized placeholder. `self-center` keeps the flex row from
									// stretching it to the neighbouring tracker card's height.
									"h-14 px-4 self-center border-2 border-dashed border-primary/25",
									"text-muted-foreground bg-primary/5",
									"hover:text-foreground hover:border-foreground",
									"flex items-center justify-center gap-2"
								)}
							>
								<PlusCircle className="mr-2 h-4 w-4" />
								{t('Trackers.addStatus')}
							</Button>
						)}
					</div>
				</section>
				)}

				{/* Story Tags Section */}
				{(character.trackers.storyTags.length > 0 || areTrackersEditable) && (
				<section>
					<h3 className="text-sm font-semibold text-muted-foreground mb-2 text-center">
						{t('MobileCharacterSheet.storyTags')}
					</h3>
					<div className="flex flex-wrap justify-center gap-2">
						<SortableContext items={storyTagIds} strategy={rectSortingStrategy}>
							{character.trackers.storyTags.map((tracker) => (
								<MobileSortableTracker
									key={tracker.id}
									tracker={tracker}
									isSelected={selectedTrackerId === tracker.id}
									onSelect={onSelectTracker}
									isLeftHanded={isLeftHanded}
									dragEnabled={areTrackersEditable}
								>
									<StoryTagTrackerCard
										tracker={tracker}
										isEditing={areTrackersEditable}
										onExport={() => {}}
									/>
								</MobileSortableTracker>
							))}
						</SortableContext>
						{areTrackersEditable && (
							<Button
								variant="ghost"
								data-tutorial="add-story-tag-button"
								onClick={onAddStoryTag}
								className={cn(
									"h-14 px-4 self-center border-2 border-dashed border-primary/25",
									"text-muted-foreground bg-primary/5",
									"hover:text-foreground hover:border-foreground",
									"flex items-center justify-center gap-2"
								)}
							>
								<PlusCircle className="mr-2 h-4 w-4" />
								{t('Trackers.addStoryTag')}
							</Button>
						)}
					</div>
				</section>
				)}

				{/* Story Themes Section */}
				{(character.trackers.storyThemes.length > 0 || areTrackersEditable) && (
				<section>
					<h3 className="text-sm font-semibold text-muted-foreground mb-2 text-center">
						{t('MobileCharacterSheet.storyThemes')}
					</h3>
					<div className="flex flex-wrap justify-center gap-2">
						<SortableContext items={storyThemeIds} strategy={rectSortingStrategy}>
							{character.trackers.storyThemes.map((tracker) => (
								<MobileSortableTracker
									key={tracker.id}
									tracker={tracker}
									isSelected={selectedTrackerId === tracker.id}
									onSelect={onSelectTracker}
									isLeftHanded={isLeftHanded}
									dragEnabled={areTrackersEditable}
								>
									<StoryThemeTrackerCard
										tracker={tracker}
										isEditing={isEditing}
										onExport={() => {}}
									/>
								</MobileSortableTracker>
							))}
						</SortableContext>
						{areTrackersEditable && (
							<Button
								variant="ghost"
								data-tutorial="add-story-theme-button"
								onClick={onAddStoryTheme}
								className={cn(
									"h-14 px-4 self-center border-2 border-dashed border-primary/25",
									"text-muted-foreground bg-primary/5",
									"hover:text-foreground hover:border-foreground",
									"flex items-center justify-center gap-2"
								)}
							>
								<PlusCircle className="mr-2 h-4 w-4" />
								{t('Trackers.addStoryTheme')}
							</Button>
						)}
					</div>
				</section>
				)}
			</div>
		</div>
		</DndContext>
	);
}
