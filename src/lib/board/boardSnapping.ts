/*
 * Pure drag-assist math for the board canvas. Given the moving set's bounding box and the static target
 * rects, it finds the closest edge/center alignment on each axis within a world threshold (guides) and,
 * on axes alignment leaves open, equal-gap spacing against flanking neighbors (distance badges). Returns
 * the offset that lands the snap plus what to draw. Framework-free and deterministic: no DOM, no store,
 * nothing injected.
 */

/** A world-space axis-aligned box. */
export interface Rect {
   x: number;
   y: number;
   width: number;
   height: number;
}

/**
 * One alignment guide in world coords. `axis:'x'` is a vertical line at world-x `coord` spanning
 * world-y `from`..`to`; `axis:'y'` is a horizontal line at world-y `coord` spanning world-x `from`..`to`.
 */
export interface GuideSegment {
   axis: 'x' | 'y';
   coord: number;
   from: number;
   to: number;
}

export interface SnapResult {
   /** The extra offset to fold into the drag delta (0 on an axis with nothing in range). */
   adjust: { x: number; y: number };
   guides: GuideSegment[];
}

/**
 * One equal-gap measurement in world coords. `axis:'x'` is a horizontal gap: `from`/`to` are its two
 * facing edge x-coords and `mid` sits at the gap center on the overlap band; `axis:'y'` is a vertical
 * gap with `from`/`to` as y-coords. `gap` is the equalized gap size in world units.
 */
export interface DistanceBadge {
   axis: 'x' | 'y';
   gap: number;
   mid: { x: number; y: number };
   from: number;
   to: number;
}

export interface SpacingResult {
   /** The extra offset to fold into the drag delta (0 on an axis with no spacing snap). */
   adjust: { x: number; y: number };
   badges: DistanceBadge[];
}

export interface GuidesResult {
   adjust: { x: number; y: number };
   guides: GuideSegment[];
   badges: DistanceBadge[];
}

/** A box's three x-anchors: left edge, center, right edge. */
function xAnchors(rect: Rect): number[] {
   return [rect.x, rect.x + rect.width / 2, rect.x + rect.width];
}

/** A box's three y-anchors: top edge, center, bottom edge. */
function yAnchors(rect: Rect): number[] {
   return [rect.y, rect.y + rect.height / 2, rect.y + rect.height];
}

/**
 * Closest alignment on one axis: over every (moving anchor, target anchor) pair within `threshold`,
 * the smallest absolute distance wins. `adjust` is the offset aligning the moving anchor to the
 * target anchor; `coord` is the aligned world coordinate (null when nothing is in range).
 */
function solveAxis(movingAnchors: number[], targetAnchors: number[], threshold: number): { adjust: number; coord: number | null } {
   let best: { adjust: number; coord: number; dist: number } | null = null;
   for (const moving of movingAnchors) {
      for (const target of targetAnchors) {
         const dist = Math.abs(target - moving);
         if (dist > threshold) continue;
         if (!best || dist < best.dist) best = { adjust: target - moving, coord: target, dist };
      }
   }
   return best ? { adjust: best.adjust, coord: best.coord } : { adjust: 0, coord: null };
}

/** Vertical guide at `coord`, spanning the tops/bottoms of the snapped box and every target aligned there. */
function xGuide(coord: number, snapped: Rect, targets: Rect[]): GuideSegment {
   let from = snapped.y;
   let to = snapped.y + snapped.height;
   for (const target of targets) {
      if (!xAnchors(target).includes(coord)) continue;
      from = Math.min(from, target.y);
      to = Math.max(to, target.y + target.height);
   }
   return { axis: 'x', coord, from, to };
}

/** Horizontal guide at `coord`, spanning the lefts/rights of the snapped box and every target aligned there. */
function yGuide(coord: number, snapped: Rect, targets: Rect[]): GuideSegment {
   let from = snapped.x;
   let to = snapped.x + snapped.width;
   for (const target of targets) {
      if (!yAnchors(target).includes(coord)) continue;
      from = Math.min(from, target.x);
      to = Math.max(to, target.x + target.width);
   }
   return { axis: 'y', coord, from, to };
}

/**
 * Snaps `movingBbox` to the targets' edges and centers, X and Y independently. Each axis takes its
 * own closest alignment within `threshold`; the guide extents are measured against the box AFTER the
 * adjust is applied, so a guide always meets the box where it lands.
 */
