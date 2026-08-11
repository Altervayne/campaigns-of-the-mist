// -- React Imports --
import { memo, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { screenDeltaToWorld } from '@/lib/board/boardCoordinates';
import { MIN_ITEM_SIZE, computeResize, effectiveHeight, fitContentHeight, fitContentWidth, shouldSyncMeasuredHeight, shouldSyncMeasuredSize } from '@/lib/board/boardResize';
import { COLLAPSED_BAR_HEIGHT, COLLAPSED_BAR_WIDTH } from '@/lib/board/zoneCollapse';
import { EXPANDED_CARD_SIZE } from '@/lib/board/embedDrawerItem';
import { isExpandedCardItem } from '@/lib/board/expandedCardItem';
import { ZONE_TITLE_BAR_HEIGHT } from './items/ZoneItem';

// -- Component Imports --
import { BoardItemBody } from './items/BoardItemBody';
import { BoardItemToolbar } from './BoardItemToolbar';

// -- Type Imports --
import type { BoardItem, BoardItemContent, BoardItemKind } from '@/lib/types/board';
import type { ResizePatch } from '@/lib/board/boardCommands';

/*
 * The chrome for one board item: the positioned box, the selection ring, a single
 * bottom-right resize grip, and the floating action toolbar. The body is delegated to
 * {@link BoardItemBody} and is purely content - move is the toolbar's grip, NOT a body
 * drag, so clicking into a post-it/journal edits text without a move stealing the pointer.
 *
 * Move and resize use plain pointer math (NOT dnd-kit, which is reserved for the
 * cross-surface drawer->board drop). The gesture is tracked in LOCAL state and rendered
 * live; exactly one command is dispatched on pointer-up, so one drag = one undo step.
 * Screen deltas divide by zoom so the box tracks the cursor at any zoom.
 */

/** Resize-grip hit size in screen px (counter-scaled by zoom so it stays constant on screen). */
const HANDLE_SCREEN_SIZE = 14;

/** Selection-outline thickness in screen px (counter-scaled by zoom, like the grip, so it never thins out at low zoom). */
const RING_SCREEN_PX = 2;

/**
 * Kinds whose content height is the MINIMUM height (no internal scroll): the box measures its
 * content as a floor - it can be dragged taller (2D resize) but never shorter than the content,
 * and auto-grows when the content exceeds the current height. (Reusable by future form-like kinds.)
 */
const MIN_HEIGHT_KINDS = new Set<BoardItemKind>(['dice-tray', 'roll-table']);
const isMinHeight = (kind: BoardItemKind): boolean => MIN_HEIGHT_KINDS.has(kind);

/**
 * Kinds whose height FITS their content exactly - it grows AND shrinks to hug the measured content
 * (no manual resize; these are bare embeds). The character element tracks its theme rows so removing
 * a card shortens it, unlike the grow-only min-height floor.
 */
const FIT_CONTENT_KINDS = new Set<BoardItemKind>(['character']);
const isFitContent = (kind: BoardItemKind): boolean => FIT_CONTENT_KINDS.has(kind);

/**
 * Kinds whose WIDTH fits their content exactly - grows AND shrinks to hug the measured width (no
 * manual resize). A board card has no width grip; its width is purely content-driven (one face in
 * flip, two side by side), so it width-fits while its height stays static (the card is a fixed h-150).
 */
const FIT_WIDTH_KINDS = new Set<BoardItemKind>(['card']);
const isFitWidth = (kind: BoardItemKind): boolean => FIT_WIDTH_KINDS.has(kind);

/**
 * Kinds whose box fits its content on BOTH axes - it grows AND shrinks to hug the measured text (no
 * manual resize). A bare text element auto-hugs as you type; scoped to text for now (drawing/portals may
 * share it later - don't generalize prematurely).
 */
const FIT_BOTH_KINDS = new Set<BoardItemKind>(['text']);
const isFitBoth = (kind: BoardItemKind): boolean => FIT_BOTH_KINDS.has(kind);

/** Any of these behaviours measures content into the box; only the synced axis + rule differ. */
const measuresContent = (kind: BoardItemKind): boolean => isMinHeight(kind) || isFitContent(kind) || isFitWidth(kind) || isFitBoth(kind);

interface BoardItemBoxProps {
   item: BoardItem;
   /** In the selection set (draws the ring). */
   isSelected: boolean;
   /** The ONLY selected item: shows the per-item toolbar + resize grip (suppressed in a multi-selection). */
   soleSelected: boolean;
   /** In its text-edit sub-state (post-it / journal / text only): the body mounts the focused editor. */
   isEditing: boolean;
   /** World-px to push the toolbar down so it clears the clip's top edge (a tall item off the top); 0/undefined = no clamp. */
   toolbarClamp?: number;
   /** World-px to slide the toolbar sideways so it clears the clip's left/right edge; 0/undefined = no clamp. */
   toolbarClampX?: number;
   /** Measures the toolbar for those clamps; the canvas owns the arithmetic. */
   toolbarMeasureRef: (node: HTMLDivElement | null) => void;
   /** A zone's member count, for its collapsed-bar badge (undefined for non-zones). */
   memberCount?: number;
   /** Current zoom, so screen deltas convert to world deltas and chrome stays screen-constant. */
   zoom: number;
   /** Live world offset during an active group move (null when idle); renders the box at the offset. */
   moveDelta: { x: number; y: number } | null;
   /** A canvas gesture (pan / marquee / move) is live, so the hover ring stays suppressed. */
   interacting: boolean;
   /** Selects this item; `additive` (Shift/Ctrl) toggles it in/out of the set instead of replacing. */
   onSelect: (id: string, additive: boolean) => void;
   /** A non-text item's body press: the canvas owns the deferred move / marquee / select decision. */
   onItemPointerDown: (id: string, event: ReactPointerEvent) => void;
   /** A double-click's deep action (challenge card expand); a no-op for kinds without one. */
   onDeepAction: (id: string) => void;
   /** Pointer-down on the move grip; the canvas owns the (group-aware) move gesture. */
   onMoveStart: (id: string, event: ReactPointerEvent) => void;
   onResize: (id: string, patch: ResizePatch) => void;
   /** Non-undoable size write for the auto-height follow (measured content height). */
   onSyncSize: (id: string, size: { width?: number; height?: number }) => void;
   onUpdateContent: (id: string, content: BoardItemContent) => void;
   /** Direct (non-undoable) cache write for a reference item's last-known snapshot. */
   onCacheLastKnown: (id: string, content: BoardItemContent) => void;
   /** Direct (non-undoable) adopt of a Save-As drawer id onto a copy item's source link. */
   onAdoptSource: (id: string, sourceDrawerItemId: string) => void;
   onBringToFront: (id: string) => void;
   onSendToBack: (id: string) => void;
   onDelete: (id: string) => void;
   /** Starts a connect drag from this item's connect handle (not a move). */
   onConnectStart: (id: string, event: ReactPointerEvent) => void;
   /** Opens the portal restyle editor window, anchored at the click point (a portal's Edit affordance). */
   onRequestEditPortal: (itemId: string, screen: { x: number; y: number }) => void;
   /** Opens the target picker in retarget mode (a dead portal's Relink), anchored at the click point. */
   onRequestRelinkPortal: (itemId: string, screen: { x: number; y: number }) => void;
   /** Caches a portal's live-resolved target name into `lastKnownName` (a direct, non-undoable write). */
   onCachePortalName: (itemId: string, name: string) => void;
   /** Lower bound for the resize (a zone passes its member extent); each axis defaults to MIN_ITEM_SIZE. */
   resizeMin?: { width: number; height: number };
   /** Stacking band for this box: selection raises it via z-index, NOT a DOM re-order (no remount). */
   zIndex?: number;
}

/** A live drag rect during a move/resize gesture (world coords); `null` when idle. */
interface DragRect {
   x: number;
   y: number;
   width: number;
   height: number;
}

/*
 * Memoized: BoardView re-renders on every viewport change (it subscribes to `viewport`), so without this
 * a pan would re-render EVERY box (and re-run each embed's store selector). On a pan the props are all
 * shallow-stable - `zoom` is the same number (only a ZOOM changes it, and then every box SHOULD re-render
 * to rescale its grip), the callbacks are `useCallback`/store-stable, and `item`/`isSelected`/`zIndex` are
 * unchanged - so the default shallow compare skips the whole set. A move/resize/select/zoom still flows
 * through (those props do change). Zones alone re-render on pan (their `resizeMin` is a fresh object), but
 * they are few.
 */
export const BoardItemBox = memo(function BoardItemBox({
   item,
   isSelected,
   soleSelected,
   isEditing,
   toolbarClamp,
   toolbarClampX,
   toolbarMeasureRef,
   memberCount,
   zoom,
   moveDelta,
   interacting,
   onSelect,
   onItemPointerDown,
   onDeepAction,
   onMoveStart,
   onResize,
   onSyncSize,
   onUpdateContent,
   onCacheLastKnown,
   onAdoptSource,
   onBringToFront,
   onSendToBack,
   onDelete,
   onConnectStart,
   onRequestEditPortal,
   onRequestRelinkPortal,
   onCachePortalName,
   resizeMin,
   zIndex,
}: BoardItemBoxProps) {
   // Live resize rect (full rect during a resize); the commit reads from the ref so it
   // never depends on a stale closure. The group move offset is owned by the canvas and
   // arrives as `moveDelta`.
   const [resizeRect, setResizeRect] = useState<DragRect | null>(null);
   const resizeStart = useRef<{ x: number; y: number; orig: DragRect; rect: DragRect } | null>(null);

   // The toolbar's per-kind slot, state-backed so the body re-renders to portal into it
   // once it mounts (and portals nothing while the item is unselected and the bar is gone).
   const [toolbarSlot, setToolbarSlot] = useState<HTMLDivElement | null>(null);
   // A non-clipped slot anchored to the box's right edge (outside the body's overflow-hidden),
   // for chrome that must protrude past the box - the journal's bookmark tabs. Always present
   // (tabs show when unselected too); state-backed like the toolbar slot.
   const [sideSlot, setSideSlot] = useState<HTMLDivElement | null>(null);

   // Pointer hover over the box body, driving the faint "you can drag me" ring. Local (one item hovers at
   // a time); the ring is gated off while a canvas gesture runs (`interacting`) and for text kinds.
   const [hovered, setHovered] = useState(false);

   // An expanded challenge card is a FIXED landscape sheet, not the portrait fit-width card: it opts
   // out of every content-measure so the box uses the exact expanded footprint (see below), bypassing
   // the ResizeObserver that hugs the card's own width.
   const isExpandedCard = isExpandedCardItem(item);
   const minHeight = isMinHeight(item.kind);
   const fitContent = isFitContent(item.kind);
   const fitWidth = isFitWidth(item.kind) && !isExpandedCard;
   const fitBoth = isFitBoth(item.kind);
   const measures = measuresContent(item.kind) && !isExpandedCard;
   // A measured kind drives one axis from its content. HEIGHT kinds: the wrapper fills the body and
   // grows with content (min-h-full); the natural height is its height MINUS any flexible fill spacer
   // (a kind that pins a footer marks the spacer with data-board-fill-spacer, so the slack lives in the
   // spacer, not below the content). A MIN-HEIGHT kind treats the measure as a floor (drag taller, never
   // shorter than content); a FIT-CONTENT kind tracks it exactly (grow and shrink). A FIT-WIDTH kind
   // (a card) instead hugs its natural WIDTH - one face in flip, two side by side - its height static.
   // offsetWidth/offsetHeight are layout px = world units regardless of the world-layer scale. All write
   // back via the non-undoable sync, guarded by the epsilon so the observer settles instead of looping.
   const measureRef = useRef<HTMLDivElement | null>(null);
   const [contentHeight, setContentHeight] = useState(0);
   const [contentWidth, setContentWidth] = useState(0);
   useEffect(() => {
      if (!measures) return;
      const el = measureRef.current;
      if (!el) return;
      // The observer fires on observe(), so the first measure runs without a synchronous setState
      // in the effect body. The spacer is observed too: when content grows inside an already-tall
      // box the wrapper's own size doesn't change, but the spacer shrinks - that must re-measure.
      const measure = () => {
         // A width-fitting kind measures off a w-fit wrapper, so offsetWidth reads the true content width
         // (a card's 1-/2-face width, a text element's widest line). A fit-WIDTH card stops there (static
         // height); a fit-BOTH text element measures its height too.
         if (fitWidth || fitBoth) {
            const measuredWidth = Math.round(el.offsetWidth);
            if (measuredWidth > 0) {
               setContentWidth(measuredWidth);
               if (shouldSyncMeasuredSize('fit', measuredWidth, item.width)) {
                  onSyncSize(item.id, { width: measuredWidth });
               }
            }
            if (fitWidth) return;
         }
         const spacer = el.querySelector<HTMLElement>('[data-board-fill-spacer]');
         const measured = Math.round(el.offsetHeight - (spacer?.offsetHeight ?? 0));
         if (measured <= 0) return;
         setContentHeight(measured);
         if (shouldSyncMeasuredHeight(fitContent || fitBoth ? 'fit' : 'min', measured, item.height)) {
            onSyncSize(item.id, { height: measured });
         }
      };
      const observer = new ResizeObserver(measure);
      observer.observe(el);
      const spacer = el.querySelector('[data-board-fill-spacer]');
      if (spacer) observer.observe(spacer);
      return () => observer.disconnect();
   }, [measures, fitContent, fitWidth, fitBoth, item.id, item.height, item.width, onSyncSize]);

   // The rect to render: a live resize wins, else the base rect plus any active group-move offset.
   const rect: DragRect = resizeRect ?? {
      x: item.x + (moveDelta?.x ?? 0),
      y: item.y + (moveDelta?.y ?? 0),
      width: item.width,
      height: item.height,
   };

   // ==================
   //  Body press (move / select / enter-editing, deferred to the canvas)
   // ==================

   // Every kind routes its body press to the canvas, which defers it into a move / marquee / select by drag
   // distance. A text kind's plain click also promotes it to editing; while it IS editing, its own field
   // overlays the body and stops the pointer, so this handler only fires on the non-editing (rendered) view.
   const handleBodyPointerDown = (event: ReactPointerEvent) => {
      if (event.button !== 0) return; // right-click selection + menu is handled by the canvas
      event.stopPropagation(); // don't start a background marquee / pan
      onItemPointerDown(item.id, event);
   };

   // ==================
   //  Resize (single bottom-right grip)
   // ==================

   const handleResizePointerDown = (event: ReactPointerEvent) => {
      if (event.button !== 0) return; // right-click is for the radial menu, not a resize
      event.stopPropagation();
      onSelect(item.id, false);
      const orig = { x: item.x, y: item.y, width: item.width, height: item.height };
      resizeStart.current = { x: event.clientX, y: event.clientY, orig, rect: orig };
      setResizeRect(orig);
      event.currentTarget.setPointerCapture(event.pointerId);
   };

   const handleResizePointerMove = (event: ReactPointerEvent) => {
      const start = resizeStart.current;
      if (!start) return;
      const delta = screenDeltaToWorld(event.clientX - start.x, event.clientY - start.y, zoom);
      // 2D resize; a min-height item floors its height at the live content height, and a zone floors
      // both axes at `resizeMin` (its member extent), so neither can be dragged smaller than it holds.
      // An image portal poster locks to its crop aspect so it keeps its shape (the full image always shows).
      const posterAspect = item.content.kind === 'portal' && item.content.style.visual?.kind === 'image' && item.content.style.visual.mode === 'poster'
         ? item.content.style.visual.aspect
         : undefined;
      const next = computeResize(start.orig, delta, {
         width: resizeMin?.width ?? MIN_ITEM_SIZE,
         height: minHeight ? Math.max(MIN_ITEM_SIZE, contentHeight) : resizeMin?.height ?? MIN_ITEM_SIZE,
      }, posterAspect);
      start.rect = next;
      setResizeRect(next);
   };

   const handleResizePointerUp = (event: ReactPointerEvent) => {
      const start = resizeStart.current;
      resizeStart.current = null;
      // Commit (and clear the live rect) before releasing capture, so the resize can't be lost
      // if the release throws. Bottom-right only grows the size; x/y never move. The dragged
      // height is the user's (undoable) choice; a min-height item's move already floored it.
      if (start) onResize(item.id, { width: start.rect.width, height: start.rect.height });
      setResizeRect(null);
      event.currentTarget.releasePointerCapture(event.pointerId);
   };

   // ==================
   //  Render
   // ==================

   const gripSize = HANDLE_SCREEN_SIZE / zoom;
   // The selection outline lives inside the scaled world layer, so a fixed world width would thin to
   // nothing at low zoom; counter-scale it to a constant on-screen weight, same as the grip.
   const outlineWidth = RING_SCREEN_PX / zoom;
   // A pin is a round, fixed-size dot: borderless container, circular ring, no resize grip.
   const isPin = item.kind === 'pin';
   // A card/tracker embed, a character reference, a note tile, and a portal ARE their own panels: each
   // carries its own border, background, and shape, so the box adds no chrome (no second border/shadow) -
   // just a selection ring, and it never clips (the panel owns its own rounding + overflow). A portal owns
   // its button surface + hover/dead states. A bare text element joins this set as the extreme case: NO
   // panel at all - just styled text on the canvas, the box contributing only a selection ring. A drawing
   // layer is the same - only its strokes paint (which freely overflow the loose box), no chrome.
   const isEmbed = item.kind === 'card' || item.kind === 'tracker' || item.kind === 'character' || item.kind === 'note' || item.kind === 'portal' || item.kind === 'text' || item.kind === 'drawing';
   // A note tile is a WINDOWED embed: unlike the fixed card/tracker/character panels it is freely
   // 2D-resizable (internal scroll), so it keeps the resize grip the other embeds drop. A portal is
   // resizable in every style too (owner override of the auto-hug): its glyph + type scale with the box.
   const isResizableEmbed = item.kind === 'note' || item.kind === 'portal';
   // A zone is a background frame: its tinted rectangle paints inline at the box's band floor (behind its
   // own members, which the flatten bands right above it), and the box here renders the on-top header +
   // chrome - click-through everywhere else so the items sitting inside it stay interactive. Selecting the
   // empty interior is the tinted frame's job.
   const isZone = item.kind === 'zone';
   const zoneColor = item.content.kind === 'zone' ? item.content.color : undefined;
   // A collapsed zone paints as a compact bar at its origin (frame hidden, members hidden, resize
   // off); its stored width/height are preserved for when it expands.
   const isCollapsedZone = isZone && item.content.kind === 'zone' && item.content.collapsed;
   // The faint drag hint: a soft ring on a hovered, unselected, body-draggable item (the cursor no longer
   // signals it). A zone's body is click-through (it never body-drags), so it alone opts out.
   const showHoverRing = hovered && !isSelected && !interacting && !isZone;
   // A fit-content item renders at its content height exactly; a min-height item never renders below
   // its content (the floor); other kinds use their rect.
   const renderHeight = fitContent || fitBoth
      ? fitContentHeight(rect.height, contentHeight)
      : minHeight
         ? effectiveHeight(rect.height, contentHeight)
         : rect.height;
   // A fit-width card renders at its measured content width exactly (its single/double-face footprint);
   // every other kind keeps its rect width. The synced width feeds the rect-based board systems too.
   // An expanded challenge card renders at the fixed landscape footprint on BOTH axes (its stored
   // portrait width/height are preserved for when it collapses back to a card).
   const boxWidth = isCollapsedZone ? COLLAPSED_BAR_WIDTH : isExpandedCard ? EXPANDED_CARD_SIZE.width : fitWidth || fitBoth ? fitContentWidth(rect.width, contentWidth) : rect.width;
   const boxHeight = isCollapsedZone ? COLLAPSED_BAR_HEIGHT : isExpandedCard ? EXPANDED_CARD_SIZE.height : renderHeight;

   const body = (
      <BoardItemBody
         item={item}
         isSelected={isSelected}
         isEditing={isEditing}
         toolbarSlot={toolbarSlot}
         sideSlot={sideSlot}
         memberCount={memberCount}
         onPressStart={handleBodyPointerDown}
         onContentChange={(content) => onUpdateContent(item.id, content)}
         onCacheLastKnown={onCacheLastKnown}
         onAdoptSource={onAdoptSource}
         onDelete={onDelete}
         onRequestSelect={() => onSelect(item.id, false)}
         onRequestEditPortal={onRequestEditPortal}
         onRequestRelinkPortal={onRequestRelinkPortal}
         onCachePortalName={onCachePortalName}
      />
   );

   return (
      <div
         data-board-item-id={item.id}
         className={cn('absolute', isZone && !isCollapsedZone && 'pointer-events-none')}
         style={{
            left: rect.x,
            top: rect.y,
            width: boxWidth,
            height: boxHeight,
            zIndex,
            transform: item.rotation ? `rotate(${item.rotation}deg)` : undefined,
         }}
      >
         {/* A zone's tinted rectangle, filling the box behind the header/chrome (a later sibling paints on
             top). It sits at the zone's band, so its own members - banded above it - render over it, while
             a lower-stacked item renders beneath it. A pointer-down on the interior or border routes through
             the same deferred body press as every other kind (re-enabling clicks the click-through box
             suppresses): a plain drag moves the zone (carrying its members), a click with no drag selects it,
             a modifier toggles/marquees; items on top capture their own clicks first. A collapsed zone hides
             its frame (it's the bar below instead). */}
         {isZone && !isCollapsedZone && (
            <div
               onPointerDown={handleBodyPointerDown}
               className={cn('pointer-events-auto absolute inset-0 cursor-default rounded-lg border', !zoneColor && 'border-border bg-foreground/[0.04]')}
               style={zoneColor ? { backgroundColor: `${zoneColor}1f`, borderColor: zoneColor } : undefined}
            />
         )}

         {/* Non-clipped anchor at the box's right edge, for the journal's bookmark tabs to
             protrude into. Rendered BEFORE the body so the tabs tuck behind the page edge: the
             body (positioned, later sibling) paints over their attach point and the selection
             halo stays unbroken; only the protruding part shows. Zero-size, never grabs clicks. */}
         <div ref={setSideSlot} className="absolute left-full top-0" />

         <div
            onPointerDown={handleBodyPointerDown}
            // A portalled dialog (e.g. the image cropper) is a React descendant of this item, so its
            // events bubble the component tree back here; ignore double-clicks that came from one.
            onDoubleClick={(event) => { if (event.target instanceof Element && event.target.closest('[role="dialog"]')) return; onDeepAction(item.id); }}
            onPointerEnter={() => setHovered(true)}
            onPointerLeave={() => setHovered(false)}
            // A collapsed zone's bar carries the zone's tint (matching the expanded frame) so the
            // color survives collapse; an uncolored zone keeps the neutral card bar. The selection /
            // hover outline width/offset are set here (dynamic, counter-scaled) so they hold on-screen weight.
            style={{
               ...(isCollapsedZone && zoneColor ? { backgroundColor: `${zoneColor}1f`, borderColor: zoneColor } : {}),
               ...(isSelected || showHoverRing ? { outlineWidth, outlineOffset: outlineWidth } : {}),
            }}
            className={cn(
               // A plain arrow: the body cursor is the regular default (the hand is pan-only now), so it
               // shows no misleading grab or finger; the faint hover ring carries the drag affordance instead.
               'relative h-full w-full cursor-default select-none',
               showHoverRing && 'outline outline-primary/30',
               // An embed brings its own rounded border, so the box neither clips (which would
               // double-round and crop the flip's back face) nor draws chrome.
               !isZone && !isEmbed && 'overflow-hidden',
               // A collapsed zone IS a solid, clickable bar (the frame is hidden). An expanded zone's
               // body is click-through - the tinted rect + header carry the visuals - with only the
               // selection ring outlining the rectangle. A pin is a round borderless dot; a card/tracker
               // embed is bare (its own visuals) with just a ring; every other kind is a bordered card.
               isCollapsedZone
                  ? cn(
                       'overflow-hidden rounded-md border shadow-sm',
                       !zoneColor && 'bg-card',
                       isSelected ? 'outline outline-primary' : 'hover:border-primary/50',
                       !zoneColor && (isSelected ? 'border-primary' : 'border-border'),
                    )
                  : isZone
                     ? cn('pointer-events-none rounded-lg', isSelected && 'outline outline-primary')
                     : isPin
                        ? cn('rounded-full', isSelected && 'outline outline-primary')
                        : isEmbed
                           // Match the ring radius to the embed's own corners: a card is rounded-xl; a portal
                           // is rounded-md; a bare text element or drawing layer hugs tight (rounded-sm); a
                           // tracker, character, or note tile is rounded-lg.
                           ? cn(item.kind === 'card' ? 'rounded-xl' : item.kind === 'portal' ? 'rounded-md' : item.kind === 'text' || item.kind === 'drawing' ? 'rounded-sm' : 'rounded-lg', isSelected && 'outline outline-primary')
                           : cn('rounded-md border shadow-sm', isSelected ? 'border-primary outline outline-primary' : 'border-border hover:border-primary/50'),
            )}
         >
            {/* A measured kind wraps the body so the box can measure it. A MIN-HEIGHT kind fills the
                body via a flex column (`min-h-full`) so a pinned footer sits at the bottom and the
                slack lands in its fill spacer. A FIT-CONTENT kind wraps in a plain block sized to its
                natural content (the body's own `flex-1` goes inert outside a flex parent, so it can't
                stretch to the box) - the measure then shrinks as well as grows as rows change. A
                FIT-WIDTH card uses `h-full w-fit`: full height keeps the card's height chain resolved
                from the box, while `w-fit` lets the wrapper exceed the current box (the fixed-width
                faces force min-content past the box) so the true 1-/2-face width is measurable. Others
                render plain. */}
            {measures
               // A fit-BOTH text element measures off a w-max wrapper (max-content, NOT fit-content): a
               // fit-content wrapper would clamp to the box width, so a newly-typed longer line would wrap
               // instead of growing the box. w-max stays the widest line's width, so the box tracks it.
               ? <div ref={measureRef} className={fitBoth ? 'w-max' : fitWidth ? 'h-full w-fit' : minHeight ? 'flex min-h-full w-full flex-col' : 'w-full'}>{body}</div>
               : body}
         </div>

         {/* Per-item chrome only for the sole selection; a multi-selection uses the group
             toolbar (rendered by the canvas) to avoid clutter, keeping only the rings. The
             wrapper re-enables pointer events for a zone (whose box is click-through). */}
         {soleSelected && (
            <div className={cn(isZone && 'pointer-events-auto')}>
               <BoardItemToolbar
                  zoom={zoom}
                  clampDown={toolbarClamp}
                  clampX={toolbarClampX}
                  measureRef={toolbarMeasureRef}
                  // An expanded zone's title bar sits above the frame too; lift the toolbar above it.
                  extraBottom={isZone && !isCollapsedZone ? ZONE_TITLE_BAR_HEIGHT + 4 : 0}
                  onMoveStart={(event) => onMoveStart(item.id, event)}
                  onConnectStart={(event) => onConnectStart(item.id, event)}
                  onBringToFront={() => onBringToFront(item.id)}
                  onSendToBack={() => onSendToBack(item.id)}
                  onDelete={() => onDelete(item.id)}
                  slotRef={setToolbarSlot}
               />

               {/* Single bottom-right resize grip, counter-scaled to a constant on-screen size.
                   A pin is a fixed-size dot, a collapsed zone is bar-sized (expand to resize), and a
                   fixed card/tracker/character embed has no grip; a windowed note tile keeps it. */}
               {!isPin && !isCollapsedZone && (!isEmbed || isResizableEmbed) && (
                  <div
                     onPointerDown={handleResizePointerDown}
                     onPointerMove={handleResizePointerMove}
                     onPointerUp={handleResizePointerUp}
                     className="absolute bottom-0 right-0 translate-x-1/2 translate-y-1/2 rounded-sm border border-background bg-primary"
                     style={{ width: gripSize, height: gripSize, cursor: 'nwse-resize' }}
                  />
               )}
            </div>
         )}
      </div>
   );
});
