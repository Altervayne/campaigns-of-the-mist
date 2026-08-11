// -- React Imports --
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import cuid from 'cuid';

// -- Icon Imports --
import { Plus } from 'lucide-react';

// -- Component Imports --
import { RollTableEntryRow } from './rolltable/RollTableEntryRow';
import { RollTableFooter } from './rolltable/RollTableFooter';
import { RollTableReadView } from './rolltable/RollTableReadView';

// -- Hook Imports --
import { useCommitOnUnmount } from '@/hooks/useCommitOnUnmount';

// -- Type Imports --
import type { BoardItem, BoardItemContent, RollTableBoardContent } from '@/lib/types/board';
import type { RollTableEntry } from '@/lib/rolltable/types';

/*
 * A roll table board item: an editable title over a list of weighted entries (a weight number + result
 * text), with a pinned footer that rolls and shows the result. The title and entries are held in a local
 * draft; text/weight edits commit once on blur (one undoable command per edit session, since
 * `updateItemContent` is not coalescible), while structural edits (add / remove / reorder) commit
 * immediately. The draft re-syncs from the store on an external change (undo/redo) via the
 * adjust-state-during-render pattern, and flushes on unmount for the board's tab-switch case.
 *
 * Selecting is decoupled from editing: a selected-but-not-editing table shows a plain read view that
 * drags to move, and the editing sub-state swaps in the fields. The footer is always present. Rolling
 * reads the committed content and writes through a non-undoable cache (in the footer), independent of the
 * edit draft. Every field / control stops pointer propagation so typing or a text selection never starts
 * a canvas move.
 */

interface RollTableDraft {
   title: string;
   entries: RollTableEntry[];
}

interface RollTableItemProps {
   /** The board item (its rect anchors a minted mention tracker beside the table). */
   item: BoardItem;
   content: RollTableBoardContent;
   /** Editing sub-state: mounts the editable fields over the read view. */
   isEditing: boolean;
   onContentChange: (content: BoardItemContent) => void;
   /** Direct, non-undoable write, used to cache a settled roll. */
   onCacheLastKnown: (id: string, content: BoardItemContent) => void;
   onRequestSelect: () => void;
}

function entriesMatch(a: RollTableEntry[], b: RollTableEntry[]): boolean {
   if (a.length !== b.length) return false;
   return a.every((entry, index) => entry.id === b[index].id && entry.weight === b[index].weight && entry.text === b[index].text);
}

