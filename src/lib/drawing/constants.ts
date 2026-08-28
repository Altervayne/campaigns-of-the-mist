/*
 * The drawing engine's tunable constants: default ink sizing, the brush nib's shape, and the geometry
 * resolutions. Kept apart from the path/geometry/paint helpers so a surface can read one without pulling
 * the rest.
 */

/** A fresh stroke's width, in world px (ink scales with the board). The single shared size across brushes. */
export const DEFAULT_STROKE_WIDTH = 3;

/** The highlighter's ink opacity (plain alpha, so it reads translucent on any board theme). */
export const HIGHLIGHTER_OPACITY = 0.4;

/** The eraser's hit tolerance in world px, added to half a stroke's width to form its reach. */
export const ERASER_RADIUS = 8;

/**
 * The broad-nib edge angle for the `brush` brush, in radians. Held a touch off 45deg so axis-aligned
 * strokes (horizontal vs vertical) still differ in weight - a true 45deg nib makes them identical. Tunable.
 */
export const NIB_ANGLE = (40 * Math.PI) / 180;

/** The `brush` brush's thinnest width, as a fraction of its base width (a stroke run along the nib edge). Tunable. */
export const BRUSH_MIN_WIDTH_FACTOR = 0.2;

/** Half-window (in points) for averaging the brush ribbon's heading + width, so raw pointer noise doesn't serrate the edge. Tunable. */
export const BRUSH_SMOOTH_WINDOW = 2;

/** Ring resolution for a brush-outlined / hit-tested ellipse: the vertex count sampled around the curve. */
export const SHAPE_ELLIPSE_SEGMENTS = 48;

/** The shortest a Line may be, in world px: a shorter one is a click with no real drag, dropped as a stray dot. */
export const MIN_LINE_LENGTH = 3;
