// -- React Imports --
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { AArrowDown, AArrowUp, ChevronDown, ChevronRight } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { pushRecentColor, readRecentColors } from '@/lib/recentColors';
import { clampZoneTitleScale, MIN_ZONE_TITLE_SCALE, ZONE_TITLE_SCALE_STEP, zoneTitleBarHeight, zoneTitleFontSize, zoneTitleScale } from '@/lib/board/zoneHeader';

// -- Component Imports --
import { ColorPickerPopover } from '@/components/molecules/color/ColorPickerPopover';

// -- Hook Imports --
import { useCommitOnUnmount } from '@/hooks/useCommitOnUnmount';

// -- Type Imports --
import type { BoardItemContent, ZoneBoardContent } from '@/lib/types/board';

/*
 * A zone's header: a collapse chevron + an editable label. Expanded, it's a tab just ABOVE the
 * frame's top-left corner (the Figma frame-label spot); collapsed, the zone shrinks to a bar at
 * its origin and this header fills it (chevron + label + member-count badge). The chevron is always
 * visible (collapse is a frequent move, not a selection action); the color control rides the
 * selection toolbar's per-kind slot (like the post-it's). Collapse/label/color each commit one
 * undoable `updateItemContent`; collapse is render-only on geometry (bounds are preserved).
 */

/** Tint quick-picks for a zone (rendered at low opacity behind the items). */
const ZONE_PALETTE = ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', '#10b981', '#14b8a6', '#3b82f6', '#64748b'] as const;

interface ZoneItemProps {
   content: ZoneBoardContent;
   isSelected: boolean;
   /** The selection toolbar's action slot; the color control portals here (like the post-it's). */
   toolbarSlot: HTMLElement | null;
   /** How many items belong to this zone, shown as a badge on the collapsed bar. */
   memberCount?: number;
   onContentChange: (content: BoardItemContent) => void;
   onRequestSelect: () => void;
   /** The deferred body press: dragging the title bar moves the zone (like a window's title bar); a click selects it. */
   onPressStart: (event: ReactPointerEvent) => void;
}

