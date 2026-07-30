// -- Library Imports --
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { Button } from '@/components/ui/button';
import { MobileBottomSheet } from '@/components/mobile/shared/MobileBottomSheet';

// -- Icon Imports --
import { X } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Type Imports --
import type { ToolbeltAction, ToolbeltGroup } from '@/lib/types/toolbelt';



interface ToolbeltBottomSheetProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	itemActions: ToolbeltAction[];
	globalActions: ToolbeltAction[];
}

/**
 * The side-panel-mode toolbelt presented as a compact bottom sheet.
 *
 * Replaces the old full-height side panel, which slid in over the very
 * tracker/card it acts on. Sliding up from the bottom instead keeps the selected
 * item visible above the sheet and puts the action tiles in the thumb zone. The
 * actions are laid out as a three-column grid of icon-over-label tiles, grouped
 * into the item-specific section (shown only when the context supplies item
 * actions) and the always-present global section. Tapping a tile runs its action
 * and closes the sheet, unless the action sets `keepOpen` (undo/redo, run repeatedly
 * in a row). The grid scrolls within a capped height for long action lists, and the
 * content clears the home indicator via the `pb-safe` utility.
 *
 * Built on the shared {@link MobileBottomSheet} scaffold (backdrop + slide), so
 * this component owns only the toolbelt-specific chrome and tile layout. The
 * `data-tutorial="toolbelt"` anchor is preserved for the mobile tour.
 *
 * The tiles are split into labelled sections by their `group` (Item · Edit · Add ·
 * Workspace). A section renders only when it has tiles, and a lone tile is folded
 * into a neighbour so no header ever sits over a single tile.
 *
 * @param isOpen - Whether the sheet is shown.
 * @param onOpenChange - Called with `false` to close (backdrop tap, close button, or after running an action).
 * @param itemActions - Context-specific actions for the selected card/tracker (may be empty).
 * @param globalActions - Always-present global actions (undo/redo/edit/save/...).
 */
export default function ToolbeltBottomSheet({
	isOpen,
	onOpenChange,
	itemActions,
	globalActions,
}: ToolbeltBottomSheetProps) {
	const { t } = useTranslation();

	// Ordered, labelled groups. Item leads (when the context supplies it), then the
	// edit/add/workspace groups follow in a stable order.
	const groupOrder: { group: ToolbeltGroup; label: string }[] = [
		{ group: 'item', label: t('Toolbelt.itemSection') },
		{ group: 'edit', label: t('Toolbelt.editSection') },
		{ group: 'add', label: t('Toolbelt.addSection') },
		{ group: 'workspace', label: t('Toolbelt.workspaceSection') },
	];

	const allActions = [...itemActions, ...globalActions];
	const populated = groupOrder
		.map(({ group, label }) => ({ label, actions: allActions.filter((a) => a.group === group) }))
		.filter((section) => section.actions.length > 0);

	// Fold any lone tile into a neighbour so a header never sits over a single tile
	// (e.g. a one-tile Add folds back under Edit). Absorbs backwards where possible.
	const sections: { label: string; actions: ToolbeltAction[] }[] = [];
	for (const section of populated) {
		const prev = sections[sections.length - 1];
		if (section.actions.length === 1 && prev) {
			prev.actions = [...prev.actions, ...section.actions];
		} else {
			sections.push({ label: section.label, actions: [...section.actions] });
		}
	}
	// A lone leading tile has no previous section to absorb it; fold it forward instead.
	if (sections.length > 1 && sections[0].actions.length === 1) {
		sections[1].actions = [...sections[0].actions, ...sections[1].actions];
		sections.shift();
	}

	const renderTile = (action: ToolbeltAction) => {
		const Icon = action.icon;
		return (
			<button
				key={action.id}
				data-tutorial={action.tutorialAnchor}
				onClick={() => {
					action.onClick();
					if (!action.keepOpen) onOpenChange(false);
				}}
				className={cn(
					"flex flex-col items-center justify-center gap-1.5 rounded-lg p-2 min-h-20 text-center transition-colors",
					action.variant === 'destructive'
						? "text-destructive hover:bg-destructive/10"
						: "text-foreground hover:bg-accent"
				)}
			>
				<Icon className="h-6 w-6 shrink-0" />
				<span className="text-xs font-medium leading-tight">{action.label}</span>
			</button>
		);
	};

	return (
		<MobileBottomSheet isOpen={isOpen} onClose={() => onOpenChange(false)}>
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-3 border-b border-border">
				<h2 className="text-lg font-semibold">{t('Toolbelt.title')}</h2>
				<Button
					variant="ghost"
					size="sm"
					onClick={() => onOpenChange(false)}
					className="h-11 w-11 p-0"
				>
					<X className="h-5 w-5" />
				</Button>
			</div>

			{/* Action tiles, one labelled section per populated group */}
			<div
				data-tutorial="toolbelt"
				className="max-h-[55vh] overflow-y-auto p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] space-y-4"
			>
				{sections.map((section) => (
					<div key={section.label}>
						<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 pb-2">
							{section.label}
						</h3>
						<div className="grid grid-cols-3 gap-2">
							{section.actions.map(renderTile)}
						</div>
					</div>
				))}
			</div>
		</MobileBottomSheet>
	);
}
