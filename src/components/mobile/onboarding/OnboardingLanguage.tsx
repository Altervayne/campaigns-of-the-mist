// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { Button } from '@/components/ui/button';

// -- Icon Imports --
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';

// -- Utils --
import { cn } from '@/lib/utils';

// -- Localization Imports --
import { LOCALES } from '@/i18n/locales';



interface OnboardingLanguageProps {
	onNext: () => void;
	onBack: () => void;
	onSkip: () => void;
}

export default function OnboardingLanguage({ onNext, onBack, onSkip }: OnboardingLanguageProps) {
	const { t, i18n } = useTranslation();
	const currentLocale = i18n.language;

	const handleLanguageSelect = (code: string) => {
		i18n.changeLanguage(code);
	};

	return (
		<div className="flex-1 flex flex-col p-6 pt-[calc(4rem+env(safe-area-inset-top))]">
			{/* Header */}
			<div className="text-center mb-8">
				<h1 className="text-2xl font-bold mb-2">
					{t('MobileOnboarding.language.title')}
				</h1>
				<p className="text-muted-foreground">
					{t('MobileOnboarding.language.description')}
				</p>
			</div>

			{/* Language Cards */}
			<div className="flex-1 flex flex-col justify-center gap-3 max-w-sm mx-auto w-full">
				{LOCALES.map((lang) => (
					<button
						key={lang.code}
						onClick={() => handleLanguageSelect(lang.code)}
						className={cn(
							"w-full p-4 rounded-xl border-2 transition-all cursor-pointer",
							"flex items-center justify-between",
							currentLocale === lang.code
								? "border-primary bg-primary/5"
								: "border-border bg-card hover:border-primary/50"
						)}
					>
						<div className="text-left">
							<p className="font-semibold text-lg">{lang.nativeName}</p>
							<p className="text-sm text-muted-foreground">{lang.englishName}</p>
						</div>
						{currentLocale === lang.code && (
							<Check className="w-6 h-6 text-primary" />
						)}
					</button>
				))}
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
