// -- React Imports --
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import toast from 'react-hot-toast';

// -- Basic UI Imports --
import { DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

// -- Icon Imports --
import { Trash2 } from 'lucide-react';

// -- Component Imports --
import { ChallengeTypeSelector } from '@/components/molecules/ChallengeTypeSelector';
import { Field, IconButton, ImagePicker, ListSection, MentionPreview, Stepper } from './fields';
import { AbilityRow, MightyTagRow, SpecialRow, StatusRow } from './rows';

// -- Store and Hook Imports --
import { useCharacterActions } from '@/lib/stores/characterStore';

// -- Shared Factories --
import { newAbility, newMightyTag, newSpecial, newStatus, newTag } from '@/lib/cards/challengeCardFactories';

// -- Type Imports --
import type { BlandTag, Card as CardData, ChallengeAbility, ChallengeSpecial, ChallengeStatus, MightyTag, SharedChallengeDetails } from '@/lib/types/character';

/** The form body. Remounts per edit (the dialog only renders it while open), so local state starts fresh. */
export function ChallengeEditorForm({ card, onDone }: { card: CardData; onDone: () => void }) {
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
