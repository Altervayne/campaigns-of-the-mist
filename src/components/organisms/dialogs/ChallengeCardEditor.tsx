// -- React Imports --
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import toast from 'react-hot-toast';

// -- Basic UI Imports --
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

// -- Icon Imports --
import { Image as ImageIcon, Loader2, Minus, Plus, Trash2, Upload } from 'lucide-react';

// -- Component Imports --
import { MentionMarkdown } from '@/components/molecules/MentionMarkdown';
import { ChallengeTypeSelector } from '@/components/molecules/ChallengeTypeSelector';
import { MightLevelPicker, PrimaryTypePicker } from '@/components/organisms/cards/challengeCardEditRows';

// -- Store and Hook Imports --
import { useCharacterActions } from '@/lib/stores/characterStore';
import { useAssetObjectUrl } from '@/hooks/useAssetObjectUrl';
import { useImageUpload } from '@/hooks/useImageUpload';

// -- Shared Constants --
import { CHALLENGE_ART_ASPECT } from '@/lib/cards/challengeArt';
import { ACCEPT_IMAGE } from '@/lib/utils/fileAccept';

// -- Shared Factories --
import { addRow, newAbility, newConsequence, newCustomMove, newHardMove, newMightyTag, newSoftMove, newSpecial, newStatus, newTag, removeRowById, updateRowById } from '@/lib/cards/challengeCardFactories';

// -- Type Imports --
import type { BlandTag, Card as CardData, ChallengeAbility, ChallengeSpecial, ChallengeStatus, CityChallengeDetails, CityCustomMove, CityMove, MightyTag, SharedChallengeDetails } from '@/lib/types/character';

/*
 * The GM Challenge Card editor: a dedicated dialog over the full ChallengeDetails (too rich for inline
 * card editing). The card stays a read-only display; this is its only editor. Local working state commits
 * on Save - the name via `updateCardTitle`, the rest via `updateCardDetails`. Types and Mighty tags are
 * LitM-only, so those fields appear only for a LEGENDS challenge. Fresh cuids for new rows so they behave
 * like the app's other tags.
 */

interface ChallengeCardEditorProps {
   isOpen: boolean;
   onOpenChange: (isOpen: boolean) => void;
   /** The challenge card being edited, or null when the dialog is closed. */
   card: CardData | null;
   modal?: boolean;
}

export function ChallengeCardEditor({ isOpen, onOpenChange, card, modal = true }: ChallengeCardEditorProps) {
   const { t } = useTranslation();

   return (
      <Dialog open={isOpen} onOpenChange={onOpenChange} modal={modal}>
         <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
               <DialogTitle>{t('ChallengeCard.editor.title')}</DialogTitle>
               <DialogDescription>{t('ChallengeCard.editor.description')}</DialogDescription>
            </DialogHeader>
            {card && (card.details.game === 'CITY_OF_MIST'
               ? <CityChallengeEditorForm card={card} onDone={() => onOpenChange(false)} />
               : <ChallengeEditorForm card={card} onDone={() => onOpenChange(false)} />)}
         </DialogContent>
      </Dialog>
   );
}

