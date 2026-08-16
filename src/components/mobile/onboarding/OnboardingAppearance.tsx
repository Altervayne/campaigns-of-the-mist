// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Hook Imports --
import { useThemeMode } from '@/hooks/useThemeMode';

// -- Component Imports --
import { Button } from '@/components/ui/button';

// -- Icon Imports --
import { ChevronLeft, ChevronRight, Sun, Moon, Check } from 'lucide-react';

// -- Store Imports --
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';

// -- Utils --
import { cn } from '@/lib/utils';



interface OnboardingAppearanceProps {
	onNext: () => void;
	onBack: () => void;
	onSkip: () => void;
}

const COLOR_PALETTES = [
	{ id: 'theme-neutral', name: 'Neutral', color: '#71717a' },
	{ id: 'theme-legends', name: 'Legend', color: '#b45309' },
	{ id: 'theme-city-of-mist', name: 'City of Mist', color: '#7c3aed' },
	{ id: 'theme-otherscape', name: 'Otherscape', color: '#0891b2' },
];

export default function OnboardingAppearance({ onNext, onBack, onSkip }: OnboardingAppearanceProps) {
	const { t } = useTranslation();
	const { resolvedMode, setMode } = useThemeMode();
	const colorTheme = useAppSettingsStore((state) => state.theme);
	const setColorTheme = useAppSettingsStore((state) => state.actions.setTheme);

	return (
		<div className="flex-1 flex flex-col p-6 pt-[calc(4rem+env(safe-area-inset-top))]">
			{/* Header */}
			<div className="text-center mb-6">
				<h1 className="text-2xl font-bold mb-2">
					{t('MobileOnboarding.appearance.title')}
				</h1>
				<p className="text-muted-foreground">
					{t('MobileOnboarding.appearance.description')}
				</p>
			</div>

			<div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
				{/* Display Mode */}
				<div className="mb-6">
					<p className="text-sm font-medium mb-3 text-center">
						{t('MobileOnboarding.appearance.mode')}
					</p>
					<div className="grid grid-cols-2 gap-3">
						<button
							onClick={() => setMode('light')}
							className={cn(
								"p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col items-center gap-2",
								resolvedMode === 'light'
									? "border-primary bg-primary/5"
									: "border-border bg-card hover:border-primary/50"
							)}
						>
							<Sun className="w-8 h-8" />
							<span className="font-medium">{t('SettingsDialog.light')}</span>
						</button>
						<button
							onClick={() => setMode('dark')}
							className={cn(
								"p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col items-center gap-2",
								resolvedMode === 'dark'
									? "border-primary bg-primary/5"
									: "border-border bg-card hover:border-primary/50"
							)}
						>
							<Moon className="w-8 h-8" />
							<span className="font-medium">{t('SettingsDialog.dark')}</span>
						</button>
					</div>
				</div>

				{/* Color Palette */}
				<div>
					<p className="text-sm font-medium mb-3 text-center">
						{t('MobileOnboarding.appearance.palette')}
					</p>
					<div className="grid grid-cols-2 gap-3">
						{COLOR_PALETTES.map((palette) => (
							<button
								key={palette.id}
								onClick={() => setColorTheme(palette.id as typeof colorTheme)}
								className={cn(
									"p-3 rounded-xl border-2 transition-all cursor-pointer flex items-center gap-3",
									colorTheme === palette.id
										? "border-primary bg-primary/5"
										: "border-border bg-card hover:border-primary/50"
								)}
							>
								<div
									className="w-6 h-6 rounded-full shrink-0"
									style={{ backgroundColor: palette.color }}
								/>
								<span className="font-medium text-sm truncate">{palette.name}</span>
								{colorTheme === palette.id && (
									<Check className="w-4 h-4 text-primary ml-auto shrink-0" />
								)}
							</button>
						))}
					</div>
				</div>
			</div>

			{/* Navigation */}
			<div className="flex items-center justify-between mt-8 mb-4">
				<Button
					variant="ghost"
					onClick={onBack}
					className="cursor-pointer"
				>
					<ChevronLeft className="w-4 h-4 mr-1" />
					{t('MobileOnboarding.navigation.back')}
				</Button>

				<Button
					variant="ghost"
					onClick={onSkip}
					className="cursor-pointer text-muted-foreground"
				>
					{t('Common.skip')}
				</Button>

				<Button
					onClick={onNext}
					className="cursor-pointer"
				>
					{t('Common.next')}
					<ChevronRight className="w-4 h-4 ml-1" />
				</Button>
			</div>
		</div>
	);
}
