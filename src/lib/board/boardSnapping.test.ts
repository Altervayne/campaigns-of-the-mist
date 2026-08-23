// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { computeGuides, computeResizeSnap, computeSnap, computeSpacing, type Rect } from './boardSnapping';

/*
 * Alignment snapping: X and Y solve independently, the closest anchor pair within threshold wins, and
 * each guide spans the extent of the boxes it aligns. All coords are world units.
 */

const THRESHOLD = 6;

describe('computeSnap', () => {
   it('snaps left edge to a target left edge', () => {
      const moving: Rect = { x: 104, y: 300, width: 50, height: 40 };
      const target: Rect = { x: 100, y: 0, width: 20, height: 20 };
      const { adjust } = computeSnap(moving, [target], THRESHOLD);
      expect(adjust.x).toBe(-4);
      expect(adjust.y).toBe(0);
   });

   it('snaps right edge to a target right edge', () => {
      // moving right = 200 + 50 = 250, target right = 120 + 133 = 253 -> pull +3.
      const moving: Rect = { x: 200, y: 300, width: 50, height: 40 };
      const target: Rect = { x: 120, y: 0, width: 133, height: 20 };
      const { adjust } = computeSnap(moving, [target], THRESHOLD);
      expect(adjust.x).toBe(3);
   });

   it('snaps center-x to a target center-x', () => {
      // moving center-x = 100 + 30 = 130, target center-x = 60 + 74 = 134 -> pull +4.
      const moving: Rect = { x: 100, y: 300, width: 60, height: 40 };
      const target: Rect = { x: 60, y: 0, width: 148, height: 20 };
      const { adjust } = computeSnap(moving, [target], THRESHOLD);
      expect(adjust.x).toBe(4);
   });

   it('snaps left edge to a target right edge (opposite edges)', () => {
      // moving left = 205, target right = 200 -> pull -5, with no closer left/center anchor in range.
      const moving: Rect = { x: 205, y: 300, width: 50, height: 40 };
      const target: Rect = { x: 100, y: 0, width: 100, height: 20 };
      const { adjust } = computeSnap(moving, [target], THRESHOLD);
      expect(adjust.x).toBe(-5);
   });

   it('snaps center-x to a target left edge (center to edge)', () => {
      // moving center-x = 300 + 20 = 320, target left = 322 -> pull +2.
      const moving: Rect = { x: 300, y: 300, width: 40, height: 40 };
      const target: Rect = { x: 322, y: 0, width: 500, height: 20 };
      const { adjust } = computeSnap(moving, [target], THRESHOLD);
      expect(adjust.x).toBe(2);
   });

   it('solves X and Y independently', () => {
      // X in range (left 103 -> 100), Y out of range (top 200 vs target top 0/20 -> no snap).
      const moving: Rect = { x: 103, y: 200, width: 50, height: 40 };
      const target: Rect = { x: 100, y: 0, width: 20, height: 20 };
      const { adjust } = computeSnap(moving, [target], THRESHOLD);
      expect(adjust.x).toBe(-3);
      expect(adjust.y).toBe(0);
   });

   it('includes an anchor exactly at threshold and excludes one just past it', () => {
      // A wide target keeps its center/right anchors out of range, so only the left-left pair is tested.
      const target: Rect = { x: 100, y: 0, width: 500, height: 20 };
      const justIn: Rect = { x: 106, y: 300, width: 50, height: 40 };
      expect(computeSnap(justIn, [target], THRESHOLD).adjust.x).toBe(-6);
      const justOut: Rect = { x: 106.5, y: 300, width: 50, height: 40 };
      expect(computeSnap(justOut, [target], THRESHOLD).adjust.x).toBe(0);
   });

   it('picks the closest target when several are in range', () => {
      // moving left = 100; near = 103 (dist 3) beats far = 105 (dist 5).
      const moving: Rect = { x: 100, y: 300, width: 40, height: 40 };
      const near: Rect = { x: 103, y: 0, width: 20, height: 20 };
      const far: Rect = { x: 105, y: 0, width: 20, height: 20 };
      const { adjust } = computeSnap(moving, [far, near], THRESHOLD);
      expect(adjust.x).toBe(3);
   });

   it('emits a vertical guide at the aligned x, spanning the snapped box and target extents', () => {
      const moving: Rect = { x: 104, y: 300, width: 50, height: 40 };
      const target: Rect = { x: 100, y: 0, width: 20, height: 20 };
      const { guides } = computeSnap(moving, [target], THRESHOLD);
      const xGuide = guides.find((g) => g.axis === 'x');
      expect(xGuide).toBeDefined();
      expect(xGuide!.coord).toBe(100); // the aligned left edge
      expect(xGuide!.from).toBe(0); // target top
      expect(xGuide!.to).toBe(340); // snapped moving bottom (300 + 40)
   });

   it('emits a horizontal guide at the aligned y with matching extents', () => {
      // moving top = 54 -> target top 50; guide spans lefts/rights of both boxes.
      const moving: Rect = { x: 400, y: 54, width: 50, height: 40 };
      const target: Rect = { x: 100, y: 50, width: 20, height: 20 };
      const { adjust, guides } = computeSnap(moving, [target], THRESHOLD);
      expect(adjust.y).toBe(-4);
      const yGuide = guides.find((g) => g.axis === 'y');
      expect(yGuide).toBeDefined();
      expect(yGuide!.coord).toBe(50);
      expect(yGuide!.from).toBe(100); // target left
      expect(yGuide!.to).toBe(450); // snapped moving right (400 + 50)
   });

   it('returns zero adjust and no guides with no targets', () => {
      const moving: Rect = { x: 100, y: 100, width: 50, height: 40 };
      const { adjust, guides } = computeSnap(moving, [], THRESHOLD);
      expect(adjust).toEqual({ x: 0, y: 0 });
      expect(guides).toEqual([]);
   });
});

