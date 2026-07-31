// -- Library Imports --
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

// -- Utils Imports --
import { getItemTypeIconComponent } from '@/lib/utils/drawer-icons';

// -- Type Imports --
import type { GameSystem } from '@/lib/types/drawer';



type CardTypeSelection = 'CHARACTER_THEME' | 'GROUP_THEME' | 'LOADOUT_THEME';

// The portrait and journal types are fixed, so their icons resolve once rather than on every render.
const PortraitIcon = getItemTypeIconComponent('IMAGE_CARD');
const JournalIcon = getItemTypeIconComponent('JOURNAL');

interface MobileAddCardTypeSelectorProps {
	game: GameSystem;
	mode: 'create' | 'edit';
	cardType: CardTypeSelection | '';
	onSelect: (cardType: CardTypeSelection) => void;
	/** Offered only while the sheet has no portrait: the type is a singleton. Acts immediately. */
	onSelectPortrait?: () => void;
	/** Offered in create mode: a journal has no themebook/type, so it acts immediately. */
	onSelectJournal?: () => void;
}

/**
 * The card-type selector: a vertical button group for choosing CHARACTER_THEME,
 * GROUP_THEME, or (Otherscape only) LOADOUT_THEME. Purely presentational - the
 * parent owns the selected `cardType` and is notified via `onSelect`. The button
 * labels branch on `game`, and every button is disabled in edit mode (the card
 * type can't be changed after creation), exactly as before.
 *
 * Portrait and Journal join the list when their handlers are supplied, mirroring the
 * desktop add menu. Neither carries a themebook/type, so both act immediately rather
 * than selecting a type; each wears the shared drawer icon to mark that it acts.
 */
export function MobileAddCardTypeSelector({ game, mode, cardType, onSelect, onSelectPortrait, onSelectJournal }: MobileAddCardTypeSelectorProps) {
	const { t } = useTranslation();

	return (
		<div className="space-y-2">
			<Label className="text-sm font-semibold">{t('CreateCardDialog.cardTypeLabel')}</Label>
			<div className="grid grid-cols-1 gap-2">
				<Button
					variant={cardType === 'CHARACTER_THEME' ? 'default' : 'outline'}
					onClick={() => onSelect('CHARACTER_THEME')}
					disabled={mode === 'edit'}
					className="h-auto min-h-12 text-base justify-start"
				>
					{game === 'LEGENDS' ? t('CreateCardDialog.themeCard') : game === 'OTHERSCAPE' ? t('CreateCardDialog.otherscapeThemeCard') : t('CreateCardDialog.riftThemeCard')}
				</Button>

				{(game === 'LEGENDS' || game === 'CITY_OF_MIST' || game === 'OTHERSCAPE') && (
					<Button
						variant={cardType === 'GROUP_THEME' ? 'default' : 'outline'}
						onClick={() => onSelect('GROUP_THEME')}
						disabled={mode === 'edit'}
						className="h-auto min-h-12 text-base justify-start"
					>
						{game === 'LEGENDS' ? t('CreateCardDialog.fellowshipCard') : game === 'OTHERSCAPE' ? t('CreateCardDialog.otherscapeCrewCard') : t('CreateCardDialog.crewCard')}
					</Button>
				)}

				{game === 'OTHERSCAPE' && (
					<Button
						variant={cardType === 'LOADOUT_THEME' ? 'default' : 'outline'}
						onClick={() => onSelect('LOADOUT_THEME')}
						disabled={mode === 'edit'}
						className="h-auto min-h-12 text-base justify-start"
					>
						{t('CreateCardDialog.otherscapeLoadoutCard')}
					</Button>
				)}

				{onSelectPortrait && (
					<Button
						variant="outline"
						onClick={onSelectPortrait}
						className="h-auto min-h-12 text-base justify-start"
					>
						<PortraitIcon className="mr-2 h-4 w-4" />
						{t('CharacterSheetPage.addPortrait')}
					</Button>
				)}

				{onSelectJournal && (
					<Button
						variant="outline"
						onClick={onSelectJournal}
						className="h-auto min-h-12 text-base justify-start"
					>
						<JournalIcon className="mr-2 h-4 w-4" />
						{t('CharacterSheetPage.addJournal')}
					</Button>
				)}
			</div>
		</div>
	);
}
