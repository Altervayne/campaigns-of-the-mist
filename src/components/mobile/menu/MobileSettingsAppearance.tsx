// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Hook Imports --
import { useThemeMode } from '@/hooks/useThemeMode';

// -- Icon Imports --
import { Sun, Monitor, Moon } from 'lucide-react';

// -- Component Imports --
import { MobileSettingsSubScreen } from '@/components/mobile/menu/MobileSettingsSubScreen';
import { MobileSettingsToggleGroup } from '@/components/mobile/menu/MobileSettingsToggleGroup';
import { MobileThemeList } from '@/components/mobile/menu/MobileThemeList';

interface MobileSettingsAppearanceProps {
	onBack?: () => void;
	onOpenEditor?: () => void;
}

/**
 * Appearance settings: the light/dark/system MODE toggle at the top, then the theme list (select presets or
 * customs, create, import, and manage). Mode keys on the CHOSEN mode, so `system` reads as itself rather than
 * the light/dark it happens to resolve to.
 */
export default function MobileSettingsAppearance({ onBack, onOpenEditor }: MobileSettingsAppearanceProps) {
	const { t } = useTranslation();
	const { mode, setMode } = useThemeMode();

	return (
		<MobileSettingsSubScreen title={t('Common.appearance')} onBack={onBack}>
			{/* Mode: keyed on the chosen mode so a `system` pick lights `system`, not its resolved light/dark. */}
			<MobileSettingsToggleGroup
				dataTutorial="appearance-mode"
				label={t('SettingsDialog.appearance')}
				options={[
					{
						icon: <Sun className="mr-2 h-5 w-5 shrink-0" />,
						label: t('Common.light'),
						isActive: mode === 'light',
						onSelect: () => setMode('light'),
					},
					{
						icon: <Monitor className="mr-2 h-5 w-5 shrink-0" />,
						label: t('SettingsDialog.modeSystem'),
						isActive: mode === 'system',
						onSelect: () => setMode('system'),
					},
					{
						icon: <Moon className="mr-2 h-5 w-5 shrink-0" />,
						label: t('Common.dark'),
						isActive: mode === 'dark',
						onSelect: () => setMode('dark'),
					},
				]}
			/>

			{/* Theme: the live list (select = apply), with per-row edit / New / Duplicate opening the editor. */}
			<MobileThemeList onOpenEditor={onOpenEditor} />
		</MobileSettingsSubScreen>
	);
}
