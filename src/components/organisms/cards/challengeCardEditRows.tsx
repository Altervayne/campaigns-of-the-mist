// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Basic UI Imports --
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

// -- Icon Imports --
import { ChevronRight, ChevronsRight, Crosshair, Minus, Plus, Skull, Star, Trash2 } from 'lucide-react';

// -- Component Imports --
import { MentionMarkdown } from '@/components/molecules/MentionMarkdown';

// -- Store and Hook Imports --
import { useInputDebouncer } from '@/hooks/useInputDebouncer';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Shared Factories --
import { addRow, newConsequence, primaryTypeColor, removeRowById, updateRowById } from '@/lib/cards/challengeCardFactories';
import { MIGHT_LEVELS, mightIcon, mightLevelColor } from '@/lib/cards/might';

// -- Type Imports --
import type { BlandTag, ChallengeAbility, ChallengeDetails, ChallengeSpecial, ChallengeStatus, CityChallengeDetails, CityCustomMove, CityMove, MightLevel, MightyTag } from '@/lib/types/character';
import type { MentionSegment } from '@/lib/challenge/parseMentions';

/*
 * The Challenge Card's inline edit rows + display pills, shared by the small card and the expanded
 * board sheet so both surfaces render identical Limits / Statuses / Tags / Threats controls. Every
 * text field rides `useInputDebouncer` with its hook state above any conditional, so toggling edit
 * mode or flipping the card never remounts a field mid-edit. List mutations go through the shared
 * `challengeCardFactories` helpers, id-keyed so a delete/reorder can't retarget an in-flight write.
 */

/** The challenge's win-conditions: an outlined `name-tier` pill (LitM) or a filled accent pill (Otherscape lime). */
export function LimitPill({ status, accent = false }: { status: ChallengeStatus; accent?: boolean }) {
   return (
      <span
         className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
            accent ? 'bg-card-accent text-card-paper-bg' : 'border border-card-border/40 bg-card-popover-bg text-card-popover-fg',
         )}
      >
         <span>{status.name}</span>
         <span className="tabular-nums opacity-80">{status.tier}</span>
      </span>
   );
}

/** The difficulty row: circular crosshairs (Otherscape) or filled stars (LitM + City), one glyph per challenge level. */
export function DifficultyMarks({ game, count, className }: { game: ChallengeDetails['game']; count: number; className?: string }) {
   const outline = game === 'OTHERSCAPE';
   const Icon = outline ? Crosshair : Star;
   return (
      <>
         {Array.from({ length: count }).map((_, index) => (
            <Icon key={index} className={cn(className, !outline && 'fill-current')} strokeWidth={outline ? 2.5 : undefined} />
         ))}
      </>
   );
}

/** A consequence's leading marker: a skull in a header-colored rhombus (LitM) or a lime double-chevron (Otherscape). */
export function ConsequenceBullet({ game, className }: { game: ChallengeDetails['game']; className?: string }) {
   if (game === 'OTHERSCAPE') {
      return <ChevronsRight className={cn('h-3.5 w-3.5 shrink-0 text-card-accent', className)} strokeWidth={3} />;
   }
   return (
      <span className={cn('flex h-3.5 w-3.5 shrink-0 rotate-45 items-center justify-center rounded-[2px] bg-card-header-bg', className)}>
         <Skull className="h-2.5 w-2.5 -rotate-45 text-card-header-fg" strokeWidth={2.75} />
      </span>
   );
}

/** A City move's leading marker: an accent double-chevron (Hard) or single-chevron (Soft). */
export function MoveBullet({ kind, className }: { kind: 'hard' | 'soft'; className?: string }) {
   const Icon = kind === 'hard' ? ChevronsRight : ChevronRight;
   return <Icon className={cn('h-3.5 w-3.5 shrink-0 text-card-accent', className)} strokeWidth={3} />;
}

