// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Basic UI Imports --
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

// -- Icon Imports --
import { Plus, Trash2 } from 'lucide-react';

// -- Component Imports --
import { MightLevelPicker } from '@/components/organisms/cards/challengeCardEditRows';
import { IconButton, MentionPreview, Stepper } from './fields';

// -- Shared Factories --
import { addRow, newConsequence, removeRowById, updateRowById } from '@/lib/cards/challengeCardFactories';

// -- Type Imports --
import type { ChallengeAbility, ChallengeSpecial, ChallengeStatus, CityCustomMove, CityMove, MightyTag } from '@/lib/types/character';

/** A `{ name, tier }` row (limits + statuses). */
export function StatusRow({ status, namePlaceholder, onChange, onRemove, removeLabel }: {
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
export function AbilityRow({ ability, onChange, onRemove }: { ability: ChallengeAbility; onChange: (next: ChallengeAbility) => void; onRemove: () => void }) {
   const { t } = useTranslation();
   return (
      <div className="flex flex-col gap-2 rounded-md border border-border p-2">
         <div className="flex items-center gap-2">
            <Input value={ability.tag} onChange={(event) => onChange({ ...ability, tag: event.target.value })} placeholder={t('Common.threatName')} className="h-8 text-sm font-semibold" />
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
                        placeholder={t('Common.aConsequence')}
                        className="h-8 text-sm"
                     />
                     <IconButton onClick={() => onChange({ ...ability, consequences: removeRowById(ability.consequences, consequence.id) })} label={t('Common.remove')}><Trash2 className="h-4 w-4" /></IconButton>
                  </div>
                  <MentionPreview text={consequence.text} />
               </div>
            ))}
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ ...ability, consequences: addRow(ability.consequences, newConsequence()) })} className="cursor-pointer border border-dashed">
               <Plus className="mr-1 h-4 w-4" />{t('Common.addConsequence')}
            </Button>
         </div>
      </div>
   );
}

/** A mighty-tag row: a Might level picker + a label input. */
export function MightyTagRow({ mightyTag, onChange, onRemove }: { mightyTag: MightyTag; onChange: (next: MightyTag) => void; onRemove: () => void }) {
   const { t } = useTranslation();
   return (
      <div className="flex items-center gap-2">
         <MightLevelPicker level={mightyTag.level} onPick={(level) => onChange({ ...mightyTag, level })} />
         <Input value={mightyTag.label} onChange={(event) => onChange({ ...mightyTag, label: event.target.value })} placeholder={t('Common.eGFireproofHide')} className="h-8 text-sm" />
         <IconButton onClick={onRemove} label={t('ChallengeCard.editor.removeMightyTag')}><Trash2 className="h-4 w-4" /></IconButton>
      </div>
   );
}

/** A special row: a bold name + a rich body textarea with a live mention preview. */
export function SpecialRow({ special, onChange, onRemove }: { special: ChallengeSpecial; onChange: (next: ChallengeSpecial) => void; onRemove: () => void }) {
   const { t } = useTranslation();
   return (
      <div className="flex flex-col gap-2 rounded-md border border-border p-2">
         <div className="flex items-center gap-2">
            <Input value={special.name} onChange={(event) => onChange({ ...special, name: event.target.value })} placeholder={t('Common.specialName')} className="h-8 text-sm font-semibold" />
            <IconButton onClick={onRemove} label={t('ChallengeCard.editor.removeSpecial')}><Trash2 className="h-4 w-4" /></IconButton>
         </div>
         <Textarea value={special.body} onChange={(event) => onChange({ ...special, body: event.target.value })} placeholder={t('ChallengeCard.editor.specialBodyPlaceholder')} className="min-h-14 resize-none text-sm" />
         <MentionPreview text={special.body} />
      </div>
   );
}

/** A custom-move row: a name + a rich description textarea with a live mention preview. */
export function CustomMoveRow({ move, onChange, onRemove }: { move: CityCustomMove; onChange: (next: CityCustomMove) => void; onRemove: () => void }) {
   const { t } = useTranslation();
   return (
      <div className="flex flex-col gap-2 rounded-md border border-border p-2">
         <div className="flex items-center gap-2">
            <Input value={move.name} onChange={(event) => onChange({ ...move, name: event.target.value })} placeholder={t('Common.moveName')} className="h-8 text-sm font-semibold" />
            <IconButton onClick={onRemove} label={t('ChallengeCard.editor.removeCustomMove')}><Trash2 className="h-4 w-4" /></IconButton>
         </div>
         <Textarea value={move.description} onChange={(event) => onChange({ ...move, description: event.target.value })} placeholder={t('ChallengeCard.editor.customMoveDescriptionPlaceholder')} className="min-h-14 resize-none text-sm" />
         <MentionPreview text={move.description} />
      </div>
   );
}

/** A hard/soft-move row: a bare rich text textarea with a live mention preview. */
export function MoveRow({ move, placeholder, onChange, onRemove }: { move: CityMove; placeholder: string; onChange: (next: CityMove) => void; onRemove: () => void }) {
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