export function computeSnap(movingBbox: Rect, targets: Rect[], threshold: number): SnapResult {
   const targetXAnchors = targets.flatMap(xAnchors);
   const targetYAnchors = targets.flatMap(yAnchors);

   const x = solveAxis(xAnchors(movingBbox), targetXAnchors, threshold);
   const y = solveAxis(yAnchors(movingBbox), targetYAnchors, threshold);

   const adjust = { x: x.adjust, y: y.adjust };
   const snapped: Rect = { x: movingBbox.x + adjust.x, y: movingBbox.y + adjust.y, width: movingBbox.width, height: movingBbox.height };

   const guides: GuideSegment[] = [];
   if (x.coord !== null) guides.push(xGuide(x.coord, snapped, targets));
   if (y.coord !== null) guides.push(yGuide(y.coord, snapped, targets));

   return { adjust, guides };
}

/** The chosen snap on one resize axis: a size-match to a neighbor beats/loses to edge-alignment purely on distance. */
interface ResizeAxisSnap {
   /** Offset that lands the snap, applied as a SIZE change (top-left is pinned). */
   adjust: number;
   /** The aligned edge coord (for an alignment guide), null when nothing is in range. */
   coord: number | null;
   /** The target whose SIZE was matched (for an equal-size badge), null for an edge-alignment snap. */
   sizeMatch: Rect | null;
}

/**
 * Closest resize snap on one axis. The moving `edge` (right or bottom) is solved against two candidate
 * families within `threshold`, closest wins: the targets' edge/center anchors (aligns the edge, `coord`),
 * and each target's SIZE projected off the pinned `origin` (`origin + targetSize` makes the box the same
 * width/height as that target, wherever it sits - `sizeMatch`). `sizeOf` and `anchorsOf` pick the axis.
 */
function solveResizeAxis(edge: number, origin: number, targets: Rect[], sizeOf: (t: Rect) => number, anchorsOf: (r: Rect) => number[], threshold: number): ResizeAxisSnap {
   // Every candidate coord the edge could snap to: each target's edge/center anchors (alignment) and each
   // target's size projected off the pinned origin (equal-size). Edge anchors precede the size-match per
   // target, so an exact tie keeps alignment. Closest within threshold wins.
   const candidates: { coord: number; sizeMatch: Rect | null }[] = [];
   for (const target of targets) {
      for (const anchor of anchorsOf(target)) candidates.push({ coord: anchor, sizeMatch: null });
      candidates.push({ coord: origin + sizeOf(target), sizeMatch: target });
   }
   let best: ResizeAxisSnap = { adjust: 0, coord: null, sizeMatch: null };
   let bestDist = Infinity;
   for (const candidate of candidates) {
      const dist = Math.abs(candidate.coord - edge);
      if (dist > threshold || dist >= bestDist) continue;
      best = { adjust: candidate.coord - edge, coord: candidate.coord, sizeMatch: candidate.sizeMatch };
      bestDist = dist;
   }
   return best;
}

/** An equal-size measure bar spanning `span` along `axis` at the box's cross-axis center, labeled with the size. */
function sizeBadge(axis: 'x' | 'y', box: Rect): DistanceBadge {
   return axis === 'x'
      ? { axis, gap: box.width, from: box.x, to: box.x + box.width, mid: { x: box.x + box.width / 2, y: box.y + box.height / 2 } }
      : { axis, gap: box.height, from: box.y, to: box.y + box.height, mid: { x: box.x + box.width / 2, y: box.y + box.height / 2 } };
}

/**
 * Snap for a bottom-right resize: the top-left is pinned, so only the RIGHT edge (`x + width`) and BOTTOM
 * edge (`y + height`) move. Each edge snaps to the closest of the targets' edges/centers (an alignment guide)
 * or a neighbor's matching dimension (equal width/height, an equal-size badge on both boxes). Each edge's
 * `adjust` becomes a size change; a snap that would drop a dimension below its floor is dropped on that axis.
 */
