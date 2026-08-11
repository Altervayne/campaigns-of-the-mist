// -- React Imports --
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Basic UI Imports --
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';

// -- Component Imports --
import { MobileBottomSheet } from '@/components/mobile/shared/MobileBottomSheet';
import { TokenSwatch } from '@/components/molecules/theme/TokenSwatch';
import { HexInput } from '@/components/molecules/theme/HexInput';
import { InfoTip } from '@/components/molecules/theme/InfoTip';
import { CardPalettePreviews } from '@/components/organisms/dialogs/settings/CardPalettePreviews';

// -- Icon Imports --
import { ChevronLeft, Save } from 'lucide-react';

// -- Utils and Store Imports --
import { cn } from '@/lib/utils';
import { PAPER_GROUPS } from '@/lib/theme/themeTokens';
import { CARD_TYPES_BY_GAME, cardPaletteFieldsEqual } from '@/lib/theme/cardPalettes';
import { useAppSettingsStore, useAppSettingsActions } from '@/lib/stores/appSettingsStore';

// -- Type Imports --
import type { PaperTokenKey } from '@/lib/theme/themeTokens';

/*
 * The mobile card-palette editor: one card type of the palette's game is selected at a time, and its paper
 * tokens are edited through the draft, so the live preview - and the whole app, if this palette is active for
 * its game - updates as you edit. It edits whichever palette the list handed off through the draft; Save
 * persists (enabled only when dirty), and leaving with unsaved edits confirms first.
 */

interface MobileCardPaletteEditorProps {
	onBack?: () => void;
}