/** The form body. Remounts per edit (the dialog only renders it while open), so local state starts fresh. */
function ChallengeEditorForm({ card, onDone }: { card: CardData; onDone: () => void }) {
   const { t } = useTranslation();
   const { t: tNotifications } = useTranslation();
   const { updateCardTitle, updateCardDetails } = useCharacterActions();
   const details = card.details as SharedChallengeDetails;
   const isLegends = details.game === 'LEGENDS';

   const [title, setTitle] = useState(card.title);
   const [types, setTypes] = useState<string[]>(details.game === 'LEGENDS' ? details.types : []);
   const [challengeLevel, setChallengeLevel] = useState(details.challengeLevel);
   const [assetId, setAssetId] = useState<string | null>(details.assetId);
   const [flavor, setFlavor] = useState(details.flavor);
   const [limits, setLimits] = useState<ChallengeStatus[]>(details.limits);
   const [statuses, setStatuses] = useState<ChallengeStatus[]>(details.statuses);
   const [tags, setTags] = useState<BlandTag[]>(details.tags);
   const [mightyTags, setMightyTags] = useState<MightyTag[]>(details.game === 'LEGENDS' ? details.mightyTags : []);
   const [specials, setSpecials] = useState<ChallengeSpecial[]>(details.specials);
   const [abilities, setAbilities] = useState<ChallengeAbility[]>(details.abilities);

   const handleSave = () => {
      updateCardTitle(card.id, title.trim());
      const base = { challengeLevel, assetId, flavor, limits, statuses, tags, specials, abilities };
      const nextDetails: SharedChallengeDetails = details.game === 'LEGENDS'
         ? { ...details, ...base, types, mightyTags }
         : { ...details, ...base };
      updateCardDetails(card.id, nextDetails);
      toast.success(tNotifications('Notifications.card.updated'));
      onDone();
   };

   return (
      <div className="flex flex-col gap-5">
         {/* Name. */}
         <Field label={t('ChallengeCard.editor.name')}>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t(`Cards.challenge.namePlaceholder.${details.game}`)} />
         </Field>

         {/* Types (LitM-only): suggested toggles + custom entry (shared control, chrome-skinned here). */}
         {isLegends && (
            <Field label={t('ChallengeCard.editor.types')}>
               <ChallengeTypeSelector types={types} onChange={setTypes} variant="chrome" />
            </Field>
         )}

         {/* Challenge level (1-10): a short stepper beside a wider image preview. */}
         <div className="grid grid-cols-[10rem_1fr] gap-4">
            <Field label={t('ChallengeCard.editor.challengeLevel')}>
               <Stepper value={challengeLevel} min={1} max={10} onChange={setChallengeLevel} />
            </Field>
            <Field label={t('ChallengeCard.editor.image')}>
               <ImagePicker assetId={assetId} onChange={setAssetId} />
            </Field>
         </div>

         {/* Flavor. */}
         <Field label={t('ChallengeCard.editor.flavor')}>
            <Textarea value={flavor} onChange={(event) => setFlavor(event.target.value)} placeholder={t('ChallengeCard.editor.flavorPlaceholder')} className="min-h-20 resize-none" />
            <MentionPreview text={flavor} />
         </Field>

         {/* Limits: the win-conditions. */}
         <ListSection
            label={t('ChallengeCard.editor.limits')}
            addLabel={t('ChallengeCard.editor.addLimit')}
            onAdd={() => setLimits((current) => [...current, newStatus()])}
         >
            {limits.map((limit) => (
               <StatusRow
                  key={limit.id}
                  status={limit}
                  namePlaceholder={t('ChallengeCard.editor.limitNamePlaceholder')}
                  onChange={(next) => setLimits((current) => current.map((entry) => (entry.id === limit.id ? next : entry)))}
                  onRemove={() => setLimits((current) => current.filter((entry) => entry.id !== limit.id))}
                  removeLabel={t('ChallengeCard.editor.remove')}
               />
            ))}
         </ListSection>

         {/* Statuses (name + tier). */}
         <ListSection
            label={t('ChallengeCard.editor.statuses')}
            addLabel={t('ChallengeCard.editor.addStatus')}
            onAdd={() => setStatuses((current) => [...current, newStatus()])}
         >
            {statuses.map((status) => (
               <StatusRow
                  key={status.id}
                  status={status}
                  namePlaceholder={t('ChallengeCard.editor.statusNamePlaceholder')}
                  onChange={(next) => setStatuses((current) => current.map((entry) => (entry.id === status.id ? next : entry)))}
                  onRemove={() => setStatuses((current) => current.filter((entry) => entry.id !== status.id))}
                  removeLabel={t('ChallengeCard.editor.remove')}
               />
            ))}
         </ListSection>

         {/* Tags (name only). */}
         <ListSection
            label={t('ChallengeCard.editor.tags')}
            addLabel={t('ChallengeCard.editor.addTag')}
            onAdd={() => setTags((current) => [...current, newTag()])}
         >
            {tags.map((tag) => (
               <div key={tag.id} className="flex items-center gap-2">
                  <Input
                     value={tag.name}
                     onChange={(event) => setTags((current) => current.map((entry) => (entry.id === tag.id ? { ...entry, name: event.target.value } : entry)))}
                     placeholder={t('ChallengeCard.editor.tagNamePlaceholder')}
                     className="h-8 text-sm"
                  />
                  <IconButton onClick={() => setTags((current) => current.filter((entry) => entry.id !== tag.id))} label={t('ChallengeCard.editor.remove')}><Trash2 className="h-4 w-4" /></IconButton>
               </div>
            ))}
         </ListSection>

         {/* Mighty tags: a Might level + a label (LitM-only, not a player-replicable tag). */}
         {isLegends && (
            <ListSection
               label={t('ChallengeCard.editor.mightyTags')}
               addLabel={t('ChallengeCard.editor.addMightyTag')}
               onAdd={() => setMightyTags((current) => [...current, newMightyTag()])}
            >
               {mightyTags.map((mightyTag) => (
                  <MightyTagRow
                     key={mightyTag.id}
                     mightyTag={mightyTag}
                     onChange={(next) => setMightyTags((current) => current.map((entry) => (entry.id === mightyTag.id ? next : entry)))}
                     onRemove={() => setMightyTags((current) => current.filter((entry) => entry.id !== mightyTag.id))}
                  />
               ))}
            </ListSection>
         )}

         {/* Specials: a bold name + rich body (markdown + mentions). */}
         <ListSection
            label={t('ChallengeCard.editor.specials')}
            addLabel={t('ChallengeCard.editor.addSpecial')}
            onAdd={() => setSpecials((current) => [...current, newSpecial()])}
         >
            {specials.map((special) => (
               <SpecialRow
                  key={special.id}
                  special={special}
                  onChange={(next) => setSpecials((current) => current.map((entry) => (entry.id === special.id ? next : entry)))}
                  onRemove={() => setSpecials((current) => current.filter((entry) => entry.id !== special.id))}
               />
            ))}
         </ListSection>

         {/* Abilities: tag + flavor + nested consequences. */}
         <ListSection
            label={t('ChallengeCard.editor.abilities')}
            addLabel={t('ChallengeCard.editor.addAbility')}
            onAdd={() => setAbilities((current) => [...current, newAbility()])}
         >
            {abilities.map((ability) => (
               <AbilityRow
                  key={ability.id}
                  ability={ability}
                  onChange={(next) => setAbilities((current) => current.map((entry) => (entry.id === ability.id ? next : entry)))}
                  onRemove={() => setAbilities((current) => current.filter((entry) => entry.id !== ability.id))}
               />
            ))}
         </ListSection>

         <DialogFooter>
            <Button type="button" variant="outline" onClick={onDone} className="cursor-pointer">{t('ChallengeCard.editor.cancel')}</Button>
            <Button type="button" onClick={handleSave} className="cursor-pointer">{t('ChallengeCard.editor.save')}</Button>
         </DialogFooter>
      </div>
   );
}