export function computeResizeSnap(rect: Rect, targets: Rect[], threshold: number, minWidth: number, minHeight: number): { width: number; height: number; guides: GuideSegment[]; badges: DistanceBadge[] } {
   const x = solveResizeAxis(rect.x + rect.width, rect.x, targets, (t) => t.width, xAnchors, threshold);
   const y = solveResizeAxis(rect.y + rect.height, rect.y, targets, (t) => t.height, yAnchors, threshold);

   let width = rect.width;
   let height = rect.height;
   let xSnap: ResizeAxisSnap | null = x.coord !== null ? x : null;
   let ySnap: ResizeAxisSnap | null = y.coord !== null ? y : null;
   // An edge adjust is a size adjust (top-left pinned). Drop the snap on an axis it would floor below.
   if (xSnap) {
      const snapped = rect.width + xSnap.adjust;
      if (snapped >= minWidth) width = snapped;
      else xSnap = null;
   }
   if (ySnap) {
      const snapped = rect.height + ySnap.adjust;
      if (snapped >= minHeight) height = snapped;
      else ySnap = null;
   }

   const box: Rect = { x: rect.x, y: rect.y, width, height };
   const guides: GuideSegment[] = [];
   const badges: DistanceBadge[] = [];
   // An edge alignment draws a guide (box + aligned neighbors); a size-match draws equal-length bars on both boxes.
   if (xSnap) {
      if (xSnap.sizeMatch) badges.push(sizeBadge('x', box), sizeBadge('x', xSnap.sizeMatch));
      else guides.push(xGuide(xSnap.coord!, box, targets));
   }
   if (ySnap) {
      if (ySnap.sizeMatch) badges.push(sizeBadge('y', box), sizeBadge('y', ySnap.sizeMatch));
      else guides.push(yGuide(ySnap.coord!, box, targets));
   }

   return { width, height, guides, badges };
}

/*
 * Equal-spacing detection. The moving box and its neighbors are projected onto one axis as spans; when the
 * box forms equal gaps with the flanking neighbors it snaps to equalize and measures those gaps. The
 * axis-generic math runs once per axis over the projected spans.
 */

/** A box projected onto one axis: `start`/`end` are the primary extent, `perpStart`/`perpEnd` the cross extent. */
interface Span {
   start: number;
   end: number;
   perpStart: number;
   perpEnd: number;
}

/** A gap to badge before the axis maps it to world x/y: `perp` is the overlap-band center on the cross axis. */
interface RawBadge {
   gap: number;
   from: number;
   to: number;
   perp: number;
}

/** X projection: primary extent is left..right, cross extent is top..bottom. */
function projX(rect: Rect): Span {
   return { start: rect.x, end: rect.x + rect.width, perpStart: rect.y, perpEnd: rect.y + rect.height };
}

/** Y projection: primary extent is top..bottom, cross extent is left..right. */
function projY(rect: Rect): Span {
   return { start: rect.y, end: rect.y + rect.height, perpStart: rect.x, perpEnd: rect.x + rect.width };
}

/** Two spans are peers on this axis when their cross extents overlap (they sit in the same row/column). */
function perpOverlap(a: Span, b: Span): boolean {
   return Math.min(a.perpEnd, b.perpEnd) > Math.max(a.perpStart, b.perpStart);
}

/** Center of the cross-axis overlap band between two peers; the perpendicular position a gap badge sits on. */
function perpCenter(a: Span, b: Span): number {
   return (Math.max(a.perpStart, b.perpStart) + Math.min(a.perpEnd, b.perpEnd)) / 2;
}

/** Nearest peer lying fully before `ref` on the primary axis (its end at or before ref's start); null when none. */
function nearestBefore(ref: Span, spans: Span[]): Span | null {
   let best: Span | null = null;
   for (const span of spans) {
      if (!perpOverlap(span, ref)) continue;
      if (span.end <= ref.start && (!best || span.end > best.end)) best = span;
   }
   return best;
}

/** Nearest peer lying fully after `ref` on the primary axis (its start at or after ref's end); null when none. */
function nearestAfter(ref: Span, spans: Span[]): Span | null {
   let best: Span | null = null;
   for (const span of spans) {
      if (!perpOverlap(span, ref)) continue;
      if (span.start >= ref.end && (!best || span.start < best.start)) best = span;
   }
   return best;
}

/**
 * Spacing snap on one axis. Behavior A: flanked by a peer on each side, shift to equalize the two gaps.
 * Behavior B: flanked on one side only, repeat that neighbor's own reference gap. A wins over B when both
 * flanks exist. Returns the primary-axis shift plus the two equal gaps to badge, or null when nothing snaps.
 */
