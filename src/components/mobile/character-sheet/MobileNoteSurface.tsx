// -- React Imports --
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Library Imports --
import { useStore } from 'zustand';

// -- Custom Hooks --
import { useInputDebouncer } from '@/hooks/useInputDebouncer';
import { useCommitOnUnmount } from '@/hooks/useCommitOnUnmount';
import { useNoteImageInsertion } from '@/hooks/useNoteImageInsertion';

// -- Asset Pipeline --
import { ACCEPT_IMAGE } from '@/lib/utils/fileAccept';

// -- Component Imports --
import { NoteDocument } from '@/components/molecules/NoteDocument';
import { NoteEditor } from '@/components/organisms/note/NoteEditor';
import { MobileNoteTopBar } from '@/components/mobile/character-sheet/MobileNoteTopBar';
import { MobileNoteEditingBar } from '@/components/mobile/character-sheet/MobileNoteEditingBar';
import { MobileNoteOutlineSheet } from '@/components/mobile/character-sheet/MobileNoteOutlineSheet';
import { MobileNoteTableSheet } from '@/components/mobile/character-sheet/MobileNoteTableSheet';

// -- Store Imports --
import { useActiveNoteInstance } from '@/lib/notes/ActiveNoteStoreContext';
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';

// -- Autofocus Seam --
import { consumeNoteJustCreated } from '@/lib/notes/noteAutofocus';

// -- Type Imports --
import type { NoteStore } from '@/lib/stores/noteStore';
import type { NoteEditorHandle } from '@/components/organisms/note/NoteEditor';
import type { NoteMode } from '@/components/organisms/note/NoteToolbar';
import type { NoteHeading } from '@/lib/notes/noteOutline';
import type { CoverController } from '@/components/organisms/note/live/coverGutter';
import type { FormatController } from '@/components/organisms/note/live/formatToolbar';
import type { LinkEditController } from '@/components/organisms/note/live/linkEditToolbar';
import type { TableController, TableContextRequest } from '@/components/organisms/note/live/tableWidget';
import type { NoteCover } from '@/lib/types/board';

interface MobileNoteSurfaceProps {
   /** Opens the workspace switcher (owned by the page), mirrored into the top bar's Layers trigger. */
   onOpenSwitcher: () => void;
   /** Reports whether the docked editing bar is showing, so the page can seat the nav FAB into it. */
   onEditingActiveChange?: (active: boolean) => void;
}

/*
 * Mobile note workspace surface. Fills the workspace slot while a note tab is active, reading the ACTIVE NOTE
 * instance the same way the desktop NoteView does. It is remounted per note id so its buffers never cross
 * documents.
 */
export default function MobileNoteSurface({ onOpenSwitcher, onEditingActiveChange }: MobileNoteSurfaceProps) {
   const store = useActiveNoteInstance();
   if (!store) return null;
   return <MobileNoteSurfaceInner key={store.getState().noteId ?? 'note'} store={store} onOpenSwitcher={onOpenSwitcher} onEditingActiveChange={onEditingActiveChange} />;
}

