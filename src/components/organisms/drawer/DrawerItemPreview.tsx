// -- React Imports --
import { useId } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

// -- Hook Imports --
import { useInView } from '@/hooks/useInView';
import { useDrawerReady } from '@/components/organisms/drawer/DrawerReadyContext';

// -- Icon Imports --
import { Folder, GripVertical, LayoutGrid, NotebookText } from 'lucide-react';

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
import { PdfPreview, PdfPreviewBadges } from '@/components/organisms/drawer/PdfPreview';
import { ChallengeCardPreview } from '@/components/organisms/drawer/ChallengeCardPreview';
import { RollTableReadView } from '@/components/organisms/board/items/rolltable/RollTableReadView';
import { computeEntryLabels, normalizeRollTableContent } from '@/lib/rolltable/rollTableDisplay';
import { DrawerCardFrame } from '@/components/molecules/drawer/DrawerCardFrame';
import { drawerPreviewStage, PREVIEW_PAGE, PREVIEW_PAGE_WIDTH } from '@/components/molecules/drawer/drawerPreviewStage';
import { ItemDateLabel } from '@/components/molecules/drawer/ItemDateLabel';
import { IconTooltip } from '@/components/molecules/drawer/IconTooltip';

// -- Utils Imports --
import { getItemTypeIconComponent, getItemIdentityAccent } from '@/lib/utils/drawer-icons';
import { drawerItemCardTypeClass, cardTypeBadgeStyle } from '@/lib/theme/drawerItemCardTypeClass';
import { GameBadge } from '@/components/molecules/drawer/GameBadge';
import { boardContentBounds, itemCenter } from '@/lib/board/boardMiniMap';
import { boardBackgroundStyle } from '@/lib/board/boardBackgroundStyle';
import { gridBackground } from '@/lib/board/gridStyle';
import { hexTile } from '@/lib/board/hexGrid';

// -- Type Imports --
import type { DrawerItem, Folder as FolderType } from '@/lib/types/drawer';
import type { Board, ConnectionBoardContent, Journal, Note, PinBoardContent, PostItBoardContent, PostItNote, Viewport, ZoneBoardContent } from '@/lib/types/board';
import type { RollTableContent } from '@/lib/rolltable/types';
import type { PdfDocument } from '@/lib/types/pdf';




/** The board's default note color, mirrored from the post-it item (a color-less note reads amber). */
const SCHEMATIC_POSTIT_COLOR = '#fde68a';

/**
 * Static preview of a saved post-it: the note's own colored sticky at the large page-width authoring size,
 * its Markdown clipped, no textarea / color toolbar. The `color` is USER CONTENT (the note the user made),
 * so the stored hex renders as-is with a luminance-derived readable text color - it is NOT washed to a
 * theme token. Everything around it (the preview frame, meta row) stays app-token chrome, handled by the
 * card. The sticky keeps its square shape - the shared width just lets `cover` down-scale the text legible.
 */
