/*
 * The Board aggregate types (the assembled form), analogous to the drawer's
 * `Folder`/`DrawerItem`. The normalized persistence shapes live in
 * `src/lib/board/boardRecords.ts`; the repository assembles these from records.
 *
 * The per-kind `content` payloads are deliberately MINIMAL for now - just enough to
 * persist and test. Each consumer prompt finalizes its own kind's payload, so these
 * shapes are expected to grow (flagged inline where so).
 */

// -- Type Imports --
import type { DiceTrayContent } from '@/lib/dice/diceTrayTypes';
import type { RollTableContent } from '@/lib/rolltable/types';

/** Board camera: pan offset + zoom. Persisted; a return-to-origin control resets it. */
export interface Viewport {
   x: number;
   y: number;
   zoom: number;
}

/**
 * The background grid styles a board can show behind its items. `lines` is the both-axes crosshatch;
 * `h-lines`/`v-lines` are the single-axis rules; `hex` is the honeycomb hive.
 */
export type BoardGridType = 'none' | 'dots' | 'lines' | 'h-lines' | 'v-lines' | 'hex';

/**
 * A board's background grid. `color` is optional - absent means a subtle theme default;
 * a stored hex renders full-strength.
 */
export interface BoardGrid {
   type: BoardGridType;
   color?: string;
}

/** A color-agnostic CSS texture overlaid on the board surface fill. */
export type BoardTexture = 'paper' | 'linen';

/**
 * A board's surface backdrop, painted behind the grid. `color` is a fill; `texture` is a
 * semi-transparent CSS overlay layered over it. Both optional - an absent or fully-empty
 * background renders nothing, so the theme canvas shows (today's look, no migration).
 */
export interface BoardBackground {
   color?: string;
   texture?: BoardTexture;
}

/** The kinds of item a board can hold. `connection` is a non-spatial line between two items. */
export type BoardItemKind = 'image' | 'post-it' | 'journal' | 'note' | 'threat' | 'card' | 'tracker' | 'connection' | 'pin' | 'dice-tray' | 'roll-table' | 'zone' | 'character' | 'portal' | 'text' | 'drawing';

/**
 * An image card on the board; reuses IMAGE_CARD semantics (references the shared asset store).
 *
 * A masked (stenciled) image bakes source x shape into a NEW asset: `assetId` is the baked result,
 * `sourceAssetId` is the kept original (so a re-mask/reset re-runs on the source), and the mask is named
 * by EITHER `maskId` (a bundled preset shape) OR `stencilId` (a user stencil-LIBRARY entry). At most one of
 * the two is set. All three are absent on an unmasked image, so pre-stencil boards read unchanged.
 *
 * The mask asset itself is owned by the LIBRARY (a `stencils` entry keeps it alive), NOT the image:
 * `stencilId` is a SOFT reference recording re-open intent - deleting the library entry leaves the baked
 * image untouched, and re-mask just opens with nothing pre-selected. So the asset walkers (GC + export)
 * count ONLY `assetId` + `sourceAssetId`; the stencil is never counted or bundled through the image.
 *
 * The styling fields (`frame`..`saturation`) are pure presentation, all optional - absent reads as a bare
 * image (no migration). `frame`/`border` are a rectangular-image dressing (the render hides them for a
 * masked shape); `shadow`/`opacity`/`filter`/`brightness`/`contrast`/`saturation` apply masked or not.
 */
