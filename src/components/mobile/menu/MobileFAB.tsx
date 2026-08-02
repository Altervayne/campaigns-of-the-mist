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
	/** A note tab's editing bar is docked at the bottom: lift the FAB to ride just above it, full size. */
	clearsNoteBar?: boolean;
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
	hasSheet = true,
	clearsNoteBar = false
}: MobileFABProps) {
	const { t } = useTranslation();
	const [internalIsExpanded, setInternalIsExpanded] = useState(false);

	// Use controlled state if provided, otherwise use internal state
	const isExpanded = controlledIsExpanded ?? internalIsExpanded;
	const mobileHandedness = useAppSettingsStore((state) => state.mobileHandedness);
	const isLeft = mobileHandedness === 'left';

	// On the cards tab (collapsed), the FAB rides above the card navigation bar.
	const isCardsFab = !isExpanded && activeTab === 'sheet' && sheetActiveTab === 'cards';

	// On the drawer tab the FAB seats INTO the toolbar: the drawer reserves a horizontal slot on its
	// handedness-leading edge, and the FAB drops its shadow, matches the bar buttons' 20px icon, and sits on
	// the toolbar baseline - reading as the bar's trailing button. The note editing bar takes the opposite
	// tack: the FAB keeps its full size and floating shadow and rides just ABOVE the bar, so the bar keeps
	// its full width (see the `clearsNoteBar` bottom offset below).
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
						// Drawer tab: seated at the toolbar's own 12px (px-3) edge inset so the FAB lines up with
						// the action buttons' rhythm inside the reserved slot. Everywhere else (cards/sheet, and a
						// note tab's editing bar) it floats at the standard 16px corner inset.
						isDrawerFab
							? (isLeft ? "left-3" : "right-3")
							: (isLeft ? "left-4" : "right-4")
					)}
					// Drawer tab: sit on the toolbar buttons' baseline (its 0.5rem bottom pad). Note edit mode:
					// ride just above the full-width editing bar (clearsNoteBar adds the bar's height). Other
					// tabs use the standard floating offset.
					style={{
						bottom: isDrawerFab
							? 'calc(0.5rem + env(safe-area-inset-bottom))'
							: getFloatingBottom({ clearsCardsNavBar: isCardsFab, clearsNoteBar })
					}}
					whileTap={{ scale: 0.95 }}
					data-tutorial="mobile-fab"
				>
					<IconButton
						variant="default"
						size="lg"
						onClick={toggleExpanded}
						// On the drawer tab the FAB is seated inside the toolbar row, so it drops the floating
						// drop-shadow and matches the toolbar buttons' 20px icon - keeping its primary fill to stay
						// recognizable as the nav control among the flat outline buttons. Elsewhere (including note
						// edit mode) it is a real floating FAB: full 44px hitbox, shadow-2xl, 24px icon.
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
