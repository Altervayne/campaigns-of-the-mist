// -- CodeMirror Imports --
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import { Facet, StateEffect, StateField, Transaction } from '@codemirror/state';
import { invertedEffects } from '@codemirror/commands';
import type { DecorationSet, ViewUpdate, PluginValue } from '@codemirror/view';
import type { EditorState, Extension, Range } from '@codemirror/state';

// -- Asset Cache --
import { acquireAssetUrl, releaseAssetUrl } from '@/hooks/useAssetObjectUrl';

// -- Local Imports --
import {
   COVER_GAP_REM,
   COVER_ASPECT_PRESETS,
   clampCoverWidth,
   clampCoverAspect,
} from '@/components/molecules/note/noteCoverClasses';
import { isTableLine } from './tableRegions';
import { hasImageTokenInRange } from '@/lib/notes/noteImageHint';

// -- Type Imports --
import type { NoteCover } from '@/lib/types/board';

/*
 * The Live-editor NOTE COVER: a note-level image rendered top-left with the opening lines inset beside it, so
 * the first paragraph wraps in a gutter next to the cover (magazine drop-cap). This is the ONE honest-cursor
 * mechanism CM6 allows (Rook's spike proved it): NOT a float, NOT a doc widget.
 *
 * Mechanism:
 *  1. The first N document lines get a `padding-left` inset via a `Decoration.line` (a LINE decoration, so the
 *     text stays normal in-flow CM6 content and its line-map stays byte-honest - the whole trick). The inset
 *     reserves the cover box's width as a left gutter; lines past N get no inset and return to full width.
 *  2. The cover box is a PASSIVE absolute overlay pinned in that reserved top-left gutter (a ViewPlugin owns
 *     it). It is a fixed box (`width` % of the content column, by `aspect`) the `<img>` fills via
 *     `object-fit: cover`. When the caller is editable, the box also hosts a hover CONTROLS overlay (Change /
 *     Remove + a resize handle + aspect presets) - absolute chrome that never shifts the document.
 *  3. N = cover box rendered height / line-height, recomputed whenever the box or the content column resizes
 *     (a ResizeObserver on both) and on doc/geometry updates, so the inset always clears the cover as lines
 *     are added/removed above the fold, and the overlay is repositioned to the content column top-left.
 *
 * The cover is note-level state (NOT a body token), threaded in via {@link setCoverEffect}. `null` = no cover.
 */

/** The callbacks the cover controls need: Change/Remove and box commits. Injected once via {@link coverGutter}. */
export interface CoverController {
   /** Whether the surface is editable (controls only show in Live-editable mode; a read Live has none). */
   editable: boolean;
   /** Open the picker to change the cover image. */
   onChange: () => void;
   /** Remove the cover. */
   onRemove: () => void;
   /**
    * Commit a resized box on drag release: width (percent of the measure) and aspect (height / width). A
    * proportional drag re-sends the unchanged aspect; a Shift-drag sends the freely reshaped one. Clamps are
    * applied by the caller's store action.
    */
   onResizeBox: (widthPct: number, aspect: number) => void;
   /** Commit a new box aspect (height / width) - the quick-set aspect presets. */
   onSetAspect: (aspect: number) => void;
   /**
    * Touch seam: when set, the cover box is a tap target that opens the options sheet, and the hover controls
    * are NOT mounted (hover doesn't exist on touch). Absent on desktop, where the hover controls stand in.
    */
   onTap?: () => void;
   /** Localized tooltips/aria-labels for the icon-only controls (the plugin has no i18n of its own). */
   labels: { change: string; remove: string; aspect: string };
}

/** Seeds {@link coverState}'s initial cover at state creation (no dispatch, so it makes no history entry). */
export const initialCover = Facet.define<NoteCover | null, NoteCover | null>({ combine: (values) => (values.length ? values[0] : null) });

/**
 * Sets the current cover (or `null` to clear). Dispatched (history-captured) when the note's cover changes -
 * add / change image / remove / resize / aspect - so a cover edit is an undoable step in the shared timeline.
 */
export const setCoverEffect = StateEffect.define<NoteCover | null>();

/** Sets the computed inset geometry (N + the table-clear pad), dispatched by the overlay plugin after a measure. */
const setCoverLinesEffect = StateEffect.define<{ lines: number; clearPad: number }>();

