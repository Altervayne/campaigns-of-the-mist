// -- React Imports --
import { useState, useEffect, useRef, useCallback, startTransition } from 'react';

// -- Library Imports --
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import MobileCharacterSheet from '@/components/mobile/character-sheet/MobileCharacterSheet';
import MobileNoteSurface from '@/components/mobile/character-sheet/MobileNoteSurface';
import { MobileWorkspaceSwitcher } from '@/components/mobile/character-sheet/MobileWorkspaceSwitcher';
import MobileBottomTabs from '@/components/mobile/menu/MobileBottomTabs';
import MobileFAB from '@/components/mobile/menu/MobileFAB';
import MobileSettings from '@/components/mobile/menu/MobileSettings';
import MobileSettingsGeneral from '@/components/mobile/menu/MobileSettingsGeneral';
import MobileSettingsAppearance from '@/components/mobile/menu/MobileSettingsAppearance';
import MobileSettingsData from '@/components/mobile/menu/MobileSettingsData';
import MobileSettingsLearn from '@/components/mobile/menu/MobileSettingsLearn';
import MobileThemeEditor from '@/components/mobile/menu/MobileThemeEditor';
import MobileAbout from '@/components/mobile/menu/MobileAbout';
import MobilePatchNotes from '@/components/mobile/menu/MobilePatchNotes';
import MobileAnnouncements from '@/components/mobile/menu/MobileAnnouncements';
import MobileMainMenu from '@/components/mobile/menu/MobileMainMenu';
import MobileAddCard from '@/components/mobile/menu/MobileAddCard';
import MobileEditPortrait from '@/components/mobile/menu/MobileEditPortrait';
import MobileDrawer from '@/components/mobile/drawer/MobileDrawer';
import { MobileDiceTraySheet } from '@/components/mobile/dice/MobileDiceTraySheet';
import { CharacterBootLoading } from '@/components/molecules/CharacterBootLoading';

// -- Store Imports --
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';
import { useTutorialStore } from '@/lib/tutorial/tutorialStore';
import { useCharacterStore, useCharacterActions } from '@/lib/stores/characterStore';
import { getActiveCharacterStore } from '@/lib/character/characterStoreRegistry';
import { useTabManagerActions, useTabManagerStore } from '@/lib/character/tabManagerStore';
import { useIsBootHydrating, useCharacterBootStore } from '@/lib/character/characterPersistence';
import { useAppGeneralStateStore, useAppGeneralStateActions } from '@/lib/stores/appGeneralStateStore';

// -- Hook Imports --
import { useCreatePortrait } from '@/hooks/mobile/useCreatePortrait';

// -- Utils Imports --
import { ACCEPT_IMAGE } from '@/lib/utils/fileAccept';

// -- Type Imports --
import type { CreateCardOptions } from '@/lib/types/creation';
import type { Card, Character } from '@/lib/types/character';
import type { DrawerItem } from '@/lib/types/drawer';
import type { MobileTabId as TabId, MobileSheetTab as SheetTab } from '@/lib/mobile/mobileNavTypes';

type NavigationTabId = 'sheet' | 'drawer' | 'menu';

// The full-screen chrome tabs (settings drill-down, themes, about, add-card): the bottom navigation hides while
// any of these is open so it never sits over a pushed sub-screen.
const CHROME_TABS = new Set<TabId>(['settings', 'settingsGeneral', 'settingsAppearance', 'settingsData', 'settingsLearn', 'themeEditor', 'about', 'patchNotes', 'announcements', 'addCard', 'editPortrait']);

