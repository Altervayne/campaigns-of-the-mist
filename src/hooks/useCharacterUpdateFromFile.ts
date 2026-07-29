// -- React Imports --
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import toast from 'react-hot-toast';

// -- Store Imports --
import { useCharacterActions } from '@/lib/stores/characterStore';
import { getActiveCharacterStore } from '@/lib/character/characterStoreRegistry';

// -- Utils Imports --
import { importFromFile } from '@/lib/utils/export-import';
import { harmonizeData } from '@/lib/harmonization';
import { ACCEPT_ENTITY_IMPORT } from '@/lib/utils/fileAccept';

// -- Type Imports --
import type { Character } from '@/lib/types/character';

/*
 * Update-in-place from a file: overwrite the active character with a picked file's contents while KEEPING
 * its id + drawer link, so every reference-by-id (a board's character element, the drawer copy) stays intact.
 * The pick validates the type then stashes the parsed character; the caller renders the confirm gate, and
 * `confirmUpdate` is the last step before the destructive replace. Destructive, so it always confirms first.
 */
export function useCharacterUpdateFromFile() {
	const { t } = useTranslation();
	const { loadCharacter, setHasUnsavedChanges } = useCharacterActions();
	const [pendingUpdate, setPendingUpdate] = useState<Character | null>(null);

	// Pick a `.cotm`/JSON character file and stash it for the confirm gate.
	const triggerImport = () => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = ACCEPT_ENTITY_IMPORT;
		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file) return;
			try {
				const importedData = await importFromFile(file);
				if (importedData.fileType !== 'FULL_CHARACTER_SHEET' || !getActiveCharacterStore()?.getState().character) {
					toast.error(t('Notifications.general.importFailed'));
				} else {
					setPendingUpdate(harmonizeData(importedData.content, importedData.fileType) as Character);
				}
			} catch (error) {
				console.error('Failed to read character file:', error);
				toast.error(t('Notifications.general.importFailed'));
			}
		};
		input.click();
	};

	const confirmUpdate = () => {
		const current = getActiveCharacterStore()?.getState().character;
		if (!pendingUpdate || !current) { setPendingUpdate(null); return; }
		// Keep this character's identity + drawer link; take everything else from the file. The same id
		// means loadCharacter replaces the active instance in place (no duplicate tab).
		const updated: Character = { ...pendingUpdate, id: current.id, drawerItemId: current.drawerItemId };
		loadCharacter(updated, current.drawerItemId);
		// Overwritten in the working store but not yet pushed to the drawer copy - mark dirty until Save.
		setHasUnsavedChanges(true);
		setPendingUpdate(null);
		toast.success(t('Notifications.character.updated'));
	};

	const cancelUpdate = () => setPendingUpdate(null);

	return { triggerImport, pendingUpdate, confirmUpdate, cancelUpdate };
}
