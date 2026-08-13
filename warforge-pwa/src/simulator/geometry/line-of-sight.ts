import {
  GEOMETRY_EPSILON,
  validateConvexPolygon,
  validateInteger,
  validateMultiPolygonArea,
  validatePoint3
} from './primitives';
import type {
  ExtrudedPolygonBlocker,
  MultiPolygonArea,
  Point2,
  Point3,
  PolygonArea,
  Segment2,
  TerrainBlocker
} from './types';

export interface LineOfSightRay {
  readonly from: Point3;
  readonly to: Point3;
}

export interface LineOfSightBlockerHit {
  readonly blockerId: string;
  /** Explicit band index for terrain blockers; undefined means a legacy full prism. */
  readonly occlusionBandIndex?: number;
  /** Segment parameter at which the ray enters the blocking volume, from 0 through 1. */
  readonly enterT: number;
  /** Segment parameter at which the ray leaves the blocking volume, from 0 through 1. */
  readonly exitT: number;
  readonly enterPoint: Point3;
  readonly exitPoint: Point3;
}

export interface LineOfSightResult {
  readonly visible: boolean;
  readonly reason: 'clear' | 'blocked' | 'degenerate';
  readonly ray: LineOfSightRay;
  readonly blockerHits: readonly LineOfSightBlockerHit[];
  readonly firstBlocker?: LineOfSightBlockerHit;
}

export interface LineOfSightOptions {
  readonly excludedBlockerIds?: readonly string[];
}

export interface MultiRayLineOfSightResult {
  readonly visible: boolean;
  readonly reason: 'clear' | 'blocked' | 'degenerate';
  readonly rayResults: readonly LineOfSightResult[];
  /** The first clear ray in caller-provided deterministic order, when one exists. */
  readonly clearRay?: LineOfSightResult;
}

/**
 * Tests an exact finite 3D sight ray against 2.5D terrain. Multipolygons,
 * holes and explicit occlusion bands are all evaluated as finite intervals so
 * the UI can explain the exact ray and volume that produced the verdict.
 */
export function evaluateLineOfSight(
  ray: LineOfSightRay,
  blockers: readonly TerrainBlocker[],
  options: LineOfSightOptions = {}
): LineOfSightResult {
  validateRay(ray);
  if (samePoint(ray.from, ray.to)) return { visible: false, reason: 'degenerate', ray, blockerHits: [] };
  const excluded = new Set(options.excludedBlockerIds ?? []);
  const blockerHits = blockers
    .filter((blocker) => !excluded.has(blocker.id))
    .flatMap((blocker) => lineTerrainHits(ray, blocker))
    .sort((left, right) => left.enterT - right.enterT || compareIds(left.blockerId, right.blockerId) || (left.occlusionBandIndex ?? -1) - (right.occlusionBandIndex ?? -1));
  const firstBlocker = blockerHits[0];
  return firstBlocker
    ? { visible: false, reason: 'blocked', ray, blockerHits, firstBlocker }
    : { visible: true, reason: 'clear', ray, blockerHits };
}

/** A target is visible when at least one valid normalized ray is clear. */
export function evaluateLineOfSightRays(
  rays: readonly LineOfSightRay[],
  blockers: readonly TerrainBlocker[],
  options: LineOfSightOptions = {}
): MultiRayLineOfSightResult {
  const rayResults = rays.map((ray) => evaluateLineOfSight(ray, blockers, options));
  const clearRay = rayResults.find((result) => result.visible);
  if (clearRay) return { visible: true, reason: 'clear', rayResults, clearRay };
  const reason = rayResults.length === 0 || rayResults.every((result) => result.reason === 'degenerate') ? 'degenerate' : 'blocked';
  return { visible: false, reason, rayResults };
}

/** Exposed to make interval reasoning testable without a rendering layer. */
export function lineMultiPolygonIntervals(ray: LineOfSightRay, area: MultiPolygonArea): readonly (readonly [number, number])[] {
  validateRay(ray);
  validateMultiPolygonArea(area);
  const dx = ray.to.x - ray.from.x;
  const dy = ray.to.y - ray.from.y;
  if (Math.abs(dx) <= GEOMETRY_EPSILON && Math.abs(dy) <= GEOMETRY_EPSILON) {
    return pointInMultiPolygonRaw(ray.from, area) ? [[0, 1]] : [];
  }
  const parameters = [0, 1];
  for (const polygon of area.polygons) {
    for (const ring of [polygon.outer, ...(polygon.holes ?? [])]) {
      for (const edge of ringEdgesRaw(ring)) parameters.push(...lineSegmentParameters(ray, edge));
    }
  }
  const sorted = uniqueSortedUnit(parameters);
  const intervals: Array<readonly [number, number]> = [];
  for (const parameter of sorted) {
    if (pointInMultiPolygonRaw(pointOnRay(ray, parameter), area)) intervals.push([parameter, parameter]);
  }
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index];
    const end = sorted[index + 1];
    if (end - start <= GEOMETRY_EPSILON) continue;
    if (pointInMultiPolygonRaw(pointOnRay(ray, (start + end) / 2), area)) intervals.push([start, end]);
  }
  return mergeIntervals(intervals);
}

