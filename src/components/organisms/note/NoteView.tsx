// -- React Imports --
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { useStore } from 'zustand';

// -- Custom Hooks --
import { useInputDebouncer } from '@/hooks/useInputDebouncer';
import { useCommitOnUnmount } from '@/hooks/useCommitOnUnmount';
import { useNoteImageInsertion } from '@/hooks/useNoteImageInsertion';
import { useNoteLinkActivation } from '@/hooks/useNoteLinkActivation';
import { useImageCropper } from '@/hooks/useImageCropper';

// -- Note Outline --
import { extractHeadings } from '@/lib/notes/noteOutline';

// -- Pipeline / Asset Store --
import { processImage } from '@/lib/assets/processImage';
import { storeAsset } from '@/lib/assets/assetRepository';
import { ACCEPT_IMAGE } from '@/lib/utils/fileAccept';

// -- Component Imports --
import { NoteDocument } from '@/components/molecules/NoteDocument';
import { NoteEditor } from '@/components/organisms/note/NoteEditor';
import { NoteToolbar } from '@/components/organisms/note/NoteToolbar';
import { NoteTableContextMenu } from '@/components/organisms/note/NoteTableContextMenu';
import { NoteOutline } from '@/components/organisms/note/NoteOutline';

// -- Cover Sizing --
import { COVER_DEFAULT_WIDTH_PCT, clampCoverWidth, clampCoverAspect } from '@/components/molecules/note/noteCoverClasses';

// -- Store Imports --
import { useActiveNoteInstance } from '@/lib/notes/ActiveNoteStoreContext';
import { useAppSettingsStore, useAppSettingsActions } from '@/lib/stores/appSettingsStore';

// -- Type Imports --
import type { NoteEditorHandle } from '@/components/organisms/note/NoteEditor';
import type { NoteHeading } from '@/lib/notes/noteOutline';
import type { CoverController } from '@/components/organisms/note/live/coverGutter';
import type { FormatController } from '@/components/organisms/note/live/formatToolbar';
import type { LinkEditController } from '@/components/organisms/note/live/linkEditToolbar';
import type { LinkEditSeed } from '@/components/organisms/note/live/linkNode';
import type { TableController } from '@/components/organisms/note/live/tableWidget';
import type { NoteMode } from '@/components/organisms/note/NoteToolbar';
import type { NoteTableContextMenuHandle } from '@/components/organisms/note/NoteTableContextMenu';
import type { NoteCover } from '@/lib/types/board';
import type { NoteHostContext } from '@/lib/portals/linkTarget';

/*
 * The Note tab surface: the document editor on the paper sheet. It reads the ACTIVE NOTE instance (never the
 * character context) and only mounts when a note tab is active.
 *
 * Three modes, one CM6 surface for the two editable ones:
 *  - READING = the finished handout via {@link NoteDocument} (react-markdown), non-editable, CM6 unmounted.
 *  - LIVE    = the home mode: the CM6 editor renders the document inline (syntax hidden off-cursor, mention
 *    pills, inline resizable/alignable image widgets) while you type in the same surface.
 *  - SOURCE  = the CM6 editor with raw markdown + syntax highlighting, decorations off (the escape hatch).
 *
 * Data-loss guard: a tab switch UNMOUNTS with no blur, so the store `flush` runs on unmount AND the CM6
 * editor flushes its final buffer on destroy - the last keystroke is never lost. Image align/resize/caption
 * are done ON the inline image widget in Live (the docked inspector is retired).
 *
 * The document TITLE lives in the paper column (a large heading above the cover), not the header - it exports
 * as a leading H1 (see `noteToMarkdown`); `note.title` stays the structured tab/drawer name. The COVER's
 * controls (Change/Remove + resize + aspect) live ON the image as a Live hover overlay; only the empty-state
 * "Add cover" pill sits in the column, since there's no image to hover.
 */

export function NoteView() {
   const store = useActiveNoteInstance();
   if (!store) return null;
   return <NoteSurface key={store.getState().noteId ?? 'note'} />;
}

