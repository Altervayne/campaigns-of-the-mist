// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { motion } from 'framer-motion';

// -- Component Imports --
import { MobileWorkspaceChooser } from '@/components/mobile/menu/MobileWorkspaceChooser';

// -- Icon Imports --
import { Settings, ChevronRight } from 'lucide-react';

// -- Utils Imports --
import { getFloatingContentPadding } from '@/lib/utils/mobileFloating';

// -- Store and Hook Imports --
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';

interface MobileMainMenuProps {
	/** Opens the Settings hub (the gear in navbar mode; the FAB owns its own Settings pill). */
	onOpenSettings: () => void;
	/** Called after a new/imported character becomes the live sheet, so the host can surface it. */
	onCharacterOpened: () => void;
}

export default function MobileMainMenu({ onOpenSettings, onCharacterOpened }: MobileMainMenuProps) {
	const { t } = useTranslation();
	const isMobileFABMode = useAppSettingsStore((state) => state.isMobileFABMode);

	// Hero header: scrolls together with the chooser's game list (passed as its scroll-region header).
	const hero = (
		<div className="p-6 pb-4 text-center">
			<motion.div
				initial={{ scale: 0.9, opacity: 0 }}
				animate={{ scale: 1, opacity: 1 }}
				transition={{ duration: 0.3 }}
				className="text-foreground w-24 h-24 mx-auto mb-4"
			>
				<svg viewBox="0 0 436.25 433.04" className="w-full h-full">
					<path fill="currentColor" d="M332.35,240.7c-29.66-2.96-55.37-5.5-81.81,10.47-17.41,10.51-23.09,29.68-42.34,36.9-7.89,2.96-17.66,5.05-25.15,0l-.47,1.9c10.8,6.92,21.04,11.05,34.03,8.44,23.39-4.69,27.22-26.07,47.09-36.02,30.9-15.47,49.94,2.53,78.83.56,23.07-1.58,47.63-17.44,46.85-42.99-.36-11.95-9.14-25.64-22.31-18.47-9.92,5.41-13.96,14.8-2.86,21.77-31.55,7.1-38.21-25.51-24.18-47.84,21.45-34.15,72.6-34.73,89.4,4.38,21.49,50.03-10.04,113.36-62.32,127.05-17.26,4.53-30.88,2.26-47.86,3.34-35.77,2.28-57.54,28.69-98.25,21.99-112.3-18.47-104.13-226.58-8.98-260.66,31.94-11.44,75.67-3.83,93.44,27.4,4.1,7.19,7.98,23.03,11.95,27.68,5.28,6.2,15.65,1.81,16.8-6.34,1.15-8.16,1.33-41.81.04-50.11-.65-4.13-3.84-5.5-7.02-7.47-22.33-13.83-59.95-22.71-86.13-24.04-115.79-5.84-188.42,96.67-170.33,206.08,15.09,91.23,92.72,137.27,181.76,127.23,19.67-2.23,39.45-10.83,59.05-9.52,6.18.41,13.08,2.57,19.29,2.93,18.59,1.04,35.91-5.32,42.07-24.2-16.87,15.59-36.88-.63-55.53,0-11.64.4-23.16,5.87-33.07,11.39-.84.47-2.43,2.14-3.18.68,9.09-10.01,20.25-19.19,33.79-22.26,21.79-4.94,43.26,5.25,64.77-2.39.92,13.28,4.72,26.95,5.78,40.12.81,10.11,1.38,17.71-10.37,20.52-104.22,13.06-207.66,31.17-311.93,43.76-5.87.57-12.54-5.77-13.89-11.23-14.37-101.29-27.09-202.81-40.8-304.19C6.23,100.8.73,79.28.01,63.16c-.29-6.49,5.08-14.62,11.26-16.51C101.32,34.76,190.82,19.29,280.79,6.93c15.79-2.17,34.64-5.91,50.12-6.88,9.54-.59,16.83,3.95,19.56,13.26,3.97,37.04,7.44,74.16,13.31,110.94-14.59,23.73-46.35,30.31-53.38,60.17-5.91,25.15,4.37,39.94,21.95,56.25l-.02.04ZM396.13,176.92c-9.23-11.03-27.65-8.25-35.75,2.89,3.49-1.04,5.86-4.11,9.31-5.66,4.94-2.23,11.71-2.91,17.05-1.83,3.36.68,6.02,3.97,9.4,4.6ZM410.63,207.37c.49,5.35,0,11.86,0,17.39,0,16.58-23.25,42.88-37.04,50.9-31.24,18.18-68.79,4.33-99.51,24.18l-28.69,19.13c15.32-6.79,27.74-18.56,43.71-24.41,30.74-11.26,61.84-.29,90.94-21.16,22.21-15.92,39.63-45.63,29.62-73.28-2.52.88.86,5.98.97,7.24v.02ZM274.36,281.3c-15.83,3.74-25.74,18.09-39.58,25.64l-7.76,3.34c13.01-1.29,22.56-12.68,32.54-20.12l14.8-8.86h0Z"/>
				</svg>
			</motion.div>
			<motion.h1
				initial={{ opacity: 0, y: 10 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ delay: 0.1, duration: 0.3 }}
				className="text-3xl font-bold tracking-tight text-foreground mb-2"
			>
				{t('MainMenu.title')}
			</motion.h1>
			<motion.p
				initial={{ opacity: 0, y: 10 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ delay: 0.2, duration: 0.3 }}
				className="text-sm text-muted-foreground"
			>
				{t('MainMenu.subtitle')}
			</motion.p>
		</div>
	);

	return (
		<div className="relative h-full flex flex-col overflow-hidden pt-safe bg-gradient-to-b from-background via-background to-muted/10" data-tutorial="menu-content">
			{/* Settings: navbar mode only (the FAB carries its own Settings pill). A prominent, labelled
			    full-width row pinned above the scrollable menu, so it reads as an obvious destination
			    rather than a corner icon to hunt for. */}
			{!isMobileFABMode && (
				<button
					type="button"
					onClick={onOpenSettings}
					data-tutorial="menu-settings"
					className="flex w-full shrink-0 items-center gap-3 border-b border-border px-6 py-3 text-left text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				>
					<Settings className="h-5 w-5 shrink-0" />
					<span className="flex-1 font-medium text-foreground">{t('MainMenu.settings')}</span>
					<ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
				</button>
			)}

			<MobileWorkspaceChooser
				header={hero}
				onCreated={onCharacterOpened}
				// In FAB mode there is no bottom tab bar; pad the CTA clear of the floating FAB (its resting
				// offset + full height, safe-area-aware) so the button and the FAB never overlap.
				footerStyle={isMobileFABMode ? { paddingBottom: getFloatingContentPadding({ extraRem: 0.75 }) } : undefined}
			/>
		</div>
	);
}
