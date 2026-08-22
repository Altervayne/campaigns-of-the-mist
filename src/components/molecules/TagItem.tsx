// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Basic UI Imports --
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

// -- Icon Imports --
import { Circle, Disc2, Flame, Trash2 } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Store and Hook Imports --
import { useCharacterActions } from '@/lib/stores/characterStore';
import { useInputDebouncer } from '@/hooks/useInputDebouncer';

// -- Type Imports --
import type { Tag } from '@/lib/types/character';



interface TagItemProps {
   tag: Tag;
   tagType: 'power' | 'weakness';
   isEditing: boolean;
   index: number;
   cardId?: string;
   trackerId?: string;
   isTrackerTag?: boolean;
   isLoadoutGear?: boolean;
   /**
    * Optional override for the tag-list key this item targets in the store.
    * Defaults to the list derived from `tagType` (powerTags / weaknessTags), and
    * is used by the character-card tag lists (Hero backpack, Otherscape specials,
    * Rift nemeses) that were upgraded from BlandTag to Tag in 1.3.0 - those need
    * "power" styling and the activation / burn controls but write to a different
    * list on the card details. Ignored when `isTrackerTag` is true (the tracker
    * code paths only use powerTags / weaknessTags).
    */
   listName?: 'powerTags' | 'weaknessTags' | 'backpack' | 'specials' | 'nemeses';
   /** Optional placeholder override for the editing input (defaults to TagItem.placeholder). */
   placeholderKey?: string;
   /** Optional "no name" fallback override (defaults to TagItem.noName). */
   noNameKey?: string;
   /**
    * Dark-paper card (e.g. the Otherscape theme cards). Desaturating the weakness text isn't enough there:
    * the card's ink is light AND cool, so once neutralized it can still sit dim on the destructive wash.
    * When set, lift the weakness text's luminance too so it reads clearly. Light-paper cards don't need it.
    */
   isDark?: boolean;
}



export function TagItem({ tag, tagType, isEditing, index, cardId, trackerId, isTrackerTag, isLoadoutGear, listName: listNameOverride, placeholderKey, noNameKey, isDark }: TagItemProps) {
   const { t: t } = useTranslation();
   const actions = useCharacterActions();
   const listName = listNameOverride ?? (tagType === 'power' ? 'powerTags' : 'weaknessTags');

   const isEvenRow = index % 2 === 0;
   // Stripe each row with a faint wash of the card's own ink - the card's red for negative rows, otherwise
   // its text color - so the zebra follows the card-type and light/dark instead of a fixed black that
   // disappears on dark paper. Both vars fall back to the chrome tokens off a card, so it works anywhere.
   const rowBackground = tagType === 'weakness'
      ? `color-mix(in srgb, var(--card-destructive-bg, transparent) ${isEvenRow ? 25 : 15}%, transparent)`
      : `color-mix(in srgb, var(--card-paper-fg) ${isEvenRow ? 8 : 2}%, transparent)`;

   // Strip the card's text tint on weakness rows so the foreground reads as a neutral gray at its own
   // lightness, instead of a cool tint (e.g. Otherscape's purple/pink) clashing with the destructive wash.
   // On dark-paper cards, also lift its luminance so the neutralized text doesn't sit dim on the wash.
   const weaknessForeground = tagType === 'weakness' && (isDark ? 'grayscale brightness-150' : 'grayscale');



   // ####################################
   // ###   TAG NAME INPUT DEBOUNCER   ###
   // ####################################

   // Story-theme trackers only carry power / weakness tags - the character-card
   // override list names (backpack / specials / nemeses) are not valid there.
   const isTrackerListName = listName === 'powerTags' || listName === 'weaknessTags';

   const [localName, setLocalName] = useInputDebouncer(
      tag.name,
      (value) => {
         if (isTrackerTag && trackerId && isTrackerListName) {
            actions.updateTagInStoryTheme(trackerId, listName, tag.id, { name: value });
         } else if (cardId) {
            actions.updateTag(cardId, listName, tag.id, { name: value });
         }
      }
   );



   const handleUpdate = (updates: Partial<Tag>) => {
      if (isTrackerTag && trackerId && isTrackerListName) {
         actions.updateTagInStoryTheme(trackerId, listName, tag.id, updates);
      } else if (cardId) {
         actions.updateTag(cardId, listName, tag.id, updates);
      }
   };

   const handleRemove = () => {
      if (isTrackerTag && trackerId && isTrackerListName) {
         actions.removeTagFromStoryTheme(trackerId, listName, tag.id);
      } else if (cardId) {
         actions.removeTag(cardId, listName, tag.id);
      }
   };



   return (
      <div
         className={cn(
            // `min-w-0` lets this row shrink to its container instead of growing
            // to its content's intrinsic width (flex children default to
            // `min-width: auto`, which on a row that includes text would let an
            // unbroken word push the row wider than its parent card).
            'flex items-center justify-between px-1 py-0.5 w-full min-w-0',
            tag.isScratched && 'opacity-50'
         )}
         style={{ backgroundColor: rowBackground }}
      >
         <div className="flex shrink-0 items-center justify-center w-6">
            {tagType === 'power' && !isEditing && (
               <Button variant="ghost" size="icon" className="h-6 w-6 cursor-pointer touch-target" onClick={() => handleUpdate({ isActive: !tag.isActive })}>
                  {tag.isActive ? <Disc2 className="h-5 w-5 text-card-paper" /> : <Circle className="h-4 w-4" />}
               </Button>
            )}
         </div>

         {isEditing ? (
            // `min-w-0` on the input wrapper / input itself keeps a long pending
            // value from forcing the row wider than the card.
            <Input
               value={localName}
               onChange={(e) => setLocalName(e.target.value)}
               className={cn('mx-1 h-7 flex-1 min-w-0 text-center text-sm border-0 shadow-none', weaknessForeground)}
               placeholder={t(placeholderKey ?? 'TagItem.placeholder')}
            />
         ) : (
            // `flex-1 min-w-0` lets the text column shrink to the card width;
            // `break-words` (plus `overflow-wrap-anywhere`) wraps long content -
            // including a single unbroken string - rather than overflowing.
            <p
               className={cn(
                  'flex-1 min-w-0 text-sm text-center py-1 break-words [overflow-wrap:anywhere]',
                  weaknessForeground,
                  tag.isScratched && !isLoadoutGear ? 'line-through' : tag.isActive && 'underline'
               )}
            >
               {tag.name || `[${t(noNameKey ?? 'TagItem.noName')}]`}
            </p>
         )}

         <div className="flex shrink-0 items-center justify-center w-6">
            {isEditing ? (
               <Button variant="ghost" size="icon" className={cn('h-6 w-6 text-destructive cursor-pointer touch-target', weaknessForeground)} onClick={handleRemove}>
                  <Trash2 className="h-4 w-4" />
               </Button>
            ) : (
               tagType === 'power' && (
                  <Button variant="ghost" size="icon" className="h-6 w-6 cursor-pointer touch-target" onClick={() => handleUpdate({ isScratched: !tag.isScratched })}>
                     <Flame className={cn('h-4 w-4', tag.isScratched && 'text-destructive fill-destructive')} />
                  </Button>
               )
            )}
         </div>
      </div>
   );
}