/*
 * Equal-spacing detection: only cross-axis-overlapping neighbors (peers) count on an axis. Behavior A
 * centers the box between two flanking peers; Behavior B repeats a one-sided neighbor's own gap. Each snap
 * emits two equal-gap badges. All coords are world units.
 */
describe('computeSpacing', () => {
   it('ignores a flanking box that does not overlap on the cross axis (not a peer)', () => {
      // Left peer overlaps in y; the right box sits in another row, so it never forms a spacing pair.
      const moving: Rect = { x: 200, y: 100, width: 50, height: 40 };
      const leftPeer: Rect = { x: 80, y: 100, width: 20, height: 40 };
      const rightOtherRow: Rect = { x: 300, y: 500, width: 50, height: 40 };
      const { adjust, badges } = computeSpacing(moving, [leftPeer, rightOtherRow], THRESHOLD);
      expect(adjust).toEqual({ x: 0, y: 0 });
      expect(badges).toEqual([]);
   });

   it('centers between two flanking peers and badges both equal gaps (Behavior A)', () => {
      // gapBefore = 110, gapAfter = 118 -> shift +4, equalized gap 114.
      const moving: Rect = { x: 210, y: 100, width: 50, height: 40 };
      const leftPeer: Rect = { x: 80, y: 100, width: 20, height: 40 };
      const rightPeer: Rect = { x: 378, y: 110, width: 20, height: 40 };
      const { adjust, badges } = computeSpacing(moving, [leftPeer, rightPeer], THRESHOLD);
      expect(adjust.x).toBe(4);
      expect(adjust.y).toBe(0);
      expect(badges).toHaveLength(2);
      expect(badges.every((b) => b.axis === 'x')).toBe(true);

      const before = badges.find((b) => b.from === 100)!;
      expect(before).toMatchObject({ gap: 114, from: 100, to: 214 });
      expect(before.mid).toEqual({ x: 157, y: 120 });

      const after = badges.find((b) => b.from === 264)!;
      expect(after).toMatchObject({ gap: 114, from: 264, to: 378 });
      expect(after.mid).toEqual({ x: 321, y: 125 });
   });

   it('repeats a left neighbor run gap when flanked only on the left (Behavior B)', () => {
      // Reference gap LLp..leftPeer = 40; moving gap 43 -> shift -3 to match, both badges read 40.
      const llp: Rect = { x: 70, y: 100, width: 30, height: 40 };
      const leftPeer: Rect = { x: 140, y: 100, width: 30, height: 40 };
      const moving: Rect = { x: 213, y: 100, width: 50, height: 40 };
      const { adjust, badges } = computeSpacing(moving, [llp, leftPeer], THRESHOLD);
      expect(adjust.x).toBe(-3);
      expect(badges).toHaveLength(2);
      expect(badges.find((b) => b.from === 100)).toMatchObject({ gap: 40, from: 100, to: 140 });
      expect(badges.find((b) => b.from === 170)).toMatchObject({ gap: 40, from: 170, to: 210 });
   });

   it('repeats a right neighbor run gap when flanked only on the right (Behavior B)', () => {
      // Reference gap rightPeer..RRp = 40; moving gap 43 -> shift +3 to match, both badges read 40.
      const moving: Rect = { x: 97, y: 100, width: 50, height: 40 };
      const rightPeer: Rect = { x: 190, y: 100, width: 30, height: 40 };
      const rrp: Rect = { x: 260, y: 100, width: 30, height: 40 };
      const { adjust, badges } = computeSpacing(moving, [rightPeer, rrp], THRESHOLD);
      expect(adjust.x).toBe(3);
      expect(badges).toHaveLength(2);
      expect(badges.find((b) => b.from === 150)).toMatchObject({ gap: 40, from: 150, to: 190 });
      expect(badges.find((b) => b.from === 220)).toMatchObject({ gap: 40, from: 220, to: 260 });
   });

   it('snaps spacing at the threshold boundary and not just past it', () => {
      const leftPeer: Rect = { x: 80, y: 100, width: 20, height: 40 };
      const moving: Rect = { x: 200, y: 100, width: 50, height: 40 };
      // gapBefore 100, gapAfter 112 -> shift exactly 6.
      const justIn: Rect = { x: 362, y: 100, width: 20, height: 40 };
      expect(computeSpacing(moving, [leftPeer, justIn], THRESHOLD).adjust.x).toBe(6);
      // gapAfter 113 -> shift 6.5, out of range.
      const justOut: Rect = { x: 363, y: 100, width: 20, height: 40 };
      const past = computeSpacing(moving, [leftPeer, justOut], THRESHOLD);
      expect(past.adjust.x).toBe(0);
      expect(past.badges).toEqual([]);
   });

   it('finds no spacing with no targets or a single unflanked peer', () => {
      const moving: Rect = { x: 200, y: 100, width: 50, height: 40 };
      expect(computeSpacing(moving, [], THRESHOLD)).toEqual({ adjust: { x: 0, y: 0 }, badges: [] });
      const lonePeer: Rect = { x: 80, y: 100, width: 20, height: 40 };
      const one = computeSpacing(moving, [lonePeer], THRESHOLD);
      expect(one.adjust).toEqual({ x: 0, y: 0 });
      expect(one.badges).toEqual([]);
   });
});