/** A read-mode chevron-bulleted City move list (Hard = double-chevron, Soft = single), or the empty-state line. */
export function MoveList({ moves, kind, mentionClick, emptyLabel, textClassName }: {
   moves: CityMove[];
   kind: 'hard' | 'soft';
   mentionClick: RowMentionClick;
   emptyLabel: string;
   textClassName?: string;
}) {
   if (moves.length === 0) {
      return <p className={cn('text-sm italic text-card-paper-fg/70', textClassName)}>{`[${emptyLabel}]`}</p>;
   }
   return (
      <ul className={cn('list-none space-y-1', textClassName)}>
         {moves.map((move) => (
            <li key={move.id} className="flex items-start gap-1.5">
               <MoveBullet kind={kind} className="mt-0.5" />
               <MentionMarkdown text={move.text} onMentionClick={mentionClick} className="min-w-0 [&_p]:my-0" />
            </li>
         ))}
      </ul>
   );
}

/** The challenge's own status: a green `name-tier` pill (fixed game-content color). */
export function StatusPill({ status }: { status: ChallengeStatus }) {
   return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-700 px-2 py-0.5 text-xs font-semibold text-green-50">
         <span>{status.name}</span>
         <span className="tabular-nums opacity-90">{status.tier}</span>
      </span>
   );
}

/** The challenge's own tag: a yellow italic pill (fixed game-content color). */
export function TagPill({ tag }: { tag: BlandTag }) {
   return (
      <span className="inline-flex items-center rounded-full bg-yellow-500 px-2 py-0.5 text-xs font-medium italic text-yellow-950">
         {tag.name}
      </span>
   );
}

/** A Mighty tag: its own full-width row - a prominent Might-level icon in the level's identity color + label, no pill chrome. */
export function MightyTagPill({ mightyTag }: { mightyTag: MightyTag }) {
   // Resolves to a stable module-level lucide component, so static-components is a false positive here.
   const Icon = mightIcon(mightyTag.level);
   return (
      <span className="flex w-full items-center gap-2 py-0.5 text-sm font-semibold text-card-paper-fg">
         {/* eslint-disable-next-line react-hooks/static-components */}
         <Icon className="h-5 w-5 shrink-0" strokeWidth={2.5} style={{ color: mightLevelColor(mightyTag.level) }} />
         <span>{mightyTag.label}</span>
      </span>
   );
}

/** A threat's name: a filled card-accent pill (holds its shape as the flavor wraps beside it). */
export function ThreatPill({ tag }: { tag: string }) {
   return (
      <span className="inline-flex shrink-0 items-center rounded-full bg-card-accent px-2 py-0.5 align-baseline text-xs font-semibold text-card-paper-bg">
         {tag}
      </span>
   );
}

/** A tight `-  N  +` stepper pill, styled like `LimitPill` (card tokens). Commits immediately on click. */
export function TierStepperPill({ tier, onChange }: { tier: number; onChange: (next: number) => void }) {
   return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-card-border/40 bg-card-popover-bg px-1 py-0.5 text-card-popover-fg">
         <button
            type="button"
            onClick={() => onChange(Math.max(0, tier - 1))}
            className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-card-paper-fg/10 cursor-pointer"
         >
            <Minus className="h-3 w-3" />
         </button>
         <span className="w-4 text-center text-xs tabular-nums">{tier}</span>
         <button
            type="button"
            onClick={() => onChange(tier + 1)}
            className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-card-paper-fg/10 cursor-pointer"
         >
            <Plus className="h-3 w-3" />
         </button>
      </span>
   );
}

/** An editable Limit/Status row: `[name input] [tier stepper] [Trash2]`. Shared by both sections (both are `ChallengeStatus`). */
export function StatusEditRow({ status, namePlaceholder, onCommitName, onCommitTier, onRemove, removeLabel }: {
   status: ChallengeStatus;
   namePlaceholder: string;
   onCommitName: (name: string) => void;
   onCommitTier: (tier: number) => void;
   onRemove: () => void;
   removeLabel: string;
}) {
   // Hook state stays above any conditional so toggling edit mode never remounts this row mid-edit.
   const [localName, setLocalName] = useInputDebouncer(status.name, onCommitName);

   return (
      <div className="flex items-center gap-1.5">
         <Input
            value={localName}
            onChange={(event) => setLocalName(event.target.value)}
            placeholder={namePlaceholder}
            className="h-7 min-w-0 flex-1 border-0 bg-transparent px-2 py-0.5 text-xs shadow-none text-card-paper-fg placeholder:text-card-paper-fg/50 focus-visible:ring-card-accent/50"
         />
         <TierStepperPill tier={status.tier} onChange={onCommitTier} />
         <button type="button" onClick={onRemove} title={removeLabel} aria-label={removeLabel} className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-card-paper-fg/60 hover:bg-card-paper-fg/10 hover:text-card-paper-fg cursor-pointer">
            <Trash2 className="h-3.5 w-3.5" />
         </button>
      </div>
   );
}