/** The City of Mist form body. Remounts per edit, so local state starts fresh; commits the full City details on Save. */
function CityChallengeEditorForm({ card, onDone }: { card: CardData; onDone: () => void }) {
   const { t } = useTranslation();
   const { updateCardTitle, updateCardDetails } = useCharacterActions();
   const details = card.details as CityChallengeDetails;

   const [title, setTitle] = useState(card.title);
   const [primaryType, setPrimaryType] = useState<CityChallengeDetails['primaryType']>(details.primaryType);
   const [challengeLevel, setChallengeLevel] = useState(details.challengeLevel);
   const [assetId, setAssetId] = useState<string | null>(details.assetId);
   const [flavor, setFlavor] = useState(details.flavor);
   const [logosSubtitle, setLogosSubtitle] = useState(details.logosSubtitle);
   const [mythosSubtitle, setMythosSubtitle] = useState(details.mythosSubtitle);
   const [spectrums, setSpectrums] = useState<ChallengeStatus[]>(details.spectrums);
   const [customMoves, setCustomMoves] = useState<CityCustomMove[]>(details.customMoves);
   const [hardMoves, setHardMoves] = useState<CityMove[]>(details.hardMoves);
   const [softMoves, setSoftMoves] = useState<CityMove[]>(details.softMoves);

   const handleSave = () => {
      updateCardTitle(card.id, title.trim());
      const nextDetails: CityChallengeDetails = {
         game: 'CITY_OF_MIST', primaryType, assetId, challengeLevel, flavor, logosSubtitle, mythosSubtitle, spectrums, customMoves, hardMoves, softMoves,
      };
      updateCardDetails(card.id, nextDetails);
      toast.success(t('Notifications.card.updated'));
      onDone();
   };

   return (
      <div className="flex flex-col gap-5">
         {/* Name. */}
         <Field label={t('ChallengeCard.editor.name')}>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t(`Cards.challenge.namePlaceholder.${details.game}`)} />
         </Field>

         {/* Primary type (colour theme). */}
         <Field label={t('ChallengeCard.editor.primaryType')}>
            <PrimaryTypePicker primaryType={primaryType} onPick={setPrimaryType} />
         </Field>

         {/* Challenge level (1-10): a short stepper beside a wider image preview. */}
         <div className="grid grid-cols-[10rem_1fr] gap-4">
            <Field label={t('ChallengeCard.editor.challengeLevel')}>
               <Stepper value={challengeLevel} min={1} max={10} onChange={setChallengeLevel} />
            </Field>
            <Field label={t('ChallengeCard.editor.image')}>
               <ImagePicker assetId={assetId} onChange={setAssetId} />
            </Field>
         </div>

         {/* Subtitles (both always present). */}
         <div className="grid grid-cols-2 gap-4">
            <Field label={t('ChallengeCard.editor.logosSubtitle')}>
               <Input value={logosSubtitle} onChange={(event) => setLogosSubtitle(event.target.value)} placeholder={t('ChallengeCard.editor.logosSubtitlePlaceholder')} />
            </Field>
            <Field label={t('ChallengeCard.editor.mythosSubtitle')}>
               <Input value={mythosSubtitle} onChange={(event) => setMythosSubtitle(event.target.value)} placeholder={t('ChallengeCard.editor.mythosSubtitlePlaceholder')} />
            </Field>
         </div>

         {/* Flavor. */}
         <Field label={t('ChallengeCard.editor.flavor')}>
            <Textarea value={flavor} onChange={(event) => setFlavor(event.target.value)} placeholder={t('ChallengeCard.editor.flavorPlaceholder')} className="min-h-20 resize-none" />
            <MentionPreview text={flavor} />
         </Field>

         {/* Spectrums (name + tier). */}
         <ListSection
            label={t('ChallengeCard.editor.spectrums')}
            addLabel={t('ChallengeCard.editor.addSpectrum')}
            onAdd={() => setSpectrums((current) => [...current, newStatus()])}
         >
            {spectrums.map((spectrum) => (
               <StatusRow
                  key={spectrum.id}
                  status={spectrum}
                  namePlaceholder={t('ChallengeCard.editor.spectrumNamePlaceholder')}
                  onChange={(next) => setSpectrums((current) => current.map((entry) => (entry.id === spectrum.id ? next : entry)))}
                  onRemove={() => setSpectrums((current) => current.filter((entry) => entry.id !== spectrum.id))}
                  removeLabel={t('ChallengeCard.editor.remove')}
               />
            ))}
         </ListSection>

         {/* Custom moves: a name + rich description (no consequences). */}
         <ListSection
            label={t('ChallengeCard.editor.customMoves')}
            addLabel={t('ChallengeCard.editor.addCustomMove')}
            onAdd={() => setCustomMoves((current) => [...current, newCustomMove()])}
         >
            {customMoves.map((move) => (
               <CustomMoveRow
                  key={move.id}
                  move={move}
                  onChange={(next) => setCustomMoves((current) => current.map((entry) => (entry.id === move.id ? next : entry)))}
                  onRemove={() => setCustomMoves((current) => current.filter((entry) => entry.id !== move.id))}
               />
            ))}
         </ListSection>

         {/* Hard moves: bare rich text. */}
         <ListSection
            label={t('ChallengeCard.editor.hardMoves')}
            addLabel={t('ChallengeCard.editor.addHardMove')}
            onAdd={() => setHardMoves((current) => [...current, newHardMove()])}
         >
            {hardMoves.map((move) => (
               <MoveRow
                  key={move.id}
                  move={move}
                  placeholder={t('ChallengeCard.editor.hardMovePlaceholder')}
                  onChange={(next) => setHardMoves((current) => current.map((entry) => (entry.id === move.id ? next : entry)))}
                  onRemove={() => setHardMoves((current) => current.filter((entry) => entry.id !== move.id))}
               />
            ))}
         </ListSection>

         {/* Soft moves: bare rich text. */}
         <ListSection
            label={t('ChallengeCard.editor.softMoves')}
            addLabel={t('ChallengeCard.editor.addSoftMove')}
            onAdd={() => setSoftMoves((current) => [...current, newSoftMove()])}
         >
            {softMoves.map((move) => (
               <MoveRow
                  key={move.id}
                  move={move}
                  placeholder={t('ChallengeCard.editor.softMovePlaceholder')}
                  onChange={(next) => setSoftMoves((current) => current.map((entry) => (entry.id === move.id ? next : entry)))}
                  onRemove={() => setSoftMoves((current) => current.filter((entry) => entry.id !== move.id))}
               />
            ))}
         </ListSection>

         <DialogFooter>
            <Button type="button" variant="outline" onClick={onDone} className="cursor-pointer">{t('ChallengeCard.editor.cancel')}</Button>
            <Button type="button" onClick={handleSave} className="cursor-pointer">{t('ChallengeCard.editor.save')}</Button>
         </DialogFooter>
      </div>
   );
}

