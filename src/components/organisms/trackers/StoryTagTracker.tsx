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
import { Trash2, Flame } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Component Imports --
import { ToolbarHandle } from '@/components/molecules/ToolbarHandle';

// -- Store and Hook Imports --
import { useCharacterActions, useCharacterStore } from '@/lib/stores/characterStore';

// -- Other Imports --
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';
import { useToolbarHover } from '@/hooks/useToolbarHover';
import { useInputDebouncer } from '@/hooks/useInputDebouncer';

// -- Type Imports --
import type { StoryTagTracker } from '@/lib/types/character';



interface StoryTagTrackerCardProps {
   tracker: StoryTagTracker;
   isEditing?: boolean;
   isDrawerPreview?: boolean;
   /** Live, interactive board embed: no sheet chrome (the board toolbar carries the actions). */
   isBoardEmbed?: boolean;
   dragAttributes?: DraggableAttributes;
   dragListeners?: SyntheticListenerMap;
   onExport?: () => void;
}



export function StoryTagTrackerCard({ tracker, isEditing=false, isDrawerPreview, isBoardEmbed=false, dragAttributes, dragListeners, onExport }: StoryTagTrackerCardProps) {
   const { t: t } = useTranslation();
   const { updateStoryTag, removeStoryTag, upgradeStoryTagToTheme } = useCharacterActions();
   const { isHovered, hoverHandlers } = useToolbarHover(isDrawerPreview);

   const isTrackersAlwaysEditable = useAppSettingsStore((s) => s.isTrackersAlwaysEditable);
   const isEffectivelyEditing = isEditing || isTrackersAlwaysEditable;

   // Theme from the CONTEXT character's game (a tracker carries none): a sheet keeps its game vibe.
   // A drawer preview is inherently context-less (it renders inside whatever character is active), so
   // it forces the app tokens - matching the board embed, which is wrapped in a NEUTRAL synthetic store.
   const contextGame = useCharacterStore((state) => state.character?.game);
   const cardTheme = isDrawerPreview ? '' : (
      contextGame === 'CITY_OF_MIST'
         ? 'card-type-storytag-com'
         : contextGame === 'OTHERSCAPE'
            ? 'card-type-storytag-otherscape'
            : contextGame === 'LEGENDS'
               ? 'card-type-storytag-legends'
               : '');



   // ##########################################
   // ###   STORY TAG NAME INPUT DEBOUNCER   ###
   // ##########################################

   const [localName, setLocalName] = useInputDebouncer(
      tracker.name,
      (value) => updateStoryTag(tracker.id, { name: value })
   );



   return (
      <motion.div
         {...hoverHandlers}
         className="relative"
      >
         {!isDrawerPreview && !isBoardEmbed && (
            <ToolbarHandle
               isEditing={isEffectivelyEditing}
               isHovered={isHovered}
               dragAttributes={dragAttributes}
               dragListeners={dragListeners}
               onExport={onExport}
               onStoryTagNegative={() => updateStoryTag(tracker.id, { isWeakness: !tracker.isWeakness })}
               isStoryTagNegative={tracker.isWeakness}
               onUpgradeStoryTag={() => upgradeStoryTagToTheme(tracker.id)}
               cardTheme={cardTheme}
               side="top"
            />
         )}

         <div className={cn(
            isHovered ? "z-1" : "z-0",
            "relative flex items-center justify-between h-13.75 w-55 p-2 rounded-lg border-2",
            {"pointer-events-none shadow-none border-2 border-border": isDrawerPreview},
            cardTheme, "border-card-border",
            tracker.isWeakness 
               ? "bg-card-destructive-bg text-card-destructive-fg" 
               : "bg-card-paper-bg text-card-paper-fg"
         )}>
            {isEffectivelyEditing ? (
               <>
                  <div className="grow p-1">
                     <Input
                        value={localName}
                        onChange={(e) => setLocalName(e.target.value)}
                        className="h-8 text-card-paper-fg font-semibold border-dashed bg-transparent placeholder-card-paper-fg"
                        placeholder={t('Trackers.storyTagPlaceholder')}
                     />
                  </div>
                  {/* Delete is sheet-only chrome: on a board embed it's the board item toolbar's job, and it
                      must never run the character-store remove on a preview's synthetic store. */}
                  {!isBoardEmbed && !isDrawerPreview && (
                     <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive cursor-pointer"
                        onClick={() => removeStoryTag(tracker.id)}
                     >
                        <Trash2 className="h-5 w-5" />
                     </Button>
                  )}
               </>
            ) : (
               <>
                  <div className="grow p-1">
                     <span className={cn("text-card-paper-fg font-semibold", tracker.isScratched && 'line-through opacity-50')}>
                        {tracker.name ? tracker.name : `[${t('Trackers.storyTagNoName')}]`}
                     </span>
                  </div>
                  <Button 
                     variant="ghost" 
                     size="icon" 
                     className="h-8 w-8 cursor-pointer"
                     onClick={() => updateStoryTag(tracker.id, { isScratched: !tracker.isScratched })}
                  >
                     <Flame className={cn('h-5 w-5', tracker.isScratched && 'text-destructive fill-destructive')} />
                  </Button>
               </>
            )}
         </div>

      </motion.div>
   );
}
