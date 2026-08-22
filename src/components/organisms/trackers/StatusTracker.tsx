// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { motion } from 'framer-motion';
import type { DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';

// -- Basic UI Imports --
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// -- Icon Imports --
import { Check, Trash2 } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Component Imports --
import { ToolbarHandle } from '@/components/molecules/ToolbarHandle';

// -- Store and Hook Imports --
import { useCharacterActions, useCharacterStore } from '@/lib/stores/characterStore';
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';
import { useToolbarReveal } from '@/hooks/toolbarReveal';
import { useInputDebouncer } from '@/hooks/useInputDebouncer';

// -- Type Imports --
import type { StatusTracker } from '@/lib/types/character';



interface StatusTrackerCardProps {
   tracker: StatusTracker;
   isEditing?: boolean;
   isDrawerPreview?: boolean;
   /** Live, interactive board embed: no sheet chrome (the board toolbar carries the actions). */
   isBoardEmbed?: boolean;
   dragAttributes?: DraggableAttributes;
   dragListeners?: SyntheticListenerMap;
   onExport?: () => void;
}



export function StatusTrackerCard({ tracker, isEditing=false, isDrawerPreview, isBoardEmbed=false, dragAttributes, dragListeners, onExport }: StatusTrackerCardProps) {
   const { t: t } = useTranslation();
   const { updateStatus, removeStatus } = useCharacterActions();
   const { isRevealed, revealHandlers } = useToolbarReveal(tracker.id, isDrawerPreview);

   const isTrackersAlwaysEditable = useAppSettingsStore((s) => s.isTrackersAlwaysEditable);
   const isEffectivelyEditing = isEditing || isTrackersAlwaysEditable;

   // Theme from the CONTEXT character's game (a tracker carries none): a sheet keeps its game vibe.
   // A drawer preview is inherently context-less (it renders inside whatever character is active), so
   // it forces the app tokens - matching the board embed, which is wrapped in a NEUTRAL synthetic store.
   const contextGame = useCharacterStore((state) => state.character?.game);
   const cardTheme = isDrawerPreview ? '' : (
      contextGame === 'CITY_OF_MIST'
         ? 'card-type-status-com'
         : contextGame === 'OTHERSCAPE'
            ? 'card-type-status-otherscape'
            : contextGame === 'LEGENDS'
               ? 'card-type-status-legends'
               : '');

   const handleTierClick = (tierIndex: number) => {
      if (isDrawerPreview) return;

      const newTiers = [...tracker.tiers];
      newTiers[tierIndex] = !newTiers[tierIndex];
      updateStatus(tracker.id, { tiers: newTiers });
   };



   // #######################################
   // ###   STATUS NAME INPUT DEBOUNCER   ###
   // #######################################

   const [localName, setLocalName] = useInputDebouncer(
      tracker.name,
      (value) => updateStatus(tracker.id, { name: value })
   );


   
   return (
      <motion.div
         {...revealHandlers}
         className="relative"
      >
         {!isDrawerPreview && !isBoardEmbed && (
            <ToolbarHandle
               isEditing={isEffectivelyEditing}
               isHovered={isRevealed}
               dragAttributes={dragAttributes}
               dragListeners={dragListeners}
               onExport={onExport}
               cardTheme={cardTheme}
               side="top"
            />
         )}

         <div className={cn(
            isRevealed ? "z-1" : "z-0",
            "relative z-0 flex flex-col h-25 w-55 border-2 rounded-lg overflow-hidden",
            {"pointer-events-none shadow-none border-2 border-border": isDrawerPreview},
            cardTheme,
            "border-card-border bg-card-paper-bg text-card-paper-fg",
         )}>
            {/* Header Section */}
            <div className={cn(
               "flex items-center border-b",
               "text-card-header-fg bg-card-header-bg"
            )}>
               <div className="grow p-1">
                  {isEffectivelyEditing ? (
                     <Input
                        value={localName}
                        onChange={(e) => setLocalName(e.target.value)}
                        className="h-8 font-semibold border-dashed border-card-accent bg-card-paper-bg text-card-paper-fg placeholder-card-paper-fg"
                        placeholder={t('Trackers.statusPlaceholder')}
                     />
                  ) : (
                     <p className="text-base font-semibold px-2">{tracker.name ? tracker.name : `[${t('Trackers.statusNoName')}]`}</p>
                  )}
               </div>
               {/* Delete is sheet-only chrome: on a board embed it's the board item toolbar's job, and it
                   must never run the character-store remove on a preview's synthetic store. */}
               {isEffectivelyEditing && !isBoardEmbed && !isDrawerPreview && (
                  <Button
                     variant="ghost"
                     size="icon"
                     className="h-8 w-8 mr-1 text-destructive bg-card-paper-bg shrink-0 cursor-pointer"
                     onClick={() => removeStatus(tracker.id)}
                  >
                     <Trash2 className="h-5 w-5" />
                  </Button>
               )}
            </div>

            {/* Tiers Section */}
            <div className="flex grow">
               {tracker.tiers.map((isActive, index) => (
                  <div
                     key={index}
                     className="flex-1 flex flex-col justify-between items-end p-1 cursor-pointer"
                     // Alternating wash of the card's ink so the zebra adapts per card-type + light/dark.
                     style={{ backgroundColor: `color-mix(in srgb, var(--card-paper-fg) ${index % 2 === 0 ? 10 : 2}%, transparent)` }}
                     onClick={() => handleTierClick(index)}
                  >
                     <Check className={cn("h-6 w-6 transition-opacity", isActive ? 'opacity-100 text-card-paper-fg' : 'opacity-0')} />
                     <span className="text-xl font-bold text-card-paper-fg">{index + 1}</span>
                  </div>
               ))}
            </div>
         </div>
      </motion.div>
   );
}