/** The bound surface, split out so the store subscription runs on a guaranteed-non-null instance. */
function MobileNoteSurfaceInner({ store, onOpenSwitcher, onEditingActiveChange }: { store: NoteStore; onOpenSwitcher: () => void; onEditingActiveChange?: (active: boolean) => void }) {
   const { t } = useTranslation();

   const noteId = useStore(store, (state) => state.noteId);
   const note = useStore(store, (state) => state.note);
   const cover = useStore(store, (state) => state.note?.cover);
   const canUndo = useStore(store, (state) => state.canUndo);
   const canRedo = useStore(store, (state) => state.canRedo);
   const { updateTitle, updateBody, setCover, clearCover, flush, setUndoAvailability } = store.getState().actions;

   const isLeftHanded = useAppSettingsStore((state) => state.mobileHandedness) === 'left';
   const isMobileFABMode = useAppSettingsStore((state) => state.isMobileFABMode);

   // Reading <-> Edit (Edit = Live); Source is demoted to the top bar's overflow. A note opens in Edit so it is
   // one tap from writing, but Live does not autofocus, so an OPENED note is readable at rest with no keyboard.
   const [mode, setMode] = useState<NoteMode>('live');
   const isEditing = mode === 'live' || mode === 'source';
   const modeRef = useRef(mode);
   modeRef.current = mode;

   // Report edit-mode up so the page can seat the nav FAB into the docked editing bar (Reading has no bar).
   // The cleanup clears it on unmount (a tab switch fires no explicit toggle).
   useEffect(() => {
      onEditingActiveChange?.(isEditing);
      return () => onEditingActiveChange?.(false);
   }, [isEditing, onEditingActiveChange]);

   // Buffer title + body locally; the debouncer flushes each on unmount (a tab switch fires no blur). The store
   // `flush` is the belt.
   const [localTitle, setLocalTitle] = useInputDebouncer(note?.title ?? '', updateTitle);
   const [localBody, setLocalBody] = useInputDebouncer(note?.body ?? '', updateBody);
   useCommitOnUnmount(flush);

   const editorRef = useRef<NoteEditorHandle>(null);
   const getEditor = useCallback(() => editorRef.current, []);

   // The ONE bounded scroll region below the top bar - the mobile "desk". CM6's own scroller is overflow:visible,
   // so this is the scrollable ancestor `scrollToPos` walks to, and the only scroller (no nested-scroll trap).
   const scrollRef = useRef<HTMLDivElement>(null);

   const [isOutlineOpen, setIsOutlineOpen] = useState(false);

   // The table slide-up. `tableCaret` (the caret's table cell, or null) arms the editing bar's Table chip;
   // tapping the chip builds a request from it and opens the sticky sheet. The sheet lives on `tableRequest`,
   // not on `tableCaret`, so dropping the keyboard (which clears the caret) never closes it.
   const [tableCaret, setTableCaret] = useState<{ tablePos: number; row: number; col: number } | null>(null);
   const [tableRequest, setTableRequest] = useState<TableContextRequest | null>(null);

   const openTableSheet = useCallback(() => {
      if (!tableCaret) return;
      const request = editorRef.current?.buildTableRequest(tableCaret.tablePos, tableCaret.row, tableCaret.col);
      if (!request) return;
      setTableRequest(request);
      // Drop the soft keyboard so the sheet takes its place; the sheet then drives structural edits keyboard-less.
      (document.activeElement as HTMLElement | null)?.blur();
   }, [tableCaret]);

   // First-run autofocus: only a JUST-CREATED note opens straight into writing; an opened note stays at rest.
   useEffect(() => {
      if (noteId && consumeNoteJustCreated(noteId)) {
         // The editor mounts synchronously in its own effect; focus on the next frame once it exists.
         requestAnimationFrame(() => editorRef.current?.focus());
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per mounted note id (the key remounts on switch).
   }, []);

   // Push undo/redo availability into the store so the editing bar's pinned controls enable/disable.
   const handleHistoryChange = useCallback((state: { canUndo: boolean; canRedo: boolean }) => setUndoAvailability(state.canUndo, state.canRedo), [setUndoAvailability]);

   // CM6 cover changes (an undo/redo revert) persist to the store, matching desktop. Cover EDITING is N3, so the
   // controller below is read-only; this keeps an undone cover state in sync if it ever moves.
   const handleCmCoverChange = useCallback((next: NoteCover | null) => {
      if (next) setCover(next); else clearCover();
   }, [setCover, clearCover]);

   // Outline navigation. Live/Source: scroll the CM6 editor to the heading offset. Reading: scroll the rendered
   // `#slug` element into view within the one bounded scroller.
   const jumpToHeading = useCallback((heading: NoteHeading) => {
      if (modeRef.current === 'reading') {
         const target = scrollRef.current?.querySelector<HTMLElement>(`[id="${CSS.escape(heading.slug)}"]`);
         target?.scrollIntoView({ block: 'start' });
      } else {
         editorRef.current?.scrollToPos(heading.from);
      }
   }, []);

   // Image insertion: the shared upload pipeline splices at the guarded caret (never the cover gutter / a table).
   const spliceAdapter = useMemo(() => ({
      spliceAtCaret: (snippet: string) => {
         const editor = editorRef.current;
         if (!editor) return;
         const caret = editor.getCaret();
         const from = editor.getInsertionPos();
         if (from === caret) {
            editor.splice(from, from, snippet, from + 2);
            return;
         }
         const body = editor.getValue();
         const before = body.slice(0, from);
         const after = body.slice(from);
         const lead = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
         const trail = after === '' || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
         editor.splice(from, from, `${lead}${snippet}${trail}`, from + lead.length + 2);
      },
   }), []);
   const { fileInputRef, open: openImagePicker, isProcessing: isImageProcessing, handleFileSelected, handleImageEvent, cropperDialog: imageCropperDialog } =
      useNoteImageInsertion({ adapter: spliceAdapter });

   // The floating selection bar + link-edit bar are suppressed on mobile (`editable: false`): B/I/S live in the
   // keyboard-docked editing bar, and link actions are a later slice. The cover displays but its controls are
   // inert (cover editing is a later slice); the table renders as an editable grid, its op menu a later slice.
   const inertFormatController = useMemo<FormatController>(() => ({
      editable: false,
      labels: { bold: t('NoteView.format.bold'), italic: t('NoteView.format.italic'), strikethrough: t('NoteView.format.strikethrough'), link: t('NoteView.format.link') },
      onInsertLink: () => {},
   }), [t]);
   const inertLinkEditController = useMemo<LinkEditController>(() => ({
      editable: false,
      labels: { open: t('NoteView.linkEdit.open'), changeTarget: t('NoteView.linkEdit.changeTarget'), editLabel: t('NoteView.linkEdit.editLabel'), remove: t('NoteView.linkEdit.remove') },
      onOpen: () => {},
      onChangeTarget: () => {},
   }), [t]);
   const readonlyCoverController = useMemo<CoverController>(() => ({
      editable: false,
      onChange: () => {},
      onRemove: () => {},
      onResizeBox: () => {},
      onSetAspect: () => {},
      labels: { change: t('NoteView.cover.change'), remove: t('NoteView.cover.remove'), aspect: t('NoteView.cover.aspect') },
   }), [t]);
   // The table controller IS live on mobile: the caret cell arms the chip, the sheet hosts the ops.
   const tableController = useMemo<TableController>(() => ({
      openContextMenu: setTableRequest,
      onCaretCell: setTableCaret,
      labels: { addRow: t('NoteView.table.addRow'), addColumn: t('NoteView.table.addColumn') },
   }), [t]);

   const toggleReadEdit = useCallback(() => setMode((current) => (current === 'reading' ? 'live' : 'reading')), []);
   const toggleSource = useCallback(() => setMode((current) => (current === 'source' ? 'live' : 'source')), []);

   const hasReadingContent = !!(note && (note.title.trim() || note.body.trim() || cover));

   if (!note) return null;

   return (
      <div className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
         <MobileNoteTopBar
            title={localTitle.trim() || t('NoteView.titlePlaceholder')}
            isEditing={isEditing}
            isSource={mode === 'source'}
            onToggleReadEdit={toggleReadEdit}
            onToggleSource={toggleSource}
            onOpenOutline={() => setIsOutlineOpen(true)}
            onOpenSwitcher={onOpenSwitcher}
            isLeftHanded={isLeftHanded}
         />

         {/* The one bounded scroll region; the parchment runs full-width edge-to-edge inside it. */}
         <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-paper-background text-paper-foreground">
            <div
               className="mx-auto min-h-full w-full max-w-[46rem] px-5 py-6"
               // Reserve room in Edit mode so the last lines clear the keyboard-docked editing bar.
               style={isEditing ? { paddingBottom: '4rem' } : undefined}
            >
               {isEditing && (
                  <input
                     type="text"
                     value={localTitle}
                     onChange={(event) => setLocalTitle(event.target.value)}
                     className="mb-4 w-full bg-transparent text-2xl font-bold text-paper-foreground placeholder:text-paper-foreground/40 focus:outline-none"
                     placeholder={t('NoteView.titlePlaceholder')}
                  />
               )}
               {isEditing ? (
                  <NoteEditor
                     ref={editorRef}
                     value={localBody}
                     onChange={setLocalBody}
                     title={localTitle}
                     onTitleChange={updateTitle}
                     onCoverChange={handleCmCoverChange}
                     onHistoryChange={handleHistoryChange}
                     onImageEvent={handleImageEvent}
                     deadLinkTooltip={t('NoteView.linkDead')}
                     live={mode === 'live'}
                     cover={cover}
                     coverController={readonlyCoverController}
                     formatController={inertFormatController}
                     linkEditController={inertLinkEditController}
                     tableController={tableController}
                     placeholder={t('NoteView.bodyPlaceholder')}
                  />
               ) : hasReadingContent ? (
                  <NoteDocument title={note.title} body={note.body} cover={cover} />
               ) : (
                  <p className="text-base text-paper-foreground/50">{t('NoteView.mobile.emptyReading')}</p>
               )}
            </div>
         </div>

         {/* Hidden picker for the editing bar's insert-image action; paste/drop never touch it. */}
         <input ref={fileInputRef} type="file" accept={ACCEPT_IMAGE} className="hidden" onChange={handleFileSelected} />
         {imageCropperDialog}

         {isEditing && (
            <MobileNoteEditingBar
               getEditor={getEditor}
               onInsertImage={openImagePicker}
               isImageProcessing={isImageProcessing}
               canUndo={canUndo}
               canRedo={canRedo}
               onUndo={() => editorRef.current?.undo()}
               onRedo={() => editorRef.current?.redo()}
               canOpenTable={tableCaret !== null}
               onOpenTable={openTableSheet}
               isLeftHanded={isLeftHanded}
               isMobileFABMode={isMobileFABMode}
            />
         )}

         <MobileNoteOutlineSheet
            isOpen={isOutlineOpen}
            onClose={() => setIsOutlineOpen(false)}
            body={localBody}
            onJump={jumpToHeading}
         />

         <MobileNoteTableSheet request={tableRequest} onClose={() => setTableRequest(null)} />
      </div>
   );
}
