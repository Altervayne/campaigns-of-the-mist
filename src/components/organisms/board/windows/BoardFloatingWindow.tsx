// -- React Imports --
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { X } from 'lucide-react';

/** Panel width for the card-creation window; mirrors the `w-96` footprint so the drag clamp knows it. */
export const CARD_WINDOW_WIDTH = 384;
/** Panel width for the portal-picker window; mirrors the picker's `w-[28rem]` footprint. */
export const PORTAL_WINDOW_WIDTH = 448;
/** Panel width for the portal restyle editor window. */
export const PORTAL_EDITOR_WIDTH = 340;
/** Screen-px margin a floating window keeps from the board edges (drag clamp + max-height). */
export const BOARD_WINDOW_MARGIN = 16;

/**
 * A draggable, non-modal window floating over the board canvas. It lives OUTSIDE the clip div (fixed,
 * clip-relative coords) and owns a `{x,y}` position seeded from `initialScreen`; the header is the drag
 * handle. The whole panel stops pointer-down propagation so dragging or using it never pans the canvas,
 * and the position is clamped to the board rect (parameterized by `width`) so it can't be dragged off-screen.
 * A tall body scrolls inside (max-height capped to the space below the panel). No backdrop and no
 * outside-click dismiss - it closes on the X button or Escape only. Chrome is app-token only; the body is
 * unpadded, so each consumer owns its own padding.
 */
export function BoardFloatingWindow({
   initialScreen,
   clipRect,
   width,
   title,
   onClose,
   children,
}: {
   initialScreen: { x: number; y: number };
   clipRect: { left: number; top: number; width: number; height: number };
   width: number;
   title: string;
   onClose: () => void;
   children: ReactNode;
}) {
   const { t } = useTranslation();
   const panelRef = useRef<HTMLDivElement | null>(null);

   /** Clamps a desired top-left so the panel stays fully within the board rect (its live height read from the DOM). */
   const clamp = useCallback(
      (x: number, y: number) => {
         const height = panelRef.current?.offsetHeight ?? 0;
         const minX = clipRect.left + BOARD_WINDOW_MARGIN;
         const minY = clipRect.top + BOARD_WINDOW_MARGIN;
         const maxX = Math.max(minX, clipRect.left + clipRect.width - width - BOARD_WINDOW_MARGIN);
         const maxY = Math.max(minY, clipRect.top + clipRect.height - height - BOARD_WINDOW_MARGIN);
         return { x: Math.min(Math.max(x, minX), maxX), y: Math.min(Math.max(y, minY), maxY) };
      },
      [clipRect, width],
   );

   // Seed the position from the initial anchor, clamped horizontally + off the top edge. Height is
   // unknown on the first render, so the vertical clamp settles once the panel measures (below).
   const [position, setPosition] = useState(() => {
      const minX = clipRect.left + BOARD_WINDOW_MARGIN;
      const maxX = Math.max(minX, clipRect.left + clipRect.width - width - BOARD_WINDOW_MARGIN);
      return { x: Math.min(Math.max(initialScreen.x, minX), maxX), y: Math.max(initialScreen.y, clipRect.top + BOARD_WINDOW_MARGIN) };
   });

   // Escape closes the window (it's non-modal, so no outside-click dismiss to lean on).
   useEffect(() => {
      const onKeyDown = (event: KeyboardEvent) => {
         if (event.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
   }, [onClose]);

   /** Header drag: pointer on the header background repositions the whole panel (clamped). The X button
    *  and any header controls opt out via `closest('button')`, so pressing them never starts a drag. */
   const handleHeaderPointerDown = (event: ReactPointerEvent) => {
      if (event.button !== 0) return;
      if (event.target instanceof Element && event.target.closest('button')) return;
      const startX = event.clientX;
      const startY = event.clientY;
      const origin = position;
      const onMove = (moveEvent: PointerEvent) => {
         setPosition(clamp(origin.x + (moveEvent.clientX - startX), origin.y + (moveEvent.clientY - startY)));
      };
      const onUp = () => {
         window.removeEventListener('pointermove', onMove);
         window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
   };

   // Grow downward from the panel's top; a tall body scrolls inside rather than spilling past the board.
   const maxHeight = clipRect.height > 0 ? clipRect.top + clipRect.height - position.y - BOARD_WINDOW_MARGIN : undefined;

   return (
      <div
         ref={panelRef}
         onPointerDown={(event) => event.stopPropagation()}
         style={{ left: position.x, top: position.y, width, maxHeight }}
         className="fixed z-50 flex flex-col overflow-hidden rounded-lg border border-border bg-popover/95 shadow-lg backdrop-blur-sm"
      >
         {/* Header doubles as the drag handle. Styled from app tokens only, so it follows the chosen theme palette. */}
         <div
            onPointerDown={handleHeaderPointerDown}
            className="flex shrink-0 cursor-move select-none items-center justify-between border-b border-border bg-muted/40 px-4 py-2.5"
         >
            <span className="text-sm font-semibold text-foreground">{title}</span>
            <button
               type="button"
               title={t('Common.close')}
               aria-label={t('Common.close')}
               onClick={onClose}
               className="flex items-center justify-center rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
            >
               <X className="h-4 w-4" />
            </button>
         </div>
         {/* Body scrolls inside the panel (height capped to the space below it); padding is the consumer's. */}
         <div className="min-h-0 overflow-y-auto">{children}</div>
      </div>
   );
}
