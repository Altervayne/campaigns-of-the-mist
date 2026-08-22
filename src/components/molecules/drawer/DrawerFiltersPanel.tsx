// -- React Imports --
import type React from 'react';
import { useTranslation } from 'react-i18next';

// -- Basic UI Imports --
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { getItemTypeIcon } from '@/lib/utils/drawer-icons';
import { getGameVisual, GAME_CARD_OPTIONS } from '@/lib/constants/gameVisuals';

// -- Hook Imports --
import { useBreakpoint } from '@/hooks/useAdaptive';

// -- Store Imports --
import { useDrawerActions, useDrawerStore } from '@/lib/stores/drawerStore';

// -- Type Imports --
import type { GameSystem, GeneralItemType } from '@/lib/types/drawer';

/*
 * The drawer search Filters panel: type (multi), game (multi), and created/updated date ranges - all
 * feeding the same `DrawerItemQuery` via `updateSearchCriteria`. An empty multi-select means NO
 * constraint, so a fully-cleared panel returns to browse. Inline + scrollable for
 * the narrow drawer; "Clear all" resets everything.
 */

/** The item types offered as filters (FOLDER and the loadout/export-only types are not browseable filters). */
const FILTERABLE_ITEM_TYPES: GeneralItemType[] = [
   'FULL_CHARACTER_SHEET',
   'CHARACTER_CARD',
   'CHARACTER_THEME',
   'GROUP_THEME',
   'STATUS_TRACKER',
   'STORY_TAG_TRACKER',
   'STORY_THEME_TRACKER',
   'IMAGE_CARD',
   'FULL_BOARD',
   'ROLL_TABLE',
];

/** The games offered as filters: the three systems plus NEUTRAL (game-agnostic items). */
const FILTERABLE_GAMES: GameSystem[] = [...GAME_CARD_OPTIONS.map((option) => option.game), 'NEUTRAL'];

const pad = (n: number): string => String(n).padStart(2, '0');

