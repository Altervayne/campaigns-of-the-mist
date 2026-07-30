// -- React Imports --
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import {
	Trash2,
	Download,
	FlipVertical,
	TrendingUp,
	TrendingDown,
	ThumbsUp,
	ThumbsDown,
	SplitSquareVertical,
	Edit3,
	Undo2,
	Redo2,
	Save,
   SaveAll,
   CreditCard,
   RectangleEllipsis,
   WalletCards,
   FolderInput,
   Dices,
   Upload,
   RefreshCw,
   LogOut,
   Image as ImageIcon
} from 'lucide-react';

// -- Other Library Imports --
import toast from 'react-hot-toast';
import cuid from 'cuid';

// -- Store Imports --
import { useCharacterActions, useCharacterStore } from '@/lib/stores/characterStore';
import { getActiveCharacterStore } from '@/lib/character/characterStoreRegistry';
import { useDrawerActions, useDrawerStore } from '@/lib/stores/drawerStore';
import { useAppGeneralStateStore } from '@/lib/stores/appGeneralStateStore';
import { useAppSettingsActions } from '@/lib/stores/appSettingsStore';
import { useTabManagerActions } from '@/lib/character/tabManagerStore';

// -- Hook Imports --
import useCharacterTemporalStore from '@/hooks/useCharacterTemporalStore';
import { useSaveToDrawer } from '@/hooks/useSaveToDrawer';

// -- Utils Imports --
import { exportToFile, exportCharacterSheet } from '@/lib/utils/export-import';
import { getDrawerItemDisplayPath } from '@/lib/drawer/drawerItemPath';
import { saveCharacterToLinkedDrawerItem } from '@/lib/character/characterRepository';

// -- Type Imports --
import type { ToolbeltActions, ToolbeltAction, ToolbeltContext } from '@/lib/types/toolbelt';
import type { CardViewMode, Card, Tracker } from '@/lib/types/character';



/**
 * Hook to build action lists for the Toolbelt based on the current context.
 * Returns both item-specific actions (the selected card/tracker) and global ones.
 */
