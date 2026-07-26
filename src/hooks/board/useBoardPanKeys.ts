// -- React Imports --
import { useEffect, useRef, useState } from 'react';

// -- Utils Imports --
import { isEditableTarget } from '@/components/organisms/board/boardCanvasConstants';

/*
 * The mode-independent pan-arm keys. Space and Alt each arm a pan while held; the hook returns the state
 * flags for the cursor plus the Space ref twin the pointer handlers read live. Both clear on a window blur
 * so an alt-tab never leaves a stuck pan.
 */
export function useBoardPanKeys() {
   // Space arms a mode-independent pan (mirrored to a ref for the pointer handlers, and to state for the
   // cursor). The pen overlay + a Space/middle-drag can all start a pan, so the trigger is mode-agnostic.
   const [spaceHeld, setSpaceHeld] = useState(false);
   const spaceHeldRef = useRef(false);
   // Alt likewise arms a pan (Alt+left-drag). Only the cursor needs it in state - the pointerdown reads
   // `event.altKey` live - so there's no ref twin; keyup / blur disarm it, mirroring Space.
   const [altHeld, setAltHeld] = useState(false);

   // Space and Alt each arm a pan while held, cleared on keyup or a window blur (no stuck arm after an
   // alt-tab). Space is ignored while editing text on the board (a post-it/journal/text field) so typing
   // a space never arms it; Alt isn't a typing key, so it needs no such guard.
   useEffect(() => {
      const clearSpace = () => { spaceHeldRef.current = false; setSpaceHeld(false); };
      const onKeyDown = (event: KeyboardEvent) => {
         if (event.code === 'Space') {
            if (isEditableTarget(event.target)) return;
            if (!spaceHeldRef.current) { spaceHeldRef.current = true; setSpaceHeld(true); }
            event.preventDefault(); // stop the page from scrolling on Space
         } else if (event.key === 'Alt') {
            setAltHeld(true);
         }
      };
      const onKeyUp = (event: KeyboardEvent) => {
         if (event.code === 'Space') clearSpace();
         else if (event.key === 'Alt') setAltHeld(false);
      };
      const clearAll = () => { clearSpace(); setAltHeld(false); };
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', clearAll);
      return () => {
         window.removeEventListener('keydown', onKeyDown);
         window.removeEventListener('keyup', onKeyUp);
         window.removeEventListener('blur', clearAll);
      };
   }, []);

   return { spaceHeld, spaceHeldRef, altHeld };
}
