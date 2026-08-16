// -- React Imports --
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { useStore } from 'zustand';

// -- Icon Imports --
import { NotebookPen } from 'lucide-react';

// -- Component Imports --
import { TabShell } from './TabShell';
import { CloseTabDialog } from '@/components/organisms/dialogs/CloseTabDialog';

// -- Store Imports --
import { getOrCreateNoteInstance } from '@/lib/notes/noteStoreRegistry';
import { useTabManagerActions } from '@/lib/character/tabManagerStore';

// -- Constants --
import { NOTE_VISUAL } from '@/lib/constants/gameVisuals';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Type Imports --
import type { OpenTab } from '@/lib/character/tabManagerStore';

/**
 * A note tab. Its label is live-bound to that note's OWN store instance from the note
 * registry (never the character registry - a note id would mint a junk character
 * instance). It shows a note icon rather than a game crest.
 *
 * Closing deletes the working note record, but a drawer-saved copy survives and reopens
 * - so closing is non-destructive once saved. A CLEAN note closes silently; a DIRTY one
 * shows the unsaved-changes warning first.
 *
 * @param props.tab - The tab descriptor (its `id` is the note id keying the note store).
 * @param props.isActive - Whether this tab is the active one (drives the highlight).
 */
export function NoteTab({ tab, isActive }: { tab: OpenTab; isActive: boolean }) {
   const { t } = useTranslation();
   const { setActiveTab, closeTab } = useTabManagerActions();

   const instance = useMemo(() => getOrCreateNoteInstance(tab.id), [tab.id]);
   const title = useStore(instance, (state) => state.note?.title);
   const hasUnsavedChanges = useStore(instance, (state) => state.hasUnsavedChanges);
   const label = title && title.trim().length > 0 ? title : t('Common.untitledNote');

   const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
   const handleRequestClose = () => {
      if (hasUnsavedChanges) setIsCloseDialogOpen(true);
      else closeTab(tab.id);
   };

   const icon = (
      <span
         aria-hidden
         className={cn('flex size-7 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ring-white/25', NOTE_VISUAL.gradient)}
      >
         <NotebookPen className="h-4 w-4 text-white" />
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
