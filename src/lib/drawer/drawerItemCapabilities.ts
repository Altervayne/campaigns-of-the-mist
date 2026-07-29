// -- Type Imports --
import type { GeneralItemType } from '@/lib/types/drawer';

/*
 * The special actions each drawer item type supports, on top of the actions every item has
 * (rename / move / export / delete). Surfaces that offer per-item actions ask this registry rather than
 * excluding the types they happen to know about, so a type declares what it supports and a type added
 * later starts with nothing until it is listed here.
 *
 * Framework-free and surface-agnostic: it answers what a type supports, never how a surface offers it.
 */

/** A special action a drawer item type can declare. */
export type DrawerItemCapability =
   /** Adds the item's content to the loaded character's sheet. */
   | 'ADD_TO_CHARACTER';

/**
 * The declared capabilities per type. Absent from this map means no special action at all - that
 * default is the point, not an oversight.
 *
 * `ADD_TO_CHARACTER` lists the cards and trackers the sheet's add path accepts. Types whose content the
 * sheet reaches only by drag (image cards, journals) are not listed, nor is the challenge card, which no
 * add path handles.
 */
const ITEM_CAPABILITIES: ReadonlyMap<GeneralItemType, readonly DrawerItemCapability[]> =
   new Map<GeneralItemType, readonly DrawerItemCapability[]>([
      ['CHARACTER_CARD', ['ADD_TO_CHARACTER']],
      ['CHARACTER_THEME', ['ADD_TO_CHARACTER']],
      ['GROUP_THEME', ['ADD_TO_CHARACTER']],
      ['LOADOUT_THEME', ['ADD_TO_CHARACTER']],
      ['STATUS_TRACKER', ['ADD_TO_CHARACTER']],
      ['STORY_TAG_TRACKER', ['ADD_TO_CHARACTER']],
      ['STORY_THEME_TRACKER', ['ADD_TO_CHARACTER']],
   ]);

const NO_CAPABILITIES: readonly DrawerItemCapability[] = [];

/** The capabilities a type declares; empty for an unlisted type and for an unresolved item. */
export function drawerItemCapabilities(type: GeneralItemType | undefined): readonly DrawerItemCapability[] {
   if (!type) return NO_CAPABILITIES;
   return ITEM_CAPABILITIES.get(type) ?? NO_CAPABILITIES;
}

/** Whether a type declares `capability`. */
export function hasDrawerItemCapability(type: GeneralItemType | undefined, capability: DrawerItemCapability): boolean {
   return drawerItemCapabilities(type).includes(capability);
}
