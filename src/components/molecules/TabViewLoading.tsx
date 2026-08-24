// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { FileType, LayoutGrid, LoaderCircle, NotebookPen } from 'lucide-react';

// The Suspense fallback for a lazy note/board/pdf tab. It fills the tab content area
// (not the viewport) so the tab strip and sidebar stay put while the chunk loads,
// and names what it's fetching with the matching tab icon + label so a tab switch
// reads as "loading this view", never a blank app.
type TabViewLoadingKind = 'note' | 'board' | 'pdf';

const KIND_ICON = {
   note: NotebookPen,
   board: LayoutGrid,
   pdf: FileType,
} as const;

export function TabViewLoading({ kind }: { kind: TabViewLoadingKind }) {
   const { t } = useTranslation();
   const Icon = KIND_ICON[kind];

   return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background text-muted-foreground">
         <Icon className="h-10 w-10 opacity-40" />
         <div className="flex items-center gap-2">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            <span className="text-sm">{t(`Loading.${kind}`)}</span>
         </div>
      </div>
   );
}
