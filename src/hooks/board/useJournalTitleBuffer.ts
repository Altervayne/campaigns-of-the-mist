// -- React Imports --
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// -- Hook Imports --
import { useCommitOnUnmount } from '@/hooks/useCommitOnUnmount';

// -- Type Imports --
import type { Journal } from '@/lib/types/board';

interface UseJournalTitleBufferArgs {
   journal: Journal;
   isEditing: boolean;
   commitJournal: (next: Journal) => void;
}

/*
 * The title is a single-line markdown heading, held in its own buffer and committed on blur. Like the
 * bookmark label it also flushes on the editable->false edge: deselecting swaps the input for the
 * rendered title in place (no unmount, maybe no blur), which would otherwise strand a just-typed title.
 * Call it AFTER the page buffer - both commits derive from the same journal snapshot.
 */
export function useJournalTitleBuffer({ journal, isEditing, commitJournal }: UseJournalTitleBufferArgs) {
   const [titleText, setTitleText] = useState(journal.title);
   const [titleSync, setTitleSync] = useState(journal.title);
   if (titleSync !== journal.title) { setTitleSync(journal.title); setTitleText(journal.title); }
   const commitTitle = () => { if (titleText !== journal.title) commitJournal({ ...journal, title: titleText }); };
   useCommitOnUnmount(commitTitle);
   const wasEditingTitle = useRef(isEditing);
   useEffect(() => {
      const was = wasEditingTitle.current;
      wasEditingTitle.current = isEditing;
      if (was && !isEditing) commitTitle();
   });
   // The title editor is a textarea that grows with its content (Enter adds a line, never commits); resize
   // it to fit on every change and when it (re)mounts on entering editing.
   const titleAreaRef = useRef<HTMLTextAreaElement | null>(null);
   useLayoutEffect(() => {
      const el = titleAreaRef.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
   }, [titleText, isEditing]);

   return { titleText, setTitleText, commitTitle, titleAreaRef };
}