/*
 * Resize snapping: the top-left is pinned, so the right edge snaps to target x-anchors and the bottom edge
 * to target y-anchors, each folding into a size change. A snap that floors a dimension is dropped. All
 * coords are world units; the floors here are the default MIN_ITEM_SIZE (40).
 */
describe('computeResizeSnap', () => {
   const MIN = 40;

   it('snaps the right edge to a target left edge, growing width', () => {
      // right edge = 100 + 50 = 150, target left = 153 -> +3 width.
      const rect: Rect = { x: 100, y: 100, width: 50, height: 40 };
      const target: Rect = { x: 153, y: 0, width: 20, height: 20 };
      const { width, height, guides } = computeResizeSnap(rect, [target], THRESHOLD, MIN, MIN);
      expect(width).toBe(53);
      expect(height).toBe(40);
      const guide = guides.find((g) => g.axis === 'x');
      expect(guide).toMatchObject({ axis: 'x', coord: 153, from: 0, to: 140 });
   });

   it('snaps the right edge to a target center-x', () => {
      // right edge = 150, target center-x = 138 + 10 = 148 -> -2 width.
      const rect: Rect = { x: 100, y: 100, width: 50, height: 40 };
      const target: Rect = { x: 138, y: 0, width: 20, height: 20 };
      const { width } = computeResizeSnap(rect, [target], THRESHOLD, MIN, MIN);
      expect(width).toBe(48);
   });

   it('snaps the right edge to a target right edge, shrinking width', () => {
      // right edge = 150, target right = 100 + 47 = 147 -> -3 width.
      const rect: Rect = { x: 100, y: 100, width: 50, height: 40 };
      const target: Rect = { x: 100, y: 0, width: 47, height: 20 };
      const { width } = computeResizeSnap(rect, [target], THRESHOLD, MIN, MIN);
      expect(width).toBe(47);
   });

   it('snaps the bottom edge to a target y-anchor', () => {
      // bottom edge = 100 + 50 = 150, target top = 148 -> -2 height; x untouched.
      const rect: Rect = { x: 100, y: 100, width: 50, height: 50 };
      const target: Rect = { x: 0, y: 148, width: 20, height: 20 };
      const { width, height, guides } = computeResizeSnap(rect, [target], THRESHOLD, MIN, MIN);
      expect(width).toBe(50);
      expect(height).toBe(48);
      expect(guides.find((g) => g.axis === 'y')).toMatchObject({ axis: 'y', coord: 148 });
   });

   it('snaps both edges at once', () => {
      // right edge = 150 -> 153 (+3), bottom edge = 150 -> 148 (-2).
      const rect: Rect = { x: 100, y: 100, width: 50, height: 50 };
      const target: Rect = { x: 153, y: 148, width: 20, height: 20 };
      const { width, height, guides } = computeResizeSnap(rect, [target], THRESHOLD, MIN, MIN);
      expect(width).toBe(53);
      expect(height).toBe(48);
      expect(guides).toHaveLength(2);
      expect(guides.some((g) => g.axis === 'x')).toBe(true);
      expect(guides.some((g) => g.axis === 'y')).toBe(true);
   });

   it('drops a snap that would floor the dimension, keeping the un-snapped size', () => {
      // right edge = 100 + 42 = 142, target left = 138 -> -4 -> width 38 < min 40, so no snap and no guide.
      const rect: Rect = { x: 100, y: 100, width: 42, height: 40 };
      const target: Rect = { x: 138, y: 0, width: 20, height: 20 };
      const { width, guides } = computeResizeSnap(rect, [target], THRESHOLD, MIN, MIN);
      expect(width).toBe(42);
      expect(guides).toEqual([]);
   });

   it('returns the original size and no guides with nothing in range', () => {
      const rect: Rect = { x: 100, y: 100, width: 50, height: 40 };
      const target: Rect = { x: 500, y: 500, width: 20, height: 20 };
      const { width, height, guides } = computeResizeSnap(rect, [target], THRESHOLD, MIN, MIN);
      expect(width).toBe(50);
      expect(height).toBe(40);
      expect(guides).toEqual([]);
   });

   it('matches a distant neighbor width (equal-size), emitting badges not a guide', () => {
      // right edge = 150; the target is far away (x 400) but 52 wide, so origin 100 + 52 = 152 -> +2 width == its width.
      const rect: Rect = { x: 100, y: 100, width: 50, height: 40 };
      const target: Rect = { x: 400, y: 400, width: 52, height: 30 };
      const { width, guides, badges } = computeResizeSnap(rect, [target], THRESHOLD, MIN, MIN);
      expect(width).toBe(52);
      expect(guides).toEqual([]);
      expect(badges).toHaveLength(2);
      expect(badges.every((b) => b.axis === 'x' && b.gap === 52)).toBe(true);
   });

   it('matches a distant neighbor height (equal-size)', () => {
      // bottom edge = 140; the target is 43 tall, so origin 100 + 43 = 143 -> +3 height == its height.
      const rect: Rect = { x: 100, y: 100, width: 50, height: 40 };
      const target: Rect = { x: 400, y: 400, width: 30, height: 43 };
      const { height, badges } = computeResizeSnap(rect, [target], THRESHOLD, MIN, MIN);
      expect(height).toBe(43);
      expect(badges.some((b) => b.axis === 'y' && b.gap === 43)).toBe(true);
   });

   it('prefers edge-alignment over an equal-size match at the same distance', () => {
      // right edge = 150: target left = 152 (+2 align) and target width 48 -> origin 100 + 48 = 148 (-2 size). Both
      // 2 away, alignment is tried first, so it wins -> a guide and no size badge.
      const rect: Rect = { x: 100, y: 100, width: 50, height: 40 };
      const target: Rect = { x: 152, y: 0, width: 48, height: 20 };
      const { width, guides, badges } = computeResizeSnap(rect, [target], THRESHOLD, MIN, MIN);
      expect(width).toBe(52);
      expect(guides.some((g) => g.axis === 'x')).toBe(true);
      expect(badges).toEqual([]);
   });
});

