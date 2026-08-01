// -- React Imports --
import type { CSSProperties, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';

// -- Component Imports --
import { Button } from '@/components/ui/button';
import { MobileMainMenuGameCard } from '@/components/mobile/menu/MobileMainMenuGameCard';

// -- Icon Imports --
import { Plus, Import, NotebookPen } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { importFromFile } from '@/lib/utils/export-import';
import { harmonizeData } from '@/lib/harmonization';
import { ACCEPT_ENTITY_IMPORT } from '@/lib/utils/fileAccept';

// -- Constants --
import { GAME_VISUALS, GAME_CARD_OPTIONS, NOTE_VISUAL } from '@/lib/constants/gameVisuals';

// -- Store Imports --
import { useAppSettingsStore, useAppSettingsActions } from '@/lib/stores/appSettingsStore';
import { useTabManagerActions, useTabManagerStore } from '@/lib/character/tabManagerStore';

// -- Autofocus Seam --
import { markNoteJustCreated } from '@/lib/notes/noteAutofocus';

// -- Type Imports --
import type { GameSystem } from '@/lib/types/drawer';
import type { Character } from '@/lib/types/character';

interface MobileWorkspaceChooserProps {
	/** Fired after a new/imported character becomes a resident tab, so the host can surface it or close. */
	onCreated?: () => void;
	/** Content rendered above the game list, inside the scroll region (the menu supplies its hero here). */
	header?: ReactNode;
	/** Extra inline style for the pinned action footer, e.g. FAB-clearance bottom padding. */
	footerStyle?: CSSProperties;
}

/**
 * The workspace creator shared by the mobile main menu (rendered inline as the zero-state home) and the
 * workspace switcher (sheet-wrapped from its "New workspace" button). Pick a game, then Create or Import;
 * each opens a NEW resident tab (keep-alive) and fires {@link MobileWorkspaceChooserProps.onCreated}. The
 * game grid scrolls; the actions pin to the bottom so they stay reachable regardless of list length.
 */
export function MobileWorkspaceChooser({ onCreated, header, footerStyle }: MobileWorkspaceChooserProps) {
	const { t } = useTranslation();
	const contextualGame = useAppSettingsStore((state) => state.contextualGame);
	const { setContextualGame } = useAppSettingsActions();
	const { mobileCreateCharacterTab, mobileImportCharacterTab, mobileCreateNoteTab } = useTabManagerActions();

	const handleCreateCharacter = () => {
		mobileCreateCharacterTab(contextualGame);
		onCreated?.();
	};

	const handleImportCharacter = () => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = ACCEPT_ENTITY_IMPORT;
		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file) return;
			try {
				const importedData = await importFromFile(file);
				if (importedData.fileType !== 'FULL_CHARACTER_SHEET') {
					toast.error(t('Notifications.general.importFailed'));
					return;
				}
				const character = harmonizeData(importedData.content, importedData.fileType) as Character;
				mobileImportCharacterTab(character);
				onCreated?.();
			} catch (error) {
				console.error('Failed to import character file:', error);
				toast.error(t('Notifications.general.importFailed'));
			}
		};
		input.click();
	};

	// Icon/color/gradient come from the shared GAME_VISUALS, the same source the desktop menu uses,
	// so every surface stays in sync (and Otherscape is the circuit board).
	const gameOptions = GAME_CARD_OPTIONS.map(({ game, titleKey, subtitleKey }) => {
		const { Icon, accentText, gradient } = GAME_VISUALS[game];
		return {
			game,
			title: t(titleKey),
			subtitle: t(subtitleKey),
			icon: <Icon className={cn('h-6 w-6', accentText)} />,
			gradient,
		};
	});

	const handleGameSelect = (game: GameSystem) => {
		setContextualGame(game);
	};

	// The just-created note becomes the active tab; mark it so its surface autofocuses the body on first mount.
	const handleCreateNote = async () => {
		await mobileCreateNoteTab();
		markNoteJustCreated(useTabManagerStore.getState().activeTabId);
		onCreated?.();
	};

	return (
		<div className="flex flex-1 min-h-0 flex-col">
			{/* Scroll region: the header (when present) scrolls together with the game list so
			    short viewports get more room. `min-h-0` lets this flex child shrink and scroll. */}
			<div className="flex-1 min-h-0 overflow-y-auto">
				{header}
				{/* Game Selection - `pt-2` gives the selected card's ring (`ring-4`) room so its halo is not clipped.
				    Headed by its type category; the game-agnostic workspace category follows below. */}
				<div className="px-6 pt-2 pb-6">
					<h3 className="mb-3 text-sm font-semibold text-muted-foreground">{t('Tabs.newTabDialog.characterSheetType')}</h3>
					<div className="space-y-3">
						{gameOptions.map((option, index) => (
							<motion.div
								key={option.game}
								initial={{ opacity: 0, x: -20 }}
								animate={{ opacity: 1, x: 0 }}
								transition={{ delay: 0.1 * (index + 1), duration: 0.3 }}
							>
								<MobileMainMenuGameCard
									{...option}
									isSelected={contextualGame === option.game}
									onClick={() => handleGameSelect(option.game)}
								/>
							</motion.div>
						))}
					</div>

					{/* The second type category: game-agnostic workspaces. Notes are the first to reach mobile;
					    the card uses the shared NOTE_VISUAL so it matches the game cards and the desktop picker. */}
					<h3 className="mb-3 mt-6 text-sm font-semibold text-muted-foreground">{t('Tabs.newTabDialog.workspaceType')}</h3>
					<motion.div
						initial={{ opacity: 0, x: -20 }}
						animate={{ opacity: 1, x: 0 }}
						transition={{ delay: 0.1 * (gameOptions.length + 1), duration: 0.3 }}
					>
						<MobileMainMenuGameCard
							title={t('Tabs.newTabDialog.newNoteTitle')}
							subtitle={t('Tabs.newTabDialog.newNoteSubtitle')}
							icon={<NotebookPen className={cn('h-6 w-6', NOTE_VISUAL.accentText)} />}
							gradient={NOTE_VISUAL.gradient}
							isSelected={false}
							onClick={handleCreateNote}
						/>
					</motion.div>
				</div>
			</div>

			{/* Action Buttons - pinned below the scroll region so they stay reachable regardless of list length. */}
			<motion.div
				initial={{ opacity: 0, y: 20 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ delay: 0.5, duration: 0.3 }}
				className="p-6 border-t border-border bg-background space-y-3"
				style={footerStyle}
			>
				<Button
					onClick={handleCreateCharacter}
					size="lg"
					className="w-full gap-2 h-12 text-base font-semibold shadow-lg"
				>
					<Plus className="h-5 w-5" />
					{t('MainMenu.createButton')}
				</Button>
				<Button
					onClick={handleImportCharacter}
					variant="outline"
					size="lg"
					className="w-full gap-2 h-12 text-base font-semibold"
				>
					<Import className="h-5 w-5" />
					{t('MainMenu.importButton')}
				</Button>
			</motion.div>
		</div>
	);
}
