// -- React Imports --
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { useStore } from 'zustand';

// -- Component Imports --
import { TabShell } from './TabShell';
import { CloseTabDialog } from '@/components/organisms/dialogs/CloseTabDialog';

// -- Store Imports --
import { getOrCreateBoardInstance } from '@/lib/board/boardStoreRegistry';
import { useTabManagerActions } from '@/lib/character/tabManagerStore';

// -- Constants --
import { BOARD_VISUAL } from '@/lib/constants/gameVisuals';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Type Imports --
import type { OpenTab } from '@/lib/character/tabManagerStore';

/**
 * A board tab. Its label is live-bound to that board's OWN store instance from the
 * board registry (never the character registry - a board id would mint a junk character
 * instance). It shows a board icon rather than a game crest.
 *
 * Closing deletes the working board record, but a drawer-saved copy survives and reopens
 * - so closing is non-destructive once saved. A CLEAN board closes silently; a DIRTY one
 * shows the unsaved-changes warning first.
 *
 * @param props.tab - The tab descriptor (its `id` is the board id keying the board store).
 * @param props.isActive - Whether this tab is the active one (drives the highlight).
 */
export function BoardTab({ tab, isActive }: { tab: OpenTab; isActive: boolean }) {
   const { t } = useTranslation();
   const { setActiveTab, closeTab } = useTabManagerActions();

   const instance = useMemo(() => getOrCreateBoardInstance(tab.id), [tab.id]);
   const name = useStore(instance, (state) => state.name);
   const hasUnsavedChanges = useStore(instance, (state) => state.hasUnsavedChanges);
   const label = name && name.trim().length > 0 ? name : t('Tabs.untitledBoard');

   const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
   const handleRequestClose = () => {
      if (hasUnsavedChanges) setIsCloseDialogOpen(true);
      else closeTab(tab.id);
   };

   const BoardIcon = BOARD_VISUAL.Icon;
   const icon = (
      <span
         aria-hidden
         className={cn('flex size-7 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ring-white/25', BOARD_VISUAL.gradient)}
      >
         <BoardIcon className="h-4 w-4 text-white" />
      </span>
   );

   return (
      <>
         <TabShell
            tabId={tab.id}
            label={label}
            leadingIcon={icon}
            isActive={isActive}
            onActivate={() => setActiveTab(tab.id)}
            onRequestClose={handleRequestClose}
         />
         <CloseTabDialog
            isOpen={isCloseDialogOpen}
            onOpenChange={setIsCloseDialogOpen}
            name={label}
            onConfirm={() => closeTab(tab.id)}
         />
      </>
   );
}
