// -- Library Imports --
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import ToolbeltBottomSheet from '@/components/mobile/toolbelt/ToolbeltBottomSheet';
import ToolbeltFAB from '@/components/mobile/toolbelt/ToolbeltFAB';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

// -- Hook Imports --
import { useToolbeltActions } from '@/hooks/useToolbeltActions';
import { useCharacterUpdateFromFile } from '@/hooks/useCharacterUpdateFromFile';

// -- Type Imports --
import type { ToolbeltMode, ToolbeltContext } from '@/lib/types/toolbelt';
import type { Card, Tracker } from '@/lib/types/character';

type SheetTab = 'trackers' | 'cards';

interface MobileToolbeltProps {
	mode: ToolbeltMode;
	context: ToolbeltContext;
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	activeTab?: SheetTab;
	isMenuFABExpanded?: boolean;
	onSaveToDrawer?: (item: Card | Tracker) => void;
	onEditCard?: (card: Card) => void;
	onEditPortrait?: () => void;
}

export default function MobileToolbelt({
	mode,
	context,
	isOpen,
	onOpenChange,
	activeTab,
	isMenuFABExpanded,
	onSaveToDrawer,
	onEditCard,
	onEditPortrait
}: MobileToolbeltProps) {
	const { t } = useTranslation();

	// The Workspace "Update from file" action owns its file picker + destructive confirm here, so both
	// toolbelt modes share one gate (mirrors the desktop update-in-place flow).
	const { triggerImport, pendingUpdate, confirmUpdate, cancelUpdate } = useCharacterUpdateFromFile();

	// Build action lists based on context and active tab
	const { itemActions, globalActions } = useToolbeltActions(context, activeTab, onSaveToDrawer, onEditCard, triggerImport, onEditPortrait);

	// Render appropriate UI based on mode. In side-panel mode the actions are now
	// presented as a compact bottom sheet (it no longer covers the selected item).
	return (
		<>
			{mode === 'side-panel' ? (
				<ToolbeltBottomSheet
					isOpen={isOpen}
					onOpenChange={onOpenChange}
					itemActions={itemActions}
					globalActions={globalActions}
				/>
			) : (
				<ToolbeltFAB
					isOpen={isOpen}
					onOpenChange={onOpenChange}
					itemActions={itemActions}
					globalActions={globalActions}
					activeTab={activeTab}
					isMenuFABExpanded={isMenuFABExpanded}
				/>
			)}

			{/* Update-from-file confirm gate: the last step before the destructive replace-in-place. */}
			<AlertDialog open={pendingUpdate !== null} onOpenChange={(open) => { if (!open) cancelUpdate(); }}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t('CharacterSheetPage.SidebarMenu.updateCharacterConfirmTitle')}</AlertDialogTitle>
						<AlertDialogDescription>{t('CharacterSheetPage.SidebarMenu.updateCharacterConfirmDescription')}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel className="cursor-pointer">{t('CharacterSheetPage.SidebarMenu.updateConfirmCancelButton')}</AlertDialogCancel>
						<AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer" onClick={confirmUpdate}>{t('CharacterSheetPage.SidebarMenu.updateConfirmButton')}</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
