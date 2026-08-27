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

/** The identity accent classes for one drawer item type: a solid badge, and a card spine. */
export interface ItemIdentityAccent {
   /** Solid identity badge: a FIXED-color tile with a white glyph (theme-independent, like the tab badges),
    *  so the color reads the same on any game/custom/light/dark card surface. */
   badge: string;
   /** Card spine: a solid rule in the identity color (neutral = the border token). */
   bar: string;
}

/*
 * Every identity's classes spelled out as literal strings so Tailwind's JIT emits them - never assemble a
 * class name by interpolation. The colors are the sanctioned feature-identity accents from `gameVisuals`
 * (game brands + board/note/pdf), reused here so a card/list badge reads the same as its tab badge. The
 * badge is a SOLID fixed color with a white glyph - a stable backdrop that never rides the app theme. Chrome
 * (the card + folder shell) stays theme tokens; identity color lives only on the badge + spine.
 */
const IDENTITY_ACCENTS = {
   amber: { badge: 'bg-amber-500 text-white', bar: 'bg-amber-500' },
   purple: { badge: 'bg-purple-500 text-white', bar: 'bg-purple-500' },
   cyan: { badge: 'bg-cyan-500 text-white', bar: 'bg-cyan-500' },
   emerald: { badge: 'bg-emerald-500 text-white', bar: 'bg-emerald-500' },
   slate: { badge: 'bg-slate-500 text-white', bar: 'bg-slate-500' },
   red: { badge: 'bg-red-500 text-white', bar: 'bg-red-500' },
   neutral: { badge: 'bg-muted-foreground text-background', bar: 'bg-border' },
} as const satisfies Record<string, ItemIdentityAccent>;

/** Per-game identity key: game-bound types borrow their game's brand accent. */
const GAME_ACCENT_KEY: Record<GameSystem, keyof typeof IDENTITY_ACCENTS> = {
   LEGENDS: 'amber',
   CITY_OF_MIST: 'purple',
   OTHERSCAPE: 'cyan',
   NEUTRAL: 'neutral',
};

/**
 * Resolves a drawer item's identity accent (glyph/tile/spine). Type wins first - board/note/pdf carry
 * their own fixed accent regardless of game; every other game-bound type (character sheet, character/theme/
 * challenge cards) picks up its game's brand; game-agnostic content (journal, roll table, post-it, image
 * card, trackers) reads neutral.
 */
export function getItemIdentityAccent(type: GeneralItemType, game: GameSystem): ItemIdentityAccent {
   switch (type) {
      case 'FULL_BOARD':
         return IDENTITY_ACCENTS.emerald;
      case 'NOTE':
         return IDENTITY_ACCENTS.slate;
      case 'PDF':
         return IDENTITY_ACCENTS.red;
      default:
         return IDENTITY_ACCENTS[GAME_ACCENT_KEY[game]];
   }
}