function solveSpacingAxis(moving: Span, spans: Span[], threshold: number): { shift: number; badges: RawBadge[] } | null {
   const before = nearestBefore(moving, spans);
   const after = nearestAfter(moving, spans);

   if (before && after) {
      const gapBefore = moving.start - before.end;
      const gapAfter = after.start - moving.end;
      const shift = (gapAfter - gapBefore) / 2;
      if (Math.abs(shift) > threshold) return null;
      const gap = (gapBefore + gapAfter) / 2;
      const start = moving.start + shift;
      const end = moving.end + shift;
      return {
         shift,
         badges: [
            { gap, from: before.end, to: start, perp: perpCenter(before, moving) },
            { gap, from: end, to: after.start, perp: perpCenter(after, moving) },
         ],
      };
   }

   if (before) {
      const ref = nearestBefore(before, spans);
      if (!ref) return null;
      const refGap = before.start - ref.end;
      const gap = moving.start - before.end;
      if (Math.abs(gap - refGap) > threshold) return null;
      const start = moving.start + (refGap - gap);
      return {
         shift: refGap - gap,
         badges: [
            { gap: refGap, from: ref.end, to: before.start, perp: perpCenter(ref, before) },
            { gap: refGap, from: before.end, to: start, perp: perpCenter(before, moving) },
         ],
      };
   }

   if (after) {
      const ref = nearestAfter(after, spans);
      if (!ref) return null;
      const refGap = ref.start - after.end;
      const gap = after.start - moving.end;
      if (Math.abs(gap - refGap) > threshold) return null;
      const end = moving.end + (gap - refGap);
      return {
         shift: gap - refGap,
         badges: [
            { gap: refGap, from: end, to: after.start, perp: perpCenter(after, moving) },
            { gap: refGap, from: after.end, to: ref.start, perp: perpCenter(after, ref) },
         ],
      };
   }

   return null;
}

/**
 * Equalizes the moving box's gaps to its flanking peers on the requested axes and returns the offset plus the
 * gap badges. Peer filtering (cross-axis overlap) happens per axis inside the solve. `axes` gates which axes
 * run so a caller can skip an axis alignment already claimed.
 */
export function computeSpacing(movingBbox: Rect, targets: Rect[], threshold: number, axes: { x: boolean; y: boolean } = { x: true, y: true }): SpacingResult {
   const adjust = { x: 0, y: 0 };
   const badges: DistanceBadge[] = [];

   if (axes.x) {
      const solved = solveSpacingAxis(projX(movingBbox), targets.map(projX), threshold);
      if (solved) {
         adjust.x = solved.shift;
         for (const badge of solved.badges) badges.push({ axis: 'x', gap: badge.gap, from: badge.from, to: badge.to, mid: { x: (badge.from + badge.to) / 2, y: badge.perp } });
      }
   }
   if (axes.y) {
      const solved = solveSpacingAxis(projY(movingBbox), targets.map(projY), threshold);
      if (solved) {
         adjust.y = solved.shift;
         for (const badge of solved.badges) badges.push({ axis: 'y', gap: badge.gap, from: badge.from, to: badge.to, mid: { x: badge.perp, y: (badge.from + badge.to) / 2 } });
      }
   }

   return { adjust, badges };
}

/**
 * The full drag-assist pass: alignment first, then spacing on the axes alignment left unclaimed (an axis is
 * claimed when it produced a guide). Spacing measures against the box after alignment applies, so a claimed
 * axis's offset carries into the other axis's gap math. Merges both offsets and returns guides plus badges.
 */
export function computeGuides(movingBbox: Rect, targets: Rect[], threshold: number): GuidesResult {
   const snap = computeSnap(movingBbox, targets, threshold);
   const xClaimed = snap.guides.some((guide) => guide.axis === 'x');
   const yClaimed = snap.guides.some((guide) => guide.axis === 'y');
   if (xClaimed && yClaimed) return { adjust: snap.adjust, guides: snap.guides, badges: [] };

   const snapped: Rect = { x: movingBbox.x + snap.adjust.x, y: movingBbox.y + snap.adjust.y, width: movingBbox.width, height: movingBbox.height };
   const spacing = computeSpacing(snapped, targets, threshold, { x: !xClaimed, y: !yClaimed });

   return {
      adjust: { x: snap.adjust.x + spacing.adjust.x, y: snap.adjust.y + spacing.adjust.y },
      guides: snap.guides,
      badges: spacing.badges,
   };
}
