/*
 * `accept` strings for the app's file pickers, one constant per picker family. Families differ on purpose:
 * a theme picker offers no Markdown.
 *
 * A `.cotm` export is JSON, and a browser reports a picked file by extension or by MIME depending on the OS,
 * so both spellings are listed. Where a string also feeds `useFileDrop`, only its extension tokens gate the
 * drop; MIME tokens are ignored there. Every import path re-validates the parsed payload, so `accept` only
 * filters what the dialog offers.
 */

// The `.cotm` export envelope, matched by extension and by MIME.
const COTM_ENVELOPE = '.cotm,.json,application/json';

// Portable-text Markdown, matched by extension and by MIME.
const MARKDOWN = '.md,.markdown,text/markdown';

/** Characters, components and boards imported as new, or picked to update an open one in place. */
export const ACCEPT_ENTITY_IMPORT = COTM_ENVELOPE;

/** The character sheet's universal import: characters, boards, custom themes, cards and trackers. */
export const ACCEPT_SHEET_IMPORT = COTM_ENVELOPE;

/** Custom themes imported into app settings. */
export const ACCEPT_THEME_IMPORT = COTM_ENVELOPE;

/** Notes imported as new or picked to update an open one, as an envelope or as plain Markdown. */
export const ACCEPT_NOTE_IMPORT = `${COTM_ENVELOPE},${MARKDOWN}`;

/** The sidebar's one-entry import, routed by file type to a character, board or note. */
export const ACCEPT_WORKSPACE_IMPORT = `${COTM_ENVELOPE},${MARKDOWN}`;

/** Drawer import, by picker or by drop: a full drawer, a folder, an item, or a Markdown note. */
export const ACCEPT_DRAWER_IMPORT = `${COTM_ENVELOPE},${MARKDOWN}`;

/** Full-backup restore archives. */
export const ACCEPT_BACKUP_RESTORE = '.cotmbak';

/** Images embedded into a portrait, card art, board tile or note. */
export const ACCEPT_IMAGE = 'image/*';
