// -- React Imports --
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { MobileSettingsSubScreen } from '@/components/mobile/menu/MobileSettingsSubScreen';
import { MobileSettingsToggleGroup } from '@/components/mobile/menu/MobileSettingsToggleGroup';
import { MobileCardPaletteList } from '@/components/mobile/menu/MobileCardPaletteList';

// -- Type Imports --
import type { CardPaletteGame } from '@/lib/theme/cardPalettes';

/** The games that own card palettes, in selector order. */
const GAME_OPTIONS: CardPaletteGame[] = ['LEGENDS', 'CITY_OF_MIST', 'OTHERSCAPE'];

interface MobileSettingsCardPalettesProps {
	onBack?: () => void;
	onOpenEditor?: () => void;
}

/**
 * Card-palette settings: a game selector at the top, then the selected game's palette list (select active,
 * create, import, manage). Card palettes are scoped to a game, so the list always operates on the chosen one.
 */
export default function MobileSettingsCardPalettes({ onBack, onOpenEditor }: MobileSettingsCardPalettesProps) {
	const { t } = useTranslation();
	const [game, setGame] = useState<CardPaletteGame>('LEGENDS');

	return (
		<MobileSettingsSubScreen title={t('SettingsShell.sections.cardPalettes')} onBack={onBack}>
			<MobileSettingsToggleGroup
				label={t('SettingsDialog.cardPalettes.game')}
				options={GAME_OPTIONS.map((option) => ({
					icon: null,
					label: t(`SettingsDialog.cardPalettes.games.${option}`),
					isActive: game === option,
					onSelect: () => setGame(option),
				}))}
			/>

			<MobileCardPaletteList game={game} onOpenEditor={onOpenEditor} />
		</MobileSettingsSubScreen>
	);
}