/** An epoch-ms bound back to a `<input type="date">` value, or '' for an open/sentinel bound. */
function msToDateInput(ms?: number): string {
   if (ms === undefined || ms <= 0 || ms >= Number.MAX_SAFE_INTEGER) return '';
   const date = new Date(ms);
   return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local start-of-day for a `YYYY-MM-DD` value. */
function dayStartMs(value: string): number {
   const [y, m, d] = value.split('-').map(Number);
   return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

/** Local END-of-day for a `YYYY-MM-DD` value, so an inclusive `to` catches the whole final day. */
function dayEndMs(value: string): number {
   const [y, m, d] = value.split('-').map(Number);
   return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

/** Builds the inclusive range; an empty side is open-ended (0 / MAX), both empty omits the range. */
function buildRange(fromValue: string, toValue: string): [number, number] | undefined {
   if (!fromValue && !toValue) return undefined;
   return [fromValue ? dayStartMs(fromValue) : 0, toValue ? dayEndMs(toValue) : Number.MAX_SAFE_INTEGER];
}

/** The game's glyph element (resolved in this module helper, not in render); neutral has no game icon. */
function gameGlyph(game: GameSystem): React.ReactElement | null {
   if (game === 'NEUTRAL') return null;
   const Icon = getGameVisual(game).Icon;
   return <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

/** A labeled from/to date-range row, controlled from the stored range. */
function DateRangeRow({ label, range, onChange, isMobile = false }: { label: string; range?: [number, number]; onChange: (next?: [number, number]) => void; isMobile?: boolean }) {
   const { t } = useTranslation();
   const fromValue = msToDateInput(range?.[0]);
   const toValue = msToDateInput(range?.[1]);
   return (
      <div className="flex flex-col gap-1">
         <span className="text-xs font-medium text-muted-foreground">{label}</span>
         <div className="flex items-center gap-2">
            <Input type="date" value={fromValue} aria-label={`${label} ${t('Drawer.filters.from')}`} onChange={(event) => onChange(buildRange(event.target.value, toValue))} className={cn('h-8 flex-1 text-xs', isMobile && 'h-10 text-sm')} />
            <span className="text-xs text-muted-foreground">{t('Drawer.filters.to')}</span>
            <Input type="date" value={toValue} aria-label={`${label} ${t('Drawer.filters.to')}`} onChange={(event) => onChange(buildRange(fromValue, event.target.value))} className={cn('h-8 flex-1 text-xs', isMobile && 'h-10 text-sm')} />
         </div>
      </div>
   );
}

/**
 * @param wide - The roomy Library layout: the checkbox lists become multi-column grids and the two date
 *   ranges sit side by side, so the panel uses the horizontal space and stays short (no scroll). Default
 *   (the narrow side panel) keeps the single vertical scroll column.
 * @param isMobile - Bigger tap targets for the touch search sheet (roomier rows + taller date inputs).
 *   Default off, so desktop renders byte-identical.
 */
export function DrawerFiltersPanel({ wide = false, isMobile = false }: { wide?: boolean; isMobile?: boolean }) {
   const { t } = useTranslation();
   const criteria = useDrawerStore((state) => state.searchCriteria);
   const { updateSearchCriteria, clearSearch } = useDrawerActions();
   // A tablet renders this desktop panel with a coarse pointer; give it the same touch sizing as mobile.
   const { isCoarse } = useBreakpoint();
   const touch = isMobile || isCoarse;

   const selectedTypes = criteria?.types ?? [];
   const selectedGames = criteria?.games ?? [];

   const toggleType = (type: GeneralItemType) => {
      const next = selectedTypes.includes(type) ? selectedTypes.filter((value) => value !== type) : [...selectedTypes, type];
      void updateSearchCriteria({ types: next });
   };
   const toggleGame = (game: GameSystem) => {
      const next = selectedGames.includes(game) ? selectedGames.filter((value) => value !== game) : [...selectedGames, game];
      void updateSearchCriteria({ games: next });
   };

   // Wide spreads each section across the width (grids + side-by-side dates) so it's short; narrow keeps
   // the vertical lists and the bounded scroll the cramped side panel needs.
   const typeListClass = wide ? 'grid grid-cols-3 gap-x-3 gap-y-0.5' : 'flex flex-col gap-1';
   const gameListClass = wide ? 'grid grid-cols-2 gap-x-3 gap-y-0.5' : 'flex flex-col gap-1';
   const datesClass = wide ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-3';

   return (
      <div className={cn('mt-2 flex flex-col gap-3 rounded-md border border-border bg-card p-3', !wide && 'max-h-72 overflow-y-auto')}>
         <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t('Drawer.filters.title')}</h3>
            <Button variant="ghost" size="sm" className="h-7 cursor-pointer px-2 text-xs coarse:h-9" onClick={clearSearch}>{t('Drawer.filters.clearAll')}</Button>
         </div>

         {/* Type (multi). */}
         <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">{t('Drawer.filters.type')}</span>
            <div className={typeListClass}>
               {FILTERABLE_ITEM_TYPES.map((type) => (
                  <label key={type} className={cn('flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-muted', touch && 'py-2')}>
                     <Checkbox checked={selectedTypes.includes(type)} onCheckedChange={() => toggleType(type)} />
                     {getItemTypeIcon(type)}
                     <span className="text-sm">{t(`Drawer.filters.itemType.${type}`)}</span>
                  </label>
               ))}
            </div>
         </div>

         {/* Game (multi). */}
         <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">{t('Drawer.filters.game')}</span>
            <div className={gameListClass}>
               {FILTERABLE_GAMES.map((game) => (
                  <label key={game} className={cn('flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-muted', touch && 'py-2')}>
                     <Checkbox checked={selectedGames.includes(game)} onCheckedChange={() => toggleGame(game)} />
                     {gameGlyph(game)}
                     <span className="text-sm">{t(`Drawer.Types.${game}`)}</span>
                  </label>
               ))}
            </div>
         </div>

         <div className={datesClass}>
            <DateRangeRow label={t('Drawer.filters.created')} range={criteria?.createdBetween} onChange={(next) => void updateSearchCriteria({ createdBetween: next })} isMobile={touch} />
            <DateRangeRow label={t('Drawer.filters.updated')} range={criteria?.updatedBetween} onChange={(next) => void updateSearchCriteria({ updatedBetween: next })} isMobile={touch} />
         </div>
      </div>
   );
}
