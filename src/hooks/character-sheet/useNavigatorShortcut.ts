// -- React Imports --
import { useEffect } from 'react';

// -- Utils Imports --
import { isEditableTarget } from '@/lib/utils/textEntry';

// A bare `N` toggles the Navigator (its main door - a power-nav tool). Ignored while editing text (a field,
// a board/note editor) and when a modifier is held, so browser shortcuts stay intact. Global (unlike the
// board-only `L` for Layers), since the Navigator crawls from any workspace.
export function useNavigatorShortcut(toggleNavigator: () => void): void {
   useEffect(() => {
      const onKeyDown = (event: KeyboardEvent) => {
         if (event.ctrlKey || event.metaKey || event.altKey) return;
         if (isEditableTarget(event.target)) return;
         if (event.key === 'n' || event.key === 'N') {
            event.preventDefault();
            toggleNavigator();
         }
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
   }, [toggleNavigator]);
}
