// -- Library Imports --
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { IconButton } from '@/components/ui/icon-button';

// -- Store Imports --
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';

// -- Icon Imports --
import { ChevronLeft, ChevronRight, RefreshCw, LayoutList } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { deriveCardTitle, deriveJournalTitle } from '@/lib/utils/character';

// -- Type Imports --
import type { ResolvedSheetItem } from '@/lib/character/sheetLayout';



interface MobileCardNavigationBarProps {
	items: ResolvedSheetItem[];
	safeCardIndex: number;
	isLeftHanded: boolean;
	onPrevious: () => void;
	onNext: () => void;
	onSelectCard: (index: number) => void;
	onFlip: () => void;
	onReorder: () => void;
}

/**
 * The card navigation bar shown beneath the carousel in normal card view:
 * previous/next buttons, the current card's title (via the shared
 * `deriveCardTitle`), a row of dot indicators, and an explicit flip control. Its
 * arrows and dots drive the sheet pager through the shared settle motion. Purely
 * presentational; the `data-tutorial` anchor is preserved.
 *
 * The prev/next arrows are 44px, meeting the touch-target guideline; the dots do
 * not, and are deliberately sub-guideline (see the comment on the dot row). The
 * dot row wraps when a character has enough items to overflow one line. The flip
 * and overview controls are grouped on the handedness-leading side (left for
 * left-handed, right otherwise) so they stay thumb-reachable while the prev/next
 * steppers remain at the outer edges. Flip toggles the current card's face via the
 * sheet's `onFlip`; for a card whose effective view mode is side-by-side
 * this is a visual no-op (both faces already show), matching the prior
 * edge-swipe-flip semantics. A journal has no faces, so the flip control is hidden
 * on a journal entry and its title reads from the journal. `onReorder` opens the
 * overview - the same action the toolbelt exposes, surfaced here as a discoverable
 * front door. The overview also owns Add Card, so this button shows from one item
 * up rather than only when there is something to reorder.
 */
export function MobileCardNavigationBar({ items, safeCardIndex, isLeftHanded, onPrevious, onNext, onSelectCard, onFlip, onReorder }: MobileCardNavigationBarProps) {
	const { t } = useTranslation();
	const areGestureHintsEnabled = useAppSettingsStore((state) => state.areGestureHintsEnabled);

	const activeItem = items[safeCardIndex];
	const activeTitle = activeItem
		? activeItem.kind === 'card' ? deriveCardTitle(activeItem.card, t) : deriveJournalTitle(activeItem.journal, t)
		: '';

	// The explicit flip control, hidden on a journal entry (a notebook has no faces).
	// Grouped on the handedness-leading side with the overview so the two most-used
	// card actions stay thumb-reachable next to the dot row.
	const flipButton = activeItem?.kind === 'card' ? (
		<IconButton
			variant="outline"
			size="sm"
			onClick={onFlip}
			aria-label={t('Toolbelt.flipCard')}
			className="h-11 w-11 shrink-0"
		>
			<RefreshCw className="h-5 w-5" />
		</IconButton>
	) : null;

	// The overview is also available in the toolbelt; this is its discoverable front
	// door. It shows from one item up, because the overview carries Add Card and a
	// single-item sheet still needs a route to it.
	const overviewButton = items.length >= 1 ? (
		<IconButton
			variant="outline"
			size="sm"
			onClick={onReorder}
			aria-label={t('Toolbelt.cardOverview')}
			className="h-11 w-11 shrink-0"
			data-tutorial="card-reorder-button"
		>
			<LayoutList className="h-5 w-5" />
		</IconButton>
	) : null;

	const leadingControls = (
		<>
			{flipButton}
			{overviewButton}
		</>
	);

	return (
		<div
			className="shrink-0 flex items-center justify-between gap-2 px-3 py-1.5 bg-card border-t border-border"
			data-tutorial="card-navigation-bar"
		>
			<IconButton
				variant="outline"
				size="sm"
				onClick={onPrevious}
				disabled={safeCardIndex === 0}
				aria-label={t('MobileCardNavigationBar.previousCard')}
				className="h-11 w-11 shrink-0"
			>
				<ChevronLeft className="h-5 w-5" />
			</IconButton>

			{isLeftHanded && leadingControls}

			<div className="flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5">
				{/* Item Title */}
				<span className="text-xs font-medium truncate max-w-full text-center">
					{activeTitle}
				</span>

				{/* Dot Indicators - compact pills packed together and centred between the
				    arrows. The hit area is deliberately smaller than the 44px guideline
				    (the prev/next arrows remain the primary, full-size navigation) so the
				    pills read as one tidy row rather than being spread across wide boxes. */}
				<div className="flex flex-wrap items-center justify-center gap-0.5">
					{items.map((item, index) => (
						<button
							key={item.id}
							onClick={() => onSelectCard(index)}
							className="flex h-6 w-4 shrink-0 items-center justify-center"
							aria-label={t('MobileCardNavigationBar.goToCard', { number: index + 1 })}
						>
							<span
								className={cn(
									"h-1.5 rounded-full transition-all",
									index === safeCardIndex
										? "bg-primary w-4"
										: "bg-muted-foreground/30 w-1.5 hover:bg-muted-foreground/50"
								)}
							/>
						</button>
					))}
				</div>

				{/* Gesture tip: gated on the user's "gesture tips" setting, shown only
				    when navigation is possible. Unobtrusive and non-interactive. */}
				{areGestureHintsEnabled && items.length > 1 && (
					<span className="text-[10px] leading-none text-muted-foreground/70 pointer-events-none">
						{t('MobileCardNavigationBar.swipeHint')}
					</span>
				)}
			</div>

			{!isLeftHanded && leadingControls}

			<IconButton
				variant="outline"
				size="sm"
				onClick={onNext}
				disabled={safeCardIndex === items.length - 1}
				aria-label={t('MobileCardNavigationBar.nextCard')}
				className="h-11 w-11 shrink-0"
			>
				<ChevronRight className="h-5 w-5" />
			</IconButton>
		</div>
	);
}
