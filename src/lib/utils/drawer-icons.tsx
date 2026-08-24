import { FileUser, IdCard, FileText, FileType, FileHeart, CreditCard, RectangleEllipsis, WalletCards, Image, LayoutGrid, Skull, StickyNote, NotebookText, NotebookPen, ListOrdered } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { GameSystem, GeneralItemType } from '@/lib/types/drawer';

/**
 * Returns the lucide icon *component* for a drawer item type, so callers can size
 * and style it themselves (e.g. the small drag-identity pill). {@link getItemTypeIcon}
 * is the pre-styled element wrapper around this.
 */
export function getItemTypeIconComponent(type: GeneralItemType): LucideIcon {
   switch (type) {
      case 'CHARACTER_CARD':
         return FileUser;
      case 'FULL_CHARACTER_SHEET':
         return IdCard;
      case 'CHARACTER_THEME':
         return FileText;
      case 'GROUP_THEME':
         return FileHeart;
      case 'STATUS_TRACKER':
         return CreditCard;
      case 'STORY_TAG_TRACKER':
         return RectangleEllipsis;
      case 'STORY_THEME_TRACKER':
         return WalletCards;
      case 'IMAGE_CARD':
         return Image;
      case 'CHALLENGE_CARD':
         return Skull;
      case 'POST_IT':
         return StickyNote;
      case 'JOURNAL':
         return NotebookText;
      case 'NOTE':
         return NotebookPen;
      case 'ROLL_TABLE':
         return ListOrdered;
      case 'PDF':
         return FileType;
      case 'FULL_BOARD':
         return LayoutGrid;
      default:
         return FileText;
   }
}

/**
 * Returns the `Drawer.Types` i18n key for an item's type label. Game-specific cards
 * are keyed `${game}_${type}` (a Legends "Hero Card" vs an Otherscape "Merc Card"), but
 * game-agnostic NEUTRAL types (IMAGE_CARD, FULL_BOARD, POST_IT, JOURNAL, NOTE, ROLL_TABLE, PDF) have ONE
 * label key, not one per game.
 */
export function getItemTypeLabelKey(game: GameSystem, type: GeneralItemType): string {
   return type === 'IMAGE_CARD' || type === 'FULL_BOARD' || type === 'POST_IT' || type === 'JOURNAL' || type === 'NOTE' || type === 'ROLL_TABLE' || type === 'PDF'
      ? type
      : `${game}_${type}`;
}

/**
 * Returns the appropriate icon element for a given drawer item type.
 * Used wherever item type icons are rendered in the drawer UI.
 */
export function getItemTypeIcon(type: GeneralItemType): React.ReactElement {
   const Icon = getItemTypeIconComponent(type);
   return <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />;
}