export interface ImageBoardContent {
   kind: 'image';
   assetId: string | null;
   fit: 'cover' | 'contain';
   /** The pre-mask original, kept for re-mask / reset. Absent on an unmasked image. */
   sourceAssetId?: string;
   /** Which preset mask is applied (a bundled shape id). Absent on an unmasked or library-masked image. */
   maskId?: string;
   /** The applied stencil-LIBRARY entry id (a soft reference for re-open). Absent on an unmasked or preset-masked image. */
   stencilId?: string;
   /** Named container preset (a matte/photo-stock dressing). Rectangular images only. Absent = no frame. */
   frame?: ImageFrame;
   /** A custom uniform outline on the container. Rectangular images only. Absent = no border. */
   border?: ImageBorder;
   /** Drop-shadow depth (container box-shadow, or a shape-following drop-shadow when masked). Absent = none. */
   shadow?: ImageShadow;
   /** Image opacity 0..1. Absent = 1 (opaque). */
   opacity?: number;
   /** Named color look. Absent = none. */
   filter?: ImageFilter;
   /** Brightness multiplier (~0.5..1.5). Absent = 1. */
   brightness?: number;
   /** Contrast multiplier (~0.5..1.5). Absent = 1. */
   contrast?: number;
   /** Saturation multiplier (0..2, 0 = grayscale). Absent = 1. */
   saturation?: number;
}

/** An image's named container preset. */
export type ImageFrame = 'polaroid' | 'matte' | 'tape' | 'slide';

/** An image's custom uniform outline. */
export interface ImageBorder {
   color: string;
   width: number;
   radius: number;
}

/** An image's drop-shadow depth. */
export type ImageShadow = 'sm' | 'md' | 'lg';

/** An image's named color look. */
export type ImageFilter = 'grayscale' | 'sepia' | 'noir';

/**
 * A sticky note on the board, in the copy model: a self-contained snapshot of a {@link PostItNote} in
 * `data`, carrying the originating `sourceDrawerItemId` when it came from (or was Save-As'd to) the
 * drawer. Copy-ONLY - a note is its own content, so there is no live-mirror reference variant. This is
 * the copy half of {@link EmbeddedBoardContent}, without inheriting a `reference` mode a note can't honor.
 */
export interface PostItBoardContent {
   kind: 'post-it';
   mode: 'copy';
   sourceDrawerItemId?: string;
   data: PostItNote;
}

/** One journal page: a stable id (so bookmarks reference it, not an index) and its text. */
export interface JournalPage {
   id: string;
   text: string;
}

/** A bookmark on a journal: references a page by id and an optional tab label. */
export interface JournalBookmark {
   id: string;
   pageId: string;
   label?: string;
}

/**
 * A journal on the board, in the copy model: a self-contained snapshot of a {@link Journal} in `data`,
 * carrying the originating `sourceDrawerItemId` when it came from (or was Save-As'd to) the drawer.
 * Copy-ONLY - a journal is its own content, so there is no live-mirror reference variant. This is the
 * copy half of {@link EmbeddedBoardContent}, without inheriting a `reference` mode a journal can't honor.
 */
export interface JournalBoardContent {
   kind: 'journal';
   mode: 'copy';
   sourceDrawerItemId?: string;
   data: Journal;
}

/**
 * A post-it note as a standalone, serializable aggregate - the shape both the drawer item `content`
 * and the board copy's `data` snapshot hold (like one `Card` is shared by sheet, drawer, and board).
 * Distinct from {@link PostItBoardContent}, whose `kind` discriminant is a board-item tag: this carries
 * only the note itself. `color` is optional (absent reads as the default amber).
 */
export interface PostItNote {
   id: string;
   text: string;
   color?: string;
}

/**
 * A journal as a standalone, serializable aggregate - the drawer `content` / board `data` snapshot
 * counterpart to {@link JournalBoardContent} (minus the board-item `kind` tag). Pages carry stable ids;
 * bookmarks reference a page by `pageId`, never by index, so the aggregate stays internally consistent
 * through clone and save-back.
 */
export interface Journal {
   id: string;
   /** A single-line markdown heading for the notebook; empty when unnamed. Rides the aggregate through clone/save-back/export. */
   title: string;
   pages: JournalPage[];
   bookmarks: JournalBookmark[];
}