interface CoverGutterState {
   cover: NoteCover | null;
   /** How many leading lines are inset beside the cover (0 when no cover / not yet measured). */
   lines: number;
   /**
    * Extra `padding-top` (px) on the FIRST line past the inset region when that line is a TABLE or block IMAGE
    * the cover would otherwise overlap - it pushes the full-width block down so it starts BELOW the cover (never
    * under it). 0 when the next line clears the cover on its own or isn't a blocking block.
    */
   clearPad: number;
}

/** Holds the cover + inset geometry. The overlay plugin reads these to build the inset + clear-pad + place the box. */
const coverState = StateField.define<CoverGutterState>({
   create: (state) => ({ cover: state.facet(initialCover), lines: 0, clearPad: 0 }),
   update(value, transaction) {
      let next = value;
      for (const effect of transaction.effects) {
         if (effect.is(setCoverEffect)) {
            // A new/cleared cover (or a box change): reset the line count until the overlay re-measures if the
            // IMAGE changed; a pure width/aspect tweak keeps the current N until the resize observer corrects it.
            const sameHash = effect.value?.hash === next.cover?.hash;
            next = { cover: effect.value, lines: sameHash ? next.lines : 0, clearPad: sameHash ? next.clearPad : 0 };
         } else if (effect.is(setCoverLinesEffect)) {
            next = { ...next, lines: effect.value.lines, clearPad: effect.value.clearPad };
         }
      }
      return next;
   },
});

/**
 * Tells `history()` how to undo a cover edit: restore the cover as it was before this transaction. Only the
 * cover VALUE (`setCoverEffect`) is inverted - the derived inset geometry (`setCoverLinesEffect`) is not
 * history-relevant (and its transactions are marked out of history at the dispatch site).
 */
const coverHistory = invertedEffects.of((transaction) => {
   for (const effect of transaction.effects) {
      if (effect.is(setCoverEffect)) return [setCoverEffect.of(transaction.startState.field(coverState).cover)];
   }
   return [];
});

/** The reserved left-gutter width for a given box width: the box width (% of the column) plus the gap. */
function insetStyle(widthPct: number): string {
   return `padding-left: calc(${clampCoverWidth(widthPct)}% + ${COVER_GAP_REM}rem)`;
}

/** True if the line starting at `lineStart` renders a block image (mirrors {@link isTableLine} for the image widget). */
function isImageLine(state: EditorState, lineStart: number): boolean {
   const line = state.doc.lineAt(lineStart);
   return hasImageTokenInRange(state.doc.toString(), line.from, line.to);
}

/**
 * True if the line starting at `lineStart` is a full-width block the cover must NOT overlap - a GFM table or a
 * block image. Both are crushed if inset into the narrow gutter and render UNDER the absolute cover if left in
 * flow, so both hard-stop the inset and get cleared below the box.
 */
function isCoverBlockingLine(state: EditorState, lineStart: number): boolean {
   return isTableLine(state, lineStart) || isImageLine(state, lineStart);
}

/**
 * The block clear-spacer decorations. A BLOCK widget can't come from the overlay ViewPlugin (CM6 forbids it),
 * so it lives in its own StateField reading `coverState.clearPad`: when a cover would vertically overlap the
 * first table or block image past its inset region, a spacer of `clearPad` px is inserted BEFORE that block so
 * the full-width block starts below the cover box. Recomputed whenever the doc or the cover state changes.
 */
const coverClearField = StateField.define<DecorationSet>({
   create: (state) => buildClearDeco(state),
   update(deco, tr) {
      if (tr.docChanged || tr.effects.some((e) => e.is(setCoverEffect) || e.is(setCoverLinesEffect))) {
         return buildClearDeco(tr.state);
      }
      return deco.map(tr.changes);
   },
   provide: (f) => EditorView.decorations.from(f),
});

