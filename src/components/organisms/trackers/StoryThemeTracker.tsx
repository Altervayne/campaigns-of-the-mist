// -- React Imports --
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { motion } from 'framer-motion';
import type { DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';

// -- Basic UI Imports --
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// -- Icon Imports --
import { Circle, Disc2, Flame, PlusCircle } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Component Imports --
import { ToolbarHandle } from '@/components/molecules/ToolbarHandle';
import { TagItem } from '@/components/molecules/TagItem';

// -- Store and Hook Imports --
import { useCharacterActions, useCharacterStore } from '@/lib/stores/characterStore';
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';
import { useToolbarHover } from '@/hooks/useToolbarHover';
import { useManualScroll } from '@/hooks/useManualScroll';
import { useInputDebouncer } from '@/hooks/useInputDebouncer';

// -- Type Imports --
import type { StoryThemeTracker } from '@/lib/types/character';



interface StoryThemeTrackerCardProps {
   tracker: StoryThemeTracker;
   isEditing?: boolean;
   isDrawerPreview?: boolean;
   /** Live, interactive board embed: no sheet chrome (the board toolbar carries the actions). */
   isBoardEmbed?: boolean;
   dragAttributes?: DraggableAttributes;
   dragListeners?: SyntheticListenerMap;
   onExport?: () => void;
}



export function StoryThemeTrackerCard({ tracker, isEditing = false, isDrawerPreview = false, isBoardEmbed = false, dragAttributes, dragListeners, onExport }: StoryThemeTrackerCardProps) {
   const { t: tThemeCard } = useTranslation();
   const actions = useCharacterActions();
   const { isHovered, hoverHandlers } = useToolbarHover(isDrawerPreview);
   const scrollRef = useRef<HTMLDivElement>(null);
   useManualScroll(scrollRef);

   const isTrackersAlwaysEditable = useAppSettingsStore((s) => s.isTrackersAlwaysEditable);
   const isEffectivelyEditing = isEditing || isTrackersAlwaysEditable;

   // Theme from the CONTEXT character's game (a tracker carries none): a sheet keeps its game vibe.
   // A drawer preview is inherently context-less (it renders inside whatever character is active), so
   // it forces the app tokens - matching the board embed, which is wrapped in a NEUTRAL synthetic store.
   const contextGame = useCharacterStore((state) => state.character?.game);
   const cardTheme = isDrawerPreview ? '' : (
      contextGame === 'CITY_OF_MIST'
         ? 'card-type-storytheme-com'
         : contextGame === 'OTHERSCAPE'
            ? 'card-type-storytheme-otherscape'
            : contextGame === 'LEGENDS'
               ? 'card-type-storytheme-legends'
               : '');



   // ################################################
   // ###   STORY THEME MAIN TAG INPUT DEBOUNCER   ###
   // ################################################

   const [localMainTagName, setLocalMainTagName] = useInputDebouncer(
      tracker.mainTag.name,
      (value) => {
         actions.updateTagInStoryTheme(tracker.id, 'mainTag', tracker.mainTag.id, { name: value });
         actions.updateStoryTheme(tracker.id, { name: value });
      }
   );



   return (
      <motion.div
         {...hoverHandlers}
         className="relative"
      >
         { !isDrawerPreview && !isBoardEmbed &&
            <ToolbarHandle
               isEditing={isEffectivelyEditing}
               isHovered={isHovered}
               dragAttributes={dragAttributes}
               dragListeners={dragListeners}
               onDelete={() => actions.removeStoryTheme(tracker.id)}
               onDowngradeStoryTheme={() => actions.downgradeStoryThemeToTag(tracker.id)}
               onExport={onExport}
               cardTheme={cardTheme}
               side="top"
            />
         }

         <div className={cn(
            isHovered ? "z-1" : "z-0",
            "relative z-0 flex flex-col h-55 w-62.5 border-2 rounded-lg overflow-hidden",
            cardTheme,
            "border-card-border bg-card-paper-bg text-card-paper-fg",
            {"h-30 shadow-none pointer-events-none border-2 border-card-border": isDrawerPreview}
         )}>

            <div className="grow flex flex-col min-h-0">
               {/* Main Tag Section */}
               <div className="w-full text-center p-1 shrink-0 flex items-center justify-between gap-2 border-b-2 border-card-accent/30 bg-card-header-bg text-card-header-fg">
                  {isEffectivelyEditing ? (
                     <Input
                        className="text-lg font-bold text-center grow border-0 shadow-none bg-card-paper-bg text-card-paper-fg"
                        placeholder={tThemeCard('ThemeCard.placeholderName')}
                        value={localMainTagName}
                        onChange={(e) => setLocalMainTagName(e.target.value)}
                     />
                  ) : (
                     <>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => actions.updateTagInStoryTheme(tracker.id, 'mainTag', tracker.mainTag.id, { isActive: !tracker.mainTag.isActive })}>
                           {tracker.mainTag.isActive ? <Disc2 className="h-5 w-5 text-primary" /> : <Circle className="h-4 w-4" />}
                        </Button>
                        <h3 className={cn("text-lg font-bold", tracker.mainTag.isScratched ? 'line-through opacity-50' : tracker.mainTag.isActive && 'underline')}>
                           {tracker.mainTag.name || `[${tThemeCard('ThemeCard.noName')}]`}
                        </h3>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => actions.updateTagInStoryTheme(tracker.id, 'mainTag', tracker.mainTag.id, { isScratched: !tracker.mainTag.isScratched })}>
                           <Flame className={cn('h-4 w-4', tracker.mainTag.isScratched && 'text-destructive fill-destructive')} />
                        </Button>
                     </>
                  )}
               </div>

               {/* Sub-tags */}
               <div
                  ref={scrollRef}
                  className={cn(
                     "grow",
                     isDrawerPreview ? "overflow-y-hidden" : "overflow-y-scroll overscroll-contain"
                  )}
               >
                  {/* Power Tags */}
                  {tracker.powerTags.map((tag, index) => <TagItem key={tag.id} trackerId={tracker.id} tag={tag} tagType="power" isEditing={isEffectivelyEditing} index={index} isTrackerTag />)}
                  {isEffectivelyEditing && <div className="p-2"><Button variant="ghost" size="sm" className="w-full p-2 border border-dashed" onClick={() => actions.addTagToStoryTheme(tracker.id, 'powerTags')}><PlusCircle className="h-4 w-4 mr-2"/>{tThemeCard('ThemeCard.addPowerTag')}</Button></div>}

                  {/* Weakness Tags */}
                  {tracker.weaknessTags.map((tag, index) => <TagItem key={tag.id} trackerId={tracker.id} tag={tag} tagType="weakness" isEditing={isEffectivelyEditing} index={index} isTrackerTag />)}
                  {isEffectivelyEditing && <div className="p-2"><Button variant="ghost" size="sm" className="w-full border border-dashed" onClick={() => actions.addTagToStoryTheme(tracker.id, 'weaknessTags')}><PlusCircle className="h-4 w-4 mr-2"/>{tThemeCard('ThemeCard.addWeaknessTag')}</Button></div>}
               </div>
            </div>
         </div>
      </motion.div>
   );
}