/**
 * A Note as a standalone, serializable aggregate: a single FLAT markdown document (title + one
 * continuous `body`), distinct from a {@link Journal}'s paged, bookmarked notebook - the flatness IS
 * the firewall between the two. The body carries inline `{brace}` mentions and (from a later phase)
 * `![](asset:<hash>)` image references, all inside the one string. It is the shape held by the drawer
 * item `content`, the board copy's `data`, and the tab-backed Note store alike (one aggregate, three
 * homes), the way one `Journal`/`Card` is shared across surfaces.
 */
/**
 * A note-level COVER image, rendered top-left with the opening text wrapping beside it (Reading) / inset
 * beside it (Live). Distinct from the body's inline `asset:` images - it is a note property, NOT a body
 * token - but its `hash` is collected by the SAME shared asset walker (see `collectFromNote`) so export
 * bundles it and the GC never reclaims it. The cover is a fixed box the image fills via `object-fit: cover`
 * (fills + crops, keeps its own ratio), so `width`/`aspect` describe the BOX, not the image.
 */
export interface NoteCover {
   /** The sha-256 hash of the stored cover asset. */
   hash: string;
   /** Box width as a percent of the prose measure (the 68ch column). */
   width: number;
   /** Box aspect ratio = height / width; the image fills the box and crops. Defaults to the image's natural ratio. */
   aspect: number;
}

export interface Note {
   id: string;
   title: string;
   body: string;
   /** The optional note-level cover image (a fixed box the image fills). Absent when the note has no cover. */
   cover?: NoteCover;
}

/**
 * A Note on the board, in the reference-vs-copy model (mirrors {@link CharacterBoardContent} and
 * {@link EmbeddedBoardContent}). A `reference` is a LIVE, read-only mirror of a saved note, keyed by
 * `noteId` (the open-tab lookup): the open-tab instance when the note is open, so unsaved edits show,
 * else the saved drawer entry (`sourceDrawerItemId`) - editing is the note tab's job. A drop always
 * produces a reference. A `copy` is a frozen, self-contained snapshot in `data` - the convert-to-copy
 * result (a later phase). `lastKnown` caches a reference's last successful read so a dangling tile
 * (source deleted) can still show its title.
 */
export type NoteBoardContent =
   | { kind: 'note'; mode: 'reference'; noteId: string; sourceDrawerItemId?: string; lastKnown?: Note }
   | { kind: 'note'; mode: 'copy'; sourceDrawerItemId?: string; data: Note };

/**
 * An embedded character card or tracker, in the reference-vs-copy model. A `copy` is a
 * self-contained snapshot in `data`; a `reference` is a
 * live, read-only mirror of a drawer item (rendered from the drawer on each read).
 *
 * Both carry the originating `sourceDrawerItemId` so an item can be toggled either way:
 * a copy can become a reference (needs a source), and a reference can detach to a copy.
 * The optional `lastKnown` caches a reference's last successful read so it can still
 * convert-to-copy once the source is gone (dangling). `data`/`lastKnown` are loosely
 * typed - they hold a serialized card/tracker aggregate.
 */
export type EmbeddedBoardContent<K extends 'card' | 'tracker'> =
   | { kind: K; mode: 'copy'; sourceDrawerItemId?: string; data: unknown }
   | { kind: K; mode: 'reference'; sourceDrawerItemId: string; lastKnown?: unknown };

export type CardBoardContent = EmbeddedBoardContent<'card'>;
export type TrackerBoardContent = EmbeddedBoardContent<'tracker'>;

/**
 * A live, read-only mirror of a character (`FULL_CHARACTER_SHEET`). Reference-only - editing is the
 * character tab's job - so there is no copy variant. `characterId` is the primary key (tabs are keyed
 * by it): when the character is open in a tab the element shows that LIVE instance, so unsaved edits
 * show - this works for a saved AND an unsaved character. When it is closed it falls back to the saved
 * drawer entry (`sourceDrawerItemId`), which is OPTIONAL: an unsaved character has none, so a closed
 * one with no source reads as "removed without being saved". `lastKnown` caches the last successful
 * read so a dangling element (closed + source deleted) can still show its name.
 */
