// -- React Imports --
import { useEffect, useRef, useState } from 'react';

// -- Hook Imports --
import { useCommitOnUnmount } from '@/hooks/useCommitOnUnmount';

// -- Type Imports --
import type { Journal, JournalPage } from '@/lib/types/board';

interface UseJournalPageBufferArgs {
   journal: Journal;
   /** The rendered page list (the sentinel fallback already applied), so a commit rebuilds what is shown. */
   pages: JournalPage[];
   activePage: JournalPage;
   isEditing: boolean;
   /** Focus the page body when editing engages (the board only). */
   autoFocusEditor: boolean;
   commitJournal: (next: Journal) => void;
}

/*
 * The active page's text buffer, held whole: the buffer, its render-phase reset, the commit, and the two
 * flush paths that fire without a blur. It lives in the journal's own scope rather than in a page-editor
 * component because the insert / reorder / remove handlers read the live buffer. Call it BEFORE the title
 * buffer: both commits derive from the same journal snapshot, so the page flush must register first.
 */
export function useJournalPageBuffer({ journal, pages, activePage, isEditing, autoFocusEditor, commitJournal }: UseJournalPageBufferArgs) {
   const [text, setText] = useState(activePage.text);

   // Reset the buffer when the active page changes (switch, add/remove, undo/redo) via React's
   // adjust-state-during-render pattern. Keyed by page id + stored text, so typing (which
   // leaves both untouched) never resets the buffer mid-edit.
   const [sync, setSync] = useState({ id: activePage.id, stored: activePage.text });
   if (sync.id !== activePage.id || sync.stored !== activePage.text) {
      setSync({ id: activePage.id, stored: activePage.text });
      setText(activePage.text);
   }

   const commit = () => {
      if (text !== activePage.text) commitJournal({ ...journal, pages: pages.map((page) => (page.id === activePage.id ? { ...page, text } : page)) });
   };

   // A tab switch unmounts the board without a blur; flush the active page's buffer so it isn't lost.
   useCommitOnUnmount(commit);

   // Entering editing focuses the page body on the next frame - deferred past the promoting click's own focus
   // handling (which lands on the box body and would otherwise blur the freshly mounted textarea). Caret to
   // the END, the natural place to keep writing; the title stays a secondary click-in field.
   const pageAreaRef = useRef<HTMLTextAreaElement | null>(null);
   useEffect(() => {
      if (!isEditing || !autoFocusEditor) return;
      const raf = requestAnimationFrame(() => {
         const el = pageAreaRef.current;
         if (!el) return;
         el.focus();
         const end = el.value.length;
         el.setSelectionRange(end, end);
      });
      return () => cancelAnimationFrame(raf);
   }, [isEditing, autoFocusEditor]);

   // Leaving editing swaps the page textarea for the rendered Markdown in place (no unmount, no blur), so
   // flush the page buffer on the editing->false edge. Dirty-guarded, so a normal blur-then-exit no-ops.
   const wasEditingPage = useRef(isEditing);
   useEffect(() => {
      const was = wasEditingPage.current;
      wasEditingPage.current = isEditing;
      if (was && !isEditing) commit();
   });

   return { text, setText, commit, pageAreaRef };
}
