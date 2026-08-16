// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';

// -- Basic UI Imports --
import { Button } from '@/components/ui/button';

// -- Icon Imports --
import { PlusCircle } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { DRAG_TYPES } from '@/lib/constants/dragDrop';

// -- DnD Component Imports --
import { Sortable, DragLayoutWrapper } from '@/components/dnd';

// -- Component Imports --
import { StatusTrackerCard } from '@/components/organisms/trackers/StatusTracker';
import { StoryTagTrackerCard } from '@/components/organisms/trackers/StoryTagTracker';
import { StoryThemeTrackerCard } from '@/components/organisms/trackers/StoryThemeTracker';

// -- Type Imports --
import type { Character, Tracker } from '@/lib/types/character';



interface TrackersSectionProps {
   character: Character;
   isEditing: boolean;
   areTrackersEditable: boolean;
   onExport: (item: Tracker) => void;
   onAddStatus: () => void;
   onAddStoryTag: () => void;
   statusIds: string[];
   storyTagIds: string[];
   storyThemeIds: string[];
   /** Highlight the section as the landing spot for a compatible tracker-type drawer drag. */
   isDropTarget?: boolean;
   /** Sheet zoom factor, forwarded to each Sortable so the reorder gap lands accurately when zoomed. */
   scale?: number;
}

/**
 * The character sheet's trackers region: statuses, story tags, and story themes,
 * each in its own SortableContext. Reorder is a live shuffle (`rectSortingStrategy`):
 * siblings animate aside to open a real gap where the dragged tracker will land.
 * Presentational apart from registering its own `tracker-drop-zone` droppable (which
 * must happen inside the DndContext subtree); the memoized id arrays and all handlers
 * arrive from the page.
 */
export function TrackersSection({
   character,
   isEditing,
   areTrackersEditable,
   onExport,
   onAddStatus,
   onAddStoryTag,
   statusIds,
   storyTagIds,
   storyThemeIds,
   isDropTarget = false,
   scale = 1,
}: TrackersSectionProps) {
   const { t: tTrackers } = useTranslation();

   // Still a droppable (the drop is accepted here / routed by type), but the
   // highlight is driven by `isDropTarget` so only the type-matching section lights up.
   const { setNodeRef: trackersDropRef } = useDroppable({
      id: 'tracker-drop-zone',
      data: { type: 'tracker-drop-zone' }
   });

   return (
      <div
         data-tutorial="trackers-section"
         ref={trackersDropRef}
         className={cn(
            "flex gap-4",
            "w-full bg-muted/75 rounded-lg p-4 border-2 border-border transition-colors",
            { "border-primary shadow-lg": isDropTarget }
         )}
      >
         <div className="flex-1 min-w-0 space-y-4">
            {/* Statuses Group */}
            <SortableContext items={statusIds} strategy={rectSortingStrategy}>
               <div className="flex flex-wrap gap-4">
                  {character.trackers.statuses.map(tracker => (
                     <Sortable
                        key={tracker.id}
                        id={tracker.id}
                        data={{ type: DRAG_TYPES.SHEET_TRACKER, item: tracker }}
                        scale={scale}
                     >
                        {({ dragAttributes, dragListeners, isBeingDragged }) => (
                           <DragLayoutWrapper isBeingDragged={isBeingDragged} disableLayout={scale !== 1}>
                              <StatusTrackerCard
                                 tracker={tracker}
                                 isEditing={isEditing}
                                 dragAttributes={dragAttributes}
                                 dragListeners={dragListeners}
                                 onExport={() => onExport(tracker)}
                              />
                           </DragLayoutWrapper>
                        )}
                     </Sortable>
                  ))}
                  {areTrackersEditable && (
                     <Button
                        data-tutorial="add-status-button"
                        variant="ghost"
                        onClick={() => onAddStatus()}
                        className={cn("cursor-pointer flex items-center justify-center w-55 h-25",
                                       "rounded-lg border-2 border-dashed text-bg border-primary/25 text-muted-foreground bg-primary/5",
                                       "hover:text-foreground hover:border-foreground"
                        )}
                     >
                        <PlusCircle className="mr-2 h-4 w-4" />
                        {tTrackers('Common.addStatus')}
                     </Button>
                  )}
               </div>
            </SortableContext>

            {/* Story Tags Group */}
            <SortableContext items={storyTagIds} strategy={rectSortingStrategy}>
               <div className="flex flex-wrap gap-4">
                  {character.trackers.storyTags.map(tracker => (
                     <Sortable
                        key={tracker.id}
                        id={tracker.id}
                        data={{ type: DRAG_TYPES.SHEET_TRACKER, item: tracker }}
                        scale={scale}
                     >
                        {({ dragAttributes, dragListeners, isBeingDragged }) => (
                           <DragLayoutWrapper isBeingDragged={isBeingDragged} disableLayout={scale !== 1}>
                              <StoryTagTrackerCard
                                 tracker={tracker}
                                 isEditing={isEditing}
                                 dragAttributes={dragAttributes}
                                 dragListeners={dragListeners}
                                 onExport={() => onExport(tracker)}
                              />
                           </DragLayoutWrapper>
                        )}
                     </Sortable>
                  ))}
                  {areTrackersEditable && (
                     <Button
                        data-tutorial="add-story-tag-button"
                        variant="ghost"
                        onClick={() => onAddStoryTag()}
                        title={tTrackers('Trackers.addStoryTag')}
                        className={cn("cursor-pointer flex items-center justify-center w-55 min-h-13.75 py-2",
                                       "rounded-lg border-2 border-dashed border-bg text-bg border-primary/25 text-muted-foreground bg-primary/5",
                                       "hover:text-foreground hover:border-foreground"
                        )}
                     >
                        <PlusCircle className="mr-2 h-4 w-4 shrink-0" />
                        <span className="text-center whitespace-normal">{tTrackers('Trackers.addStoryTag')}</span>
                     </Button>
                  )}
               </div>
            </SortableContext>
         </div>

         <div
            className="shrink-0 max-w-[45%]"
            style={{
               width: character.trackers.storyThemes.length >= 2
                  ? '520px'
                  : 'auto'
            }}
         >
            {/* Story Themes Group */}
            <SortableContext items={storyThemeIds} strategy={rectSortingStrategy}>
               <div className="flex flex-wrap justify-end gap-4">
                  {character.trackers.storyThemes.map(tracker => (
                     <Sortable
                        key={tracker.id}
                        id={tracker.id}
                        data={{ type: DRAG_TYPES.SHEET_TRACKER, item: tracker }}
                        scale={scale}
                     >
                        {({ dragAttributes, dragListeners, isBeingDragged }) => (
                           <DragLayoutWrapper isBeingDragged={isBeingDragged} disableLayout={scale !== 1}>
                              <StoryThemeTrackerCard
                                 tracker={tracker}
                                 isEditing={isEditing}
                                 dragAttributes={dragAttributes}
                                 dragListeners={dragListeners}
                                 onExport={() => onExport(tracker)}
                              />
                           </DragLayoutWrapper>
                        )}
                     </Sortable>
                  ))}
               </div>
            </SortableContext>
         </div>
      </div>
   );
}