/** Builds the single block spacer before the cover-overlapped block - a table or an image (or none). */
function buildClearDeco(state: EditorState): DecorationSet {
   const { cover, lines, clearPad } = state.field(coverState);
   if (!cover || clearPad <= 0) return Decoration.none;
   const { doc } = state;
   // The first blocking line (table or block image) at/after the inset region is where the spacer goes.
   for (let n = Math.max(1, lines + 1); n <= doc.lines; n++) {
      const start = doc.line(n).from;
      if (isCoverBlockingLine(state, start)) {
         return Decoration.set(Decoration.widget({ widget: new CoverClearWidget(clearPad), block: true, side: -1 }).range(start));
      }
      // Only look at the boundary line; a non-blocking line there means no clearance is needed.
      if (n > lines + 1) break;
   }
   return Decoration.none;
}

/**
 * A zero-content block spacer of a fixed pixel height, placed BEFORE a table or image the cover would overlap
 * so the full-width block starts below the cover box. A block-replaced line can't take a `padding-top` line
 * decoration (the widget consumes the line), so vertical clearance rides a real block widget instead.
 */
class CoverClearWidget extends WidgetType {
   readonly height: number;
   constructor(height: number) { super(); this.height = height; }
   eq(other: CoverClearWidget): boolean { return other.height === this.height; }
   get estimatedHeight(): number { return this.height; }
   toDOM(): HTMLElement {
      const el = document.createElement('div');
      el.style.cssText = `height:${this.height}px;pointer-events:none;`;
      el.setAttribute('aria-hidden', 'true');
      return el;
   }
   ignoreEvent(): boolean { return true; }
}

/**
 * The overlay ViewPlugin: owns the passive absolute cover box (`<img>` + optional hover controls), positions
 * it in the reserved gutter, resolves the asset from the shared cache, and recomputes N from the box's
 * measured height whenever it or the content column resizes. It ALSO provides the line-inset decorations (it
 * has the view, so it anchors them to real line starts). The controller is captured in a closure per view.
 */