/** The editable surface, remounted per note id so its buffers never cross documents. */
function NoteSurface() {
   const { t } = useTranslation();
   const store = useActiveNoteInstance()!;

   const note = useStore(store, (state) => state.note);
   const cover = useStore(store, (state) => state.note?.cover);
   const { updateTitle, updateBody, setCover, clearCover, flush, setUndoController, setUndoAvailability, setOutlineJump, setLinkPickerOpener } = store.getState().actions;

   // A note opens in LIVE - the home mode where you both see AND touch the document (Overseer-locked).
   const [mode, setMode] = useState<NoteMode>('live');
   const isEditing = mode === 'live' || mode === 'source';

   // The document-outline rail: open state persists in appSettings (stays where the user left it).
   const isOutlineOpen = useAppSettingsStore((state) => state.isNoteOutlineOpen);
   const { toggleNoteOutline } = useAppSettingsActions();
   // The desk scroll container (for Reading heading scroll) + a mode latest-ref so the stable outline-jump reads
   // the current mode without re-registering.
   const deskRef = useRef<HTMLDivElement>(null);
   const modeRef = useRef(mode);
   modeRef.current = mode;

   // Buffer title + body locally; the debouncer flushes each (PERSISTENCE) on unmount. The store `flush` is the
   // belt. UNDO capture is separate: title/cover edits are mirrored into CM6 state (the one timeline) below.
   const [localTitle, setLocalTitle] = useInputDebouncer(note?.title ?? '', updateTitle);
   const [localBody, setLocalBody] = useInputDebouncer(note?.body ?? '', updateBody);
   useCommitOnUnmount(flush);

   // The CM6 editor handle (splice at real offsets + the shared undo timeline), for image insertion + undo/redo.
   const editorRef = useRef<NoteEditorHandle>(null);

   // Title UNDO mirror: the title input stays a snappy local field; a short debounce commits each typing burst
   // into CM6 as ONE history step (so title undo coalesces like body typing, not per-keystroke). Flushed before
   // an undo/redo and on blur so an in-flight burst is on the stack. Persistence stays on `useInputDebouncer`.
   const titleMirrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
   const titleMirrorPending = useRef<string | null>(null);
   const flushTitleMirror = useCallback(() => {
      if (titleMirrorTimer.current) { clearTimeout(titleMirrorTimer.current); titleMirrorTimer.current = null; }
      if (titleMirrorPending.current !== null) {
         editorRef.current?.setTitle(titleMirrorPending.current);
         titleMirrorPending.current = null;
      }
   }, []);
   const scheduleTitleMirror = useCallback((next: string) => {
      titleMirrorPending.current = next;
      if (titleMirrorTimer.current) clearTimeout(titleMirrorTimer.current);
      titleMirrorTimer.current = setTimeout(flushTitleMirror, 300);
   }, [flushTitleMirror]);
   const handleTitleInput = useCallback((next: string) => {
      setLocalTitle(next);
      scheduleTitleMirror(next);
   }, [setLocalTitle, scheduleTitleMirror]);

   // CM6 -> store, for PERSISTENCE. A CM6 title/cover change is either a mirror echo or an undo/redo revert;
   // either way it becomes the store's source of persisted truth (and `useInputDebouncer` re-syncs the input).
   const handleCmTitleChange = useCallback((title: string) => updateTitle(title), [updateTitle]);
   const handleCmCoverChange = useCallback((next: NoteCover | null) => {
      if (next) setCover(next); else clearCover();
   }, [setCover, clearCover]);

   // Window-level Ctrl/Cmd+Z / +Shift+Z / +Y so undo works with the TITLE input or the toolbar focused - not
   // only inside the editor. When the editor itself holds focus, CM6's own keymap handles it (don't double).
   useEffect(() => {
      const onKeyDown = (event: KeyboardEvent) => {
         if (!(event.ctrlKey || event.metaKey)) return;
         const key = event.key.toLowerCase();
         const isUndo = key === 'z' && !event.shiftKey;
         const isRedo = key === 'y' || (key === 'z' && event.shiftKey);
         if (!isUndo && !isRedo) return;
         const editor = editorRef.current;
         if (!editor || editor.hasFocus()) return; // no editor (Reading) or editor focused (CM6 owns it)
         event.preventDefault();
         flushTitleMirror(); // land any in-flight title burst on the stack before moving through it
         if (isUndo) editor.undo(); else editor.redo();
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
   }, [flushTitleMirror]);

   // Bridge the CM6 undo/redo into the note store so the SIDEBAR control drives it (like board/character). The
   // registered controller flushes any in-flight title burst first, exactly like the keyboard shortcut above.
   const handleHistoryChange = useCallback((state: { canUndo: boolean; canRedo: boolean }) => setUndoAvailability(state.canUndo, state.canRedo), [setUndoAvailability]);
   useEffect(() => {
      setUndoController({
         undo: () => { flushTitleMirror(); editorRef.current?.undo(); },
         redo: () => { flushTitleMirror(); editorRef.current?.redo(); },
      });
      return () => setUndoController(null);
   }, [setUndoController, flushTitleMirror]);
   // Reading mode has no CM6 editor: the sidebar undo/redo must read disabled (and not act on a torn-down view).
   useEffect(() => {
      if (!isEditing) setUndoAvailability(false, false);
   }, [isEditing, setUndoAvailability]);

   // Outline navigation (all modes). Live/Source: scroll the CM6 editor to the heading offset. Reading: scroll
   // the rendered `#slug` element into view (its id === the outline's slug, both from `extractHeadings`). Stable
   // (reads refs), so the rail and the palette-registered handler share ONE implementation.
   const jumpToHeading = useCallback((heading: NoteHeading) => {
      if (modeRef.current === 'reading') {
         const target = deskRef.current?.querySelector<HTMLElement>(`[id="${CSS.escape(heading.slug)}"]`);
         target?.scrollIntoView({ block: 'start' });
      } else {
         editorRef.current?.scrollToPos(heading.from);
      }
   }, []);
   // Register the jump with the store so the command palette's "Jump to section" can reach it.
   useEffect(() => {
      setOutlineJump(jumpToHeading);
      return () => setOutlineJump(null);
   }, [setOutlineJump, jumpToHeading]);

   // Note links: this surface is the TAB host. A same-note `#slug` maps to the outline jump (Live scrolls the
   // offset, Reading scrolls the `#slug` element); the buffer ref keeps the offset honest while editing. A dead
   // slug finds no heading and no-ops. The activation handler is shared with the board tile (only the host and
   // section-scroll differ), so entity/external/element behaviour can't drift between the two surfaces.
   const bodyRef = useRef(localBody);
   bodyRef.current = localBody;
   const host = useMemo<NoteHostContext>(() => ({ kind: 'tab', noteId: note?.id ?? '' }), [note?.id]);
   const scrollToSection = useCallback((slug: string) => {
      const heading = extractHeadings(bodyRef.current).find((entry) => entry.slug === slug);
      if (heading) jumpToHeading(heading);
   }, [jumpToHeading]);
   const onLinkActivate = useNoteLinkActivation(host, scrollToSection);

   // The insert-link picker (owned here so the toolbar button AND the palette open the SAME popover). The
   // palette opener flips to Live first (you can't insert into read-only Reading), then opens it. A non-null
   // `linkEditSeed` switches the picker to REPLACE an existing link's target (the caret bar's Change-target);
   // it's cleared whenever the picker closes, so a plain toolbar/palette open is always an insert.
   const [linkPickerOpen, setLinkPickerOpen] = useState(false);
   const [linkEditSeed, setLinkEditSeed] = useState<LinkEditSeed | null>(null);
   const openLinkPicker = useCallback(() => { setLinkEditSeed(null); setMode('live'); setLinkPickerOpen(true); }, []);
   const handleLinkPickerOpenChange = useCallback((open: boolean) => {
      setLinkPickerOpen(open);
      if (!open) setLinkEditSeed(null);
   }, []);
   useEffect(() => {
      setLinkPickerOpener(openLinkPicker);
      return () => setLinkPickerOpener(null);
   }, [setLinkPickerOpener, openLinkPicker]);

   // Cover add/change: the shared upload pipeline (process -> store -> hash), then a NoteCover built with the
   // image's NATURAL ratio on ADD (so it starts uncropped) and the current box kept on CHANGE (swap hash only).
   // All cover edits go through the editor handle (CM6 state = the undo timeline); CM6 then persists to the store.
   const coverInputRef = useRef<HTMLInputElement>(null);
   const [isCoverProcessing, setIsCoverProcessing] = useState(false);
   const { open: openCoverCropper, dialog: coverCropperDialog } = useImageCropper();
   const openCoverPicker = useCallback(() => coverInputRef.current?.click(), []);
   const handleCoverSelected = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      const cropped = await openCoverCropper(file, { aspect: 'free' });
      if (!cropped) return;
      setIsCoverProcessing(true);
      try {
         const processed = await processImage(cropped);
         await storeAsset(processed);
         const current = store.getState().note?.cover;
         const naturalAspect = processed.width > 0 ? processed.height / processed.width : 1;
         editorRef.current?.setCover({
            hash: processed.hash,
            width: current?.width ?? COVER_DEFAULT_WIDTH_PCT,
            aspect: current?.aspect ?? clampCoverAspect(naturalAspect),
         });
      } catch {
         // A failed process/store leaves the existing cover untouched; the shared toast lives in the image hooks.
      } finally {
         setIsCoverProcessing(false);
      }
   }, [store, openCoverCropper]);

   // The Live cover controls: Change/Remove + box width resize + aspect presets. Each dispatches a history-
   // captured CM6 effect via the handle (so a cover edit is undoable alongside body/title); CM6 syncs the store.
   const coverController = useMemo<CoverController>(() => ({
      editable: mode === 'live',
      onChange: openCoverPicker,
      onRemove: () => editorRef.current?.clearCover(),
      onResizeBox: (widthPct, aspect) => editorRef.current?.updateCover({ width: clampCoverWidth(widthPct), aspect: clampCoverAspect(aspect) }),
      onSetAspect: (aspect) => editorRef.current?.updateCover({ aspect: clampCoverAspect(aspect) }),
      labels: { change: t('NoteView.cover.change'), remove: t('NoteView.cover.remove'), aspect: t('NoteView.cover.aspect') },
   }), [mode, openCoverPicker, t]);

   /**
    * Splices a snippet into the CM6 doc, landing the caret INSIDE the new token (after `![`). The target is
    * `getInsertionPos` (the caret, or - when the caret is beside the cover - the first line past the cover), so
    * a body image never lands in the cover gutter. A redirect can land on a line that already has content, so
    * it gets blank-line separation on whichever side isn't already a paragraph break - the image reads as its
    * own block, never glued to the surrounding text.
    */
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
         // Redirected below the cover: pad each side unless it's already a paragraph boundary.
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

   // The floating selection bar: Bold/Italic/Strike on a non-empty selection. Non-selection actions (image /
   // table / list / heading / quote) live in the permanent toolbar, not here.
   const formatController = useMemo<FormatController>(() => ({
      editable: isEditing,
      labels: {
         bold: t('NoteView.format.bold'),
         italic: t('NoteView.format.italic'),
         strikethrough: t('NoteView.format.strikethrough'),
         link: t('Common.link'),
      },
      // The bar only shows while editing, so the picker can open directly (no mode flip needed).
      onInsertLink: () => { setLinkEditSeed(null); setLinkPickerOpen(true); },
   }), [isEditing, t]);

   // The caret link-edit bar: Open runs the link (the same activation bridge as click-follow); Change target
   // opens the picker seeded to REPLACE this link while keeping its label. Edit-label + Remove are pure editor
   // transactions the bar dispatches itself, so they need no callback here.
   const linkEditController = useMemo<LinkEditController>(() => ({
      editable: isEditing,
      labels: {
         open: t('NoteView.linkEdit.open'),
         changeTarget: t('NoteView.linkEdit.changeTarget'),
         editLabel: t('NoteView.linkEdit.editLabel'),
         remove: t('NoteView.linkEdit.remove'),
      },
      onOpen: (href) => onLinkActivate(href),
      onChangeTarget: (seed) => { setLinkEditSeed(seed); setLinkPickerOpen(true); },
   }), [isEditing, onLinkActivate, t]);

   // A stable accessor to the live editor handle for the permanent toolbar (the ref may be unset on first paint).
   const getEditor = useCallback(() => editorRef.current, []);

   // The live table's right-click menu: the CM6 widget hands a request (screen point + cell actions) to this
   // React menu via a stable controller. The imperative widget can't host a Radix menu, so we bridge here.
   const tableMenuRef = useRef<NoteTableContextMenuHandle>(null);
   const tableController = useMemo<TableController>(() => ({
      openContextMenu: (request) => tableMenuRef.current?.open(request),
      labels: { addRow: t('NoteView.table.addRow'), addColumn: t('NoteView.table.addColumn') },
   }), [t]);

   if (!note) return null;

   return (
      <main className="absolute inset-0 flex flex-col overflow-hidden bg-background">
         {/* ONE persistent toolbar row (all modes): the mode toggle is always shown; the cover button + format
             + insert tools show only in Live/Source. The title lives in the paper column. */}
         <NoteToolbar
            mode={mode}
            onModeChange={setMode}
            isEditing={isEditing}
            getEditor={getEditor}
            onInsertImage={openImagePicker}
            isImageProcessing={isImageProcessing}
            hasCover={!!cover}
            isCoverProcessing={isCoverProcessing}
            onAddCover={openCoverPicker}
            onChangeCover={openCoverPicker}
            onRemoveCover={() => editorRef.current?.clearCover()}
            isOutlineOpen={isOutlineOpen}
            onToggleOutline={toggleNoteOutline}
            isLinkPickerOpen={linkPickerOpen}
            onLinkPickerOpenChange={handleLinkPickerOpenChange}
            linkEditSeed={linkEditSeed}
         />
         {/* Hidden picker for the toolbar's insert-image action; the paste/drop paths never touch it. */}
         <input ref={fileInputRef} type="file" accept={ACCEPT_IMAGE} className="hidden" onChange={handleFileSelected} />
         {imageCropperDialog}

         {/* The live table's right-click context menu (portals to the click point; opened by the CM6 widget). */}
         <NoteTableContextMenu handleRef={tableMenuRef} />

         {/* The content ROW: the outline rail is workspace CHROME - flush against the sidebar edge (main's left)
             and the toolbar (the row's top), carrying no canvas padding - sitting BESIDE the padded desk. The
             rail slides its width; the desk (the padded scroll area the paper floats on) is the rail's SIBLING
             and reflows into the freed space, so the rail divides the tool panel from the canvas. */}
         <div className="flex min-h-0 flex-1 flex-row">
            <NoteOutline body={localBody} isOpen={isOutlineOpen} onJump={jumpToHeading} />
            <div ref={deskRef} className="min-w-0 flex-1 overflow-y-auto bg-background px-4 py-8 md:px-8 md:py-12">
               {/* The paper sheet: parchment by default, re-themed by a custom theme's --paper-* tokens. Both
                   modes share the sheet, so toggling reading/editing stays on the same page. */}
               <div data-tutorial="note-editor" className="mx-auto w-full max-w-[46rem] rounded-lg border border-paper-border bg-paper-background text-paper-foreground shadow-lg shadow-black/5">
               <div className="px-6 py-10 sm:px-10 md:px-16 md:py-16">
                  {/* The document title: a large heading in the paper column, ABOVE the cover. Editable in the
                      editable modes; in Reading it renders as the document H1 (inside NoteDocument). */}
                  {isEditing && (
                     <div className="mx-auto w-full max-w-[68ch]">
                        <input
                           type="text"
                           value={localTitle}
                           onChange={(event) => handleTitleInput(event.target.value)}
                           onBlur={flushTitleMirror}
                           className="mb-4 w-full bg-transparent text-4xl font-bold text-paper-foreground placeholder:text-paper-foreground/40 focus:outline-none"
                           placeholder={t('Common.untitledNote')}
                        />
                     </div>
                  )}
                  {isEditing ? (
                     <NoteEditor
                        ref={editorRef}
                        value={localBody}
                        onChange={setLocalBody}
                        title={localTitle}
                        onTitleChange={handleCmTitleChange}
                        onCoverChange={handleCmCoverChange}
                        onHistoryChange={handleHistoryChange}
                        onImageEvent={handleImageEvent}
                        onLinkActivate={onLinkActivate}
                        deadLinkTooltip={t('NoteView.linkDead')}
                        live={mode === 'live'}
                        cover={cover}
                        coverController={coverController}
                        formatController={formatController}
                        linkEditController={linkEditController}
                        tableController={tableController}
                        placeholder={t('NoteView.bodyPlaceholder')}
                     />
                  ) : note.title.trim() || note.body.trim() || cover ? (
                     <NoteDocument title={note.title} body={note.body} cover={cover} onLinkActivate={onLinkActivate} />
                  ) : (
                     <p className="text-base text-paper-foreground/50">
                        {t('NoteView.emptyPreview')}
                     </p>
                  )}
               </div>
               {/* Hidden picker for the cover Add/Change control. */}
               <input ref={coverInputRef} type="file" accept={ACCEPT_IMAGE} className="hidden" onChange={handleCoverSelected} />
               {coverCropperDialog}
               </div>
            </div>
         </div>
      </main>
   );
}
