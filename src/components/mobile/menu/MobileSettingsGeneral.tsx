// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Basic UI Imports --
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// -- Icon Imports --
import {
	FlipHorizontal,
	BookOpen,
	UnlockIcon,
	Lock,
	PanelsRightBottom,
	SquareMenu,
	Hand,
	Eye,
	EyeOff,
} from 'lucide-react';

// -- Component Imports --
import { MobileSettingsSubScreen } from '@/components/mobile/menu/MobileSettingsSubScreen';
import { MobileSettingsToggleGroup } from '@/components/mobile/menu/MobileSettingsToggleGroup';

// -- Store and Hook Imports --
import { useAppSettingsActions, useAppSettingsStore } from '@/lib/stores/appSettingsStore';
import { useInterfaceSetting, INTERFACE_CHOICES, INTERFACE_ICONS } from '@/hooks/useInterfaceSetting';

// -- Localization Imports --
import { LOCALES, resolveLocaleCode } from '@/i18n/locales';

interface MobileSettingsGeneralProps {
	onBack?: () => void;
}

/** General settings: language, card view, tracker editing, and the mobile-only interaction preferences. */
export default function MobileSettingsGeneral({ onBack }: MobileSettingsGeneralProps) {
	const { t, i18n } = useTranslation();
	const locale = resolveLocaleCode(i18n.language);

	const { isSideBySideView, isTrackersAlwaysEditable, isMobileFABMode, mobileHandedness, areGestureHintsEnabled } = useAppSettingsStore();
	const { setSideBySideView, setTrackersAlwaysEditable, setMobileFABMode, setMobileHandedness, setGestureHintsEnabled } = useAppSettingsActions();
	const { choice: interfaceChoice, resolvedFormFactor, selectInterface } = useInterfaceSetting();

	const handleLocaleChange = (newLocale: string) => {
		i18n.changeLanguage(newLocale);
	};

	return (
		<MobileSettingsSubScreen title={t('Common.general')} onBack={onBack}>
			{/* Language */}
			<div className="space-y-2">
				<Label className="text-sm font-semibold">{t('SettingsDialog.language')}</Label>
				<Select value={locale} onValueChange={handleLocaleChange}>
					<SelectTrigger className="h-12 text-base">
						<SelectValue placeholder={t('SettingsDialog.selectLanguagePlaceholder')} />
					</SelectTrigger>
					<SelectContent>
						{LOCALES.map((loc) => (
							<SelectItem key={loc.code} value={loc.code} className="text-base py-3">
								{loc.nativeName}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{/* Interface: layout profile override. Writes both axes; on Auto, shows the resolved layout. */}
			<MobileSettingsToggleGroup
				label={t('SettingsDialog.interface.title')}
				options={INTERFACE_CHOICES.map((option) => {
					const OptionIcon = INTERFACE_ICONS[option];
					return {
						icon: <OptionIcon className="mr-2 h-5 w-5 shrink-0" />,
						label: t(`SettingsDialog.interface.${option}`),
						isActive: interfaceChoice === option,
						onSelect: () => selectInterface(option),
					};
				})}
				hint={
					interfaceChoice === 'auto'
						? t('SettingsDialog.interface.autoResolved', { value: t(`SettingsDialog.interface.${resolvedFormFactor}`) })
						: undefined
				}
			/>

			{/* Card View Mode */}
			<MobileSettingsToggleGroup
				label={t('SettingsDialog.cardView.title')}
				options={[
					{
						icon: <FlipHorizontal className="mr-2 h-5 w-5 shrink-0" />,
						label: t('SettingsDialog.cardView.flipping'),
						isActive: !isSideBySideView,
						onSelect: () => setSideBySideView(false),
					},
					{
						icon: <BookOpen className="mr-2 h-5 w-5 shrink-0" />,
						label: t('SettingsDialog.cardView.sideBySide'),
						isActive: isSideBySideView,
						onSelect: () => setSideBySideView(true),
					},
				]}
			/>

			{/* Tracker Editing Mode */}
			<MobileSettingsToggleGroup
				label={t('SettingsDialog.trackerEdit.title')}
				options={[
					{
						icon: <UnlockIcon className="mr-2 h-5 w-5 shrink-0" />,
						label: t('SettingsDialog.trackerEdit.unlocked'),
						isActive: !isTrackersAlwaysEditable,
						onSelect: () => setTrackersAlwaysEditable(false),
					},
					{
						icon: <Lock className="mr-2 h-5 w-5 shrink-0" />,
						label: t('SettingsDialog.trackerEdit.locked'),
						isActive: isTrackersAlwaysEditable,
						onSelect: () => setTrackersAlwaysEditable(true),
					},
				]}
			/>

			{/* Mobile UI Mode */}
			<MobileSettingsToggleGroup
				label={t('SettingsDialog.mobileFABMode.title')}
				options={[
					{
						icon: <PanelsRightBottom className="mr-2 h-5 w-5 shrink-0" />,
						label: t('SettingsDialog.mobileFABMode.bottomTabs'),
						isActive: !isMobileFABMode,
						onSelect: () => setMobileFABMode(false),
					},
					{
						icon: <SquareMenu className="mr-2 h-5 w-5 shrink-0" />,
						label: t('Common.floatingButtons'),
						isActive: isMobileFABMode,
						onSelect: () => setMobileFABMode(true),
					},
				]}
			/>

			{/* Mobile Handedness */}
			<MobileSettingsToggleGroup
				label={t('SettingsDialog.mobileHandedness.title')}
				options={[
					{
						icon: <Hand className="w-8 h-8 -scale-x-100" />,
						label: t('Common.left'),
						isActive: mobileHandedness === 'left',
						onSelect: () => setMobileHandedness('left'),
					},
					{
						icon: <Hand className="w-8 h-8" />,
						label: t('Common.right'),
						isActive: mobileHandedness === 'right',
						onSelect: () => setMobileHandedness('right'),
					},
				]}
			/>

			{/* Gesture Tips */}
			<MobileSettingsToggleGroup
				label={t('SettingsDialog.gestureHints.title')}
				options={[
					{
						icon: <Eye className="mr-2 h-5 w-5 shrink-0" />,
						label: t('SettingsDialog.gestureHints.shown'),
						isActive: areGestureHintsEnabled,
						onSelect: () => setGestureHintsEnabled(true),
					},
					{
						icon: <EyeOff className="mr-2 h-5 w-5 shrink-0" />,
						label: t('SettingsDialog.gestureHints.hidden'),
						isActive: !areGestureHintsEnabled,
						onSelect: () => setGestureHintsEnabled(false),
					},
				]}
			/>
		</MobileSettingsSubScreen>
	);
}
