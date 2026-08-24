// -- React Imports --
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { useStore } from 'zustand';

// -- Icon Imports --
import { FileType } from 'lucide-react';

// -- Component Imports --
import { TabShell } from './TabShell';

// -- Store Imports --
import { getOrCreatePdfInstance } from '@/lib/pdf/pdfStoreRegistry';
import { useTabManagerActions } from '@/lib/character/tabManagerStore';

// -- Constants --
import { PDF_VISUAL } from '@/lib/constants/gameVisuals';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Type Imports --
import type { OpenTab } from '@/lib/character/tabManagerStore';

/**
 * A pdf tab. Its label is live-bound to that pdf's OWN store instance from the pdf registry (never
 * the character registry - a pdf id would mint a junk character instance). It shows a document glyph
 * rather than a game crest.
 *
 * A PDF is read-only, so it is never dirty: closing disposes the reader and reaps the working row
 * WITHOUT a confirm, and the drawer copy survives to reopen. There is no unsaved-changes dialog.
 *
 * @param props.tab - The tab descriptor (its `id` is the pdf id keying the pdf store).
 * @param props.isActive - Whether this tab is the active one (drives the highlight).
 */
export function PdfTab({ tab, isActive }: { tab: OpenTab; isActive: boolean }) {
   const { t } = useTranslation();
   const { setActiveTab, closeTab } = useTabManagerActions();

   const instance = useMemo(() => getOrCreatePdfInstance(tab.id), [tab.id]);
   const title = useStore(instance, (state) => state.doc?.title);
   const label = title && title.trim().length > 0 ? title : t('Tabs.untitledPdf');

   const icon = (
      <span
         aria-hidden
         className={cn('flex size-7 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ring-white/25', PDF_VISUAL.gradient)}
      >
         <FileType className="h-4 w-4 text-white" />
      </span>
   );

   return (
      <TabShell
         tabId={tab.id}
         label={label}
         leadingIcon={icon}
         isActive={isActive}
         onActivate={() => setActiveTab(tab.id)}
         onRequestClose={() => closeTab(tab.id)}
      />
   );
}
