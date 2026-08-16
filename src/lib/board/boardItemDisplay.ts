// -- Icon Imports --
import { IdCard, PenTool } from 'lucide-react';

// -- Utils Imports --
import { CREATABLE_BY_KIND, type CreatableKind } from '@/lib/creation/creatableRegistry';
import { getItemTypeIconComponent } from '@/lib/utils/drawer-icons';

// -- Type Imports --
import type { LucideIcon } from 'lucide-react';
import type { TFunction } from 'i18next';
import type { BoardItem } from '@/lib/types/board';
import type { GeneralItemType } from '@/lib/types/drawer';

/*
 * Shared display resolution for a board item in list contexts (the layers panel today): its per-kind
 * glyph and its fallback name. Both draw from the SAME icon/label sources the creation surfaces use
 * (the creatable registry + the drawer type icons), so a row can never drift from the radial/toolbar.
 */

/** Reads a tracker's `trackerType` from an embedded copy/reference, mapped to its drawer item type. */
function trackerItemType(data: unknown): GeneralItemType {
   const type = (data as { trackerType?: string } | undefined)?.trackerType;
   if (type === 'STORY_TAG') return 'STORY_TAG_TRACKER';
   if (type === 'STORY_THEME') return 'STORY_THEME_TRACKER';
   return 'STATUS_TRACKER';
}

/** Reads a card's `cardType` from an embedded copy/reference (a drawer item type), else the character card. */
function cardItemType(data: unknown): GeneralItemType {
   return ((data as { cardType?: GeneralItemType } | undefined)?.cardType) ?? 'CHARACTER_CARD';
}

/**
 * The lucide glyph for a board item's kind, resolved from the app's existing icon sources: the creatable
 * registry for board-native kinds, the drawer type icons for embedded trackers/cards/notes/characters, and
 * the pen glyph for drawings. One source of truth - never a bespoke icon set.
 */
export function boardItemKindIcon(item: BoardItem): LucideIcon {
   const content = item.content;
   switch (content.kind) {
      case 'drawing':
         return PenTool;
      case 'note':
         return getItemTypeIconComponent('NOTE');
      case 'character':
         return IdCard;
      case 'threat':
         return getItemTypeIconComponent('CHALLENGE_CARD');
      case 'tracker':
         return getItemTypeIconComponent(trackerItemType(content.mode === 'reference' ? content.lastKnown : content.data));
      case 'card':
         return getItemTypeIconComponent(cardItemType(content.mode === 'reference' ? content.lastKnown : content.data));
      default: {
         const creatable = CREATABLE_BY_KIND[content.kind as CreatableKind];
         return creatable ? creatable.icon : getItemTypeIconComponent('FULL_BOARD');
      }
   }
}

/**
 * The display name for a board item: its explicit `label` when set, else a kind-derived fallback - a drawing's
 * language-adaptive "Layer N" (from its stored ordinal), the untitled note/text nouns, or the kind's own noun
 * (reusing the creation surfaces' labels for board-native kinds). Never content-derived, so an unlabelled item
 * stays legibly generic.
 */
export function boardItemDisplayName(item: BoardItem, t: TFunction): string {
   const label = item.label?.trim();
   if (label) return label;
   const content = item.content;
   switch (content.kind) {
      case 'drawing':
         // Number.isFinite (not `typeof === 'number'`) so a NaN seq from an old build reads as the plain
         // kind noun, never "Layer NaN".
         return Number.isFinite(content.seq) ? t('LayersPanel.layerName', { n: content.seq }) : t('LayersPanel.kinds.drawing');
      case 'zone':
         // A zone's name lives on its content (the canvas header edits it there), so the group node reads it too.
         return content.label?.trim() || t('BoardView.addZone');
      case 'note':
         return t('Common.untitledNote');
      case 'text':
         return t('LayersPanel.untitledText');
      case 'card':
         return t('LayersPanel.kinds.card');
      case 'tracker':
         return t('LayersPanel.kinds.tracker');
      case 'character':
         return t('LayersPanel.kinds.character');
      case 'threat':
         return t('LayersPanel.kinds.threat');
      default: {
         const creatable = CREATABLE_BY_KIND[content.kind as CreatableKind];
         return creatable ? t(`BoardView.${creatable.labelKey}`) : content.kind;
      }
   }
}

/**
 * The muted second line of a board item's row: its world position, plus a per-kind detail where one reads
 * cheaply - a zone's member count, a drawing's stroke count. `memberCount` is supplied by the caller (which
 * holds the full item map to count a zone's members); it's ignored for every other kind.
 */
export function boardItemMetadata(item: BoardItem, t: TFunction, memberCount?: number): string {
   const position = `${Math.round(item.x)}, ${Math.round(item.y)}`;
   const detail = boardItemDetail(item, t, memberCount);
   return detail ? `${position} · ${detail}` : position;
}

/** The kind-specific half of the metadata line, or `undefined` when a kind carries nothing beyond position. */
function boardItemDetail(item: BoardItem, t: TFunction, memberCount?: number): string | undefined {
   const content = item.content;
   if (content.kind === 'zone') return t('Common.itemCount', { count: memberCount ?? 0 });
   if (content.kind === 'drawing') return t('LayersPanel.strokeCount', { count: content.strokes.length });
   return undefined;
}