/** A custom-move row: a name + a rich description textarea with a live mention preview. */
function CustomMoveRow({ move, onChange, onRemove }: { move: CityCustomMove; onChange: (next: CityCustomMove) => void; onRemove: () => void }) {
   const { t } = useTranslation();
   return (
      <div className="flex flex-col gap-2 rounded-md border border-border p-2">
         <div className="flex items-center gap-2">
            <Input value={move.name} onChange={(event) => onChange({ ...move, name: event.target.value })} placeholder={t('ChallengeCard.editor.customMoveNamePlaceholder')} className="h-8 text-sm font-semibold" />
            <IconButton onClick={onRemove} label={t('ChallengeCard.editor.removeCustomMove')}><Trash2 className="h-4 w-4" /></IconButton>
         </div>
         <Textarea value={move.description} onChange={(event) => onChange({ ...move, description: event.target.value })} placeholder={t('ChallengeCard.editor.customMoveDescriptionPlaceholder')} className="min-h-14 resize-none text-sm" />
         <MentionPreview text={move.description} />
      </div>
   );
}

/** A hard/soft-move row: a bare rich text textarea with a live mention preview. */
function MoveRow({ move, placeholder, onChange, onRemove }: { move: CityMove; placeholder: string; onChange: (next: CityMove) => void; onRemove: () => void }) {
   const { t } = useTranslation();
   return (
      <div className="flex flex-col gap-2 rounded-md border border-border p-2">
         <div className="flex items-start gap-2">
            <Textarea value={move.text} onChange={(event) => onChange({ ...move, text: event.target.value })} placeholder={placeholder} className="min-h-12 flex-1 resize-none text-sm" />
            <IconButton onClick={onRemove} label={t('ChallengeCard.editor.removeMove')}><Trash2 className="h-4 w-4" /></IconButton>
         </div>
         <MentionPreview text={move.text} />
      </div>
   );
}

