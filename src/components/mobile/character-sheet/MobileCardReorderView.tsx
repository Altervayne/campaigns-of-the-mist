// -- Library Imports --
import { useTranslation } from 'react-i18next';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

// -- Component Imports --
import { resolveCardComponent } from '@/components/organisms/cards/resolveCardComponent';

// -- DnD Component Imports --
import { Sortable, DragStaticWrapper } from '@/components/dnd';

// -- Icon Imports --
import { GripVertical, PlusCircle, NotebookText } from 'lucide-react';

// -- Hook Imports --
import { useMobileDragSensors } from '@/hooks/mobile/useMobileDragSensors';
import { useMobileCardDragReorder } from '@/hooks/mobile/useMobileCardDragReorder';

// -- Store Imports --
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { deriveJournalTitle } from '@/lib/utils/character';
import { getFloatingContentPadding } from '@/lib/utils/mobileFloating';
import { restrictToVerticalAxis } from '@/lib/utils/dndModifiers';
import { DRAG_TYPES } from '@/lib/constants/dragDrop';

// -- Type Imports --
import type { Card } from '@/lib/types/character';
import type { Journal } from '@/lib/types/board';
import type { ResolvedSheetItem } from '@/lib/character/sheetLayout';



interface MobileCardReorderViewProps {
	items: ResolvedSheetItem[];
	isMobileFABMode: boolean;
	isLeftHanded: boolean;
	onSelectItem: (index: number) => void;
	onOpenAddCard?: () => void;
}

/**
 * The overview of the mobile character sheet: a vertical, drag-sortable list of the sheet's items -
 * cards and journals interleaved in manifest order. Each row pairs a tappable preview (tap jumps to
 * that item and leaves the overview) with a dedicated ≥44px grip handle that owns drag-to-reorder, so
 * tapping a preview never starts a drag and dragging the handle never selects. The handle sits on the
 * handedness-leading edge (right by default, left when left-handed) and is touch-action: none so an
 * intentional drag is not pre-empted by the list's vertical scroll; @dnd-kit auto-scrolls the
 * surrounding scroll container while dragging near its edges.
 *
 * This is the cards tab's collection view - the carousel is a detail view with no natural place to add
 * - so the add affordance lives here, as a dashed row after the list. It sits OUTSIDE the
 * `SortableContext`: a dashed row among sortable rows reads as a drop slot. It carries no grip and
 * neutral tokens only, so it never competes with scanning the list.
 *
 * Reordering is wired through {@link useMobileCardDragReorder} (dispatching the id-based
 * `reorderSheetLayout` store action over the manifest, the same path desktop uses). Card previews
 * route through the shared `resolveCardComponent` (forced to the front-facing side-by-side view);
 * journals render a compact parchment row. Entry into this view is owned by the toolbelt and the card
 * nav bar; this component only renders the list.
 *
 * @param items - The resolved layout items, in their displayed order.
 * @param isMobileFABMode - Adds bottom padding so the FAB does not overlap the list.
 * @param isLeftHanded - Mirrors each grip handle to the left edge when true.
 * @param onSelectItem - Called with an item index when its row is tapped.
 * @param onOpenAddCard - Opens the card creator; the add row is omitted without it.
 */
