// -- React Imports --
import { useState, useMemo, useEffect, startTransition } from 'react';
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { IconButton } from '@/components/ui/icon-button';
import MobileToolbelt from '@/components/mobile/toolbelt/MobileToolbelt';
import MobileSaveToDrawerSheet from '@/components/mobile/character-sheet/MobileSaveToDrawerSheet';
import { MobileCharacterNameHeader } from '@/components/mobile/character-sheet/MobileCharacterNameHeader';
import { MobileCharacterSheetTabBar } from '@/components/mobile/character-sheet/MobileCharacterSheetTabBar';
import { MobileTrackersSection } from '@/components/mobile/character-sheet/MobileTrackersSection';
import { MobileCardReorderView } from '@/components/mobile/character-sheet/MobileCardReorderView';
import { MobileCardArea } from '@/components/mobile/character-sheet/MobileCardArea';
import { MobileCardNavigationBar } from '@/components/mobile/character-sheet/MobileCardNavigationBar';

// -- Icon Imports --
import { Check } from 'lucide-react';

// -- Store Imports --
import { useCharacterStore, useCharacterActions } from '@/lib/stores/characterStore';
import { useAppGeneralStateStore } from '@/lib/stores/appGeneralStateStore';
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';
import { useMobileSaveToDrawer } from '@/hooks/mobile/useMobileSaveToDrawer';
import { useMobileCardSheetGestures } from '@/hooks/mobile/useMobileCardSheetGestures';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { deriveCardTitle } from '@/lib/utils/character';
import { resolveSheetItems } from '@/lib/character/sheetLayout';
import { triggerHaptic } from '@/lib/utils/haptics';
import { getFloatingBottom } from '@/lib/utils/mobileFloating';

// -- Type Imports --
import type { Card, Tracker } from '@/lib/types/character';
import type { ToolbeltContext } from '@/lib/types/toolbelt';



type SheetTab = 'trackers' | 'cards';



interface MobileCharacterSheetProps {
	activeTab?: SheetTab;
	onTabChange?: (tab: SheetTab) => void;
	isToolbeltOpen?: boolean;
	onToolbeltOpenChange?: (isOpen: boolean) => void;
	isMenuFABExpanded?: boolean;
	isReorderingCards?: boolean;
	onReorderingCardsChange?: (isReordering: boolean) => void;
	onOpenAddCard?: () => void;
	onEditCard?: (card: Card) => void;
	onEditPortrait?: () => void;
	initialItemId?: string | null;
}

