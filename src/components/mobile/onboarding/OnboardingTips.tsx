// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { Button } from '@/components/ui/button';

// -- Icon Imports --
import { ChevronLeft, ChevronRight, Eye, EyeOff, Check, Lightbulb } from 'lucide-react';

// -- Store Imports --
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';

// -- Utils --
import { cn } from '@/lib/utils';



interface OnboardingTipsProps {
	onNext: () => void;
	onBack: () => void;
	onSkip: () => void;
}

/**
 * Onboarding step that asks whether to show gesture tips - the one-time hints
 * that introduce each touch gesture the first time it becomes usable. Kept as
 * its own step (rather than crammed into the interface-layout step) because it
 * is a guidance preference, sitting naturally just before the tutorial offer on
 * the final step. A single binary choice, so it fits comfortably without any
 * scrolling.
 */
export default function OnboardingTips({ onNext, onBack, onSkip }: OnboardingTipsProps) {
	const { t } = useTranslation();

	const areGestureHintsEnabled = useAppSettingsStore((state) => state.areGestureHintsEnabled);
	const setGestureHintsEnabled = useAppSettingsStore((state) => state.actions.setGestureHintsEnabled);

	return (
		<div className="flex-1 flex flex-col p-6 pt-[calc(4rem+env(safe-area-inset-top))]">
			{/* Header */}
			<div className="text-center mb-6">
				<div className="flex justify-center mb-4">
					<div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
						<Lightbulb className="w-8 h-8 text-primary" />
					</div>
				</div>
				<h1 className="text-2xl font-bold mb-2">
					{t('MobileOnboarding.tips.title')}
				</h1>
				<p className="text-muted-foreground">
					{t('MobileOnboarding.tips.description')}
				</p>
			</div>

			<div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
				<div className="grid grid-cols-2 gap-3">
					<button
						onClick={() => setGestureHintsEnabled(true)}
						className={cn(
							"p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col items-center gap-2",
							areGestureHintsEnabled
								? "border-primary bg-primary/5"
								: "border-border bg-card hover:border-primary/50"
						)}
					>
						<Eye className="w-8 h-8" />
						<span className="font-medium">{t('MobileOnboarding.tips.show')}</span>
						{areGestureHintsEnabled && (
							<Check className="w-4 h-4 text-primary" />
						)}
					</button>
					<button
						onClick={() => setGestureHintsEnabled(false)}
						className={cn(
							"p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col items-center gap-2",
							!areGestureHintsEnabled
								? "border-primary bg-primary/5"
								: "border-border bg-card hover:border-primary/50"
						)}
					>
						<EyeOff className="w-8 h-8" />
						<span className="font-medium">{t('MobileOnboarding.tips.hide')}</span>
						{!areGestureHintsEnabled && (
							<Check className="w-4 h-4 text-primary" />
						)}
					</button>
				</div>

				<p className="text-xs text-muted-foreground text-center mt-6">
					{t('MobileOnboarding.tips.reminder')}
				</p>
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
