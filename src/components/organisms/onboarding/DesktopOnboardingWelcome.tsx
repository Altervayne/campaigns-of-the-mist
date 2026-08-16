// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { Button } from '@/components/ui/button';
import { OnboardingLogo } from '@/components/molecules/OnboardingLogo';



interface DesktopOnboardingWelcomeProps {
	onNext: () => void;
	onSkip: () => void;
}

export default function DesktopOnboardingWelcome({ onNext, onSkip }: DesktopOnboardingWelcomeProps) {
	const { t } = useTranslation();

	return (
		<div className="flex flex-col items-center text-center">
			{/* Logo */}
			<div className="mb-8 w-32 h-32 flex items-center justify-center">
				<OnboardingLogo className="w-full h-full" />
			</div>

			<h1 className="text-2xl font-bold mb-4">
				{t('MobileOnboarding.welcome.title')}
			</h1>

			<p className="text-muted-foreground mb-8 max-w-sm">
				{t('MobileOnboarding.welcome.description')}
			</p>

			<div className="w-full max-w-xs space-y-3">
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
