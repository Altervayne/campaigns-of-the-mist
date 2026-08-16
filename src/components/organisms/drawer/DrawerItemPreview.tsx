// -- React Imports --
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { Folder, GripVertical, LayoutGrid } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { readableTextColor } from '@/lib/color';

// -- Component Imports --
import { resolveCardComponent } from '@/components/organisms/cards/resolveCardComponent';
import { StatusTrackerCard } from '@/components/organisms/trackers/StatusTracker';
import { StoryTagTrackerCard } from '@/components/organisms/trackers/StoryTagTracker';
import { CharacterSheetPreview } from '@/components/molecules/CharacterSheetPreview';
import { StoryThemeTrackerCard } from '@/components/organisms/trackers/StoryThemeTracker';
import { NoteMarkdown } from '@/components/molecules/NoteMarkdown';
import { RollTableReadView } from '@/components/organisms/board/items/rolltable/RollTableReadView';
import { computeEntryLabels, normalizeRollTableContent } from '@/lib/rolltable/rollTableDisplay';
import { FitToBox } from '@/components/molecules/drawer/FitToBox';
import { ItemDateLabel } from '@/components/molecules/drawer/ItemDateLabel';
import { IconTooltip } from '@/components/molecules/drawer/IconTooltip';

// -- Utils Imports --
import { getItemTypeIcon } from '@/lib/utils/drawer-icons';
import { getGameVisual } from '@/lib/constants/gameVisuals';
import { boardContentBounds, itemCenter } from '@/lib/board/boardMiniMap';

// -- Type Imports --
import type { ReactElement } from 'react';
import type { DrawerItem, Folder as FolderType, GameSystem } from '@/lib/types/drawer';
import type { Board, ConnectionBoardContent, Journal, Note, PinBoardContent, PostItBoardContent, PostItNote, ZoneBoardContent } from '@/lib/types/board';
import type { RollTableContent } from '@/lib/rolltable/types';

/** The game glyph element (resolved in this module helper, not in render); neutral items have none. */
function gameGlyph(game: GameSystem): ReactElement | null {
   if (game === 'NEUTRAL') return null;
   const Icon = getGameVisual(game).Icon;
   return <Icon className="h-4 w-4 shrink-0" />;
}



/** The board's default note color, mirrored from the post-it item (a color-less note reads amber). */
const SCHEMATIC_POSTIT_COLOR = '#fde68a';

/**
 * Static preview of a saved post-it: the note's own colored sticky at a fixed footprint, its Markdown
 * clipped, no textarea / color toolbar. The `color` is USER CONTENT (the note the user made), so the
 * stored hex renders as-is with a luminance-derived readable text color - it is NOT washed to a theme
 * token. Everything around it (the preview frame, meta row) stays app-token chrome, handled by the card.
 */
function PostItPreview({ note }: { note: PostItNote }) {
   const { t } = useTranslation();
   const background = note.color ?? SCHEMATIC_POSTIT_COLOR;
   const textColor = readableTextColor(background);
   return (
      <div className="h-45 w-45 overflow-hidden" style={{ backgroundColor: background, color: textColor }}>
         {note.text.trim() ? (
            <div className="h-full w-full overflow-hidden p-2.5">
               <NoteMarkdown content={note.text} />
            </div>
         ) : (
            <div className="flex h-full w-full items-center justify-center p-2.5 text-center text-xs opacity-50">
               {t('BoardView.postItPlaceholder')}
            </div>
         )}
      </div>
   );
}

/**
 * Static preview of a saved journal: page 1's text on the themed `bg-card` panel, a stacked-pages edge on
 * the right signalling multi-page, a page count, and faint bookmark tab stubs when the journal has any.
 * A journal is CHROME end to end - unlike a post-it there is NO content-color exception, so every surface
 * here is an app token. Guarded: pages/bookmarks are read defensively (an empty or odd journal renders the
 * placeholder rather than throwing) - a preview must never crash.
 */
