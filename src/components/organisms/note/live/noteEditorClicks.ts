// -- CodeMirror Imports --
import { EditorView } from '@codemirror/view';

// -- Live-Preview Imports --
import { linkNodeAt } from './linkNode';
import { findImageTokens } from '@/lib/notes/noteImageHint';

/**
 * Clicking a rendered image widget selects it: place the caret inside that image token's span so the image
 * StateField marks it selected (ring + handles + align bar appear). A click on the handle / align button is
 * ignored here (they stop propagation and own their gesture). Returns false so CM6 keeps its normal handling.
 */
export function selectImageOnClick(event: MouseEvent, view: EditorView): boolean {
   const target = event.target as HTMLElement | null;
   if (!target) return false;
   if (target.closest('.cm-note-image-handle, .cm-note-image-align')) return false;
   const figure = target.closest('[data-note-image]') as HTMLElement | null;
   if (!figure) return false;
   const pos = view.posAtDOM(figure);
   const token = findImageTokens(view.state.doc.toString()).find((tk) => pos >= tk.index && pos <= tk.index + tk.length);
   if (!token) return false;
   event.preventDefault();
   view.dispatch({ selection: { anchor: token.index + 1 } });
   view.focus();
   return true;
}

/**
 * Ctrl/Cmd-click follows the link under the pointer: hit-test the enclosing Lezer `Link` node, extract its
 * destination, and hand it to `onLinkActivate` (the renderer resolves it against its host). Plain click is left
 * alone so it edits (caret). Returns whether it handled the event.
 */
export function activateLinkOnModClick(event: MouseEvent, view: EditorView, onLinkActivate?: (href: string) => void): boolean {
   if (!onLinkActivate || !(event.ctrlKey || event.metaKey)) return false;
   const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
   if (pos == null) return false;
   const href = linkNodeAt(view.state, pos)?.href;
   if (!href) return false;
   event.preventDefault();
   onLinkActivate(href);
   return true;
}
