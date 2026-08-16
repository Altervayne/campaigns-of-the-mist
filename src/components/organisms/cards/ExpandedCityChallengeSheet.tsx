// -- React Imports --
import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';

// -- Basic UI Imports --
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

// -- Icon Imports --
import { Gauge } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Component Imports --
import { MentionMarkdown } from '@/components/molecules/MentionMarkdown';
import { AddRowButton, CustomMoveEditRow, DifficultyMarks, LimitPill, MoveEditRow, MoveList, PrimaryTypePicker, StatusEditRow, ThreatPill } from '@/components/organisms/cards/challengeCardEditRows';
import type { RowListOps } from '@/components/organisms/cards/challengeCardEditRows';
import { EmptyState, SheetImageBand, SheetSectionHeader, StarRating } from '@/components/organisms/cards/ExpandedChallengeSheet';

// -- Shared Factories --
import { cityChallengePaletteClass, primaryTypeColor } from '@/lib/cards/challengeCardFactories';

// -- Type Imports --
import type { ChallengeStatus, CityChallengeDetails, CityCustomMove, CityMove } from '@/lib/types/character';
import type { MentionSegment } from '@/lib/challenge/parseMentions';

/*
 * The expanded City of Mist Challenge view: a landscape SHEET (not a card face) rendered IN PLACE inside
 * the board item box, mirroring the LitM/Otherscape expanded sheet. It reuses that sheet's shared image
 * band / section header / difficulty picker / empty-state, plus the small card's row/pill controls and the
 * SAME commit closures + debounced buffers (passed down, so one set of hooks with two consumers). Read vs.
 * edit rides the SAME `isEditing` the board item's own toolbar edit toggle provides.
 */

interface ExpandedCityChallengeSheetProps {
   details: CityChallengeDetails;
   name: string;
   stars: number;
   /** The card art object URL (already resolved by the host card, so the sheet shares the same load). */
   url: string | null;
   /** Read vs. edit, driven by the board item's own toolbar edit toggle (the sheet reads it, never toggles it). */
   isEditing: boolean;
   /** The debounced flavor / name / subtitle buffers + setters, shared with the small card (one hook, two consumers). */
   localFlavor: string;
   setLocalFlavor: (value: string) => void;
   localTitle: string;
   setLocalTitle: (value: string) => void;
   localLogos: string;
   setLocalLogos: (value: string) => void;
   localMythos: string;
   setLocalMythos: (value: string) => void;
   /** Discrete commits (no debounce); each reads live details in the host so it can't stomp a sibling. */
   commitPrimaryType: (primaryType: CityChallengeDetails['primaryType']) => void;
   commitLevel: (level: number) => void;
   commitImage: (assetId: string | null) => void;
   /** The list ops (spectrums / the three move lists), read-live-then-patch-by-id like the small card's. */
   spectrumOps: RowListOps<ChallengeStatus>;
   customMoveOps: RowListOps<CityCustomMove>;
   hardMoveOps: RowListOps<CityMove>;
   softMoveOps: RowListOps<CityMove>;
   /** Tapped-mention handler (routes to the board on an embed); undefined leaves pills inert. */
   mentionClick: ((segment: MentionSegment) => void) | undefined;
}

