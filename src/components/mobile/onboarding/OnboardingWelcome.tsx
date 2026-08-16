// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { Button } from '@/components/ui/button';
import { OnboardingLogo } from '@/components/molecules/OnboardingLogo';



interface OnboardingWelcomeProps {
	onNext: () => void;
	onSkip: () => void;
}

export default function OnboardingWelcome({ onNext, onSkip }: OnboardingWelcomeProps) {
	const { t } = useTranslation();

	return (
		<div className="flex-1 flex flex-col items-center justify-center p-6 pt-[calc(4rem+env(safe-area-inset-top))]">
			{/* Logo/Icon */}
			<div className="mb-8">
				<div className="w-36 h-36 rounded-full flex items-center justify-center">
					<OnboardingLogo className="w-full h-full" />
				</div>
			</div>

			{/* Title */}
			<h1 className="text-2xl font-bold text-center mb-4">
				{t('MobileOnboarding.welcome.title')}
			</h1>

			{/* Description */}
			<p className="text-muted-foreground text-center mb-8 max-w-sm">
				{t('MobileOnboarding.welcome.description')}
			</p>

			{/* Actions */}
			<div className="w-full max-w-xs space-y-3 mt-auto mb-8">
				<Button
					onClick={onNext}
					className="w-full h-12 text-base cursor-pointer"
				>
					{t('MobileOnboarding.welcome.getStarted')}
				</Button>

				<Button
					variant="ghost"
					onClick={onSkip}
					className="w-full cursor-pointer text-muted-foreground"
				>
					{t('Common.skip')}
				</Button>
			</div>
		</div>
	);
}
