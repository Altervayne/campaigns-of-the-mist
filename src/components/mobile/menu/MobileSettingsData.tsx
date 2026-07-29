// -- React Imports --
import { useRef, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import toast from 'react-hot-toast';

// -- Basic UI Imports --
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

// -- Icon Imports --
import { AlertTriangle, Trash2, OctagonMinus, DatabaseBackup, HardDrive, FolderUp, ChevronRight, Download, Upload } from 'lucide-react';

// -- Component Imports --
import { MobileSettingsSubScreen } from '@/components/mobile/menu/MobileSettingsSubScreen';
import { MobileSettingsConfirmationDialog } from '@/components/mobile/menu/MobileSettingsConfirmationDialog';
import { MigrationDialog } from '@/components/organisms/dialogs/MigrationDialog';
import { LegacyDrawerBackupDialog } from '@/components/organisms/dialogs/LegacyDrawerBackupDialog';
import { LegacyCharacterBackupDialog } from '@/components/organisms/dialogs/LegacyCharacterBackupDialog';

// -- Store and Hook Imports --
import { useDataSettingsActions } from '@/hooks/useDataSettingsActions';
import { exportEntireDrawerAsNestedTree } from '@/lib/drawer/drawerRepository';
import { exportDrawer } from '@/lib/utils/export-import';
import { ACCEPT_BACKUP_RESTORE } from '@/lib/utils/fileAccept';

interface MobileSettingsDataProps {
	onBack?: () => void;
}

/** Data & storage settings: storage reclaim, drawer export, legacy migration, and the fenced Danger Zone. */
export default function MobileSettingsData({ onBack }: MobileSettingsDataProps) {
	const { t } = useTranslation();

	const {
		isResetAppDialogOpen, setIsResetAppDialogOpen,
		isDeleteDrawerDialogOpen, setIsDeleteDrawerDialogOpen,
		handleAppReset, handleDeleteDrawer,
		handleExportBackup, handleRestoreBackupFile, handleConfirmRestore,
		isRestoreBackupDialogOpen, setIsRestoreBackupDialogOpen,
		isMigrationDialogOpen, setIsMigrationDialogOpen,
		isLegacyBackupDialogOpen, setIsLegacyBackupDialogOpen,
		isLegacyCharacterBackupDialogOpen, setIsLegacyCharacterBackupDialogOpen,
		legacyBlobRemovable, refreshLegacyBlobRemovable,
		legacyCharacterRemovable, refreshLegacyCharacterRemovable,
		storageUsageBytes, isReclaiming, formatMegabytes, handleReclaimImageSpace,
	} = useDataSettingsActions();

	// Hidden picker for the restore flow; resetting its value lets the same file be re-picked.
	const restoreInputRef = useRef<HTMLInputElement>(null);
	const onRestoreFileChange = (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (file) void handleRestoreBackupFile(file);
		event.target.value = '';
	};

	const handleExportDrawer = () => {
		void (async () => {
			try {
				const drawer = await exportEntireDrawerAsNestedTree();
				exportDrawer(drawer);
				toast.success(t('Notifications.drawer.exported'));
			} catch {
				toast.error(t('Notifications.drawer.actionFailed'));
			}
		})();
	};

	return (
		<MobileSettingsSubScreen title={t('SettingsShell.sections.data')} onBack={onBack}>
			{/* Storage usage + reclaim */}
			<div className="space-y-2">
				<Label className="text-sm font-semibold">{t('SettingsDialog.storage.label')}</Label>
				<div className="flex items-center gap-3">
					<span className="flex-1 min-w-0 truncate text-sm text-muted-foreground">
						{storageUsageBytes === null
							? t('SettingsDialog.storage.usageUnavailable')
							: t('SettingsDialog.storage.usageUsed', { mb: formatMegabytes(storageUsageBytes) })}
					</span>
					<Button
						variant="outline"
						onClick={handleReclaimImageSpace}
						disabled={isReclaiming}
						className="h-12 min-w-0"
					>
						<HardDrive className="mr-2 h-5 w-5 shrink-0" />
						<span className="truncate">{t('SettingsDialog.storage.reclaimButton')}</span>
					</Button>
				</div>
			</div>

			{/* Export the whole drawer as a nested tree file */}
			<div className="space-y-2">
				<Label className="text-sm font-semibold">{t('Drawer.Actions.exportFull')}</Label>
				<Button
					onClick={handleExportDrawer}
					variant="default"
					className="w-full h-12 text-base justify-start"
				>
					<FolderUp className="mr-3 h-5 w-5 shrink-0" />
					<span className="flex-1 text-left truncate">{t('Drawer.Actions.exportFull')}</span>
					<ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
				</Button>
			</div>

			{/* Full backup / restore */}
			<div className="space-y-2">
				<Label className="text-sm font-semibold">{t('SettingsDialog.backup.label')}</Label>
				<Button
					onClick={handleExportBackup}
					variant="default"
					className="w-full h-12 text-base justify-start"
				>
					<Download className="mr-3 h-5 w-5 shrink-0" />
					<span className="flex-1 text-left truncate">{t('SettingsDialog.backup.exportButton')}</span>
					<ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
				</Button>
				<Button
					onClick={() => restoreInputRef.current?.click()}
					variant="outline"
					className="w-full h-12 text-base justify-start"
				>
					<Upload className="mr-3 h-5 w-5 shrink-0" />
					<span className="flex-1 text-left truncate">{t('SettingsDialog.backup.restoreButton')}</span>
					<ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
				</Button>
				<p className="text-xs text-muted-foreground">{t('SettingsDialog.backup.description')}</p>
				<input ref={restoreInputRef} type="file" accept={ACCEPT_BACKUP_RESTORE} onChange={onRestoreFileChange} className="hidden" />
			</div>

			{/* Migration */}
			<div className="space-y-2">
				<Label className="text-sm font-semibold">{t('SettingsDialog.migration.label')}</Label>
				<Button
					onClick={() => setIsMigrationDialogOpen(true)}
					variant="default"
					className="w-full h-12 text-base justify-start"
				>
					<DatabaseBackup className="mr-3 h-5 w-5 shrink-0" />
					<span className="flex-1 text-left">{t('SettingsDialog.migration.button')}</span>
					<ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
				</Button>
			</div>

			{/* Danger Zone */}
			<div className="space-y-3 rounded-lg border-2 border-destructive bg-destructive/5 p-4 mt-8">
				<div className="flex items-start gap-3">
					<AlertTriangle className="h-6 w-6 text-destructive shrink-0 mt-0.5" />
					<div>
						<h3 className="font-semibold text-base">{t('SettingsDialog.dangerZone.title')}</h3>
						<p className="text-sm text-muted-foreground mt-1">{t('SettingsDialog.dangerZone.description')}</p>
					</div>
				</div>

				<div className="space-y-2 mt-4">
					<Button
						variant="destructive"
						className="w-full h-12 text-base justify-start"
						onClick={() => setIsDeleteDrawerDialogOpen(true)}
					>
						<Trash2 className="mr-3 h-5 w-5 shrink-0" />
						<span>{t('SettingsDialog.dangerZone.deleteDrawerButton')}</span>
					</Button>
					<Button
						variant="destructive"
						className="w-full h-12 text-base justify-start"
						onClick={() => setIsResetAppDialogOpen(true)}
					>
						<OctagonMinus className="mr-3 h-5 w-5 shrink-0" />
						<span>{t('SettingsDialog.dangerZone.resetButton')}</span>
					</Button>
					{/* Legacy backup cleanup - shown only when the migration is
					    verified and the blob is still present; removal is gated on a
					    backup export + explicit confirm inside the dialog. */}
					{legacyBlobRemovable && (
						<Button
							variant="outline"
							className="w-full h-12 text-base justify-start"
							onClick={() => setIsLegacyBackupDialogOpen(true)}
						>
							<span className="truncate">{t('SettingsDialog.legacyBackup.actionLabel')}</span>
						</Button>
					)}
					{legacyCharacterRemovable && (
						<Button
							variant="outline"
							className="w-full h-12 text-base justify-start"
							onClick={() => setIsLegacyCharacterBackupDialogOpen(true)}
						>
							<span className="truncate">{t('SettingsDialog.legacyCharacterBackup.actionLabel')}</span>
						</Button>
					)}
				</div>
			</div>

			{/* Dialogs */}
			<MigrationDialog
				isOpen={isMigrationDialogOpen}
				onOpenChange={setIsMigrationDialogOpen}
			/>

			<MobileSettingsConfirmationDialog
				open={isDeleteDrawerDialogOpen}
				onOpenChange={setIsDeleteDrawerDialogOpen}
				onConfirm={handleDeleteDrawer}
				title={t('SettingsDialog.dangerZone.deleteDrawerDialog.title')}
				description={t('SettingsDialog.dangerZone.deleteDrawerDialog.description')}
				confirmationText="DELETE DRAWER"
				confirmButtonText={t('SettingsDialog.dangerZone.deleteDrawerDialog.confirm')}
			/>

			<MobileSettingsConfirmationDialog
				open={isRestoreBackupDialogOpen}
				onOpenChange={setIsRestoreBackupDialogOpen}
				onConfirm={handleConfirmRestore}
				title={t('SettingsDialog.backup.restoreDialog.title')}
				description={t('SettingsDialog.backup.restoreDialog.description')}
				confirmationText="REPLACE ALL MY DATA"
				confirmButtonText={t('SettingsDialog.backup.restoreDialog.confirm')}
			/>

			<MobileSettingsConfirmationDialog
				open={isResetAppDialogOpen}
				onOpenChange={setIsResetAppDialogOpen}
				onConfirm={handleAppReset}
				title={t('SettingsDialog.dangerZone.resetDialog.title')}
				description={t('SettingsDialog.dangerZone.resetDialog.description')}
				confirmationText="DELETE ALL MY APP DATA"
				confirmButtonText={t('SettingsDialog.dangerZone.resetDialog.confirm')}
			/>

			<LegacyDrawerBackupDialog
				isOpen={isLegacyBackupDialogOpen}
				onOpenChange={setIsLegacyBackupDialogOpen}
				onRemoved={refreshLegacyBlobRemovable}
			/>

			<LegacyCharacterBackupDialog
				isOpen={isLegacyCharacterBackupDialogOpen}
				onOpenChange={setIsLegacyCharacterBackupDialogOpen}
				onRemoved={refreshLegacyCharacterRemovable}
			/>
		</MobileSettingsSubScreen>
	);
}