export default function MobileCardPaletteEditor({ onBack }: MobileCardPaletteEditorProps) {
	const { t } = useTranslation();
	const cardPalettes = useAppSettingsStore((state) => state.cardPalettes);
	const cardPaletteDraft = useAppSettingsStore((state) => state.cardPaletteDraft);
	const { beginCardPaletteDraft, patchCardPaletteDraft, saveCardPaletteDraft, discardCardPaletteDraft } = useAppSettingsActions();

	// The editor edits whichever palette the list handed off through the draft. Resolve the saved palette by the
	// draft's id (the two match, since the draft started as its copy).
	const editingId = cardPaletteDraft?.id;
	const palette = editingId ? cardPalettes.find((entry) => entry.id === editingId) ?? null : null;
	const game = palette?.game;

	const [slug, setSlug] = useState<string>('');
	const [confirmLeave, setConfirmLeave] = useState(false);

	// Restart the draft from the fresh saved palette on entry (or when the edited palette changes), so a rename
	// made in the list isn't clobbered.
	useEffect(() => {
		if (!editingId) return;
		const saved = useAppSettingsStore.getState().cardPalettes.find((entry) => entry.id === editingId);
		if (saved) beginCardPaletteDraft(saved);
	}, [editingId, beginCardPaletteDraft]);

	// Reached only after the list begins a draft, so this is defensive: back out if there is nothing to edit.
	if (!palette || !game) {
		return (
			<div className="h-full flex flex-col items-center justify-center gap-4 p-6 pt-[calc(1.5rem+env(safe-area-inset-top))]">
				<p className="text-center text-muted-foreground">{t('SettingsDialog.cardPalettes.noActivePalette')}</p>
				<Button onClick={onBack} className="cursor-pointer">{t('SettingsDialog.dangerZone.resetDialog.cancel')}</Button>
			</div>
		);
	}

	// Render from the draft once it matches this palette; until then fall back to the saved palette (identical,
	// since the draft starts as a copy).
	const draft = cardPaletteDraft && cardPaletteDraft.id === palette.id ? cardPaletteDraft : palette;
	const dirty = cardPaletteDraft !== null && cardPaletteDraft.id === palette.id && !cardPaletteFieldsEqual(cardPaletteDraft, palette);

	const cardTypes = CARD_TYPES_BY_GAME[game];
	// Fall back to the game's first card type until the user picks one (or when the stored pick is off-game).
	const activeSlug = cardTypes.some((def) => def.slug === slug) ? slug : cardTypes[0].slug;
	const activeSet = draft.cardTypes[activeSlug];

	const setToken = (token: PaperTokenKey, hex: string) => {
		const current = draft.cardTypes[activeSlug];
		if (!current) return;
		patchCardPaletteDraft({ cardTypes: { ...draft.cardTypes, [activeSlug]: { ...current, [token]: hex } } });
	};

	const handleBack = () => { if (dirty) setConfirmLeave(true); else onBack?.(); };

	return (
		<div className="h-full flex flex-col">
			{/* Sticky header: back + palette name + Save. */}
			<div className="shrink-0 border-b border-border bg-background pt-safe">
				<div className="flex items-center gap-2 px-4 py-2">
					<IconButton variant="ghost" size="lg" onClick={handleBack} className="h-10 w-10 p-0">
						<ChevronLeft className="h-8 w-8" />
					</IconButton>
					<span className="min-w-0 flex-1 truncate text-lg font-semibold">{draft.name}</span>
					<Button onClick={saveCardPaletteDraft} disabled={!dirty} className="h-10 shrink-0 cursor-pointer">
						<Save className="mr-1 h-4 w-4" />{t('SettingsDialog.themes.saveChanges')}
					</Button>
				</div>
			</div>

			<div className="flex-1 overflow-y-auto p-4 space-y-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
				{/* Card-type selector: a wrapping chip row, one card type editable at a time. */}
				<div className="flex flex-col gap-1.5">
					<span className="text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground">{t('SettingsDialog.cardPalettes.cardTypeLabel')}</span>
					<div className="flex flex-wrap gap-1.5">
						{cardTypes.map((def) => {
							const isActive = def.slug === activeSlug;
							return (
								<button
									key={def.slug}
									type="button"
									onClick={() => setSlug(def.slug)}
									className={cn(
										'cursor-pointer rounded-md border px-3 py-1.5 text-sm transition-colors',
										isActive
											? 'border-primary bg-primary text-primary-foreground'
											: 'border-border bg-muted text-muted-foreground hover:text-foreground',
									)}
								>
									{t(def.labelKey)}
								</button>
							);
						})}
					</div>
				</div>

				{activeSet ? (
					<>
						{/* Live previews of the selected card type under its DRAFT paper, so edits show at once. */}
						<CardPalettePreviews set={activeSet} />

						{/* Per-token rows, reusing the shared paper groups/labels (a card token is its paper twin). */}
						<div className="flex flex-col gap-4">
							{PAPER_GROUPS.map((group) => (
								<div key={group.id} className="flex flex-col gap-1 rounded-md border border-border/60 p-2">
									<span className="text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground">{t(`SettingsDialog.themes.paper.groups.${group.id}`)}</span>
									{group.tokens.map((token) => {
										const tokenLabel = t(`SettingsDialog.themes.paper.tokens.${token}`);
										return (
											<div key={token} className="flex items-center gap-2">
												<div className="flex min-w-0 flex-1 items-center gap-1">
													<span className="truncate text-sm">{tokenLabel}</span>
													<InfoTip text={t(`SettingsDialog.themes.paper.tokenPurpose.${token}`)} isMobile />
												</div>
												<TokenSwatch value={activeSet[token]} label={tokenLabel} onPick={(hex) => setToken(token, hex)} isMobile />
												<HexInput value={activeSet[token]} label={tokenLabel} onCommit={(hex) => setToken(token, hex)} className="w-24" isMobile />
											</div>
										);
									})}
								</div>
							))}
						</div>
					</>
				) : (
					<p className="px-1 py-2 text-sm text-muted-foreground">{t('SettingsDialog.cardPalettes.cardTypeMissing')}</p>
				)}
			</div>

			{/* Dirty-guard on leave: discard the draft and go, or stay. A clean draft leaves directly. */}
			<MobileBottomSheet isOpen={confirmLeave} onClose={() => setConfirmLeave(false)}>
				<div className="p-4 pb-3 border-b border-border">
					<h2 className="text-lg font-semibold">{t('SettingsDialog.themes.discardTitle')}</h2>
					<p className="text-sm text-muted-foreground mt-2">{t('SettingsDialog.cardPalettes.discardBody')}</p>
				</div>
				<div className="p-4">
					<div className="flex gap-2 pb-safe">
						<Button variant="outline" onClick={() => setConfirmLeave(false)} className="flex-1 h-11 cursor-pointer">
							{t('SettingsDialog.dangerZone.resetDialog.cancel')}
						</Button>
						<Button
							variant="destructive"
							onClick={() => { discardCardPaletteDraft(); setConfirmLeave(false); onBack?.(); }}
							className="flex-1 h-11 cursor-pointer"
						>
							{t('SettingsDialog.themes.discardConfirm')}
						</Button>
					</div>
				</div>
			</MobileBottomSheet>
		</div>
	);
}
