/**
 * Pure geometry contracts for the simulator. Coordinates use integer world units:
 * one unit is 0.1 mm, so one inch is exactly 254 units.  Angles are expressed in
 * degrees and are deliberately separate from spatial world units.
 */
export const WORLD_UNITS_PER_INCH = 254;

export interface Point2 {
  readonly x: number;
  readonly y: number;
}

export interface Point3 extends Point2 {
  readonly z: number;
}

export interface Aabb {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface CircleFootprint {
  readonly kind: 'circle';
  readonly center: Point2;
  readonly radius: number;
}

/**
 * A stadium/capsule. `length` is the distance between the centres of its two
 * semicircular caps, not the overall end-to-end length.
 */
export interface CapsuleFootprint {
  readonly kind: 'capsule';
  readonly center: Point2;
  readonly radius: number;
  readonly length: number;
  readonly orientationDegrees: number;
}

/** Vertices must describe a convex, non-self-intersecting polygon in world space. */
export interface ConvexPolygonFootprint {
  readonly kind: 'convex-polygon';
  readonly vertices: readonly Point2[];
}

/**
 * A convex polygon authored in local coordinates, then placed and rotated by a
 * pose. It exists because absolute vertices cannot retain their orientation when
 * moved. `vertices` must be convex and have an origin meaningful to the profile.
 */
export interface OrientedConvexPolygonFootprint {
  readonly kind: 'oriented-convex-polygon';
  readonly center: Point2;
  readonly orientationDegrees: number;
  readonly vertices: readonly Point2[];
}

export type Footprint = CircleFootprint | CapsuleFootprint | ConvexPolygonFootprint | OrientedConvexPolygonFootprint;

export interface IdentifiedFootprint {
  readonly id: string;
  readonly footprint: Footprint;
}

export interface Segment2 {
  readonly start: Point2;
  readonly end: Point2;
}

/** A simple filled polygon with zero or more simple holes. Rings are not closed. */
export interface PolygonArea {
  readonly outer: readonly Point2[];
  readonly holes?: readonly (readonly Point2[])[];
}

/** Disjoint filled areas.  An empty collection is rejected at the API boundary. */
export interface MultiPolygonArea {
  readonly polygons: readonly PolygonArea[];
}

export interface OcclusionBand {
  readonly minZ: number;
  readonly maxZ: number;
}

/** Legacy single-convex-prism form, retained for existing callers. */
export interface ExtrudedPolygonBlocker {
  readonly id: string;
  readonly footprint: ConvexPolygonFootprint;
  readonly minZ: number;
  readonly maxZ: number;
}

/**
 * Terrain volume with a multipolygon horizontal footprint. Empty bands mean the
 * complete [minZ, maxZ] volume occludes; otherwise only the explicit bands do.
 */
export interface ExtrudedTerrainBlocker {
  readonly id: string;
  readonly footprint: MultiPolygonArea;
  readonly minZ: number;
  readonly maxZ: number;
  readonly occlusionBands?: readonly OcclusionBand[];
}

export type TerrainBlocker = ExtrudedPolygonBlocker | ExtrudedTerrainBlocker;

/** A translation pose. Rotation must remain fixed through every swept segment. */
export interface MovementPose {
  readonly position: Point2;
  readonly orientationDegrees?: number;
}

export type ContactClassification = 'separated' | 'touching' | 'overlapping';

/** Exact narrow-phase classification and edge-to-edge separation in world units. */
export interface ContactEvidence {
  readonly classification: ContactClassification;
  readonly distance: number;
  readonly leftKind: Footprint['kind'];
  readonly rightKind: Footprint['kind'];
}

export interface BoardContainmentEvidence {
  readonly classification: 'inside' | 'touching-boundary' | 'outside';
  readonly bounds: Aabb;
  readonly crossedEdges: readonly ('left' | 'right' | 'bottom' | 'top')[];
}
