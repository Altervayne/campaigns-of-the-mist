// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { hexTile } from './hexGrid';

/*
 * Tests for the honeycomb pattern geometry. These pin the fundamental-domain size and the
 * seamless-tiling property: the two hexagons in a tile must share an edge, so the hive reads as
 * one continuous mesh rather than a grid of disconnected cells.
 */

const SQRT3 = Math.sqrt(3);

/** Parses an SVG path fragment into its coordinate pairs (both `M` and `L` commands). */
function pathPoints(path: string): [number, number][] {
   return [...path.matchAll(/[ML](-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])]);
}

/** Whether `points` contains a pair equal (within rounding) to `(x, y)`. */
function hasPoint(points: [number, number][], x: number, y: number): boolean {
   return points.some(([px, py]) => Math.abs(px - x) < 1e-3 && Math.abs(py - y) < 1e-3);
}

describe('hexTile', () => {
   it('sizes the fundamental domain as √3·size by 3·size', () => {
      const tile = hexTile(10);
      expect(tile.width).toBeCloseTo(SQRT3 * 10, 5);
      expect(tile.height).toBe(30);
   });

   it('emits the five hexes that touch the tile (four corners + centre)', () => {
      const tile = hexTile(10);
      // Every hex whose outline crosses the tile is drawn, so clipping can't strip an edge shared by two
      // corner hexes: the four corners + the centre.
      expect(tile.path.match(/Z/g)).toHaveLength(5);
      expect(tile.path.match(/M/g)).toHaveLength(5);
      // Six vertices per hexagon.
      expect(pathPoints(tile.path)).toHaveLength(30);
   });

   it('draws a hex on every corner so boundary edges are covered', () => {
      const size = 10;
      const tile = hexTile(size);
      const points = pathPoints(tile.path);
      // Each corner hex's outermost vertex (its top/bottom point, off the tile) - unique to that hex, so it
      // proves the hex is drawn rather than coinciding with the centre hex.
      expect(hasPoint(points, 0, -size)).toBe(true);                        // (0,0) top
      expect(hasPoint(points, tile.width, -size)).toBe(true);               // (width,0) top
      expect(hasPoint(points, 0, tile.height + size)).toBe(true);           // (0,height) bottom
      expect(hasPoint(points, tile.width, tile.height + size)).toBe(true);  // (width,height) bottom
   });

   it('places the centered hexagon at the tile center with the right vertices', () => {
      const size = 10;
      const tile = hexTile(size);
      const points = pathPoints(tile.path);
      const half = (SQRT3 * size) / 2;
      // Center is (width/2, height/2) = (half, 1.5-size); check the top and an upper-right vertex.
      expect(hasPoint(points, half, 0.5 * size)).toBe(true); // top: (half, 5)
      expect(hasPoint(points, tile.width, size)).toBe(true); // upper-right: (width, 10)
   });

   it('shares an edge between the centered and corner hexagons so the mesh is seamless', () => {
      const size = 10;
      const tile = hexTile(size);
      const points = pathPoints(tile.path);
      const half = (SQRT3 * size) / 2;
      // The centered hex's top vertex and the corner hex's lower-right vertex coincide at (half, size/2),
      // and the centered upper-left meets the corner bottom at (0, size): a shared edge, not a gap.
      expect(hasPoint(points, half, size / 2)).toBe(true);
      expect(hasPoint(points, 0, size)).toBe(true);
   });

   it('scales linearly with size', () => {
      expect(hexTile(20).width).toBeCloseTo(2 * hexTile(10).width, 5);
      expect(hexTile(20).height).toBe(2 * hexTile(10).height);
   });
});