function lineTerrainHits(ray: LineOfSightRay, blocker: TerrainBlocker): LineOfSightBlockerHit[] {
  const terrain = normaliseBlocker(blocker);
  const horizontalIntervals = lineMultiPolygonIntervals(ray, terrain.area);
  const hits: LineOfSightBlockerHit[] = [];
  for (const horizontal of horizontalIntervals) {
    for (const band of terrain.bands) {
      const vertical = lineVerticalInterval(ray, band.minZ, band.maxZ);
      if (!vertical) continue;
      const enterT = Math.max(horizontal[0], vertical[0]);
      const exitT = Math.min(horizontal[1], vertical[1]);
      if (enterT <= exitT + GEOMETRY_EPSILON) {
        hits.push({
          blockerId: terrain.id,
          ...(band.index === undefined ? {} : { occlusionBandIndex: band.index }),
          enterT: clampUnit(enterT),
          exitT: clampUnit(exitT),
          enterPoint: pointOnRay(ray, clampUnit(enterT)),
          exitPoint: pointOnRay(ray, clampUnit(exitT))
        });
      }
    }
  }
  return hits;
}

function normaliseBlocker(blocker: TerrainBlocker): {
  readonly id: string;
  readonly area: MultiPolygonArea;
  readonly bands: readonly { readonly minZ: number; readonly maxZ: number; readonly index?: number }[];
} {
  if (!blocker.id.trim()) throw new Error('Line-of-sight blocker ids must be non-empty.');
  validateInteger(blocker.minZ, `Blocker '${blocker.id}'.minZ`);
  validateInteger(blocker.maxZ, `Blocker '${blocker.id}'.maxZ`);
  if (blocker.minZ > blocker.maxZ) throw new Error(`Blocker '${blocker.id}' has an invalid vertical range.`);
  if (isLegacyBlocker(blocker)) {
    validateConvexPolygon(blocker.footprint);
    return {
      id: blocker.id,
      area: { polygons: [{ outer: blocker.footprint.vertices }] },
      bands: [{ minZ: blocker.minZ, maxZ: blocker.maxZ }]
    };
  }
  validateMultiPolygonArea(blocker.footprint);
  const bands = blocker.occlusionBands ?? [];
  const normalisedBands = bands.length === 0
    ? [{ minZ: blocker.minZ, maxZ: blocker.maxZ }]
    : bands.map((band, index) => {
      validateInteger(band.minZ, `Blocker '${blocker.id}' occlusion band ${index}.minZ`);
      validateInteger(band.maxZ, `Blocker '${blocker.id}' occlusion band ${index}.maxZ`);
      if (band.minZ > band.maxZ || band.minZ < blocker.minZ || band.maxZ > blocker.maxZ) {
        throw new Error(`Blocker '${blocker.id}' has an occlusion band outside its volume.`);
      }
      return { minZ: band.minZ, maxZ: band.maxZ, index };
    });
  return { id: blocker.id, area: blocker.footprint, bands: normalisedBands };
}

function isLegacyBlocker(blocker: TerrainBlocker): blocker is ExtrudedPolygonBlocker {
  return 'kind' in blocker.footprint && blocker.footprint.kind === 'convex-polygon';
}

function lineVerticalInterval(ray: LineOfSightRay, minZ: number, maxZ: number): readonly [number, number] | undefined {
  const dz = ray.to.z - ray.from.z;
  if (Math.abs(dz) <= GEOMETRY_EPSILON) return ray.from.z >= minZ - GEOMETRY_EPSILON && ray.from.z <= maxZ + GEOMETRY_EPSILON ? [0, 1] : undefined;
  const first = (minZ - ray.from.z) / dz;
  const second = (maxZ - ray.from.z) / dz;
  const enter = Math.max(0, Math.min(first, second));
  const exit = Math.min(1, Math.max(first, second));
  return enter <= exit + GEOMETRY_EPSILON ? [enter, exit] : undefined;
}

