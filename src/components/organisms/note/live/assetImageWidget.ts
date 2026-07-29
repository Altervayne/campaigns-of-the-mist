// -- CodeMirror Imports --
import { EditorView, WidgetType } from '@codemirror/view';

// -- Asset Cache --
import { acquireAssetUrl, releaseAssetUrl } from '@/hooks/useAssetObjectUrl';

// -- Local Imports --
import {
   findImageTokens,
   parseImageHint,
   rewriteImageHintAt,
   resizeWidthPct,
   clampImageAspect,
} from '@/lib/notes/noteImageHint';
import {
   IMAGE_ALIGN_MAX_HEIGHT,
   IMAGE_ALIGN_WRAPPER,
   IMAGE_INNER,
   IMAGE_INNER_COVER,
   IMAGE_PLACEHOLDER,
   imageCaptionClass,
} from '@/components/molecules/note/noteImageClasses';

// -- Type Imports --
import type { NoteImageAlign } from '@/lib/notes/noteImageHint';

/*
 * The CM6 live-editor IMAGE widget: replaces an `![alt](asset:hash "align width")` token with the real
 * rendered figure, IN the flow, selectable and DIRECTLY resizable/alignable. This is the fix for the
 * "horrible" dead-handle inspector - you grab the actual image's corner and it grows under the cursor.
 *
 * Bridge decision (Rook's spike): IMPERATIVE, not React-in-widget. The widget talks to the ref-counted asset
 * cache directly (`acquireAssetUrl`/`releaseAssetUrl` ↔ `toDOM`/`destroy`), and reuses `NoteImage`'s figure
 * class-strings (`noteImageClasses`) so Live == Reading with zero drift. Every buffer rewrite goes through
 * the SAME grammar helpers (`serializeImageHint`/`rewriteImageHintAt`) - the editor never hand-formats a
 * title - dispatched as a `view.dispatch({changes})` at the token's LIVE offset (found via
 * `posAtDOM`), so the flat markdown stays byte-honest.
 */

const ALIGN_ORDER: NoteImageAlign[] = ['left', 'center', 'right', 'full'];
/** lucide-ish align glyphs as inline SVG paths (imperative DOM, no React) - one per align. */
const ALIGN_GLYPH: Record<NoteImageAlign, string> = {
   left: 'M3 5h18M3 10h10M3 15h18M3 20h10',
   center: 'M3 5h18M7 10h10M3 15h18M7 20h10',
   right: 'M3 5h18M11 10h10M3 15h18M11 20h10',
   full: 'M3 5h18M3 10h18M3 15h18M3 20h18',
};

export class AssetImageWidget extends WidgetType {
   readonly hash: string;
   readonly alt: string;
   readonly title: string;
   readonly selected: boolean;

   constructor(hash: string, alt: string, title: string, selected: boolean) {
      super();
      this.hash = hash;
      this.alt = alt;
      this.title = title;
      this.selected = selected;
   }

   // Reuse the DOM only when nothing that affects render changed (selection flip must rebuild the chrome).
   // Keeping the DOM stable across keystrokes is also what preserves the ALREADY-LOADED <img> (and thus its
   // measured height), so a rebuild of the decoration set on every keystroke doesn't reset height tracking.
   eq(other: AssetImageWidget): boolean {
      return other.hash === this.hash && other.alt === this.alt && other.title === this.title && other.selected === this.selected;
   }

   /*
    * Reserve height in CM6's vertical height-map BEFORE the async <img> loads, so the map doesn't start at ~0
    * and mis-map Y->line for everything below the image (the vertical-cursor bug). A moderate estimate that
    * `requestMeasure`-on-load then corrects to the real height. `-1` (unknown) is the CM6 default we're avoiding.
    * Includes the wrapper's vertical padding (the measured spacing), so the pre-load box already accounts for it.
    */
   get estimatedHeight(): number {
      return 260;
   }

