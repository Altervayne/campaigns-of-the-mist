// -- React Imports --
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import cuid from 'cuid';

// -- Icon Imports --
import { Plus } from 'lucide-react';

// -- Component Imports --
import { RollTableEntryRow } from './rolltable/RollTableEntryRow';
import { RollTableFooter } from './rolltable/RollTableFooter';
import { RollTableHeader } from './rolltable/RollTableHeader';
import { RollTableReadView } from './rolltable/RollTableReadView';

// -- Hook Imports --
import { useCommitOnUnmount } from '@/hooks/useCommitOnUnmount';
import { useRollTableRoll } from '@/hooks/board/useRollTableRoll';

// -- Utils Imports --
import { computeEntryLabels, computeRangeStarts, normalizeRollTableContent, rangeEndToWeight } from '@/lib/rolltable/rollTableDisplay';

// -- Type Imports --
import type { BoardItem, BoardItemContent, RollTableBoardContent } from '@/lib/types/board';
import type { RollTableDisplay, RollTableEntry } from '@/lib/rolltable/types';

/*
 * A roll table board item: a header (title + a display-mode toggle when selected) over a list of weighted
 * entries (a weight number + result text) rendered as ruled rows, with a pinned footer that rolls and
 * shows the result. The title and entries are held in a local draft; text/weight edits commit once on blur
 * (one undoable command per edit session, since `updateItemContent` is not coalescible), while structural
 * edits (add / remove / reorder / display mode) commit immediately. The draft re-syncs from the store on
 * an external change (undo/redo) via the adjust-state-during-render pattern, and flushes on unmount for the
 * board's tab-switch case.
 *
 * Selecting is decoupled from editing: a selected-but-not-editing table shows a plain read view that drags
 * to move, and the editing sub-state swaps in the fields. The footer is always present. Rolling reads the
 * committed content through the shared roll hook and writes via a non-undoable cache, independent of the
 * edit draft; its live state highlights the landing row and shows the live text. Every field / control
 * stops pointer propagation so typing or a text selection never starts a canvas move.
 */

interface RollTableDraft {
   title: string;
   entries: RollTableEntry[];
}

