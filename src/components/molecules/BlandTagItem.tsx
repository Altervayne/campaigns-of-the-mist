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
import type { BlandTag } from '@/lib/types/character';



interface BlandTagItemProps {
  cardId: string;
  tag: BlandTag;
  listName: 'quintessences' | 'improvements';
  isEditing: boolean;
  index: number;
}



export function BlandTagItem({ cardId, tag, listName, isEditing, index }: BlandTagItemProps) {
   const { t } = useTranslation();
   const { updateBlandTag, removeBlandTag } = useCharacterActions();

   const isEvenRow = index % 2 === 0;

   // ###########################
   // ###   INPUT DEBOUNCER   ###
   // ###########################

   const [localName, setLocalName] = useInputDebouncer(
      tag.name,
      (value) => updateBlandTag(cardId, listName, tag.id, value)
   );



   return (
      <div
         // `min-w-0` keeps a long tag name from forcing the row wider than its
         // parent card. Flex children otherwise default to `min-width: auto`
         // which lets unbroken text grow the row past the card edge.
         className="flex items-center gap-2 text-sm p-1 w-full min-w-0"
         // Faint wash of the card's ink so the zebra adapts per card-type + light/dark.
         style={{ backgroundColor: `color-mix(in srgb, var(--card-paper-fg) ${isEvenRow ? 6 : 3}%, transparent)` }}
      >
         {isEditing ? (
            <>
               <Input
                  value={localName}
                  onChange={(e) => setLocalName(e.target.value)}
                  className="h-7 flex-1 min-w-0 bg-transparent text-center border-none shadow-none"
                  placeholder={t(`${listName}.placeholder`)}
               />
               <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-destructive touch-target"
                  onClick={() => removeBlandTag(cardId, listName, tag.id)}
               >
                  <Trash2 className="h-4 w-4" />
               </Button>
            </>
         ) : (
            // `block` so it can size and wrap; `min-w-0 break-words` plus
            // `[overflow-wrap:anywhere]` makes even a single unbroken string
            // wrap inside the row rather than pushing past the card edge.
            <span className="block w-full min-w-0 text-center break-words [overflow-wrap:anywhere]">
               {tag.name ? tag.name : `[${t(`${listName}.noName`)}]`}
            </span>
         )}
      </div>
   );
}