function coverOverlay(controller: CoverController) {
   return ViewPlugin.fromClass(
      class implements PluginValue {
         decorations: DecorationSet = Decoration.none;
         private view: EditorView;
         /** The box element (holds the `<img>` and, when editable, the controls). */
         private box: HTMLElement | null = null;
         private heldHash: string | null = null;
         private destroyed = false;
         private resizeObserver: ResizeObserver;
         /**
          * True while the user is dragging the resize handle. During a drag the box is resized by DIRECT DOM
          * style writes only - no store write, no CM6 dispatch, no gutter recompute - so the drag is a pure CSS
          * resize of the absolute overlay at 60fps. Every recompute path checks this and bails; the ONE commit +
          * reflow happens on release. Without this, the box's own ResizeObserver would fire a dispatch per move.
          */
         private dragging = false;

         constructor(view: EditorView) {
            this.view = view;
            this.resizeObserver = new ResizeObserver(() => this.recomputeLines());
            this.resizeObserver.observe(view.contentDOM);
            this.sync(view);
            this.decorations = this.insetDeco(view);
         }

         update(update: ViewUpdate) {
            // Mid-drag the box is owned by the pointermove DOM writes; a CM6 update must not stomp it with the
            // stale store shape or recompute the gutter. The single commit + reflow lands on pointerup.
            if (this.dragging) {
               this.decorations = this.insetDeco(update.view);
               this.positionOverlay();
               return;
            }
            const cover = update.state.field(coverState).cover;
            const hashChanged = cover?.hash !== this.heldHash;
            if (hashChanged) this.sync(update.view);
            this.applyBoxShape(cover);
            this.decorations = this.insetDeco(update.view);
            this.positionOverlay();
            if (update.docChanged || update.viewportChanged || update.geometryChanged || hashChanged) {
               this.recomputeLines();
            }
         }

         /**
          * Builds the line-inset decorations anchored to the first N real line starts. A GFM table or a block
          * image must NEVER be inset (it would be crushed into the narrow gutter and overflow), so the inset
          * HARD-STOPS at the first such line: only the leading plain-text lines get the gutter; the block and
          * everything after render full-width below the cover.
          */
         private insetDeco(view: EditorView): DecorationSet {
            const { cover, lines } = view.state.field(coverState);
            if (!cover || lines <= 0) return Decoration.none;
            const { state } = view;
            const { doc } = state;
            const line = Decoration.line({ attributes: { style: insetStyle(cover.width) } });
            const ranges: Range<Decoration>[] = [];
            const last = Math.min(lines, doc.lines);
            for (let n = 1; n <= last; n++) {
               const start = doc.line(n).from;
               if (isCoverBlockingLine(state, start)) break; // a table/image hard-stops the inset - never inset one
               ranges.push(line.range(start));
            }
            // The block SPACER that pushes a cover-overlapped table below the box is a BLOCK widget (CM6 forbids
            // those from a ViewPlugin), so it lives in `coverClearField` (a StateField), not here.
            return ranges.length ? Decoration.set(ranges) : Decoration.none;
         }

         /** Resolves + mounts (or removes) the overlay box for the current cover hash. */
         private sync(view: EditorView) {
            const cover = view.state.field(coverState).cover;
            const hash = cover?.hash ?? null;
            if (hash === this.heldHash) return;
            this.teardownBox();
            this.heldHash = hash;
            if (!cover) return;

            const entry = acquireAssetUrl(cover.hash);
            const box = document.createElement('div');
            box.className = 'cm-note-cover';
            // An overlay, not content: it must never take a cursor slot. Mounted in the SCROLLER (not
            // `.cm-content`) - CM6 owns `.cm-content` and wipes DOM it doesn't manage, so an element appended
            // there vanishes on the next redraw. The scroller is stable; `positionOverlay` aligns the box with
            // the (centred) content column's top-left. The box itself takes no pointer events (the img is a
            // passive backdrop); only the controls layer re-enables them. `overflow:visible` so the corner
            // resize handle isn't clipped - the crop lives on the inner image wrap below.
            box.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;user-select:none;z-index:1;';

            // Inner wrapper owns the object-fit crop (a clipped box); the resize handle sits on the box OUTSIDE
            // this clip, so it stays fully visible at the corner. Its opacity dims while resizing (feedback).
            const imgWrap = document.createElement('div');
            imgWrap.className = 'cm-note-cover-img';
            imgWrap.style.cssText = 'width:100%;height:100%;overflow:hidden;border-radius:0.375rem;transition:opacity 0.12s ease;';

            const img = document.createElement('img');
            img.alt = '';
            img.draggable = false;
            img.setAttribute('aria-hidden', 'true');
            // Fills + crops the fixed box, keeping its own ratio (object-fit: cover).
            img.style.cssText = 'display:block;width:100%;height:100%;object-fit:cover;';
            const paint = () => {
               if (entry.url) img.src = entry.url;
            };
            if (entry.settled) paint();
            else void entry.loading?.then(paint);
            imgWrap.appendChild(img);
            box.appendChild(imgWrap);

            // Touch opens the options sheet on tap; desktop gets the hover controls. Never both.
            if (controller.onTap) this.mountTapLayer(box, controller.onTap);
            else if (controller.editable) this.mountControls(box);

            view.scrollDOM.appendChild(box);
            this.resizeObserver.observe(box);
            this.box = box;
            this.applyBoxShape(cover);
            this.positionOverlay();
            this.kickInitialMeasure();
         }

         /** Sets the box's width/height from the cover's `width`/`aspect` against the content column. */
         private applyBoxShape(cover: NoteCover | null) {
            if (!this.box || !cover) return;
            const contentWidth = this.view.contentDOM.getBoundingClientRect().width;
            if (contentWidth <= 0) return;
            const boxWidth = Math.round(contentWidth * (clampCoverWidth(cover.width) / 100));
            const boxHeight = Math.round(boxWidth * clampCoverAspect(cover.aspect));
            this.box.style.width = `${boxWidth}px`;
            this.box.style.height = `${boxHeight}px`;
            this.reserveCoverHeight(boxHeight);
         }

         /**
          * Reserves the cover box's height as a `min-height` on `.cm-content` so the parchment grows to contain a
          * cover TALLER than the text (the box is an absolute overlay, out of flow, so it wouldn't push the sheet
          * otherwise). `min-height` only grows: text taller than the cover keeps its own height. Cleared on teardown.
          */
         private reserveCoverHeight(boxHeight: number) {
            this.view.contentDOM.style.minHeight = `${boxHeight}px`;
         }

         /**
          * A transparent full-box tap target (touch): opens the options sheet and swallows the gesture so CM6
          * leaves the caret put. Takes pointer events even though the box itself doesn't (the layer re-enables them).
          */
         private mountTapLayer(box: HTMLElement, onTap: () => void) {
            const layer = document.createElement('button');
            layer.type = 'button';
            layer.className = 'cm-note-cover-tap';
            layer.setAttribute('aria-label', controller.labels.change);
            layer.style.cssText = 'position:absolute;inset:0;pointer-events:auto;background:transparent;border:none;padding:0;cursor:pointer;';
            layer.onpointerdown = (e) => { e.preventDefault(); e.stopPropagation(); };
            layer.onclick = (e) => { e.preventDefault(); e.stopPropagation(); onTap(); };
            box.appendChild(layer);
         }

         /** Adds the hover controls overlay (Change / Remove + resize handle + aspect presets) to the box. */
         private mountControls(box: HTMLElement) {
            const layer = document.createElement('div');
            layer.className = 'cm-note-cover-controls';
            layer.style.pointerEvents = 'auto';

            const bar = document.createElement('div');
            bar.className = 'cm-note-cover-bar';
            bar.appendChild(this.buildButton('cm-note-cover-change', CHANGE_GLYPH, controller.labels.change, () => controller.onChange()));
            for (const preset of COVER_ASPECT_PRESETS) {
               bar.appendChild(this.buildButton('cm-note-cover-aspect', ASPECT_GLYPH[preset.key], controller.labels.aspect, () => controller.onSetAspect(preset.ratio)));
            }
            bar.appendChild(this.buildButton('cm-note-cover-remove', REMOVE_GLYPH, controller.labels.remove, () => controller.onRemove()));
            layer.appendChild(bar);

            const handle = document.createElement('div');
            handle.className = 'cm-note-cover-handle';
            this.bindResize(handle);
            layer.appendChild(handle);

            box.appendChild(layer);
         }

         /** Builds one control button (imperative DOM; a click swallows its gesture so CM6 doesn't move the caret). */
         private buildButton(className: string, glyph: string, label: string, onClick: () => void): HTMLButtonElement {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `cm-note-cover-btn ${className}`;
            btn.title = label;
            btn.setAttribute('aria-label', label);
            btn.innerHTML = glyph;
            btn.onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); };
            btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); onClick(); };
            return btn;
         }

         /**
          * Binds a pointer-drag on the bottom-right handle to a LIVE box resize. The box grows under the cursor
          * on every move (the `<img>` fills via object-fit, so size/shape is seen at once); WITHOUT Shift the
          * aspect is preserved (width follows the cursor, height tracks it); WITH Shift width and height move
          * INDEPENDENTLY (free-form - any size/shape). The text wrap does not re-flow live; N is recomputed and
          * the width+aspect committed only on release.
          */
         private bindResize(handle: HTMLElement) {
            handle.onpointerdown = (event) => {
               event.preventDefault();
               event.stopPropagation();
               handle.setPointerCapture(event.pointerId);
               const box = this.box;
               if (!box) return;
               // Enter the pure-DOM drag: recompute/dispatch paths bail until pointerup (60fps overlay resize).
               this.dragging = true;
               // Dim the image while resizing so it clearly reads as "being resized" (restored on release).
               const imgWrap = box.querySelector('.cm-note-cover-img') as HTMLElement | null;
               if (imgWrap) imgWrap.style.opacity = '0.6';
               const contentWidth = this.view.contentDOM.getBoundingClientRect().width || 1;
               const startWidthPx = box.getBoundingClientRect().width;
               const startHeightPx = box.getBoundingClientRect().height;
               const startX = event.clientX;
               const startY = event.clientY;
               const startAspect = this.view.state.field(coverState).cover?.aspect ?? 1;
               let liveWidthPct = clampCoverWidth((startWidthPx / contentWidth) * 100);
               let liveAspect = clampCoverAspect(startAspect);

               // ONLY direct DOM style writes here - no store write, no CM6 dispatch, no requestMeasure, no
               // recompute. The box's own ResizeObserver fires but recomputeLines bails on `dragging`.
               const onMove = (moveEvent: PointerEvent) => {
                  const widthPx = startWidthPx + (moveEvent.clientX - startX);
                  liveWidthPct = clampCoverWidth((widthPx / contentWidth) * 100);
                  const px = Math.round(contentWidth * (liveWidthPct / 100));
                  if (moveEvent.shiftKey) {
                     // Free aspect: height follows the cursor's Y independently of width.
                     const heightPx = startHeightPx + (moveEvent.clientY - startY);
                     liveAspect = clampCoverAspect(px > 0 ? heightPx / px : startAspect);
                  } else {
                     // Proportional: aspect held, height derives from the new width.
                     liveAspect = clampCoverAspect(startAspect);
                  }
                  box.style.width = `${px}px`;
                  box.style.height = `${Math.round(px * liveAspect)}px`;
               };
               const onUp = (upEvent: PointerEvent) => {
                  handle.releasePointerCapture(upEvent.pointerId);
                  handle.removeEventListener('pointermove', onMove);
                  handle.removeEventListener('pointerup', onUp);
                  if (imgWrap) imgWrap.style.opacity = '';
                  // Leave the drag, THEN commit the box + reflow N once. Recompute from the box's FINAL dragged
                  // size (not the store shape, which is still the pre-drag value until React re-renders) - so a
                  // SHRINK drops N tightly with no blank gutter beneath, and a grow adds lines.
                  this.dragging = false;
                  controller.onResizeBox(liveWidthPct, liveAspect);
                  this.recomputeLines({ fromCurrentBox: true });
               };
               handle.addEventListener('pointermove', onMove);
               handle.addEventListener('pointerup', onUp);
            };
         }

         /** Aligns the overlay box with the content column's top-left. */
         private positionOverlay() {
            if (!this.box) return;
            const content = this.view.contentDOM;
            const scroller = this.view.scrollDOM;
            const contentRect = content.getBoundingClientRect();
            const scrollerRect = scroller.getBoundingClientRect();
            if (contentRect.width <= 0) return;
            const left = contentRect.left - scrollerRect.left + scroller.scrollLeft;
            const top = contentRect.top - scrollerRect.top + scroller.scrollTop;
            this.box.style.left = `${left}px`;
            this.box.style.top = `${top}px`;
         }

         /** Schedules a few measures over the mount/layout-settle window so N lands without a user interaction. */
         private kickInitialMeasure() {
            for (const delay of [0, 60, 160, 320]) {
               setTimeout(() => this.recomputeLines(), delay);
            }
         }

         /**
          * Recomputes N (the count of leading lines inset beside the cover) and dispatches it when it changed.
          * N reserves EXACTLY the lines the cover visually overlaps: a line is inset only if its top sits above
          * the cover box's bottom edge (a 1px epsilon absorbs sub-pixel float so a box that ends flush with a
          * line boundary doesn't spill one line further). This is measured off the REAL settled line geometry
          * (`lineBlockAt` tops vs the cover bottom, both relative to the content top), not `ceil(height/lineHeight)`
          * which over-rounds any fractional overlap up a whole line. Skipped mid-drag; reads geometry directly
          * (safe outside CM6's measure cycle) and dispatches on a microtask (a sync dispatch nests, which CM6
          * forbids). A zero height yields N=0.
          */
         private recomputeLines(opts?: { fromCurrentBox?: boolean }) {
            if (this.destroyed || this.dragging || !this.heldHash || !this.box) return;
            // On a resize commit, the box already holds its final dragged size but the store shape is still the
            // pre-drag value - so DON'T re-apply it (that would restore the old size and mis-measure a shrink).
            if (!opts?.fromCurrentBox) this.applyBoxShape(this.view.state.field(coverState).cover);
            this.positionOverlay();
            const { lines, clearPad } = this.countInsetLines();
            const cur = this.view.state.field(coverState);
            // Dead-band on clearPad: sub-pixel jitter in the live measure must not churn the spacer (which would
            // re-measure and re-jitter forever). Treat a <=3px difference as unchanged.
            const padChanged = Math.abs(clearPad - cur.clearPad) > 3;
            if (lines === cur.lines && !padChanged) return;
            Promise.resolve().then(() => {
               if (this.destroyed || this.dragging || !this.heldHash) return;
               const now = this.view.state.field(coverState);
               if (lines !== now.lines || Math.abs(clearPad - now.clearPad) > 3) {
                  // A derived-geometry measure, never a user edit: keep it out of the undo timeline.
                  this.view.dispatch({ effects: setCoverLinesEffect.of({ lines, clearPad }), annotations: Transaction.addToHistory.of(false) });
               }
            });
         }

         /**
          * Counts the leading plain-text lines whose top clears the cover box's bottom - the tight visual
          * footprint. If the inset stops at a TABLE or block IMAGE the cover still overlaps vertically, computes
          * `clearPad`: the top padding to push that full-width block BELOW the cover (so it never renders under
          * the box). Both measured relative to the content top so a scrolled/offset viewport doesn't skew the count.
          */
         private countInsetLines(): { lines: number; clearPad: number } {
            if (!this.box) return { lines: 0, clearPad: 0 };
            const coverHeight = this.box.getBoundingClientRect().height;
            if (coverHeight <= 0) return { lines: 0, clearPad: 0 };
            const contentTop = this.view.contentDOM.getBoundingClientRect().top;
            const coverBottom = this.box.getBoundingClientRect().top - contentTop + coverHeight;
            const { state } = this.view;
            const { doc } = state;
            let count = 0;
            let clearPad = 0;
            for (let n = 1; n <= doc.lines; n++) {
               const start = doc.line(n).from;
               if (isCoverBlockingLine(state, start)) {
                  // A table/image hard-stops the inset. If the cover still overlaps here, pad the block down to clear
                  // it. The pad is measured from the BOTTOM of the last inset line (a plain line the spacer never
                  // moves), NOT the block's own top - so the spacer can't feed back into its own measurement.
                  const prevBottom = count > 0 ? this.view.lineBlockAt(doc.line(count).from).bottom : 0;
                  if (prevBottom < coverBottom - 1) clearPad = Math.ceil(coverBottom - prevBottom);
                  break;
               }
               const top = this.view.lineBlockAt(start).top;
               if (top < coverBottom - 1) count = n;
               else break;
            }
            return { lines: count, clearPad };
         }

         private teardownBox() {
            if (this.box) {
               this.resizeObserver.unobserve(this.box);
               this.box.remove();
               this.box = null;
            }
            // Release the reserved cover height so a cover-less doc isn't padded.
            this.view.contentDOM.style.minHeight = '';
            if (this.heldHash) releaseAssetUrl(this.heldHash);
         }

         destroy() {
            this.destroyed = true;
            this.resizeObserver.disconnect();
            this.teardownBox();
            this.heldHash = null;
         }
      },
      { decorations: (plugin) => plugin.decorations },
   );
}