/** An editable Tag row: `[name input] [Trash2]` (name-only, no icon-well). */
export function TagEditRow({ tag, namePlaceholder, onCommitName, onRemove, removeLabel }: {
   tag: BlandTag;
   namePlaceholder: string;
   onCommitName: (name: string) => void;
   onRemove: () => void;
   removeLabel: string;
}) {
   const [localName, setLocalName] = useInputDebouncer(tag.name, onCommitName);

   return (
      <div className="flex items-center gap-1.5">
         <Input
            value={localName}
            onChange={(event) => setLocalName(event.target.value)}
            placeholder={namePlaceholder}
            className="h-7 min-w-0 flex-1 border-0 bg-transparent px-2 py-0.5 text-xs italic shadow-none text-card-paper-fg placeholder:text-card-paper-fg/50 focus-visible:ring-card-accent/50"
         />
         <button type="button" onClick={onRemove} title={removeLabel} aria-label={removeLabel} className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-card-paper-fg/60 hover:bg-card-paper-fg/10 hover:text-card-paper-fg cursor-pointer">
            <Trash2 className="h-3.5 w-3.5" />
         </button>
      </div>
   );
}

/** A three-icon Might level picker; the active level is filled, the others dimmed. Commits on click. */
export function MightLevelPicker({ level, onPick }: { level: MightLevel; onPick: (level: MightLevel) => void }) {
   const { t } = useTranslation();

   return (
      <div role="radiogroup" aria-label={t('Cards.challenge.mightyLevel')} className="flex shrink-0 items-center gap-0.5">
         {MIGHT_LEVELS.map((option) => {
            const Icon = mightIcon(option);
            const active = option === level;
            return (
               <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={t(`ThemeTypes.${option}`)}
                  title={t(`ThemeTypes.${option}`)}
                  onClick={() => onPick(option)}
                  className={cn(
                     'flex h-7 w-7 items-center justify-center rounded cursor-pointer',
                     active ? 'bg-card-paper-fg/10' : 'opacity-40 hover:opacity-100',
                  )}
               >
                  <Icon className="h-4 w-4" strokeWidth={2.5} style={{ color: mightLevelColor(option) }} />
               </button>
            );
         })}
      </div>
   );
}

/** A two-option Logos/Mythos toggle for a City challenge's primary type (its colour theme). Commits on click. */
export function PrimaryTypePicker({ primaryType, onPick }: { primaryType: CityChallengeDetails['primaryType']; onPick: (primaryType: CityChallengeDetails['primaryType']) => void }) {
   const { t } = useTranslation();
   const options: CityChallengeDetails['primaryType'][] = ['Logos', 'Mythos'];

   return (
      <div role="radiogroup" aria-label={t('Cards.challenge.primaryType')} className="inline-flex w-fit shrink-0 self-start items-center gap-0.5 rounded-md border border-card-border/40 bg-card-popover-bg/40 p-0.5">
         {options.map((option) => {
            const active = option === primaryType;
            return (
               <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onPick(option)}
                  className={cn(
                     'rounded px-2.5 py-1 text-xs font-semibold cursor-pointer transition-colors',
                     active ? 'text-white' : 'text-card-paper-fg/70 hover:bg-card-paper-fg/10',
                  )}
                  style={active ? { backgroundColor: primaryTypeColor(option) } : undefined}
               >
                  {t(`ThemeTypes.${option}`)}
               </button>
            );
         })}
      </div>
   );
}

