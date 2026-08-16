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

// -- Component Imports --
import { PrimaryTypePicker } from '@/components/organisms/cards/challengeCardEditRows';
import { Field, ImagePicker, ListSection, MentionPreview, Stepper } from './fields';
import { CustomMoveRow, MoveRow, StatusRow } from './rows';

// -- Store and Hook Imports --
import { useCharacterActions } from '@/lib/stores/characterStore';

// -- Shared Factories --
import { newCustomMove, newHardMove, newSoftMove, newStatus } from '@/lib/cards/challengeCardFactories';

// -- Type Imports --
import type { Card as CardData, ChallengeStatus, CityChallengeDetails, CityCustomMove, CityMove } from '@/lib/types/character';

/** The City of Mist form body. Remounts per edit, so local state starts fresh; commits the full City details on Save. */
export function CityChallengeEditorForm({ card, onDone }: { card: CardData; onDone: () => void }) {
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
         <Field label={t('Common.name')}>
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
               <Input value={logosSubtitle} onChange={(event) => setLogosSubtitle(event.target.value)} placeholder={t('Common.logosSubtitle')} />
            </Field>
            <Field label={t('ChallengeCard.editor.mythosSubtitle')}>
               <Input value={mythosSubtitle} onChange={(event) => setMythosSubtitle(event.target.value)} placeholder={t('Common.mythosSubtitle')} />
            </Field>
         </div>

         {/* Flavor. */}
         <Field label={t('ChallengeCard.editor.flavor')}>
            <Textarea value={flavor} onChange={(event) => setFlavor(event.target.value)} placeholder={t('Common.whatThePlayersSee')} className="min-h-20 resize-none" />
            <MentionPreview text={flavor} />
         </Field>

         {/* Spectrums (name + tier). */}
         <ListSection
            label={t('Common.spectrums')}
            addLabel={t('Common.addSpectrum')}
            onAdd={() => setSpectrums((current) => [...current, newStatus()])}
         >
            {spectrums.map((spectrum) => (
               <StatusRow
                  key={spectrum.id}
                  status={spectrum}
                  namePlaceholder={t('Common.eGInfluence')}
                  onChange={(next) => setSpectrums((current) => current.map((entry) => (entry.id === spectrum.id ? next : entry)))}
                  onRemove={() => setSpectrums((current) => current.filter((entry) => entry.id !== spectrum.id))}
                  removeLabel={t('Common.remove')}
               />
            ))}
         </ListSection>

         {/* Custom moves: a name + rich description (no consequences). */}
         <ListSection
            label={t('Common.customMoves')}
            addLabel={t('Common.addMove')}
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
            label={t('Common.hardMoves')}
            addLabel={t('Common.addHardMove')}
            onAdd={() => setHardMoves((current) => [...current, newHardMove()])}
         >
            {hardMoves.map((move) => (
               <MoveRow
                  key={move.id}
                  move={move}
                  placeholder={t('Common.aHardMove')}
                  onChange={(next) => setHardMoves((current) => current.map((entry) => (entry.id === move.id ? next : entry)))}
                  onRemove={() => setHardMoves((current) => current.filter((entry) => entry.id !== move.id))}
               />
            ))}
         </ListSection>

         {/* Soft moves: bare rich text. */}
         <ListSection
            label={t('Common.softMoves')}
            addLabel={t('Common.addSoftMove')}
            onAdd={() => setSoftMoves((current) => [...current, newSoftMove()])}
         >
            {softMoves.map((move) => (
               <MoveRow
                  key={move.id}
                  move={move}
                  placeholder={t('Common.aSoftMove')}
                  onChange={(next) => setSoftMoves((current) => current.map((entry) => (entry.id === move.id ? next : entry)))}
                  onRemove={() => setSoftMoves((current) => current.filter((entry) => entry.id !== move.id))}
               />
            ))}
         </ListSection>

         <DialogFooter>
            <Button type="button" variant="outline" onClick={onDone} className="cursor-pointer">{t('Common.cancel')}</Button>
            <Button type="button" onClick={handleSave} className="cursor-pointer">{t('ChallengeCard.editor.save')}</Button>
         </DialogFooter>
      </div>
   );
}