export function MobileCardReorderView({ items, isMobileFABMode, isLeftHanded, onSelectItem, onOpenAddCard }: MobileCardReorderViewProps) {
	const { t } = useTranslation();
	const areGestureHintsEnabled = useAppSettingsStore((state) => state.areGestureHintsEnabled);
	const sensors = useMobileDragSensors();
	const { itemIds, handleDragEnd } = useMobileCardDragReorder(items);

	// Force SIDE_BY_SIDE mode and front face for previews (like in the Drawer)
	const renderCardPreview = (card: Card) => {
		const Component = resolveCardComponent(card.cardType, card.details.game);
		if (!Component) return null;

		const previewCard = { ...card, viewMode: 'SIDE_BY_SIDE' as const, isFlipped: false };
		return <Component card={previewCard} isDrawerPreview />;
	};

	// A journal reads as a compact parchment row (glyph + title + page count), the same height as a
	// card row so the mixed list scans as one.
	const renderJournalRow = (journal: Journal) => (
		<div className="flex items-center gap-3">
			<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-paper-border bg-paper-background text-paper-foreground">
				<NotebookText className="h-5 w-5" />
			</div>
			<div className="min-w-0">
				<p className="truncate text-sm font-medium">{deriveJournalTitle(journal, t)}</p>
				<p className="truncate text-xs text-muted-foreground">{t('Drawer.Types.journalPageCount', { count: journal.pages.length })}</p>
			</div>
		</div>
	);

	return (
		<div
			className="flex-1 overflow-y-auto overflow-x-hidden p-3"
			// In FAB mode the floating "Done" button rests over this list at the base
			// floating offset; derive the bottom clearance from the same system rather
			// than a fixed pb-32 so the last item scrolls clear of it.
			style={isMobileFABMode ? { paddingBottom: getFloatingContentPadding() } : undefined}
		>
			<div className="max-w-2xl mx-auto space-y-3">
				{/* Header */}
				<div className="flex items-center justify-center mb-2 sticky top-0 bg-background z-10 pb-2">
					<h2 className="text-lg font-semibold">{t('MobileCharacterSheet.cardOverview')}</h2>
				</div>

				{/* Drag-sortable item list */}
				<DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={handleDragEnd}>
					<SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
						{items.map((item, index) => {
							const dragData = item.kind === 'card'
								? { type: DRAG_TYPES.SHEET_CARD, item: item.card }
								: { type: DRAG_TYPES.SHEET_JOURNAL, item: item.journal };
							return (
								<Sortable key={item.id} id={item.id} data={dragData}>
									{({ dragAttributes, dragListeners, isBeingDragged }) => (
										<DragStaticWrapper isBeingDragged={isBeingDragged}>
											<div
												className={cn(
													"flex items-center gap-3 p-3 bg-card border border-border rounded-lg",
													isLeftHanded && "flex-row-reverse"
												)}
											>
												{/* Preview - tap to navigate and close the overview */}
												<div
													className="flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
													onClick={() => onSelectItem(index)}
												>
													{item.kind === 'card' ? renderCardPreview(item.card) : renderJournalRow(item.journal)}
												</div>

												{/* Drag handle (≥44px touch target) */}
												<button
													type="button"
													aria-label={t('Common.dragHandle')}
													data-tutorial="card-reorder-grip"
													className={cn(
														"flex shrink-0 items-center justify-center h-11 w-11 text-muted-foreground touch-none cursor-grab active:cursor-grabbing",
														// Drag affordance cue, gated on the gesture-tips setting.
														areGestureHintsEnabled && "bg-muted/50 rounded-md"
													)}
													{...dragAttributes}
													{...dragListeners}
												>
													<GripVertical className="h-6 w-6" />
												</button>
											</div>
										</DragStaticWrapper>
									)}
								</Sortable>
							);
						})}
					</SortableContext>
				</DndContext>

				{/* Add card: outside the sortable list so it never reads as a drop slot, and
				    deliberately quieter than the rows it follows. */}
				{onOpenAddCard && (
					<button
						type="button"
						data-tutorial="card-overview-add"
						onClick={onOpenAddCard}
						className={cn(
							"flex w-full h-16 items-center justify-center gap-2 rounded-lg",
							"border-2 border-dashed border-border bg-muted/50 text-muted-foreground",
							"hover:text-foreground hover:border-foreground transition-colors"
						)}
					>
						<PlusCircle className="h-5 w-5" />
						<span className="text-sm font-medium">{t('CharacterSheetPage.addCard')}</span>
					</button>
				)}
			</div>
		</div>
	);
}
