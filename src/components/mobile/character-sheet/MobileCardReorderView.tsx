// -- Library Imports --
import { useTranslation } from 'react-i18next';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

// -- Component Imports --
import { resolveCardComponent } from '@/components/organisms/cards/resolveCardComponent';

// -- DnD Component Imports --
import { Sortable, DragStaticWrapper } from '@/components/dnd';

// -- Icon Imports --
import { GripVertical } from 'lucide-react';

// -- Hook Imports --
import { useMobileDragSensors } from '@/hooks/mobile/useMobileDragSensors';
import { useMobileCardDragReorder } from '@/hooks/mobile/useMobileCardDragReorder';

// -- Store Imports --
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { getFloatingContentPadding } from '@/lib/utils/mobileFloating';
import { restrictToVerticalAxis } from '@/lib/utils/dndModifiers';
import { DRAG_TYPES } from '@/lib/constants/dragDrop';

// -- Type Imports --
import type { Card } from '@/lib/types/character';



interface MobileCardReorderViewProps {
	cards: Card[];
	isMobileFABMode: boolean;
	isLeftHanded: boolean;
	onSelectCard: (index: number) => void;
}

/**
 * The card-reorder view of the mobile character sheet: a vertical, drag-sortable
 * list of card previews. Each row pairs a tappable preview (tap jumps to that
 * card and exits reorder mode) with a dedicated ≥44px grip handle that owns
 * drag-to-reorder, so tapping a preview never starts a drag and dragging the
 * handle never selects. The handle sits on the handedness-leading edge (right by
 * default, left when left-handed) and is touch-action: none so an intentional
 * drag is not pre-empted by the list's vertical scroll; @dnd-kit auto-scrolls the
 * surrounding scroll container while dragging near its edges.
 *
 * Reordering is wired through {@link useMobileCardDragReorder} (dispatching the
 * `reorderCards` store action); the previews route through the shared
 * `resolveCardComponent` (forced to the front-facing side-by-side view), so no
 * card-type/game routing lives here. Entry into this view is owned by the
 * toolbelt's reorder action; this component only renders the list.
 *
 * @param cards - The character's cards, in their displayed order.
 * @param isMobileFABMode - Adds bottom padding so the FAB does not overlap the list.
 * @param isLeftHanded - Mirrors each grip handle to the left edge when true.
 * @param onSelectCard - Called with a card index when its preview is tapped.
 */
export function MobileCardReorderView({ cards, isMobileFABMode, isLeftHanded, onSelectCard }: MobileCardReorderViewProps) {
	const { t } = useTranslation();
	const areGestureHintsEnabled = useAppSettingsStore((state) => state.areGestureHintsEnabled);
	const sensors = useMobileDragSensors();
	const { cardIds, handleDragEnd } = useMobileCardDragReorder(cards);

	// Force SIDE_BY_SIDE mode and front face for previews (like in the Drawer)
	const renderCardPreview = (card: Card) => {
		const Component = resolveCardComponent(card.cardType, card.details.game);
		if (!Component) return null;

		const previewCard = { ...card, viewMode: 'SIDE_BY_SIDE' as const, isFlipped: false };
		return <Component card={previewCard} isDrawerPreview />;
	};

	return (
		<div
			className="flex-1 overflow-y-auto overflow-x-hidden p-3"
			// In FAB mode the floating "Done" button rests over this list at the base
			// floating offset; derive the bottom clearance from the same system rather
			// than a fixed pb-32 so the last card scrolls clear of it.
			style={isMobileFABMode ? { paddingBottom: getFloatingContentPadding() } : undefined}
		>
			<div className="max-w-2xl mx-auto space-y-3">
				{/* Header */}
				<div className="flex items-center justify-center mb-2 sticky top-0 bg-background z-10 pb-2">
					<h2 className="text-lg font-semibold">{t('MobileCharacterSheet.reorderCards')}</h2>
				</div>

				{/* Drag-sortable card list */}
				<DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={handleDragEnd}>
					<SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
						{cards.map((card, index) => (
							<Sortable key={card.id} id={card.id} data={{ type: DRAG_TYPES.SHEET_CARD, item: card }}>
								{({ dragAttributes, dragListeners, isBeingDragged }) => (
									<DragStaticWrapper isBeingDragged={isBeingDragged}>
										<div
											className={cn(
												"flex items-center gap-3 p-3 bg-card border border-border rounded-lg",
												isLeftHanded && "flex-row-reverse"
											)}
										>
											{/* Card preview - tap to navigate and close reorder mode */}
											<div
												className="flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
												onClick={() => onSelectCard(index)}
											>
												{renderCardPreview(card)}
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
						))}
					</SortableContext>
				</DndContext>
			</div>
		</div>
	);
}
