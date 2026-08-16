// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { Button } from '@/components/ui/button';

// -- Icon Imports --
import { ChevronLeft, ChevronRight } from 'lucide-react';



interface DesktopOnboardingNavProps {
	onNext: () => void;
	onBack: () => void;
	onSkip: () => void;
}

// The shared Back / Skip / Next footer for the middle onboarding steps.
export default function DesktopOnboardingNav({ onNext, onBack, onSkip }: DesktopOnboardingNavProps) {
	const { t } = useTranslation();

	return (
		<div className="flex items-center justify-between mt-8">
			<Button variant="ghost" onClick={onBack} className="cursor-pointer">
				<ChevronLeft className="w-4 h-4 mr-1" />
				{t('MobileOnboarding.navigation.back')}
			</Button>

			<Button variant="ghost" onClick={onSkip} className="cursor-pointer text-muted-foreground">
				{t('Common.skip')}
			</Button>

			<Button onClick={onNext} className="cursor-pointer">
				{t('Common.next')}
				<ChevronRight className="w-4 h-4 ml-1" />
			</Button>
		</div>
	);
}
