// -- React Imports --
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { IconButton } from '@/components/ui/icon-button';
import { MobileSideSheet } from '@/components/mobile/shared/MobileSideSheet';
import { MobileWorkspaceRow } from '@/components/mobile/character-sheet/MobileWorkspaceRow';

// -- Icon Imports --
import { Plus, X } from 'lucide-react';

// -- Store Imports --
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';
import { useCharacterStore } from '@/lib/stores/characterStore';
import { useTabManagerStore, useTabManagerActions } from '@/lib/character/tabManagerStore';

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
 * The panel pins to the handedness-leading edge and slides in from there. The "New workspace"
 * button is inert here; its chooser is wired separately.
 */
export function MobileWorkspaceSwitcher({ isOpen, onClose, onSwitched }: MobileWorkspaceSwitcherProps) {
	const { t } = useTranslation();
	const isLeftHanded = useAppSettingsStore((state) => state.mobileHandedness) === 'left';
	const side = isLeftHanded ? 'left' : 'right';

	const openTabs = useTabManagerStore((state) => state.openTabs);
	const activeTabId = useTabManagerStore((state) => state.activeTabId);
	const activeCharacterName = useCharacterStore((state) => state.character?.name);
	const { mobileSetActiveTab } = useTabManagerActions();

	const handleSelect = (id: string) => {
		if (id !== activeTabId) void mobileSetActiveTab(id);
		onSwitched();
	};

	// The panel pins to the leading edge, so its horizontal notch inset lives on that edge.
	const insetStyle: CSSProperties =
		side === 'right' ? { paddingRight: 'env(safe-area-inset-right)' } : { paddingLeft: 'env(safe-area-inset-left)' };

	return (
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
							title={rowTitle(tab, tab.id === activeTabId, activeCharacterName, t('Tabs.untitled'))}
							onSelect={() => handleSelect(tab.id)}
						/>
					))}
				</div>

				{/* New workspace: chooser wired separately; inert for now. */}
				<div className="border-t border-border p-2">
					<button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors active:bg-muted/50">
						<span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground">
							<Plus className="h-4 w-4" />
						</span>
						<span className="text-sm font-medium text-foreground">{t('Workspace.newWorkspace')}</span>
					</button>
				</div>
			</div>
		</MobileSideSheet>
	);
}
