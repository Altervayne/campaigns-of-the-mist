// -- Library Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { Edit } from 'lucide-react';

// -- Component Imports --
import { Toggle } from '@/components/ui/toggle';

// -- Store Imports --
import { useAppGeneralStateStore } from '@/lib/stores/appGeneralStateStore';

// -- Utils Imports --
import { triggerHaptic } from '@/lib/utils/haptics';



/*
 * Edit mode as one pressed-state button on the sheet tab bar, so the row also acts as the sheet's
 * persistent edit-state indicator - mobile had none. The icon and the label are fixed; only the pressed
 * state changes, so `aria-pressed` is the whole state report for assistive tech. The 40px control fits
 * inside the tab row's existing height, so it costs no vertical space, and it does not mirror for
 * handedness: it is reading-order chrome, deliberately outside the thumb arc so a mode flip can't be a
 * stray tap.
 * Its `data-tutorial` key is its own: `edit-mode-toggle` already belongs to the desktop sidebar button, and
 * a second node under that key makes the spotlight ambiguous.
 */
export function MobileSheetModeToggle() {
	const { t } = useTranslation();
	const isEditing = useAppGeneralStateStore((state) => state.isEditing);
	const { setIsEditing } = useAppGeneralStateStore((state) => state.actions);

	return (
		<Toggle
			variant="outline"
			size="lg"
			pressed={isEditing}
			onPressedChange={(pressed) => {
				triggerHaptic();
				setIsEditing(pressed);
			}}
			aria-label={t('MobileCharacterSheet.modeToggle')}
			data-tutorial="sheet-mode-toggle"
			className="mr-2 shrink-0 cursor-pointer text-muted-foreground data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
		>
			<Edit className="size-5" />
		</Toggle>
	);
}
