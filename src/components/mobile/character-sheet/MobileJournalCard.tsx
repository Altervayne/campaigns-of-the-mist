// -- Component Imports --
import { JournalItem } from '@/components/organisms/board/items/JournalItem';
import { MobileJournalControlBar } from '@/components/organisms/board/items/journal/MobileJournalControlBar';

// -- Hook Imports --
import { useSheetMentionCreate } from '@/hooks/character-sheet/useSheetMentionCreate';

// -- Store Imports --
import { useCharacterActions } from '@/lib/stores/characterStore';
import { useAppGeneralStateStore } from '@/lib/stores/appGeneralStateStore';
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';

// -- Utils Imports --

// -- Type Imports --
import type { BoardItem, BoardItemContent, Journal, JournalBoardContent } from '@/lib/types/board';

/*
 * A journal filling the mobile card stage: the notebook occupies the whole stage (not a fixed card box), with
 * the shared `JournalItem` body inside - the same paging, pages, bookmarks, and unmount-flush as desktop, in
 * its `touch` sizing (16px editors, a scrolling page). Page navigation is a bespoke `--paper` control bar
 * injected through the body's control slot, so the item stepping (swipe / nav-bar) and the page turning never
 * fight. Editing rides the sheet's global Edit mode: at rest the page renders its Markdown; in Edit mode it is
 * a textarea and the control bar grows its edit strip. The body speaks the board copy wrapper (`content.data`),
 * so this host wraps the bare `Journal` in and unwraps it back onto `character.journals` on every edit. A
 * tapped `{mention}` creates on the active character via the shared sheet handler.
 */

// The body reads geometry only to place a minted mention tracker on a board; the sheet has no board, so a zero
// rect is inert (and mentions route through the sheet handler, never the board mint).
const SHEET_HOST_RECT: BoardItem = { id: '', kind: 'journal', z: 0, x: 0, y: 0, width: 250, height: 600, content: { kind: 'journal', mode: 'copy', data: { id: '', title: '', pages: [], bookmarks: [] } } };

interface MobileJournalCardProps {
   journal: Journal;
}

export function MobileJournalCard({ journal }: MobileJournalCardProps) {
   const { updateJournal } = useCharacterActions();
   const isEditing = useAppGeneralStateStore((state) => state.isEditing);
   const isMobileFABMode = useAppSettingsStore((state) => state.isMobileFABMode);
   const isLeftHanded = useAppSettingsStore((state) => state.mobileHandedness) === 'left';
   const handleMentionClick = useSheetMentionCreate();

   // The body edits a board copy wrapper; hand it the bare aggregate as `data` and unwrap on write.
   const content: JournalBoardContent = { kind: 'journal', mode: 'copy', data: journal };
   const handleContentChange = (next: BoardItemContent) => {
      if (next.kind === 'journal' && next.mode === 'copy') updateJournal(journal.id, next.data);
   };

   return (
      <div className="relative flex h-full w-full flex-col overflow-hidden rounded-lg border-2 border-paper-border bg-paper-background text-paper-foreground">
         <JournalItem
            item={SHEET_HOST_RECT}
            content={content}
            isSelected={isEditing}
            isEditing={isEditing}
            touch
            toolbarSlot={null}
            sideSlot={null}
            bookmarkMode="popover"
            renderControls={(context) => <MobileJournalControlBar {...context} isMobileFABMode={isMobileFABMode} isLeftHanded={isLeftHanded} />}
            onMentionClick={handleMentionClick}
            onContentChange={handleContentChange}
            onRequestSelect={() => {}}
         />
      </div>
   );
}
