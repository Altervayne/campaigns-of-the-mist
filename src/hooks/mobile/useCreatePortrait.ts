// -- Store Imports --
import { useCharacterActions } from '@/lib/stores/characterStore';
import { getActiveCharacterStore } from '@/lib/character/characterStoreRegistry';

// -- Hook Imports --
import { useImageUpload } from '@/hooks/useImageUpload';



/**
 * Portrait creation for the mobile sheet: mint the singleton `IMAGE_CARD`, then pick and free-crop its
 * image. The image lands on the singleton resolved fresh at pick time, so the async crop never closes over
 * a stale id.
 *
 * The caller renders `fileInputRef`/`handleFileSelected` on a hidden file input and `cropperDialog` in its
 * tree. It lives at page level because the creator that offers Portrait is a full-screen tab, which unmounts
 * the sheet.
 */
export function useCreatePortrait() {
	const { addPortrait, setCardImage } = useCharacterActions();

	const { fileInputRef, open, handleFileSelected, cropperDialog } = useImageUpload(
		(hash) => {
			const portrait = getActiveCharacterStore()?.getState().character?.cards.find((c) => c.cardType === 'IMAGE_CARD');
			if (portrait) setCardImage(portrait.id, hash);
		},
		{ aspect: 'free' },
	);

	const createPortrait = () => {
		addPortrait();
		open();
	};

	return { createPortrait, fileInputRef, handleFileSelected, cropperDialog };
}
