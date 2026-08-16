// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import toast from 'react-hot-toast';

// -- Basic UI Imports --
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

// -- Icon Imports --
import { GraduationCap, Check, Play, RotateCcw, Lightbulb, ChevronRight } from 'lucide-react';

// -- Component Imports --
import { MobileSettingsSubScreen } from '@/components/mobile/menu/MobileSettingsSubScreen';

// -- Store and Util Imports --
import { useAppSettingsStore, useAppSettingsActions } from '@/lib/stores/appSettingsStore';
import { getTutorialsForPlatform } from '@/lib/tutorial/definitions';

interface MobileSettingsLearnProps {
	onRestartOnboarding?: () => void;
	onStartTutorial?: (id: string) => void;
	onBack?: () => void;
}

/** Learn settings: the re-explorable tutorials, plus replaying the first-run onboarding and the gesture tips. */
export default function MobileSettingsLearn({ onRestartOnboarding, onStartTutorial, onBack }: MobileSettingsLearnProps) {
	const { t } = useTranslation();
	const completedTutorials = useAppSettingsStore((state) => state.completedTutorials);
	const { setGestureHintsEnabled, setHasSeenTrackerSelectHint, setHasSeenDrawerMenuHint } = useAppSettingsActions();

	// Re-arm the one-time gesture tips: turn them back on and clear the "already seen" flags so each hint
	// shows again the next time its surface (trackers / drawer) is opened.
	const handleReplayGestureTips = () => {
		setGestureHintsEnabled(true);
		setHasSeenTrackerSelectHint(false);
		setHasSeenDrawerMenuHint(false);
		toast.success(t('Notifications.general.gestureTipsReset'));
	};

	// The mobile tutorials, empty until the real content is authored (dev scenarios are desktop-only, so this
	// stays empty in dev too); when empty the whole group renders nothing, no orphan header.
	const tutorials = onStartTutorial ? getTutorialsForPlatform('mobile') : [];

	return (
		<MobileSettingsSubScreen title={t('Common.learn')} onBack={onBack}>
			{/* Tutorials (re-explorable lessons; distinct from replaying onboarding or the tour) */}
			{tutorials.length > 0 && (
				<div className="space-y-2">
					<Label className="text-sm font-semibold">{t('Common.tutorials')}</Label>
					{tutorials.map((definition) => {
						const Glyph = definition.icon ?? GraduationCap;
						const done = completedTutorials.includes(definition.id);
						return (
							<Button
								key={definition.id}
								onClick={() => onStartTutorial?.(definition.id)}
								variant="outline"
								className="w-full min-h-12 text-base justify-start"
							>
								<Glyph className="mr-3 h-5 w-5 shrink-0" />
								<span className="flex-1 text-left truncate">{t(definition.titleKey)}</span>
								{done
									? <Check className="h-5 w-5 shrink-0 text-primary" aria-label={t('TutorialsDialog.status.done')} />
									: <Play className="h-5 w-5 shrink-0 text-muted-foreground" aria-label={t('TutorialsDialog.action.start')} />}
							</Button>
						);
					})}
				</div>
			)}

			{/* Restart Onboarding */}
			{onRestartOnboarding && (
				<div className="space-y-2">
					<Label className="text-sm font-semibold">{t('SettingsDialog.onboarding')}</Label>
					<Button
						onClick={onRestartOnboarding}
						variant="default"
						className="w-full h-12 text-base justify-start"
					>
						<RotateCcw className="mr-3 h-5 w-5 shrink-0" />
						<span className="flex-1 text-left">{t('SettingsDialog.onboardingButton')}</span>
						<ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
					</Button>
				</div>
			)}

			{/* Replay gesture tips: re-arm the one-time hints, alongside the other "re-experience it" actions. */}
			<div className="space-y-2">
				<Label className="text-sm font-semibold">{t('SettingsDialog.gestureHints.replayLabel')}</Label>
				<Button
					onClick={handleReplayGestureTips}
					variant="default"
					className="w-full h-12 text-base justify-start"
				>
					<Lightbulb className="mr-3 h-5 w-5 shrink-0" />
					<span className="flex-1 text-left">{t('SettingsDialog.gestureHints.replayButton')}</span>
					<ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
				</Button>
			</div>
		</MobileSettingsSubScreen>
	);
}