/** A labeled field wrapper. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
   return (
      <div className="flex flex-col gap-1.5">
         <Label className="text-sm font-semibold">{label}</Label>
         {children}
      </div>
   );
}

/** A labeled dynamic-list section with an add button. */
function ListSection({ label, addLabel, onAdd, children }: { label: string; addLabel: string; onAdd: () => void; children: React.ReactNode }) {
   return (
      <div className="flex flex-col gap-1.5">
         <Label className="text-sm font-semibold">{label}</Label>
         <div className="flex flex-col gap-1.5">{children}</div>
         <Button type="button" variant="ghost" size="sm" onClick={onAdd} className="mt-1 w-full cursor-pointer border border-dashed">
            <Plus className="mr-1 h-4 w-4" />{addLabel}
         </Button>
      </div>
   );
}

/** A live styled preview of authored text, shown once it carries a `{brace}` mention. */
function MentionPreview({ text }: { text: string }) {
   if (!text.includes('{')) return null;
   return (
      <div className="rounded bg-muted/50 px-2 py-1 text-xs leading-relaxed">
         <MentionMarkdown text={text} />
      </div>
   );
}

/** A `{ name, tier }` row (limits + statuses). */
function StatusRow({ status, namePlaceholder, onChange, onRemove, removeLabel }: {
   status: ChallengeStatus;
   namePlaceholder: string;
   onChange: (next: ChallengeStatus) => void;
   onRemove: () => void;
   removeLabel: string;
}) {
   return (
      <div className="flex items-center gap-2">
         <Input value={status.name} onChange={(event) => onChange({ ...status, name: event.target.value })} placeholder={namePlaceholder} className="h-8 text-sm" />
         <Stepper value={status.tier} min={0} max={999} onChange={(tier) => onChange({ ...status, tier })} />
         <IconButton onClick={onRemove} label={removeLabel}><Trash2 className="h-4 w-4" /></IconButton>
      </div>
   );
}

