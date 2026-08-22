// -- React Imports --
import { useState } from 'react';

// -- Other Library Imports --
import { motion } from 'framer-motion';

// -- Component Imports --
import { JournalItem } from '@/components/organisms/board/items/JournalItem';
import { ToolbarHandle, TOOLBAR_ACTION_BUTTON_CLASS } from '@/components/molecules/ToolbarHandle';

// -- Hook Imports --
import { useToolbarReveal } from '@/hooks/toolbarReveal';
import { useSheetMentionCreate } from '@/hooks/character-sheet/useSheetMentionCreate';

// -- Store Imports --
import { useCharacterActions } from '@/lib/stores/characterStore';

// -- Type Imports --
import type { DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import type { Journal } from '@/lib/types/board';
import type { BoardItem, BoardItemContent, JournalBoardContent } from '@/lib/types/board';

/*
 * A journal on the character sheet: the character's own paged notebook, a first-class card-element in
 * the cards flow. It sits in the same `Sortable` / `DragLayoutWrapper` the cards wear, and - like a
 * card organism - draws its own `ToolbarHandle` (grip drags via the passed listeners; trash removes the
 * journal). Reuses the board's `JournalItem` body verbatim - the same paging, pages, bookmarks, and
 * unmount-flush - without the board's copy/Save-back chrome (that lives in EmbeddedItem, which a sheet
 * journal has no use for). The body speaks the copy wrapper (`content.data`), so this host wraps the
 * bare `Journal` on the way in and unwraps it back onto `character.journals` on every edit.
 *
 * The body portals its page structural controls into `toolbarSlot` (owned here, inside the grab toolbar).
 * Bookmarks use `bookmarkMode='popover'`: instead of the board's protruding side tabs (which z-bury under
 * flex-wrap neighbours on the sheet), the body renders a Bookmarks button that opens a body-portaled list.
 * Editing follows the sheet's edit mode: in edit mode the page is an editable textarea and the controls
 * show; at rest the page renders its Markdown. A tapped `{mention}` creates on the active character via the
 * shared sheet handler (create-or-raise a status, de-dupe a tag) - the same source the challenge card uses -
 * rather than minting on a board.
 */

interface SheetJournalCardProps {
   journal: Journal;
   /** The sheet's edit mode: drives the body's edit textarea + its structural controls, and the toolbar delete. */
   isEditing: boolean;
   /** Exports the journal to a `.cotm` file, wired to the toolbar's export button (shown on hover, like a card). */
   onExport?: () => void;
   dragAttributes?: DraggableAttributes;
   dragListeners?: SyntheticListenerMap;
}

// The body reads geometry only to place a minted mention tracker on the board; the sheet has no board,
// so a zero rect is inert.
const SHEET_HOST_RECT: BoardItem = { id: '', kind: 'journal', z: 0, x: 0, y: 0, width: 250, height: 600, content: { kind: 'journal', mode: 'copy', data: { id: '', title: '', pages: [], bookmarks: [] } } };

export function SheetJournalCard({ journal, isEditing, onExport, dragAttributes, dragListeners }: SheetJournalCardProps) {
   const { updateJournal, removeJournal } = useCharacterActions();
   const { isRevealed, revealHandlers } = useToolbarReveal(journal.id);
   // A tapped mention in the page create-or-raises a status / de-dupes a tag on the active character.
   const handleMentionClick = useSheetMentionCreate();

   // State-backed slot so the body re-renders to portal its structural controls in once it mounts.
   const [toolbarSlot, setToolbarSlot] = useState<HTMLDivElement | null>(null);

   // The body edits a board copy wrapper; hand it the bare aggregate as `data` and unwrap on write.
   const content: JournalBoardContent = { kind: 'journal', mode: 'copy', data: journal };
   const handleContentChange = (next: BoardItemContent) => {
      if (next.kind === 'journal' && next.mode === 'copy') updateJournal(journal.id, next.data);
   };

   return (
      <motion.div {...revealHandlers} className="relative">
         <ToolbarHandle
            isEditing={isEditing}
            isHovered={isRevealed}
            dragAttributes={dragAttributes}
            dragListeners={dragListeners}
            onDelete={() => removeJournal(journal.id)}
            onExport={onExport}
            cardTheme="card-type-image"
            // The body's structural controls (add/remove page, bookmark) portal into this slot, which lives
            // inside the grab toolbar. Only present while editing (those are edit-only actions), so at rest
            // the toolbar reads exactly like a card's: just the grip. `display:contents` lets the portaled
            // buttons sit as direct flex children of the toolbar row - identical spacing to grip/delete.
            extraActions={isEditing ? <div ref={setToolbarSlot} className="contents" /> : undefined}
         />
         {/* Bookmarks use a body-portaled popover (not protruding tabs), so the card body simply clips its
             page content to the card shape - no side slot to keep un-clipped. */}
         <div className="relative min-w-62.5 w-62.5 h-150 overflow-hidden rounded-lg border-2 border-card-border bg-paper-background text-paper-foreground z-0">
            {/* The sheet has no separate edit sub-state: its edit mode drives BOTH the editors (isEditing)
                and the selected chrome (isSelected), so the body reads exactly as it did before the board
                split select from editing. */}
            <JournalItem
               item={SHEET_HOST_RECT}
               content={content}
               isSelected={isEditing}
               isEditing={isEditing}
               toolbarSlot={toolbarSlot}
               sideSlot={null}
               toolbarControlClassName={TOOLBAR_ACTION_BUTTON_CLASS}
               bookmarkMode="popover"
               onMentionClick={handleMentionClick}
               onContentChange={handleContentChange}
               onRequestSelect={() => {}}
            />
         </div>
      </motion.div>
   );
}
