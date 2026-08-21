// -- React Imports --
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

// -- Library Imports --
import toast from 'react-hot-toast';

// -- Utils Imports --
import { isExportedStencil } from '@/lib/utils/export-import';

// -- Store Imports --
import { useStencilLibraryStore } from '@/lib/stores/stencilLibraryStore';

// -- Type Imports --
import type { ExportFile, ExportedStencil } from '@/lib/utils/export-import';

/**
 * The one place a stencil is imported, shared by every entry point (manager button, any future drop). Given an
 * already-parsed envelope: if it's a stencil, add a fresh library entry owning the embedded mask and return its
 * id (for select/scroll-into-view); otherwise report failure and return null.
 *
 * The mask's bytes rode the envelope's `assets` map and were already re-stored through `storeAsset` (dedup-aware)
 * by `importFromFile` before it resolved, so the asset is present here; the new entry becomes its GC keeper.
 */
export function useStencilImport() {
   const { t } = useTranslation();

   return useCallback(async (file: ExportFile): Promise<string | null> => {
      if (!isExportedStencil(file)) {
         toast.error(t('Notifications.general.importFailed'));
         return null;
      }
      const content = file.content as ExportedStencil;
      const record = await useStencilLibraryStore.getState().actions.add(content.name, content.maskAssetId);
      toast.success(t('Notifications.stencil.imported'));
      return record.id;
   }, [t]);
}
