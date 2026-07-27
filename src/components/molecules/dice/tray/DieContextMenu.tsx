// -- React Imports --
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

// -- Icon Imports --
import { Minus, Plus, Trash2 } from 'lucide-react';

// -- Utils Imports --
import { readSafeAreaInsetBottom } from '@/lib/utils/safeArea';

// -- Type Imports --
import type { DiceTrayDie } from '@/lib/dice/diceTrayTypes';
import type { Position } from '@/hooks/mobile/useLongPress';

/**
 * A positioned per-die context menu on mobile, anchored at the finger. Mirrors the drawer's floating
 * menu: it measures its own rendered rect and clamps left/top inside the viewport (allowing for the
 * bottom safe area) before paint, so a die near an edge still opens fully on-screen. A transparent
 * full-screen catcher dismisses on an outside tap. Sits above the app-modal band so it clears the host
 * sheet.
 */
export function DieContextMenu({ die, position, makePenaltyLabel, makeNormalLabel, removeLabel, onToggle, onRemove, onClose }: {
   die: DiceTrayDie;
   position: Position;
   makePenaltyLabel: string;
   makeNormalLabel: string;
   removeLabel: string;
   onToggle: () => void;
   onRemove: () => void;
   onClose: () => void;
}) {
   const menuRef = useRef<HTMLDivElement>(null);
   const [clamped, setClamped] = useState<{ left: number; top: number } | null>(null);

   useLayoutEffect(() => {
      if (!menuRef.current) return;
      const rect = menuRef.current.getBoundingClientRect();
      const safeBottom = readSafeAreaInsetBottom();
      const maxLeft = window.innerWidth - rect.width;
      const maxTop = window.innerHeight - rect.height - safeBottom;
      setClamped({ left: Math.max(0, Math.min(position.x, maxLeft)), top: Math.max(0, Math.min(position.y, maxTop)) });
   }, [position]);

   // Before the clamp measures, anchor at the raw finger point (size is position-independent, so the
   // pre-clamp rect is still accurate); the layout effect then nudges it fully on-screen.
   const style: CSSProperties = { position: 'fixed', left: `${clamped ? clamped.left : position.x}px`, top: `${clamped ? clamped.top : position.y}px` };

   return (
      <>
         <div className="fixed inset-0 z-[70]" onClick={onClose} />
         <div ref={menuRef} style={style} className="z-[71] min-w-44 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg">
            <div className="flex flex-col p-1">
               <button
                  type="button"
                  onClick={onToggle}
                  className="flex items-center gap-3 rounded-md px-3 py-3 text-left text-sm hover:bg-muted cursor-pointer"
               >
                  {die.negative ? <Plus className="h-5 w-5 shrink-0" /> : <Minus className="h-5 w-5 shrink-0" />}
                  {die.negative ? makeNormalLabel : makePenaltyLabel}
               </button>
               <div className="my-1 h-px bg-border" />
               <button
                  type="button"
                  onClick={onRemove}
                  className="flex items-center gap-3 rounded-md px-3 py-3 text-left text-sm text-destructive hover:bg-destructive/10 cursor-pointer"
               >
                  <Trash2 className="h-5 w-5 shrink-0" />
                  {removeLabel}
               </button>
            </div>
         </div>
      </>
   );
}
