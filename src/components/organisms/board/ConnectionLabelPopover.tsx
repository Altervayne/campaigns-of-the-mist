// -- React Imports --
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { Tag } from 'lucide-react';

// -- Component Imports --
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { ColorPickerPopover } from '@/components/molecules/color/ColorPickerPopover';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { CONNECTION_PALETTE } from '@/lib/board/boardConnections';
import { pushRecentColor, readRecentColors } from '@/lib/recentColors';
import { CONNECTION_TRIGGER_CLASS } from './connectionToolbarButton';

// -- Type Imports --
import type { ConnectionLabelSize, ConnectionStyle } from '@/lib/types/board';

/*
 * The Label group in the connection toolbar: a trigger (filled tag when a label is set) opening a text
 * field, a size picker, and the shared color picker. The text commits ONE undoable command when the
 * popover closes (outside click / Escape / Enter) or the connection is deselected, not per keystroke; a
 * size / color pick commits immediately, flushing any pending text with it so the two never race. The
 * color picker previews live on the chip and commits on its own close. An empty field clears the label
 * (and its size/color). Modal so the nested color picker can take focus without dismissing this popover.
 */

const SIZE_OPTIONS: ConnectionLabelSize[] = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];
/** Glyph font size (px) for the size buttons - a legible spread, not the (larger) applied world sizes. */
const SIZE_GLYPH_PX: Record<ConnectionLabelSize, number> = { xs: 10, sm: 12, md: 14, lg: 16, xl: 18, '2xl': 20 };

/** The fields a size/color pick patches onto the label. An `undefined` value clears the field (default). */
type LabelPatch = Partial<Pick<ConnectionStyle, 'labelSize' | 'labelColor'>>;

export function ConnectionLabelPopover({ style, onChange, onColorPreview }: {
   style: ConnectionStyle;
   onChange: (style: ConnectionStyle) => void;
   onColorPreview: (color: string | null) => void;
}) {
   const { t } = useTranslation();
   const [open, setOpen] = useState(false);
   const [value, setValue] = useState('');
   const [colorOpen, setColorOpen] = useState(false);

   // The commit reads from refs so it is correct from any close path and unaffected by stale closures.
   // `null` = nothing was typed (the popover never opened), so a text flush is a no-op; without this an
   // unmount right after mount (StrictMode, a remount) would commit an empty string and wipe the label.
   const pendingRef = useRef<string | null>(null);
   const styleRef = useRef(style);
   useEffect(() => { styleRef.current = style; });

   // Commits the label: flushes any pending text edit and applies `patch` (size/color) in one command.
   // With no text (empty), the whole label plus its size/color drop. A no-op change dispatches nothing.
   const applyLabel = useCallback((patch: LabelPatch = {}) => {
      const hasTextEdit = pendingRef.current !== null;
      const patchKeys = Object.keys(patch) as (keyof LabelPatch)[];
      if (!hasTextEdit && patchKeys.length === 0) return;
      const current = styleRef.current;
      const text = hasTextEdit ? pendingRef.current!.trim() : (current.label ?? '');
      pendingRef.current = null;
      const next: ConnectionStyle = { ...current, ...patch };
      for (const key of patchKeys) if (patch[key] === undefined) delete next[key];
      if (text) next.label = text;
      else { delete next.label; delete next.labelSize; delete next.labelColor; }
      if (next.label === current.label && next.labelSize === current.labelSize && next.labelColor === current.labelColor) return;
      onChange(next);
   }, [onChange]);

   // Flush a pending text edit if the control unmounts (the connection is deselected) while open.
   const applyRef = useRef(applyLabel);
   useEffect(() => { applyRef.current = applyLabel; });
   useEffect(() => () => { applyRef.current(); }, []);

   const openWith = (next: boolean) => {
      if (next) {
         const seed = styleRef.current.label ?? '';
         setValue(seed);
         pendingRef.current = seed;
      } else {
         applyLabel();
      }
      setOpen(next);
   };

   // The color picker: a pick previews live on the chip, a single command commits on the picker's close
   // (flushing pending text with it). `null` = untouched, `'default'` = the remove/foreground pick.
   const pendingColorRef = useRef<string | 'default' | null>(null);
   const commitColor = () => {
      const picked = pendingColorRef.current;
      pendingColorRef.current = null;
      onColorPreview(null);
      if (picked === null) return;
      applyLabel({ labelColor: picked === 'default' ? undefined : picked });
      if (picked !== 'default' && !(CONNECTION_PALETTE as readonly string[]).includes(picked)) pushRecentColor(picked);
   };

   return (
      <Popover open={open} modal onOpenChange={openWith}>
         <PopoverTrigger asChild>
            <button
               type="button"
               title={t('BoardView.connectionLabel')}
               aria-label={t('BoardView.connectionLabel')}
               onPointerDown={(event) => event.stopPropagation()}
               className={cn(CONNECTION_TRIGGER_CLASS, style.label && 'ring-1 ring-primary')}
            >
               <Tag className={cn('h-4 w-4', style.label && 'fill-current')} />
            </button>
         </PopoverTrigger>
         <PopoverContent align="center" className="w-64 p-2" onPointerDown={(event) => event.stopPropagation()}>
            <div className="flex flex-col gap-2">
               <Input
                  autoFocus
                  value={value}
                  placeholder={t('BoardView.connectionLabelPlaceholder')}
                  onChange={(event) => { setValue(event.target.value); pendingRef.current = event.target.value; }}
                  onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); openWith(false); } }}
                  className="h-8"
               />

               {/* One row: the size presets, then the color swatch pushed to the far right. */}
               <div className="flex items-center gap-1">
                  {SIZE_OPTIONS.map((size) => (
                     <button
                        key={size}
                        type="button"
                        title={size}
                        aria-label={size}
                        onClick={() => applyLabel({ labelSize: size })}
                        className={cn(
                           'flex h-7 w-7 cursor-pointer items-center justify-center rounded text-foreground hover:bg-muted',
                           (style.labelSize ?? 'md') === size && 'bg-muted ring-1 ring-primary',
                        )}
                     >
                        <span className="font-semibold leading-none" style={{ fontSize: SIZE_GLYPH_PX[size] }}>A</span>
                     </button>
                  ))}
                  <div className="flex-1" />
                  <ColorPickerPopover
                     open={colorOpen}
                     onOpenChange={(next) => { if (!next) commitColor(); setColorOpen(next); }}
                     activeColor={style.labelColor}
                     palette={CONNECTION_PALETTE}
                     recent={readRecentColors()}
                     recentLabel={t('BoardView.recentColors')}
                     removeLabel={t('BoardView.connectionLabelColorDefault')}
                     onApply={(color) => {
                        pendingColorRef.current = color ?? 'default';
                        onColorPreview(color ?? null);
                     }}
                     trigger={
                        <button
                           type="button"
                           title={t('BoardView.connectionLabelColor')}
                           aria-label={t('BoardView.connectionLabelColor')}
                           className={cn('h-7 w-7 cursor-pointer rounded border border-border', !style.labelColor && 'bg-foreground')}
                           style={style.labelColor ? { backgroundColor: style.labelColor } : undefined}
                        />
                     }
                  />
               </div>
            </div>
         </PopoverContent>
      </Popover>
   );
}
