// -- React Imports --
import type { CSSProperties } from 'react';
import { useCallback, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { MobileSideSheet } from '@/components/mobile/shared/MobileSideSheet';
import { MobileBottomSheet } from '@/components/mobile/shared/MobileBottomSheet';
import { MobileWorkspaceRow } from '@/components/mobile/character-sheet/MobileWorkspaceRow';
import { MobileWorkspaceChooser } from '@/components/mobile/menu/MobileWorkspaceChooser';

// -- Icon Imports --
import { Plus, X } from 'lucide-react';

// -- Store Imports --
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';
import { useCharacterStore } from '@/lib/stores/characterStore';
import { useTabManagerStore, useTabManagerActions } from '@/lib/character/tabManagerStore';
import { useActiveNoteInstance } from '@/lib/notes/ActiveNoteStoreContext';

// -- Type Imports --
import type { OpenTab } from '@/lib/character/tabManagerStore';



interface MobileWorkspaceSwitcherProps {
	isOpen: boolean;
	onClose: () => void;
	/** Fired after a row switches the active tab, so the page can close and land on the sheet. */
	onSwitched: () => void;
}

/** The active tab shows its live name; a cold tab falls back to its denormalized title, then a placeholder. */
function rowTitle(tab: OpenTab, isActive: boolean, activeName: string | undefined, untitled: string): string {
	if (isActive && activeName && activeName.trim().length > 0) return activeName;
	if (tab.title && tab.title.trim().length > 0) return tab.title;
	return untitled;
}

/**
 * Slide-in panel listing the open workspaces. A character row switches to that tab (lossless
 * keep-alive via `mobileSetActiveTab`); board/note tabs are desktop-only and render inert.
 * The panel pins to the handedness-leading edge and slides in from there. "New workspace" opens
 * the shared chooser in a bottom sheet (the mobile equivalent of desktop's NewTabDialog).
 */
export function MobileWorkspaceSwitcher({ isOpen, onClose, onSwitched }: MobileWorkspaceSwitcherProps) {
	const { t } = useTranslation();
	const isLeftHanded = useAppSettingsStore((state) => state.mobileHandedness) === 'left';
	const side = isLeftHanded ? 'left' : 'right';

	const openTabs = useTabManagerStore((state) => state.openTabs);
	const activeTabId = useTabManagerStore((state) => state.activeTabId);
	const activeCharacterName = useCharacterStore((state) => state.character?.name);
	const activeDirty = useCharacterStore((state) => state.hasUnsavedChanges);
	const { mobileSetActiveTab, mobileCloseTab } = useTabManagerActions();

	// The active note's live dirtiness lives in its own store (its keystrokes outrun the denormalized flag).
	// Null when the active tab is not a note. Subscribed via the maybe-null active-note instance.
	const activeNoteStore = useActiveNoteInstance();
	const subscribeNoteDirty = useCallback(
		(onChange: () => void) => (activeNoteStore ? activeNoteStore.subscribe(onChange) : () => {}),
		[activeNoteStore],
	);
	const readNoteDirty = useCallback(
		() => (activeNoteStore ? activeNoteStore.getState().hasUnsavedChanges : null),
		[activeNoteStore],
	);
	const activeNoteDirty = useSyncExternalStore(subscribeNoteDirty, readNoteDirty);

	// Whether the active note is drawer-backed (saved). A drawer-backed note keeps its drawer copy when its tab
	// closes, so it reaps like a character rather than being deleted - the close confirm says so. Only known for
	// the active note (the denorm carries no link), so a background note tab falls back to the delete copy.
	const readNoteDrawerBacked = useCallback(
		() => (activeNoteStore ? activeNoteStore.getState().drawerItemId != null : null),
		[activeNoteStore],
	);
	const activeNoteDrawerBacked = useSyncExternalStore(subscribeNoteDirty, readNoteDrawerBacked);

	const [isChooserOpen, setIsChooserOpen] = useState(false);
	const [pendingClose, setPendingClose] = useState<OpenTab | null>(null);

	// The active tab's dirtiness is read live (its edits outrun the denormalized flag): a character from the
	// character store, a note from its own store. Every other tab uses its denormalized flag, and an unknown
	// (never-refreshed cross-device) tab is treated as possibly-dirty.
	const isTabDirty = (tab: OpenTab): boolean => {
		if (tab.id === activeTabId) {
			if (tab.type === 'character') return activeDirty;
			if (tab.type === 'note') return activeNoteDirty ?? (tab.dirty ?? true);
		}
		return tab.dirty ?? true;
	};

	const handleSelect = (id: string) => {
		if (id !== activeTabId) void mobileSetActiveTab(id);
		onSwitched();
	};

	// Reap the tab after the confirm, then dismiss the switcher if it was the last one (nothing left to switch).
	const handleConfirmClose = () => {
		const id = pendingClose?.id;
		setPendingClose(null);
		if (!id) return;
		void mobileCloseTab(id).then(() => {
			if (useTabManagerStore.getState().openTabs.length === 0) onClose();
		});
	};

	// A create/import from the chooser appends + activates a resident tab; dismiss the chooser and
	// hand off to the host, which closes the switcher and lands on the new sheet.
	const handleCreated = () => {
		setIsChooserOpen(false);
		onSwitched();
	};

	// Close confirm copy, by kind. A drawer-less note (never saved) is deleted outright on close, so its body
	// says so plainly. A drawer-backed note keeps its drawer copy, so it reaps like a character and shares the
	// character copy (unsaved edits lost, or reopen from drawer). The title stays note-specific either way.
	const pendingDirty = pendingClose ? isTabDirty(pendingClose) : false;
	const pendingNoteDeletes =
		pendingClose?.type === 'note' && !(pendingClose.id === activeTabId && activeNoteDrawerBacked === true);
	const confirmTitle = pendingClose?.type === 'note' ? t('Workspace.closeNoteConfirmTitle') : t('Workspace.closeConfirmTitle');
	const confirmBody = pendingNoteDeletes
		? (pendingDirty ? t('Workspace.closeNoteConfirmDirtyBody') : t('Workspace.closeNoteConfirmCleanBody'))
		: (pendingDirty ? t('Workspace.closeConfirmDirtyBody') : t('Workspace.closeConfirmCleanBody'));

	// The panel pins to the leading edge, so its horizontal notch inset lives on that edge.
	const insetStyle: CSSProperties =
		side === 'right' ? { paddingRight: 'env(safe-area-inset-right)' } : { paddingLeft: 'env(safe-area-inset-left)' };

	return (
		<>
			<MobileSideSheet isOpen={isOpen} onClose={onClose} side={side}>
				<div className="flex h-full flex-col pt-safe pb-safe" style={insetStyle}>
					{/* Header */}
					<div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
						<h2 className="text-lg font-semibold text-foreground">{t('Workspace.switcherTitle')}</h2>
						<IconButton variant="ghost" size="sm" onClick={onClose} aria-label={t('Common.close')}>
							<X className="h-5 w-5" />
						</IconButton>
					</div>

					{/* Open workspaces */}
					<div className="flex-1 space-y-1 overflow-y-auto p-2">
						{openTabs.map((tab) => (
							<MobileWorkspaceRow
								key={tab.id}
								tab={tab}
								isActive={tab.id === activeTabId}
								title={rowTitle(tab, tab.id === activeTabId, activeCharacterName, tab.type === 'note' ? t('Common.untitledNote') : t('Tabs.untitled'))}
								isDirty={isTabDirty(tab)}
								onSelect={() => handleSelect(tab.id)}
								onRequestClose={tab.type === 'character' || tab.type === 'note' ? () => setPendingClose(tab) : undefined}
							/>
						))}
					</div>

					{/* New workspace: opens the shared chooser in a bottom sheet. */}
					<div className="border-t border-border p-2">
						<button
							onClick={() => setIsChooserOpen(true)}
							className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors active:bg-muted/50"
						>
							<span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground">
								<Plus className="h-4 w-4" />
							</span>
							<span className="text-sm font-medium text-foreground">{t('Workspace.newWorkspace')}</span>
						</button>
					</div>
				</div>
			</MobileSideSheet>

			{/* Creator sheet: the shared chooser, sheet-wrapped (mobile's NewTabDialog). Kept a SIBLING of the
			    side sheet, not a child, so its full-screen `fixed` layers anchor to the viewport rather than the
			    side panel's transformed box. A create/import lands on the new sheet. */}
			<MobileBottomSheet isOpen={isChooserOpen} onClose={() => setIsChooserOpen(false)} fullHeight>
				<div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
					<h2 className="text-lg font-semibold text-foreground">{t('Workspace.newWorkspace')}</h2>
					<IconButton variant="ghost" size="sm" onClick={() => setIsChooserOpen(false)} aria-label={t('Common.close')}>
						<X className="h-5 w-5" />
					</IconButton>
				</div>
				<MobileWorkspaceChooser onCreated={handleCreated} />
			</MobileBottomSheet>

			{/* Close confirm: dirty-aware. A SIBLING at the same overlay layer, later in DOM, so it paints above
			    the side sheet. Kept a quick Cancel/Close - the toolbelt's Save-&-Close handles the active sheet. */}
			<MobileBottomSheet isOpen={pendingClose !== null} onClose={() => setPendingClose(null)}>
				<div className="space-y-4 px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
					<div className="space-y-1">
						<h2 className="text-lg font-semibold text-foreground">{confirmTitle}</h2>
						<p className="text-sm text-muted-foreground">{confirmBody}</p>
					</div>
					<div className="flex gap-2">
						<Button variant="outline" className="flex-1" onClick={() => setPendingClose(null)}>{t('Common.cancel')}</Button>
						<Button variant="destructive" className="flex-1" onClick={handleConfirmClose}>{t('Common.close')}</Button>
					</div>
				</div>
			</MobileBottomSheet>
		</>
	);
}
