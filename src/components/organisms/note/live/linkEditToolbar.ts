// -- CodeMirror Imports --
import { EditorView, ViewPlugin } from '@codemirror/view';
import type { ViewUpdate, PluginValue } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

// -- Local Imports --
import { collapsedLinkAt } from './linkNode';
import type { LinkEditSeed, LinkNodeInfo } from './linkNode';

/*
 * The floating LINK-EDIT bar for the Live/Source editor: shown when the caret sits INSIDE a markdown link
 * `[text](href)` with a COLLAPSED selection (an empty caret). Four actions - Open (run the link), Change target
 * (repoint via the picker, keeping the label), Edit label (select the label text so typing replaces it), Remove
 * (unwrap the link to its plain label). Mutually exclusive with the selection FORMAT bar by selection state:
 * that one needs a non-empty selection, this one an empty caret, so the two never show together.
 *
 * All edits go through `view.dispatch` (one granular undo each), matching the format bar. Imperative DOM (no
 * React root); it reuses the format bar's chrome classes (`.cm-note-format-*`, theme tokens).
 */

/** The callbacks the link-edit bar needs, injected once via {@link linkEditToolbar} (a stable wrapper keeps the view). */
export interface LinkEditController {
   /** Whether the surface shows the bar (Live/Source editing; never Reading). */
   editable: boolean;
   /** Localized tooltips/aria-labels for the icon-only controls (the plugin has no i18n of its own). */
   labels: { open: string; changeTarget: string; editLabel: string; remove: string };
   /** Runs (activates) the link - the SAME bridge the click-follow uses (scroll / open tab / spawn / reveal / external). */
   onOpen: (href: string) => void;
   /** Opens the link picker to REPLACE this link's target while keeping its label. */
   onChangeTarget: (seed: LinkEditSeed) => void;
   /**
    * Mobile: reports the caret's link (or null) instead of floating the bar. When set, the plugin NEVER mounts
    * the floating bar - a chip + sheet drive the actions. Presence is fixed per surface (desktop omits it).
    */
   onCaretLinkChange?: (info: LinkNodeInfo | null) => void;
}

/** Selects the caret link's label so typing replaces it. Exposed for the mobile handle. */
export function editLinkLabel(view: EditorView): void {
   editLabel(view);
}

/** Unwraps the caret link to its plain label text. Exposed for the mobile handle. */
export function removeCaretLink(view: EditorView): void {
   removeLink(view);
}

/** Selects the label range (between `[` and `]`) and focuses the editor, so typing replaces the link text. */
function editLabel(view: EditorView): void {
   const info = collapsedLinkAt(view.state);
   if (!info) return;
   view.dispatch({ selection: { anchor: info.labelFrom, head: info.labelTo } });
   view.focus();
}

/** Unwraps the link to its label text: replaces the whole `[text](href)` node with `text`. One granular undo. */
function removeLink(view: EditorView): void {
   const info = collapsedLinkAt(view.state);
   if (!info) return;
   view.dispatch({
      changes: { from: info.from, to: info.to, insert: info.label },
      selection: { anchor: info.from + info.label.length },
   });
   view.focus();
}

/** lucide iconNode SVG (v0.562.0) as inline markup (imperative DOM, no React) - matches the format bar's glyph style. */
// ArrowUpRight: follow / open the link.
const OPEN_GLYPH =
   '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg>';
// Link2: change the link's target (destination).
const CHANGE_GLYPH =
   '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/></svg>';
// Type: edit the link's label (text).
const LABEL_GLYPH =
   '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v16"/><path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2"/><path d="M9 20h6"/></svg>';
// Unlink: unwrap (remove) the link, keeping its words. NOT a destructive delete - app-theme color, not destructive.
const REMOVE_GLYPH =
   '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71"/><path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71"/><line x1="8" x2="8" y1="2" y2="5"/><line x1="2" x2="5" y1="8" y2="8"/><line x1="16" x2="16" y1="19" y2="22"/><line x1="19" x2="22" y1="16" y2="16"/></svg>';

/** A thin vertical rule grouping the edit actions apart from Remove (matches the format bar's separator). */
function buildSeparator(): HTMLElement {
   const sep = document.createElement('span');
   sep.className = 'cm-note-format-sep';
   sep.setAttribute('aria-hidden', 'true');
   return sep;
}

/** Builds one icon control button. mousedown is swallowed so the editor keeps its caret inside the link. */
function buildButton(glyph: string, label: string, onClick: () => void): HTMLButtonElement {
   const btn = document.createElement('button');
   btn.type = 'button';
   btn.className = 'cm-note-format-btn';
   btn.title = label;
   btn.setAttribute('aria-label', label);
   btn.innerHTML = glyph;
   btn.onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); };
   btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); onClick(); };
   return btn;
}

