// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { Crosshair, Crown, ExternalLink, Leaf, Sparkles, Swords, User, Users } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Store and Hook Imports --
import { useAssetObjectUrl } from '@/hooks/useAssetObjectUrl';

// -- Board Imports --
import { condensedThemeRows, characterPortraitAssetId, overviewPanelCardClass, rowCardTypeClass, trackerCounts, type CondensedThemeRow } from '@/lib/board/characterOverview';

// -- Type Imports --
import type { Character } from '@/lib/types/character';

/*
 * The shared read-only character overview: a recognizable representation of a specific character used by
 * both a board character element and the drawer preview. Unlike app chrome, this is game CONTENT, so it
 * carries the game's look: the panel uses the game card-theme palette (`--card-*`), and each theme row is
 * tinted by its own card type (a Mythos theme vs the Fellowship reads at a glance via a colored, icon-led
 * type badge). An identity header (portrait + name + game) tops a condensed row per theme card.
 *
 * `onOpen` makes it live: it renders the open button and a double-click-to-open handler. Without it the
 * panel is fully static and read-only - no button, no handlers - as the drawer needs. Sizing (width, grow,
 * rounding, shadow) is left to the consumer via `className`, so the board and the drawer frame each own it.
 */

interface CharacterOverviewPanelProps {
   character: Character;
   onOpen?: () => void;
   className?: string;
}

export function CharacterOverviewPanel({ character, onOpen, className }: CharacterOverviewPanelProps) {
   const { t } = useTranslation();
   const portrait = useAssetObjectUrl(characterPortraitAssetId(character));
   const rows = condensedThemeRows(character);
   const trackers = trackerCounts(character);

   return (
      <div
         onDoubleClick={onOpen}
         className={cn(overviewPanelCardClass(character.game), 'flex flex-col overflow-hidden border-2 border-card-border bg-card-paper-bg text-card-paper-fg', className)}
      >
         {/* Identity header (stands in for the character card; its deep stats stay in the tab). */}
         <div className="relative flex shrink-0 items-center gap-3 border-b border-card-accent bg-card-header-bg p-1 text-card-header-fg">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-card-accent bg-card-paper-bg">
               {portrait.url
                  ? <img src={portrait.url} alt="" draggable={false} className="h-full w-full object-cover" />
                  : <User className="h-6 w-6 text-card-paper-fg/50" />}
            </div>
            <div className={cn('flex min-w-0 flex-col', onOpen && 'pr-6')}>
               <span className="truncate text-sm font-semibold">{character.name || t('BoardView.referenceSourceRemoved')}</span>
               <span className="truncate text-xs text-card-header-fg/80">{t(`Drawer.Types.${character.game}`)}</span>
            </div>
            {onOpen && (
               <button
                  type="button"
                  title={t('BoardView.openCharacter')}
                  aria-label={t('BoardView.openCharacter')}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={onOpen}
                  className="absolute right-1.5 top-1.5 flex cursor-pointer items-center justify-center rounded p-1 text-card-header-fg/80 hover:bg-card-paper-bg/20 hover:text-card-header-fg"
               >
                  <ExternalLink className="h-4 w-4" />
               </button>
            )}
         </div>

         {/* Condensed theme rows. */}
         {rows.length === 0 ? (
            <div className="px-3 py-2 text-xs italic text-card-paper-fg/70">{t('BoardView.overviewNoThemes')}</div>
         ) : (
            <div className="flex flex-col divide-y divide-card-accent/40">
               {rows.map((row) => <ThemeRow key={row.id} row={row} game={character.game} />)}
            </div>
         )}

         {/* Light tracker footer (only when the character has trackers). */}
         {trackers.total > 0 && (
            <div className="mt-auto shrink-0 border-t border-card-accent bg-card-popover-bg px-3 py-1.5 text-[11px] text-card-popover-fg">
               {t('BoardView.overviewTrackers', { statuses: trackers.statuses, tags: trackers.tags, themes: trackers.themes })}
            </div>
         )}
      </div>
   );
}

