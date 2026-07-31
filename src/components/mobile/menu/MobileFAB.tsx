// -- React Imports --
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { motion, AnimatePresence } from 'framer-motion';

// -- Component Imports --
import { IconButton } from '@/components/ui/icon-button';

// -- Icon Imports --
import { Menu, X, FolderOpen, Home, Settings, LayoutGrid } from 'lucide-react';

// -- Store Imports --
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { getFloatingBottom } from '@/lib/utils/mobileFloating';

type TabId = 'sheet' | 'drawer' | 'menu';
type SheetTab = 'trackers' | 'cards';

interface MobileFABProps {
	activeTab: TabId;
	onTabChange: (tab: TabId) => void;
	onOpenDrawer: () => void;
	onOpenMenu: () => void;
	onOpenSettings: () => void;
	sheetActiveTab?: SheetTab;
	isToolbeltOpen?: boolean;
	isExpanded?: boolean;
	onIsExpandedChange?: (isExpanded: boolean) => void;
	/** Whether a character is loaded; the Sheet action greys out when false. */
	hasSheet?: boolean;
}

export default function MobileFAB({
	activeTab,
	onTabChange,
	onOpenDrawer,
	onOpenMenu,
	onOpenSettings,
	sheetActiveTab,
	isToolbeltOpen,
	isExpanded: controlledIsExpanded,
	onIsExpandedChange,
	hasSheet = true
}: MobileFABProps) {
	const { t } = useTranslation();
	const [internalIsExpanded, setInternalIsExpanded] = useState(false);

	// Use controlled state if provided, otherwise use internal state
	const isExpanded = controlledIsExpanded ?? internalIsExpanded;
	const mobileHandedness = useAppSettingsStore((state) => state.mobileHandedness);
	const isLeft = mobileHandedness === 'left';

	// On the cards tab (collapsed), the FAB rides above the card navigation bar.
	const isCardsFab = !isExpanded && activeTab === 'sheet' && sheetActiveTab === 'cards';

	// On the drawer tab, the FAB sits at its base resting offset (no extra
	// drawer-toolbar clearance) so it lands inside the toolbar's vertical band -
	// the drawer reserves a horizontal slot on its handedness-leading edge so
	// no toolbar button sits under it, and the FAB no longer overlaps the
	// breadcrumbs above. It also drops its floating shadow and matches the
	// toolbar buttons' icon size there, reading as the bar's primary button
	// rather than a FAB crammed into the row. Keyed on the tab alone (not the
	// collapsed state) so the styling stays stable while the menu is expanded.
	const isDrawerFab = activeTab === 'drawer';

	const toggleExpanded = () => {
		const newValue = !isExpanded;
		setInternalIsExpanded(newValue);
		onIsExpandedChange?.(newValue);
	};

	const actions = [
		{
			id: 'sheet',
			label: t('MobileFAB.sheet'),
			icon: Home,
			onClick: () => {
				onTabChange('sheet');
				toggleExpanded();
			},
			show: true,
			// No character loaded means no sheet to open: greyed and inert, never selected.
			active: hasSheet && activeTab === 'sheet',
			disabled: !hasSheet,
		},
		{
			id: 'drawer',
			label: t('MobileFAB.drawer'),
			icon: FolderOpen,
			onClick: () => {
				onOpenDrawer();
				toggleExpanded();
			},
			show: true,
			active: activeTab === 'drawer',
			disabled: false,
		},
		{
			id: 'menu',
			label: t('MobileFAB.menu'),
			icon: LayoutGrid,
			onClick: () => {
				onOpenMenu();
				toggleExpanded();
			},
			show: true,
			active: activeTab === 'menu',
			disabled: false,
		},
		{
			id: 'settings',
			label: t('MobileFAB.settings'),
			icon: Settings,
			onClick: () => {
				onOpenSettings();
				toggleExpanded();
			},
			show: true,
			// Settings is app chrome, never a resting nav tab, so its pill never reads as active.
			active: false,
			disabled: false,
		},
	].filter(action => action.show);

	return (
		<>
			{/* Backdrop */}
			<AnimatePresence>
				{isExpanded && (
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.2 }}
						className="fixed inset-0 bg-background/80 backdrop-blur-sm layer-backdrop"
						onClick={toggleExpanded}
					/>
				)}
			</AnimatePresence>

			{/* Action Buttons */}
			<div
				className={cn(
					"fixed layer-panel flex flex-col-reverse gap-3",
					isLeft ? "left-4 items-start" : "right-4 items-end"
				)}
				style={{ bottom: getFloatingBottom({ extraRem: 4 }) }}
			>
				<AnimatePresence>
					{isExpanded && actions.map((action, index) => {
						const Icon = action.icon;
						return (
							<motion.button
								key={action.id}
								data-tutorial={`fab-${action.id}`}
								initial={{ opacity: 0, scale: 0, y: 20 }}
								animate={{ opacity: 1, scale: 1, y: 0 }}
								exit={{ opacity: 0, scale: 0, y: 20 }}
								transition={{
									duration: 0.2,
									delay: index * 0.05,
								}}
								onClick={action.onClick}
								aria-disabled={action.disabled}
								className={cn(
									"flex items-center gap-3 rounded-full shadow-lg",
									"px-4 py-3 min-w-max",
									"active:scale-95 transition-transform",
									action.disabled
										? "bg-card text-foreground border border-border opacity-40 pointer-events-none"
										: action.active
											? "bg-primary text-primary-foreground"
											: "bg-card text-foreground border border-border"
								)}
							>
								<Icon className="h-5 w-5" />
								<span className="text-sm font-medium">{action.label}</span>
							</motion.button>
						);
					})}
				</AnimatePresence>
			</div>

			{/* Primary FAB - Hide when toolbelt is open */}
			{!isToolbeltOpen && (
				<motion.div
					className={cn(
						"fixed layer-panel",
						// Cards/sheet tabs: float at the standard 16px corner inset (the
						// card yields room via MobileSheetCardSlot's FAB_CLEARANCE_PADDING).
						// Drawer tab: use the toolbar's own 12px (px-3) edge inset so the
						// FAB lines up with the action buttons' horizontal rhythm - with the
						// 4rem slot the drawer reserves, this leaves an 8px (gap-2) gap to
						// the adjacent button, exactly like a real toolbar button.
						isDrawerFab
							? (isLeft ? "left-3" : "right-3")
							: (isLeft ? "left-4" : "right-4")
					)}
					// Drawer tab: sit on the toolbar buttons' baseline (the toolbar's
					// `paddingBottom` of 0.5rem + safe area) so the FAB is vertically
					// centred in the action-bar row instead of floating 0.5rem above it.
					// Other tabs use the standard floating offset.
					style={{
						bottom: isDrawerFab
							? 'calc(0.5rem + env(safe-area-inset-bottom))'
							: getFloatingBottom({ clearsCardsNavBar: isCardsFab })
					}}
					whileTap={{ scale: 0.95 }}
					data-tutorial="mobile-fab"
				>
					<IconButton
						variant="default"
						size="lg"
						onClick={toggleExpanded}
						// On the drawer tab the FAB is seated inside the bottom toolbar's
						// row rather than floating in a corner, so it drops the floating
						// drop-shadow and matches the toolbar buttons' 20px icon - it
						// keeps its primary fill to stay recognizable as the nav control
						// among the flat outline action buttons. Elsewhere it is a real
						// floating FAB (shadow-2xl, 24px icon).
						className={cn("h-11 w-11", isDrawerFab ? "shadow-none" : "shadow-2xl")}
						aria-label={isExpanded ? t('MobileFAB.close') : t('MobileFAB.open')}
					>
						<motion.div
							animate={{ rotate: isExpanded ? 90 : 0 }}
							transition={{ duration: 0.2 }}
						>
							{isExpanded ? (
								<X className={cn(isDrawerFab ? "h-5 w-5" : "h-6 w-6")} />
							) : (
								<Menu className={cn(isDrawerFab ? "h-5 w-5" : "h-6 w-6")} />
							)}
						</motion.div>
					</IconButton>
				</motion.div>
			)}
		</>
	);
}
