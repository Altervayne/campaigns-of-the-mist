// -- Type Imports --
import type { PdfRect } from '@/lib/types/pdfAnnotation';

/*
 * Pure text-layer geometry for in-document search: fold a page's text runs into one searchable string,
 * map each run's span back to its normalized 0..1 rect, and narrow a match span down to per-run quads.
 * No pdf.js import - it takes plain numbers (transforms, widths) so the math is unit-testable and the
 * `pdf-vendor` chunk stays deferred. The rect math mirrors pdf.js's own TextLayer positioning (see below).
 */

/** A page's searchable text plus, for each text run, its span in that folded string and its normalized rect. */
export interface PageTextIndex {
   folded: string;
   items: { start: number; end: number; rect: PdfRect }[];
}

/** The pdf.js text-run fields this module reads: the string, its device transform, and its run width/height. */
export interface RawTextItem {
   str: string;
   transform: number[];
   width: number;
   height: number;
   hasEOL?: boolean;
}

const COMBINING_MARKS = /[̀-ͯ]/g;
const WHITESPACE_RUN = /\s+/g;

/**
 * Case- and diacritic-folds then collapses whitespace, so a match is stable across script and spacing.
 * Applied identically to the page text and the query. Length may change - everything downstream lives in
 * this folded space, so offsets stay consistent.
 */
export function foldText(s: string): string {
   return s
      .toLowerCase()
      .normalize('NFD')
      .replace(COMBINING_MARKS, '')
      .replace(WHITESPACE_RUN, ' ');
}

/**
 * The scale-1 viewport transform applied to a run's transform, then that run's normalized rect. Replicates
 * pdf.js `Util.transform(viewport, item.transform)`: fontHeight is `hypot(t[2],t[3])`, the run sits at
 * device `x=t[4]` on baseline `t[5]`, width is the already-viewport-scaled `item.width`. The box is one
 * fontHeight tall resting on the baseline (pdf.js seats the div at `baseline - fontAscent`, but the ascent
 * needs font metrics this pure module has no access to; a baseline-anchored box is the metric-free stand-in).
 */
function itemRect(item: RawTextItem, vt: number[], vw: number, vh: number): PdfRect {
   const c = item.transform[2];
   const d = item.transform[3];
   const e = item.transform[4];
   const f = item.transform[5];
   // 6-element affine multiply mul(vt, item.transform); only the c/d columns and the e/f translation matter here.
   const t2 = vt[0] * c + vt[2] * d;
   const t3 = vt[1] * c + vt[3] * d;
   const t4 = vt[0] * e + vt[2] * f + vt[4];
   const t5 = vt[1] * e + vt[3] * f + vt[5];
   const fontHeight = Math.hypot(t2, t3);
   return {
      x: t4 / vw,
      y: (t5 - fontHeight) / vh,
      w: item.width / vw,
      h: fontHeight / vh,
   };
}

/**
 * Builds a page's searchable index: each run's folded text concatenated into `folded`, with its `[start,end)`
 * span and normalized rect recorded. A single separator space joins runs that aren't already whitespace-
 * separated (covering both line breaks and mid-line splits), so a phrase spanning two runs still matches;
 * separator chars belong to no run's span. Empty-string runs contribute no span.
 */
export function buildPageTextIndex(items: RawTextItem[], viewportTransform: number[], viewportWidth: number, viewportHeight: number): PageTextIndex {
   let folded = '';
   const out: PageTextIndex['items'] = [];
   for (const item of items) {
      const chunk = foldText(item.str);
      if (chunk.length === 0) continue;
      // One space between runs that don't already have whitespace on either side of the join.
      if (folded.length > 0 && !folded.endsWith(' ') && !chunk.startsWith(' ')) folded += ' ';
      const start = folded.length;
      folded += chunk;
      out.push({ start, end: folded.length, rect: itemRect(item, viewportTransform, viewportWidth, viewportHeight) });
   }
   return { folded, items: out };
}

/** Every non-overlapping, left-to-right occurrence of `foldedQuery` in `folded`. Empty query yields none. */
export function findMatches(folded: string, foldedQuery: string): { start: number; length: number }[] {
   if (foldedQuery.length === 0) return [];
   const out: { start: number; length: number }[] = [];
   let from = folded.indexOf(foldedQuery);
   while (from !== -1) {
      out.push({ start: from, length: foldedQuery.length });
      from = folded.indexOf(foldedQuery, from + foldedQuery.length);
   }
   return out;
}

/**
 * The match span `[start, start+length)` as one normalized rect per covered run, each narrowed on X to the
 * covered fraction of its run (runs are single-line). Zero-width results are dropped.
 */
export function matchToQuads(index: PageTextIndex, start: number, length: number): PdfRect[] {
   const mStart = start;
   const mEnd = start + length;
   const quads: PdfRect[] = [];
   for (const item of index.items) {
      if (item.end <= mStart || item.start >= mEnd) continue;
      const span = item.end - item.start;
      const xFrac0 = (Math.max(mStart, item.start) - item.start) / span;
      const xFrac1 = (Math.min(mEnd, item.end) - item.start) / span;
      const w = item.rect.w * (xFrac1 - xFrac0);
      if (w <= 0) continue;
      quads.push({ x: item.rect.x + xFrac0 * item.rect.w, y: item.rect.y, w, h: item.rect.h });
   }
   return quads;
}
