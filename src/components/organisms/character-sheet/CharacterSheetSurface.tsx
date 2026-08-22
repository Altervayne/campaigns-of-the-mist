// -- React Imports --
import type { RefObject } from 'react';

// -- Component Imports --
import { CharacterNameHeader } from '@/components/molecules/CharacterNameHeader';
import { SheetMainDropZone } from '@/components/organisms/SheetMainDropZone';
import { TrackersSection } from '@/components/organisms/TrackersSection';
import { CardsSection } from '@/components/organisms/CardsSection';
import { SheetToolbarRevealProvider } from '@/components/providers/SheetToolbarRevealProvider';

// -- Type Imports --
import type { Card as CardData, Character, Tracker } from '@/lib/types/character';
import type { Journal } from '@/lib/types/board';


interface CharacterSheetSurfaceProps {
   /** Created by the page, where the zoom hook binds its wheel listener against this element. */
   scrollRef: RefObject<HTMLElement | null>;
   character: Character;
   namePlaceholder: string;
   /** The active character's own name writer, resolved at render time, never at flush time. */
   onCommitName: (value: string) => void;
   sheetZoom: number;
   isEditing: boolean;
   areTrackersEditable: boolean;
   onExportComponent: (item: CardData | Tracker | Journal) => void;
   onAddStatus: () => void;
   onAddStoryTag: () => void;
   statusIds: string[];
   storyTagIds: string[];
   storyThemeIds: string[];
   onEditCard: (card: CardData) => void;
   onAddCard: () => void;
   onAddPortrait: () => void;
   onAddChallenge: () => void;
   onAddJournal: () => void;
   /** Which section a compatible drawer drag would land in. */
   sheetHighlight: 'cards' | 'trackers' | null;
}

/**
 * The character tab's work surface: the scrolling `<main>` itself, the name header, and the zoomed
 * trackers + cards regions. It renders the scroll container so the element the page's ref, the
 * tutorial anchor and the wheel gesture all point at is one and the same. Presentational: every
 * value arrives as a prop.
 */
export function CharacterSheetSurface({ scrollRef, character, namePlaceholder, onCommitName, sheetZoom, isEditing, areTrackersEditable, onExportComponent, onAddStatus, onAddStoryTag, statusIds, storyTagIds, storyThemeIds, onEditCard, onAddCard, onAddPortrait, onAddChallenge, onAddJournal, sheetHighlight }: CharacterSheetSurfaceProps) {
   return (
      <main ref={scrollRef} data-tutorial="character-sheet" className="absolute w-full h-full flex-1 flex flex-col overflow-y-auto overflow-x-hidden">
         <CharacterNameHeader
            key={character.id}
            name={character.name}
            onCommit={onCommitName}
            placeholder={namePlaceholder}
         />

         {/* Zoom layer: CSS `zoom` scales the trackers + cards AND grows the scroll box with
             them (a transform would clip the bottom). The name header above stays unscaled. */}
         <div className="flex-1 p-4 md:p-8" style={sheetZoom === 1 ? undefined : { zoom: sheetZoom }}>
            <SheetMainDropZone>
               <SheetToolbarRevealProvider>
                  <TrackersSection
                     character={character}
                     isEditing={isEditing}
                     areTrackersEditable={areTrackersEditable}
                     onExport={onExportComponent}
                     onAddStatus={onAddStatus}
                     onAddStoryTag={onAddStoryTag}
                     statusIds={statusIds}
                     storyTagIds={storyTagIds}
                     storyThemeIds={storyThemeIds}
                     isDropTarget={sheetHighlight === 'trackers'}
                     scale={sheetZoom}
                  />

                  <CardsSection
                     character={character}
                     isEditing={isEditing}
                     onExport={onExportComponent}
                     onEditCard={onEditCard}
                     onAddCard={onAddCard}
                     onAddPortrait={onAddPortrait}
                     onAddChallenge={onAddChallenge}
                     onAddJournal={onAddJournal}
                     isDropTarget={sheetHighlight === 'cards'}
                     scale={sheetZoom}
                  />
               </SheetToolbarRevealProvider>
            </SheetMainDropZone>
         </div>

         {/* Scroll runway below the content so the last cards can clear the floating zoom control
             (bottom-right). Outside the zoom layer, so it keeps its size at any sheet zoom. */}
         <div aria-hidden className="h-20 shrink-0" />
      </main>
   );
}