export default function MobileCharacterSheet({
	activeTab: controlledActiveTab,
	onTabChange: controlledOnTabChange,
	isToolbeltOpen: controlledIsToolbeltOpen,
	onToolbeltOpenChange: controlledOnToolbeltOpenChange,
	isMenuFABExpanded,
	isReorderingCards: controlledIsReorderingCards,
	onReorderingCardsChange: controlledOnReorderingCardsChange,
	onOpenAddCard,
	onEditCard,
	onEditPortrait,
	initialItemId
}: MobileCharacterSheetProps = {}) {
	const { t } = useTranslation();
	const [internalActiveTab, setInternalActiveTab] = useState<SheetTab>('trackers');

	// ActiveTab
	const activeTab = controlledActiveTab ?? internalActiveTab;
	const setActiveTab = controlledOnTabChange ?? setInternalActiveTab;

	// Toolbelt
	const [internalIsToolbeltOpen, setInternalIsToolbeltOpen] = useState(false);
	const isToolbeltOpen = controlledIsToolbeltOpen ?? internalIsToolbeltOpen;
	const setIsToolbeltOpen = controlledOnToolbeltOpenChange ?? setInternalIsToolbeltOpen;

	// Toolbelt open/close that fires a haptic pulse on the open transition, so
	// every toolbelt-open path (edge swipe, tab-bar button, FAB) gives coherent
	// feedback. Closing is silent.
	const handleToolbeltOpenChange = (open: boolean) => {
		if (open && !isToolbeltOpen) triggerHaptic();
		setIsToolbeltOpen(open);
	};

	// Reordering
	const [internalIsReorderingCards, setInternalIsReorderingCards] = useState(false);
	const isReorderingCards = controlledIsReorderingCards ?? internalIsReorderingCards;
	const setIsReorderingCards = controlledOnReorderingCardsChange ?? setInternalIsReorderingCards;

	// Character data
	const character = useCharacterStore((state) => state.character);
	const { updateCharacterName, addStatus, addStoryTag, addStoryTheme, flipCard } = useCharacterActions();

	// Settings
	const isEditing = useAppGeneralStateStore((state) => state.isEditing);
	const isTrackersAlwaysEditable = useAppSettingsStore((state) => state.isTrackersAlwaysEditable);
	const areTrackersEditable = isEditing || isTrackersAlwaysEditable;
	const isMobileFABMode = useAppSettingsStore((state) => state.isMobileFABMode);
	const mobileHandedness = useAppSettingsStore((state) => state.mobileHandedness);
	const isLeftHanded = mobileHandedness === 'left';

	// The interleaved cards + journals region, in manifest order. The carousel, nav bar, dots, and
	// overview all index this resolved list (not `cards`); for a journal-less character it is `cards`
	// in the same order, so nothing changes there.
	const layout = useMemo(() => (character ? resolveSheetItems(character) : []), [character]);

	// Card navigation state
	const [currentCardIndex, setCurrentCardIndex] = useState(0);

	// Navigate to a specific item when initialItemId changes
	useEffect(() => {
		if (initialItemId) {
			const itemIndex = layout.findIndex(item => item.id === initialItemId);
			if (itemIndex !== -1) {
				startTransition(() => {
					setCurrentCardIndex(itemIndex);
				});
			}
		}
	}, [initialItemId]);
   
	// Toolbelt context state
	const [selectedTrackerId, setSelectedTrackerId] = useState<string | null>(null);

	// Save to Drawer sheet state (mobile hook)
	const { isSaveToDrawerOpen, setIsSaveToDrawerOpen, saveToDrawerDefaultName, openSaveToDrawer, handleConfirmSaveToDrawer } = useMobileSaveToDrawer();

	// Safe item index (clamp to valid range)
	const safeCardIndex = layout.length > 0
		? Math.min(currentCardIndex, layout.length - 1)
		: 0;

	// Over an editable journal body a horizontal drag is caret/selection, so a card-area swipe there must
	// not step items; the nav-bar arrows/dots stay the way to move. A resting journal swipes like a card.
	const activeItem = layout[safeCardIndex];
	const suppressCardAreaSwipe = activeItem?.kind === 'journal' && isEditing;

	// Card-sheet touch gestures (mobile hook)
	const { cardAreaHandlers, navBarHandlers, trackersAreaHandlers } = useMobileCardSheetGestures({
		character,
		itemCount: layout.length,
		safeCardIndex,
		isLeftHanded,
		isMobileFABMode,
		isToolbeltOpen,
		suppressCardAreaSwipe,
		setCurrentCardIndex,
		setIsToolbeltOpen: handleToolbeltOpenChange,
		onNavigateToTrackers: () => setActiveTab('trackers'),
		onNavigateToCards: () => setActiveTab('cards'),
	});


	// Save to Drawer handlers
	const handleSaveToDrawer = (item: Card | Tracker) => {
		const defaultName = 'cardType' in item ? deriveCardTitle(item, t) : item.name;
		openSaveToDrawer(item, defaultName);
	};

	// Build toolbelt context based on active tab and selection
	const toolbeltContext: ToolbeltContext = useMemo(() => {
		if (activeTab === 'cards' && layout.length > 0) {
			// A journal entry has no card-specific actions; the toolbelt defaults to none.
			const activeItem = layout[safeCardIndex];
			if (activeItem?.kind === 'card') return { type: 'card', card: activeItem.card };
		}
		if (activeTab === 'trackers' && selectedTrackerId && character) {
			// Check statuses
			const status = character.trackers.statuses.find(t => t.id === selectedTrackerId);
			if (status) return { type: 'tracker', tracker: status };

			// Check story tags
			const storyTag = character.trackers.storyTags.find(t => t.id === selectedTrackerId);
			if (storyTag) return { type: 'tracker', tracker: storyTag };

			// Check story themes
			const storyTheme = character.trackers.storyThemes.find(t => t.id === selectedTrackerId);
			if (storyTheme) return { type: 'tracker', tracker: storyTheme };
		}
		return { type: 'none' };
	}, [activeTab, layout, character, safeCardIndex, selectedTrackerId]);



	if (!character) {
		return (
			<div className="flex flex-col items-center justify-center h-full p-8 text-center">
				<h2 className="text-xl font-bold mb-4">
					{t('MobileCharacterSheet.noCharacter')}
				</h2>
				<p className="text-muted-foreground mb-6">
					{t('MobileCharacterSheet.loadCharacterPrompt')}
				</p>
				<p className="text-sm text-muted-foreground">
					{t('MobileCharacterSheet.drawerHint')}
				</p>
			</div>
		);
	}

	return (
		<>
		<div className="flex flex-col h-full">
			{/* Character Name Header */}
			<MobileCharacterNameHeader
				key={character.id}
				name={character.name}
				onCommit={updateCharacterName}
				placeholder={t('CharacterSheetPage.characterNamePlaceholder')}
			/>

			{/* Tab Navigation - Hidden when reordering cards */}
			{!isReorderingCards && (
				<MobileCharacterSheetTabBar
					activeTab={activeTab}
					onTabChange={setActiveTab}
					cardCount={character.cards.length}
				/>
			)}

			{/* Tab Content */}
			<div className="flex-1 flex flex-col overflow-hidden">
				{activeTab === 'trackers' && (
					<MobileTrackersSection
						character={character}
						areTrackersEditable={areTrackersEditable}
						isEditing={isEditing}
						isMobileFABMode={isMobileFABMode}
						selectedTrackerId={selectedTrackerId}
						onSelectTracker={(id) => setSelectedTrackerId(id === selectedTrackerId ? null : id)}
						onAddStatus={() => addStatus()}
						onAddStoryTag={() => addStoryTag()}
						onAddStoryTheme={() => addStoryTheme()}
						isLeftHanded={isLeftHanded}
						touchHandlers={trackersAreaHandlers}
					/>
				)}

				{activeTab === 'cards' && (
					<>
						{/* Reorder overview or normal item display */}
						{isReorderingCards ? (
							<MobileCardReorderView
								items={layout}
								isMobileFABMode={isMobileFABMode}
								isLeftHanded={isLeftHanded}
								onSelectItem={(index) => {
									setCurrentCardIndex(index);
									setIsReorderingCards(false);
								}}
								onOpenAddCard={onOpenAddCard}
							/>
						) : (
							<MobileCardArea
								items={layout}
								currentIndex={safeCardIndex}
								isLeftHanded={isLeftHanded}
								touchHandlers={cardAreaHandlers}
								onOpenAddCard={onOpenAddCard}
							/>
						)}

						{/* Navigation Bar - Only visible in normal item view */}
						{!isReorderingCards && layout.length > 0 && (
							<MobileCardNavigationBar
								items={layout}
								safeCardIndex={safeCardIndex}
								isLeftHanded={isLeftHanded}
								onPrevious={() => setCurrentCardIndex(i => Math.max(0, i - 1))}
								onNext={() => setCurrentCardIndex(i => Math.min(layout.length - 1, i + 1))}
								onSelectCard={(index) => setCurrentCardIndex(index)}
								onFlip={() => {
									const activeItem = layout[safeCardIndex];
									if (activeItem?.kind !== 'card') return;
									triggerHaptic();
									flipCard(activeItem.id);
								}}
								onReorder={() => { triggerHaptic(); setIsReorderingCards(true); }}
								touchHandlers={navBarHandlers}
							/>
						)}
					</>
				)}
			</div>



			{/* Toolbelt - Hidden when reordering cards */}
			{!isReorderingCards && (
				<MobileToolbelt
					mode={isMobileFABMode ? 'fab' : 'side-panel'}
					context={toolbeltContext}
					isOpen={isToolbeltOpen}
					onOpenChange={handleToolbeltOpenChange}
					activeTab={activeTab}
					isMenuFABExpanded={isMenuFABExpanded}
					onSaveToDrawer={handleSaveToDrawer}
					onEditCard={onEditCard}
					onEditPortrait={onEditPortrait}
				/>
			)}



			{/* Card Reorder Done Button */}
			{isReorderingCards && (
				<div
					className={cn(
						"fixed layer-floating",
						isLeftHanded ? "left-4" : "right-4"
					)}
					style={{ bottom: getFloatingBottom() }}
				>
					<IconButton
						variant="default"
						size="lg"
						onClick={() => setIsReorderingCards(false)}
						className="h-11 w-11 shadow-2xl"
						aria-label={t('Common.done')}
					>
						<Check className="h-6 w-6" />
					</IconButton>
				</div>
			)}
		</div>

		{/* Save to Drawer Sheet */}
		<MobileSaveToDrawerSheet
			isOpen={isSaveToDrawerOpen}
			onClose={() => setIsSaveToDrawerOpen(false)}
			onConfirm={handleConfirmSaveToDrawer}
			defaultName={saveToDrawerDefaultName}
		/>

		</>
	);
}
