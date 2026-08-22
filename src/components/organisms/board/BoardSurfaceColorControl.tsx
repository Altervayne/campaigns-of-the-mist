// -- React Imports --
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { ColorPickerPopover } from '@/components/molecules/color/ColorPickerPopover';

// -- Utils Imports --
import { CONNECTION_PALETTE } from '@/lib/board/boardConnections';
import { pushRecentColor, readRecentColors } from '@/lib/recentColors';
import { useCommitOnUnmount } from '@/hooks/useCommitOnUnmount';

/**
 * A clearable color swatch for the board-surface menu (the fill color and the grid line color both use it):
 * a swatch trigger opening the shared portaled color popover. Every pick previews LIVE on the board through
 * `onPreview` (no persist), and the final value commits ONCE on close through `onCommit` - so a drag updates
 * the canvas instantly without flooding the write path. Removing clears the color (commits `undefined`).
 * Custom colors join the shared recents. `activeColor` is the swatch fill; absent shows the empty-state swatch.
 */
export function BoardSurfaceColorControl({
   activeColor,
   swatchFill,
   title,
   removeLabel,
   onPreview,
   onCommit,
}: {
   /** The stored color, or undefined when none is set (drives the picker's active highlight). */
   activeColor: string | undefined;
   /** What the trigger swatch paints when no color is set (a token background hint). */
   swatchFill: string | undefined;
   title: string;
   removeLabel: string;
   /** Applies a color to the render without persisting - fires on every pick so the drag reads live. */
   onPreview: (color: string | undefined) => void;
   onCommit: (color: string | undefined) => void;
}) {
   const { t } = useTranslation();
   const [open, setOpen] = useState(false);

   // The pending edit reads from a ref so the commit is correct from any close path (swatch / outside /
   // Escape / unmount) and unaffected by stale closures. `has` distinguishes "no edit" from "clear to none".
   const pendingRef = useRef<{ has: boolean; value: string | undefined }>({ has: false, value: undefined });

   const commit = useCallback(() => {
      const pending = pendingRef.current;
      pendingRef.current = { has: false, value: undefined };
      if (!pending.has) return;
      onCommit(pending.value);
      if (pending.value && !(CONNECTION_PALETTE as readonly string[]).includes(pending.value)) pushRecentColor(pending.value);
   }, [onCommit]);

   // Commit a pending edit if the control unmounts (the menu closes) before the popover's dismiss fires.
   useCommitOnUnmount(commit);

   return (
      <ColorPickerPopover
         open={open}
         onOpenChange={(next) => { if (!next) commit(); setOpen(next); }}
         activeColor={activeColor}
         palette={CONNECTION_PALETTE}
         recent={readRecentColors()}
         recentLabel={t('BoardView.recentColors')}
         removeLabel={removeLabel}
         onApply={(color) => { pendingRef.current = { has: true, value: color }; onPreview(color); }}
         trigger={
            <button
               type="button"
               title={title}
               aria-label={title}
               className="h-5 w-5 shrink-0 cursor-pointer rounded border border-border"
               style={{ background: swatchFill }}
            />
         }
      />
   );
}
