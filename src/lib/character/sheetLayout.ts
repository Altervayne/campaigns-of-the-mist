// -- Type Imports --
import type { Card, Character, SheetLayoutEntry } from '@/lib/types/character';
import type { Journal } from '@/lib/types/board';

/*
 * The character sheet's ordered layout manifest: a flat list of references into `cards`/`journals`
 * that owns the render ORDER (the content arrays stay the normalized stores of record). One
 * reorderable space where cards and journals interleave.
 *
 * The invariant the type can't express: `sheetLayout` is a permutation-with-completeness over
 * `cards` + `journals` - every id appears exactly once, no orphans (an entry pointing at no live
 * card/journal), no dupes. The store keeps it that way by appending on add and splicing on remove;
 * `resolveSheetLayout` is the self-healing seatbelt that repairs any desync on read.
 */

/**
 * The behavior-preserving default manifest for a character: every card in array order, then every
 * journal in array order. Matches what the sheet rendered before the manifest (cards mapped, then
 * journals), so backfilling with this is a no-op for the eye.
 */
export function buildSheetLayout(character: Pick<Character, 'cards' | 'journals'>): SheetLayoutEntry[] {
   return [
      ...character.cards.map((card): SheetLayoutEntry => ({ kind: 'card', id: card.id })),
      ...character.journals.map((journal): SheetLayoutEntry => ({ kind: 'journal', id: journal.id })),
   ];
}

/**
 * The self-healing read resolver: drops entries pointing at no live card/journal and appends any
 * card/journal missing from the manifest (cards before journals, matching the backfill). A manifest
 * that can desync from its content arrays WILL desync, so every consumer that walks it resolves
 * through here - a stray add/remove that forgot the manifest can never lose or strand an element.
 */
export function resolveSheetLayout(character: Pick<Character, 'cards' | 'journals' | 'sheetLayout'>): SheetLayoutEntry[] {
   const cardIds = new Set(character.cards.map((card) => card.id));
   const journalIds = new Set(character.journals.map((journal) => journal.id));

   const seen = new Set<string>();
   const resolved: SheetLayoutEntry[] = [];
   for (const entry of character.sheetLayout ?? []) {
      if (seen.has(entry.id)) continue;
      const live = entry.kind === 'card' ? cardIds.has(entry.id) : journalIds.has(entry.id);
      if (!live) continue;
      seen.add(entry.id);
      resolved.push(entry);
   }

   // Append any content the manifest never listed (cards first, then journals).
   for (const card of character.cards) if (!seen.has(card.id)) resolved.push({ kind: 'card', id: card.id });
   for (const journal of character.journals) if (!seen.has(journal.id)) resolved.push({ kind: 'journal', id: journal.id });

   return resolved;
}

/** A resolved layout entry joined to its live card/journal, in manifest order. */
export type ResolvedSheetItem =
   | { kind: 'card'; id: string; card: Card }
   | { kind: 'journal'; id: string; journal: Journal };

/**
 * Joins the resolved manifest to its live card/journal objects, in manifest order - the concrete list
 * a sheet renders. Runs through `resolveSheetLayout`, so dangling ids are already dropped and the list
 * has no holes; for a journal-less character it's `cards` in array order.
 */
export function resolveSheetItems(character: Pick<Character, 'cards' | 'journals' | 'sheetLayout'>): ResolvedSheetItem[] {
   const cardsById = new Map(character.cards.map((card) => [card.id, card]));
   const journalsById = new Map(character.journals.map((journal) => [journal.id, journal]));

   const items: ResolvedSheetItem[] = [];
   for (const entry of resolveSheetLayout(character)) {
      if (entry.kind === 'card') {
         const card = cardsById.get(entry.id);
         if (card) items.push({ kind: 'card', id: card.id, card });
      } else {
         const journal = journalsById.get(entry.id);
         if (journal) items.push({ kind: 'journal', id: journal.id, journal });
      }
   }
   return items;
}

/** Appends a manifest entry for a freshly-added card/journal (the add cascade). */
export function appendSheetLayoutEntry(sheetLayout: SheetLayoutEntry[], entry: SheetLayoutEntry): SheetLayoutEntry[] {
   return [...sheetLayout, entry];
}

/** Splices out the entry for a removed card/journal by id (the remove cascade). */
export function removeSheetLayoutEntry(sheetLayout: SheetLayoutEntry[], id: string): SheetLayoutEntry[] {
   return sheetLayout.filter((entry) => entry.id !== id);
}

/**
 * Kind-agnostic reorder over the manifest: move `fromId`'s entry to `toId`'s position. dnd-kit's
 * live shuffle already reflects the target slot, so we land on it. A no-op when either id is missing
 * or they're the same.
 */
export function reorderSheetLayoutEntries(sheetLayout: SheetLayoutEntry[], fromId: string, toId: string): SheetLayoutEntry[] {
   if (fromId === toId) return sheetLayout;
   const fromIndex = sheetLayout.findIndex((entry) => entry.id === fromId);
   const toIndex = sheetLayout.findIndex((entry) => entry.id === toId);
   if (fromIndex === -1 || toIndex === -1) return sheetLayout;
   const next = [...sheetLayout];
   const [moved] = next.splice(fromIndex, 1);
   next.splice(toIndex, 0, moved);
   return next;
}
