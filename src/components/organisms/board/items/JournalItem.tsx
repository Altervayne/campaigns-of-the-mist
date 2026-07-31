// -- React Imports --
import { useMemo, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// -- Utils Imports --
import { migrateJournalContent, orderedBookmarkTabs } from '@/lib/board/journalContent';

// -- Component Imports --
import { BookmarkTabs } from './journal/BookmarkTabs';
import { JournalNavBar } from './journal/JournalNavBar';
import { JournalPageBody } from './journal/JournalPageBody';
import { JournalTitleBar } from './journal/JournalTitleBar';
import { JournalToolbarActions } from './journal/JournalToolbarActions';

// -- Hook Imports --
import { useBoardMentionMint } from '@/hooks/board/useBoardMentionMint';
import { useJournalActions } from '@/hooks/board/useJournalActions';
import { useJournalPageBuffer } from '@/hooks/board/useJournalPageBuffer';
import { useJournalPageIndex } from '@/hooks/board/useJournalPageIndex';
import { useJournalTitleBuffer } from '@/hooks/board/useJournalTitleBuffer';

// -- Type Imports --
import type { BoardItem, BoardItemContent, JournalBoardContent, JournalBookmark, JournalPage } from '@/lib/types/board';
import type { MentionSegment } from '@/lib/challenge/parseMentions';

/**
 * The full page/bookmark control surface, handed to a host-supplied {@link JournalItemProps.renderControls}
 * so a surface can inject its own bar (the mobile paper control bar) in place of the default `JournalNavBar`,
 * without re-orchestrating any of the paging/buffer/action wiring.
 */
export interface JournalControlsContext {
   pageIndex: number;
   pageCount: number;
   /** The rendered pages, in order, for a bar that surfaces a page overview / reorder. */
   pages: JournalPage[];
   activePageId: string;
   isSelected: boolean;
   isEditing: boolean;
   tabs: { bookmark: JournalBookmark; page: number }[];
   isBookmarked: boolean;
   /** One empty page left, the live buffer included - there is nothing to remove. */
   removeDisabled: boolean;
   stopDrag: (event: ReactPointerEvent) => void;
   onPrev: () => void;
   onNext: () => void;
   /** Jump to a validated 1..M page number. */
   onGoToPageNumber: (pageNumber: number) => void;
   onAddPage: () => void;
   onRemovePage: () => void;
   onToggleBookmark: () => void;
   onJumpToPage: (pageId: string) => void;
   /** Drag-reorder pages by id; the reader follows the current page by id, never a slot. */
   onReorderPages: (activeId: string, overId: string) => void;
   onRemoveBookmark: (id: string) => void;
   onSetBookmarkLabel: (id: string, label: string) => void;
}

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
    * Touch sizing for the mobile surface: the page/title editors grow to 16px (so iOS doesn't zoom on focus)
    * and the resting page scrolls its own overflow. Defaults false, so the board and sheet-card hosts render
    * exactly as before.
    */
   touch?: boolean;
   /** Extra bottom padding on the page scroll surface (mobile FAB clearance); forwarded to the page body. */
   pageBottomInset?: string;
   /**
    * Injects the page/bookmark control surface. When set (the mobile paper control bar), it replaces the
    * default `JournalNavBar` and receives the full {@link JournalControlsContext}; the structural actions then
    * live in that bar, so a mobile host passes no `toolbarSlot`. Undefined -> the desktop `JournalNavBar`.
    */
   renderControls?: (context: JournalControlsContext) => ReactNode;
   /**
    * Overrides the tapped-mention handler. The board leaves it undefined and mints a board-native tracker
    * (`useBoardMentionMint`); the sheet journal passes the on-sheet create-or-raise handler so a tap creates
    * a status/tag on the active character (its fake zero-rect host means the board mint would no-op).
    */
   onMentionClick?: (segment: MentionSegment) => void;
   onContentChange: (content: BoardItemContent) => void;
   onRequestSelect: () => void;
}

export function JournalItem({ item, content, isSelected, isEditing, autoFocusEditor = false, toolbarSlot, sideSlot, toolbarControlClassName, bookmarkMode = 'side-tabs', touch = false, pageBottomInset, renderControls, onMentionClick, onContentChange, onRequestSelect }: JournalItemProps) {
   // A tapped `{mention}` mints a board-native tracker beside the journal (create-only, board scope); a host
   // that supplies its own handler (the sheet journal -> create-or-raise on the character) overrides it.
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

   // The page position, then the two buffered text fields. Order is load-bearing: the page buffer's flushes
   // register before the title's, and both commits derive from this render's `journal` snapshot.
   const { pageIndex, setIndex, activePage } = useJournalPageIndex(journal.id, pages);
   const { text, setText, commit, pageAreaRef } = useJournalPageBuffer({ journal, pages, activePage, isEditing, autoFocusEditor, commitJournal });
   const { titleText, setTitleText, commitTitle, titleAreaRef } = useJournalTitleBuffer({ journal, isEditing, commitJournal });

   const stopDrag = (event: ReactPointerEvent) => event.stopPropagation();

   const { goPrev, goNext, insertPage, addPage, removePage, reorderPages, goToPageNumber, isBookmarked, toggleBookmark, removeBookmark, setBookmarkLabel, jumpToPage } =
      useJournalActions({ journal, pages, activePage, bookmarks, pageIndex, setIndex, text, commit, commitJournal });

   const tabs = orderedBookmarkTabs(pages, bookmarks);

   // One empty page left, the live buffer included - there is nothing to remove.
   const removeDisabled = pages.length === 1 && (pages[0]?.text ?? '') === '' && text === '';

   return (
      <div className="relative flex h-full w-full flex-col bg-paper-background text-paper-foreground">
         <JournalTitleBar
            isEditing={isEditing}
            touch={touch}
            storedTitle={journal.title}
            titleText={titleText}
            titleAreaRef={titleAreaRef}
            onTitleChange={setTitleText}
            onCommitTitle={commitTitle}
            onRequestSelect={onRequestSelect}
         />

         {/* Structural actions live in the selection toolbar. A host that injects its own control bar
             (mobile) carries these inside it instead and passes no toolbarSlot. */}
         {isSelected && toolbarSlot && createPortal(
            <JournalToolbarActions
               isBookmarked={isBookmarked}
               removeDisabled={removeDisabled}
               toolbarControlClassName={toolbarControlClassName}
               stopDrag={stopDrag}
               onAddPage={addPage}
               onRemovePage={removePage}
               onToggleBookmark={toggleBookmark}
            />,
            toolbarSlot,
         )}

         <JournalPageBody
            isEditing={isEditing}
            touch={touch}
            paddingBottom={pageBottomInset}
            text={text}
            pageAreaRef={pageAreaRef}
            onTextChange={setText}
            onCommit={commit}
            onRequestSelect={onRequestSelect}
            onMentionClick={handleMentionClick}
         />

         {renderControls ? (
            renderControls({
               pageIndex,
               pageCount: pages.length,
               pages,
               activePageId: activePage.id,
               isSelected,
               isEditing,
               tabs,
               isBookmarked,
               removeDisabled,
               stopDrag,
               onPrev: goPrev,
               onNext: goNext,
               onGoToPageNumber: goToPageNumber,
               onAddPage: addPage,
               onRemovePage: removePage,
               onToggleBookmark: toggleBookmark,
               onJumpToPage: jumpToPage,
               onReorderPages: reorderPages,
               onRemoveBookmark: removeBookmark,
               onSetBookmarkLabel: setBookmarkLabel,
            })
         ) : (
            <JournalNavBar
               pages={pages}
               activePageId={activePage.id}
               pageIndex={pageIndex}
               isSelected={isSelected}
               bookmarkMode={bookmarkMode}
               tabs={tabs}
               stopDrag={stopDrag}
               onPrev={goPrev}
               onNext={goNext}
               onInsertPage={insertPage}
               onGoToPageNumber={goToPageNumber}
               onReorderPages={reorderPages}
               onJumpToPage={jumpToPage}
               onRemoveBookmark={removeBookmark}
               onSetBookmarkLabel={setBookmarkLabel}
            />
         )}

         {/* Bookmark side tabs (board default): portaled into the box's non-clipped side slot so they
             protrude past the right edge (the body keeps clipping its text). The sheet uses
             `bookmarkMode='popover'` instead (the protruding tabs z-bury under flex-wrap neighbours). */}
         {bookmarkMode === 'side-tabs' && sideSlot && tabs.length > 0 && createPortal(
            <BookmarkTabs
               tabs={tabs}
               pageIndex={pageIndex}
               editable={isSelected}
               stopDrag={stopDrag}
               onJump={jumpToPage}
               onRemove={removeBookmark}
               onLabelCommit={setBookmarkLabel}
            />,
            sideSlot,
         )}
      </div>
   );
}