export interface CharacterBoardContent {
   kind: 'character';
   /** The referenced character's id, keying the open-tab lookup for the live-or-saved choice. Always set. */
   characterId: string;
   /** The saved drawer item's id, when the character is saved; absent for an unsaved (tab-only) character. */
   sourceDrawerItemId?: string;
   lastKnown?: unknown;
}

/** A small corkboard pin: a freestanding dot, mainly an anchor to connect lines to/from. */
export interface PinBoardContent {
   kind: 'pin';
   /** Dot color (hex). */
   color: string;
}

// The dice-tray data shapes now live in the board-agnostic dice home (a second consumer is coming);
// re-exported here so existing `@/lib/types/board` importers keep working.
export type { DieSides, DiceTrayDie, DiceTrayModifier } from '@/lib/dice/diceTrayTypes';

/**
 * The board's dice tray: the board-agnostic {@link DiceTrayContent} (dice / modifiers / title / cached
 * lastRoll) plus the board item `kind` tag. The CONFIG is undoable; the `lastRoll` is the CACHED last
 * result, written via the non-undoable cache path so it survives reload + save/export without ever
 * landing on the undo stack or spamming the board with commands. The board adds nothing beyond the tray.
 */
export type DiceTrayBoardContent = DiceTrayContent & { kind: 'dice-tray' };

/**
 * A roll table on the board: the game-agnostic {@link RollTableContent} (title / weighted entries / cached
 * lastRoll / history) plus the board item `kind` tag. The entries + title are undoable; the settled roll
 * rides the non-undoable cache path (like the dice tray) so it never lands on the undo stack.
 */
export type RollTableBoardContent = RollTableContent & { kind: 'roll-table' };

/**
 * A labeled, resizable background frame that groups items (a Figma-style zone). Renders BEHIND
 * its members; its rectangle is the item's x/y/w/h. Membership + move-with-contents + collapse
 * are later prompts - this is the frame. `color` is an optional hex tint (default a subtle theme
 * tint); `collapsed` is reserved for the later collapse toggle.
 */
export interface ZoneBoardContent {
   kind: 'zone';
   label?: string;
   color?: string;
   collapsed: boolean;
}

/** A connection's line dash pattern. Optional on the style - absent reads as `solid` (back-compat). */
export type ConnectionDash = 'solid' | 'dashed' | 'dotted';

/**
 * How a connection routes between its two endpoints: a straight segment, a right-angle double-elbow,
 * an auto arc, or an editable cubic curve. Optional on the style - absent reads as `straight`
 * (pre-2.3.0 boards), backfilled to `straight` on load.
 */
export type ConnectionPathType = 'straight' | 'orthogonal' | 'circle' | 'bezier';

/**
 * A bezier connection's two control points, stored as OFFSETS from their endpoints (`c1` from `from`,
 * `c2` from `to`), so moving or resizing an endpoint carries its handle along and the curve keeps its
 * shape. Absent means the auto placement is used. Only meaningful for `pathType: 'bezier'`.
 */
export interface ConnectionControls {
   c1: { x: number; y: number };
   c2: { x: number; y: number };
}

/**
 * A marker drawn on a connection at one of its positions: `full` is a filled triangle arrowhead,
 * `chevron` an open "V". `direction` points the marker along the line - `forward` toward `to`,
 * `backward` toward `from` - at whichever position it sits.
 */
export interface ConnectionMarker {
   type: 'full' | 'chevron';
   direction: 'forward' | 'backward';
}

/** Where a marker sits on a connection: at its `from` end, its on-path midpoint, or its `to` end. */
export type ConnectionMarkerPosition = 'start' | 'middle' | 'end';

/** The label chip's font size; absent reads as `md`. */
export type ConnectionLabelSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