   toDOM(view: EditorView): HTMLElement {
      const { align, widthPct, aspect } = parseImageHint(this.title);

      // The figure wrapper reuses NoteImage's shared classes (single-sourced parity): an aligned block, never a
      // float, with vertical spacing as padding so CM6's block-widget height-map counts the full footprint and
      // clicks below the image land on the right line (the vertical-cursor fix). `relative` hosts the selection
      // chrome; `data-note-image` lets the plugin route clicks to select this widget.
      const wrap = document.createElement('span');
      wrap.className = `relative break-inside-avoid ${IMAGE_ALIGN_WRAPPER[align]}`;
      wrap.dataset.noteImage = 'true';
      if (align !== 'full') wrap.style.width = `${widthPct}%`;

      const img = document.createElement('img');
      img.draggable = false;
      // BOX mode (a resized image with a fixed aspect): object-cover into a fixed-ratio box, like the cover;
      // NATURAL mode: object-contain at the image's own ratio. Parity with NoteImage's two branches.
      if (aspect != null) {
         img.className = `${IMAGE_INNER_COVER} ${IMAGE_ALIGN_MAX_HEIGHT[align]}`;
         img.style.aspectRatio = `1 / ${clampImageAspect(aspect)}`;
      } else {
         img.className = `${IMAGE_INNER} ${IMAGE_ALIGN_MAX_HEIGHT[align]}`;
      }
      img.alt = this.alt;
      // THE CORE FIX for the vertical-cursor bug: the <img> loads ASYNC, so CM6 measures the widget's height
      // (into its Y->line map) before the blob has painted - recording ~0 and never re-reading. Force CM6 to
      // re-measure once the image reaches its real height (and on error/placeholder), so click-placement below
      // the image maps to the right line. Harmless when height is already correct.
      const remeasure = () => view.requestMeasure();
      img.onload = remeasure;
      img.onerror = remeasure;

      // Imperative asset resolution from the shared cache; paint on settle. Release on destroy.
      const entry = acquireAssetUrl(this.hash);
      let painted = false;
      const paint = () => {
         if (painted) return;
         painted = true;
         if (entry.url) {
            img.src = entry.url;
            wrap.insertBefore(img, wrap.firstChild);
            // A cache hit can have the blob already decoded (no load event fires), so measure now too.
            if (img.complete) remeasure();
         } else {
            const ph = document.createElement('span');
            ph.className = IMAGE_PLACEHOLDER;
            ph.textContent = this.alt || '…';
            wrap.insertBefore(ph, wrap.firstChild);
            remeasure(); // the placeholder has a definite height too - reserve it in the map
         }
      };
      if (entry.settled) paint();
      else void entry.loading?.then(paint);
      (wrap as HTMLElement & { __release?: () => void }).__release = () => releaseAssetUrl(this.hash);

      // Caption (alt) under the image, shared caption class.
      if (this.alt) {
         const cap = document.createElement('span');
         cap.className = imageCaptionClass(align);
         cap.textContent = this.alt;
         wrap.appendChild(cap);
      }

      if (this.selected) {
         this.decorateSelection(view, wrap, align);
      }
      return wrap;
   }