function JournalPreview({ journal }: { journal: Journal }) {
   const { t } = useTranslation();
   const pages = Array.isArray(journal?.pages) ? journal.pages : [];
   const bookmarks = Array.isArray(journal?.bookmarks) ? journal.bookmarks : [];
   const firstText = typeof pages[0]?.text === 'string' ? pages[0].text : '';
   const pageCount = Math.max(pages.length, 1);
   const multiPage = pageCount > 1;

   return (
      <div className="relative w-45 h-45">
         {/* Stacked-pages edge: faint offset panels behind the top page, only when multi-page. */}
         {multiPage && (
            <>
               <div className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-md border border-border bg-muted" />
               <div className="absolute inset-0 translate-x-[3px] translate-y-[3px] rounded-md border border-border bg-card" />
            </>
         )}

         {/* Top page: the themed card panel with page 1's clipped Markdown (or a placeholder when empty). */}
         <div className="absolute inset-0 flex flex-col overflow-hidden rounded-md border border-border bg-card text-card-foreground">
            <div className="min-h-0 flex-1 overflow-hidden p-2.5 text-sm leading-snug">
               {firstText.trim() ? (
                  <NoteMarkdown content={firstText} />
               ) : (
                  <span className="text-xs text-muted-foreground/50">{t('BoardView.journalPlaceholder')}</span>
               )}
            </div>
            {/* Page count, on muted chrome. */}
            <div className="shrink-0 border-t border-border px-2 py-1 text-[10px] text-muted-foreground">
               {t('Drawer.Types.journalPageCount', { count: pageCount })}
            </div>
         </div>

         {/* Bookmark tab stubs: faint chrome tabs at the right edge, capped so a heavily-tabbed journal
             doesn't overrun the thumbnail. Purely indicative - no labels, no interaction. */}
         {bookmarks.length > 0 && (
            <div className="absolute right-0 top-6 flex flex-col items-end gap-1">
               {bookmarks.slice(0, 3).map((bookmark) => (
                  <div key={bookmark.id} className="h-2 w-3 rounded-l-sm border border-r-0 border-border bg-muted" />
               ))}
            </div>
         )}
      </div>
   );
}

/**
 * Static preview of a saved Note: the document title and the top of its body on the PAPER palette -
 * a clipped thumbnail of the page, not a reader. It renders on `--paper-*` (parchment by default, and
 * re-themed by a custom theme's paper tokens) to match the note surface itself, NOT app `--card-*`
 * (which game themes override). Guarded: title/body are read defensively so an odd note renders the
 * placeholder rather than throwing - a preview must never crash.
 */
function NotePreview({ note }: { note: Note }) {
   const { t } = useTranslation();
   const title = typeof note?.title === 'string' ? note.title : '';
   const body = typeof note?.body === 'string' ? note.body : '';

   return (
      <div className="flex h-45 w-45 flex-col overflow-hidden rounded-md border border-paper-border bg-paper-background text-paper-foreground">
         {title.trim() ? (
            <div className="shrink-0 border-b border-paper-border px-2.5 py-1.5 text-sm font-semibold truncate">{title}</div>
         ) : null}
         <div className="min-h-0 flex-1 overflow-hidden p-2.5 text-sm leading-snug">
            {body.trim() ? (
               <NoteMarkdown content={body} />
            ) : (
               <span className="text-xs text-paper-foreground/50">{t('NoteView.emptyPreview')}</span>
            )}
         </div>
      </div>
   );
}

/**
 * Static preview of a saved roll table: its title and weighted entries on the themed `bg-card` panel,
 * clipped to a fixed footprint. Reuses the board's inert, pointer-transparent read view, so there is no
 * roll control. A roll table is CHROME end to end - every surface is an app token; it is NEUTRAL, so no
 * game glyph. Guarded: title/entries are read defensively so an odd table shows placeholders rather than
 * throwing - a preview must never crash.
 */
function RollTablePreview({ table }: { table: RollTableContent }) {
   const { t } = useTranslation();
   const title = typeof table?.title === 'string' ? table.title : '';
   const entries = Array.isArray(table?.entries) ? table.entries : [];
   const display = normalizeRollTableContent({ title, entries, display: table?.display }).display ?? 'range';
   const labels = computeEntryLabels(entries, display);

   return (
      <div className="flex h-45 w-45 flex-col overflow-hidden rounded-md border border-border bg-card text-card-foreground">
         <div className={cn('shrink-0 truncate border-b border-border px-2 py-1.5 text-sm font-semibold', !title && 'text-muted-foreground/60')}>
            {title || t('BoardView.rollTableTitlePlaceholder')}
         </div>
         <div className="min-h-0 flex-1 overflow-hidden">
            <RollTableReadView
               entries={entries}
               labels={labels}
               liveIndex={null}
               highlightId={null}
               entryPlaceholder={t('BoardView.rollTableEntryPlaceholder')}
            />
         </div>
      </div>
   );
}

