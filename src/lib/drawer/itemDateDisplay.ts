// -- Type Imports --
import type { GeneralItemType } from '@/lib/types/drawer';

/*
 * The drawer item date line. Only the RE-SAVEABLE types (a character sheet, a board) are edited in
 * place, so they read "Updated <relative>"; every other (write-once) type reads "Created <relative>"
 * and never shows `updatedAt` (which equals `createdAt` for them - the column exists for schema unity).
 * Relative phrasing falls back to an absolute date past a few weeks. Framework-free so the rule + the
 * ladder are unit-testable; the component applies i18n.
 */

/** The item types re-saved in place; everything else is write-once. */
const RE_SAVEABLE_TYPES: ReadonlySet<GeneralItemType> = new Set(['FULL_CHARACTER_SHEET', 'FULL_BOARD']);

/** Whether an item's date line reads "Updated" (re-saveable) or "Created" (write-once). */
export function itemDateMode(type: GeneralItemType): 'updated' | 'created' {
   return RE_SAVEABLE_TYPES.has(type) ? 'updated' : 'created';
}

/** A relative step for a past time (value negative = ago), or `absolute` once past the ladder. */
export type RelativeDateStep = { unit: 'second' | 'minute' | 'hour' | 'day' | 'week'; value: number } | { absolute: true };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * Picks the relative step for `deltaMs = now - then` (clamped at 0): under a minute reads as "now",
 * then minutes / hours / days / weeks, and anything older than ~4 weeks falls back to an absolute date.
 */
export function relativeDateLadder(deltaMs: number): RelativeDateStep {
   const delta = Math.max(0, deltaMs);
   if (delta < MINUTE) return { unit: 'second', value: 0 };
   if (delta < HOUR) return { unit: 'minute', value: -Math.floor(delta / MINUTE) };
   if (delta < DAY) return { unit: 'hour', value: -Math.floor(delta / HOUR) };
   if (delta < WEEK) return { unit: 'day', value: -Math.floor(delta / DAY) };
   if (delta < 4 * WEEK) return { unit: 'week', value: -Math.floor(delta / WEEK) };
   return { absolute: true };
}

const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const absoluteDateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const absoluteDateTimeFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** A short, locale-aware relative string ("now", "5 minutes ago", ...), absolute (medium date) past the ladder. */
export function formatRelativeItemDate(ms: number, now: number = Date.now()): string {
   const step = relativeDateLadder(now - ms);
   if ('absolute' in step) return absoluteDateFormatter.format(ms);
   if (step.unit === 'second') return relativeFormatter.format(0, 'second'); // "now"
   return relativeFormatter.format(step.value, step.unit);
}

/** A full absolute date+time, for the hover title. */
export function formatAbsoluteItemDate(ms: number): string {
   return absoluteDateTimeFormatter.format(ms);
}
