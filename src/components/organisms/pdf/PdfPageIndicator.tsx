// -- React Imports --
import { useTranslation } from 'react-i18next';

/**
 * A small floating page readout ({@code current / total}) pinned to the reader's bottom edge. Chrome,
 * so it uses theme tokens; non-interactive in this phase (the jump-to-page input arrives later).
 */
export function PdfPageIndicator({ current, total }: { current: number; total: number }) {
   const { t } = useTranslation();
   return (
      <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
         <span className="rounded-full border border-border bg-card/90 px-3 py-1 text-sm font-medium text-card-foreground shadow-md shadow-black/10 backdrop-blur-sm">
            {t('PdfView.pageIndicator', { current, total })}
         </span>
      </div>
   );
}