/**
 * Cheap board thumbnail: a schematic mini-map. Each item is a small block at its scaled board position
 * (the SVG viewBox IS the content bbox, so a wide board fills the width and a tall one centers as a
 * column), zones are faint regions behind their members, connections are hairlines between block
 * centers. Pure render - no item components, no asset loads - so the LAYOUT is the signal. The item
 * count survives as a subtle corner badge; an empty board keeps the glyph + count.
 */
function BoardPreview({ board }: { board: Board }) {
   const { t } = useTranslation();
   const itemCount = board.items.filter((item) => item.kind !== 'connection').length;
   const bounds = boardContentBounds(board.items);

   // Empty board: an empty SVG reads as broken, so keep the glyph + count.
   if (!bounds) {
      return (
         <div className="w-62.5 h-25 flex flex-col items-center justify-center gap-2 bg-popover/50 text-muted-foreground rounded-lg p-4 text-center">
            <LayoutGrid className="h-8 w-8" />
            <p className="text-xs">{t('Drawer.Types.boardItemCount', { count: itemCount })}</p>
         </div>
      );
   }

   const byId = new Map(board.items.map((item) => [item.id, item]));
   const zones = board.items.filter((item) => item.kind === 'zone');
   const connections = board.items.filter((item) => item.kind === 'connection');
   const blocks = board.items.filter((item) => item.kind !== 'zone' && item.kind !== 'connection');

   return (
      <div className="relative w-62.5 h-25 overflow-hidden rounded-lg bg-popover/50 p-1 text-foreground">
         <svg
            viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
            preserveAspectRatio="xMidYMid meet"
            className="h-full w-full"
         >
            {/* Zones behind: a faint region in the stored color, or a subtle theme tint when color-less. */}
            {zones.map((zone) => {
               const color = (zone.content as ZoneBoardContent).color;
               return (
                  <rect
                     key={zone.id}
                     x={zone.x} y={zone.y} width={zone.width} height={zone.height} rx={2}
                     fill={color ?? 'currentColor'} fillOpacity={color ? 0.2 : 0.07}
                     stroke={color ?? 'currentColor'} strokeOpacity={0.35} strokeWidth={1}
                     vectorEffect="non-scaling-stroke"
                  />
               );
            })}

            {/* Connections: a hairline from center to center, skipping a deleted endpoint. */}
            {connections.map((conn) => {
               const content = conn.content as ConnectionBoardContent;
               const from = byId.get(content.from);
               const to = byId.get(content.to);
               if (!from || !to) return null;
               const a = itemCenter(from);
               const b = itemCenter(to);
               return (
                  <line
                     key={conn.id}
                     x1={a.cx} y1={a.cy} x2={b.cx} y2={b.cy}
                     stroke={content.style.color} strokeOpacity={0.7} strokeWidth={1}
                     vectorEffect="non-scaling-stroke"
                  />
               );
            })}

            {/* Every other item: a block in its content color (post-it / pin) or a neutral theme block. */}
            {blocks.map((item) => {
               const ownColor = item.kind === 'post-it'
                  ? (item.content as PostItBoardContent).data.color ?? SCHEMATIC_POSTIT_COLOR
                  : item.kind === 'pin'
                     ? (item.content as PinBoardContent).color
                     : null;
               return (
                  <rect
                     key={item.id}
                     x={item.x} y={item.y} width={item.width} height={item.height} rx={2}
                     fill={ownColor ?? 'currentColor'} fillOpacity={ownColor ? 1 : 0.25}
                  />
               );
            })}
         </svg>

         {/* Subtle count badge over the map (app-themed), so the count survives the revamp. */}
         <span className="absolute bottom-1 right-1 rounded bg-popover/80 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {t('Drawer.Types.boardItemCount', { count: itemCount })}
         </span>
      </div>
   );
}

export function FolderPreview({ folder }: { folder: FolderType }) {
   return (
      <div
            className="flex items-center justify-between gap-2 py-1 pl-1 pr-2 rounded bg-popover/50 border-2 border-border"
         >
         <div
            className="flex h-8 items-center gap-2 truncate "
         >
            <GripVertical
               className="h-5 w-5 shrink-0 text-accent-foreground cursor-grab"
            />
            <Folder className="h-6 w-6 shrink-0 text-accent-foreground"/>
            <span className="truncate font-medium text-sm">{folder.name}</span>
         </div>
      </div>
   );
}

