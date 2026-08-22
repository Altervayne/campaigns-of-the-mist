// -- React Imports --
import React, { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

// -- Basic UI Imports --
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

// -- Icon Imports --
import { Skull, Swords, Sparkles, Tags, Pencil } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Component Imports --
import { CardHeaderMolecule } from '@/components/molecules/cards/CardHeader';
import { CardSectionHeader } from '@/components/molecules/cards/CardSectionHeader';
import { CardFlipWrapper } from '@/components/molecules/cards/CardFlipWrapper';
import { MentionMarkdown } from '@/components/molecules/MentionMarkdown';
import { AddRowButton, ConsequenceBullet, DifficultyMarks, LimitPill, MightyTagEditRow, MightyTagPill, SpecialEditRow, StatusEditRow, StatusPill, TagEditRow, TagPill, ThreatPill } from '@/components/organisms/cards/challengeCardEditRows';
import type { RowListOps } from '@/components/organisms/cards/challengeCardEditRows';
import { ExpandedChallengeSheet } from '@/components/organisms/cards/ExpandedChallengeSheet';

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
import { addRow, challengePaletteClass, newAbility, newMightyTag, newSpecial, newStatus, newTag, patchAbilityById, removeRowById, updateRowById } from '@/lib/cards/challengeCardFactories';

// -- Type Imports --
import type { CardComponentProps } from '@/components/organisms/cards/resolveCardComponent';
import type { BlandTag, ChallengeAbility, ChallengeSpecial, ChallengeStatus, MightyTag, SharedChallengeDetails } from '@/lib/types/character';

/*
 * The GM Challenge Card, game-aware over its discriminated details. Front = image / name / difficulty /
 * flavor; back = Limits / Tags & Statuses / Specials / Threats & Consequences. LitM adds Types (front +
 * expanded) and Mighty tags (inline in Tags & Statuses); Otherscape drops both and restyles (gunmetal
 * palette, lime accents, crosshair difficulty, lime double-chevron consequences). Threats, types, image,
 * and level are dialog-only; flavor / limits / statuses / tags are also editable in place while `isEditing`.
 * Inline edits share the dialog's row factories (`challengeCardFactories`) and commit through `updateCardDetails`.
 */

export const ChallengeCard = React.memo(
   React.forwardRef<HTMLDivElement, CardComponentProps>(
      ({ card, isEditing = false, isSnapshot, isDrawerPreview, isBoardEmbed = false, isMobile = false, useVerticalStack, dragAttributes, dragListeners, onEditCard, onExport, onMentionClick, isExpanded = false }, ref) => {
         const { t } = useTranslation();
         const actions = useCharacterActions();
         const details = card.details as SharedChallengeDetails;
         const cardThemeClass = challengePaletteClass(details.game);

         const { isRevealed, revealHandlers } = useToolbarReveal(card.id, isDrawerPreview);
         const { url } = useAssetObjectUrl(details.assetId);

         const globalCardViewMode = useAppSettingsStore((state) => state.isSideBySideView ? 'SIDE_BY_SIDE' : 'FLIP');
         const effectiveViewMode = useMemo(() => card.viewMode || globalCardViewMode, [card.viewMode, globalCardViewMode]);
         const { handleCycleViewMode } = useCardViewMode(card);

         // Back sections each scroll their own overflow with a pinned header; board-wheel-scroll works over
         // every well (mirrors the theme card's tags/quest/improvements wells).
         const limitsScrollRef = useRef<HTMLDivElement>(null);
         const tagsScrollRef = useRef<HTMLDivElement>(null);
         const specialsScrollRef = useRef<HTMLDivElement>(null);
         const threatsScrollRef = useRef<HTMLDivElement>(null);
         useManualScroll(limitsScrollRef);
         useManualScroll(tagsScrollRef);
         useManualScroll(specialsScrollRef);
         useManualScroll(threatsScrollRef);

         const name = card.title || t('Cards.challenge.untitled');
         const stars = Math.max(0, Math.min(10, details.challengeLevel));

         // Flavor text (front). Hook state stays above the `isEditing` branch below so flipping the card
         // or toggling edit mode never remounts the field and drops a pending edit.
         const [localFlavor, setLocalFlavor] = useInputDebouncer(
            details.flavor,
            (value) => actions.updateCardDetails(card.id, { flavor: value }),
         );

         // Name (`card.title`). Same above-the-branch, unmount-safe buffer as flavor - one hook, so
         // toggling edit or collapsing the sheet never remounts the field and drops a pending edit. Only
         // the expanded sheet edits the name inline; the small card keeps it dialog-only.
         const [localTitle, setLocalTitle] = useInputDebouncer(
            card.title,
            (value) => actions.updateCardTitle(card.id, value),
         );

         // Limits / statuses / tags (back) list mutations. Each edit re-derives the full next list and
         // commits it wholesale via `updateCardDetails` - identical for the sheet and the board embed
         // (both ride the same per-embed store), so there is no isBoardEmbed branch here.
         const commitLimits = (next: ChallengeStatus[]) => actions.updateCardDetails(card.id, { limits: next });
         const commitStatuses = (next: ChallengeStatus[]) => actions.updateCardDetails(card.id, { statuses: next });
         const commitTags = (next: BlandTag[]) => actions.updateCardDetails(card.id, { tags: next });
         const commitMightyTags = (next: MightyTag[]) => actions.updateCardDetails(card.id, { mightyTags: next });
         const commitSpecials = (next: ChallengeSpecial[]) => actions.updateCardDetails(card.id, { specials: next });
         const commitAbilities = (next: ChallengeAbility[]) => actions.updateCardDetails(card.id, { abilities: next });

         // Every debounced row commit built by this component composes over the live read, so two fields
         // flushing together can't clobber: `set` is synchronous, so the second read already carries the
         // first's write.
         const liveDetails = useLiveCardDetails<SharedChallengeDetails>(card.id, details);

         // Patches one ability by id against the live abilities - the sheet's tag + flavor + per-consequence
         // debouncers all commit through here, so no unmount-flush can stomp a sibling field.
         const commitAbilityById = (abilityId: string, mutate: (current: ChallengeAbility) => ChallengeAbility) => {
            commitAbilities(patchAbilityById(liveDetails().abilities, abilityId, mutate));
         };

         // The same read-live-then-patch-by-id discipline for the single-field limit / status / tag rows.
         // Each has one debounced field today, so it only clobbers a SIBLING row in the same list (two
         // limit names flushing together) rather than its own pair - but the guard is identical and cheap.
         const commitLimitById = (id: string, updates: Partial<ChallengeStatus>) => commitLimits(updateRowById(liveDetails().limits, id, updates));
         const commitStatusById = (id: string, updates: Partial<ChallengeStatus>) => commitStatuses(updateRowById(liveDetails().statuses, id, updates));
         const commitTagById = (id: string, updates: Partial<BlandTag>) => commitTags(updateRowById(liveDetails().tags, id, updates));
         // A Mighty tag's label rides the debouncer and its level commits on click; both patch by id
         // against the live list, so a sibling row's flush can't clobber this one's. LitM-only (the field
         // lives on the LEGENDS branch); the render gates these to that game, the guard narrows the union.
         const commitMightyTagById = (id: string, updates: Partial<MightyTag>) => {
            const live = liveDetails();
            if (live.game !== 'LEGENDS') return;
            commitMightyTags(updateRowById(live.mightyTags, id, updates));
         };
         // Specials carry two debounced fields (name + body); reading live-then-patch-by-id means the
         // second unmount-flush already sees the first's write, so neither field clobbers the other.
         const commitSpecialById = (id: string, updates: Partial<ChallengeSpecial>) => commitSpecials(updateRowById(liveDetails().specials, id, updates));
         const removeLimitById = (id: string) => commitLimits(removeRowById(liveDetails().limits, id));
         const removeStatusById = (id: string) => commitStatuses(removeRowById(liveDetails().statuses, id));
         const removeTagById = (id: string) => commitTags(removeRowById(liveDetails().tags, id));
         const removeMightyTagById = (id: string) => {
            const live = liveDetails();
            if (live.game !== 'LEGENDS') return;
            commitMightyTags(removeRowById(live.mightyTags, id));
         };
         const removeSpecialById = (id: string) => commitSpecials(removeRowById(liveDetails().specials, id));
         const addLimit = () => commitLimits(addRow(liveDetails().limits, newStatus()));
         const addStatus = () => commitStatuses(addRow(liveDetails().statuses, newStatus()));
         const addTag = () => commitTags(addRow(liveDetails().tags, newTag()));
         const addMightyTag = () => {
            const live = liveDetails();
            if (live.game !== 'LEGENDS') return;
            commitMightyTags(addRow(live.mightyTags, newMightyTag()));
         };
         const addSpecial = () => commitSpecials(addRow(liveDetails().specials, newSpecial()));

         // The same by-id ops bundled for the expanded sheet, which renders its own copy of these rows.
         const limitOps: RowListOps<ChallengeStatus> = { commitById: commitLimitById, removeById: removeLimitById, add: addLimit };
         const statusOps: RowListOps<ChallengeStatus> = { commitById: commitStatusById, removeById: removeStatusById, add: addStatus };
         const tagOps: RowListOps<BlandTag> = { commitById: commitTagById, removeById: removeTagById, add: addTag };
         const mightyTagOps: RowListOps<MightyTag> = { commitById: commitMightyTagById, removeById: removeMightyTagById, add: addMightyTag };
         const specialOps: RowListOps<ChallengeSpecial> = { commitById: commitSpecialById, removeById: removeSpecialById, add: addSpecial };

         // Whole-row add/remove for the threats accordion, also against live abilities. `addAbility`
         // returns the new id so the accordion can focus the fresh row it just appended.
         const addAbility = (): string => {
            const row = newAbility();
            commitAbilities(addRow(liveDetails().abilities, row));
            return row.id;
         };
         const removeAbilityById = (id: string) => commitAbilities(removeRowById(liveDetails().abilities, id));

         // The challenge level (star rating), committed immediately on click - discrete, like the row tier
         // steppers, no debounce. Reads live details so it can't stomp a sibling field, and clamps 0-10.
         const commitLevel = (level: number) => {
            const next = Math.max(0, Math.min(10, level));
            actions.updateCardDetails(card.id, { ...liveDetails(), challengeLevel: next });
         };

         // The card art (assetId), committed immediately on pick or remove from the expanded sheet - a
         // discrete click, so no debounce or unmount-flush. Reads live details so it can't stomp a sibling.
         const commitImage = (assetId: string | null) => {
            actions.updateCardDetails(card.id, { ...liveDetails(), assetId });
         };

         // The challenge types, committed immediately on toggle / add / remove from the expanded sheet -
         // a discrete click like the level and image, so no debounce. Reads live details so it can't
         // stomp a sibling field mid-flush. LitM-only; the render gates it, the guard narrows the union.
         const commitTypes = (types: string[]) => {
            const live = liveDetails();
            if (live.game !== 'LEGENDS') return;
            actions.updateCardDetails(card.id, { ...live, types });
         };

         // A tapped mention applies to the active character: a status create-or-RAISES (bubble-up, no
         // duplicate); a tag de-dupes by name. The shared sheet hook owns that logic (also used by the
         // sheet journal), so both surfaces create on the active character from one source.
         const handleMentionClick = useSheetMentionCreate();
         // A board embed routes taps to the board (create-only, via `onMentionClick`); the live sheet card
         // uses the create-or-raise handler above; a static preview / drawer snapshot stays plain.
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

               {details.game === 'LEGENDS' && details.types.length > 0 && (
                  <p className={cn('shrink-0 px-2 pb-1 text-center italic text-card-paper-fg/70', isDrawerPreview ? 'text-[0.65rem]' : 'text-sm')}>
                     {details.types.join(' · ')}
                  </p>
               )}

               {/* Difficulty divider (cosmetic): stars for LitM, crosshairs for Otherscape. */}
               <div className="flex shrink-0 items-center justify-center gap-0.5 border-y border-card-accent/30 py-1 text-card-accent">
                  <DifficultyMarks game={details.game} count={stars} className={isDrawerPreview ? 'h-3 w-3' : 'h-4 w-4'} />
               </div>

               {!isDrawerPreview && (
                  <div className="min-w-0 grow overflow-y-auto overflow-x-hidden overscroll-contain">
                     {isEditing ? (
                        <div className="flex flex-col gap-1 p-2">
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
                              {t('Cards.challenge.editOnBackHint')}
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

               {/* Back is three per-section wells: each has a PINNED CardSectionHeader (it never scrolls, so
                   it doubles as the divider) over its own scroll well. Limits and Tags & Statuses size to their
                   content, capped (max-h + shrink-0) so a long list scrolls in place instead of stealing height;
                   Threats & Consequences grows to fill whatever is left, since it's the meatiest. Each well
                   scrolls its own overflow so a heavy section can't starve the others. */}
               <CardContent className="flex min-h-0 grow flex-col overflow-hidden p-0">
                  {/* Limits: the statuses required to defeat it. */}
                  <CardSectionHeader title={t('Common.limits')} icon={Skull} />
                  <div ref={limitsScrollRef} className="max-h-24 min-w-0 shrink-0 overflow-y-auto overflow-x-hidden overscroll-contain">
                     {isEditing ? (
                        <div className="flex flex-col gap-1 p-2">
                           {details.limits.map((limit) => (
                              <StatusEditRow
                                 key={limit.id}
                                 status={limit}
                                 namePlaceholder={t('Common.eGBurn')}
                                 onCommitName={(name) => commitLimitById(limit.id, { name })}
                                 onCommitTier={(tier) => commitLimitById(limit.id, { tier })}
                                 onRemove={() => removeLimitById(limit.id)}
                                 removeLabel={t('Common.remove')}
                              />
                           ))}
                           <AddRowButton label={t('Common.addLimit')} onClick={addLimit} />
                        </div>
                     ) : (
                        <div className="flex flex-wrap gap-1 p-2">
                           {details.limits.length > 0
                              ? details.limits.map((limit) => <LimitPill key={limit.id} status={limit} accent={details.game === 'OTHERSCAPE'} />)
                              : <p className="text-sm italic text-card-paper-fg/70">{`[${t('Cards.challenge.noLimits')}]`}</p>}
                        </div>
                     )}
                  </div>

                  {/* The challenge's own statuses + tags. */}
                  <CardSectionHeader title={t('Cards.challenge.tagsAndStatuses')} icon={Tags} />
                  <div ref={tagsScrollRef} className="max-h-24 min-w-0 shrink-0 overflow-y-auto overflow-x-hidden overscroll-contain">
                     {isEditing ? (
                        <div className="flex flex-col gap-2 p-2">
                           <div className="flex flex-col gap-1">
                              {details.statuses.map((status) => (
                                 <StatusEditRow
                                    key={status.id}
                                    status={status}
                                    namePlaceholder={t('Common.eGBloodied')}
                                    onCommitName={(name) => commitStatusById(status.id, { name })}
                                    onCommitTier={(tier) => commitStatusById(status.id, { tier })}
                                    onRemove={() => removeStatusById(status.id)}
                                    removeLabel={t('Common.remove')}
                                 />
                              ))}
                              <AddRowButton label={t('Common.addStatus')} onClick={addStatus} />
                           </div>
                           <div className="flex flex-col gap-1">
                              {details.tags.map((tag) => (
                                 <TagEditRow
                                    key={tag.id}
                                    tag={tag}
                                    namePlaceholder={t('Common.eGFast')}
                                    onCommitName={(name) => commitTagById(tag.id, { name })}
                                    onRemove={() => removeTagById(tag.id)}
                                    removeLabel={t('Common.remove')}
                                 />
                              ))}
                              <AddRowButton label={t('Common.addTag')} onClick={addTag} />
                           </div>
                           {details.game === 'LEGENDS' && (
                              <div className="flex flex-col gap-1">
                                 {details.mightyTags.map((mightyTag) => (
                                    <MightyTagEditRow
                                       key={mightyTag.id}
                                       mightyTag={mightyTag}
                                       labelPlaceholder={t('Common.eGFireproofHide')}
                                       onCommitLevel={(level) => commitMightyTagById(mightyTag.id, { level })}
                                       onCommitLabel={(label) => commitMightyTagById(mightyTag.id, { label })}
                                       onRemove={() => removeMightyTagById(mightyTag.id)}
                                       removeLabel={t('Common.remove')}
                                    />
                                 ))}
                                 <AddRowButton label={t('Common.addMightyTag')} onClick={addMightyTag} />
                              </div>
                           )}
                        </div>
                     ) : (
                        <div className="flex flex-wrap items-center gap-1 p-2">
                           {details.statuses.length > 0
                              ? details.statuses.map((status) => <StatusPill key={status.id} status={status} />)
                              : <p className="text-sm italic text-card-paper-fg/70">{`[${t('Cards.challenge.noStatuses')}]`}</p>}
                           {details.tags.length > 0
                              ? details.tags.map((tag) => <TagPill key={tag.id} tag={tag} />)
                              : <p className="text-sm italic text-card-paper-fg/70">{`[${t('Cards.challenge.noTags')}]`}</p>}
                           {details.game === 'LEGENDS' && details.mightyTags.map((mightyTag) => <MightyTagPill key={mightyTag.id} mightyTag={mightyTag} />)}
                        </div>
                     )}
                  </div>

                  {/* Specials: each a bold centered name over rich body text. Optional - the whole well
                      (header included) is absent in read mode with none, and only appears to edit. */}
                  {(details.specials.length > 0 || isEditing) && (
                     <>
                        <CardSectionHeader title={t('Common.specials')} icon={Sparkles} />
                        <div ref={specialsScrollRef} className="max-h-24 min-w-0 shrink-0 overflow-y-auto overflow-x-hidden overscroll-contain">
                           {isEditing ? (
                              <div className="flex flex-col gap-2 p-2">
                                 {details.specials.map((special) => (
                                    <SpecialEditRow
                                       key={special.id}
                                       special={special}
                                       namePlaceholder={t('Common.specialName')}
                                       bodyPlaceholder={t('Cards.challenge.specialBodyPlaceholder')}
                                       onCommitName={(name) => commitSpecialById(special.id, { name })}
                                       onCommitBody={(body) => commitSpecialById(special.id, { body })}
                                       onRemove={() => removeSpecialById(special.id)}
                                       removeLabel={t('Common.remove')}
                                    />
                                 ))}
                                 <AddRowButton label={t('Common.addSpecial')} onClick={addSpecial} />
                              </div>
                           ) : (
                              <div className="flex flex-col gap-2 p-2">
                                 {details.specials.map((special) => (
                                    <div key={special.id} className="space-y-0.5">
                                       <p className="text-center text-sm font-bold">{special.name}</p>
                                       <MentionMarkdown text={special.body} onMentionClick={mentionClick} className="text-xs" />
                                    </div>
                                 ))}
                              </div>
                           )}
                        </div>
                     </>
                  )}

                  {/* Threats & Consequences: a threat-name pill with its flavor inline, over a skull-bulleted
                      list. The meatiest section - grows to fill the height the other two don't claim. */}
                  <CardSectionHeader title={t('Common.threatsConsequences')} icon={Swords} />
                  <div ref={threatsScrollRef} className="min-h-16 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
                     <div className="flex flex-col gap-2 p-2">
                        {details.abilities.map((ability) => (
                           <div key={ability.id} className="space-y-1">
                              {/* Inline flow (not flex) so the flavor flows word-by-word right after the pill and wraps. */}
                              <div className="text-xs leading-snug">
                                 <ThreatPill tag={ability.tag} />
                                 {ability.flavor && <>{' '}<MentionMarkdown text={ability.flavor} onMentionClick={mentionClick} className="inline [&_p]:my-0 [&_p]:inline" /></>}
                              </div>
                              {ability.consequences.length > 0 && (
                                 <ul className="list-none space-y-0.5 text-xs">
                                    {ability.consequences.map((consequence) => (
                                       <li key={consequence.id} className="flex items-start gap-1.5">
                                          <ConsequenceBullet game={details.game} className="mt-0.5" />
                                          <MentionMarkdown text={consequence.text} onMentionClick={mentionClick} className="min-w-0 [&_p]:my-0" />
                                       </li>
                                    ))}
                                 </ul>
                              )}
                           </div>
                        ))}
                     </div>
                  </div>
               </CardContent>
            </Card>
         );

         // Expanded is an IN-PLACE board display mode: the board item box is sized to the landscape
         // footprint (see BoardItemBox) and this card renders the sheet directly in place of the flip
         // card - no overlay, no scrim. The sheet renders from inside this card's per-embed store subtree,
         // so it shares the SAME store instance the board tile already has (one store per item, no
         // split-brain writes) and reuses this card's own flavor buffer + commit closures (one set of
         // hooks, two consumers). Read vs. edit rides the same `isEditing` the board item's toolbar edit
         // toggle already drives - the sheet owns no private pencil. Board embed only.
         if (isExpanded) {
            return (
               <ExpandedChallengeSheet
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
                  commitLevel={commitLevel}
                  commitImage={commitImage}
                  commitTypes={commitTypes}
                  limitOps={limitOps}
                  statusOps={statusOps}
                  tagOps={tagOps}
                  mightyTagOps={mightyTagOps}
                  specialOps={specialOps}
                  commitAbilityById={commitAbilityById}
                  addAbility={addAbility}
                  removeAbilityById={removeAbilityById}
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
               // Editing opens the dedicated Challenge editor (routed by the sheet on cardType).
               onEditCard={onEditCard}
               cardFront={CardFront}
               cardBack={CardBack}
            />
         );
      },
   ),
);

ChallengeCard.displayName = 'ChallengeCard';
