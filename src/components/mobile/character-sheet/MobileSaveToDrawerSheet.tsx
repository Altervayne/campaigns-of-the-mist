// -- React Imports --
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MobileBottomSheet } from '@/components/mobile/shared/MobileBottomSheet';



interface MobileSaveToDrawerSheetProps {
	isOpen: boolean;
	onClose: () => void;
	onConfirm: (name: string) => void;
	defaultName: string;
}

export default function MobileSaveToDrawerSheet({
	isOpen,
	onClose,
	onConfirm,
	defaultName
}: MobileSaveToDrawerSheetProps) {
	const { t } = useTranslation();
	const [itemName, setItemName] = useState('');

	useEffect(() => {
		if (isOpen) {
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setItemName(defaultName);
		}
	}, [isOpen, defaultName]);

	const handleConfirm = () => {
		if (itemName.trim()) {
			onConfirm(itemName.trim());
			setItemName('');
			onClose();
		}
	};

	const handleCancel = () => {
		setItemName('');
		onClose();
	};

	return (
		<MobileBottomSheet isOpen={isOpen} onClose={handleCancel}>
			<div className="p-4 pb-3 border-b border-border">
				<h2 className="text-lg font-semibold">
					{t('MobileSaveToDrawerSheet.title')}
				</h2>
			</div>

			<div className="p-4 space-y-4">
				<Input
					value={itemName}
					onChange={(e) => setItemName(e.target.value)}
					placeholder={t('MobileSaveToDrawerSheet.placeholder')}
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
						disabled={!itemName.trim()}
						className="flex-1 cursor-pointer h-11"
					>
						{t('MobileSaveToDrawerSheet.confirm')}
					</Button>
				</div>
			</div>
		</MobileBottomSheet>
	);
}
