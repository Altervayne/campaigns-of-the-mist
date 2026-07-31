// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { Monitor } from 'lucide-react';

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
	/** Switches to this tab. Ignored for a desktop-only (board/note) row. */
	onSelect: () => void;
}

/**
 * One open-workspace row: a game crest, the title, and a dirty marker. Character tabs are
 * tappable and carry an active accent; board/note tabs are desktop-only, so a cross-device
 * session renders them greyed and inert with a hint rather than a switchable row.
 */
export function MobileWorkspaceRow({ tab, isActive, title, onSelect }: MobileWorkspaceRowProps) {
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
		<button
			onClick={onSelect}
			className={cn(
				"flex w-full items-center gap-3 rounded-lg border-l-2 px-3 py-2.5 text-left transition-colors",
				isActive ? "border-primary bg-primary/10" : "border-transparent active:bg-muted/50"
			)}
		>
			<span aria-hidden className={cn("flex size-7 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ring-white/25", visual.gradient)}>
				<CrestIcon className="h-4 w-4 text-white" />
			</span>
			<span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{title}</span>
			{tab.dirty && <span aria-hidden className="size-2 shrink-0 rounded-full bg-foreground/50" />}
		</button>
	);
}
