// -- Library Imports --
import { useStore } from 'zustand';
import { useTranslation } from 'react-i18next';

// -- Store Imports --
import { useActiveNoteInstance } from '@/lib/notes/ActiveNoteStoreContext';

// -- Type Imports --
import type { NoteStore } from '@/lib/stores/noteStore';

/*
 * Mobile note workspace surface. Fills the workspace slot (where the character sheet renders) while a note
 * tab is active, reading the ACTIVE NOTE instance the same way the desktop NoteView does. A placeholder for
 * now: it exists to prove the mobile activation path lights up the active-note context; the editor lands later.
 */
export default function MobileNoteSurface() {
   const store = useActiveNoteInstance();
   if (!store) return null;
   return <MobileNoteSurfaceInner store={store} />;
}

/** The bound surface, split out so the store subscription runs on a guaranteed-non-null instance. */
function MobileNoteSurfaceInner({ store }: { store: NoteStore }) {
   const { t } = useTranslation();
   const title = useStore(store, (state) => state.note?.title ?? '');

   return (
      <div className="flex h-full w-full flex-col overflow-y-auto bg-background text-foreground">
         <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <h1 className="text-xl font-semibold">
               {title || t('NoteView.titlePlaceholder')}
            </h1>
            <p className="text-sm text-muted-foreground">
               {t('NoteView.mobilePlaceholder')}
            </p>
         </div>
      </div>
   );
}
