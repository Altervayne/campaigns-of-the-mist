// -- Library Imports --
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';



type CardTypeSelection = 'CHARACTER_THEME' | 'GROUP_THEME' | 'LOADOUT_THEME';

interface MobileAddCardStartingTagsProps {
	cardType: CardTypeSelection;
	powerTagsCount: number;
	setPowerTagsCount: (value: number) => void;
	weaknessTagsCount: number;
	setWeaknessTagsCount: (value: number) => void;
	wildcardSlots: number;
	setWildcardSlots: (value: number) => void;
}

/**
 * The starting-tags number fields shown when creating a card: the power/gear tag
 * count, the weakness/flaw tag count, and (for LOADOUT_THEME only) the wildcard
 * slots. Purely presentational - the parent owns the counts and passes them in
 * with their setters. `cardType` only drives the gear/flaw label wording and the
 * wildcard field's visibility; the create-mode gate stays with the parent.
 */
export function MobileAddCardStartingTags({ cardType, powerTagsCount, setPowerTagsCount, weaknessTagsCount, setWeaknessTagsCount, wildcardSlots, setWildcardSlots }: MobileAddCardStartingTagsProps) {
	const { t } = useTranslation();

	return (
		<div className="pt-4">
			<h3 className="text-sm font-semibold mb-4">{t("CreateCardDialog.startingTagsLabel")}</h3>
			<div className="space-y-4">
				{/* Power/Gear Tags */}
				<div className="space-y-2">
					<Label htmlFor="power-tags" className="text-sm">
						{cardType === 'LOADOUT_THEME' ? t('CreateCardDialog.gearTagCountLabel') : t('CreateCardDialog.powerTagCountLabel')}
					</Label>
					<Input
						id="power-tags"
						type="number"
						min={0}
						value={powerTagsCount}
						onChange={e => setPowerTagsCount(Number(e.target.value))}
						className="text-base"
					/>
				</div>

				{/* Weakness/Flaw Tags */}
				<div className="space-y-2">
					<Label htmlFor="weakness-tags" className="text-sm">
						{cardType === 'LOADOUT_THEME' ? t('Common.flaws') : t('CreateCardDialog.weaknessTagCountLabel')}
					</Label>
					<Input
						id="weakness-tags"
						type="number"
						min={0}
						value={weaknessTagsCount}
						onChange={e => setWeaknessTagsCount(Number(e.target.value))}
						className="text-base"
					/>
				</div>

				{/* Wildcard Slots (only for LOADOUT_THEME) */}
				{cardType === 'LOADOUT_THEME' && (
					<div className="space-y-2">
						<Label htmlFor="wildcard-slots" className="text-sm">
							{t('Common.wildcardSlots')}
						</Label>
						<Input
							id="wildcard-slots"
							type="number"
							min={0}
							value={wildcardSlots}
							onChange={e => setWildcardSlots(Number(e.target.value))}
							className="text-base"
						/>
					</div>
				)}
			</div>
		</div>
	);
}
