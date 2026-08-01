// -- React Imports --
import { useEffect, useState } from 'react';

/*
 * Tracks the on-screen keyboard's height via the VisualViewport API, so a control can ride the top of the
 * soft keyboard. The inset is `layout height - visual height - visual offsetTop`: zero with no keyboard, the
 * keyboard's height while it is up. Falls back to zero where VisualViewport is unavailable (the control then
 * rests at its keyboard-closed position).
 */
export function useKeyboardInset(): number {
   const [inset, setInset] = useState(0);

   useEffect(() => {
      const vv = window.visualViewport;
      if (!vv) return;

      const update = () => {
         const next = window.innerHeight - vv.height - vv.offsetTop;
         // Clamp tiny sub-pixel noise to zero so a closed keyboard reads as flat 0 (not a 0.5px jitter).
         setInset(next > 1 ? next : 0);
      };
      update();
      vv.addEventListener('resize', update);
      vv.addEventListener('scroll', update);
      return () => {
         vv.removeEventListener('resize', update);
         vv.removeEventListener('scroll', update);
      };
   }, []);

   return inset;
}
