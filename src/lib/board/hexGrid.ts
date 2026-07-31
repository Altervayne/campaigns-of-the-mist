/*
 * Pure geometry for the board's hexagonal grid. The hive is painted as a tiling SVG `<pattern>`;
 * this builds the tile's repeat size and the outline path for a pointy-top honeycomb so the canvas
 * stays free of the trigonometry. Kept pure and unit-tested, like the world<->screen math in
 * `boardCoordinates`.
 */

const SQRT3 = Math.sqrt(3);

/** A honeycomb pattern tile: its repeat size and an outline path that tiles seamlessly. */
export interface HexTile {
   width: number;
   height: number;
   /** An SVG path (`d`) of the hex outlines; repeating it at `width` x `height` fills the plane. */
   path: string;
}

/** Trims to 3 decimals so the emitted path stays compact and stable across renders. */
function round(value: number): number {
   return Math.round(value * 1000) / 1000;
}

/** The six vertices of a pointy-top hexagon of circumradius `r` centered at `(cx, cy)`. */
function hexVertices(cx: number, cy: number, r: number): [number, number][] {
   const half = (SQRT3 * r) / 2;
   return [
      [cx, cy - r],
      [cx + half, cy - r / 2],
      [cx + half, cy + r / 2],
      [cx, cy + r],
      [cx - half, cy + r / 2],
      [cx - half, cy - r / 2],
   ];
}

/** Formats a closed polygon from its vertices as an SVG path fragment. */
function polygonPath(points: [number, number][]): string {
   return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${round(x)} ${round(y)}`).join('') + 'Z';
}

/**
 * Builds the honeycomb tile for a hex of circumradius `size`. The repeat rectangle is `sqrt3-size` x
 * `3-size`. It draws EVERY hex whose outline touches the tile - the four corners plus the centre -
 * not just the two of the fundamental domain: the pattern clips each tile, and an edge shared by two
 * corner hexes would be clipped away by BOTH owners, leaving a gap. Drawing all five means every edge
 * that falls inside the tile is drawn by some hex; the overlapping strokes coincide.
 */
export function hexTile(size: number): HexTile {
   const width = SQRT3 * size;
   const height = 3 * size;
   const centers: [number, number][] = [
      [width / 2, height / 2],
      [0, 0],
      [width, 0],
      [0, height],
      [width, height],
   ];
   const path = centers.map(([cx, cy]) => polygonPath(hexVertices(cx, cy, size))).join(' ');
   return { width, height, path };
}
