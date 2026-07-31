// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { resolveCardComponent } from '@/components/organisms/cards/resolveCardComponent';
import { AddCardButton } from '@/components/molecules/AddThemeCardButton';
import { MobileJournalCard } from '@/components/mobile/character-sheet/MobileJournalCard';

// -- Store Imports --
import { useAppGeneralStateStore } from '@/lib/stores/appGeneralStateStore';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Type Imports --
import type { Card as CardData } from '@/lib/types/character';
import type { ResolvedSheetItem } from '@/lib/character/sheetLayout';

interface MobileCardCarouselProps {
	items: ResolvedSheetItem[];
	currentIndex: number;
	onOpenAddCard?: () => void;
}

export default function MobileCardCarousel({ items, currentIndex, onOpenAddCard }: MobileCardCarouselProps) {
	const { t } = useTranslation();
	const isEditing = useAppGeneralStateStore((state) => state.isEditing);

	// Render individual card based on type
	const renderCard = (card: CardData) => {
		const Component = resolveCardComponent(card.cardType, card.details.game);
		const commonProps = {
			card,
			isEditing,
			useVerticalStack: true,
			// The portrait renders at a fixed mobile footprint (no desktop resize chrome); its edit
			// controls live in the dedicated portrait screen.
			isMobile: card.cardType === 'IMAGE_CARD',
			onEditCard: () => {}, // TODO: implement later
			onExport: () => {} // TODO: implement later
		};

		if (!Component) {
			return (
				<div className="flex items-center justify-center h-full w-full bg-card border-2 border-border rounded-lg p-8">
					<p className="text-center text-muted-foreground">
						{`NO RENDER AVAILABLE FOR THIS TYPE: ${card.details.game} ${card.cardType}`}
					</p>
				</div>
			);
		}

		// Key by card id so navigating between same-type cards remounts the card
		// instead of reusing one instance. A reused instance would see its flip
		// `animate` value change and replay the flip animation when moving onto an
		// already-flipped card; remounting lets CardFlipWrapper's state-matching
		// `initial` render it flipped with no animation.
		return <Component key={card.id} {...commonProps} />;
	};

	// A card or a journal, at its manifest position. A journal fills the whole stage inline (not a fixed card box).
	const renderItem = (item: ResolvedSheetItem) =>
		item.kind === 'card'
			? renderCard(item.card)
			: <MobileJournalCard key={item.id} journal={item.journal} />;

	// Empty state: with no cards AND no journals the overview does not exist, so this "Add..." placeholder
	// is the only route to creating any sheet element. Not edit-gated, and scroll-safe on a short stage.
	if (items.length === 0) {
		return (
			<div className="flex flex-col h-full overflow-y-auto">
				<div className="m-auto flex flex-col items-center gap-4 p-8 text-center">
					<p className="text-lg text-muted-foreground">
						{t('MobileCardCarousel.noCards')}
					</p>
					{onOpenAddCard && <AddCardButton onClick={onOpenAddCard} />}
				</div>
			</div>
		);
	}

	const currentItem = items[currentIndex];

	// A card is centred in the stage; a journal fills it (its own frame provides the shape).
	// Swipe gestures are handled by the parent MobileCharacterSheet.
	return (
		<div className={cn('h-full w-full flex', currentItem.kind === 'journal' ? '' : 'items-center justify-center')}>
			{renderItem(currentItem)}
		</div>
	);
}