/** An ability row: tag + flavor + a nested consequence list. */
function AbilityRow({ ability, onChange, onRemove }: { ability: ChallengeAbility; onChange: (next: ChallengeAbility) => void; onRemove: () => void }) {
   const { t } = useTranslation();
   return (
      <div className="flex flex-col gap-2 rounded-md border border-border p-2">
         <div className="flex items-center gap-2">
            <Input value={ability.tag} onChange={(event) => onChange({ ...ability, tag: event.target.value })} placeholder={t('ChallengeCard.editor.abilityTagPlaceholder')} className="h-8 text-sm font-semibold" />
            <IconButton onClick={onRemove} label={t('ChallengeCard.editor.removeAbility')}><Trash2 className="h-4 w-4" /></IconButton>
         </div>
         <Textarea value={ability.flavor} onChange={(event) => onChange({ ...ability, flavor: event.target.value })} placeholder={t('ChallengeCard.editor.abilityFlavorPlaceholder')} className="min-h-14 resize-none text-sm" />
         <MentionPreview text={ability.flavor} />
         <div className="flex flex-col gap-1.5 pl-2">
            <Label className="text-xs font-semibold text-muted-foreground">{t('ChallengeCard.editor.consequences')}</Label>
            {ability.consequences.map((consequence) => (
               <div key={consequence.id} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                     <Input
                        value={consequence.text}
                        onChange={(event) => onChange({ ...ability, consequences: updateRowById(ability.consequences, consequence.id, { text: event.target.value }) })}
                        placeholder={t('ChallengeCard.editor.consequencePlaceholder')}
                        className="h-8 text-sm"
                     />
                     <IconButton onClick={() => onChange({ ...ability, consequences: removeRowById(ability.consequences, consequence.id) })} label={t('ChallengeCard.editor.remove')}><Trash2 className="h-4 w-4" /></IconButton>
                  </div>
                  <MentionPreview text={consequence.text} />
               </div>
            ))}
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ ...ability, consequences: addRow(ability.consequences, newConsequence()) })} className="cursor-pointer border border-dashed">
               <Plus className="mr-1 h-4 w-4" />{t('ChallengeCard.editor.addConsequence')}
            </Button>
         </div>
      </div>
   );
}

