// -- Other Library Imports --
import cuid from 'cuid';

// -- Icon Imports --
import { Dices, Frame, Image as ImageIcon, ListOrdered, MapPin, NotebookText, SquareArrowOutUpRight, StickyNote, Type } from 'lucide-react';

// -- Utils Imports --
import { defaultTextStyle } from '@/lib/board/textStyle';

// -- Type Imports --
import type { LucideIcon } from 'lucide-react';
import type { BoardItemContent } from '@/lib/types/board';

/*
 * The shared creatable-element registry: ONE descriptor per element kind, so the surfaces that
 * offer "add a thing" (the board toolbar + radial today; the sheet Add menu later) read the same
 * icon, label, footprint, and content factory instead of hand-kept parallel lists that drift.
 *
 * Promoted verbatim from the board's former module-local `RADIAL_CREATE` / `ITEM_SIZE` /
 * `emptyContent` consts. Only the board-native kinds live here for now; the sheet's heterogeneous
 * create paths (card dialog / portrait singleton / challenge editor / journal) attach later as a
 * per-surface handler, which is why the entry shape leaves room for one without baking it in.
 */

/** The board-native item kinds the creation surfaces can build. */
export type CreatableKind = 'post-it' | 'text' | 'journal' | 'image' | 'pin' | 'dice-tray' | 'roll-table' | 'zone' | 'portal';

/** A fresh pin's color (classic corkboard red). */
const DEFAULT_PIN_COLOR = '#ef4444';

/**
 * One creatable element's descriptor: its icon + label (for menu consistency across surfaces), its
 * default footprint in world units, and a factory for a fresh, empty content payload. `makeContent`
 * mints fresh ids on every call, so each created item is independent.
 */
export interface CreatableEntry {
   kind: CreatableKind;
   icon: LucideIcon;
   labelKey: string;
   defaultSize: { width: number; height: number };
   makeContent: () => BoardItemContent;
   /**
    * The element picks its target BEFORE it drops (a portal), so it can't be an immediate one-click create:
    * the surfaces skip it in their generic create lists and offer a dedicated picker leaf instead.
    */
   requiresPicker?: boolean;
}

/**
 * The creatable elements in ring order (the order the board radial + toolbar present them). One
 * entry per {@link CreatableKind}; consumers map over this or index {@link CREATABLE_BY_KIND}.
 */
export const CREATABLE_REGISTRY: CreatableEntry[] = [
   {
      kind: 'post-it',
      icon: StickyNote,
      labelKey: 'addPostIt',
      defaultSize: { width: 180, height: 180 },
      // Board-born copy: source-less (Save-As only), a fresh standalone note in `data`.
      makeContent: () => ({ kind: 'post-it', mode: 'copy', data: { id: cuid(), text: '' } }),
   },
   {
      kind: 'text',
      icon: Type,
      labelKey: 'addText',
      // A transient footprint: the box auto-hugs its text from the first measure, so this only sizes the
      // empty-placeholder drop before the observer takes over.
      defaultSize: { width: 120, height: 40 },
      // Bare board furniture: an empty string plus the default style; it drops selected and edits at once.
      makeContent: () => ({ kind: 'text', text: '', style: defaultTextStyle() }),
   },
   {
      kind: 'journal',
      icon: NotebookText,
      labelKey: 'addJournal',
      defaultSize: { width: 260, height: 320 },
      // Board-born copy: source-less (Save-As only), a fresh standalone journal in `data`.
      makeContent: () => ({ kind: 'journal', mode: 'copy', data: { id: cuid(), title: '', pages: [{ id: cuid(), text: '' }], bookmarks: [] } }),
   },
   {
      kind: 'image',
      icon: ImageIcon,
      labelKey: 'addImage',
      defaultSize: { width: 240, height: 180 },
      makeContent: () => ({ kind: 'image', assetId: null, fit: 'cover' }),
   },
   {
      kind: 'pin',
      icon: MapPin,
      labelKey: 'addPin',
      defaultSize: { width: 28, height: 28 },
      makeContent: () => ({ kind: 'pin', color: DEFAULT_PIN_COLOR }),
   },
   {
      kind: 'dice-tray',
      icon: Dices,
      labelKey: 'addDiceTray',
      defaultSize: { width: 220, height: 260 },
      makeContent: () => ({ kind: 'dice-tray', title: '', dice: [{ id: cuid(), sides: 6 }, { id: cuid(), sides: 6 }], modifiers: [] }),
   },
   {
      kind: 'roll-table',
      icon: ListOrdered,
      labelKey: 'addRollTable',
      defaultSize: { width: 240, height: 260 },
      makeContent: () => ({ kind: 'roll-table', title: '', entries: [{ id: cuid(), weight: 1, text: '' }, { id: cuid(), weight: 1, text: '' }] }),
   },
   {
      kind: 'zone',
      icon: Frame,
      labelKey: 'addZone',
      defaultSize: { width: 360, height: 280 },
      makeContent: () => ({ kind: 'zone', collapsed: false }),
   },
   {
      kind: 'portal',
      icon: SquareArrowOutUpRight,
      labelKey: 'addPortal',
      // The icon+text default footprint (the create flow's smart default); other styles resize freely.
      defaultSize: { width: 168, height: 48 },
      requiresPicker: true,
      // A portal always carries a target chosen in the picker (`makePortalContent`); this factory is only the
      // type-total fallback and is never the real create path (the picker supplies the target + smart style).
      makeContent: () => ({ kind: 'portal', target: { kind: 'external', href: '' }, style: { visual: null, label: '', align: 'right', background: true } }),
   },
];

/** The registry indexed by kind, for O(1) footprint / content lookups. */
export const CREATABLE_BY_KIND: Record<CreatableKind, CreatableEntry> = Object.fromEntries(
   CREATABLE_REGISTRY.map((entry) => [entry.kind, entry]),
) as Record<CreatableKind, CreatableEntry>;
