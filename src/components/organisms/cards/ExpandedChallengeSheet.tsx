// -- React Imports --
import { forwardRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Basic UI Imports --
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

// -- Icon Imports --
import { Crosshair, Loader2, Skull, Sparkles, Star, Swords, Tags, Trash2, Upload } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Store and Hook Imports --
import { useImageUpload } from '@/hooks/useImageUpload';

// -- Shared Constants --
import { CHALLENGE_ART_ASPECT } from '@/lib/cards/challengeArt';

// -- Component Imports --
import { MentionMarkdown } from '@/components/molecules/MentionMarkdown';
import { ChallengeTypeSelector } from '@/components/molecules/ChallengeTypeSelector';
import { AbilityEditRow, AddRowButton, ConsequenceBullet, DifficultyMarks, LimitPill, MightyTagEditRow, MightyTagPill, SpecialEditRow, StatusEditRow, StatusPill, TagEditRow, TagPill, ThreatPill } from '@/components/organisms/cards/challengeCardEditRows';
import type { RowListOps } from '@/components/organisms/cards/challengeCardEditRows';

// -- Shared Factories --
import { challengePaletteClass, resolveExpandedFocus } from '@/lib/cards/challengeCardFactories';

// -- Type Imports --
import type { BlandTag, ChallengeAbility, ChallengeDetails, ChallengeSpecial, ChallengeStatus, MightyTag, SharedChallengeDetails } from '@/lib/types/character';
import type { MentionSegment } from '@/lib/challenge/parseMentions';

/*
 * The expanded Challenge view: a landscape SHEET (not a card face) rendered IN PLACE inside the board
 * item box (Card <-> Expanded is a persisted display mode, toggled from the board toolbar - there is no
 * overlay, scrim, or close button here). It reuses the small card's row/pill controls and the SAME
 * commit closures + debounced flavor state (passed down, so there is one set of hooks with two
 * consumers). Read vs. edit is driven by the SAME `isEditing` the board item's own toolbar edit toggle
 * provides - the sheet reads that flag to switch read<->edit, it does not own a private pencil.
 */

interface ExpandedChallengeSheetProps {
   details: SharedChallengeDetails;
   name: string;
   stars: number;
   /** The card art object URL (already resolved by the host card, so the sheet shares the same load). */
   url: string | null;
   /** Read vs. edit, driven by the board item's own toolbar edit toggle (the sheet reads it, never toggles it). */
   isEditing: boolean;
   /** The debounced flavor buffer + setter, shared with the small card (one hook, two consumers). */
   localFlavor: string;
   setLocalFlavor: (value: string) => void;
   /** The debounced name buffer + setter (edits `card.title`); unmount-safe, like the flavor buffer. */
   localTitle: string;
   setLocalTitle: (value: string) => void;
   /** Commits the challenge level (star rating) immediately on click; clamped 0-10 by the host. */
   commitLevel: (level: number) => void;
   /** Commits the card art immediately on pick/remove (edit mode only); reads live details in the host. */
   commitImage: (assetId: string | null) => void;
   /** Commits the challenge types immediately on toggle/add/remove (edit mode only); reads live details in the host. */
   commitTypes: (types: string[]) => void;
   /** The single-field list ops (limits / statuses / tags), read-live-then-patch-by-id (see RowListOps),
    *  identical to the small card's; no isBoardEmbed branch. */
   limitOps: RowListOps<ChallengeStatus>;
   statusOps: RowListOps<ChallengeStatus>;
   tagOps: RowListOps<BlandTag>;
   /** The Mighty tag list ops (level + label), read-live-then-patch-by-id like the other lists. */
   mightyTagOps: RowListOps<MightyTag>;
   /** The Specials list ops (name + body), read-live-then-patch-by-id like the other lists. */
   specialOps: RowListOps<ChallengeSpecial>;
   /** Patches one ability by id against the LIVE abilities read at commit time, so two debounced fields
    *  (tag + flavor, or a consequence) flushing together on unmount can't clobber each other's write. */
   commitAbilityById: (abilityId: string, mutate: (current: ChallengeAbility) => ChallengeAbility) => void;
   /** Appends a fresh threat against the live abilities and returns its id (so the accordion can focus it). */
   addAbility: () => string;
   /** Drops a threat by id from the live abilities. */
   removeAbilityById: (abilityId: string) => void;
   /** Tapped-mention handler (routes to the board on an embed); undefined leaves pills inert. */
   mentionClick: ((segment: MentionSegment) => void) | undefined;
}

/** A section label inside the sheet body (card-token styled, one type-step up from the small card). */
export function SheetSectionHeader({ title, icon: Icon }: { title: string; icon?: typeof Skull }) {
   return (
      <div className="mb-1.5 flex items-center gap-1.5 text-card-accent">
         {Icon && <Icon className="h-4 w-4" />}
         <span className="text-sm font-semibold uppercase tracking-wide">{title}</span>
      </div>
   );
}

/** A bracketed empty-state line, shown in read mode when a list has no entries; muted but clearly legible. */
export function EmptyState({ label }: { label: string }) {
   return <p className="text-sm italic text-card-paper-fg/70">{`[${label}]`}</p>;
}

/**
 * The edit-mode challenge level: ten clickable glyphs filled up to `level` - stars for LitM, crosshairs
 * for Otherscape. Clicking glyph N sets the level to N; clicking the one that already equals the level
 * steps it down to N-1, so 0 is reachable. Read mode renders the filled glyphs directly (no empty slots).
 */
export function StarRating({ level, game, onChange }: { level: number; game: ChallengeDetails['game']; onChange: (level: number) => void }) {
   const { t } = useTranslation();
   const outline = game === 'OTHERSCAPE';
   const Icon = outline ? Crosshair : Star;
   return (
      <div className="flex shrink-0 items-center gap-0.5 text-card-accent">
         {Array.from({ length: 10 }).map((_, index) => {
            const value = index + 1;
            const filled = value <= level;
            return (
               <button
                  key={value}
                  type="button"
                  aria-label={t('Cards.challenge.setLevel', { level: value })}
                  onClick={() => onChange(value === level ? value - 1 : value)}
                  className="cursor-pointer rounded-sm transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-card-accent/50"
               >
                  <Icon
                     className={cn('h-5 w-5', filled ? (outline ? '' : 'fill-current') : (outline ? 'opacity-40' : 'fill-none opacity-40'))}
                     strokeWidth={outline ? 2.5 : undefined}
                  />
               </button>
            );
         })}
      </div>
   );
}

/**
 * The card-art band on the sheet's left: a fixed-width matte the portrait sits on (object-contain, never
 * cropped). Read mode is a plain display driven by the resolved `url`. Edit mode turns the band into a
 * picker - clicking it (or the change button) opens the file input; a remove button clears back to null.
 * Both commit discretely through `commitImage` (host reads live details), so no debounce is needed.
 */
export function SheetImageBand({ url, name, isEditing, commitImage }: {
   url: string | null;
   name: string;
   isEditing: boolean;
   commitImage: (assetId: string | null) => void;
}) {
   const { t } = useTranslation();
   const { fileInputRef, open, isProcessing, handleFileSelected, cropperDialog } = useImageUpload(commitImage, { aspect: CHALLENGE_ART_ASPECT });

   // Shared matte look (fixed height, contain-fit); each caller supplies its own width. The band's
   // height sets the top block's height. The right column is capped to it and scrolls (see below).
   const matte = 'flex h-52 items-center justify-center overflow-hidden rounded-lg bg-card-popover-bg/60';

   if (!isEditing) {
      return (
         <div className={cn(matte, 'w-62.5 shrink-0')}>
            {url ? (
               <img src={url} alt={name} title={name} draggable={false} className="h-full w-full object-contain" />
            ) : (
               <Skull className="h-14 w-14 text-card-paper-fg/30" />
            )}
         </div>
      );
   }

   return (
      <div className="flex w-62.5 shrink-0 flex-col gap-1.5">
         <button
            type="button"
            onClick={open}
            title={url ? t('ChallengeCard.editor.changeImage') : t('ChallengeCard.editor.setImage')}
            className={cn(matte, 'w-full cursor-pointer transition-colors hover:bg-card-popover-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-card-accent/50')}
         >
            {isProcessing ? (
               <Loader2 className="h-6 w-6 animate-spin text-card-paper-fg/50" />
            ) : url ? (
               <img src={url} alt={name} title={name} draggable={false} className="h-full w-full object-contain" />
            ) : (
               <div className="flex flex-col items-center gap-1 text-card-paper-fg/50">
                  <Upload className="h-6 w-6" />
                  <span className="text-xs">{t('ChallengeCard.editor.setImage')}</span>
               </div>
            )}
         </button>
         {url && (
            <div className="flex items-center gap-1">
               <button
                  type="button"
                  onClick={open}
                  className="flex flex-1 items-center justify-center gap-1 rounded-md bg-card-popover-bg/40 px-2 py-1 text-xs text-card-paper-fg/80 transition-colors hover:bg-card-popover-bg cursor-pointer"
               >
                  <Upload className="h-3.5 w-3.5" />{t('ChallengeCard.editor.changeImage')}
               </button>
               <button
                  type="button"
                  onClick={() => commitImage(null)}
                  title={t('ChallengeCard.editor.removeImage')}
                  aria-label={t('ChallengeCard.editor.removeImage')}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-card-paper-fg/60 transition-colors hover:bg-card-popover-bg hover:text-card-paper-fg cursor-pointer"
               >
                  <Trash2 className="h-3.5 w-3.5" />
               </button>
            </div>
         )}
         <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelected} />
         {cropperDialog}
      </div>
   );
}

