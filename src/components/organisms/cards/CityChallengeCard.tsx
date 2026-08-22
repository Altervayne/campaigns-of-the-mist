// -- React Imports --
import React, { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

// -- Basic UI Imports --
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

// -- Icon Imports --
import { Gauge, Pencil, Skull } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Component Imports --
import { CardHeaderMolecule } from '@/components/molecules/cards/CardHeader';
import { CardSectionHeader } from '@/components/molecules/cards/CardSectionHeader';
import { CardFlipWrapper } from '@/components/molecules/cards/CardFlipWrapper';
import { MentionMarkdown } from '@/components/molecules/MentionMarkdown';
import { AddRowButton, CustomMoveEditRow, DifficultyMarks, LimitPill, MoveEditRow, MoveList, PrimaryTypePicker, StatusEditRow, ThreatPill } from '@/components/organisms/cards/challengeCardEditRows';
import type { RowListOps } from '@/components/organisms/cards/challengeCardEditRows';
import { ExpandedCityChallengeSheet } from '@/components/organisms/cards/ExpandedCityChallengeSheet';

// -- Store and Hook Imports --
import { useCharacterActions } from '@/lib/stores/characterStore';
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';
import { useToolbarReveal } from '@/hooks/toolbarReveal';
import { useCardViewMode } from '@/hooks/useCardViewMode';
import { useAssetObjectUrl } from '@/hooks/useAssetObjectUrl';
import { useInputDebouncer } from '@/hooks/useInputDebouncer';
import { useManualScroll } from '@/hooks/useManualScroll';
import { useSheetMentionCreate } from '@/hooks/character-sheet/useSheetMentionCreate';
import { useLiveCardDetails } from '@/hooks/character-sheet/useLiveCardDetails';

// -- Utils Imports --
import { addRow, cityChallengePaletteClass, newCustomMove, newHardMove, newSoftMove, newStatus, primaryTypeColor, removeRowById, updateRowById } from '@/lib/cards/challengeCardFactories';

// -- Type Imports --
import type { CardComponentProps } from '@/components/organisms/cards/resolveCardComponent';
import type { ChallengeDetails, ChallengeStatus, CityChallengeDetails, CityCustomMove, CityMove } from '@/lib/types/character';

/*
 * The City of Mist Challenge Card - its own shape, not a shared-floor variant. Front = image / name /
 * subtitles (Logos + Mythos) / difficulty (stars) / flavor; back = Spectrums / Custom Moves / Hard Moves /
 * Soft Moves. `primaryType` is a colour theme only (Logos = orange, Mythos = purple). Flavor / subtitles /
 * spectrums / moves are editable in place while `isEditing`; the full form lives in the dialog editor.
 * Inline edits share the row factories (`challengeCardFactories`) and commit through `updateCardDetails`.
 */

/** A subtitle line under the name: a small accent label + the italic short text (read mode, non-empty only). */
function SubtitleLine({ label, text, small }: { label: string; text: string; small?: boolean }) {
   return (
      <p className={cn('px-2 text-center text-card-paper-fg/70', small ? 'text-[0.65rem]' : 'text-sm')}>
         <span className="font-semibold not-italic text-card-accent">{label}</span>
         <span className="italic"> · {text}</span>
      </p>
   );
}

export const CityChallengeCard = React.memo(
   React.forwardRef<HTMLDivElement, CardComponentProps>(
      ({ card, isEditing = false, isSnapshot, isDrawerPreview, isBoardEmbed = false, isMobile = false, useVerticalStack, dragAttributes, dragListeners, onEditCard, onExport, onMentionClick, isExpanded = false }, ref) => {
         const { t } = useTranslation();
         const actions = useCharacterActions();
         const details = card.details as CityChallengeDetails;
         const cardThemeClass = cityChallengePaletteClass(details.primaryType);

         const { isRevealed, revealHandlers } = useToolbarReveal(card.id, isDrawerPreview);
         const { url } = useAssetObjectUrl(details.assetId);

         const globalCardViewMode = useAppSettingsStore((state) => state.isSideBySideView ? 'SIDE_BY_SIDE' : 'FLIP');
         const effectiveViewMode = useMemo(() => card.viewMode || globalCardViewMode, [card.viewMode, globalCardViewMode]);
         const { handleCycleViewMode } = useCardViewMode(card);

         // Each back section scrolls its own overflow under a pinned header (mirrors the LitM challenge wells).
         const spectrumsScrollRef = useRef<HTMLDivElement>(null);
         const customMovesScrollRef = useRef<HTMLDivElement>(null);
         const hardMovesScrollRef = useRef<HTMLDivElement>(null);
         const softMovesScrollRef = useRef<HTMLDivElement>(null);
         useManualScroll(spectrumsScrollRef);
         useManualScroll(customMovesScrollRef);
         useManualScroll(hardMovesScrollRef);
         useManualScroll(softMovesScrollRef);

         const name = card.title || t('Cards.challenge.untitled');
         const stars = Math.max(0, Math.min(10, details.challengeLevel));

         // Flavor + name + subtitles: hook state stays above the `isEditing` branch so flipping the card or
         // toggling edit mode never remounts a field and drops a pending edit.
         const [localFlavor, setLocalFlavor] = useInputDebouncer(
            details.flavor,
            (value) => actions.updateCardDetails(card.id, { flavor: value }),
         );
         const [localTitle, setLocalTitle] = useInputDebouncer(
            card.title,
            (value) => actions.updateCardTitle(card.id, value),
         );
         const [localLogos, setLocalLogos] = useInputDebouncer(
            details.logosSubtitle,
            (value) => actions.updateCardDetails(card.id, { logosSubtitle: value }),
         );
         const [localMythos, setLocalMythos] = useInputDebouncer(
            details.mythosSubtitle,
            (value) => actions.updateCardDetails(card.id, { mythosSubtitle: value }),
         );

         // Every row commit composes over the live read, so two fields flushing together can't clobber
         // (`set` is synchronous). The game guard narrows the stored union back to the City shape.
         const liveCardDetails = useLiveCardDetails<ChallengeDetails>(card.id, details);
         const liveDetails = (): CityChallengeDetails => {
            const live = liveCardDetails();
            return live.game === 'CITY_OF_MIST' ? live : details;
         };

         const commitSpectrums = (next: ChallengeStatus[]) => actions.updateCardDetails(card.id, { spectrums: next });
         const commitCustomMoves = (next: CityCustomMove[]) => actions.updateCardDetails(card.id, { customMoves: next });
         const commitHardMoves = (next: CityMove[]) => actions.updateCardDetails(card.id, { hardMoves: next });
         const commitSoftMoves = (next: CityMove[]) => actions.updateCardDetails(card.id, { softMoves: next });

         const commitSpectrumById = (id: string, updates: Partial<ChallengeStatus>) => commitSpectrums(updateRowById(liveDetails().spectrums, id, updates));
         const removeSpectrumById = (id: string) => commitSpectrums(removeRowById(liveDetails().spectrums, id));
         const addSpectrum = () => commitSpectrums(addRow(liveDetails().spectrums, newStatus()));

         const commitCustomMoveById = (id: string, updates: Partial<CityCustomMove>) => commitCustomMoves(updateRowById(liveDetails().customMoves, id, updates));
         const removeCustomMoveById = (id: string) => commitCustomMoves(removeRowById(liveDetails().customMoves, id));
         const addCustomMove = () => commitCustomMoves(addRow(liveDetails().customMoves, newCustomMove()));

         const commitHardMoveById = (id: string, updates: Partial<CityMove>) => commitHardMoves(updateRowById(liveDetails().hardMoves, id, updates));
         const removeHardMoveById = (id: string) => commitHardMoves(removeRowById(liveDetails().hardMoves, id));
         const addHardMove = () => commitHardMoves(addRow(liveDetails().hardMoves, newHardMove()));

         const commitSoftMoveById = (id: string, updates: Partial<CityMove>) => commitSoftMoves(updateRowById(liveDetails().softMoves, id, updates));
         const removeSoftMoveById = (id: string) => commitSoftMoves(removeRowById(liveDetails().softMoves, id));
         const addSoftMove = () => commitSoftMoves(addRow(liveDetails().softMoves, newSoftMove()));

         // The same by-id ops bundled for the expanded sheet, which renders its own copy of these rows.
         const spectrumOps: RowListOps<ChallengeStatus> = { commitById: commitSpectrumById, removeById: removeSpectrumById, add: addSpectrum };
         const customMoveOps: RowListOps<CityCustomMove> = { commitById: commitCustomMoveById, removeById: removeCustomMoveById, add: addCustomMove };
         const hardMoveOps: RowListOps<CityMove> = { commitById: commitHardMoveById, removeById: removeHardMoveById, add: addHardMove };
         const softMoveOps: RowListOps<CityMove> = { commitById: commitSoftMoveById, removeById: removeSoftMoveById, add: addSoftMove };

         // Discrete clicks (no debounce), each reading live details so it can't stomp a sibling mid-flush.
         const commitPrimaryType = (primaryType: CityChallengeDetails['primaryType']) => actions.updateCardDetails(card.id, { primaryType });
         const commitLevel = (level: number) => actions.updateCardDetails(card.id, { challengeLevel: Math.max(0, Math.min(10, level)) });
         const commitImage = (assetId: string | null) => actions.updateCardDetails(card.id, { assetId });

         // A tapped mention applies to the active character (create-or-raise) on the live sheet card; a board
         // embed routes taps to the board via `onMentionClick`; a static preview / snapshot stays plain.
         const handleMentionClick = useSheetMentionCreate();
         const mentionClick = isBoardEmbed
            ? onMentionClick
            : (!isDrawerPreview && !isSnapshot) ? handleMentionClick : undefined;

         const cardShell = cn(
            isMobile ? 'w-full h-full' : 'w-62.5 h-150',
            'flex flex-col border-2 shadow-lg p-0 overflow-hidden gap-0',
            'bg-card-paper-bg text-card-paper-fg border-card-border',
            'relative z-0',
            cardThemeClass,
            { 'h-30 shadow-none pointer-events-none border-2 border-card-border': isDrawerPreview },
         );

         const CardFront = (
            <Card className={cardShell}>
               {/* Image banner (front art). */}
               <div className={cn('w-full shrink-0 overflow-hidden bg-muted', isDrawerPreview ? 'h-12' : 'h-52')}>
                  {url ? (
                     <img src={url} alt={name} title={name} draggable={false} className="h-full w-full object-cover" />
                  ) : (
                     <div className="flex h-full w-full items-center justify-center text-card-paper-fg/30">
                        <Skull className={isDrawerPreview ? 'h-6 w-6' : 'h-12 w-12'} />
                     </div>
                  )}
               </div>

               <h2 className={cn('shrink-0 px-2 pt-2 text-center font-bold', isDrawerPreview ? 'text-sm' : 'text-xl')}>{name}</h2>

               {/* Subtitles: a Logos line + a Mythos line, each shown when it carries text. */}
               <div className="shrink-0 pb-1">
                  {details.logosSubtitle && <SubtitleLine label={t('ThemeTypes.Logos')} text={details.logosSubtitle} small={isDrawerPreview} />}
                  {details.mythosSubtitle && <SubtitleLine label={t('ThemeTypes.Mythos')} text={details.mythosSubtitle} small={isDrawerPreview} />}
               </div>

               {/* Difficulty divider (cosmetic): stars. */}
               <div className="flex shrink-0 items-center justify-center gap-0.5 border-y border-card-accent/30 py-1 text-card-accent">
                  <DifficultyMarks game={details.game} count={stars} className={isDrawerPreview ? 'h-3 w-3' : 'h-4 w-4'} />
               </div>

               {!isDrawerPreview && (
                  <div className="min-w-0 grow overflow-y-auto overflow-x-hidden overscroll-contain">
                     {isEditing ? (
                        <div className="flex flex-col gap-2 p-2">
                           <PrimaryTypePicker primaryType={details.primaryType} onPick={commitPrimaryType} />
                           <Input
                              value={localLogos}
                              onChange={(event) => setLocalLogos(event.target.value)}
                              placeholder={t('Common.logosSubtitle')}
                              className="h-7 border-0 bg-card-popover-bg/40 px-2 py-0.5 text-xs text-card-paper-fg placeholder:text-card-paper-fg/50 shadow-none focus-visible:ring-card-accent/50"
                           />
                           <Input
                              value={localMythos}
                              onChange={(event) => setLocalMythos(event.target.value)}
                              placeholder={t('Common.mythosSubtitle')}
                              className="h-7 border-0 bg-card-popover-bg/40 px-2 py-0.5 text-xs text-card-paper-fg placeholder:text-card-paper-fg/50 shadow-none focus-visible:ring-card-accent/50"
                           />
                           <Textarea
                              value={localFlavor}
                              onChange={(event) => setLocalFlavor(event.target.value)}
                              placeholder={t('Common.whatThePlayersSee')}
                              className="min-h-20 resize-none border-0 bg-card-popover-bg/40 text-sm text-card-paper-fg placeholder:text-card-paper-fg/50 shadow-none focus-visible:ring-card-accent/50"
                           />
                           {localFlavor.includes('{') && (
                              <MentionMarkdown text={localFlavor} className="rounded bg-card-popover-bg/40 px-2 py-1 text-xs leading-relaxed" />
                           )}
                           {/* Low-contrast pointer to the back sections - they carry the rest of the inline edit surface. */}
                           <p className="mt-1 flex items-center justify-center gap-1.5 text-[0.65rem] text-card-paper-fg/50">
                              <Pencil className="h-3 w-3" />
                              {t('Cards.challenge.editCityOnBackHint')}
                           </p>
                        </div>
                     ) : (
                        <MentionMarkdown text={details.flavor} onMentionClick={mentionClick} className="p-2 text-sm" />
                     )}
                  </div>
               )}
            </Card>
         );

         const CardBack = (
            <Card className={cardShell}>
               <CardHeaderMolecule title={name} />

               <CardContent className="flex min-h-0 grow flex-col overflow-hidden p-0">
                  {/* Spectrums: the challenge's tiered fronts, name-tier pills. */}
                  <CardSectionHeader title={t('Common.spectrums')} icon={Gauge} />
                  <div ref={spectrumsScrollRef} className="max-h-24 min-w-0 shrink-0 overflow-y-auto overflow-x-hidden overscroll-contain">
                     {isEditing ? (
                        <div className="flex flex-col gap-1 p-2">
                           {details.spectrums.map((spectrum) => (
                              <StatusEditRow
                                 key={spectrum.id}
                                 status={spectrum}
                                 namePlaceholder={t('Common.eGInfluence')}
                                 onCommitName={(name) => commitSpectrumById(spectrum.id, { name })}
                                 onCommitTier={(tier) => commitSpectrumById(spectrum.id, { tier })}
                                 onRemove={() => removeSpectrumById(spectrum.id)}
                                 removeLabel={t('Common.remove')}
                              />
                           ))}
                           <AddRowButton label={t('Common.addSpectrum')} onClick={addSpectrum} />
                        </div>
                     ) : (
                        <div className="flex flex-wrap gap-1 p-2">
                           {details.spectrums.length > 0
                              ? details.spectrums.map((spectrum) => <LimitPill key={spectrum.id} status={spectrum} color={primaryTypeColor(details.primaryType)} />)
                              : <p className="text-sm italic text-card-paper-fg/70">{`[${t('Cards.challenge.noSpectrums')}]`}</p>}
                        </div>
                     )}
                  </div>

                  {/* Custom Moves: a name pill over rich body text (a Threat minus consequences). */}
                  <CardSectionHeader title={t('Common.customMoves')} />
                  <div ref={customMovesScrollRef} className="max-h-28 min-w-0 shrink-0 overflow-y-auto overflow-x-hidden overscroll-contain">
                     {isEditing ? (
                        <div className="flex flex-col gap-2 p-2">
                           {details.customMoves.map((move) => (
                              <CustomMoveEditRow
                                 key={move.id}
                                 move={move}
                                 namePlaceholder={t('Common.moveName')}
                                 descriptionPlaceholder={t('Cards.challenge.customMoveDescriptionPlaceholder')}
                                 onCommitName={(name) => commitCustomMoveById(move.id, { name })}
                                 onCommitDescription={(description) => commitCustomMoveById(move.id, { description })}
                                 onRemove={() => removeCustomMoveById(move.id)}
                                 removeLabel={t('Common.remove')}
                              />
                           ))}
                           <AddRowButton label={t('Common.addMove')} onClick={addCustomMove} />
                        </div>
                     ) : (
                        <div className="flex flex-col gap-2 p-2">
                           {details.customMoves.map((move) => (
                              <div key={move.id} className="text-xs leading-snug">
                                 <ThreatPill tag={move.name} />
                                 {move.description && <>{' '}<MentionMarkdown text={move.description} onMentionClick={mentionClick} className="inline [&_p]:my-0 [&_p]:inline" /></>}
                              </div>
                           ))}
                        </div>
                     )}
                  </div>

                  {/* Hard Moves: double-chevron bullets. */}
                  <CardSectionHeader title={t('Common.hardMoves')} />
                  <div ref={hardMovesScrollRef} className="max-h-24 min-w-0 shrink-0 overflow-y-auto overflow-x-hidden overscroll-contain">
                     {isEditing ? (
                        <div className="flex flex-col gap-2 p-2">
                           {details.hardMoves.map((move) => (
                              <MoveEditRow
                                 key={move.id}
                                 move={move}
                                 placeholder={t('Common.aHardMove')}
                                 onCommitText={(text) => commitHardMoveById(move.id, { text })}
                                 onRemove={() => removeHardMoveById(move.id)}
                                 removeLabel={t('Common.remove')}
                              />
                           ))}
                           <AddRowButton label={t('Common.addHardMove')} onClick={addHardMove} />
                        </div>
                     ) : (
                        <MoveList moves={details.hardMoves} kind="hard" mentionClick={mentionClick} emptyLabel={t('Cards.challenge.noHardMoves')} textClassName="p-2 text-xs" />
                     )}
                  </div>

                  {/* Soft Moves: single-chevron bullets. The meatiest tail - grows to fill the rest. */}
                  <CardSectionHeader title={t('Common.softMoves')} />
                  <div ref={softMovesScrollRef} className="min-h-16 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
                     {isEditing ? (
                        <div className="flex flex-col gap-2 p-2">
                           {details.softMoves.map((move) => (
                              <MoveEditRow
                                 key={move.id}
                                 move={move}
                                 placeholder={t('Common.aSoftMove')}
                                 onCommitText={(text) => commitSoftMoveById(move.id, { text })}
                                 onRemove={() => removeSoftMoveById(move.id)}
                                 removeLabel={t('Common.remove')}
                              />
                           ))}
                           <AddRowButton label={t('Common.addSoftMove')} onClick={addSoftMove} />
                        </div>
                     ) : (
                        <MoveList moves={details.softMoves} kind="soft" mentionClick={mentionClick} emptyLabel={t('Cards.challenge.noSoftMoves')} textClassName="p-2 text-xs" />
                     )}
                  </div>
               </CardContent>
            </Card>
         );

         // Expanded is an in-place board display mode (see the LitM card for the full rationale): the sheet
         // renders from inside this card's per-embed store subtree, reusing this card's own buffers + commit
         // closures. Read vs. edit rides the board item's own toolbar edit toggle. Board embed only.
         if (isExpanded) {
            return (
               <ExpandedCityChallengeSheet
                  ref={ref}
                  details={details}
                  name={name}
                  stars={stars}
                  url={url}
                  isEditing={isEditing}
                  localFlavor={localFlavor}
                  setLocalFlavor={setLocalFlavor}
                  localTitle={localTitle}
                  setLocalTitle={setLocalTitle}
                  localLogos={localLogos}
                  setLocalLogos={setLocalLogos}
                  localMythos={localMythos}
                  setLocalMythos={setLocalMythos}
                  commitPrimaryType={commitPrimaryType}
                  commitLevel={commitLevel}
                  commitImage={commitImage}
                  spectrumOps={spectrumOps}
                  customMoveOps={customMoveOps}
                  hardMoveOps={hardMoveOps}
                  softMoveOps={softMoveOps}
                  mentionClick={mentionClick}
               />
            );
         }

         return (
            <CardFlipWrapper
               ref={ref}
               effectiveViewMode={effectiveViewMode}
               isDrawerPreview={isDrawerPreview ?? false}
               isBoardEmbed={isBoardEmbed}
               isSnapshot={isSnapshot}
               useVerticalStack={useVerticalStack}
               card={card}
               isRevealed={isRevealed}
               revealHandlers={revealHandlers}
               isEditing={isEditing}
               dragAttributes={dragAttributes}
               dragListeners={dragListeners}
               cardTheme={cardThemeClass}
               onExport={onExport}
               onCycleViewMode={handleCycleViewMode}
               onFlip={() => actions.flipCard(card.id)}
               onDelete={() => actions.deleteCard(card.id)}
               onEditCard={onEditCard}
               cardFront={CardFront}
               cardBack={CardBack}
            />
         );
      },
   ),
);

CityChallengeCard.displayName = 'CityChallengeCard';