// The landing tab when the app opens, or history resets with nothing pushed: the
// sheet slot when a surface is live - a character (or still loading at boot) or an active
// note tab - otherwise the Menu (its main-menu home), so we never open onto the greyed,
// surface-less sheet. Read non-reactively: this seeds initial state, not a subscription.
function resolveDefaultTab(): TabId {
	const bootExpectsCharacter = useCharacterBootStore.getState().isBootHydrating;
	const hasCharacter = (getActiveCharacterStore()?.getState().character ?? null) !== null;
	const { openTabs, activeTabId } = useTabManagerStore.getState();
	const activeIsNote = openTabs.find((tab) => tab.id === activeTabId)?.type === 'note';
	return bootExpectsCharacter || hasCharacter || activeIsNote ? 'sheet' : 'menu';
}

interface HistoryState {
	tab: TabId;
	sheetTab?: SheetTab;
	isReordering?: boolean;
}

export default function MobileCharacterSheetPage() {
	const [activeTab, setActiveTab] = useState<TabId>(resolveDefaultTab);
	const [sheetActiveTab, setSheetActiveTab] = useState<SheetTab>('trackers');
	const [isMenuFABExpanded, setIsMenuFABExpanded] = useState(false);
	const [isToolbeltOpen, setIsToolbeltOpen] = useState(false);
	const [isReorderingCards, setIsReorderingCards] = useState(false);
	const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
	// True while an active note tab shows its docked editing bar; the nav FAB seats into the bar when so.
	const [isNoteEditing, setIsNoteEditing] = useState(false);
	const handleNoteEditingActiveChange = useCallback((active: boolean) => setIsNoteEditing(active), []);
	const isMobileFABMode = useAppSettingsStore((state) => state.isMobileFABMode);
	const character = useCharacterStore((state) => state.character);
	const isBootHydrating = useIsBootHydrating();
	// The active tab's kind, reactive: a note tab keeps the workspace (sheet) slot even with no character.
	const activeTabType = useTabManagerStore((state) => state.openTabs.find((tab) => tab.id === state.activeTabId)?.type ?? null);
	// A surface is live when a character is loaded OR the active tab is a note; with neither there is
	// nothing to show in the sheet slot, so the Sheet nav option greys out.
	const hasSurface = character !== null || activeTabType === 'note';
	const pendingMobileNavActions = useAppGeneralStateStore((state) => state.pendingMobileNavActions);
	const { setMobileOnboardingOpen, setMobileNavSnapshot, clearMobileNavActions } = useAppGeneralStateActions();

	// Card creation state
	const { t: tNotifications } = useTranslation();
	const { addCard, addJournal, updateCardDetails, addImportedCard, addImportedTracker } = useCharacterActions();
	const { mobileOpenCharacter } = useTabManagerActions();
	const [cardToEdit, setCardToEdit] = useState<Card | null>(null);
	// The item (card or journal) the carousel lands on after a create.
	const [newlyCreatedItemId, setNewlyCreatedItemId] = useState<string | null>(null);

	// The portrait is offered as a card type by the creator, so its picker + crop stage live here: the
	// creator is a full-screen tab and the sheet under it is unmounted while it is open.
	const { createPortrait, fileInputRef: portraitInputRef, handleFileSelected: onPortraitFileSelected, cropperDialog: portraitCropperDialog } = useCreatePortrait();
	const hasPortrait = character?.cards.some((card) => card.cardType === 'IMAGE_CARD') ?? false;

	// Track if we're handling a popstate event to avoid pushing duplicate history
	const isNavigatingBack = useRef(false);

	// Clear the newly created item ID when navigating away from the cards region.
	useEffect(() => {
		if (activeTab !== 'sheet' || sheetActiveTab !== 'cards') {
			startTransition(() => {
				setNewlyCreatedItemId(null);
			});
		}
	}, [activeTab, sheetActiveTab]);

	// Helper function to push current state to history
	const pushHistoryState = (state: HistoryState) => {
		if (!isNavigatingBack.current) {
			window.history.pushState(state, '', window.location.pathname + window.location.search);
		}
	};

	// Helper function to navigate with history support
	const navigateToTab = (tab: TabId) => {
		setActiveTab(tab);
		pushHistoryState({
			tab,
			sheetTab: tab === 'sheet' ? sheetActiveTab : undefined,
			isReordering: tab === 'sheet' ? isReorderingCards : undefined
		});
	};

	// Helper function to navigate sheet tabs with history support
	const navigateToSheetTab = (tab: SheetTab) => {
		setSheetActiveTab(tab);
		pushHistoryState({
			tab: 'sheet',
			sheetTab: tab,
			isReordering: isReorderingCards
		});
	};

	// Helper function to toggle reordering with history support
	const setReorderingWithHistory = (isReordering: boolean) => {
		setIsReorderingCards(isReordering);
		pushHistoryState({
			tab: 'sheet',
			sheetTab: sheetActiveTab,
			isReordering
		});
	};

	// Handle browser back button
	useEffect(() => {
		// Set initial state - mirrors the boot landing tab (sheet, or the Menu with no character).
		const initialTab = resolveDefaultTab();
		const initialState: HistoryState = {
			tab: initialTab,
			sheetTab: initialTab === 'sheet' ? 'trackers' : undefined,
			isReordering: initialTab === 'sheet' ? false : undefined
		};
		window.history.replaceState(initialState, '', window.location.pathname + window.location.search);

		const handlePopState = (event: PopStateEvent) => {
			// Set flag BEFORE updating any state
			isNavigatingBack.current = true;

			const state = event.state as HistoryState | null;

			if (state) {
				// Update all states directly without triggering navigation functions
				setActiveTab(state.tab);
				if (state.tab === 'sheet') {
					setSheetActiveTab(state.sheetTab || 'trackers');
					setIsReorderingCards(state.isReordering || false);
				} else {
					// Reset sheet state when not on sheet tab
					setIsReorderingCards(false);
				}
			} else {
				// If no state (initial page load or external navigation), reset to defaults -
				// the Menu, not the greyed sheet, when no character is loaded.
				setActiveTab(resolveDefaultTab());
				setSheetActiveTab('trackers');
				setIsReorderingCards(false);
			}

			// Reset flag after a tick to allow state updates to complete
			setTimeout(() => {
				isNavigatingBack.current = false;
			}, 0);
		};

		window.addEventListener('popstate', handlePopState);

		return () => {
			window.removeEventListener('popstate', handlePopState);
		};
	}, []);

	// A surface disposed while its slot is open (character Unload / overwrite discard, or a closed note
	// tab) would strand the user on an empty sheet, so redirect to the Menu the moment none is live.
	// Skipped while boot is still hydrating, when a surface may yet be on its way in.
	useEffect(() => {
		if (!isBootHydrating && !hasSurface && activeTab === 'sheet') {
			navigateToTab('menu');
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [hasSurface, activeTab, isBootHydrating]);

	// Publish the nav position to the store's mirror so a tutorial can snapshot it at run start and restore it
	// on exit, and so a step can gate on a mode the user enters here. Nothing reads it back to drive this page.
	useEffect(() => {
		setMobileNavSnapshot({
			tab: activeTab,
			sheetTab: sheetActiveTab,
			toolbeltOpen: isToolbeltOpen,
			fabExpanded: isMenuFABExpanded,
			reordering: isReorderingCards
		});
	}, [activeTab, sheetActiveTab, isToolbeltOpen, isMenuFABExpanded, isReorderingCards, setMobileNavSnapshot]);

	// Consume the runner's queued nav requests against this page's own setters, in order, then drain the queue
	// (mirrors BoardView's pending-action bridge). A step's arrival establishes every axis it needs in one tick,
	// so the queue may hold several. No-ops while it is empty, so non-tutorial nav is untouched - and draining
	// hands back a fresh empty array, which re-runs this and stops on the same early return.
	useEffect(() => {
		if (pendingMobileNavActions.length === 0) return;
		for (const action of pendingMobileNavActions) {
			// The three history-pushing axes only move when the request actually changes them: an arrival
			// re-asserts every axis it depends on, and re-asserting the value we already hold must not pile
			// a redundant entry onto the back stack.
			if (action.kind === 'navTab') { if (action.tab !== activeTab) navigateToTab(action.tab); }
			else if (action.kind === 'sheetTab') { if (action.tab !== sheetActiveTab) navigateToSheetTab(action.tab); }
			else if (action.kind === 'reorder') { if (action.active !== isReorderingCards) setReorderingWithHistory(action.active); }
			else if (action.kind === 'toolbelt') setIsToolbeltOpen(action.open);
			else if (action.kind === 'fab') setIsMenuFABExpanded(action.expanded);
			else if (action.kind === 'restore') {
				// Land straight on the captured position; `setActiveTab` (not `navigateToTab`) so no history is pushed.
				setActiveTab(action.snapshot.tab);
				setSheetActiveTab(action.snapshot.sheetTab);
				setIsToolbeltOpen(action.snapshot.toolbeltOpen);
				setIsMenuFABExpanded(action.snapshot.fabExpanded);
				setIsReorderingCards(action.snapshot.reordering);
			}
		}
		clearMobileNavActions();
		// eslint-disable-next-line react-hooks/exhaustive-deps -- the nav helpers close over live nav state that changes every render; only a new pending queue should re-run this.
	}, [pendingMobileNavActions, clearMobileNavActions]);

	const handleRestartOnboarding = () => {
		navigateToTab('menu');
		setMobileOnboardingOpen(true);
	};

	// Launch a re-explorable tutorial from the settings list. The tutorial's first beat claims whatever tab it
	// needs, and only once its demo content is seeded; navigating there from here instead would bounce a user
	// with no character of their own straight back to the Menu before the demo lands. Staying put also means
	// the run captures the tab it was launched from, so exiting returns the user to the list they started from.
	// The runner is app chrome (above this surface), so it survives the tab switch away from settings.
	const handleStartTutorial = (id: string) => {
		useTutorialStore.getState().actions.start(id, 'settings');
	};

	const handleOpenDrawer = () => {
		navigateToTab('drawer');
	};

	const handleOpenMenu = () => {
		navigateToTab('menu');
	};

	const handleOpenSettings = () => {
		navigateToTab('settings');
	};

	const handleOpenAddCard = () => {
		setCardToEdit(null);
		navigateToTab('addCard');
	};

	const handleEditCard = (card: Card) => {
		setCardToEdit(card);
		navigateToTab('addCard');
	};

	const handleEditPortrait = () => {
		navigateToTab('editPortrait');
	};

	const handleConfirmCard = (options: CreateCardOptions, cardId?: string) => {
		let resolvedCardId: string;
		if (cardId) {
			// Edit mode: change only the themebook/type of the existing card, preserving its tags.
			updateCardDetails(cardId, { themebook: options.themebook, themeType: options.themeType });
			resolvedCardId = cardId;
		} else {
			// Create mode: add a new card.
			resolvedCardId = addCard(options);
		}
		setCardToEdit(null);
		setNewlyCreatedItemId(resolvedCardId);
		// Confirm lands on the card itself, so the overview is left behind when the add was
		// launched from it. The destination is pushed as one entry rather than going through
		// the nav helpers, whose `isReordering` reads the pre-exit render's value.
		setIsReorderingCards(false);
		setActiveTab('sheet');
		setSheetActiveTab('cards');
		pushHistoryState({ tab: 'sheet', sheetTab: 'cards', isReordering: false });
	};

	// A journal has no type/themebook, so it needs none of the creator's themebook steps: create it, then
	// land the carousel on the new (empty) journal via the same land-on-item state the card confirm uses.
	// Reached from the creator's Journal option, which acts immediately rather than arming Confirm.
	const handleCreateJournal = () => {
		const journalId = addJournal();
		setNewlyCreatedItemId(journalId);
		setIsReorderingCards(false);
		setActiveTab('sheet');
		setSheetActiveTab('cards');
		pushHistoryState({ tab: 'sheet', sheetTab: 'cards', isReordering: false });
	};

	const handleAddDrawerItemToCharacter = (item: import('@/lib/types/drawer').DrawerItem) => {
		// NEUTRAL items are game-agnostic, so they drop onto any character's sheet.
		if (item.game !== 'NEUTRAL' && item.game !== character?.game) {
			toast.error(tNotifications('Notifications.general.importFailedWrongGame'));
			return;
		}

		const cardTypes = ['CHARACTER_CARD', 'CHARACTER_THEME', 'GROUP_THEME', 'LOADOUT_THEME'];
		const trackerTypes = ['STATUS_TRACKER', 'STORY_TAG_TRACKER', 'STORY_THEME_TRACKER'];

		if (cardTypes.includes(item.type)) {
			addImportedCard(item.content as Card);
		} else if (trackerTypes.includes(item.type)) {
			addImportedTracker(item.content as import('@/lib/types/character').Tracker);
		}
	};

	// Load a saved character (its stored content, linked to its drawer item) as the active sheet - the
	// mobile loader disposes the previous live instance and starts it clean (matching its saved copy).
	const handleLoadCharacterFromDrawer = (item: DrawerItem) => {
		mobileOpenCharacter(item.content as Character, item.id);
		navigateToTab('sheet');
		toast.success(tNotifications('Notifications.character.loaded'));
	};

	// While the active character is still being read from IndexedDB, show a neutral
	// loading screen rather than flashing the
	// main menu before the sheet resolves.
	if (isBootHydrating && !character) {
		return <CharacterBootLoading />;
	}

	// Fill the app shell, not the raw viewport: the shell reserves the dev-preview banner's height above this,
	// so 100% stays inside bounds while a fixed 100dvh would overflow past the banner.
	return (
		<div className="h-full w-full overflow-hidden flex flex-col">
			{/* Main Content */}
			<div className="flex-1 overflow-hidden">
				{activeTab === 'sheet' && character && (
					<MobileCharacterSheet
						activeTab={sheetActiveTab}
						onTabChange={navigateToSheetTab}
						isToolbeltOpen={isToolbeltOpen}
						onToolbeltOpenChange={setIsToolbeltOpen}
						isMenuFABExpanded={isMenuFABExpanded}
						isReorderingCards={isReorderingCards}
						onReorderingCardsChange={setReorderingWithHistory}
						onOpenAddCard={handleOpenAddCard}
						onEditCard={handleEditCard}
						onEditPortrait={handleEditPortrait}
						onOpenSwitcher={() => setIsSwitcherOpen(true)}
						initialItemId={newlyCreatedItemId}
					/>
				)}
				{activeTab === 'sheet' && !character && activeTabType === 'note' && (
					<MobileNoteSurface onOpenSwitcher={() => setIsSwitcherOpen(true)} onEditingActiveChange={handleNoteEditingActiveChange} />
				)}
				{activeTab === 'drawer' && (
					<MobileDrawer onAddToCharacter={handleAddDrawerItemToCharacter} onLoadCharacter={handleLoadCharacterFromDrawer} />
				)}
				{activeTab === 'menu' && (
					<MobileMainMenu onOpenSettings={handleOpenSettings} onCharacterOpened={() => navigateToTab('sheet')} />
				)}
				{activeTab === 'settings' && (
					<MobileSettings
						onOpenGeneral={() => navigateToTab('settingsGeneral')}
						onOpenAppearance={() => navigateToTab('settingsAppearance')}
						onOpenData={() => navigateToTab('settingsData')}
						onOpenLearn={() => navigateToTab('settingsLearn')}
						onOpenWhatsNew={() => navigateToTab('patchNotes')}
						onOpenAnnouncements={() => navigateToTab('announcements')}
						onOpenAbout={() => navigateToTab('about')}
						onBack={() => navigateToTab('menu')}
					/>
				)}
				{activeTab === 'settingsGeneral' && (
					<MobileSettingsGeneral onBack={() => navigateToTab('settings')} />
				)}
				{activeTab === 'settingsAppearance' && (
					<MobileSettingsAppearance onBack={() => navigateToTab('settings')} onOpenEditor={() => navigateToTab('themeEditor')} />
				)}
				{activeTab === 'settingsData' && (
					<MobileSettingsData onBack={() => navigateToTab('settings')} />
				)}
				{activeTab === 'settingsLearn' && (
					<MobileSettingsLearn
						onRestartOnboarding={handleRestartOnboarding}
						onStartTutorial={handleStartTutorial}
						onBack={() => navigateToTab('settings')}
					/>
				)}
				{activeTab === 'themeEditor' && (
					<MobileThemeEditor onBack={() => navigateToTab('settingsAppearance')} />
				)}
				{activeTab === 'about' && (
					<MobileAbout onBack={() => navigateToTab('settings')} />
				)}
				{activeTab === 'patchNotes' && (
					<MobilePatchNotes onBack={() => navigateToTab('settings')} />
				)}
				{activeTab === 'announcements' && (
					<MobileAnnouncements onBack={() => navigateToTab('settings')} />
				)}
				{activeTab === 'addCard' && character && (
					<MobileAddCard
						onBack={() => navigateToTab('sheet')}
						onConfirm={handleConfirmCard}
						mode={cardToEdit ? 'edit' : 'create'}
						cardData={cardToEdit ?? undefined}
						game={character.game}
						onCreatePortrait={hasPortrait ? undefined : createPortrait}
						onCreateJournal={handleCreateJournal}
					/>
				)}
				{activeTab === 'editPortrait' && character && (
					<MobileEditPortrait onBack={() => navigateToTab('sheet')} />
				)}
			</div>

			{/* Navigation - Hidden when reordering cards or while a full-screen chrome tab is open. */}
			{!isReorderingCards && !CHROME_TABS.has(activeTab) && (
				!isMobileFABMode ? (
					<MobileBottomTabs
						activeTab={activeTab as NavigationTabId}
						onTabChange={navigateToTab}
						isToolbeltOpen={isToolbeltOpen}
						onToggleToolbelt={() => setIsToolbeltOpen((open) => !open)}
						hasSheet={hasSurface}
					/>
				) : (
					<MobileFAB
						activeTab={activeTab as NavigationTabId}
						onTabChange={navigateToTab}
						onOpenDrawer={handleOpenDrawer}
						onOpenMenu={handleOpenMenu}
						onOpenSettings={handleOpenSettings}
						sheetActiveTab={activeTab === 'sheet' ? sheetActiveTab : undefined}
						isToolbeltOpen={isToolbeltOpen}
						isExpanded={isMenuFABExpanded}
						onIsExpandedChange={setIsMenuFABExpanded}
						hasSheet={hasSurface}
						clearsNoteBar={activeTabType === 'note' && isNoteEditing}
					/>
				)
			)}

			{/* Portrait create: the picker + crop stage behind the creator's Portrait row. */}
			<input
				ref={portraitInputRef}
				type="file"
				accept={ACCEPT_IMAGE}
				className="hidden"
				onChange={onPortraitFileSelected}
			/>
			{portraitCropperDialog}

			{/* App-wide dice tray (shared with desktop); overlays any tab, opened from the toolbelt. */}
			<MobileDiceTraySheet />

			{/* Workspace switcher: slides in from the leading edge; a row switch lands back on the sheet. */}
			<MobileWorkspaceSwitcher
				isOpen={isSwitcherOpen}
				onClose={() => setIsSwitcherOpen(false)}
				onSwitched={() => {
					setIsSwitcherOpen(false);
					// Already on the sheet (the only place the switcher opens from): the active character
					// change re-renders it in place, so pushing another 'sheet' entry would just cost a back-press.
					if (activeTab !== 'sheet') navigateToTab('sheet');
				}}
			/>
		</div>
	);
}