export const ExpandedChallengeSheet = forwardRef<HTMLDivElement, ExpandedChallengeSheetProps>(function ExpandedChallengeSheet({
   details,
   name,
   stars,
   url,
   isEditing,
   localFlavor,
   setLocalFlavor,
   localTitle,
   setLocalTitle,
   commitLevel,
   commitImage,
   commitTypes,
   limitOps,
   statusOps,
   tagOps,
   mightyTagOps,
   specialOps,
   commitAbilityById,
   addAbility,
   removeAbilityById,
   mentionClick,
}, ref) {
   const { t } = useTranslation();
   const cardThemeClass = challengePaletteClass(details.game);

   return (
      <div ref={ref} className={cn('flex h-full w-full flex-col overflow-hidden rounded-xl border-2 border-card-border bg-card-paper-bg text-card-paper-fg shadow-lg', cardThemeClass)}>
         {/* Top block, HORIZONTAL: the card-art band on the LEFT, a right column stacking title + stars
             (one row) -> types -> flavor. Grouped by spacing (no dividers). The image band is a fixed
             height (h-52); `items-start` caps the right column to that height rather than letting a long
             flavor grow the block, and the flavor area scrolls inside it (see below). */}
         <div className="flex shrink-0 items-start gap-4 p-4">
            <SheetImageBand url={url} name={name} isEditing={isEditing} commitImage={commitImage} />

            {/* Right column: title + level on one row, then types, then flavor. Bounded to the image
                band's height (h-52); title·stars + types stay pinned while the flavor scrolls. */}
            <div className="flex h-52 min-w-0 flex-1 flex-col gap-1.5">
               {/* Stars sit immediately after the name (wrapping below only when the name runs long). The
                   expanded sheet is the full edit surface, so name + level are both editable here. */}
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

               {/* Types (LitM-only): read mode shows the joined list; edit mode renders the shared selector (card-skinned). */}
               {details.game === 'LEGENDS' && (isEditing ? (
                  <ChallengeTypeSelector types={details.types} onChange={commitTypes} variant="card" className="shrink-0" />
               ) : details.types.length > 0 ? (
                  <p className="shrink-0 text-sm italic text-card-paper-fg/70">{details.types.join(' · ')}</p>
               ) : null)}

               {/* Flavor: the block's own scroll well, so a long flavor (read) or the flavor editor (edit)
                   scrolls in place rather than pushing the top block past the image band's height. A faint
                   inset panel (both modes) reads it as a deliberate flavor block, not a lone floating field -
                   read mode matches the edit textarea's look. */}
               {isEditing ? (
                  <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain">
                     <Textarea
                        value={localFlavor}
                        onChange={(event) => setLocalFlavor(event.target.value)}
                        placeholder={t('Cards.challenge.flavorPlaceholder')}
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

         {/* Horizontal divider, then the two-column body: the middle column is a real grid cell (w-px),
             not a border, so each column scrolls independently without breaking the rule. */}
         <div className="border-t border-card-accent/30" />
         <div className="grid min-h-0 flex-1 grid-cols-[1fr_auto_2fr]">
            {/* LEFT third: Limits + Tags & Statuses, its own scroll well. */}
            <div className="min-h-0 overflow-y-auto overscroll-contain p-4">
               <section>
                  <SheetSectionHeader title={t('Cards.challenge.limits')} icon={Skull} />
                  {isEditing ? (
                     <div className="flex flex-col gap-1">
                        {details.limits.map((limit) => (
                           <StatusEditRow
                              key={limit.id}
                              status={limit}
                              namePlaceholder={t('Cards.challenge.limitNamePlaceholder')}
                              onCommitName={(name) => limitOps.commitById(limit.id, { name })}
                              onCommitTier={(tier) => limitOps.commitById(limit.id, { tier })}
                              onRemove={() => limitOps.removeById(limit.id)}
                              removeLabel={t('Cards.challenge.remove')}
                           />
                        ))}
                        <AddRowButton label={t('Cards.challenge.addLimit')} onClick={limitOps.add} />
                     </div>
                  ) : (
                     <div className="flex flex-wrap gap-1">
                        {details.limits.length > 0
                           ? details.limits.map((limit) => <LimitPill key={limit.id} status={limit} accent={details.game === 'OTHERSCAPE'} />)
                           : <EmptyState label={t('Cards.challenge.noLimits')} />}
                     </div>
                  )}
               </section>

               <section className="mt-4">
                  <SheetSectionHeader title={t('Cards.challenge.tagsAndStatuses')} icon={Tags} />
                  {isEditing ? (
                     <div className="flex flex-col gap-2">
                        <div className="flex flex-col gap-1">
                           {details.statuses.map((status) => (
                              <StatusEditRow
                                 key={status.id}
                                 status={status}
                                 namePlaceholder={t('Cards.challenge.statusNamePlaceholder')}
                                 onCommitName={(name) => statusOps.commitById(status.id, { name })}
                                 onCommitTier={(tier) => statusOps.commitById(status.id, { tier })}
                                 onRemove={() => statusOps.removeById(status.id)}
                                 removeLabel={t('Cards.challenge.remove')}
                              />
                           ))}
                           <AddRowButton label={t('Cards.challenge.addStatus')} onClick={statusOps.add} />
                        </div>
                        <div className="flex flex-col gap-1">
                           {details.tags.map((tag) => (
                              <TagEditRow
                                 key={tag.id}
                                 tag={tag}
                                 namePlaceholder={t('Cards.challenge.tagNamePlaceholder')}
                                 onCommitName={(name) => tagOps.commitById(tag.id, { name })}
                                 onRemove={() => tagOps.removeById(tag.id)}
                                 removeLabel={t('Cards.challenge.remove')}
                              />
                           ))}
                           <AddRowButton label={t('Cards.challenge.addTag')} onClick={tagOps.add} />
                        </div>
                        {details.game === 'LEGENDS' && (
                           <div className="flex flex-col gap-1">
                              {details.mightyTags.map((mightyTag) => (
                                 <MightyTagEditRow
                                    key={mightyTag.id}
                                    mightyTag={mightyTag}
                                    labelPlaceholder={t('Cards.challenge.mightyTagLabelPlaceholder')}
                                    onCommitLevel={(level) => mightyTagOps.commitById(mightyTag.id, { level })}
                                    onCommitLabel={(label) => mightyTagOps.commitById(mightyTag.id, { label })}
                                    onRemove={() => mightyTagOps.removeById(mightyTag.id)}
                                    removeLabel={t('Cards.challenge.remove')}
                                 />
                              ))}
                              <AddRowButton label={t('Cards.challenge.addMightyTag')} onClick={mightyTagOps.add} />
                           </div>
                        )}
                     </div>
                  ) : (
                     <div className="flex flex-wrap items-center gap-1">
                        {details.statuses.length > 0
                           ? details.statuses.map((status) => <StatusPill key={status.id} status={status} />)
                           : <EmptyState label={t('Cards.challenge.noStatuses')} />}
                        {details.tags.length > 0
                           ? details.tags.map((tag) => <TagPill key={tag.id} tag={tag} />)
                           : <EmptyState label={t('Cards.challenge.noTags')} />}
                        {details.game === 'LEGENDS' && details.mightyTags.map((mightyTag) => <MightyTagPill key={mightyTag.id} mightyTag={mightyTag} />)}
                     </div>
                  )}
               </section>
            </div>

            {/* The divider column: a real grid cell, not a border. */}
            <div className="w-px bg-card-accent/30" />

            {/* RIGHT two-thirds: Specials (when any / editing) then the full Threats & Consequences, one
                scroll well. Edit mode accordions to the focused ability (see ThreatsEditor); read mode is
                flat + scannable. */}
            <div className="min-h-0 overflow-y-auto overscroll-contain p-4">
               {/* Specials: bold centered name over rich body. Optional - hidden entirely (header too) in
                   read mode with none, shown while editing so the first can be added. */}
               {(details.specials.length > 0 || isEditing) && (
                  <section className="mb-4">
                     <SheetSectionHeader title={t('Cards.challenge.specials')} icon={Sparkles} />
                     {isEditing ? (
                        <div className="flex flex-col gap-2">
                           {details.specials.map((special) => (
                              <SpecialEditRow
                                 key={special.id}
                                 special={special}
                                 namePlaceholder={t('Cards.challenge.specialNamePlaceholder')}
                                 bodyPlaceholder={t('Cards.challenge.specialBodyPlaceholder')}
                                 onCommitName={(name) => specialOps.commitById(special.id, { name })}
                                 onCommitBody={(body) => specialOps.commitById(special.id, { body })}
                                 onRemove={() => specialOps.removeById(special.id)}
                                 removeLabel={t('Cards.challenge.remove')}
                              />
                           ))}
                           <AddRowButton label={t('Cards.challenge.addSpecial')} onClick={specialOps.add} />
                        </div>
                     ) : (
                        <div className="flex flex-col gap-3">
                           {details.specials.map((special) => (
                              <div key={special.id} className="space-y-0.5">
                                 <p className="text-center text-sm font-bold">{special.name}</p>
                                 <MentionMarkdown text={special.body} onMentionClick={mentionClick} className="text-sm" />
                              </div>
                           ))}
                        </div>
                     )}
                  </section>
               )}

               <SheetSectionHeader title={t('Cards.challenge.threatsAndConsequences')} icon={Swords} />
               {isEditing ? (
                  <ThreatsEditor abilities={details.abilities} commitAbilityById={commitAbilityById} addAbility={addAbility} removeAbilityById={removeAbilityById} />
               ) : details.abilities.length > 0 ? (
                  <div className="flex flex-col gap-3">
                     {details.abilities.map((ability) => (
                        <div key={ability.id} className="space-y-1">
                           <div className="text-sm leading-snug">
                              <ThreatPill tag={ability.tag} />
                              {ability.flavor && <>{' '}<MentionMarkdown text={ability.flavor} onMentionClick={mentionClick} className="inline [&_p]:my-0 [&_p]:inline" /></>}
                           </div>
                           {ability.consequences.length > 0 && (
                              <ul className="list-none space-y-0.5 text-sm">
                                 {ability.consequences.map((consequence) => (
                                    <li key={consequence.id} className="flex items-start gap-1.5">
                                       <ConsequenceBullet game={details.game} className="mt-1" />
                                       <MentionMarkdown text={consequence.text} onMentionClick={mentionClick} className="min-w-0 [&_p]:my-0" />
                                    </li>
                                 ))}
                              </ul>
                           )}
                        </div>
                     ))}
                  </div>
               ) : (
                  <EmptyState label={t('Cards.challenge.noThreats')} />
               )}
            </div>
         </div>
      </div>
   );
});

/**
 * The edit-mode Threats & Consequences accordion: the focused ability shows its full inputs in a subtle
 * raised panel (one token bg step, not a boxed border); the others collapse to a chrome-free summary
 * (tag + one-line flavor + a muted "N consequences" chip). Expanding is absorbed by the column's own
 * scroll - it never resizes the sheet.
 */
function ThreatsEditor({ abilities, commitAbilityById, addAbility, removeAbilityById }: {
   abilities: ChallengeAbility[];
   commitAbilityById: (abilityId: string, mutate: (current: ChallengeAbility) => ChallengeAbility) => void;
   addAbility: () => string;
   removeAbilityById: (abilityId: string) => void;
}) {
   const { t } = useTranslation();
   // The focused ability id: the accordion opens exactly one at a time; a fresh add focuses itself.
   const [focusedId, setFocusedId] = useExpandedFocus(abilities);

   const onAddAbility = () => {
      // The host appends the fresh row against the live abilities and returns its id, so the accordion
      // focuses exactly the row it just created.
      setFocusedId(addAbility());
   };

   return (
      <div className="flex flex-col gap-2">
         {abilities.map((ability) => {
            const isFocused = ability.id === focusedId;
            if (isFocused) {
               return (
                  <div key={ability.id} className="rounded-md bg-card-popover-bg/40 p-2">
                     <AbilityEditRow
                        ability={ability}
                        onPatch={(mutate) => commitAbilityById(ability.id, mutate)}
                        onRemove={() => removeAbilityById(ability.id)}
                     />
                  </div>
               );
            }
            return (
               <button
                  key={ability.id}
                  type="button"
                  onClick={() => setFocusedId(ability.id)}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-card-paper-fg/5 cursor-pointer"
               >
                  <ThreatPill tag={ability.tag || t('Cards.challenge.untitledThreat')} />
                  <span className="min-w-0 flex-1 truncate text-xs text-card-paper-fg/70">{ability.flavor}</span>
                  {ability.consequences.length > 0 && (
                     <span className="shrink-0 rounded-full bg-card-paper-fg/10 px-1.5 py-0.5 text-[0.65rem] text-card-paper-fg/60">
                        {t('Cards.challenge.expanded.consequenceCount', { count: ability.consequences.length })}
                     </span>
                  )}
               </button>
            );
         })}
         <AddRowButton label={t('Cards.challenge.addThreat')} onClick={onAddAbility} />
      </div>
   );
}

/**
 * Tracks which ability is expanded in the edit accordion, defaulting to the first. Kept in a tiny hook
 * so the focus survives re-renders while collapsing to nothing valid when the list empties out.
 */
function useExpandedFocus(abilities: ChallengeAbility[]): [string | null, (id: string | null) => void] {
   const [focusedId, setFocusedId] = useState<string | null>(abilities[0]?.id ?? null);
   // If the focused ability was removed, fall back to the first remaining one (or none).
   return [resolveExpandedFocus(abilities, focusedId), setFocusedId];
}
