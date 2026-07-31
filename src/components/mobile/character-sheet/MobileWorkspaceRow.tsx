// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { Monitor, X } from 'lucide-react';

// -- Constants --
import { getGameVisual } from '@/lib/constants/gameVisuals';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Type Imports --
import type { OpenTab } from '@/lib/character/tabManagerStore';



interface MobileWorkspaceRowProps {
	tab: OpenTab;
	/** Highlights the row that maps to the active tab. */
	isActive: boolean;
	/** Resolved display title (live name for the active tab, else the denormalized one). */
	title: string;
	/** Whether this tab has unsaved work (live for the active tab, denormalized otherwise): shows the dot. */
	isDirty: boolean;
	/** Switches to this tab. Ignored for a desktop-only (board/note) row. */
	onSelect: () => void;
	/** Requests closing this tab. Absent (or on a desktop-only row) hides the close control. */
	onRequestClose?: () => void;
}

/**
 * One open-workspace row: a game crest, the title, and a dirty marker. Character tabs are
 * tappable and carry an active accent; board/note tabs are desktop-only, so a cross-device
 * session renders them greyed and inert with a hint rather than a switchable row.
 */
export function MobileWorkspaceRow({ tab, isActive, title, isDirty, onSelect, onRequestClose }: MobileWorkspaceRowProps) {
	const { t } = useTranslation();

	if (tab.type !== 'character') {
		return (
			<div className="flex items-center gap-3 rounded-lg border-l-2 border-transparent px-3 py-2.5 opacity-50">
				<span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
					<Monitor className="h-4 w-4" />
				</span>
				<span className="min-w-0 flex-1">
					<span className="block truncate text-sm font-medium text-foreground">{title}</span>
					<span className="block text-xs text-muted-foreground">{t('Workspace.desktopOnly')}</span>
				</span>
			</div>
		);
	}

	const visual = getGameVisual(tab.game);
	const CrestIcon = visual.Icon;

	return (
		<div
			className={cn(
				"flex items-center rounded-lg border-l-2 transition-colors",
				isActive ? "border-primary bg-primary/10" : "border-transparent"
			)}
		>
			<button
				onClick={onSelect}
				className="flex min-w-0 flex-1 items-center gap-3 rounded-l-lg py-2.5 pl-3 pr-2 text-left transition-colors active:bg-muted/50"
			>
				<span aria-hidden className={cn("flex size-7 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ring-white/25", visual.gradient)}>
					<CrestIcon className="h-4 w-4 text-white" />
				</span>
				<span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{title}</span>
				{isDirty && <span aria-hidden className="size-2 shrink-0 rounded-full bg-foreground/50" />}
			</button>
			{onRequestClose && (
				<button
					type="button"
					onClick={(event) => { event.stopPropagation(); onRequestClose(); }}
					aria-label={t('Common.close')}
					className="mr-1 shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground active:bg-muted/50"
				>
					<X className="h-4 w-4" />
				</button>
			)}
		</div>
	);
}
