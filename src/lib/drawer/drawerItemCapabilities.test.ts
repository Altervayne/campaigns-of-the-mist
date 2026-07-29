// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Module Imports --
import { drawerItemCapabilities, hasDrawerItemCapability } from './drawerItemCapabilities';

// -- Type Imports --
import type { GeneralItemType } from '@/lib/types/drawer';

/*
 * The accessor contract only. Which surface offers which action, across every item type, is pinned where
 * it is user-visible (`MobileDrawerContextMenu.actions.test.tsx`).
 */

const ADD_TO_CHARACTER_TYPES: readonly GeneralItemType[] = [
   'CHARACTER_CARD',
   'CHARACTER_THEME',
   'GROUP_THEME',
   'LOADOUT_THEME',
   'STATUS_TRACKER',
   'STORY_TAG_TRACKER',
   'STORY_THEME_TRACKER',
];

describe('drawerItemCapabilities', () => {
   it('declares ADD_TO_CHARACTER for the cards and trackers the sheet accepts', () => {
      for (const type of ADD_TO_CHARACTER_TYPES) {
         expect(drawerItemCapabilities(type)).toEqual(['ADD_TO_CHARACTER']);
      }
   });

   it('declares nothing for a listed-nowhere type, an unknown type, or an unresolved one', () => {
      expect(drawerItemCapabilities('NOTE')).toEqual([]);
      expect(drawerItemCapabilities('FUTURE_ITEM_TYPE' as GeneralItemType)).toEqual([]);
      expect(drawerItemCapabilities(undefined)).toEqual([]);
   });

   it('answers no for a capability an inherited object property could otherwise supply', () => {
      expect(hasDrawerItemCapability('constructor' as GeneralItemType, 'ADD_TO_CHARACTER')).toBe(false);
      expect(hasDrawerItemCapability('toString' as GeneralItemType, 'ADD_TO_CHARACTER')).toBe(false);
   });
});