/*
 * The merged pass: alignment claims an axis first; spacing runs only on axes it leaves open, measured
 * against the box after alignment applies.
 */
describe('computeGuides', () => {
   it('lets alignment claim one axis and spacing fill the other', () => {
      // X aligns (left 205 -> left edge behind a target right edge, -5); Y is free and equalizes 80/84 -> +2.
      const moving: Rect = { x: 205, y: 200, width: 50, height: 40 };
      const alignTarget: Rect = { x: 100, y: 0, width: 100, height: 20 };
      const topPeer: Rect = { x: 200, y: 100, width: 50, height: 20 };
      const bottomPeer: Rect = { x: 200, y: 324, width: 50, height: 20 };
      const { adjust, guides, badges } = computeGuides(moving, [alignTarget, topPeer, bottomPeer], THRESHOLD);
      expect(adjust.x).toBe(-5);
      expect(adjust.y).toBe(2);
      expect(guides.some((g) => g.axis === 'x')).toBe(true);
      expect(badges).toHaveLength(2);
      expect(badges.every((b) => b.axis === 'y')).toBe(true);
      expect(badges[0].gap).toBe(82);
   });

   it('runs no spacing when alignment claims both axes', () => {
      const moving: Rect = { x: 104, y: 204, width: 50, height: 40 };
      const target: Rect = { x: 100, y: 200, width: 50, height: 40 };
      const { adjust, badges } = computeGuides(moving, [target], THRESHOLD);
      expect(adjust).toEqual({ x: -4, y: -4 });
      expect(badges).toEqual([]);
   });
});
