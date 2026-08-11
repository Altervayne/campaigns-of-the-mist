// -- React Imports --
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Basic UI Imports --
import { Label } from '@/components/ui/label';

// -- Component Imports --
import { CardPaletteManager } from './CardPaletteManager';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Type Imports --
import type { CardPaletteGame } from '@/lib/theme/cardPalettes';

/** The games that own card palettes, in selector order. */
const GAME_OPTIONS: CardPaletteGame[] = ['LEGENDS', 'CITY_OF_MIST', 'OTHERSCAPE'];

/**
 * The Card Palettes section: a game selector at the top (a 3-way segmented track keyed on the chosen game),
 * then that game's palette manager - the list where a palette is selected, duplicated, renamed, deleted, and
 * reordered. Editing a palette's colors lands with the editor; nothing here needs a draft guard.
 */
export function CardPalettesSettingsPane() {
   const { t } = useTranslation();
   const [game, setGame] = useState<CardPaletteGame>('LEGENDS');

   return (
      <div className="grid gap-6">
         {/* Game: keyed on the chosen game, so its palettes show below. The label sits ABOVE a full-width track
             (not beside it) because the game names are long; a beside-label track cramps them into overflow. */}
         <div data-tutorial="card-palettes-game" className="flex flex-col gap-2">
            <Label className="text-left">{t('SettingsDialog.cardPalettes.game')}</Label>
            <div className="inline-flex w-full rounded-md border border-border bg-muted p-0.5">
               {GAME_OPTIONS.map((option) => {
                  const isActive = game === option;
                  return (
                     <button
                        key={option}
                        type="button"
                        onClick={() => setGame(option)}
                        // `min-w-0` lets the equal-width segments shrink so a long name truncates instead of
                        // overflowing the track.
                        className={cn(
                           'flex min-w-0 flex-1 cursor-pointer items-center justify-center rounded-sm px-3 py-1.5 text-sm transition-colors',
                           isActive ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                        )}
                     >
                        <span className="truncate">{t(`SettingsDialog.cardPalettes.games.${option}`)}</span>
                     </button>
                  );
               })}
            </div>
         </div>

         <CardPaletteManager game={game} />
      </div>
   );
}