/** An editable Mighty tag row: `[Might level picker] [label input] [Trash2]`; the label rides the debouncer. */
export function MightyTagEditRow({ mightyTag, labelPlaceholder, onCommitLevel, onCommitLabel, onRemove, removeLabel }: {
   mightyTag: MightyTag;
   labelPlaceholder: string;
   onCommitLevel: (level: MightLevel) => void;
   onCommitLabel: (label: string) => void;
   onRemove: () => void;
   removeLabel: string;
}) {
   // Hook state stays above any conditional so toggling edit mode never remounts this row mid-edit.
   const [localLabel, setLocalLabel] = useInputDebouncer(mightyTag.label, onCommitLabel);

   return (
      <div className="flex items-center gap-1.5">
         <MightLevelPicker level={mightyTag.level} onPick={onCommitLevel} />
         <Input
            value={localLabel}
            onChange={(event) => setLocalLabel(event.target.value)}
            placeholder={labelPlaceholder}
            className="h-7 min-w-0 flex-1 border-0 bg-transparent px-2 py-0.5 text-xs shadow-none text-card-paper-fg placeholder:text-card-paper-fg/50 focus-visible:ring-card-accent/50"
         />
         <button type="button" onClick={onRemove} title={removeLabel} aria-label={removeLabel} className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-card-paper-fg/60 hover:bg-card-paper-fg/10 hover:text-card-paper-fg cursor-pointer">
            <Trash2 className="h-3.5 w-3.5" />
         </button>
      </div>
   );
}

/**
 * An editable Special row: a bold name input over a body textarea (with a live mention preview) + remove.
 * Name and body each carry their own debouncer with hook state above any branch, so toggling edit mode
 * never remounts the row mid-edit; both flush by id against the live list, so they can't clobber.
 */
export function SpecialEditRow({ special, namePlaceholder, bodyPlaceholder, onCommitName, onCommitBody, onRemove, removeLabel }: {
   special: ChallengeSpecial;
   namePlaceholder: string;
   bodyPlaceholder: string;
   onCommitName: (name: string) => void;
   onCommitBody: (body: string) => void;
   onRemove: () => void;
   removeLabel: string;
}) {
   const [localName, setLocalName] = useInputDebouncer(special.name, onCommitName);
   const [localBody, setLocalBody] = useInputDebouncer(special.body, onCommitBody);

   return (
      <div className="flex flex-col gap-1.5">
         <div className="flex items-center gap-1.5">
            <Input
               value={localName}
               onChange={(event) => setLocalName(event.target.value)}
               placeholder={namePlaceholder}
               className="h-7 min-w-0 flex-1 border-0 bg-transparent px-2 py-0.5 text-center text-xs font-bold shadow-none text-card-paper-fg placeholder:text-card-paper-fg/50 focus-visible:ring-card-accent/50"
            />
            <button type="button" onClick={onRemove} title={removeLabel} aria-label={removeLabel} className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-card-paper-fg/60 hover:bg-card-paper-fg/10 hover:text-card-paper-fg cursor-pointer">
               <Trash2 className="h-3.5 w-3.5" />
            </button>
         </div>
         <Textarea
            value={localBody}
            onChange={(event) => setLocalBody(event.target.value)}
            placeholder={bodyPlaceholder}
            className="min-h-14 resize-none border-0 bg-card-popover-bg/40 text-xs text-card-paper-fg placeholder:text-card-paper-fg/50 shadow-none focus-visible:ring-card-accent/50"
         />
         <MentionPreview text={localBody} />
      </div>
   );
}

/**
 * An editable City custom-move row: a name input over a body textarea (with a live mention preview) + remove.
 * Like a Special row minus the centering - name and body each carry their own debouncer with hook state
 * above any branch, and both flush by id against the live list, so toggling edit mode can't clobber either.
 */
