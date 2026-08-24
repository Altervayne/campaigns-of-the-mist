// -- React Imports --
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Utils Imports --
import { strokeColorToCss } from '@/lib/board/drawingStyle';
import { CONNECTION_PALETTE } from '@/lib/board/boardConnections';
import { pushRecentColor, readRecentColors } from '@/lib/recentColors';

// -- Component Imports --
import { ColorPickerPopover } from '@/components/molecules/color/ColorPickerPopover';

/** A muted diagonal hatch marking an indeterminate (mixed) swatch - the selection's strokes differ in color. */
const MIXED_SWATCH_STYLE = { backgroundColor: 'var(--muted)', backgroundImage: 'repeating-linear-gradient(45deg, var(--muted-foreground) 0 1.5px, transparent 1.5px 4px)' } as const;

interface InkColorControlProps {
   /** The current ink: a hex, or null for the adaptive default (the theme foreground). */
   color: string | null;
   /** The selection's strokes differ in color: shows a hatched swatch until a pick resolves them. */
   mixed?: boolean;
   /** Enable the picker's opacity channel, so it emits `#RRGGBBAA` (per-stroke ink alpha). */
   alpha?: boolean;
   /** Trigger tooltip / aria label. */
   title: string;
   /** The reset-to-adaptive action's label; omit to hide it. */
   removeLabel?: string;
   /** Commits the chosen ink once, on picker close (the reads come off refs, so any close path is correct). */
   onApply: (color: string | null) => void;
   /** Live pick during the drag (no commit): a host previews the selection's ink before the close writes it. */
   onPreview?: (color: string | null) => void;
}

/**
 * The ink swatch + shared color popover, driving either a tool's default ink or a stroke selection's color.
 * Mirrors the connection color control (shared palette + recents, commit-on-close read from refs so any close
 * path is correct), plus a null/adaptive reset via the popover's remove action - the swatch then paints the
 * theme foreground. A custom hex joins the shared recents; a curated swatch does not. With `onPreview` the
 * pick previews live and commits once on close; with `alpha` the picker yields an 8-digit hex.
 */
export function InkColorControl({ color, mixed, alpha, title, removeLabel, onApply, onPreview }: InkColorControlProps) {
   const { t } = useTranslation();
   const [open, setOpen] = useState(false);
   // A local preview so the swatch reflects the pick before it commits on close (`undefined` = untouched).
   const [preview, setPreview] = useState<string | null | undefined>(undefined);

   // Read the commit from refs so it is correct from any close path (swatch / outside / Escape / unmount)
   // and unaffected by stale closures. `hasPending` distinguishes "no pick" from a null (adaptive) pick.
   const pendingRef = useRef<string | null>(null);
   const hasPendingRef = useRef(false);
   const colorRef = useRef(color);
   useEffect(() => { colorRef.current = color; });

   const commit = useCallback(() => {
      if (!hasPendingRef.current) return;
      const next = pendingRef.current;
      // Commit whenever a pick happened (even if unchanged), so the close clears any live preview a host set.
      onApply(next);
      // Only a custom hex (not a curated swatch), and only when it changed, joins the shared recents.
      if (next && next !== colorRef.current && !(CONNECTION_PALETTE as readonly string[]).includes(next)) pushRecentColor(next);
      hasPendingRef.current = false;
      pendingRef.current = null;
      setPreview(undefined);
   }, [onApply]);

   // Commit any pending pick if the control unmounts (the tool / selection changes) before the dismiss fires.
   const commitRef = useRef(commit);
   useEffect(() => { commitRef.current = commit; });
   useEffect(() => () => { commitRef.current(); }, []);

   const showMixed = mixed && preview === undefined;
   const shown = preview !== undefined ? preview : mixed ? null : color;
   return (
      <ColorPickerPopover
         open={open}
         onOpenChange={(next) => { if (!next) commit(); setOpen(next); }}
         activeColor={showMixed ? undefined : shown ?? undefined}
         palette={CONNECTION_PALETTE}
         recent={readRecentColors()}
         recentLabel={t('BoardView.recentColors')}
         removeLabel={removeLabel}
         alpha={alpha}
         onApply={(picked) => {
            pendingRef.current = picked ?? null;
            hasPendingRef.current = true;
            setPreview(picked ?? null);
            onPreview?.(picked ?? null);
         }}
         trigger={
            <button
               type="button"
               title={title}
               aria-label={title}
               onPointerDown={(event) => event.stopPropagation()}
               className="size-6 cursor-pointer rounded border border-border"
               style={showMixed ? MIXED_SWATCH_STYLE : { backgroundColor: strokeColorToCss(shown) }}
            />
         }
      />
   );
}
