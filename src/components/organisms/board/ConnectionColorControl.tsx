// -- React Imports --
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { ColorPickerPopover } from '@/components/molecules/color/ColorPickerPopover';

// -- Utils Imports --
import { CONNECTION_PALETTE } from '@/lib/board/boardConnections';
import { pushRecentColor, readRecentColors } from '@/lib/recentColors';

// -- Type Imports --
import type { ConnectionStyle } from '@/lib/types/board';

/**
 * The connection's color control in the toolbar: a swatch trigger opening the shared (portaled) color
 * popover. The full picker previews live on the line and commits a single `onUpdateStyle` on close; a
 * curated/recent swatch commits once. Custom colors join the shared recents; curated ones do not. A
 * line always keeps a color, so there is no remove (the popover hides it when no remove label is given).
 */
export function ConnectionColorControl({
   connectionId,
   style,
   effectiveColor,
   onPreview,
   onUpdateStyle,
}: {
   connectionId: string;
   style: ConnectionStyle;
   effectiveColor: string;
   onPreview: (color: string | null) => void;
   onUpdateStyle: (id: string, style: ConnectionStyle) => void;
}) {
   const { t } = useTranslation();
   const [open, setOpen] = useState(false);

   // The commit reads from refs so it is correct from any close path (swatch / outside / Escape
   // / unmount) and unaffected by stale closures.
   const pendingRef = useRef<string | null>(null);
   const styleRef = useRef(style);
   useEffect(() => { styleRef.current = style; });

   const commit = useCallback(() => {
      const next = pendingRef.current;
      if (next === null) return;
      const current = styleRef.current;
      if (next !== current.color) {
         onUpdateStyle(connectionId, { ...current, color: next });
         // Only colors from the full picker (not a curated vivid) join the shared recents.
         if (!(CONNECTION_PALETTE as readonly string[]).includes(next)) pushRecentColor(next);
      }
      pendingRef.current = null;
      onPreview(null);
   }, [connectionId, onUpdateStyle, onPreview]);

   // Commit any pending color if the control unmounts (the connection is deselected) before
   // the popover's own dismiss fires.
   const commitRef = useRef(commit);
   useEffect(() => { commitRef.current = commit; });
   useEffect(() => () => { commitRef.current(); }, []);

   return (
      <ColorPickerPopover
         open={open}
         onOpenChange={(next) => { if (!next) commit(); setOpen(next); }}
         activeColor={effectiveColor}
         palette={CONNECTION_PALETTE}
         recent={readRecentColors()}
         recentLabel={t('BoardView.recentColors')}
         onApply={(color) => {
            // A line always has a color; an (unused) remove resolves to the first palette entry.
            const resolved = color ?? CONNECTION_PALETTE[0];
            pendingRef.current = resolved;
            onPreview(resolved);
         }}
         trigger={
            <button
               type="button"
               title={t('BoardView.lineColor')}
               aria-label={t('BoardView.lineColor')}
               onPointerDown={(event) => event.stopPropagation()}
               className="h-6 w-6 cursor-pointer rounded border border-border"
               style={{ backgroundColor: effectiveColor }}
            />
         }
      />
   );
}