export function CustomMoveEditRow({ move, namePlaceholder, descriptionPlaceholder, onCommitName, onCommitDescription, onRemove, removeLabel }: {
   move: CityCustomMove;
   namePlaceholder: string;
   descriptionPlaceholder: string;
   onCommitName: (name: string) => void;
   onCommitDescription: (description: string) => void;
   onRemove: () => void;
   removeLabel: string;
}) {
   const [localName, setLocalName] = useInputDebouncer(move.name, onCommitName);
   const [localDescription, setLocalDescription] = useInputDebouncer(move.description, onCommitDescription);

   return (
      <div className="flex flex-col gap-1.5">
         <div className="flex items-center gap-1.5">
            <Input
               value={localName}
               onChange={(event) => setLocalName(event.target.value)}
               placeholder={namePlaceholder}
               className="h-7 min-w-0 flex-1 border-0 bg-transparent px-2 py-0.5 text-xs font-semibold shadow-none text-card-paper-fg placeholder:text-card-paper-fg/50 focus-visible:ring-card-accent/50"
            />
            <button type="button" onClick={onRemove} title={removeLabel} aria-label={removeLabel} className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-card-paper-fg/60 hover:bg-card-paper-fg/10 hover:text-card-paper-fg cursor-pointer">
               <Trash2 className="h-3.5 w-3.5" />
            </button>
         </div>
         <Textarea
            value={localDescription}
            onChange={(event) => setLocalDescription(event.target.value)}
            placeholder={descriptionPlaceholder}
            className="min-h-14 resize-none border-0 bg-card-popover-bg/40 text-xs text-card-paper-fg placeholder:text-card-paper-fg/50 shadow-none focus-visible:ring-card-accent/50"
         />
         <MentionPreview text={localDescription} />
      </div>
   );
}

/** An editable City hard/soft-move row: a body textarea (with a live mention preview) + remove; the text rides the debouncer. */
export function MoveEditRow({ move, placeholder, onCommitText, onRemove, removeLabel }: {
   move: CityMove;
   placeholder: string;
   onCommitText: (text: string) => void;
   onRemove: () => void;
   removeLabel: string;
}) {
   const [localText, setLocalText] = useInputDebouncer(move.text, onCommitText);

   return (
      <div className="flex flex-col gap-1.5">
         <div className="flex items-start gap-1.5">
            <Textarea
               value={localText}
               onChange={(event) => setLocalText(event.target.value)}
               placeholder={placeholder}
               className="min-h-10 flex-1 resize-none border-0 bg-card-popover-bg/40 text-xs text-card-paper-fg placeholder:text-card-paper-fg/50 shadow-none focus-visible:ring-card-accent/50"
            />
            <button type="button" onClick={onRemove} title={removeLabel} aria-label={removeLabel} className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-card-paper-fg/60 hover:bg-card-paper-fg/10 hover:text-card-paper-fg cursor-pointer">
               <Trash2 className="h-3.5 w-3.5" />
            </button>
         </div>
         <MentionPreview text={localText} />
      </div>
   );
}

/** A dashed ghost "add row" button, card-token styled so it doesn't wash out on the challenge palette. */
export function AddRowButton({ label, onClick }: { label: string; onClick: () => void }) {
   return (
      <button
         type="button"
         onClick={onClick}
         className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-card-border/40 py-1 text-xs text-card-paper-fg/70 hover:bg-card-paper-fg/10 cursor-pointer"
      >
         <Plus className="h-3.5 w-3.5" />
         {label}
      </button>
   );
}

/** A live styled preview of authored text, shown once it carries a `{brace}` mention (card-token chrome). */
function MentionPreview({ text }: { text: string }) {
   if (!text.includes('{')) return null;
   return (
      <MentionMarkdown text={text} className="rounded bg-card-popover-bg/40 px-2 py-1 text-xs leading-relaxed" />
   );
}

/** An editable consequence row: `[text input] [Trash2]`, id-keyed so a delete never scrambles a live edit. */
export function ConsequenceEditRow({ consequence, placeholder, onCommitText, onRemove, removeLabel }: {
   consequence: { id: string; text: string };
   placeholder: string;
   onCommitText: (text: string) => void;
   onRemove: () => void;
   removeLabel: string;
}) {
   // Hook state above any conditional, so a sibling delete/reorder never remounts this row mid-edit.
   const [localText, setLocalText] = useInputDebouncer(consequence.text, onCommitText);

   return (
      <div className="flex items-center gap-1.5">
         <Input
            value={localText}
            onChange={(event) => setLocalText(event.target.value)}
            placeholder={placeholder}
            className="h-7 min-w-0 flex-1 border-0 bg-transparent px-2 py-0.5 text-xs shadow-none text-card-paper-fg placeholder:text-card-paper-fg/50 focus-visible:ring-card-accent/50"
         />
         <button type="button" onClick={onRemove} title={removeLabel} aria-label={removeLabel} className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-card-paper-fg/60 hover:bg-card-paper-fg/10 hover:text-card-paper-fg cursor-pointer">
            <Trash2 className="h-3.5 w-3.5" />
         </button>
      </div>
   );
}

