// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { resolveCardComponent } from '@/components/organisms/cards/resolveCardComponent';
import { AddCardButton } from '@/components/molecules/AddThemeCardButton';
import { MobileJournalCoverTile } from '@/components/mobile/character-sheet/MobileJournalCoverTile';

// -- Store Imports --
import { useAppGeneralStateStore } from '@/lib/stores/appGeneralStateStore';

// -- Type Imports --
import type { Card as CardData } from '@/lib/types/character';
import type { ResolvedSheetItem } from '@/lib/character/sheetLayout';

interface MobileCardCarouselProps {
	items: ResolvedSheetItem[];
	currentIndex: number;
	onOpenAddCard?: () => void;
	onOpenJournal?: (journalId: string) => void;
}

export default function MobileCardCarousel({ items, currentIndex, onOpenAddCard, onOpenJournal }: MobileCardCarouselProps) {
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

	// A card or a journal, at its manifest position.
	const renderItem = (item: ResolvedSheetItem) =>
		item.kind === 'card'
			? renderCard(item.card)
			: <MobileJournalCoverTile key={item.id} journal={item.journal} onOpenJournal={onOpenJournal} />;

	// Empty state
	if (items.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center h-full p-8 text-center">
				<p className="text-lg text-muted-foreground mb-6">
					{t('MobileCardCarousel.noCards')}
				</p>
				{/* Not edit-gated: with no items the overview does not exist, so this is the
				    only route to creating one. */}
				{onOpenAddCard && <AddCardButton onClick={onOpenAddCard} />}
			</div>
		);
	}

	const currentItem = items[currentIndex];

	// Simple item display (swipe gestures handled by parent MobileCharacterSheet)
	return (
		<div className="h-full w-full flex items-center justify-center">
			{renderItem(currentItem)}
		</div>
	);
}
