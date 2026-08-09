// -- React Imports --
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Data Imports --
import { extractHeadings } from '@/lib/notes/noteOutline';

// -- Component Imports --
import { LinkTargetList } from '@/components/molecules/links/LinkTargetList';

// -- Portals Imports --
import { buildLinkMarkdown } from '@/lib/portals/buildLinkToken';

// -- Type Imports --
import type { LinkInsertTarget } from '@/lib/portals/buildLinkToken';
import type { LinkEditSeed } from '@/components/organisms/note/live/linkNode';
import type { NoteEditorHandle } from '@/components/organisms/note/NoteEditor';

/*
 * The note-INSERT host around the shared `LinkTargetList`: it owns the CM6 seam the target list stays clear of.
 * On open it snapshots the editor's selection + buffer once, feeds the buffer's headings in as the "in this note"
 * sections, and on a pick builds `[label](href)` (the id-kind rule lives in `buildLinkToken`) and splices it back
 * through the granular editor-handle path so undo stays clean. The label is the selected text when there was a
 * selection, else the target's own name (overridable at a collapsed caret).
 *
 * With an `editSeed` (the caret bar's Change-target) it REPLACES an existing link instead of inserting at the
 * caret: the splice covers the whole `[label](href)` node range and the label is FIXED to the seed's, so only
 * the target changes.
 */

interface NoteLinkPickerProps {
   /** Accessor for the live editor handle: the picker snapshots its selection/buffer once, on mount. */
   getEditor: () => NoteEditorHandle | null;
   /** Closes the picker after an insert (or a dismiss). */
   onClose: () => void;
   /** When set, REPLACE this link's target (keep its label) instead of inserting at the caret. */
   editSeed?: LinkEditSeed;
   /** Full-bleed width for a mobile sheet host; default is the fixed popover width for the desktop toolbar. */
   fullWidth?: boolean;
}

export function NoteLinkPicker({ getEditor, onClose, editSeed, fullWidth }: NoteLinkPickerProps) {
   const { t } = useTranslation();
   // Snapshot the editor's selection + buffer ONCE at open (the picker remounts per open, so a lazy initializer
   // captures the live state without a render-time effect). The selection is the label source; the buffer is the
   // same-note section list; the range is the splice target - all frozen so nav inside the popover can't shift them.
   const [snapshot] = useState(() => {
      const editor = getEditor();
      if (!editor) return { from: 0, to: 0, body: '', selectedText: '' };
      const { from, to } = editor.getSelection();
      const body = editor.getValue();
      return { from, to, body, selectedText: body.slice(from, to) };
   });
   const { body: noteBody, selectedText } = snapshot;
   const hasSelection = snapshot.from !== snapshot.to;
   // Collapsed-caret only: an optional label override; empty falls back to the target's own name at pick time.
   const [labelOverride, setLabelOverride] = useState('');

   // The buffer's headings, extracted once per open; the target list narrows them by its own search text.
   const sections = useMemo(() => extractHeadings(noteBody), [noteBody]);

   /**
    * Resolves the label for a pick. In EDIT mode the seed's label is kept (only the target changes); otherwise
    * the selection when present, else the override, else the target's own name.
    */
   const labelFor = (defaultName: string): string => {
      if (editSeed) return editSeed.label.trim() || defaultName;
      return (hasSelection ? selectedText : labelOverride.trim() || defaultName).trim() || defaultName;
   };

   const insert = (target: LinkInsertTarget, defaultName: string): void => {
      const markdown = buildLinkMarkdown(labelFor(defaultName), target);
      const editor = getEditor();
      // EDIT mode splices over the whole link node range; INSERT mode over the snapshot selection (caret).
      const [from, to] = editSeed ? [editSeed.from, editSeed.to] : [snapshot.from, snapshot.to];
      editor?.splice(from, to, markdown, from + markdown.length);
      onClose();
   };

   return (
      // Mobile (fullWidth) fills the sheet as a flex column so the target list flexes to the full height; the
      // desktop popover stays content-height at a fixed width.
      <div className={fullWidth ? 'flex min-h-0 flex-1 flex-col' : 'w-[28rem] max-w-[calc(100vw-2rem)]'}>
         {/* Label control: an edit keeps the existing label (fixed); a live selection IS the label (fixed); a
             collapsed caret gets an optional override. */}
         {editSeed ? (
            <div className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
               {t('NoteView.linkPicker.keepingLabel', { text: editSeed.label })}
            </div>
         ) : hasSelection ? (
            <div className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
               {t('NoteView.linkPicker.usingSelection', { text: selectedText })}
            </div>
         ) : (
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
               <span className="shrink-0 text-xs font-medium text-muted-foreground">{t('NoteView.linkPicker.label')}</span>
               <input
                  type="text"
                  value={labelOverride}
                  onChange={(event) => setLabelOverride(event.target.value)}
                  placeholder={t('NoteView.linkPicker.labelPlaceholder')}
                  className="min-w-0 flex-1 bg-transparent text-sm text-popover-foreground placeholder:text-muted-foreground focus:outline-none"
               />
            </div>
         )}

         <LinkTargetList sections={sections} onPick={insert} fill={fullWidth} />
      </div>
   );
}