interface RollTableItemProps {
   /** The board item (its rect anchors a minted mention tracker beside the table). */
   item: BoardItem;
   content: RollTableBoardContent;
   /** Selection state: reveals the display-mode toggle in the header. */
   isSelected: boolean;
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

export function RollTableItem({ item, content, isSelected, isEditing, onContentChange, onCacheLastKnown, onRequestSelect }: RollTableItemProps) {
   const { t } = useTranslation();

   // Default the display mode without rewriting saved data; the field persists once a commit spreads it.
   const normalized = useMemo(() => normalizeRollTableContent(content), [content]);
   const display = normalized.display ?? 'range';

   const [draft, setDraft] = useState<RollTableDraft>({ title: content.title, entries: content.entries });
   // Re-sync from the store on an external content change (undo/redo). Reference-compared against the raw
   // prop: while typing only the draft changes (commit is on blur), so the store content is unchanged and
   // this never clobbers an in-progress edit.
   const [synced, setSynced] = useState(content);
   if (content !== synced) {
      setSynced(content);
      setDraft({ title: content.title, entries: content.entries });
   }

   // Commits read the latest draft / content from refs, so they stay correct from a blur, a structural
   // action, or the unmount flush regardless of render timing. The content ref holds the normalized shape
   // so every commit carries `display`.
   const draftRef = useRef(draft);
   const contentRef = useRef(normalized);
   useEffect(() => { draftRef.current = draft; contentRef.current = normalized; });

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
   // Editing a range end sets the weight from the row's derived start; following rows re-derive their
   // start on the next render, so their ranges reflow automatically.
   const setEntryEnd = (id: string, end: number) =>
      setDraft((current) => {
         const starts = computeRangeStarts(current.entries);
         return { ...current, entries: current.entries.map((entry, index) => (entry.id === id ? { ...entry, weight: rangeEndToWeight(end, starts[index]) } : entry)) };
      });

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

   // Toggling the display mode is a normal undoable content change; folds any buffered draft edits in.
   const setDisplay = (next: RollTableDisplay) => {
      if (next === contentRef.current.display) return;
      const current = draftRef.current;
      onContentChange({ ...contentRef.current, title: current.title, entries: current.entries, display: next });
   };

   const { roll, liveIndex, liveText, isRolling } = useRollTableRoll({ item, content: normalized, onCacheLastKnown });

   const labels = useMemo(() => computeEntryLabels(draft.entries, display), [draft.entries, display]);
   const starts = useMemo(() => computeRangeStarts(draft.entries), [draft.entries]);
   // The last-rolled row stays lit, tracked by entry id so it follows reorders and edits and simply drops
   // out if that row is deleted. During a roll the hook's liveIndex takes over the read view instead.
   const highlightId = normalized.lastRoll?.entryId ?? null;
   const stopDrag = (event: ReactPointerEvent) => event.stopPropagation();

   return (
      <div className="flex min-h-0 w-full flex-1 flex-col bg-card text-card-foreground">
         <RollTableHeader
            isEditing={isEditing}
            isSelected={isSelected}
            title={draft.title}
            titlePlaceholder={t('BoardView.rollTableTitlePlaceholder')}
            display={display}
            onTitleChange={setTitle}
            onTitleCommit={commit}
            onTitleFocus={onRequestSelect}
            onDisplayChange={setDisplay}
            displayModeLabel={t('BoardView.rollTableDisplayModeLabel')}
            rangeLabel={t('BoardView.rollTableDisplayRange')}
            weightLabel={t('BoardView.rollTableDisplayWeight')}
            percentLabel={t('BoardView.rollTableDisplayPercent')}
         />

         {isEditing ? (
            <div className="flex flex-col">
               <div className="flex flex-col divide-y divide-border">
                  {draft.entries.map((entry, index) => (
                     <RollTableEntryRow
                        key={entry.id}
                        entry={entry}
                        index={index}
                        count={draft.entries.length}
                        display={display}
                        start={starts[index]}
                        textPlaceholder={t('BoardView.rollTableEntryPlaceholder')}
                        weightLabel={t('BoardView.rollTableWeightLabel')}
                        removeLabel={t('BoardView.rollTableRemoveEntry')}
                        moveUpLabel={t('BoardView.rollTableMoveEntryUp')}
                        moveDownLabel={t('BoardView.rollTableMoveEntryDown')}
                        hint={display === 'percent' ? labels[index] : undefined}
                        highlighted={entry.id === highlightId}
                        onTextChange={setEntryText}
                        onWeightChange={setEntryWeight}
                        onEndChange={setEntryEnd}
                        onRemove={removeEntry}
                        onMove={moveEntry}
                        onCommit={commit}
                        onFieldFocus={onRequestSelect}
                     />
                  ))}
               </div>
               <div className="flex flex-col p-2">
                  <button
                     type="button"
                     onPointerDown={stopDrag}
                     onClick={addEntry}
                     className="flex items-center justify-center gap-1 rounded border border-dashed border-border py-1 text-xs text-muted-foreground hover:border-foreground hover:text-foreground cursor-pointer"
                  >
                     <Plus className="h-3 w-3" />
                     {t('BoardView.rollTableAddEntry')}
                  </button>
               </div>
            </div>
         ) : (
            <RollTableReadView
               entries={draft.entries}
               labels={labels}
               liveIndex={liveIndex}
               highlightId={highlightId}
               entryPlaceholder={t('BoardView.rollTableEntryPlaceholder')}
            />
         )}

         {/* Flexible slack: when dragged taller than its content, the extra space lands here so the footer
             stays pinned to the bottom (the box reads its floor as height minus this spacer). */}
         <div data-board-fill-spacer className="min-h-0 flex-1" />

         {/* Rolling uses the committed content via the shared hook, so it stays correct regardless of the
             edit draft. */}
         <RollTableFooter item={item} content={normalized} liveText={liveText} isRolling={isRolling} onRoll={roll} />
      </div>
   );
}