function lineSegmentParameters(ray: LineOfSightRay, edge: Segment2): number[] {
  const rx = ray.to.x - ray.from.x;
  const ry = ray.to.y - ray.from.y;
  const sx = edge.end.x - edge.start.x;
  const sy = edge.end.y - edge.start.y;
  const qpx = edge.start.x - ray.from.x;
  const qpy = edge.start.y - ray.from.y;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) <= GEOMETRY_EPSILON) {
    if (Math.abs(qpx * ry - qpy * rx) > GEOMETRY_EPSILON) return [];
    const lengthSquared = rx * rx + ry * ry;
    return [
      ((edge.start.x - ray.from.x) * rx + (edge.start.y - ray.from.y) * ry) / lengthSquared,
      ((edge.end.x - ray.from.x) * rx + (edge.end.y - ray.from.y) * ry) / lengthSquared
    ].filter((parameter) => parameter >= -GEOMETRY_EPSILON && parameter <= 1 + GEOMETRY_EPSILON).map(clampUnit);
  }
  const t = (qpx * sy - qpy * sx) / denominator;
  const u = (qpx * ry - qpy * rx) / denominator;
  return t >= -GEOMETRY_EPSILON && t <= 1 + GEOMETRY_EPSILON && u >= -GEOMETRY_EPSILON && u <= 1 + GEOMETRY_EPSILON ? [clampUnit(t)] : [];
}

function pointInMultiPolygonRaw(point: Point2, area: MultiPolygonArea): boolean {
  return area.polygons.some((polygon) => pointInPolygonRaw(point, polygon));
}

function pointInPolygonRaw(point: Point2, area: PolygonArea): boolean {
  if (!pointInRingInclusiveRaw(point, area.outer)) return false;
  return !(area.holes ?? []).some((hole) => pointInRingStrictRaw(point, hole));
}

function pointInRingInclusiveRaw(point: Point2, ring: readonly Point2[]): boolean {
  return ringEdgesRaw(ring).some((edge) => isPointOnSegmentRaw(point, edge)) || pointInRingStrictRaw(point, ring);
}

function pointInRingStrictRaw(point: Point2, ring: readonly Point2[]): boolean {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current, current += 1) {
    const start = ring[current];
    const end = ring[previous];
    const crosses = (start.y > point.y) !== (end.y > point.y);
    if (crosses && point.x < (end.x - start.x) * (point.y - start.y) / (end.y - start.y) + start.x - GEOMETRY_EPSILON) inside = !inside;
  }
  return inside;
}

function ringEdgesRaw(ring: readonly Point2[]): Segment2[] {
  return ring.map((start, index) => ({ start, end: ring[(index + 1) % ring.length] }));
}

function isPointOnSegmentRaw(point: Point2, segment: Segment2): boolean {
  const cross = (segment.end.x - segment.start.x) * (point.y - segment.start.y) - (segment.end.y - segment.start.y) * (point.x - segment.start.x);
  if (Math.abs(cross) > GEOMETRY_EPSILON) return false;
  return point.x >= Math.min(segment.start.x, segment.end.x) - GEOMETRY_EPSILON
    && point.x <= Math.max(segment.start.x, segment.end.x) + GEOMETRY_EPSILON
    && point.y >= Math.min(segment.start.y, segment.end.y) - GEOMETRY_EPSILON
    && point.y <= Math.max(segment.start.y, segment.end.y) + GEOMETRY_EPSILON;
}

function uniqueSortedUnit(values: readonly number[]): number[] {
  return values
    .filter((value) => Number.isFinite(value) && value >= -GEOMETRY_EPSILON && value <= 1 + GEOMETRY_EPSILON)
    .map(clampUnit)
    .sort((left, right) => left - right)
    .filter((value, index, sorted) => index === 0 || Math.abs(value - sorted[index - 1]) > GEOMETRY_EPSILON);
}

function mergeIntervals(intervals: readonly (readonly [number, number])[]): readonly (readonly [number, number])[] {
  const merged: Array<[number, number]> = [];
  for (const [start, end] of [...intervals].sort((left, right) => left[0] - right[0] || left[1] - right[1])) {
    const previous = merged[merged.length - 1];
    if (previous && start <= previous[1] + GEOMETRY_EPSILON) previous[1] = Math.max(previous[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

function pointOnRay(ray: LineOfSightRay, t: number): Point3 {
  return {
    x: ray.from.x + (ray.to.x - ray.from.x) * t,
    y: ray.from.y + (ray.to.y - ray.from.y) * t,
    z: ray.from.z + (ray.to.z - ray.from.z) * t
  };
}

function validateRay(ray: LineOfSightRay): void {
  validatePoint3(ray.from, 'ray.from');
  validatePoint3(ray.to, 'ray.to');
}

function samePoint(left: Point3, right: Point3): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
