// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { applyMentionToCharacter } from './useSheetMentionCreate';
import { createCharacterStore } from '@/lib/stores/characterStore';

// -- Type Imports --
import type { MentionSegment } from '@/lib/challenge/parseMentions';

/*
 * The on-sheet mention create-or-raise, exercised against a real character store (the same shape the
 * challenge card + sheet journal drive live). `applyStatusTier` has its own tests; here we cover the
 * create / raise-by-name / tag-dedup dispatch the shared hook performs.
 */

/** A fresh store with a brand-new Legends character (starts with no trackers). */
function makeStore() {
   const store = createCharacterStore();
   store.getState().actions.createCharacter('LEGENDS');
   return store;
}

const apply = (store: ReturnType<typeof makeStore>, segment: MentionSegment) =>
   applyMentionToCharacter(segment, store.getState().character!.trackers, store.getState().actions);

const statuses = (store: ReturnType<typeof makeStore>) => store.getState().character!.trackers.statuses;
const storyTags = (store: ReturnType<typeof makeStore>) => store.getState().character!.trackers.storyTags;

describe('applyMentionToCharacter - status', () => {
   it('creates a new status at the mentioned tier', () => {
      const store = makeStore();

      const outcome = apply(store, { type: 'status', name: 'Bleeding', tier: 2, raw: 'Bleeding-2' });

      expect(outcome).toEqual({ kind: 'status-created', name: 'Bleeding' });
      expect(statuses(store)).toHaveLength(1);
      expect(statuses(store)[0].name).toBe('Bleeding');
      // Tier 2 -> box index 1 ticked, nothing cumulative below it.
      expect(statuses(store)[0].tiers).toEqual([false, true, false, false, false, false]);
   });

   it('raises an existing status by name (bubble-up), never duplicating it', () => {
      const store = makeStore();
      apply(store, { type: 'status', name: 'Bleeding', tier: 2, raw: 'Bleeding-2' });

      // Same name (case/space-insensitive), same tier again -> box 2 already ticked, bubbles to box 3.
      const outcome = apply(store, { type: 'status', name: '  bleeding  ', tier: 2, raw: 'bleeding-2' });

      expect(outcome).toEqual({ kind: 'status-raised', name: '  bleeding  ' });
      expect(statuses(store)).toHaveLength(1); // no duplicate
      expect(statuses(store)[0].tiers).toEqual([false, true, true, false, false, false]);
   });
});

describe('applyMentionToCharacter - tag', () => {
   it('creates a new story tag', () => {
      const store = makeStore();

      const outcome = apply(store, { type: 'tag', name: 'On fire', raw: 'On fire' });

      expect(outcome).toEqual({ kind: 'tag-created', name: 'On fire' });
      expect(storyTags(store)).toHaveLength(1);
      expect(storyTags(store)[0].name).toBe('On fire');
   });

   it('de-dupes a tag by name (no second add)', () => {
      const store = makeStore();
      apply(store, { type: 'tag', name: 'On fire', raw: 'On fire' });

      const outcome = apply(store, { type: 'tag', name: '  ON FIRE ', raw: 'ON FIRE' });

      expect(outcome).toEqual({ kind: 'tag-exists', name: '  ON FIRE ' });
      expect(storyTags(store)).toHaveLength(1); // unchanged
   });
});
