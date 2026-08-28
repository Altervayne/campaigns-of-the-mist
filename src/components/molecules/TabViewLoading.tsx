// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { MistSpinner } from '@/components/molecules/MistSpinner';

// The Suspense fallback for a lazy note/board/pdf tab. It fills the tab content area
// (not the viewport) so the tab strip and sidebar stay put while the chunk loads, and
// names what it's fetching so a tab switch reads as "loading this view", never a blank app.
type TabViewLoadingKind = 'note' | 'board' | 'pdf';

export function TabViewLoading({ kind }: { kind: TabViewLoadingKind }) {
   const { t } = useTranslation();

   return (
      <div className="absolute inset-0 flex items-center justify-center bg-background text-muted-foreground">
         {/* The mist-filled logo carries the wait; the kind label names what's loading. */}
         <MistSpinner variant="logo" size={104} tip={t(`Loading.${kind}`)} label={t(`Loading.${kind}`)} />
      </div>
   );
}