/**
 * Static preview card for a drawer item: name, a non-interactive snapshot of the
 * stored content, and the game/type label.
 *
 * @param item - The drawer item to preview.
 * @param headerAction - Optional control rendered on the title row (e.g. the
 *   mobile context-menu button), so it reads as a corner action of this card
 *   rather than floating in a separate column beside it. Desktop and drag-overlay
 *   callers omit it and the title row keeps its original single-element layout.
 * @param headerActionLeft - Places `headerAction` on the left of the title
 *   instead of the right, to follow left-handed placement on mobile.
 */
export function DrawerItemPreview({
   item,
   headerAction,
   headerActionLeft = false,
}: {
   // Browse passes a dated `DrawerItemRecord`; the drag overlay / mobile may pass a nested item without
   // dates (the date label then renders nothing), so the date fields are optional here.
   item: DrawerItem & { createdAt?: number; updatedAt?: number };
   headerAction?: ReactNode;
   headerActionLeft?: boolean;
}) {
   const { t } = useTranslation();

   const renderSnapshot = () => {
      const { content, type, game } = item;

      // Game items (Legends/City/Otherscape) and NEUTRAL items (e.g. a portrait image
      // card) have previews; the card mapping is delegated to resolveCardComponent,
      // while trackers and full sheets are game-independent. Anything else falls
      // through to the unavailable-preview placeholder below.
      if (game === 'LEGENDS' || game === 'CITY_OF_MIST' || game === 'OTHERSCAPE' || game === 'NEUTRAL') {
         if ('cardType' in content) {
            const Component = resolveCardComponent(type, game);
            if (Component) {
               return <Component card={content} isDrawerPreview />;
            }
         }

         if ('trackerType' in content) {
            if (content.trackerType === 'STATUS') {
               return <StatusTrackerCard tracker={content} isDrawerPreview />;
            }
            if (content.trackerType === 'STORY_TAG') {
               return <StoryTagTrackerCard tracker={content} isDrawerPreview />;
            }
            if (content.trackerType === 'STORY_THEME') {
               return <StoryThemeTrackerCard tracker={content} isDrawerPreview />;
            }
         }

         if (type === 'FULL_CHARACTER_SHEET') {
            return <CharacterSheetPreview item={item} />;
         }

         if (type === 'FULL_BOARD') {
            return <BoardPreview board={content as Board} />;
         }

         if (type === 'POST_IT') {
            return <PostItPreview note={content as PostItNote} />;
         }

         if (type === 'JOURNAL') {
            return <JournalPreview journal={content as Journal} />;
         }

         if (type === 'NOTE') {
            return <NotePreview note={content as Note} />;
         }

         if (type === 'ROLL_TABLE') {
            return <RollTablePreview table={content as RollTableContent} />;
         }
      }

      return (
         <div className="w-62.5 h-25 flex items-center justify-center bg-popover/50 text-muted-foreground rounded-lg p-4 text-center">
               <p className="text-xs">{t('Drawer.Types.unavailablePreview')}</p>
         </div>
      );
   };

   // The game glyph (null for NEUTRAL items, which carry no game badge).
   const glyph = gameGlyph(item.game);

   return (
      // Uniform card: a FIXED preview area (every type's preview is fit into it), then the name, then a
      // meta row (type glyph + game glyph + date). Same footprint regardless of type.
      <div className="flex flex-col gap-2 rounded-md border-2 border-border bg-card/75 p-2 transition-colors hover:bg-muted">
         {/* Fixed ASPECT (not a fixed height) so the preview keeps the same proportion in both the narrow
             side panel and the wider Library cells - a fixed height read wide-short in the roomy panel. */}
         <FitToBox className="pointer-events-none aspect-[19/10] w-full rounded-md bg-popover/30">
            {renderSnapshot()}
         </FitToBox>

         <div className={cn('flex items-center gap-2', headerActionLeft && 'flex-row-reverse')}>
            <p className="min-w-0 flex-1 truncate px-1 text-sm font-semibold">{item.name}</p>
            {headerAction}
         </div>

         {/* Meta: app-themed chrome (the game glyph is content's color via the icon, but the row is muted).
             Each indicator icon gets a hover label naming it - the type and the game - so they're not a guess. */}
         <div className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
            <IconTooltip label={t(`Drawer.filters.itemType.${item.type}`)}>{getItemTypeIcon(item.type)}</IconTooltip>
            {glyph && <IconTooltip label={t(`Drawer.Types.${item.game}`)}>{glyph}</IconTooltip>}
            <ItemDateLabel type={item.type} createdAt={item.createdAt} updatedAt={item.updatedAt} className="truncate" />
         </div>
      </div>
   );
};