// -- Library Imports --
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import ToolbeltBottomSheet from '@/components/mobile/toolbelt/ToolbeltBottomSheet';
import ToolbeltFAB from '@/components/mobile/toolbelt/ToolbeltFAB';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

// -- Hook Imports --
import { useToolbeltActions } from '@/hooks/useToolbeltActions';
import { useCharacterUpdateFromFile } from '@/hooks/useCharacterUpdateFromFile';
import { useCloseSheet } from '@/hooks/useCloseSheet';

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

	// Close Sheet routes through a dirty/link-aware confirm here, so both toolbelt modes share the one gate.
	const { pendingClose, variant: closeVariant, requestClose, cancelClose, close, saveAndClose, saveToDrawer } = useCloseSheet();

	// Build action lists based on context and active tab
	const { itemActions, globalActions } = useToolbeltActions(context, activeTab, onSaveToDrawer, onEditCard, triggerImport, onEditPortrait, requestClose);

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
						<AlertDialogTitle>{t('WorkspacePage.SidebarMenu.updateCharacterConfirmTitle')}</AlertDialogTitle>
						<AlertDialogDescription>{t('WorkspacePage.SidebarMenu.updateCharacterConfirmDescription')}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel className="cursor-pointer">{t('Common.cancel')}</AlertDialogCancel>
						<AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer" onClick={confirmUpdate}>{t('WorkspacePage.SidebarMenu.updateConfirmButton')}</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Close Sheet confirm gate: dirty/link-aware so it never closes over unsaved work silently. */}
			<AlertDialog open={pendingClose} onOpenChange={(open) => { if (!open) cancelClose(); }}>
				<AlertDialogContent>
					{closeVariant === 'clean' ? (
						<>
							<AlertDialogHeader>
								<AlertDialogTitle>{t('Toolbelt.closeSheetConfirmTitle')}</AlertDialogTitle>
								<AlertDialogDescription>{t('Toolbelt.closeSheetConfirmDescription')}</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel className="cursor-pointer">{t('Toolbelt.closeSheetConfirmCancelButton')}</AlertDialogCancel>
								<AlertDialogAction className="cursor-pointer" onClick={close}>{t('Toolbelt.closeSheetConfirmButton')}</AlertDialogAction>
							</AlertDialogFooter>
						</>
					) : closeVariant === 'dirty-linked' ? (
						<>
							<AlertDialogHeader>
								<AlertDialogTitle>{t('Toolbelt.closeSheetDirtyTitle')}</AlertDialogTitle>
								<AlertDialogDescription>{t('Toolbelt.closeSheetDirtyDescription')}</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel className="cursor-pointer">{t('Toolbelt.closeSheetConfirmCancelButton')}</AlertDialogCancel>
								<AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer" onClick={close}>{t('Toolbelt.closeWithoutSaving')}</AlertDialogAction>
								<AlertDialogAction className="cursor-pointer" onClick={() => { void saveAndClose(); }}>{t('Toolbelt.closeSheetSaveAndCloseButton')}</AlertDialogAction>
							</AlertDialogFooter>
						</>
					) : (
						<>
							<AlertDialogHeader>
								<AlertDialogTitle>{t('Toolbelt.closeSheetUnsavedTitle')}</AlertDialogTitle>
								<AlertDialogDescription>{t('Toolbelt.closeSheetUnsavedDescription')}</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel className="cursor-pointer">{t('Toolbelt.closeSheetConfirmCancelButton')}</AlertDialogCancel>
								<AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer" onClick={close}>{t('Toolbelt.closeWithoutSaving')}</AlertDialogAction>
								<AlertDialogAction className="cursor-pointer" onClick={saveToDrawer}>{t('Toolbelt.closeSheetUnsavedSaveButton')}</AlertDialogAction>
							</AlertDialogFooter>
						</>
					)}
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