/** A mighty-tag row: a Might level picker + a label input. */
function MightyTagRow({ mightyTag, onChange, onRemove }: { mightyTag: MightyTag; onChange: (next: MightyTag) => void; onRemove: () => void }) {
   const { t } = useTranslation();
   return (
      <div className="flex items-center gap-2">
         <MightLevelPicker level={mightyTag.level} onPick={(level) => onChange({ ...mightyTag, level })} />
         <Input value={mightyTag.label} onChange={(event) => onChange({ ...mightyTag, label: event.target.value })} placeholder={t('ChallengeCard.editor.mightyTagLabelPlaceholder')} className="h-8 text-sm" />
         <IconButton onClick={onRemove} label={t('ChallengeCard.editor.removeMightyTag')}><Trash2 className="h-4 w-4" /></IconButton>
      </div>
   );
}

/** A special row: a bold name + a rich body textarea with a live mention preview. */
function SpecialRow({ special, onChange, onRemove }: { special: ChallengeSpecial; onChange: (next: ChallengeSpecial) => void; onRemove: () => void }) {
   const { t } = useTranslation();
   return (
      <div className="flex flex-col gap-2 rounded-md border border-border p-2">
         <div className="flex items-center gap-2">
            <Input value={special.name} onChange={(event) => onChange({ ...special, name: event.target.value })} placeholder={t('ChallengeCard.editor.specialNamePlaceholder')} className="h-8 text-sm font-semibold" />
            <IconButton onClick={onRemove} label={t('ChallengeCard.editor.removeSpecial')}><Trash2 className="h-4 w-4" /></IconButton>
         </div>
         <Textarea value={special.body} onChange={(event) => onChange({ ...special, body: event.target.value })} placeholder={t('ChallengeCard.editor.specialBodyPlaceholder')} className="min-h-14 resize-none text-sm" />
         <MentionPreview text={special.body} />
      </div>
   );
}

/** A -/value/+ stepper clamped to `[min, max]`. */
function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (value: number) => void }) {
   const set = (next: number) => onChange(Math.max(min, Math.min(max, next)));
   return (
      <div className="flex shrink-0 items-center justify-between gap-1 rounded-md border border-border px-1 py-0.5">
         <IconButton onClick={() => set(value - 1)} label="-"><Minus className="h-4 w-4" /></IconButton>
         <span className="w-7 text-center font-mono text-sm tabular-nums">{value}</span>
         <IconButton onClick={() => set(value + 1)} label="+"><Plus className="h-4 w-4" /></IconButton>
      </div>
   );
}

/** A small square ghost button for row controls. */
function IconButton({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
   return (
      <button type="button" onClick={onClick} title={label} aria-label={label} className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer">
         {children}
      </button>
   );
}

/** The image field: reuses the asset pipeline (process -> store -> hash), showing a preview or an upload prompt. */
function ImagePicker({ assetId, onChange }: { assetId: string | null; onChange: (assetId: string | null) => void }) {
   const { t } = useTranslation();
   const { url, isLoading } = useAssetObjectUrl(assetId);
   const { fileInputRef, open, isProcessing, handleFileSelected, cropperDialog } = useImageUpload(onChange, { aspect: CHALLENGE_ART_ASPECT });
   const showSpinner = isProcessing || (assetId !== null && isLoading);

   return (
      <div className="flex flex-col gap-2">
         <div className="relative w-full overflow-hidden rounded-md border border-border bg-muted" style={{ aspectRatio: CHALLENGE_ART_ASPECT }}>
            {showSpinner ? (
               <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : url ? (
               <img src={url} alt="" className="h-full w-full object-cover" />
            ) : (
               <div className="flex h-full w-full items-center justify-center text-muted-foreground"><ImageIcon className="h-8 w-8" /></div>
            )}
         </div>
         <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={open} className="cursor-pointer">
               <Upload className="mr-1 h-4 w-4" />{url ? t('ChallengeCard.editor.changeImage') : t('ChallengeCard.editor.setImage')}
            </Button>
            {url && (
               <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)} className="cursor-pointer text-destructive">
                  <Trash2 className="mr-1 h-4 w-4" />{t('ChallengeCard.editor.removeImage')}
               </Button>
            )}
         </div>
         <input ref={fileInputRef} type="file" accept={ACCEPT_IMAGE} className="hidden" onChange={handleFileSelected} />
         {cropperDialog}
      </div>
   );
}
