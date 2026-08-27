// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Component Imports --
import { CharacterOverviewPanel } from '@/components/organisms/character-sheet/CharacterOverviewPanel';
import { PREVIEW_PAGE } from '@/components/molecules/drawer/drawerPreviewStage';

// -- Board Imports --
import { overviewPanelCardClass } from '@/lib/board/characterOverview';

// -- Type Imports --
import type { Character } from '@/lib/types/character';
import type { DrawerItem } from '@/lib/types/drawer';

/*
 * The drawer's rich preview for a saved character: the shared read-only overview panel (portrait + name +
 * game header, a condensed row per theme card, a tracker footer) authored at the large page-width size so
 * `cover` down-scales it into a dense character thumbnail. Read-only - no `onOpen`, so no open button and
 * no handlers. The wrapper wears the game paper palette (`--card-*`), so the empty page below the packed
 * panel matches the panel's paper: cover-fill then shows the header + theme rows at the top fading down a
 * seamless page, filling the 4:3 stage instead of a marooned strip. The panel drops its own border here -
 * the stage clip and this wrapper are the frame. Game CONTENT, so it wears the game card-theme palette.
 */

interface CharacterSheetPreviewProps {
   item: DrawerItem;
}

export const CharacterSheetPreview = ({ item }: CharacterSheetPreviewProps) => {
   const character = item.content as Character;

   if (!character) {
      return null;
   }

   return (
      <div className={cn(overviewPanelCardClass(character.game), 'bg-card-paper-bg', PREVIEW_PAGE)}>
         <CharacterOverviewPanel character={character} className="w-full border-0" />
      </div>
   );
};