export function useToolbeltActions(context: ToolbeltContext, activeTab?: 'trackers' | 'cards', onSaveToDrawer?: (item: Card | Tracker) => void, onEditCard?: (card: Card) => void, onImportUpdate?: () => void, onEditPortrait?: () => void): ToolbeltActions {
	const { t } = useTranslation();
	const {
		loadCharacter,
		flipCard,
		deleteCard,
		updateCardViewMode,
		removeStatus,
		removeStoryTag,
		removeStoryTheme,
		updateStoryTag,
		upgradeStoryTagToTheme,
		downgradeStoryThemeToTag,
		addStatus,
		addStoryTag,
      addStoryTheme
	} = useCharacterActions();

	const { setCardDialogOpen, setDrawerOpen } = useAppGeneralStateStore((state) => state.actions);

	const { setDiceTrayOpen } = useAppSettingsActions();

	const { initiateItemDrop, reloadCurrentFolder } = useDrawerActions();

	// Workspace actions gate on a loaded character; read it reactively so the group appears/hides in step.
	const character = useCharacterStore((state) => state.character);
	// Save As (a fresh drawer copy) and Unload reuse the shared desktop paths, so mobile can't drift from them.
	const { saveCharacterAsToDrawer } = useSaveToDrawer();
	const { mobileReturnToMenu } = useTabManagerActions();

	const { undo, redo, pastStates, futureStates } = useCharacterTemporalStore(
		(state) => state,
	);
	const canUndo = (pastStates?.length ?? 0) > 1;
	const canRedo = (futureStates?.length ?? 0) > 0;

	return useMemo(() => {
		const itemActions: ToolbeltAction[] = [];
		const globalActions: ToolbeltAction[] = [];

		// Every context action belongs to the Item group; stamp it here so the pushes stay terse.
		const pushItem = (action: Omit<ToolbeltAction, 'group'>) => {
			const stamped: ToolbeltAction = { ...action, group: 'item' };
			itemActions.push(stamped);
		};

		// ==================
		//  Undo/Redo (always visible, grayed when disabled)
		// ==================
		globalActions.push({
			id: 'undo',
			label: t('Toolbelt.undo'),
			icon: Undo2,
			onClick: () => canUndo && undo(),
			group: 'edit',
			show: true,
			keepOpen: true
		});

		globalActions.push({
			id: 'redo',
			label: t('Toolbelt.redo'),
			icon: Redo2,
			onClick: () => canRedo && redo(),
			group: 'edit',
			show: true,
			keepOpen: true
		});

		// ==================
		//  Dice tray (the app-wide tray, shared with desktop; opens the mobile bottom sheet)
		// ==================
		globalActions.push({
			id: 'dice',
			label: t('Toolbelt.dice'),
			icon: Dices,
			onClick: () => setDiceTrayOpen(true),
			group: 'edit',
			show: true
		});

		// ==================
		//  Workspace actions (all require a loaded character)
		// ==================
		globalActions.push({
			id: 'save-character',
			label: t('Toolbelt.saveCharacter'),
			icon: Save,
			group: 'workspace',
			onClick: () => {
				const character = getActiveCharacterStore()?.getState().character;
				if (!character) return;

				// "Save As": create a new drawer item and link it to the character.
				// Also the fallback when an existing link is dangling (item deleted).
				const saveAsNewDrawerItem = () => {
					const newItemId = cuid();
					const characterWithDrawerId = { ...character, drawerItemId: newItemId };
					loadCharacter(character, newItemId);
					setDrawerOpen(true);
					const drawerCurrentFolderId = useDrawerStore.getState().currentFolderId;
					initiateItemDrop({
						game: character.game,
						type: 'FULL_CHARACTER_SHEET',
						content: characterWithDrawerId,
						defaultName: character.name,
						presetId: newItemId,
						parentFolderId: drawerCurrentFolderId ?? undefined,
					});
				};

				if (character.drawerItemId) {
					const savedItemId = character.drawerItemId;
					void (async () => {
						try {
							// Atomic cross-store save: working record + the
							// linked drawer item, in one transaction.
							const { linkedItemUpdated } = await saveCharacterToLinkedDrawerItem(character);
							if (linkedItemUpdated) {
								await reloadCurrentFolder();
								const itemPath = await getDrawerItemDisplayPath(savedItemId);
								toast.success(`${t('Notifications.character.saved')} ${itemPath}`);
							} else {
								// The linked drawer item was deleted: don't silently
								// no-op the user's save, and fall back to Save As + notify.
								saveAsNewDrawerItem();
								toast(t('Notifications.character.linkedItemMissing'));
							}
						} catch {
							toast.error(t('Notifications.drawer.actionFailed'));
						}
					})();
				} else {
					saveAsNewDrawerItem();
				}
			},
			show: !!character
		});

		// Save As: a NEW drawer copy (desktop semantics), not an export to file.
		globalActions.push({
			id: 'save-character-as',
			label: t('Toolbelt.saveCharacterAs'),
			icon: SaveAll,
			group: 'workspace',
			onClick: () => { void saveCharacterAsToDrawer(); },
			show: !!character
		});

		// Export: write the sheet to a `.cotm` file (the old Save-As behavior).
		globalActions.push({
			id: 'export-character',
			label: t('Toolbelt.exportCharacter'),
			icon: Upload,
			group: 'workspace',
			onClick: () => {
				const activeCharacter = getActiveCharacterStore()?.getState().character;
				if (activeCharacter) {
					exportCharacterSheet(activeCharacter);
					toast.success(t('Notifications.character.exported'));
				}
			},
			show: !!character
		});

		// Update from file: replace the current character in place (keeps id + drawer link). Destructive,
		// so the caller owns the confirm gate; disabled when no picker is wired.
		globalActions.push({
			id: 'update-character',
			label: t('Toolbelt.updateCharacter'),
			icon: RefreshCw,
			group: 'workspace',
			onClick: () => onImportUpdate?.(),
			show: !!character && !!onImportUpdate
		});

		// Unload: leave the character and return to the menu (keeps the working row).
		globalActions.push({
			id: 'unload-character',
			label: t('Toolbelt.unloadCharacter'),
			icon: LogOut,
			variant: 'destructive',
			group: 'workspace',
			onClick: () => mobileReturnToMenu(),
			show: !!character
		});

		// ==================
		//  Context-aware Add buttons
		// ==================
		// The cards tab has none: the overview and the card creator (portrait included) are reached from
		// the card nav bar and the overview's own add row.

		// Add trackers (only on trackers tab)
		if (activeTab === 'trackers') {
			globalActions.push({
				id: 'add-status',
				label: t('Toolbelt.addStatus'),
				icon: CreditCard,
				onClick: () => addStatus(),
				group: 'add',
				show: true
			});

			globalActions.push({
				id: 'add-story-tag',
				label: t('Toolbelt.addStoryTag'),
				icon: RectangleEllipsis,
				onClick: () => addStoryTag(),
				group: 'add',
				show: true
			});

			globalActions.push({
				id: 'add-story-theme',
				label: t('Toolbelt.addStoryTheme'),
				icon: WalletCards,
				onClick: () => addStoryTheme(),
				group: 'add',
				show: true
			});
		}

		// No context - return only global actions
		if (context.type === 'none') {
			return {
				itemActions: [],
				globalActions: globalActions.filter(a => a.show)
			};
		}

		// Card actions
		if (context.type === 'card') {
			const card = context.card;

			// ==================
			//  Delete, Flip/ViewMode/Export, Edit
			// ==================

			// Delete action - NOT allowed for CHARACTER_CARD
			if (card.cardType !== 'CHARACTER_CARD') {
				pushItem({
					id: 'delete-card',
					label: t('Toolbelt.delete'),
					icon: Trash2,
					variant: 'destructive',
					onClick: () => deleteCard(card.id),
					show: true
				});
			}

			// Flip card action
			pushItem({
				id: 'flip-card',
				label: t('Toolbelt.flipCard'),
				icon: FlipVertical,
				onClick: () => flipCard(card.id),
				show: true
			});

			// View mode toggle action
			const currentViewMode = card.viewMode;
			const nextViewMode: CardViewMode = currentViewMode === 'FLIP' ? 'SIDE_BY_SIDE' : 'FLIP';
			const viewModeLabel = nextViewMode === 'SIDE_BY_SIDE'
				? (t('Toolbelt.sideBySideMode'))
				: (t('Toolbelt.flipMode'));

			pushItem({
				id: 'toggle-view-mode',
				label: viewModeLabel,
				icon: SplitSquareVertical,
				onClick: () => updateCardViewMode(card.id, nextViewMode),
				show: true
			});

			// Export action
			pushItem({
				id: 'export-card',
				label: t('Toolbelt.export'),
				icon: Download,
				onClick: () => {
					exportToFile(
						card,
						card.cardType,
						card.details.game,
						`${card.cardType}-${card.id}.cotm`
					);
				},
				show: true
			});

			// Save to Drawer action
			pushItem({
				id: 'save-card-to-drawer',
				label: t('Toolbelt.saveToDrawer'),
				icon: FolderInput,
				onClick: () => onSaveToDrawer?.(card),
				show: !!onSaveToDrawer
			});

			// Edit themebook/type action
			if (card.cardType === 'CHARACTER_THEME') {
				pushItem({
					id: 'edit-themebook',
					label: t('Toolbelt.editThemebook'),
					icon: Edit3,
					onClick: () => {
						// Mobile routes through onEditCard (opens MobileAddCard in edit
						// mode for this card); desktop falls back to the card dialog flag.
						if (onEditCard) {
							onEditCard(card);
						} else {
							setCardDialogOpen(true);
						}
					},
					show: true
				});
			}

			// The portrait's own editor (frame aspect, replace, delete). Contextual to the portrait card
			// rather than global: it is a sheet singleton, so it only has a meaning while that card is selected.
			// Deleting it needs nothing special - `delete-card` above already drops any non-character card.
			if (card.cardType === 'IMAGE_CARD') {
				pushItem({
					id: 'edit-portrait',
					label: t('Toolbelt.editPortrait'),
					icon: ImageIcon,
					onClick: () => onEditPortrait?.(),
					show: !!onEditPortrait
				});
			}

			return {
				itemActions: itemActions.filter(a => a.show),
				globalActions: globalActions.filter(a => a.show)
			};
		}

		// Tracker actions
		if (context.type === 'tracker') {
			const tracker = context.tracker;

			// Status tracker actions
			if (tracker.trackerType === 'STATUS') {
				// Delete first
				pushItem({
					id: 'delete-status',
					label: t('Toolbelt.delete'),
					icon: Trash2,
					variant: 'destructive',
					onClick: () => removeStatus(tracker.id),
					show: true
				});

				// Export last
				pushItem({
					id: 'export-status',
					label: t('Toolbelt.export'),
					icon: Download,
					onClick: () => {
						exportToFile(
							tracker,
							'STATUS_TRACKER',
							'NEUTRAL',
							`status-${tracker.id}.cotm`
						);
					},
					show: true
				});

				pushItem({
					id: 'save-status-to-drawer',
					label: t('Toolbelt.saveToDrawer'),
					icon: FolderInput,
					onClick: () => onSaveToDrawer?.(tracker),
					show: !!onSaveToDrawer
				});
			}

			// Story tag tracker actions
			if (tracker.trackerType === 'STORY_TAG') {
				// Delete first
				pushItem({
					id: 'delete-story-tag',
					label: t('Toolbelt.delete'),
					icon: Trash2,
					variant: 'destructive',
					onClick: () => removeStoryTag(tracker.id),
					show: true
				});

				// Toggle positive/negative
				const isWeakness = tracker.isWeakness ?? false;
				pushItem({
					id: 'toggle-story-tag-type',
					label: isWeakness
						? (t('Toolbelt.makePositive'))
						: (t('Toolbelt.makeNegative')),
					icon: isWeakness ? ThumbsUp : ThumbsDown,
					onClick: () => updateStoryTag(tracker.id, { isWeakness: !isWeakness }),
					show: true
				});

				// Upgrade to theme
				pushItem({
					id: 'upgrade-to-theme',
					label: t('Toolbelt.upgradeToTheme'),
					icon: TrendingUp,
					onClick: () => upgradeStoryTagToTheme(tracker.id),
					show: true
				});

				// Export last
				pushItem({
					id: 'export-story-tag',
					label: t('Toolbelt.export'),
					icon: Download,
					onClick: () => {
						exportToFile(
							tracker,
							'STORY_TAG_TRACKER',
							'NEUTRAL',
							`story-tag-${tracker.id}.cotm`
						);
					},
					show: true
				});

				pushItem({
					id: 'save-story-tag-to-drawer',
					label: t('Toolbelt.saveToDrawer'),
					icon: FolderInput,
					onClick: () => onSaveToDrawer?.(tracker),
					show: !!onSaveToDrawer
				});
			}

			// Story theme tracker actions
			if (tracker.trackerType === 'STORY_THEME') {
				// Delete first
				pushItem({
					id: 'delete-story-theme',
					label: t('Toolbelt.delete'),
					icon: Trash2,
					variant: 'destructive',
					onClick: () => removeStoryTheme(tracker.id),
					show: true
				});

				// Downgrade to tag
				pushItem({
					id: 'downgrade-to-tag',
					label: t('Toolbelt.downgradeToTag'),
					icon: TrendingDown,
					onClick: () => downgradeStoryThemeToTag(tracker.id),
					show: true
				});

				// Export last
				pushItem({
					id: 'export-story-theme',
					label: t('Toolbelt.export'),
					icon: Download,
					onClick: () => {
						exportToFile(
							tracker,
							'STORY_THEME_TRACKER',
							'NEUTRAL',
							`story-theme-${tracker.id}.cotm`
						);
					},
					show: true
				});

				pushItem({
					id: 'save-story-theme-to-drawer',
					label: t('Toolbelt.saveToDrawer'),
					icon: FolderInput,
					onClick: () => onSaveToDrawer?.(tracker),
					show: !!onSaveToDrawer
				});
			}

			return {
				itemActions: itemActions.filter(a => a.show),
				globalActions: globalActions.filter(a => a.show)
			};
		}

		return {
			itemActions: [],
			globalActions: globalActions.filter(a => a.show)
		};
	}, [
		context,
		activeTab,
		t,
		canUndo,
		canRedo,
		undo,
		redo,
		loadCharacter,
		flipCard,
		deleteCard,
		updateCardViewMode,
		removeStatus,
		removeStoryTag,
		removeStoryTheme,
		updateStoryTag,
		upgradeStoryTagToTheme,
		downgradeStoryThemeToTag,
		addStatus,
		addStoryTag,
		addStoryTheme,
		setCardDialogOpen,
		setDiceTrayOpen,
		initiateItemDrop,
		reloadCurrentFolder,
		setDrawerOpen,
		character,
		saveCharacterAsToDrawer,
		mobileReturnToMenu,
		onSaveToDrawer,
		onEditCard,
		onImportUpdate,
		onEditPortrait,
	]);
}
