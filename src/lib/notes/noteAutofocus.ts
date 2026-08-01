/*
 * A one-shot "this note was just created" signal, consumed by the mobile note surface to autofocus the body
 * on first mount. A freshly created note gets marked here; opening an existing note never sets it, so an
 * opened note stays readable at rest (no keyboard). The flag is consumed once, then cleared.
 */

const justCreated = new Set<string>();

/** Marks a note id as just-created, so its surface autofocuses the body on first mount. */
export function markNoteJustCreated(noteId: string | null): void {
   if (noteId) justCreated.add(noteId);
}

/** Returns whether the note was just created, clearing the flag so it fires at most once. */
export function consumeNoteJustCreated(noteId: string): boolean {
   return justCreated.delete(noteId);
}