export function ZoneItem({ content, isSelected, toolbarSlot, memberCount, onContentChange, onRequestSelect, onPressStart }: ZoneItemProps) {
   const { t } = useTranslation();
   const collapsed = content.collapsed;

   const [label, setLabel] = useState(content.label ?? '');
   // Re-sync from the store on an external change (undo/redo) via adjust-state-during-render;
   // typing leaves the stored label untouched (commit is on blur) so this never clobbers it.
   const [synced, setSynced] = useState(content.label ?? '');
   if ((content.label ?? '') !== synced) {
      setSynced(content.label ?? '');
      setLabel(content.label ?? '');
   }

   const commitLabel = () => {
      const trimmed = label.trim();
      if (trimmed !== (content.label ?? '')) onContentChange({ ...content, label: trimmed || undefined });
   };

   // The in-progress color while the picker is open, committed once on close (so dragging the
   // hue doesn't flood undo). The swatch previews `pending`; the tint commits on close.
   const [pending, setPending] = useState<{ color: string | undefined } | null>(null);
   const swatchColor = pending ? pending.color : content.color;

   const pendingRef = useRef<{ color: string | undefined } | null>(null);
   const contentRef = useRef(content);
   useEffect(() => { contentRef.current = content; });

   const commitPendingColor = useCallback(() => {
      const change = pendingRef.current;
      if (!change) return;
      const next = change.color;
      const current = contentRef.current;
      if (next !== current.color) {
         onContentChange({ ...current, color: next });
         // Only colors picked from the full picker (not a curated tint) join shared recents.
         if (next && !ZONE_PALETTE.includes(next as (typeof ZONE_PALETTE)[number])) pushRecentColor(next);
      }
      pendingRef.current = null;
      setPending(null);
   }, [onContentChange]);

   // Deselecting (e.g. a canvas click that also dismisses the popover) unmounts this control;
   // commit any pending color here so the pick survives that race.
   useEffect(() => {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- commit (and clear) a pending color after the deselect render
      if (!isSelected) commitPendingColor();
   }, [isSelected, commitPendingColor]);

   // A tab switch unmounts the board without a blur / deselect; flush the label (and any pending color).
   useCommitOnUnmount(commitLabel);
   useCommitOnUnmount(commitPendingColor);

   const toggleCollapse = () => onContentChange({ ...content, collapsed: !collapsed });

   // Steps the header size one notch, committing a single undoable change. Back at the default scale the
   // field is dropped (`undefined`) so a default-size zone carries no `titleScale`.
   const stepTitleScale = (direction: 1 | -1) => {
      const current = zoneTitleScale(content);
      const next = clampZoneTitleScale(current + direction * ZONE_TITLE_SCALE_STEP);
      if (next === current) return;
      onContentChange({ ...content, titleScale: next <= MIN_ZONE_TITLE_SCALE ? undefined : next });
   };

   const chevron = (
      <button
         type="button"
         title={collapsed ? t('BoardView.zoneExpand') : t('BoardView.zoneCollapse')}
         aria-label={collapsed ? t('BoardView.zoneExpand') : t('BoardView.zoneCollapse')}
         onPointerDown={(event) => event.stopPropagation()}
         onClick={toggleCollapse}
         className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-foreground/70 hover:bg-muted hover:text-foreground cursor-pointer"
      >
         {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
   );

   const labelInput = (
      <input
         type="text"
         value={label}
         onChange={(event) => setLabel(event.target.value)}
         onFocus={onRequestSelect}
         onBlur={commitLabel}
         onPointerDown={(event: ReactPointerEvent) => event.stopPropagation()}
         placeholder={t('BoardView.zoneLabelPlaceholder')}
         style={{ fontSize: zoneTitleFontSize(content) }}
         className="w-28 min-w-0 flex-1 truncate bg-transparent font-semibold text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground/60"
      />
   );

   return (
      <>
         {collapsed ? (
            // The collapsed bar IS the zone's footprint - it fills the (bar-sized) body, which the
            // box styles + makes clickable; only the chevron/label stop the pointer.
            <div className="flex h-full w-full items-center gap-1 px-2">
               {chevron}
               {labelInput}
               {memberCount != null && memberCount > 0 && (
                  <span
                     title={t('BoardView.zoneMembers')}
                     className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[0.6rem] font-medium tabular-nums text-muted-foreground"
                  >
                     {memberCount}
                  </span>
               )}
            </div>
         ) : (
            // A full-width title bar just ABOVE the frame (the proven spot that doesn't steal the
            // interior items' toolbars). Tinted by the zone color (echoing the frame fill) so it
            // reads as a bar; the label fills the rest and ellipsizes when it overflows.
            <div
               onPointerDown={onPressStart}
               style={{ height: zoneTitleBarHeight(content), ...(swatchColor ? { backgroundColor: `${swatchColor}1f`, borderColor: swatchColor } : {}) }}
               className={cn(
                  'pointer-events-auto absolute inset-x-0 bottom-full mb-0.5 flex items-center gap-0.5 rounded-md border px-1.5',
                  !swatchColor && 'border-border bg-card/80',
               )}
            >
               {chevron}
               {labelInput}
            </div>
         )}

         {/* Color and header-size live in the selection toolbar's slot, like the post-it's - not in the header. */}
         {isSelected && toolbarSlot && createPortal(
            <div className="flex items-center gap-0.5">
               <ZoneColorControl
                  activeColor={swatchColor}
                  onPreview={(color) => { pendingRef.current = { color }; setPending({ color }); }}
                  onCommit={commitPendingColor}
               />
               <ZoneTitleSizeControl onStep={stepTitleScale} />
            </div>,
            toolbarSlot,
         )}
      </>
   );
}

/**
 * The zone color control: a swatch button opening the shared (portaled) color popover. Picking
 * previews on the swatch; any close (Escape, outside click, a discrete swatch/remove) commits
 * the single undoable change via `onOpenChange(false)`.
 */
function ZoneColorControl({ activeColor, onPreview, onCommit }: { activeColor: string | undefined; onPreview: (color: string | undefined) => void; onCommit: () => void }) {
   const { t } = useTranslation();
   const [open, setOpen] = useState(false);

   return (
      <ColorPickerPopover
         open={open}
         onOpenChange={(next) => { if (!next) onCommit(); setOpen(next); }}
         activeColor={activeColor}
         palette={ZONE_PALETTE}
         recent={readRecentColors()}
         recentLabel={t('BoardView.recentColors')}
         removeLabel={t('BoardView.removeColor')}
         onApply={onPreview}
         trigger={
            <button
               type="button"
               title={t('BoardView.zoneColor')}
               aria-label={t('BoardView.zoneColor')}
               onPointerDown={(event) => event.stopPropagation()}
               className="flex h-6 w-6 items-center justify-center rounded border border-border"
               style={{ backgroundColor: activeColor ?? 'transparent' }}
            />
         }
      />
   );
}

/**
 * The zone header-size control: an A- / A+ stepper (like the text element's font-size stepper) that grows or
 * shrinks the whole header - the label text and the bar height scale together. Each press commits one
 * undoable change; the buttons stop the pointer so they never bubble into the zone's move/select handlers.
 */
function ZoneTitleSizeControl({ onStep }: { onStep: (direction: 1 | -1) => void }) {
   const { t } = useTranslation();

   return (
      <div className="flex items-center gap-0.5">
         <ZoneSizeButton title={t('BoardView.zoneTitleSizeDecrease')} onClick={() => onStep(-1)}>
            <AArrowDown className="h-4 w-4" />
         </ZoneSizeButton>
         <ZoneSizeButton title={t('BoardView.zoneTitleSizeIncrease')} onClick={() => onStep(1)}>
            <AArrowUp className="h-4 w-4" />
         </ZoneSizeButton>
      </div>
   );
}

/** A compact action button in the zone toolbar; the pointer-down guard keeps a press off the zone's body handlers. */
function ZoneSizeButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
   return (
      <button
         type="button"
         title={title}
         aria-label={title}
         onPointerDown={(event) => event.stopPropagation()}
         onClick={onClick}
         className="flex h-6 min-w-6 items-center justify-center rounded px-1 text-foreground hover:bg-muted cursor-pointer"
      >
         {children}
      </button>
   );
}
