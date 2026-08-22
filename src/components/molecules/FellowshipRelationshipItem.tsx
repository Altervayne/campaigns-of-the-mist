// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Basic UI Imports --
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

// -- Icon Imports --
import { Trash2 } from 'lucide-react';

// -- Store and Hook Imports --
import { useCharacterActions } from '@/lib/stores/characterStore';
import { useInputDebouncer } from '@/hooks/useInputDebouncer';

// -- Type Imports --
import type { FellowshipRelationship } from '@/lib/types/character';



interface FellowshipRelationshipItemProps {
   cardId: string;
   relationship: FellowshipRelationship;
   isEditing: boolean;
   index: number;
   translationNamespace?: 'HeroCard' | 'OtherscapeCharacterCard';
}



export function FellowshipRelationshipItem({ cardId, relationship, isEditing, index, translationNamespace = 'HeroCard' }: FellowshipRelationshipItemProps) {
   const { t } = useTranslation();
   const { updateRelationship, removeRelationship } = useCharacterActions();

   const isEvenRow = index % 2 === 0;
   // Faint wash of the card's ink so the zebra adapts per card-type + light/dark.
   const rowBackground = `color-mix(in srgb, var(--card-paper-fg) ${isEvenRow ? 6 : 3}%, transparent)`;



   // ###########################
   // ###   INPUT DEBOUNCER   ###
   // ###########################

   // ==================
   //  Companion Name
   // ==================
   const [localCompanionName, setLocalCompanionName] = useInputDebouncer(
      relationship.companionName,
      (value) => updateRelationship(cardId, relationship.id, { companionName: value })
   );

   // ==================
   //  Relationship Tag
   // ==================
   const [localRelationshipTag, setLocalRelationshipTag] = useInputDebouncer(
      relationship.relationshipTag,
      (value) => updateRelationship(cardId, relationship.id, { relationshipTag: value })
   );



   return (
      <div className="flex items-center gap-2 text-sm p-1" style={{ backgroundColor: rowBackground }}>
         {isEditing ? (
            <Input
               value={localCompanionName}
               onChange={(e) => setLocalCompanionName(e.target.value)}
               className="h-7 flex-1 border-dashed"
               placeholder={t(`${translationNamespace}.companionPlaceholder`)}
            />
         ) : (
            <span className="flex-1 font-semibold text-center">{relationship.companionName ? relationship.companionName : `[${t(`${translationNamespace}.relationshipCompanionNoName`)}]`}</span>
         )}

         {isEditing ? (
            <Input
               value={localRelationshipTag}
               onChange={(e) => setLocalRelationshipTag(e.target.value)}
               className="h-7 flex-1 border-dashed italic"
               placeholder={t(`${translationNamespace}.relationshipPlaceholder`)}
            />
         ) : (
            <span className="flex-1 italic text-muted-foreground text-center">&quot;{relationship.relationshipTag ? relationship.relationshipTag : `[${t(`${translationNamespace}.relationshipRelationNoName`)}]`}&quot;</span>
         )}

         {isEditing && (
            <Button
               variant="ghost"
               size="icon"
               className="h-7 w-7 text-destructive cursor-pointer touch-target"
               onClick={() => removeRelationship(cardId, relationship.id)}
            >
               <Trash2 className="h-4 w-4" />
            </Button>
         )}
      </div>
   );
}