/** One condensed theme row: a type-colored icon badge, the themebook, and the main tag + counts. */
function ThemeRow({ row, game }: { row: CondensedThemeRow; game: Character['game'] }) {
   const { t } = useTranslation();

   // The type name: a real theme shows its type; a group reads as Fellowship/Crew; a loadout as Loadout.
   const typeLabel = row.rowKind === 'group'
      ? (game === 'LEGENDS' ? t('BoardView.themeRowFellowship') : t('BoardView.themeRowCrew'))
      : row.rowKind === 'loadout'
         ? t('BoardView.themeRowLoadout')
         : (row.themeType ? t(row.themeType) : t('BoardView.themeRowFellowship'));

   const counts = row.rowKind === 'loadout'
      ? t('BoardView.overviewGearFlaws', { gear: row.powerCount, flaws: row.weaknessCount })
      : t('BoardView.overviewPowerWeakness', { power: row.powerCount, weakness: row.weaknessCount });

   // A loadout has no main tag, so its type name ("Loadout") becomes the main line with nothing beneath.
   // Otherwise the main line is the tag, and the sub-line is the themebook (or the type name for a group).
   const isLoadout = row.rowKind === 'loadout';
   const mainLine = isLoadout ? typeLabel : (row.mainTagName || t('BoardView.overviewUnnamedTag'));
   const subLine = isLoadout ? '' : (row.themebook || typeLabel);

   return (
      <div className="flex min-w-0 items-stretch gap-2 p-1.5">
         {/* Type cue: the card's own theme-type icon on its header color - the same identity glyph the
             full card carries, so a row reads as its type at a glance. The type's card-theme class is
             scoped to THIS badge only (not the whole row), so it colors the badge without recoloring
             the row text - the panel's paper palette stays in force, which keeps the text legible
             (an Otherscape theme's own palette is a DARK-card one: light text that would vanish on the
             panel's light paper). An absent type falls back to the panel's game palette. The badge
             stretches near-full row height for visibility. */}
         <span
            title={typeLabel}
            aria-label={typeLabel}
            className={cn(rowCardTypeClass(game, row), 'flex aspect-square shrink-0 items-center justify-center self-stretch rounded-md bg-card-header-bg text-card-header-fg')}
         >
            <ThemeRowGlyph game={game} row={row} />
         </span>
         <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
            {/* The main tag (or "Loadout" for a loadout), prominent (bold) and truncating - an active tag reads bolder still. */}
            <span className={cn('truncate text-xs font-semibold text-card-paper-fg', row.mainTagScratched && 'line-through', row.mainTagActive && 'font-bold')}>
               {mainLine}
            </span>
            {/* The themebook (or the type name; empty for a loadout), regular and muted, with its power/weakness (or gear/flaws) counts. */}
            <div className="flex min-w-0 items-center justify-between gap-2">
               <span className="truncate text-[11px] font-normal text-card-paper-fg/70">{subLine}</span>
               <span className="shrink-0 rounded bg-card-paper-fg/10 px-1.5 py-0.5 text-[10px] tabular-nums text-card-paper-fg/70">{counts}</span>
            </div>
         </div>
      </div>
   );
}

/**
 * The identity glyph for a theme row: the card's own theme-type icon where one exists (Legends use
 * Lucide; City/Otherscape use the theme SVGs, rendered in the badge's foreground like the cards), plus
 * our own picks for the non-theme cards - a group of people for a fellowship/crew, a reticle for a
 * loadout. Falls back to a generic mark for an unknown type.
 */
function ThemeRowGlyph({ game, row }: { game: Character['game']; row: CondensedThemeRow }) {
   const iconClass = 'h-6 w-6';
   if (row.rowKind === 'group') return <Users className={iconClass} />;
   if (row.rowKind === 'loadout') return <Crosshair className={iconClass} />;

   if (game === 'OTHERSCAPE') {
      const file = row.themeType === 'Self' ? 'os_self' : row.themeType === 'Noise' ? 'os_noise' : row.themeType === 'Mythos' ? 'os_mythos' : null;
      if (file) return <ThemeSvgGlyph file={file} />;
   } else if (game === 'CITY_OF_MIST') {
      const file = row.themeType === 'Mythos' ? 'com_mythos' : row.themeType === 'Logos' ? 'com_logos' : null;
      if (file) return <ThemeSvgGlyph file={file} />;
   } else {
      if (row.themeType === 'Origin') return <Leaf className={iconClass} strokeWidth={2.5} />;
      if (row.themeType === 'Adventure') return <Swords className={iconClass} strokeWidth={2.5} />;
      if (row.themeType === 'Greatness') return <Crown className={iconClass} strokeWidth={2.5} />;
   }
   return <Sparkles className={iconClass} />;
}

/** A theme SVG icon, recolored to the badge's foreground (the same invert the cards' corner icons use). */
function ThemeSvgGlyph({ file }: { file: string }) {
   return (
      <img
         src={`/icons/Themes/${file}.svg`}
         alt=""
         width={20}
         height={20}
         className="h-6 w-6"
         style={{ filter: 'brightness(0) saturate(100%) invert(100%)' }}
      />
   );
}