/** The connection's positional markers: at most one per position, any mix. Absent positions draw nothing. */
export interface ConnectionMarkers {
   start?: ConnectionMarker;
   middle?: ConnectionMarker;
   end?: ConnectionMarker;
}

/**
 * A connection's visual style: stroke width + color, plus optional dash, path routing, positional
 * markers, and a short label. `markers` places a marker at start / middle / end (pre-positional data
 * carried a single center `arrow`, migrated to `markers.middle` on load). `label` is optional text
 * shown as a chip at the on-path midpoint; it rides the style bag through `onUpdateStyle` - absent
 * or '' means no chip.
 */
export interface ConnectionStyle {
   width: number;
   color: string;
   dash?: ConnectionDash;
   /** Positional markers (start / middle / end); absent means no markers. */
   markers?: ConnectionMarkers;
   /** Optional midpoint label chip; absent or '' means none. */
   label?: string;
   /** Label font size; absent reads as `md`. Ignored without a `label`. */
   labelSize?: ConnectionLabelSize;
   /** Label text color (hex); absent uses the default foreground. Ignored without a `label`. */
   labelColor?: string;
   /** Routing mode; absent reads as `straight`. */
   pathType?: ConnectionPathType;
   /** Bezier control-point offsets; absent uses the auto placement. */
   controls?: ConnectionControls;
}

/** A user-styled line between two board items (endpoints are board-item ids). */
export interface ConnectionBoardContent {
   kind: 'connection';
   from: string;
   to: string;
   style: ConnectionStyle;
}

/**
 * Stub for the Mist Engine Threat construct. Deliberately unmodelled here: it has
 * real game structure and gets its own research pass.
 * Kept in the union only so the kind is representable.
 */
export interface ThreatBoardContent {
   kind: 'threat';
   // TODO: model the Threat's name / tags / might / consequences here.
}

/**
 * A portal's destination, discriminated by the id kind it addresses. Three id spaces:
 * `entity` carries the aggregate's OWN id (note/board/character - preserved across export/import);
 * `element` carries a DRAWER ITEM id (rewired on import); `board-element` carries a BOARD ITEM id
 * (intra-aggregate, reId-remapped, modeled now but only surfaced/activated in the same-board phase);
 * `external` carries a URL. Structured, never a `cotm://` string - a portal is board data, not markdown.
 */
export type PortalTarget =
   | { kind: 'entity'; entity: 'note' | 'board' | 'character'; id: string }
   | { kind: 'element'; drawerItemId: string }
   | { kind: 'board-element'; boardItemId: string }
   | { kind: 'external'; href: string };

/**
 * A portal's leading visual: a lucide icon NAME, or a content-hash into the shared asset store. An image
 * carries a layout `mode`: `poster` (full-bleed, the label on a bottom scrim) or `composed` (a thumbnail
 * laid out beside the label, like icon+text). The mode makes poster-vs-composed unrepresentable-when-wrong.
 * `size` (0-1) is the composed thumbnail's fill fraction of the box (poster ignores it - it always fills);
 * `background` (composed only) toggles the plate behind the thumbnail (off = the bare image, its transparency
 * showing the portal/board through). `aspect` is the cropped image's width/height (landscape > 1): the poster
 * shapes its whole box to it (the full crop shows, resize is aspect-locked) and the composed thumbnail wears
 * it instead of a forced square.
 */
export type PortalVisual =
   | { kind: 'icon'; icon: string }
   | { kind: 'image'; assetId: string; mode: 'poster' | 'composed'; size: number; background: boolean; aspect: number };

/** Where the LABEL sits relative to the visual, for the composed visual+text styles (icon+text, image+text). */
export type PortalAlign = 'top' | 'bottom' | 'left' | 'right';

