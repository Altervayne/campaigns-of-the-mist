// -- React Imports --
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MobileBottomSheet } from '@/components/mobile/shared/MobileBottomSheet';



interface MobileAddFolderSheetProps {
	isOpen: boolean;
	onClose: () => void;
	onConfirm: (folderName: string) => void;
}

export default function MobileAddFolderSheet({
	isOpen,
	onClose,
	onConfirm
}: MobileAddFolderSheetProps) {
	const { t } = useTranslation();
	const [folderName, setFolderName] = useState('');

	// Reset folder name when sheet opens
	useEffect(() => {
		if (isOpen) {
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setFolderName('');
		}
	}, [isOpen]);

	const handleConfirm = () => {
		if (folderName.trim()) {
			onConfirm(folderName.trim());
			setFolderName('');
			onClose();
		}
	};

	const handleCancel = () => {
		setFolderName('');
		onClose();
	};

	return (
		<MobileBottomSheet isOpen={isOpen} onClose={handleCancel}>
			<div className="p-4 pb-3 border-b border-border">
				<h2 className="text-lg font-semibold">
					{t('Drawer.Actions.addFolderTitle')}
				</h2>
			</div>

			<div className="p-4 space-y-4">
				<Input
					value={folderName}
					onChange={(e) => setFolderName(e.target.value)}
					placeholder={t('Drawer.folderNamePlaceholder')}
					onKeyDown={(e) => {
						if (e.key === 'Enter') {
							handleConfirm();
						}
					}}
					autoFocus
					className="text-base"
				/>

				<div className="flex gap-2 pb-safe">
					<Button
						variant="outline"
						onClick={handleCancel}
						className="flex-1 cursor-pointer h-11"
					>
						{t('Common.cancel')}
					</Button>
					<Button
						onClick={handleConfirm}
						disabled={!folderName.trim()}
						className="flex-1 cursor-pointer h-11"
					>
						{t('Drawer.Actions.createFolder')}
					</Button>
				</div>
			</div>
		</MobileBottomSheet>
	);
}
