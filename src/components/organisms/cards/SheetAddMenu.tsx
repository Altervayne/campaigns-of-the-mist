// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { Plus } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { getItemTypeIconComponent } from '@/lib/utils/drawer-icons';
import { hasChallengeVariant } from '@/lib/utils/character';

// -- Constant Imports --
import { getGameVisual } from '@/lib/constants/gameVisuals';

// -- Component Imports --
import {
   DropdownMenu,
   DropdownMenuTrigger,
   DropdownMenuContent,
   DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

// -- Type Imports --
import type { LucideIcon } from 'lucide-react';
import type { GameSystem } from '@/lib/types/common';

/*
 * The character sheet's one "Add..." affordance: a single dashed card-shaped ghost (where three separate
 * add-tiles used to crowd the cards row) that anchors a small tokened dropdown of the addable sheet
 * elements - Card, Portrait, Challenge, Journal. Each row owns its own follow-through (the sheet's create
 * paths are heterogeneous: card opens a dialog, portrait is a singleton, challenge creates-then-opens its
 * editor, journal appends a notebook), so a row is a descriptor + its handler, not a shared factory. Icons
 * come from the shared drawer-icon / game-visual source so they can't drift from the board + drawer.
 */

interface SheetAddRow {
   id: string;
   icon: LucideIcon;
   labelKey: string;
   onSelect: () => void;
   /** A row hidden this render (the Portrait singleton, once one exists). */
   hidden?: boolean;
}

interface SheetAddMenuProps {
   game: GameSystem;
   /** The sheet already has a portrait: hide the Portrait row (it's a singleton). */
   hasPortrait: boolean;
   onAddCard: () => void;
   onAddPortrait: () => void;
   onAddChallenge: () => void;
   onAddJournal: () => void;
}

export function SheetAddMenu({ game, hasPortrait, onAddCard, onAddPortrait, onAddChallenge, onAddJournal }: SheetAddMenuProps) {
   const { t } = useTranslation();

   // Card wears its game's glyph (as the board radial does); the others reuse the drawer icon source.
   const rows: SheetAddRow[] = [
      { id: 'card', icon: getGameVisual(game).Icon, labelKey: 'WorkspacePage.addCard', onSelect: onAddCard },
      { id: 'portrait', icon: getItemTypeIconComponent('IMAGE_CARD'), labelKey: 'WorkspacePage.addPortrait', onSelect: onAddPortrait, hidden: hasPortrait },
      { id: 'challenge', icon: getItemTypeIconComponent('CHALLENGE_CARD'), labelKey: 'WorkspacePage.addChallenge', onSelect: onAddChallenge, hidden: !hasChallengeVariant(game) },
      { id: 'journal', icon: getItemTypeIconComponent('JOURNAL'), labelKey: 'WorkspacePage.addJournal', onSelect: onAddJournal },
   ];

   return (
      <DropdownMenu>
         <DropdownMenuTrigger asChild>
            <div
               data-tutorial="add-card-button"
               className={cn(
                  "cursor-pointer flex flex-col gap-4 items-center justify-center min-w-62.5 w-62.5 max-h-150 h-150 p-4",
                  "rounded-lg border-2 border-dashed border-border text-muted-foreground text-center bg-muted/50",
                  "hover:text-foreground hover:border-foreground transition-all duration-150"
               )}
            >
               <Plus className="w-10 h-10" />
               <span className="text-3xl font-semibold">{t('WorkspacePage.addElement')}</span>
            </div>
         </DropdownMenuTrigger>
         <DropdownMenuContent side="right" align="start">
            {rows.filter((row) => !row.hidden).map((row) => (
               <DropdownMenuItem key={row.id} onSelect={row.onSelect}>
                  <row.icon />
                  <span>{t(row.labelKey)}</span>
               </DropdownMenuItem>
            ))}
         </DropdownMenuContent>
      </DropdownMenu>
   );
}
