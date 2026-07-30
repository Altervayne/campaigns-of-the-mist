// -- Library Imports --
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { MobileSheetModeToggle } from '@/components/mobile/character-sheet/MobileSheetModeToggle';

// -- Utils Imports --
import { cn } from '@/lib/utils';



type SheetTab = 'trackers' | 'cards';

interface MobileCharacterSheetTabBarProps {
	activeTab: SheetTab;
	onTabChange: (tab: SheetTab) => void;
	cardCount: number;
}

/**
 * The trackers/cards tab bar for the mobile character sheet. Renders the two tab
 * buttons (the cards tab showing a count badge) plus the Edit toggle on the trailing
 * edge - the sheet's only global in-flow row, so a sheet-wide mode belongs here
 * rather than in either tab's own chrome. Active tab, counts, and the change
 * callback all come from the sheet; the mode toggle owns its own state.
 *
 * The toolbelt trigger no longer lives here: in tabs-and-menus mode it is the
 * dedicated Toolbelt button in the bottom navigation bar.
 */
export function MobileCharacterSheetTabBar({ activeTab, onTabChange, cardCount }: MobileCharacterSheetTabBarProps) {
	const { t } = useTranslation();

	return (
		<div className="flex items-center border-b border-border bg-card">
			<button
				onClick={() => onTabChange('trackers')}
				data-tutorial="trackers-tab"
				className={cn(
					"flex-1 px-3 py-3 text-sm font-medium transition-colors",
					"border-b-2",
					activeTab === 'trackers'
						? "border-primary text-primary bg-primary/5"
						: "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
				)}
			>
				{t('MobileCharacterSheet.trackersTab')}
			</button>
			<button
				onClick={() => onTabChange('cards')}
				data-tutorial="cards-tab"
				className={cn(
					"flex-1 px-3 py-3 text-sm font-medium transition-colors",
					"border-b-2",
					activeTab === 'cards'
						? "border-primary text-primary bg-primary/5"
						: "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
				)}
			>
				{t('MobileCharacterSheet.cardsTab')}
				{cardCount > 0 && (
					<span className="ml-2 text-xs text-muted-foreground">
						({cardCount})
					</span>
				)}
			</button>
			<MobileSheetModeToggle />
		</div>
	);
}