/**
 * An editable Threats & Consequences ability: a tag input + flavor textarea (with a live mention
 * preview) over its own consequence list + add button. Every facet commits through `onPatch(mutate)`,
 * which applies `mutate` to the LIVE ability read from the store at commit time - never a captured
 * snapshot. Tag and flavor each carry their own debouncer, and both can flush together when the row
 * unmounts (the accordion collapses this ability as another takes focus); reading live-then-patching
 * means the second flush already sees the first's write, so neither field can clobber the other. The
 * consequence sub-rows patch the live `consequences` the same way, id-keyed via the shared helpers.
 */
export function AbilityEditRow({ ability, onPatch, onRemove }: {
   ability: ChallengeAbility;
   onPatch: (mutate: (current: ChallengeAbility) => ChallengeAbility) => void;
   onRemove: () => void;
}) {
   const { t } = useTranslation();
   // Tag + flavor ride the debouncer with their hook state above any branch, mirroring the other rows.
   const [localTag, setLocalTag] = useInputDebouncer(ability.tag, (tag) => onPatch((current) => ({ ...current, tag })));
   const [localFlavor, setLocalFlavor] = useInputDebouncer(ability.flavor, (flavor) => onPatch((current) => ({ ...current, flavor })));

   return (
      <div className="flex flex-col gap-2">
         <div className="flex items-center gap-1.5">
            <Input
               value={localTag}
               onChange={(event) => setLocalTag(event.target.value)}
               placeholder={t('Common.threatName')}
               className="h-7 min-w-0 flex-1 border-0 bg-transparent px-2 py-0.5 text-xs font-semibold shadow-none text-card-paper-fg placeholder:text-card-paper-fg/50 focus-visible:ring-card-accent/50"
            />
            <button type="button" onClick={onRemove} title={t('Cards.challenge.removeThreat')} aria-label={t('Cards.challenge.removeThreat')} className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-card-paper-fg/60 hover:bg-card-paper-fg/10 hover:text-card-paper-fg cursor-pointer">
               <Trash2 className="h-3.5 w-3.5" />
            </button>
         </div>
         <Textarea
            value={localFlavor}
            onChange={(event) => setLocalFlavor(event.target.value)}
            placeholder={t('Cards.challenge.threatFlavorPlaceholder')}
            className="min-h-14 resize-none border-0 bg-card-popover-bg/40 text-xs text-card-paper-fg placeholder:text-card-paper-fg/50 shadow-none focus-visible:ring-card-accent/50"
         />
         <MentionPreview text={localFlavor} />
         <div className="flex flex-col gap-1 pl-2">
            {ability.consequences.map((consequence) => (
               <ConsequenceEditRow
                  key={consequence.id}
                  consequence={consequence}
                  placeholder={t('Common.aConsequence')}
                  onCommitText={(text) => onPatch((current) => ({ ...current, consequences: updateRowById(current.consequences, consequence.id, { text }) }))}
                  onRemove={() => onPatch((current) => ({ ...current, consequences: removeRowById(current.consequences, consequence.id) }))}
                  removeLabel={t('Common.remove')}
               />
            ))}
            <AddRowButton label={t('Common.addConsequence')} onClick={() => onPatch((current) => ({ ...current, consequences: addRow(current.consequences, newConsequence()) }))} />
         </div>
      </div>
   );
}

/** A tapped-mention handler routed to a row's flavor/consequence text (or undefined on a static surface). */
export type RowMentionClick = ((segment: MentionSegment) => void) | undefined;

/**
 * The by-id commit ops for one of the challenge's single-field lists (limits / statuses / tags). Each
 * op reads the LIVE list from the store at commit time and patches by id, so a debounced field's
 * unmount-flush can't clobber a sibling row that flushed just before it. The host card owns them (it
 * has the store); the expanded sheet reuses the same ops so both surfaces commit identically.
 */
export interface RowListOps<T> {
   commitById: (id: string, updates: Partial<T>) => void;
   removeById: (id: string) => void;
   add: () => void;
}
