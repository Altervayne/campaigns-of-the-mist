// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { Home, FolderOpen, MoreHorizontal, Wrench } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

type TabId = 'sheet' | 'drawer' | 'menu';

interface MobileBottomTabsProps {
	activeTab: TabId;
	onTabChange: (tab: TabId) => void;
	/** Whether the toolbelt side-panel is currently open. */
	isToolbeltOpen: boolean;
	/** Toggles the toolbelt side-panel open/closed. */
	onToggleToolbelt: () => void;
	/** Whether the sheet slot holds a surface (a character OR a note); the Sheet tab + toolbelt grey out when false. */
	hasSheet?: boolean;
}

export default function MobileBottomTabs({ activeTab, onTabChange, isToolbeltOpen, onToggleToolbelt, hasSheet = true }: MobileBottomTabsProps) {
	const { t } = useTranslation();

	// The toolbelt acts on the active workspace surface (a character sheet OR a note), so its trigger is
	// available whenever the sheet slot holds one.
	const isToolbeltAvailable = activeTab === 'sheet' && hasSheet;

	const tabs = [
		{
			id: 'sheet' as TabId,
			label: t('Common.workspace'),
			icon: Home,
		},
		{
			id: 'drawer' as TabId,
			label: t('Common.drawer'),
			icon: FolderOpen,
		},
		{
			id: 'menu' as TabId,
			label: t('Common.menu'),
			icon: MoreHorizontal,
		},
	];

	return (
		<div className="shrink-0 bg-card border-t border-border pb-safe" data-tutorial="bottom-tabs">
			<div className="flex items-center justify-around h-16">
				{tabs.map((tab) => {
					const Icon = tab.icon;
					const isActive = activeTab === tab.id;
					// With no character loaded there is no sheet to open; grey the tab but keep
					// it present so it reads as "not now" rather than a missing, broken option.
					const isDisabled = tab.id === 'sheet' && !hasSheet;

					return (
						<button
							key={tab.id}
							onClick={() => onTabChange(tab.id)}
							disabled={isDisabled}
							data-tutorial={`${tab.id}-tab`}
							className={cn(
								"flex flex-col items-center justify-center flex-1 h-full transition-colors",
								isDisabled
									? "text-muted-foreground/40 cursor-not-allowed"
									: cn(
										"active:bg-muted/50",
										isActive
											? "text-primary"
											: "text-muted-foreground hover:text-foreground"
									)
							)}
							aria-label={isDisabled ? t('MobileBottomTabs.sheetDisabled') : tab.label}
							title={isDisabled ? t('MobileBottomTabs.sheetDisabled') : undefined}
						>
							<Icon className="h-6 w-6 mb-1" />
							<span className="text-xs font-medium">{tab.label}</span>
						</button>
					);
				})}

				{/* Toolbelt Toggle - Disabled outside the character sheet, where it has nothing to act on */}
				<button
					onClick={onToggleToolbelt}
					disabled={!isToolbeltAvailable}
					data-tutorial="bottom-tabs-toolbelt"
					className={cn(
						"flex flex-col items-center justify-center flex-1 h-full transition-colors",
						isToolbeltAvailable
							? cn(
								"active:bg-muted/50",
								isToolbeltOpen
									? "text-primary"
									: "text-muted-foreground hover:text-foreground"
							)
							: "text-muted-foreground/40 cursor-not-allowed"
					)}
					aria-label={t('MobileBottomTabs.toolbelt')}
				>
					<Wrench className="h-6 w-6 mb-1" />
					<span className="text-xs font-medium">
						{t('MobileBottomTabs.toolbelt')}
					</span>
				</button>
			</div>
		</div>
	);
}