export function RollTableItem({ item, content, isEditing, onContentChange, onCacheLastKnown, onRequestSelect }: RollTableItemProps) {
   const { t } = useTranslation();

   const [draft, setDraft] = useState<RollTableDraft>({ title: content.title, entries: content.entries });
   // Re-sync from the store on an external content change (undo/redo). Reference-compared: while typing
   // only the draft changes (commit is on blur), so the store content is unchanged and this never clobbers
   // an in-progress edit.
   const [synced, setSynced] = useState(content);
   if (content !== synced) {
      setSynced(content);
      setDraft({ title: content.title, entries: content.entries });
   }

   // Commits read the latest draft / content from refs, so they stay correct from a blur, a structural
   // action, or the unmount flush regardless of render timing.
   const draftRef = useRef(draft);
   const contentRef = useRef(content);
   useEffect(() => { draftRef.current = draft; contentRef.current = content; });

   const commit = useCallback(() => {
      const current = contentRef.current;
      const next = draftRef.current;
      if (next.title === current.title && entriesMatch(next.entries, current.entries)) return;
      onContentChange({ ...current, title: next.title, entries: next.entries });
   }, [onContentChange]);

   // A tab switch unmounts the board without a blur; flush the buffered edits so they aren't lost.
   useCommitOnUnmount(commit);

   // Leaving edit mode (Escape / deselect) swaps in the read view without unmounting the item, so a
   // focused field never fires its blur and the unmount flush never runs. Commit on that transition so
   // buffered text / weight edits are not lost. The no-op guard in `commit` keeps a session to one command.
   const wasEditing = useRef(isEditing);
   useEffect(() => {
      if (wasEditing.current && !isEditing) commit();
      wasEditing.current = isEditing;
   }, [isEditing, commit]);

   // Structural edits apply to the draft and persist at once (one undoable command each). Building from
   // the ref folds in any field edit already buffered in the draft, so nothing typed is lost.
   const applyStructural = (next: RollTableDraft) => {
      setDraft(next);
      onContentChange({ ...contentRef.current, title: next.title, entries: next.entries });
   };

   const setTitle = (title: string) => setDraft((current) => ({ ...current, title }));
   const setEntryText = (id: string, text: string) =>
      setDraft((current) => ({ ...current, entries: current.entries.map((entry) => (entry.id === id ? { ...entry, text } : entry)) }));
   const setEntryWeight = (id: string, weight: number) =>
      setDraft((current) => ({ ...current, entries: current.entries.map((entry) => (entry.id === id ? { ...entry, weight } : entry)) }));

   const addEntry = () => {
      const current = draftRef.current;
      applyStructural({ ...current, entries: [...current.entries, { id: cuid(), weight: 1, text: '' }] });
   };
   const removeEntry = (id: string) => {
      const current = draftRef.current;
      applyStructural({ ...current, entries: current.entries.filter((entry) => entry.id !== id) });
   };
   const moveEntry = (id: string, direction: -1 | 1) => {
      const current = draftRef.current;
      const index = current.entries.findIndex((entry) => entry.id === id);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= current.entries.length) return;
      const entries = [...current.entries];
      [entries[index], entries[target]] = [entries[target], entries[index]];
      applyStructural({ ...current, entries });
   };

   const stopDrag = (event: ReactPointerEvent) => event.stopPropagation();

   const editBody = (
      <>
         <input
            type="text"
            value={draft.title}
            onChange={(event) => setTitle(event.target.value)}
            onFocus={onRequestSelect}
            onBlur={commit}
            onPointerDown={stopDrag}
            placeholder={t('BoardView.rollTableTitlePlaceholder')}
            className="shrink-0 border-b border-border bg-transparent px-2 py-1.5 text-sm font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground/60"
         />
         <div className="flex flex-col gap-1.5 p-2">
            {draft.entries.map((entry, index) => (
               <RollTableEntryRow
                  key={entry.id}
                  entry={entry}
                  index={index}
                  count={draft.entries.length}
                  textPlaceholder={t('BoardView.rollTableEntryPlaceholder')}
                  weightLabel={t('BoardView.rollTableWeightLabel')}
                  removeLabel={t('BoardView.rollTableRemoveEntry')}
                  moveUpLabel={t('BoardView.rollTableMoveEntryUp')}
                  moveDownLabel={t('BoardView.rollTableMoveEntryDown')}
                  onTextChange={setEntryText}
                  onWeightChange={setEntryWeight}
                  onRemove={removeEntry}
                  onMove={moveEntry}
                  onCommit={commit}
                  onFieldFocus={onRequestSelect}
               />
            ))}
            <button
               type="button"
               onPointerDown={stopDrag}
               onClick={addEntry}
               className="mt-0.5 flex items-center gap-1.5 self-start rounded-sm px-1.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
               <Plus className="h-3.5 w-3.5" />
               {t('BoardView.rollTableAddEntry')}
            </button>
         </div>
      </>
   );

   return (
      <div className="flex min-h-0 w-full flex-1 flex-col bg-card text-card-foreground">
         {isEditing ? editBody : (
            <RollTableReadView
               title={draft.title}
               entries={draft.entries}
               titlePlaceholder={t('BoardView.rollTableTitlePlaceholder')}
               entryPlaceholder={t('BoardView.rollTableEntryPlaceholder')}
            />
         )}

         {/* Flexible slack: when dragged taller than its content, the extra space lands here so the footer
             stays pinned to the bottom (the box reads its floor as height minus this spacer). */}
         <div data-board-fill-spacer className="min-h-0 flex-1" />

         {/* Rolling uses the committed content, so it stays correct regardless of the edit draft. */}
         <RollTableFooter item={item} content={content} onCacheLastKnown={onCacheLastKnown} />
      </div>
   );
}