/**
 * A portal's presentation. `visual` is required-but-nullable (null = text-only; the discriminant is always
 * present) and `label` is a required string ('' = no caption, e.g. icon-only) - so the five styles are the
 * only representable combos, never both-set or neither-set. `align` positions the label for the two composed
 * visual+text styles (icon+text, image+text composed); the poster and the text-only / icon-only faces ignore it.
 * `background` toggles the whole element's card face: true = the button-like card fill + border + hover-lift;
 * false = fully transparent (the bare visual/label float on the board, selection ring only).
 */
export interface PortalStyle {
   visual: PortalVisual | null;
   label: string;
   align: PortalAlign;
   background: boolean;
}

/**
 * A portal on the board: a source-less NAVIGATOR that OPENS its target (never renders its live content
 * inline - that is note-embed/character-on-board). Holds a structured target + a style, not a mirrored
 * aggregate; `lastKnownName` caches the target's display name for an empty-label dead portal only.
 */
export interface PortalBoardContent {
   kind: 'portal';
   target: PortalTarget;
   style: PortalStyle;
   lastKnownName?: string;
}

/**
 * The font-family tokens a raw text element can carry. `sans`/`serif`/`mono` map to generic CSS STACKS
 * (no bundled file, no precache cost); the display tokens (`handwriting`/`marker`/`rounded`) map to
 * self-hosted woff2 faces (see `TEXT_FONT_STACKS` in `src/lib/board/textStyle.ts` and the `@font-face`
 * block in `global.css`). A free family string is deliberately not representable: it would name a font
 * the offline app may not have, breaking the render.
 */
export type TextFontFamily = 'sans' | 'serif' | 'mono' | 'handwriting' | 'marker' | 'rounded';

/**
 * A raw text element's typography. `color` is required-but-nullable: null means the adaptive default
 * (`currentColor`, so the text stays legible on any theme), frozen to a user hex only once picked -
 * a baked hex default would vanish against a matching theme. `size` is world px (the text lives inside
 * the zoomed world layer, so it scales with the board).
 */
export interface TextStyle {
   color: string | null;
   fontFamily: TextFontFamily;
   size: number;
   weight: 'normal' | 'bold';
   italic: boolean;
   underline: boolean;
   align: 'left' | 'center' | 'right';
}

/**
 * A bare, directly-editable text element on the board - NOT a post-it (no card/paper chrome): plain text
 * painted straight on the canvas with a per-element {@link TextStyle}, its box auto-hugging the rendered
 * text. Board-only furniture: it is never a drawer entity, so its `content` is opaque inline (no record
 * or schema change). PLAIN text - no markdown, no `{brace}` mentions.
 */
export interface TextBoardContent {
   kind: 'text';
   text: string;
   style: TextStyle;
}

/** A stroke's brush family: pen (thin, constant), brush (variable-width nib), highlighter (broad, translucent). */
export type BrushKind = 'pen' | 'brush' | 'highlighter';

/**
 * The active pointer tool on the board. `select` is the default (a click-through overlay); every other
 * value is a Draw gesture that owns the pointer. Ephemeral UI state, never persisted. `shape` draws a
 * bounding-box ellipse/rect (circle/square when constrained). `transform` selects and moves the strokes of
 * one drawing layer (it appends nothing, so it stays out of {@link isAppendTool}).
 */
export type ActiveTool = 'select' | 'freehand' | 'line' | 'freeformPolygon' | 'regularPolygon' | 'shape' | 'eraser' | 'transform';

/**
 * One freehand stroke on a drawing layer. `points` is a flat `[x0,y0,x1,y1,...]` list in LAYER-LOCAL
 * coords (relative to the layer item's `x`/`y` origin), so a layer move stays a pure translate and a
 * stroke append never touches the box. `color` is required-but-nullable: null is the adaptive default
 * (the theme foreground, legible on any board), frozen to a user hex only once picked. `width` is world
 * px, so ink scales with the board. `brush` is the stroke family (its width/opacity are baked in at
 * creation). `pressure` is a reserved per-point channel, dormant while width is constant. `shape` marks a
 * geometric stroke rendered crisp (no smoothing): absent = freehand, `line` = a straight segment,
 * `polygon` = a closed N-gon (the closing edge is implied), `ellipse`/`rect` = a bounding-box shape from
 * two drag corners (`points = [ax,ay,bx,by]`, normalized at paint). `filled` fills a closed shape's
 * interior with the ink; absent = outline only. Shapes still inherit the brush.
 */