/** lucide-ish control glyphs as inline SVG (imperative DOM, no React). */
const CHANGE_GLYPH =
   '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 16l5-5 4 4 3-3 6 6"/><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/></svg>';
// Matches the app's standard delete icon (lucide Trash2) used everywhere else for "delete".
const REMOVE_GLYPH =
   '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>';
/** Aspect presets get a rectangle glyph roughly matching their ratio. */
const ASPECT_GLYPH: Record<string, string> = {
   wide: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="8" width="18" height="8" rx="1"/></svg>',
   photo: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="5" width="14" height="14" rx="1"/></svg>',
   square: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="5" width="14" height="14" rx="1"/></svg>',
};

/**
 * The cover SOURCE-OF-TRUTH extension: the cover state field + its history inversion. Loaded in BOTH Live and
 * Source (the cover is editable from the toolbar in either), so a cover edit is captured in the undo timeline
 * regardless of mode. Seed the initial cover via the {@link initialCover} facet. The VISUAL gutter (overlay +
 * inset + clear-spacer) is Live-only - see {@link coverGutterVisual}.
 */
export const coverStateExtension: Extension = [coverState, coverHistory];

/** The Live-only cover VISUALS: the clear-spacer field + the overlay/inset plugin. Pairs with {@link coverStateExtension}. */
export function coverGutterVisual(controller: CoverController): Extension {
   return [coverClearField, coverOverlay(controller)];
}

/**
 * The number of leading lines currently inset beside the cover (0 when no cover / Source / not measured). The
 * insertion guard reads this so a body image never lands in the cover gutter (see `NoteEditor.getInsertionPos`).
 */
export function coverInsetLineCount(state: EditorState): number {
   return state.field(coverState, false)?.lines ?? 0;
}

/** The current cover held in CM6 state (or `null`). The editor handle reads it to patch width/aspect on resize. */
export function getNoteCover(state: EditorState): NoteCover | null {
   return state.field(coverState, false)?.cover ?? null;
}
