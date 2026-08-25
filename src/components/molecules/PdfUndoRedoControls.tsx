// -- Other Library Imports --
import { useStore } from 'zustand';

// -- Component Imports --
import { UndoRedoButtons } from './UndoRedoButtons';

// -- Store and Hook Imports --
import { useActivePdfInstance } from '@/lib/pdf/ActivePdfStoreContext';

// -- Type Imports --
import type { PdfStore } from '@/lib/stores/pdfStore';

/**
 * The sidebar undo/redo control for a pdf tab, fed from the active pdf store's annotation history. Both are
 * disabled when the stacks are empty (a reader with no markup yet). Outer/inner split mirrors the note control:
 * the context hook returns `PdfStore | null` and `useStore` cannot take null, so the outer renders nothing when
 * no pdf tab is active.
 */
export function PdfUndoRedoControls({ isCollapsed }: { isCollapsed: boolean }) {
   const instance = useActivePdfInstance();
   if (!instance) return null;
   return <PdfUndoRedoControlsInner store={instance} isCollapsed={isCollapsed} />;
}

function PdfUndoRedoControlsInner({ store, isCollapsed }: { store: PdfStore; isCollapsed: boolean }) {
   const canUndo = useStore(store, (state) => state.undoStack.length > 0);
   const canRedo = useStore(store, (state) => state.redoStack.length > 0);
   const actions = useStore(store, (state) => state.actions);

   return (
      <UndoRedoButtons
         controller={{ undo: () => actions.undo(), redo: () => actions.redo(), canUndo, canRedo }}
         isCollapsed={isCollapsed}
      />
   );
}
