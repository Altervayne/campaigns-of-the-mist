// -- React Imports --
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

// -- Library Imports --
import cuid from 'cuid';

// -- Icon Imports --
import { Bookmark, BookmarkMinus, BookMarked, ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';

// -- Utils Imports --
import { migrateJournalContent, orderedBookmarkTabs, withPageInserted, withPagesReordered, withPageRemoved } from '@/lib/board/journalContent';

// -- Component Imports --
import { NoteMarkdown } from '@/components/molecules/NoteMarkdown';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { BookmarkListRow } from './journal/BookmarkListRow';
import { BookmarkTab } from './journal/BookmarkTab';
import { JournalControlButton } from './journal/JournalControlButton';
import { JournalTitle } from './journal/JournalTitle';
import { PagesReorderPopover } from './journal/PagesReorderPopover';

// -- Hook Imports --
import { useBoardMentionMint } from '@/hooks/board/useBoardMentionMint';
import { useCommitOnUnmount } from '@/hooks/useCommitOnUnmount';

// -- Store Imports --
import { useJournalViewStore } from '@/lib/stores/journalViewStore';

// -- Type Imports --
import type { BoardItem, BoardItemContent, JournalBoardContent } from '@/lib/types/board';
import type { MentionSegment } from '@/lib/challenge/parseMentions';

/*
 * A paged note: one editable plain-text page at a time, with prev/next, a page indicator,
 * add/remove page, and bookmarks (side tabs that jump to a page). Pages carry stable ids and
 * bookmarks reference a pageId - never an index - so adding/removing pages never strands or
 * re-points a tab. The active page's text is held locally and committed on blur (one command
 * per edit session); each structural change (page/bookmark) is its own `updateItemContent`.
 */

interface JournalItemProps {
   /** The board item (its rect anchors a minted mention tracker beside the journal). */
   item: BoardItem;
   content: JournalBoardContent;
   isSelected: boolean;
   /** Editing sub-state: the title + active page mount focused textareas over their rendered Markdown. */
   isEditing: boolean;
   /**
    * Focus the page body when editing engages (the board, where editing is a deliberate single-item
    * promotion). The sheet omits it: every journal card shares one edit mode, so auto-focusing would make
    * them fight over focus and jump the scroll.
    */
   autoFocusEditor?: boolean;
   /** The selection toolbar's action slot; add/remove-page + bookmark portal here, nav stays in the body. */
   toolbarSlot: HTMLElement | null;
   /** A non-clipped slot at the box's right edge; the bookmark tabs portal here so they protrude. */
   sideSlot: HTMLElement | null;
   /**
    * When set, the portaled structural controls (add/remove page, bookmark) render as the host's toolbar
    * `<Button>` with this className, so a sheet journal's grip toolbar is pixel-identical to a card's.
    * The board leaves it undefined and keeps the compact `JournalControlButton` in its own selection toolbar.
    */
   toolbarControlClassName?: string;
   /**
    * How the bookmark list is presented. `'side-tabs'` (default, the board) portals protruding tabs into
    * `sideSlot`. `'popover'` (the sheet) instead renders a Bookmarks button in the persistent nav row that
    * opens a body-portaled list - so it floats above `flex-wrap` neighbours instead of being z-buried by them.
    */
   bookmarkMode?: 'side-tabs' | 'popover';
   /**
    * Overrides the tapped-mention handler. The board leaves it undefined and mints a board-native tracker
    * (`useBoardMentionMint`); the sheet journal passes the on-sheet create-or-raise handler so a tap creates
    * a status/tag on the active character (its fake zero-rect host means the board mint would no-op).
    */
   onMentionClick?: (segment: MentionSegment) => void;
   onContentChange: (content: BoardItemContent) => void;
   onRequestSelect: () => void;
}

export function JournalItem({ item, content, isSelected, isEditing, autoFocusEditor = false, toolbarSlot, sideSlot, toolbarControlClassName, bookmarkMode = 'side-tabs', onMentionClick, onContentChange, onRequestSelect }: JournalItemProps) {
   const { t } = useTranslation();
   // A tapped `{mention}` mints a board-native tracker beside the journal (create-only, board scope); a host
   // that supplies its own handler (the sheet journal → create-or-raise on the character) overrides it.
   const boardMint = useBoardMentionMint(item);
   const handleMentionClick = onMentionClick ?? boardMint;

   // Normalize legacy string-page journals to id'd pages; every commit spreads this so the
   // migration persists on the first edit. The journal is the copy's inner `data` aggregate.
   const journal = useMemo(() => migrateJournalContent(content.data), [content.data]);
   const pages = journal.pages.length > 0 ? journal.pages : [{ id: '_', text: '' }];
   const bookmarks = journal.bookmarks;

   // Commits a new inner journal aggregate onto the copy's `content.data`, keeping the copy wrapper
   // (kind / mode / sourceDrawerItemId) intact so the Save-back link survives every edit.
   const commitJournal = (next: typeof journal) => onContentChange({ ...content, data: next });

   // The current page is EPHEMERAL view state (not character data): read/write an id-keyed store so it
   // survives the sheet's tab-switch unmount, and one store serves both the sheet journal and its board
   // copy (same journal id). Clamp on read - a stored index can outlive a page deletion.
   const storedIndex = useJournalViewStore((state) => state.journalView[journal.id] ?? 0);
   const setJournalPage = useJournalViewStore((state) => state.setJournalPage);
   const pageIndex = Math.min(storedIndex, pages.length - 1);
   const setIndex = (next: number) => setJournalPage(journal.id, next);
   const activePage = pages[pageIndex];
   const [text, setText] = useState(activePage.text);

   // Reset the buffer when the active page changes (switch, add/remove, undo/redo) via React's
   // adjust-state-during-render pattern. Keyed by page id + stored text, so typing (which
   // leaves both untouched) never resets the buffer mid-edit.
   const [sync, setSync] = useState({ id: activePage.id, stored: activePage.text });
   if (sync.id !== activePage.id || sync.stored !== activePage.text) {
      setSync({ id: activePage.id, stored: activePage.text });
      setText(activePage.text);
   }

   const stopDrag = (event: ReactPointerEvent) => event.stopPropagation();

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

   // The title is a single-line markdown heading, held in its own buffer and committed on blur. Like the
   // bookmark label it also flushes on the editable->false edge: deselecting swaps the input for the
   // rendered title in place (no unmount, maybe no blur), which would otherwise strand a just-typed title.
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

   const goPrev = () => { commit(); setIndex(Math.max(0, pageIndex - 1)); };
   const goNext = () => { commit(); setIndex(Math.min(pages.length - 1, pageIndex + 1)); };

   // Insert a blank page at `at` (clamped), keeping the current edit, and jump to the new page. Page ids are
   // stable and bookmarks reference pageId, so inserting never strands a tab. Append (`at = length`) is the
   // toolbar's Add-page; the bottom bar inserts immediately before/after the current page.
   const insertPage = (at: number) => {
      const kept = pages.map((page) => (page.id === activePage.id ? { ...page, text } : page));
      const { journal: next, pageId } = withPageInserted({ ...journal, pages: kept }, at);
      commitJournal(next);
      setIndex(next.pages.findIndex((page) => page.id === pageId));
   };
   const addPage = () => insertPage(pages.length);

   const removePage = () => {
      const result = withPageRemoved({ ...journal, pages }, activePage.id);
      commitJournal(result);
      setIndex(Math.min(pageIndex, result.pages.length - 1));
   };

   // Drag-reorder pages from the overview popover. Page ids stay stable (bookmarks reference pageId, so a
   // reorder never strands a tab), the current edit is kept, and the view follows the current page BY ID -
   // it re-derives the active page's new index so the reader lands on the same page, not the same slot.
   const reorderPages = (activeId: string, overId: string) => {
      const kept = pages.map((page) => (page.id === activePage.id ? { ...page, text } : page));
      const next = withPagesReordered({ ...journal, pages: kept }, activeId, overId);
      commitJournal(next);
      setIndex(next.pages.findIndex((page) => page.id === activePage.id));
   };

   // The page indicator's current number is click-to-edit: a typed page (1..M) jumps there on Enter/blur,
   // anything else is ignored. Ephemeral view state, so it lives here, not on the journal aggregate.
   const [pageNumEditing, setPageNumEditing] = useState(false);
   const [pageNumText, setPageNumText] = useState('');
   const startEditPageNum = () => { setPageNumText(String(pageIndex + 1)); setPageNumEditing(true); };
   const commitPageNum = () => {
      const target = Number.parseInt(pageNumText, 10);
      if (Number.isFinite(target) && target >= 1 && target <= pages.length) { commit(); setIndex(target - 1); }
      setPageNumEditing(false);
   };

   const isBookmarked = bookmarks.some((bookmark) => bookmark.pageId === activePage.id);
   const toggleBookmark = () => {
      const next = isBookmarked
         ? bookmarks.filter((bookmark) => bookmark.pageId !== activePage.id)
         : [...bookmarks, { id: cuid(), pageId: activePage.id, label: '' }];
      commitJournal({ ...journal, bookmarks: next });
   };
   const removeBookmark = (id: string) => commitJournal({ ...journal, bookmarks: bookmarks.filter((bookmark) => bookmark.id !== id) });
   const setBookmarkLabel = (id: string, label: string) =>
      commitJournal({ ...journal, bookmarks: bookmarks.map((bookmark) => (bookmark.id === id ? { ...bookmark, label } : bookmark)) });

   const jumpToPage = (pageId: string) => {
      const target = pages.findIndex((page) => page.id === pageId);
      if (target < 0) return;
      commit();
      setIndex(target);
   };

   const tabs = orderedBookmarkTabs(pages, bookmarks);

   return (
      <div className="relative flex h-full w-full flex-col bg-paper-background text-paper-foreground">
         {/* Title bar (top): the notebook's multiline markdown heading - an auto-growing textarea while
             editing (Enter adds a line, never commits), inline-rendered markdown at rest (wraps, clamped
             to a few lines so a long title can't eat the journal). A body click on it falls through to select. */}
         <div className="flex shrink-0 items-start border-b border-paper-border bg-paper-primary text-paper-primary-foreground px-1.5 py-1">
            {isEditing ? (
               <textarea
                  ref={titleAreaRef}
                  value={titleText}
                  onChange={(event) => setTitleText(event.target.value)}
                  onFocus={onRequestSelect}
                  onBlur={commitTitle}
                  onPointerDown={(event) => event.stopPropagation()}
                  placeholder={t('BoardView.journalTitlePlaceholder')}
                  rows={1}
                  // Editing -> the board's wheel listener skips this so the wheel scrolls the title, not zoom.
                  data-board-wheel-scroll
                  className="max-h-24 w-full resize-none overflow-y-auto bg-transparent text-sm font-semibold leading-snug outline-none placeholder:text-paper-primary-foreground/50 cursor-text"
               />
            ) : (
               <div className="line-clamp-3 w-full whitespace-pre-wrap break-words text-sm font-semibold leading-snug">
                  {journal.title.trim()
                     ? <JournalTitle content={journal.title} />
                     : <span className="text-paper-primary-foreground/50">{t('BoardView.journalTitlePlaceholder')}</span>}
               </div>
            )}
         </div>

         {/* Structural actions live in the selection toolbar. */}
         {isSelected && toolbarSlot && createPortal(
            <>
               <JournalControlButton title={t('BoardView.addPage')} onPointerDown={stopDrag} onClick={addPage} toolbarClassName={toolbarControlClassName} appChrome>
                  <Plus className="h-4 w-4" />
               </JournalControlButton>
               <JournalControlButton
                  title={t('BoardView.removePage')}
                  disabled={pages.length === 1 && (pages[0]?.text ?? '') === '' && text === ''}
                  onPointerDown={stopDrag}
                  onClick={removePage}
                  toolbarClassName={toolbarControlClassName}
                  appChrome
               >
                  <Minus className="h-4 w-4" />
               </JournalControlButton>
               <JournalControlButton title={isBookmarked ? t('BoardView.journalRemoveBookmark') : t('BoardView.journalBookmark')} onPointerDown={stopDrag} onClick={toggleBookmark} toolbarClassName={toolbarControlClassName} appChrome>
                  {isBookmarked ? <BookmarkMinus className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
               </JournalControlButton>
            </>,
            toolbarSlot,
         )}

         {/* Editing -> edit the page's raw Markdown; otherwise -> render it (inheriting the theme color).
             The rendered block is pointer-transparent, so a body click falls through to select (then edit). */}
         {isEditing ? (
            <textarea
               ref={pageAreaRef}
               value={text}
               onChange={(event) => setText(event.target.value)}
               onFocus={onRequestSelect}
               onBlur={commit}
               onPointerDown={(event) => event.stopPropagation()}
               placeholder={t('BoardView.journalPlaceholder')}
               // Editing -> the board's wheel listener skips this so the wheel scrolls the page, not zoom.
               data-board-wheel-scroll
               className="min-h-0 flex-1 resize-none border-0 bg-transparent p-2 text-sm leading-snug outline-none placeholder:text-muted-foreground/50 cursor-text"
            />
         ) : (
            // Clip at rest (no scrollbar on a resting page); the textarea scrolls while editing.
            <div className="min-h-0 flex-1 overflow-hidden p-2">
               {text.trim() ? <NoteMarkdown content={text} onMentionClick={handleMentionClick} /> : null}
            </div>
         )}

         {/* Page navigation (bottom): the prev/next arrows sit at the far edges; a middle cluster carries the
             insert-before/after glyphs (edit-only) around the click-to-edit page number. */}
         <div className="flex shrink-0 items-center justify-between gap-0.5 border-t border-paper-border bg-paper-primary text-paper-primary-foreground px-1.5 py-1 text-xs">
            <JournalControlButton title={t('BoardView.prevPage')} disabled={pageIndex === 0} onPointerDown={stopDrag} onClick={goPrev}>
               <ChevronLeft className="h-3.5 w-3.5" />
            </JournalControlButton>

            <div className="flex items-center gap-0.5">
               {isSelected && (
                  <JournalControlButton title={t('BoardView.journalInsertPageBefore')} onPointerDown={stopDrag} onClick={() => insertPage(pageIndex)}>
                     <Plus className="h-3 w-3" />
                  </JournalControlButton>
               )}
               {/* The current page number is click-to-edit; the total stays static. Both numbers carry the
                   same width / centering / weight so `N / M` reads as a balanced pair. */}
               {pageNumEditing ? (
                  <input
                     type="text"
                     inputMode="numeric"
                     value={pageNumText}
                     autoFocus
                     onChange={(event) => setPageNumText(event.target.value.replace(/[^0-9]/g, ''))}
                     onFocus={(event) => event.target.select()}
                     onKeyDown={(event) => { if (event.key === 'Enter') commitPageNum(); else if (event.key === 'Escape') setPageNumEditing(false); }}
                     onBlur={commitPageNum}
                     onPointerDown={stopDrag}
                     aria-label={t('BoardView.journalGoToPage')}
                     // The editable number reads as a small parchment inset on the header band (the current-page indicator).
                     className="w-7 rounded bg-paper-background px-1 text-center tabular-nums text-paper-foreground outline-none"
                  />
               ) : (
                  <button
                     type="button"
                     title={t('BoardView.journalGoToPage')}
                     aria-label={t('BoardView.journalGoToPage')}
                     onPointerDown={stopDrag}
                     onClick={startEditPageNum}
                     className="min-w-7 rounded px-1 text-center tabular-nums text-paper-primary-foreground/80 hover:bg-paper-primary-foreground/10 hover:text-paper-primary-foreground cursor-pointer"
                  >
                     {pageIndex + 1}
                  </button>
               )}
               <span className="text-paper-primary-foreground/70">/</span>
               <span className="min-w-7 px-1 text-center tabular-nums text-paper-primary-foreground/80">{pages.length}</span>
               {isSelected && (
                  <JournalControlButton title={t('BoardView.journalInsertPageAfter')} onPointerDown={stopDrag} onClick={() => insertPage(pageIndex + 1)}>
                     <Plus className="h-3 w-3" />
                  </JournalControlButton>
               )}
            </div>

            <div className="flex items-center gap-0.5">
               {/* Pages overview (edit-only): a body-portaled popover listing every page (number + a first-line
                   snippet) that drags to reorder. Reordering shuffles the pages array; page ids stay stable so
                   bookmarks never strand and the reader follows the current page by id. */}
               {isSelected && (
                  <PagesReorderPopover
                     pages={pages}
                     activePageId={activePage.id}
                     triggerTitle={t('BoardView.journalReorderPages')}
                     pageLabel={(n) => t('BoardView.journalPageLabel', { number: n })}
                     emptyPageLabel={t('BoardView.journalEmptyPage')}
                     reorderLabel={t('BoardView.journalReorderPages')}
                     stopDrag={stopDrag}
                     onReorder={reorderPages}
                     onJump={jumpToPage}
                  />
               )}
               {/* Popover-mode (the sheet) puts the bookmark LIST in the always-visible nav row - the side
                   tabs are a reading affordance, so their replacement stays visible too. A body-portaled
                   popover floats above flex-wrap neighbours (no z-fighting). Always clickable, so the empty
                   state is reachable. */}
               {bookmarkMode === 'popover' && (
                  <Popover>
                     <PopoverTrigger asChild>
                        <button
                           type="button"
                           title={t('BoardView.journalBookmarks')}
                           aria-label={t('BoardView.journalBookmarks')}
                           onPointerDown={stopDrag}
                           className="flex items-center justify-center rounded p-0.5 text-paper-primary-foreground/80 hover:bg-paper-primary-foreground/10 hover:text-paper-primary-foreground cursor-pointer"
                        >
                           <BookMarked className="h-3.5 w-3.5" />
                        </button>
                     </PopoverTrigger>
                     <PopoverContent align="end" className="w-60 p-1.5" onOpenAutoFocus={(event) => event.preventDefault()}>
                        {tabs.length === 0 ? (
                           <div className="rounded-md border-2 border-dashed border-border bg-muted/50 px-3 py-4 text-center text-xs text-muted-foreground">
                              {t('BoardView.journalNoBookmarks')}
                           </div>
                        ) : (
                        <div className="flex flex-col gap-0.5">
                           {tabs.map(({ bookmark, page }) => (
                              <BookmarkListRow
                                 key={bookmark.id}
                                 label={bookmark.label}
                                 pageNumber={page + 1}
                                 active={page === pageIndex}
                                 editable={isSelected}
                                 placeholder={t('BoardView.journalBookmarkPlaceholder')}
                                 removeLabel={t('BoardView.journalRemoveBookmark')}
                                 onJump={() => jumpToPage(bookmark.pageId)}
                                 onRemove={() => removeBookmark(bookmark.id)}
                                 onLabelCommit={(value) => setBookmarkLabel(bookmark.id, value)}
                              />
                           ))}
                        </div>
                        )}
                     </PopoverContent>
                  </Popover>
               )}
               <JournalControlButton title={t('BoardView.nextPage')} disabled={pageIndex === pages.length - 1} onPointerDown={stopDrag} onClick={goNext}>
                  <ChevronRight className="h-3.5 w-3.5" />
               </JournalControlButton>
            </div>
         </div>

         {/* Bookmark side tabs (board default): portaled into the box's non-clipped side slot so they
             protrude past the right edge (the body keeps clipping its text). Still body-scaled + in page
             order. The wrapper stops the pointer so a tab miss never starts a canvas pan. The sheet uses
             `bookmarkMode='popover'` instead (the protruding tabs z-bury under flex-wrap neighbours). */}
         {bookmarkMode === 'side-tabs' && sideSlot && tabs.length > 0 && createPortal(
            <div onPointerDown={stopDrag} className="mt-9 flex flex-col items-start gap-1">
               {tabs.map(({ bookmark, page }) => (
                  <BookmarkTab
                     key={bookmark.id}
                     label={bookmark.label}
                     pageNumber={page + 1}
                     active={page === pageIndex}
                     editable={isSelected}
                     placeholder={t('BoardView.journalBookmarkPlaceholder')}
                     removeLabel={t('BoardView.journalRemoveBookmark')}
                     stopDrag={stopDrag}
                     onJump={() => jumpToPage(bookmark.pageId)}
                     onRemove={() => removeBookmark(bookmark.id)}
                     onLabelCommit={(value) => setBookmarkLabel(bookmark.id, value)}
                  />
               ))}
            </div>,
            sideSlot,
         )}
      </div>
   );
}
