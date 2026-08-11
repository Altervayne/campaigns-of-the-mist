// -- Other Library Imports --
import cuid from 'cuid';

// -- Type Imports --
import type { BlandTag, ChallengeAbility, ChallengeDetails, ChallengeSpecial, ChallengeStatus, CityChallengeDetails, CityCustomMove, CityMove, MightyTag } from '@/lib/types/character';

/** The palette class for a challenge, by game: crimson parchment (LitM/City) vs gunmetal + lime (Otherscape). */
export function challengePaletteClass(game: ChallengeDetails['game']): string {
   if (game === 'OTHERSCAPE') return 'card-type-challenge-otherscape';
   if (game === 'CITY_OF_MIST') return 'card-type-challenge-com';
   return 'card-type-challenge-legends';
}

/** The palette class for a City challenge, by its primary type: orange (Logos) vs purple (Mythos), reusing the City theme palettes. */
export function cityChallengePaletteClass(primaryType: CityChallengeDetails['primaryType']): string {
   return primaryType === 'Mythos' ? 'card-type-mythos-com' : 'card-type-logos-com';
}

/** The identity tint of a City challenge's primary type - Logos orange, Mythos purple - matching the City theme hues. */
export function primaryTypeColor(primaryType: CityChallengeDetails['primaryType']): string {
   return primaryType === 'Mythos' ? 'hsl(322 42% 50%)' : 'hsl(19 72% 48%)';
}

/** The expanded sheet's Threats & Consequences accordion opens exactly one ability; this resolves which. */
export function resolveExpandedFocus(abilities: ChallengeAbility[], focusedId: string | null): string | null {
   // Keep the current focus while its ability still exists; otherwise fall back to the first (or none).
   if (focusedId != null && abilities.some((ability) => ability.id === focusedId)) return focusedId;
   return abilities[0]?.id ?? null;
}

/*
 * Shared row factories + pure list helpers for the Challenge Card's Limits / Statuses / Tags / Abilities
 * lists. Both the dialog editor and the card's inline edit rows mint rows and mutate lists through these,
 * so a fresh row always has the same shape/id scheme regardless of which surface created it.
 */

/** A fresh limit/status row: an empty name at tier 1. */
export const newStatus = (): ChallengeStatus => ({ id: cuid(), name: '', tier: 1 });

/** A fresh tag row: an empty name. */
export const newTag = (): BlandTag => ({ id: cuid(), name: '' });

/** A fresh Threats & Consequences ability row: empty tag/flavor, no consequences yet. */
export const newAbility = (): ChallengeAbility => ({ id: cuid(), tag: '', flavor: '', consequences: [] });

/** A fresh Special row: an empty name + body. */
export const newSpecial = (): ChallengeSpecial => ({ id: cuid(), name: '', body: '' });

/** A fresh Mighty tag row: an empty label at the lowest Might level. */
export const newMightyTag = (): MightyTag => ({ id: cuid(), level: 'Origin', label: '' });

/** A fresh City custom move: an empty name + description. */
export const newCustomMove = (): CityCustomMove => ({ id: cuid(), name: '', description: '' });

/** A fresh City hard move: an empty line of rich text. */
export const newHardMove = (): CityMove => ({ id: cuid(), text: '' });

/** A fresh City soft move: an empty line of rich text. */
export const newSoftMove = (): CityMove => ({ id: cuid(), text: '' });

/** A fresh consequence row: an empty line of text, id-keyed so edits survive reorders/deletes. */
export const newConsequence = (): { id: string; text: string } => ({ id: cuid(), text: '' });

/** Appends a fresh row to a list. */
export function addRow<T>(list: T[], row: T): T[] {
   return [...list, row];
}

/** Replaces the row with `id` by merging `updates` into it; other rows are untouched. */
export function updateRowById<T extends { id: string }>(list: T[], id: string, updates: Partial<T>): T[] {
   return list.map((row) => (row.id === id ? { ...row, ...updates } : row));
}

/** Drops the row with `id`. */
export function removeRowById<T extends { id: string }>(list: T[], id: string): T[] {
   return list.filter((row) => row.id !== id);
}

/**
 * Patches one ability by id by running `mutate` over the row as it exists in `abilities` NOW, returning
 * the next abilities array. Callers must pass the LIVE abilities read from the store at commit time (not
 * a render-time snapshot): a threat carries two independently-debounced fields (tag + flavor) plus per-
 * consequence debouncers, and when the row unmounts they all flush together. Reading live-then-patching
 * means the second flush already sees the first's write, so neither field can clobber the other. No-op
 * (returns the same array) when the id is absent, e.g. the ability was deleted before the flush landed.
 */
export function patchAbilityById(
   abilities: ChallengeAbility[],
   id: string,
   mutate: (current: ChallengeAbility) => ChallengeAbility,
): ChallengeAbility[] {
   const current = abilities.find((ability) => ability.id === id);
   if (!current) return abilities;
   return updateRowById(abilities, id, mutate(current));
}
