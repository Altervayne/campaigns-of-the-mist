// -- React Imports --
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { X } from 'lucide-react';

// -- Component Imports --
import { MistSpinner } from '@/components/molecules/MistSpinner';
import { PdfOutlineTree } from './PdfOutlineTree';
import { PdfThumbnailStrip } from './PdfThumbnailStrip';

// -- Local Imports --
import { usePdfOutline } from './usePdfOutline';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Type Imports --
import type { PdfNavTab } from '@/lib/stores/pdfStore';
import type { PDFDocumentProxy } from 'pdfjs-dist';

/*
 * The reader's left navigation panel, mirroring the comments panel's chrome: two tabs jump to a page - the
 * PDF's embedded outline (bookmarks) and lazy-rendered thumbnails. The outline resolves once at the panel
 * level (regardless of the active tab), so flipping tabs never re-resolves it. Chrome uses theme tokens; the
 * thumbnail paper stays white on its own.
 */

interface PdfNavPanelProps {
   proxy: PDFDocumentProxy;
   pageCount: number;
   currentPage: number;
   defaultAspect: number;
   tab: PdfNavTab;
   onTabChange: (tab: PdfNavTab) => void;
   onJump: (page: number) => void;
   onClose: () => void;
}

export function PdfNavPanel({ proxy, pageCount, currentPage, defaultAspect, tab, onTabChange, onJump, onClose }: PdfNavPanelProps) {
   const { t } = useTranslation();
   const { outline, loading } = usePdfOutline(proxy);

   return (
      <aside className="flex h-full w-full flex-col border-r border-border bg-card text-card-foreground shadow-[4px_0_12px_-4px_rgba(0,0,0,0.15)]">
         <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2">
            <h2 className="flex-1 text-sm font-semibold">{t('PdfView.nav.title')}</h2>
            <button
               type="button"
               title={t('PdfView.nav.close')}
               aria-label={t('PdfView.nav.close')}
               onClick={onClose}
               className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-card-foreground"
            >
               <X className="h-4 w-4" />
            </button>
         </div>

         <div className="flex gap-1 border-b border-border bg-card p-1.5">
            <TabButton active={tab === 'outline'} onClick={() => onTabChange('outline')}>
               {t('PdfView.nav.outline')}
            </TabButton>
            <TabButton active={tab === 'thumbnails'} onClick={() => onTabChange('thumbnails')}>
               {t('PdfView.nav.thumbnails')}
            </TabButton>
         </div>

         <div className="min-h-0 flex-1 overflow-hidden bg-background">
            {tab === 'outline' ? (
               loading ? (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                     <MistSpinner size={48} />
                  </div>
               ) : outline.length === 0 ? (
                  <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
                     {t('PdfView.nav.outlineEmpty')}
                  </div>
               ) : (
                  <div className="h-full overflow-y-auto bg-background">
                     <PdfOutlineTree outline={outline} onJump={onJump} />
                  </div>
               )
            ) : (
               <PdfThumbnailStrip proxy={proxy} pageCount={pageCount} currentPage={currentPage} defaultAspect={defaultAspect} onJump={onJump} />
            )}
         </div>
      </aside>
   );
}

/** A segment of the two-tab switcher: the active tab reads raised, the inactive one muted. */
function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
   return (
      <button
         type="button"
         onClick={onClick}
         aria-pressed={active}
         className={cn(
            'flex-1 cursor-pointer rounded px-2 py-1 text-xs font-medium transition-colors',
            active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
         )}
      >
         {children}
      </button>
   );
}
