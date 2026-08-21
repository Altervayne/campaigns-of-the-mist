// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { StencilLibraryManager } from './StencilLibraryManager';

/**
 * The Stencils section: the user's reusable mask library. A stencil is just a named mask reused to shape board
 * images (no per-game scoping, no active selection), so the pane is a thin frame around the manager.
 */
export function StencilsSettingsPane() {
   const { t } = useTranslation();

   return (
      <div className="flex h-full flex-col gap-4">
         <p className="shrink-0 text-sm text-muted-foreground">{t('SettingsDialog.stencils.description')}</p>
         <StencilLibraryManager />
      </div>
   );
}
