// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import {
	ChevronLeft,
	ChevronRight,
	SlidersHorizontal,
	Palette,
	SwatchBook,
	Database,
	GraduationCap,
	Sparkles,
	Megaphone,
	Info,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// -- Basic UI Imports --
import { IconButton } from '@/components/ui/icon-button';

// -- Store and Hook Imports --
import { useHasUnreadPatchNotes } from '@/hooks/useHasUnreadPatchNotes';
import { useHasUnseenAnnouncements } from '@/hooks/useHasUnseenAnnouncements';

// -- Utils Imports --
import { APP_VERSION } from '@/lib/config';

interface MobileSettingsProps {
	onOpenGeneral: () => void;
	onOpenAppearance: () => void;
	onOpenCardPalettes: () => void;
	onOpenData: () => void;
	onOpenLearn: () => void;
	onOpenWhatsNew: () => void;
	onOpenAnnouncements: () => void;
	onOpenAbout: () => void;
	onBack?: () => void;
}

interface SettingsCategory {
	id: string;
	labelKey: string;
	icon: LucideIcon;
	onOpen: () => void;
	showDot?: boolean;
}

/**
 * The mobile settings hub: a category list that mirrors the desktop taxonomy, grouped into Configure and
 * Help & info. Each row pushes a sub-screen; the What's-new row carries the New! dot until it's opened.
 */
export default function MobileSettings({ onOpenGeneral, onOpenAppearance, onOpenCardPalettes, onOpenData, onOpenLearn, onOpenWhatsNew, onOpenAnnouncements, onOpenAbout, onBack }: MobileSettingsProps) {
	const { t } = useTranslation();
	const hasUnreadPatchNotes = useHasUnreadPatchNotes();
	const hasUnseenAnnouncements = useHasUnseenAnnouncements();

	const groups: { labelKey: string; categories: SettingsCategory[] }[] = [
		{
			labelKey: 'SettingsShell.groups.configure',
			categories: [
				{ id: 'general', labelKey: 'SettingsShell.sections.general', icon: SlidersHorizontal, onOpen: onOpenGeneral },
				{ id: 'appearance', labelKey: 'SettingsShell.sections.appearance', icon: Palette, onOpen: onOpenAppearance },
				{ id: 'cardPalettes', labelKey: 'SettingsShell.sections.cardPalettes', icon: SwatchBook, onOpen: onOpenCardPalettes },
				{ id: 'data', labelKey: 'SettingsShell.sections.data', icon: Database, onOpen: onOpenData },
			],
		},
		{
			labelKey: 'SettingsShell.groups.help',
			categories: [
				{ id: 'learn', labelKey: 'SettingsShell.sections.learn', icon: GraduationCap, onOpen: onOpenLearn },
				{ id: 'whatsNew', labelKey: 'SettingsShell.sections.whatsNew', icon: Sparkles, onOpen: onOpenWhatsNew, showDot: hasUnreadPatchNotes },
				{ id: 'announcements', labelKey: 'SettingsShell.sections.announcements', icon: Megaphone, onOpen: onOpenAnnouncements, showDot: hasUnseenAnnouncements },
				{ id: 'about', labelKey: 'SettingsShell.sections.about', icon: Info, onOpen: onOpenAbout },
			],
		},
	];

	return (
		<div className="h-full overflow-y-auto pt-safe">
			<div className="p-6">
				<div className="flex items-center gap-3 mb-4">
					{onBack && (
						<IconButton
							variant="ghost"
							size="lg"
							onClick={onBack}
							className="h-10 w-10 p-0"
						>
							<ChevronLeft className="h-8 w-8" />
						</IconButton>
					)}
					<div className="flex-1">
						<h2 className="text-2xl font-bold">{t('SettingsShell.title')}</h2>
					</div>
				</div>
				<p className="text-sm text-muted-foreground">
					{t('SettingsDialog.description')}
				</p>
			</div>

			<div data-tutorial="settings-content" className="px-6 pb-[calc(2rem_+_env(safe-area-inset-bottom))] space-y-6">
				{groups.map((group) => (
					<div key={group.labelKey} className="space-y-1">
						<div className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							{t(group.labelKey)}
						</div>
						{group.categories.map((category) => {
							const Icon = category.icon;
							return (
								<button
									key={category.id}
									onClick={category.onOpen}
									className="w-full min-h-12 flex items-center gap-3 px-3 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
								>
									<Icon className="size-5 shrink-0" />
									<span className="flex-1 text-left truncate text-foreground">{t(category.labelKey)}</span>
									{category.showDot && <span className="ml-auto size-2 shrink-0 rounded-full bg-primary" aria-hidden />}
									<ChevronRight className="size-5 shrink-0" />
								</button>
							);
						})}
					</div>
				))}

				{/* Version footer */}
				<div className="text-xs text-center text-muted-foreground pt-4">
					<p>Campaigns of the Mist</p>
					<p>Version {APP_VERSION || '1.0.0'}</p>
				</div>
			</div>
		</div>
	);
}