export const ExpandedCityChallengeSheet = forwardRef<HTMLDivElement, ExpandedCityChallengeSheetProps>(function ExpandedCityChallengeSheet({
   details,
   name,
   stars,
   url,
   isEditing,
   localFlavor,
   setLocalFlavor,
   localTitle,
   setLocalTitle,
   localLogos,
   setLocalLogos,
   localMythos,
   setLocalMythos,
   commitPrimaryType,
   commitLevel,
   commitImage,
   spectrumOps,
   customMoveOps,
   hardMoveOps,
   softMoveOps,
   mentionClick,
}, ref) {
   const { t } = useTranslation();
   const cardThemeClass = cityChallengePaletteClass(details.primaryType);

   return (
      <div ref={ref} className={cn('flex h-full w-full flex-col overflow-hidden rounded-xl border-2 border-card-border bg-card-paper-bg text-card-paper-fg shadow-lg', cardThemeClass)}>
         {/* Top block, HORIZONTAL: the card-art band on the LEFT, a right column stacking title + stars ->
             subtitles / primary type -> flavor. The image band is a fixed height (h-52); `items-start` caps
             the right column to it and the flavor area scrolls inside (see below). */}
         <div className="flex shrink-0 items-start gap-4 p-4">
            <SheetImageBand url={url} name={name} isEditing={isEditing} commitImage={commitImage} />

            <div className="flex h-52 min-w-0 flex-1 flex-col gap-1.5">
               <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1">
                  {isEditing ? (
                     <Input
                        value={localTitle}
                        onChange={(event) => setLocalTitle(event.target.value)}
                        placeholder={t(`Cards.challenge.namePlaceholder.${details.game}`)}
                        className="h-auto min-w-0 flex-1 border-0 bg-card-popover-bg/40 px-2 py-1 text-3xl font-bold leading-tight text-card-paper-fg placeholder:text-card-paper-fg/50 shadow-none focus-visible:ring-card-accent/50"
                     />
                  ) : (
                     <h2 className="text-3xl font-bold leading-tight">{name}</h2>
                  )}
                  {isEditing ? (
                     <StarRating level={stars} game={details.game} onChange={commitLevel} />
                  ) : (
                     <div className="flex shrink-0 items-center gap-0.5 text-card-accent">
                        <DifficultyMarks game={details.game} count={stars} className="h-5 w-5" />
                     </div>
                  )}
               </div>

               {/* Subtitles + primary type: read shows the two labelled lines; edit shows the type toggle over two inputs. */}
               {isEditing ? (
                  <div className="flex shrink-0 flex-col gap-1.5">
                     <PrimaryTypePicker primaryType={details.primaryType} onPick={commitPrimaryType} />
                     <Input
                        value={localLogos}
                        onChange={(event) => setLocalLogos(event.target.value)}
                        placeholder={t('Common.logosSubtitle')}
                        className="h-8 border-0 bg-card-popover-bg/40 px-2 py-1 text-sm text-card-paper-fg placeholder:text-card-paper-fg/50 shadow-none focus-visible:ring-card-accent/50"
                     />
                     <Input
                        value={localMythos}
                        onChange={(event) => setLocalMythos(event.target.value)}
                        placeholder={t('Common.mythosSubtitle')}
                        className="h-8 border-0 bg-card-popover-bg/40 px-2 py-1 text-sm text-card-paper-fg placeholder:text-card-paper-fg/50 shadow-none focus-visible:ring-card-accent/50"
                     />
                  </div>
               ) : (
                  (details.logosSubtitle || details.mythosSubtitle) && (
                     <div className="shrink-0 text-sm">
                        {details.logosSubtitle && <p><span className="font-semibold text-card-accent">{t('ThemeTypes.Logos')}</span><span className="italic text-card-paper-fg/70"> · {details.logosSubtitle}</span></p>}
                        {details.mythosSubtitle && <p><span className="font-semibold text-card-accent">{t('ThemeTypes.Mythos')}</span><span className="italic text-card-paper-fg/70"> · {details.mythosSubtitle}</span></p>}
                     </div>
                  )
               )}

               {/* Flavor: the block's own scroll well (matches the LitM sheet). */}
               {isEditing ? (
                  <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain">
                     <Textarea
                        value={localFlavor}
                        onChange={(event) => setLocalFlavor(event.target.value)}
                        placeholder={t('Common.whatThePlayersSee')}
                        className="min-h-16 resize-none border-0 bg-card-popover-bg/40 text-sm text-card-paper-fg placeholder:text-card-paper-fg/50 shadow-none focus-visible:ring-card-accent/50"
                     />
                     {localFlavor.includes('{') && (
                        <MentionMarkdown text={localFlavor} className="rounded bg-card-popover-bg/40 px-2 py-1 text-xs leading-relaxed" />
                     )}
                  </div>
               ) : (
                  <MentionMarkdown text={details.flavor} onMentionClick={mentionClick} className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-md bg-card-popover-bg/40 px-2 py-1.5 text-sm" />
               )}
            </div>
         </div>

         {/* Horizontal divider, then the two-column body: Spectrums on the left, the three move lists on the right. */}
         <div className="border-t border-card-accent/30" />
         <div className="grid min-h-0 flex-1 grid-cols-[1fr_auto_2fr]">
            {/* LEFT third: Spectrums, its own scroll well. */}
            <div className="min-h-0 overflow-y-auto overscroll-contain p-4">
               <section>
                  <SheetSectionHeader title={t('Common.spectrums')} icon={Gauge} />
                  {isEditing ? (
                     <div className="flex flex-col gap-1">
                        {details.spectrums.map((spectrum) => (
                           <StatusEditRow
                              key={spectrum.id}
                              status={spectrum}
                              namePlaceholder={t('Common.eGInfluence')}
                              onCommitName={(name) => spectrumOps.commitById(spectrum.id, { name })}
                              onCommitTier={(tier) => spectrumOps.commitById(spectrum.id, { tier })}
                              onRemove={() => spectrumOps.removeById(spectrum.id)}
                              removeLabel={t('Common.remove')}
                           />
                        ))}
                        <AddRowButton label={t('Common.addSpectrum')} onClick={spectrumOps.add} />
                     </div>
                  ) : (
                     <div className="flex flex-wrap gap-1">
                        {details.spectrums.length > 0
                           ? details.spectrums.map((spectrum) => <LimitPill key={spectrum.id} status={spectrum} color={primaryTypeColor(details.primaryType)} />)
                           : <EmptyState label={t('Cards.challenge.noSpectrums')} />}
                     </div>
                  )}
               </section>
            </div>

            {/* The divider column: a real grid cell, not a border. */}
            <div className="w-px bg-card-accent/30" />

            {/* RIGHT two-thirds: Custom Moves, then Hard Moves, then Soft Moves, one scroll well. */}
            <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain p-4">
               <section>
                  <SheetSectionHeader title={t('Common.customMoves')} />
                  {isEditing ? (
                     <div className="flex flex-col gap-2">
                        {details.customMoves.map((move) => (
                           <CustomMoveEditRow
                              key={move.id}
                              move={move}
                              namePlaceholder={t('Common.moveName')}
                              descriptionPlaceholder={t('Cards.challenge.customMoveDescriptionPlaceholder')}
                              onCommitName={(name) => customMoveOps.commitById(move.id, { name })}
                              onCommitDescription={(description) => customMoveOps.commitById(move.id, { description })}
                              onRemove={() => customMoveOps.removeById(move.id)}
                              removeLabel={t('Common.remove')}
                           />
                        ))}
                        <AddRowButton label={t('Common.addMove')} onClick={customMoveOps.add} />
                     </div>
                  ) : details.customMoves.length > 0 ? (
                     <div className="flex flex-col gap-2">
                        {details.customMoves.map((move) => (
                           <div key={move.id} className="text-sm leading-snug">
                              <ThreatPill tag={move.name} />
                              {move.description && <>{' '}<MentionMarkdown text={move.description} onMentionClick={mentionClick} className="inline [&_p]:my-0 [&_p]:inline" /></>}
                           </div>
                        ))}
                     </div>
                  ) : (
                     <EmptyState label={t('Cards.challenge.noCustomMoves')} />
                  )}
               </section>

               <section>
                  <SheetSectionHeader title={t('Common.hardMoves')} />
                  {isEditing ? (
                     <div className="flex flex-col gap-2">
                        {details.hardMoves.map((move) => (
                           <MoveEditRow
                              key={move.id}
                              move={move}
                              placeholder={t('Common.aHardMove')}
                              onCommitText={(text) => hardMoveOps.commitById(move.id, { text })}
                              onRemove={() => hardMoveOps.removeById(move.id)}
                              removeLabel={t('Common.remove')}
                           />
                        ))}
                        <AddRowButton label={t('Common.addHardMove')} onClick={hardMoveOps.add} />
                     </div>
                  ) : (
                     <MoveList moves={details.hardMoves} kind="hard" mentionClick={mentionClick} emptyLabel={t('Cards.challenge.noHardMoves')} textClassName="text-sm" />
                  )}
               </section>

               <section>
                  <SheetSectionHeader title={t('Common.softMoves')} />
                  {isEditing ? (
                     <div className="flex flex-col gap-2">
                        {details.softMoves.map((move) => (
                           <MoveEditRow
                              key={move.id}
                              move={move}
                              placeholder={t('Common.aSoftMove')}
                              onCommitText={(text) => softMoveOps.commitById(move.id, { text })}
                              onRemove={() => softMoveOps.removeById(move.id)}
                              removeLabel={t('Common.remove')}
                           />
                        ))}
                        <AddRowButton label={t('Common.addSoftMove')} onClick={softMoveOps.add} />
                     </div>
                  ) : (
                     <MoveList moves={details.softMoves} kind="soft" mentionClick={mentionClick} emptyLabel={t('Cards.challenge.noSoftMoves')} textClassName="text-sm" />
                  )}
               </section>
            </div>
         </div>
      </div>
   );
});