export interface Stroke {
   id: string;
   brush: BrushKind;
   color: string | null;
   width: number;
   points: number[];
   pressure?: number[];
   shape?: 'line' | 'polygon' | 'ellipse' | 'rect';
   filled?: boolean;
}

/**
 * A drawing LAYER: one board item holding all the strokes drawn on it, bbox-positioned + z'd like any
 * item (so it moves/deletes/reorders verbatim and interleaves with other items by z). Board-only
 * furniture - never a drawer entity - so its `content` is opaque inline (no record or schema change).
 * The strokes' smoothed path is derived at paint, never stored.
 */
export interface DrawingBoardContent {
   kind: 'drawing';
   strokes: Stroke[];
   /**
    * A stable, per-board numeric ordinal assigned at mint (from {@link Board.nextLayerSeq}), driving the
    * layer's default "Layer N" name. Stored as a number, never the localized string, so the default stays
    * language-adaptive; ignored once the user sets an explicit {@link BoardItem.label}. Absent on drawings
    * minted before layer naming existed.
    */
   seq?: number;
}

/** A board item's payload, discriminated by `kind` (mirrors the item's own `kind`). */
export type BoardItemContent =
   | ImageBoardContent
   | PostItBoardContent
   | JournalBoardContent
   | NoteBoardContent
   | CardBoardContent
   | TrackerBoardContent
   | ConnectionBoardContent
   | ThreatBoardContent
   | PinBoardContent
   | DiceTrayBoardContent
   | RollTableBoardContent
   | ZoneBoardContent
   | CharacterBoardContent
   | PortalBoardContent
   | TextBoardContent
   | DrawingBoardContent;

/**
 * An assembled board item: world-space placement plus its kind-discriminated content.
 *
 * Connections ignore the placement fields (`x`/`y`/`width`/`height`/`rotation`) -
 * their geometry derives from their endpoints - so those are stored as zeros for a
 * `connection` item.
 */
export interface BoardItem {
   id: string;
   kind: BoardItemKind;
   x: number;
   y: number;
   width: number;
   height: number;
   z: number;
   rotation?: number;
   /** The zone this item is a member of (set when it lands inside one), or absent when in no zone. */
   zoneId?: string;
   /**
    * A user-facing display name, presentational and NON-UNIQUE - never an identifier (identity stays `id`).
    * Absent by default: the layers panel shows a kind-derived name (a drawing's "Layer N", else the kind noun)
    * when unset, and materializes a literal string only on rename.
    */
   label?: string;
   content: BoardItemContent;
}

/** An assembled board: its metadata, persisted viewport, and z-ordered items. */
export interface Board {
   id: string;
   name: string;
   viewport: Viewport;
   /** The drawer `FULL_BOARD` item this board is saved to, or null/absent when unsaved (mirrors `character.drawerItemId`). */
   drawerItemId?: string | null;
   /** Background grid style. Absent on boards created before grids existed - defaulted on read. */
   grid?: BoardGrid;
   /** Surface backdrop (fill + texture) painted behind the grid. Absent means the plain theme canvas. */
   background?: BoardBackground;
   /**
    * A monotonic counter sourcing each drawing layer's default-name ordinal ({@link DrawingBoardContent.seq}),
    * incremented at every drawing mint. Monotonic-never-reused, so deleting a layer never lets a later one
    * reclaim its number. Set at creation and carried through fork/import.
    */
   nextLayerSeq: number;
   items: BoardItem[];
}
