// -- React Imports --
import { useState } from 'react';

// -- Store Imports --
import { useCharacterStore } from '@/lib/stores/characterStore';
import { useTabManagerActions } from '@/lib/character/tabManagerStore';

// -- Hook Imports --
import { useSaveToDrawer } from '@/hooks/useSaveToDrawer';

// -- Utils Imports --
import { saveCharacterToLinkedDrawerItem } from '@/lib/character/characterRepository';

/** Which confirm the sheet shows, chosen by the character's dirty + linked state. */
export type CloseSheetVariant = 'clean' | 'dirty-linked' | 'dirty-unlinked';

/*
 * Close Sheet: leaves the sheet for the menu, DISCARDING the live character (its tab and working row are
 * pruned). On mobile there is no tab UI to reach the working record, so edits made since the last drawer
 * save are lost on close and a never-saved character is lost entirely. The confirm is dirty/link-aware so it
 * never closes over unsaved work silently:
 *  - clean            -> a light confirm; the working record already matches the drawer copy, nothing is lost.
 *  - dirty + linked   -> Save & Close (save the linked copy, THEN close) or Close Without Saving.
 *  - dirty + unlinked -> a never-saved character; Save to Drawer opens the naming flow and does NOT close
 *                        (that save can't be awaited to completion), or Close Without Saving loses it.
 * Only `close` / `saveAndClose` reach the store teardown, and only after any save has resolved.
 */
export function useCloseSheet() {
	const { mobileCloseSheet } = useTabManagerActions();
	const character = useCharacterStore((state) => state.character);
	const hasUnsavedChanges = useCharacterStore((state) => state.hasUnsavedChanges);
	const { saveCharacterAsToDrawer } = useSaveToDrawer();
	const [pendingClose, setPendingClose] = useState(false);

	const variant: CloseSheetVariant = !hasUnsavedChanges
		? 'clean'
		: character?.drawerItemId
			? 'dirty-linked'
			: 'dirty-unlinked';

	const requestClose = () => setPendingClose(true);
	const cancelClose = () => setPendingClose(false);

	// Discard-and-prune: the clean confirm and both "Close Without Saving" buttons. Drops the working row
	// and prunes the tab; safe for the clean case (nothing unsaved), a deliberate loss for the dirty ones.
	const close = () => {
		setPendingClose(false);
		mobileCloseSheet();
	};

	// Dirty + linked: persist the linked drawer copy FIRST, await it, THEN tear down - the working row is
	// never dropped before its save lands. A dangling link (copy deleted) can't be saved this way, so fall
	// back to the naming flow and keep the sheet open rather than close over the unsaved edits.
	const saveAndClose = async () => {
		if (!character) return;
		const { linkedItemUpdated } = await saveCharacterToLinkedDrawerItem(character);
		setPendingClose(false);
		if (!linkedItemUpdated) {
			void saveCharacterAsToDrawer();
			return;
		}
		mobileCloseSheet();
	};

	// Dirty + unlinked: a never-saved character. Open the naming flow (which can't be awaited to
	// completion) and leave the sheet live; once named and linked, a later close takes the linked path.
	const saveToDrawer = () => {
		setPendingClose(false);
		void saveCharacterAsToDrawer();
	};

	return { pendingClose, variant, requestClose, cancelClose, close, saveAndClose, saveToDrawer };
}