/** The overlay ViewPlugin: owns the floating link-edit bar, shown/positioned when a collapsed caret is inside a link. */
function linkEditOverlay(controller: LinkEditController) {
   return ViewPlugin.fromClass(
      class implements PluginValue {
         private bar: HTMLElement | null = null;
         // Last reported caret-link key (mobile only); a sentinel so the first sync always reports.
         private reportedKey: string | null | undefined = undefined;

         constructor(view: EditorView) {
            // Mobile reports the caret link to a sheet, so it never builds the floating bar.
            if (!controller.onCaretLinkChange) {
               this.bar = document.createElement('div');
               this.bar.className = 'cm-note-format-bar';
               this.bar.style.display = 'none';
               this.bar.setAttribute('contenteditable', 'false');
               // Each handler reads the CURRENT link at click time (the bar is built once), never a stale range.
               this.bar.appendChild(buildButton(OPEN_GLYPH, controller.labels.open, () => {
                  const info = collapsedLinkAt(view.state);
                  if (info) controller.onOpen(info.href);
               }));
               this.bar.appendChild(buildButton(CHANGE_GLYPH, controller.labels.changeTarget, () => {
                  const info = collapsedLinkAt(view.state);
                  if (info) controller.onChangeTarget({ from: info.from, to: info.to, label: info.label, href: info.href });
               }));
               this.bar.appendChild(buildButton(LABEL_GLYPH, controller.labels.editLabel, () => editLabel(view)));
               this.bar.appendChild(buildSeparator());
               this.bar.appendChild(buildButton(REMOVE_GLYPH, controller.labels.remove, () => removeLink(view)));

               // Lives in the scroller (stable DOM; CM6 owns and reconciles `.cm-content`).
               view.scrollDOM.appendChild(this.bar);
            }
            this.sync(view);
         }

         update(update: ViewUpdate) {
            if (update.selectionSet || update.docChanged || update.geometryChanged || update.viewportChanged || update.focusChanged) {
               this.sync(update.view);
            }
         }

         /**
          * Shows/hides the bar (a collapsed caret inside a link), then positions it in a `requestMeasure` - CM6
          * forbids reading layout during an update, so `coordsAtPos` lands in the measure phase. The display
          * toggle is a plain style write (no layout read), safe here.
          */
         private sync(view: EditorView) {
            const info = controller.editable ? collapsedLinkAt(view.state) : null;
            // Mobile: report the caret's link (deduped by identity) and never touch the bar.
            if (controller.onCaretLinkChange) {
               const key = info ? `${info.from}:${info.to}:${info.href}` : null;
               if (key !== this.reportedKey) {
                  this.reportedKey = key;
                  controller.onCaretLinkChange(info);
               }
               return;
            }
            const bar = this.bar;
            if (!bar) return;
            bar.style.display = info ? 'flex' : 'none';
            if (!info) return;
            const anchor = info.from;
            view.requestMeasure({
               read: () => {
                  const coords = view.coordsAtPos(anchor);
                  return coords ? this.barPosition(view, bar, coords) : null;
               },
               write: (pos) => {
                  if (!pos) {
                     // No coords for the link start (off-screen): keep it hidden rather than mispositioned.
                     bar.style.display = 'none';
                     return;
                  }
                  bar.style.left = `${pos.left}px`;
                  bar.style.top = `${pos.top}px`;
               },
            });
         }

         /** The bar's target: above the link start, flipping below near the scroller top; edge-clamped (mirrors the format bar). */
         private barPosition(view: EditorView, bar: HTMLElement, coords: { left: number; top: number; bottom: number }): { left: number; top: number } {
            const scroller = view.scrollDOM;
            const scrollerRect = scroller.getBoundingClientRect();
            const barRect = bar.getBoundingClientRect();

            const rawTop = coords.top - scrollerRect.top + scroller.scrollTop - barRect.height - 8;
            const flipped = rawTop < scroller.scrollTop + 2;
            const top = flipped ? coords.bottom - scrollerRect.top + scroller.scrollTop + 8 : rawTop;
            let left = coords.left - scrollerRect.left + scroller.scrollLeft - barRect.width / 2;
            const maxLeft = scroller.clientWidth - barRect.width - 4;
            left = Math.max(4, Math.min(left, Math.max(4, maxLeft)));
            return { left, top };
         }

         destroy() {
            this.bar?.remove();
         }
      },
   );
}

/** The floating link-edit bar extension (Live/Source), bound to a controller (labels + open/change-target callbacks). */
export function linkEditToolbar(controller: LinkEditController): Extension {
   return [linkEditOverlay(controller)];
}
