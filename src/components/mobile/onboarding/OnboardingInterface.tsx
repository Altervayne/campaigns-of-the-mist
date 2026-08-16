// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { Button } from '@/components/ui/button';

// -- Icon Imports --
import { ChevronLeft, ChevronRight, Hand, Check, SquareMenu, PanelsRightBottom } from 'lucide-react';

// -- Store Imports --
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';

// -- Utils --
import { cn } from '@/lib/utils';



interface OnboardingInterfaceProps {
	onNext: () => void;
	onBack: () => void;
	onSkip: () => void;
}

export default function OnboardingInterface({ onNext, onBack, onSkip }: OnboardingInterfaceProps) {
	const { t } = useTranslation();

	const mobileHandedness = useAppSettingsStore((state) => state.mobileHandedness);
	const isMobileFABMode = useAppSettingsStore((state) => state.isMobileFABMode);
	const setMobileHandedness = useAppSettingsStore((state) => state.actions.setMobileHandedness);
	const setMobileFABMode = useAppSettingsStore((state) => state.actions.setMobileFABMode);

	return (
		<div className="flex-1 flex flex-col p-6 pt-[calc(4rem+env(safe-area-inset-top))]">
			{/* Header */}
			<div className="text-center mb-6">
				<h1 className="text-2xl font-bold mb-2">
					{t('MobileOnboarding.interface.title')}
				</h1>
				<p className="text-muted-foreground">
					{t('MobileOnboarding.interface.description')}
				</p>
			</div>

			<div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
				{/* Handedness */}
				<div className="mb-6">
					<p className="text-sm font-medium mb-1 text-center">
						{t('MobileOnboarding.interface.handedness')}
					</p>
					<p className="text-xs text-muted-foreground mb-3 text-center">
						{t('MobileOnboarding.interface.handednessHint')}
					</p>
					<div className="grid grid-cols-2 gap-3">
						<button
							onClick={() => setMobileHandedness('left')}
							className={cn(
								"p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col items-center gap-2",
								mobileHandedness === 'left'
									? "border-primary bg-primary/5"
									: "border-border bg-card hover:border-primary/50"
							)}
						>
							<Hand className="w-8 h-8 -scale-x-100" />
							<span className="font-medium">{t('MobileOnboarding.interface.leftHanded')}</span>
							{mobileHandedness === 'left' && (
								<Check className="w-4 h-4 text-primary" />
							)}
						</button>
						<button
							onClick={() => setMobileHandedness('right')}
							className={cn(
								"p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col items-center gap-2",
								mobileHandedness === 'right'
									? "border-primary bg-primary/5"
									: "border-border bg-card hover:border-primary/50"
							)}
						>
							<Hand className="w-8 h-8" />
							<span className="font-medium">{t('MobileOnboarding.interface.rightHanded')}</span>
							{mobileHandedness === 'right' && (
								<Check className="w-4 h-4 text-primary" />
							)}
						</button>
					</div>
				</div>

				{/* Navigation Style */}
				<div>
					<p className="text-sm font-medium mb-1 text-center">
						{t('MobileOnboarding.interface.navigation')}
					</p>
					<p className="text-xs text-muted-foreground mb-3 text-center">
						{t('MobileOnboarding.interface.navigationHint')}
					</p>
					<div className="grid grid-cols-2 gap-3">
						<button
							onClick={() => setMobileFABMode(false)}
							className={cn(
								"p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col items-center gap-2",
								!isMobileFABMode
									? "border-primary bg-primary/5"
									: "border-border bg-card hover:border-primary/50"
							)}
						>
							<PanelsRightBottom className="w-8 h-8" />
							<span className="font-medium text-sm text-center">{t('MobileOnboarding.interface.bottomTabs')}</span>
							{!isMobileFABMode && (
								<Check className="w-4 h-4 text-primary" />
							)}
						</button>
						<button
							onClick={() => setMobileFABMode(true)}
							className={cn(
								"p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col items-center gap-2",
								isMobileFABMode
									? "border-primary bg-primary/5"
									: "border-border bg-card hover:border-primary/50"
							)}
						>
							<SquareMenu className="w-8 h-8" />
							<span className="font-medium text-sm text-center">{t('Common.floatingButtons')}</span>
							{isMobileFABMode && (
								<Check className="w-4 h-4 text-primary" />
							)}
						</button>
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