function PostItPreview({ note }: { note: PostItNote }) {
   const { t } = useTranslation();
   const background = note.color ?? SCHEMATIC_POSTIT_COLOR;
   const textColor = readableTextColor(background);
   return (
      <div className="w-[540px] aspect-square overflow-hidden" style={{ backgroundColor: background, color: textColor }}>
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
 * Static preview of a saved journal: page 1's text on the PAPER palette (matching a note's parchment),
 * fronted by a bound masthead - a book glyph, the type name, and the page count - so a journal reads
 * unmistakably as a notebook and never as a plain note. A faint offset panel behind the page carries the
 * multi-page depth cue. Guarded: pages are read defensively (an empty or odd journal renders the
 * placeholder rather than throwing) - a preview must never crash.
 */
function JournalPreview({ journal }: { journal: Journal }) {
   const { t } = useTranslation();
   const pages = Array.isArray(journal?.pages) ? journal.pages : [];
   const firstText = typeof pages[0]?.text === 'string' ? pages[0].text : '';
   const pageCount = Math.max(pages.length, 1);
   const multiPage = pageCount > 1;

   return (
      <div className={cn('relative', PREVIEW_PAGE)}>
         {/* Stacked-pages edge: a faint offset paper panel behind the top page, only when multi-page. */}
         {multiPage && (
            <div className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-md border border-paper-border bg-paper-background opacity-70" />
         )}

         {/* Top page: parchment with a bound masthead, then page 1's clipped Markdown (or a placeholder). */}
         <div className="absolute inset-0 flex flex-col overflow-hidden rounded-md border border-paper-border bg-paper-background text-paper-foreground">
            {/* Masthead: the journal's header band, on the paper header color (bg-paper-primary), matching the
                real journal's title bar so the preview reads as the same document. */}
            <div className="shrink-0 flex items-center gap-2 border-b border-paper-border bg-paper-primary px-2.5 py-2 text-paper-primary-foreground">
               <NotebookText className="h-4 w-4 shrink-0" />
               <span className="truncate text-sm font-semibold uppercase tracking-wide">{t('Drawer.Types.JOURNAL')}</span>
               <span className="ml-auto shrink-0 text-[11px] text-paper-primary-foreground/70">
                  {t('Drawer.Types.journalPageCount', { count: pageCount })}
               </span>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden p-2.5 text-sm leading-snug">
               {firstText.trim() ? (
                  <NoteMarkdown content={firstText} />
               ) : (
                  <span className="text-xs text-paper-foreground/50">{t('BoardView.journalPlaceholder')}</span>
               )}
            </div>
         </div>
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
      <div className={cn('flex flex-col overflow-hidden bg-paper-background text-paper-foreground', PREVIEW_PAGE)}>
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
      <div className={cn('flex flex-col overflow-hidden bg-card text-card-foreground', PREVIEW_PAGE)}>
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

/** A still viewport for the preview grid: it's decorative surface texture, not aligned to the item scale. */
const PREVIEW_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };
/** Grid cell size in the board preview's authoring space; scales down with the card. */
const PREVIEW_GRID_SPACING = 28;

/** The board's hex grid, drawn as a tiling SVG pattern (hex has no CSS form) - mirrors the canvas layer. */
function BoardPreviewHexGrid({ color }: { color?: string }) {
   const patternId = useId();
   const tile = hexTile(PREVIEW_GRID_SPACING);
   return (
      <svg className={cn('pointer-events-none absolute inset-0 h-full w-full', !color && 'text-foreground opacity-[0.15]')} aria-hidden>
         <defs>
            <pattern id={patternId} patternUnits="userSpaceOnUse" width={tile.width} height={tile.height}>
               <path d={tile.path} fill="none" stroke={color ?? 'currentColor'} strokeWidth={1} />
            </pattern>
         </defs>
         <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
   );
}

/**
 * Board thumbnail: the board's REAL surface - its background fill / texture (or the theme canvas) with its
 * grid over it - so it reads as an actual board, not a bare diagram. Over that, a schematic of the items:
 * each a small block at its scaled board position (the SVG viewBox IS the content bbox, so a wide board
 * fills the width and a tall one centers), zones faint regions, connections hairlines between block centers.
 * Pure render - no item components, no asset loads - so the surface + LAYOUT are the signal. An empty board
 * keeps the surface + a centered glyph; the item count rides a corner badge.
 */
function BoardPreview({ board }: { board: Board }) {
   const bounds = boardContentBounds(board.items);
   const grid = board.grid;

   const byId = new Map(board.items.map((item) => [item.id, item]));
   const zones = board.items.filter((item) => item.kind === 'zone');
   const connections = board.items.filter((item) => item.kind === 'connection');
   const blocks = board.items.filter((item) => item.kind !== 'zone' && item.kind !== 'connection');

   return (
      <div className={cn('relative overflow-hidden bg-background text-foreground aspect-[4/3]', PREVIEW_PAGE_WIDTH)} style={boardBackgroundStyle(board.background)}>
         {/* Grid echoing the board's own style: CSS backgrounds for dots / lines, an SVG pattern for hex. */}
         {grid && grid.type !== 'none' && grid.type !== 'hex' && (
            <div className="pointer-events-none absolute inset-0 text-foreground/15" style={gridBackground(grid, PREVIEW_GRID_SPACING, PREVIEW_VIEWPORT)} />
         )}
         {grid?.type === 'hex' && <BoardPreviewHexGrid color={grid.color} />}

         {bounds ? (
            <div className="absolute inset-0 p-6">
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

                  {/* Every other item: a filled block with a hairline edge so it reads on any surface color;
                      a post-it / pin keeps its own color, anything else a neutral theme block. */}
                  {blocks.map((item) => {
                     const ownColor = item.kind === 'post-it'
                        ? (item.content as PostItBoardContent).data.color ?? SCHEMATIC_POSTIT_COLOR
                        : item.kind === 'pin'
                           ? (item.content as PinBoardContent).color
                           : null;
                     return (
                        <rect
                           key={item.id}
                           x={item.x} y={item.y} width={item.width} height={item.height} rx={3}
                           fill={ownColor ?? 'currentColor'} fillOpacity={ownColor ? 1 : 0.28}
                           stroke="currentColor" strokeOpacity={0.25} strokeWidth={1} vectorEffect="non-scaling-stroke"
                        />
                     );
                  })}
               </svg>
            </div>
         ) : (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
               <LayoutGrid className="h-10 w-10 opacity-50" />
            </div>
         )}
      </div>
   );
}

/** The board's item count, at native chrome size on the card stage (never scaled down with the thumbnail). */
function BoardPreviewBadge({ count }: { count: number }) {
   const { t } = useTranslation();
   return (
      <span className="pointer-events-none absolute bottom-2 right-2 z-10 rounded-md bg-popover/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
         {t('Drawer.Types.boardItemCount', { count })}
      </span>
   );
}

export function FolderPreview({ folder }: { folder: FolderType }) {
   return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-popover py-1 pl-1 pr-2">
         <GripVertical className="h-5 w-5 shrink-0 text-muted-foreground cursor-grab" />
         <Folder className="h-6 w-6 shrink-0 text-muted-foreground" />
         <span className="truncate font-medium text-sm text-foreground">{folder.name}</span>
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
 * @param lazy - Defers the heavy stage content until the card scrolls into view,
 *   bounding render cost in a big folder. The shell (name + meta) mounts
 *   immediately and the stage reserves its size, so DnD geometry and layout are
 *   unaffected. The drag overlay, mobile, and search cards omit it (immediate).
 */
export function DrawerItemPreview({
   item,
   headerAction,
   headerActionLeft = false,
   lazy = false,
}: {
   // Browse passes a dated `DrawerItemRecord`; the drag overlay / mobile may pass a nested item without
   // dates (the date label then renders nothing), so the date fields are optional here.
   item: DrawerItem & { createdAt?: number; updatedAt?: number };
   headerAction?: ReactNode;
   headerActionLeft?: boolean;
   lazy?: boolean;
}) {
   const { t } = useTranslation();
   // Latched visibility gate; the ref lands on the card root (via DrawerCardFrame) only when lazy.
   const { ref, hasBeenVisible } = useInView<HTMLDivElement>();
   // Heavy content waits for BOTH: the card is in view AND the drawer's open animation has settled - so a
   // populated drawer slides in as cheap shells and fills content after, never rendering it mid-animation.
   const drawerReady = useDrawerReady();
   const deferred = lazy && (!hasBeenVisible || !drawerReady);

   const renderSnapshot = () => {
      const { content, type, game } = item;

      // Game items (Legends/City/Otherscape) and NEUTRAL items (e.g. a portrait image
      // card) have previews; the card mapping is delegated to resolveCardComponent,
      // while trackers and full sheets are game-independent. Anything else falls
      // through to the unavailable-preview placeholder below.
      if (game === 'LEGENDS' || game === 'CITY_OF_MIST' || game === 'OTHERSCAPE' || game === 'NEUTRAL') {
         // Challenge cards read their whole substance off the landscape sheet, so the preview drives that
         // rich read view rather than the sparse flip front the generic snapshot would render.
         if ('cardType' in content && content.cardType === 'CHALLENGE_CARD') {
            return <ChallengeCardPreview card={content} />;
         }

         if ('cardType' in content) {
            const Component = resolveCardComponent(type, game);
            if (Component) {
               // The full static card at its own natural width; cover-fill upscales it to fill the stage,
               // top-anchored, and the tall body crops off the faded bottom - the thumbnail reads the art,
               // name, and top content.
               return <Component card={content} isSnapshot />;
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

         if (type === 'PDF') {
            return <PdfPreview pdf={content as PdfDocument} drawerItemId={item.id} />;
         }
      }

      return (
         <div className="w-62.5 h-25 flex items-center justify-center bg-popover/50 text-muted-foreground rounded-lg p-4 text-center">
               <p className="text-xs">{t('Drawer.Types.unavailablePreview')}</p>
         </div>
      );
   };

   // The stage wears the type's own surface and the fill matches its silhouette (cover vs contain); game
   // cards additionally upscale to fill the stage width.
   const { stageClassName, fit, allowUpscale } = drawerPreviewStage(item.type);
   // The type's identity accent tints the meta glyph and paints the card's left spine.
   const accent = getItemIdentityAccent(item.type, item.game);
   // A card-bearing item wears its own palette header color on the badge (mirrors the card, and avoids
   // doubling the game color already carried by the spine + game badge); others keep the fixed accent.
   const badgeStyle = cardTypeBadgeStyle(drawerItemCardTypeClass(item.type, item.game, item.content));
   // A stable module-level lucide component; static-components is a false positive here.
   const Icon = getItemTypeIconComponent(item.type);

   // Each indicator icon gets a hover label naming it - the type and the game - so they're not a guess.
   const meta = (
      <>
         <IconTooltip label={t(`Drawer.filters.itemType.${item.type}`)}>
            {/* Solid identity badge: the card's palette header color when it has one, else the fixed accent. */}
            <span className={cn('flex size-5 shrink-0 items-center justify-center rounded', !badgeStyle && accent.badge)} style={badgeStyle ?? undefined}>
               {/* eslint-disable-next-line react-hooks/static-components */}
               <Icon className="h-3.5 w-3.5" />
            </span>
         </IconTooltip>
         {item.game !== 'NEUTRAL' && <IconTooltip label={t(`Drawer.Types.${item.game}`)}><GameBadge game={item.game} /></IconTooltip>}
         <ItemDateLabel type={item.type} createdAt={item.createdAt} updatedAt={item.updatedAt} className="truncate" />
      </>
   );

   // Preview chips ride the stage at native size (never the scaled content), so they stay legible however
   // small the card scales; the other types carry their meta inside the preview.
   const stageOverlay = deferred
      ? undefined
      : item.type === 'PDF'
         ? <PdfPreviewBadges pdf={item.content as PdfDocument} />
         : item.type === 'FULL_BOARD'
            ? <BoardPreviewBadge count={(item.content as Board).items.filter((boardItem) => boardItem.kind !== 'connection').length} />
            : undefined;

   // Deferred: the stage shows a shimmer placeholder (mirroring the search skeleton) at the same
   // footprint, so nothing reflows when the real content swaps in on scroll.
   return (
      <DrawerCardFrame
         rootRef={lazy ? ref : undefined}
         stageClassName={deferred ? 'animate-pulse bg-muted/40' : stageClassName}
         fit={deferred ? 'contain' : fit}
         allowUpscale={deferred ? undefined : allowUpscale}
         name={item.name}
         meta={meta}
         accentBar={accent.bar}
         stageOverlay={stageOverlay}
         headerAction={headerAction}
         headerActionLeft={headerActionLeft}
      >
         {deferred ? null : renderSnapshot()}
      </DrawerCardFrame>
   );
};