   /** Adds the selection ring, corner resize handles, and the align mini-toolbar to a selected widget. */
   private decorateSelection(view: EditorView, wrap: HTMLElement, align: NoteImageAlign): void {
      wrap.classList.add('cm-note-image-selected');

      // The align mini-toolbar floats above the image (theme-token chrome).
      const bar = document.createElement('span');
      bar.className = 'cm-note-image-bar';
      bar.contentEditable = 'false';
      for (const target of ALIGN_ORDER) {
         const btn = document.createElement('button');
         btn.type = 'button';
         btn.className = 'cm-note-image-align' + (target === align ? ' cm-note-image-align-active' : '');
         btn.innerHTML = alignSvg(ALIGN_GLYPH[target]);
         btn.onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); };
         btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.setAlign(view, wrap, target);
         };
         bar.appendChild(btn);
      }
      wrap.appendChild(bar);

      // The live % readout (shown during a drag).
      const readout = document.createElement('span');
      readout.className = 'cm-note-image-readout';
      readout.style.display = 'none';
      wrap.appendChild(readout);

      // A single bottom-right resize handle (mirrors the Board's + the cover's). `full` has no width axis, so
      // no handle. Drag = width (aspect preserved); Shift = free aspect - like the cover.
      if (align !== 'full') {
         const handle = document.createElement('span');
         handle.className = 'cm-note-image-handle cm-note-image-handle-br';
         this.bindHandle(handle, view, wrap, readout);
         wrap.appendChild(handle);
      }
   }

   /**
    * Binds a pointer-drag on the bottom-right handle to a LIVE resize (reusing the cover's pure-DOM pattern):
    * ONLY direct DOM style writes during the drag (no store write, no CM6 dispatch beyond `requestMeasure`),
    * the wrap dims to 0.6 as an "I'm resizing" state, and width+aspect commit ONCE on release. Without Shift the
    * aspect is preserved (drag adjusts width); WITH Shift width and height move INDEPENDENTLY (free aspect).
    */
   private bindHandle(handle: HTMLElement, view: EditorView, wrap: HTMLElement, readout: HTMLElement): void {
      handle.onpointerdown = (event) => {
         event.preventDefault();
         event.stopPropagation();
         handle.setPointerCapture(event.pointerId);
         const img = wrap.querySelector('img');
         const colW = columnWidth(view, wrap);
         const { align: startAlign, widthPct: startPct } = parseImageHint(this.title);
         const startRect = (img ?? wrap).getBoundingClientRect();
         const startAspect = clampImageAspect(startRect.width > 0 ? startRect.height / startRect.width : 1);
         const startX = event.clientX;
         const startY = event.clientY;
         let livePct = startPct;
         let liveAspect = startAspect;
         readout.style.display = 'block';
         wrap.style.opacity = '0.6';

         const onMove = (moveEvent: PointerEvent) => {
            livePct = resizeWidthPct(startPct, moveEvent.clientX - startX, colW);
            const clamped = clampForAlign(startAlign, livePct);
            const newWidthPx = colW * (clamped / 100);
            if (moveEvent.shiftKey) {
               // Free aspect: height follows the cursor's Y independently of width.
               const newHeightPx = startRect.height + (moveEvent.clientY - startY);
               liveAspect = clampImageAspect(newWidthPx > 0 ? newHeightPx / newWidthPx : startAspect);
            } else {
               liveAspect = startAspect;
            }
            wrap.style.width = `${clamped}%`;
            // Convert the img to box mode live (object-cover + aspect-ratio) so the size/shape is seen at once.
            if (img) {
               img.className = `${IMAGE_INNER_COVER} ${IMAGE_ALIGN_MAX_HEIGHT[startAlign]}`;
               img.style.aspectRatio = `1 / ${liveAspect}`;
            }
            readout.textContent = `${clamped}%`;
            // The height change alters CM6's line-map; keep it in step so the cursor below stays honest.
            view.requestMeasure();
         };
         const onUp = (upEvent: PointerEvent) => {
            handle.releasePointerCapture(upEvent.pointerId);
            handle.removeEventListener('pointermove', onMove);
            handle.removeEventListener('pointerup', onUp);
            readout.style.display = 'none';
            wrap.style.opacity = '';
            this.setBox(view, wrap, livePct, liveAspect);
         };
         handle.addEventListener('pointermove', onMove);
         handle.addEventListener('pointerup', onUp);
      };
   }

   /** Rewrites this image's width% + aspect (a fixed box) in the buffer, keeping align, at the token's LIVE offset. */
   private setBox(view: EditorView, wrap: HTMLElement, widthPct: number, aspect: number): void {
      this.rewrite(view, wrap, (body, index) => {
         const { align } = parseImageHint(this.title);
         return rewriteImageHintAt(body, index, { align, widthPct, aspect: clampImageAspect(aspect) });
      });
   }

   /** Sets this image's align (block alignment; no wrapping), preserving width + aspect, at the token's LIVE offset. */
   private setAlign(view: EditorView, wrap: HTMLElement, align: NoteImageAlign): void {
      this.rewrite(view, wrap, (body, index) => {
         const prev = parseImageHint(this.title);
         const width = align === 'full' ? 100 : prev.widthPct;
         return rewriteImageHintAt(body, index, { align, widthPct: width, aspect: prev.aspect });
      });
   }

   /**
    * Applies a body transform to THIS token and dispatches it as a CM6 change. Finds the token's live offset
    * from the widget's DOM position (`posAtDOM`), so a shifted doc still rewrites the right token. Whole-doc
    * dispatch keeps it simple and safe; the transform only ever rewrites the one token's hint.
    */
   private rewrite(view: EditorView, wrap: HTMLElement, transform: (body: string, index: number) => string): void {
      const body = view.state.doc.toString();
      const index = this.tokenIndex(view, wrap, body);
      if (index === null) return;
      const nextBody = transform(body, index);
      if (nextBody === body) return;
      // Keep the caret just past the token so the widget stays selected (its span still holds the head).
      view.dispatch({ changes: { from: 0, to: body.length, insert: nextBody }, selection: { anchor: index + 1 } });
      view.focus();
   }

   /** The buffer offset of THIS image token, found from the widget's live DOM position + hash match. */
   private tokenIndex(view: EditorView, wrap: HTMLElement, body: string): number | null {
      const pos = view.posAtDOM(wrap);
      const tokens = findImageTokens(body);
      // Prefer the token whose span contains `pos`; fall back to the nearest one with this hash.
      const containing = tokens.find((tk) => pos >= tk.index && pos <= tk.index + tk.length);
      if (containing) return containing.index;
      const sameHash = tokens.filter((tk) => tk.hash === this.hash);
      if (sameHash.length === 0) return null;
      return sameHash.reduce((best, tk) => (Math.abs(tk.index - pos) < Math.abs(best.index - pos) ? tk : best)).index;
   }

   destroy(dom: HTMLElement): void {
      (dom as HTMLElement & { __release?: () => void }).__release?.();
   }

   // Selected widget owns its chrome clicks; an unselected one lets clicks through to place the caret (select).
   ignoreEvent(event: Event): boolean {
      return this.selected && event.type !== 'mousedown';
   }
}

/** The prose column width, for the drag→% math (the nearest CM6 content element). */
function columnWidth(view: EditorView, wrap: HTMLElement): number {
   const content = wrap.closest('.cm-content') as HTMLElement | null;
   return (content ?? view.contentDOM).getBoundingClientRect().width || 1;
}

/** Clamps a live-drag percent into the align's rendering band (mirrors the parser's clamp for the paint). */
function clampForAlign(align: NoteImageAlign, pct: number): number {
   if (align === 'full') return 100;
   if (align === 'center') return Math.min(100, Math.max(30, pct));
   return Math.min(55, Math.max(25, pct)); // left/right
}

/** A small inline align SVG for a toolbar button. */
function alignSvg(path: string): string {
   return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="${path}"/></svg>`;
}
