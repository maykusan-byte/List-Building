import type {
  Aabb,
  CapsuleFootprint,
  CircleFootprint,
  ContactClassification,
  ContactEvidence,
  ConvexPolygonFootprint,
  Footprint,
  MultiPolygonArea,
  OrientedConvexPolygonFootprint,
  Point2,
  PolygonArea,
  Segment2
} from './types';

/** Only used for derived floating-point calculations (rotations, roots and ray intersections). */
export const GEOMETRY_EPSILON = 1e-9;

type CoreShape =
  | { readonly kind: 'point'; readonly points: readonly [Point2] }
  | { readonly kind: 'segment'; readonly points: readonly [Point2, Point2] }
  | { readonly kind: 'polygon'; readonly points: readonly Point2[] };

export function validateInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer world-unit value.`);
}

export function validatePoint(point: Point2, label = 'Point'): void {
  validateInteger(point.x, `${label}.x`);
  validateInteger(point.y, `${label}.y`);
}

export function validatePoint3(point: { readonly x: number; readonly y: number; readonly z: number }, label = 'Point'): void {
  validatePoint(point, label);
  validateInteger(point.z, `${label}.z`);
}

export function validateAabb(bounds: Aabb, label = 'Bounds'): void {
  validateInteger(bounds.minX, `${label}.minX`);
  validateInteger(bounds.minY, `${label}.minY`);
  validateInteger(bounds.maxX, `${label}.maxX`);
  validateInteger(bounds.maxY, `${label}.maxY`);
  if (bounds.minX > bounds.maxX || bounds.minY > bounds.maxY) throw new Error(`${label} must be ordered.`);
}

export function validateOrientation(orientationDegrees: number, label = 'orientationDegrees'): void {
  if (!Number.isFinite(orientationDegrees) || orientationDegrees < 0 || orientationDegrees >= 360) {
    throw new Error(`${label} must be a finite angle in [0, 360).`);
  }
}

export function distanceBetweenPoints(left: Point2, right: Point2): number {
  validatePoint(left, 'left');
  validatePoint(right, 'right');
  return distanceRaw(left, right);
}

export function squaredDistanceBetweenPoints(left: Point2, right: Point2): number {
  validatePoint(left, 'left');
  validatePoint(right, 'right');
  return squaredDistanceRaw(left, right);
}

export function crossProduct(origin: Point2, first: Point2, second: Point2): number {
  validatePoint(origin, 'origin');
  validatePoint(first, 'first');
  validatePoint(second, 'second');
  return crossRaw(origin, first, second);
}

export function dotProduct(left: Point2, right: Point2): number {
  validatePoint(left, 'left');
  validatePoint(right, 'right');
  return left.x * right.x + left.y * right.y;
}

export function polygonSignedArea(polygon: ConvexPolygonFootprint): number {
  validateConvexPolygon(polygon);
  return signedAreaRaw(polygon.vertices);
}

export function isPointOnSegment(point: Point2, segment: Segment2, epsilon = GEOMETRY_EPSILON): boolean {
  validatePoint(point, 'point');
  validateSegment(segment);
  validateEpsilon(epsilon);
  return isPointOnSegmentRaw(point, segment, epsilon);
}

export function distancePointToSegment(point: Point2, segment: Segment2): number {
  validatePoint(point, 'point');
  validateSegment(segment);
  return distancePointToSegmentRaw(point, segment);
}

export function segmentsIntersect(left: Segment2, right: Segment2): boolean {
  validateSegment(left, 'left segment');
  validateSegment(right, 'right segment');
  return segmentsIntersectRaw(left, right);
}

export function distanceBetweenSegments(left: Segment2, right: Segment2): number {
  validateSegment(left, 'left segment');
  validateSegment(right, 'right segment');
  return distanceBetweenSegmentsRaw(left, right);
}

export function pointInConvexPolygon(point: Point2, polygon: ConvexPolygonFootprint, epsilon = GEOMETRY_EPSILON): boolean {
  validatePoint(point, 'point');
  validateConvexPolygon(polygon);
  validateEpsilon(epsilon);
  return pointInConvexPolygonRaw(point, polygon.vertices, epsilon);
}

/** Boundary points are included, so callers can expose an explainable contact. */
export function pointInPolygonArea(point: Point2, area: PolygonArea, epsilon = GEOMETRY_EPSILON): boolean {
  validatePoint(point, 'point');
  validatePolygonArea(area);
  validateEpsilon(epsilon);
  if (!pointInRingInclusive(point, area.outer, epsilon)) return false;
  return !(area.holes ?? []).some((hole) => pointInRingStrict(point, hole, epsilon));
}

/** Boundary points are included. Areas are combined by a stable caller-owned order. */
export function pointInMultiPolygonArea(point: Point2, area: MultiPolygonArea, epsilon = GEOMETRY_EPSILON): boolean {
  validatePoint(point, 'point');
  validateMultiPolygonArea(area);
  validateEpsilon(epsilon);
  return area.polygons.some((polygon) => pointInPolygonArea(point, polygon, epsilon));
}

export function circleIntersectsCircle(left: CircleFootprint, right: CircleFootprint): boolean {
  return classifyFootprintContact(left, right).classification !== 'separated';
}

export function circleIntersectsConvexPolygon(circle: CircleFootprint, polygon: ConvexPolygonFootprint): boolean {
  return classifyFootprintContact(circle, polygon).classification !== 'separated';
}

/** SAT overlap test. Touching boundaries count as overlap for legacy callers. */
export function convexPolygonsOverlap(left: ConvexPolygonFootprint, right: ConvexPolygonFootprint): boolean {
  validateConvexPolygon(left);
  validateConvexPolygon(right);
  return convexPolygonsTouchOrOverlap(left.vertices, right.vertices);
}

/**
 * Distinguishes positive-area overlap from a boundary touch.  Zero-radius
 * profiles are lower-dimensional and therefore can only report a touch.
 */
export function classifyFootprintContact(left: Footprint, right: Footprint): ContactEvidence {
  validateFootprint(left);
  validateFootprint(right);
  const leftCore = footprintCore(left);
  const rightCore = footprintCore(right);
  const rawGap = distanceBetweenCores(leftCore, rightCore) - footprintRadius(left) - footprintRadius(right);
  const distance = Math.max(0, rawGap);
  const classification: ContactClassification = rawGap > GEOMETRY_EPSILON
    ? 'separated'
    : coresHavePositiveAreaOverlap(leftCore, rightCore)
      ? 'overlapping'
      : rawGap < -GEOMETRY_EPSILON && footprintHasInterior(left) && footprintHasInterior(right)
        ? 'overlapping'
        : 'touching';
  return { classification, distance, leftKind: left.kind, rightKind: right.kind };
}

export function footprintDistance(left: Footprint, right: Footprint): number {
  return classifyFootprintContact(left, right).distance;
}

export function footprintBounds(footprint: Footprint): Aabb {
  validateFootprint(footprint);
  if (footprint.kind === 'circle') {
    return {
      minX: footprint.center.x - footprint.radius,
      minY: footprint.center.y - footprint.radius,
      maxX: footprint.center.x + footprint.radius,
      maxY: footprint.center.y + footprint.radius
    };
  }
  if (footprint.kind === 'capsule') {
    const axis = capsuleAxis(footprint);
    return boundsForPoints([axis.start, axis.end], footprint.radius);
  }
  return boundsForPoints(worldPolygonVertices(footprint));
}

export function polygonEdges(polygon: ConvexPolygonFootprint): Segment2[] {
  validateConvexPolygon(polygon);
  return polygon.vertices.map((start, index) => ({ start, end: polygon.vertices[(index + 1) % polygon.vertices.length] }));
}

export function polygonAreaEdges(area: PolygonArea): Segment2[] {
  validatePolygonArea(area);
  return [area.outer, ...(area.holes ?? [])].flatMap((ring) => ringEdgesRaw(ring));
}

export function validateCircle(circle: CircleFootprint): void {
  validatePoint(circle.center, 'circle.center');
  validateInteger(circle.radius, 'circle.radius');
  if (circle.radius < 0) throw new Error('A circle footprint requires a non-negative radius.');
}

export function validateCapsule(capsule: CapsuleFootprint): void {
  validatePoint(capsule.center, 'capsule.center');
  validateInteger(capsule.radius, 'capsule.radius');
  validateInteger(capsule.length, 'capsule.length');
  validateOrientation(capsule.orientationDegrees, 'capsule.orientationDegrees');
  if (capsule.radius < 0 || capsule.length < 0) throw new Error('A capsule footprint requires non-negative radius and length.');
}

export function validateConvexPolygon(polygon: ConvexPolygonFootprint): void {
  validateRing(polygon.vertices, 'Convex polygon');
  const area = signedAreaRaw(polygon.vertices);
  if (Math.abs(area) <= GEOMETRY_EPSILON) throw new Error('A convex polygon cannot have zero area.');
  const orientation = area > 0 ? 1 : -1;
  for (let index = 0; index < polygon.vertices.length; index += 1) {
    const first = polygon.vertices[index];
    const second = polygon.vertices[(index + 1) % polygon.vertices.length];
    const third = polygon.vertices[(index + 2) % polygon.vertices.length];
    if (orientation * crossRaw(first, second, third) < -GEOMETRY_EPSILON) {
      throw new Error('Polygon vertices must form a convex polygon in winding order.');
    }
  }
}

export function validateOrientedConvexPolygon(polygon: OrientedConvexPolygonFootprint): void {
  validatePoint(polygon.center, 'oriented polygon.center');
  validateOrientation(polygon.orientationDegrees, 'oriented polygon.orientationDegrees');
  validateConvexPolygon({ kind: 'convex-polygon', vertices: polygon.vertices });
}

export function validateFootprint(footprint: Footprint): void {
  switch (footprint.kind) {
    case 'circle': validateCircle(footprint); break;
    case 'capsule': validateCapsule(footprint); break;
    case 'convex-polygon': validateConvexPolygon(footprint); break;
    case 'oriented-convex-polygon': validateOrientedConvexPolygon(footprint); break;
    default: throw new Error('Unsupported footprint.');
  }
}

export function validatePolygonArea(area: PolygonArea): void {
  validateRing(area.outer, 'Polygon outer ring');
  const holes = area.holes ?? [];
  for (const [index, hole] of holes.entries()) {
    validateRing(hole, `Polygon hole ${index}`);
    if (hole.some((point) => !pointInRingStrict(point, area.outer))) throw new Error(`Polygon hole ${index} must be strictly inside the outer ring.`);
    if (ringsIntersect(hole, area.outer)) throw new Error(`Polygon hole ${index} must not touch the outer ring.`);
  }
  for (let left = 0; left < holes.length; left += 1) {
    for (let right = left + 1; right < holes.length; right += 1) {
      if (ringsIntersect(holes[left], holes[right]) || pointInRingInclusive(holes[left][0], holes[right]) || pointInRingInclusive(holes[right][0], holes[left])) {
        throw new Error('Polygon holes must be disjoint.');
      }
    }
  }
}

export function validateMultiPolygonArea(area: MultiPolygonArea): void {
  if (area.polygons.length === 0) throw new Error('A multipolygon area requires at least one polygon.');
  area.polygons.forEach(validatePolygonArea);
  for (let left = 0; left < area.polygons.length; left += 1) {
    for (let right = left + 1; right < area.polygons.length; right += 1) {
      if (polygonAreaInteriorsOverlap(area.polygons[left], area.polygons[right])) {
        throw new Error('Multipolygon component interiors must be disjoint; boundary contact is allowed.');
      }
    }
  }
}

/** Returns the physical capsule axis in world coordinates. */
export function capsuleAxis(capsule: CapsuleFootprint): Segment2 {
  validateCapsule(capsule);
  const radians = capsule.orientationDegrees * Math.PI / 180;
  const offsetX = Math.cos(radians) * capsule.length / 2;
  const offsetY = Math.sin(radians) * capsule.length / 2;
  return {
    start: { x: capsule.center.x - offsetX, y: capsule.center.y - offsetY },
    end: { x: capsule.center.x + offsetX, y: capsule.center.y + offsetY }
  };
}

/** Resolves an oriented profile into derived world-space vertices. */
export function worldPolygonVertices(polygon: ConvexPolygonFootprint | OrientedConvexPolygonFootprint): readonly Point2[] {
  if (polygon.kind === 'convex-polygon') {
    validateConvexPolygon(polygon);
    return polygon.vertices;
  }
  validateOrientedConvexPolygon(polygon);
  const radians = polygon.orientationDegrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return polygon.vertices.map((vertex) => ({
    x: polygon.center.x + vertex.x * cosine - vertex.y * sine,
    y: polygon.center.y + vertex.x * sine + vertex.y * cosine
  }));
}

/** Stable centre used when translating an absolute convex polygon. */
export function convexPolygonCentre(polygon: ConvexPolygonFootprint): Point2 {
  validateConvexPolygon(polygon);
  const signedArea = signedAreaRaw(polygon.vertices);
  let twiceCrossWeightedX = 0;
  let twiceCrossWeightedY = 0;
  for (let index = 0; index < polygon.vertices.length; index += 1) {
    const current = polygon.vertices[index];
    const next = polygon.vertices[(index + 1) % polygon.vertices.length];
    const cross = current.x * next.y - next.x * current.y;
    twiceCrossWeightedX += (current.x + next.x) * cross;
    twiceCrossWeightedY += (current.y + next.y) * cross;
  }
  return { x: twiceCrossWeightedX / (6 * signedArea), y: twiceCrossWeightedY / (6 * signedArea) };
}

/** Internal algebra exposed for deterministic swept collision construction. */
export function convexHull(points: readonly Point2[]): readonly Point2[] {
  if (points.length === 0) throw new Error('A convex hull requires at least one point.');
  const unique = [...new Map(points.map((point) => [`${point.x},${point.y}`, point])).values()]
    .sort((left, right) => left.x - right.x || left.y - right.y);
  if (unique.length <= 2) return unique;
  const cross = (origin: Point2, first: Point2, second: Point2) => crossRaw(origin, first, second);
  const lower: Point2[] = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= GEOMETRY_EPSILON) lower.pop();
    lower.push(point);
  }
  const upper: Point2[] = [];
  for (const point of unique.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= GEOMETRY_EPSILON) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

export function footprintCoreVertices(footprint: Footprint): readonly Point2[] {
  validateFootprint(footprint);
  return footprintCore(footprint).points;
}

export function footprintRadius(footprint: Footprint): number {
  return footprint.kind === 'circle' || footprint.kind === 'capsule' ? footprint.radius : 0;
}

function footprintCore(footprint: Footprint): CoreShape {
  if (footprint.kind === 'circle') return { kind: 'point', points: [footprint.center] };
  if (footprint.kind === 'capsule') {
    const axis = capsuleAxis(footprint);
    return { kind: 'segment', points: [axis.start, axis.end] };
  }
  return { kind: 'polygon', points: worldPolygonVertices(footprint) };
}

function distanceBetweenCores(left: CoreShape, right: CoreShape): number {
  if (left.kind === 'point' && right.kind === 'point') return distanceRaw(left.points[0], right.points[0]);
  if (left.kind === 'point') {
    if (right.kind === 'segment') return distancePointToSegmentRaw(left.points[0], segmentFromPoints(right.points));
    return pointInConvexPolygonRaw(left.points[0], right.points) ? 0 : Math.min(...ringEdgesRaw(right.points).map((edge) => distancePointToSegmentRaw(left.points[0], edge)));
  }
  if (right.kind === 'point') {
    if (left.kind === 'segment') return distancePointToSegmentRaw(right.points[0], segmentFromPoints(left.points));
    return pointInConvexPolygonRaw(right.points[0], left.points) ? 0 : Math.min(...ringEdgesRaw(left.points).map((edge) => distancePointToSegmentRaw(right.points[0], edge)));
  }
  if (left.kind === 'segment' && right.kind === 'segment') return distanceBetweenSegmentsRaw(segmentFromPoints(left.points), segmentFromPoints(right.points));
  if (left.kind === 'segment' && right.kind === 'polygon') return distanceSegmentToPolygon(segmentFromPoints(left.points), right.points);
  if (left.kind === 'polygon' && right.kind === 'segment') return distanceSegmentToPolygon(segmentFromPoints(right.points), left.points);
  if (convexPolygonsTouchOrOverlap(left.points, right.points)) return 0;
  let distance = Number.POSITIVE_INFINITY;
  for (const leftEdge of ringEdgesRaw(left.points)) for (const rightEdge of ringEdgesRaw(right.points)) distance = Math.min(distance, distanceBetweenSegmentsRaw(leftEdge, rightEdge));
  return distance;
}

function distanceSegmentToPolygon(segment: Segment2, polygon: readonly Point2[]): number {
  if (pointInConvexPolygonRaw(segment.start, polygon) || pointInConvexPolygonRaw(segment.end, polygon)) return 0;
  const edges = ringEdgesRaw(polygon);
  if (edges.some((edge) => segmentsIntersectRaw(segment, edge))) return 0;
  return Math.min(...edges.map((edge) => distanceBetweenSegmentsRaw(segment, edge)));
}

function convexPolygonsTouchOrOverlap(left: readonly Point2[], right: readonly Point2[]): boolean {
  return polygonAxesRaw(left).concat(polygonAxesRaw(right)).every((axis) => projectionsOverlapRaw(projectPolygonRaw(left, axis), projectPolygonRaw(right, axis)));
}

function coresHavePositiveAreaOverlap(left: CoreShape, right: CoreShape): boolean {
  if (left.kind !== 'polygon' || right.kind !== 'polygon') return false;
  return polygonAxesRaw(left.points).concat(polygonAxesRaw(right.points)).every((axis) => {
    const first = projectPolygonRaw(left.points, axis);
    const second = projectPolygonRaw(right.points, axis);
    return first[0] < second[1] - GEOMETRY_EPSILON && second[0] < first[1] - GEOMETRY_EPSILON;
  });
}

function footprintHasInterior(footprint: Footprint): boolean {
  return footprint.kind === 'convex-polygon'
    || footprint.kind === 'oriented-convex-polygon'
    || footprint.radius > 0;
}

function boundsForPoints(points: readonly Point2[], padding = 0): Aabb {
  return {
    minX: Math.min(...points.map(({ x }) => x)) - padding,
    minY: Math.min(...points.map(({ y }) => y)) - padding,
    maxX: Math.max(...points.map(({ x }) => x)) + padding,
    maxY: Math.max(...points.map(({ y }) => y)) + padding
  };
}

function validateRing(ring: readonly Point2[], label: string): void {
  if (ring.length < 3) throw new Error(`${label} requires at least three vertices.`);
  ring.forEach((point, index) => validatePoint(point, `${label}[${index}]`));
  for (let index = 0; index < ring.length; index += 1) {
    const next = ring[(index + 1) % ring.length];
    if (squaredDistanceRaw(ring[index], next) === 0) throw new Error(`${label} cannot contain a zero-length edge.`);
  }
  if (Math.abs(signedAreaRaw(ring)) <= GEOMETRY_EPSILON) throw new Error(`${label} cannot have zero area.`);
  const edges = ringEdgesRaw(ring);
  for (let left = 0; left < edges.length; left += 1) {
    for (let right = left + 1; right < edges.length; right += 1) {
      const neighbours = right === left + 1 || (left === 0 && right === edges.length - 1);
      if (!neighbours && segmentsIntersectRaw(edges[left], edges[right])) throw new Error(`${label} must be a simple ring.`);
    }
  }
}

function ringsIntersect(left: readonly Point2[], right: readonly Point2[]): boolean {
  return ringEdgesRaw(left).some((leftEdge) => ringEdgesRaw(right).some((rightEdge) => segmentsIntersectRaw(leftEdge, rightEdge)));
}

function polygonAreaInteriorsOverlap(left: PolygonArea, right: PolygonArea): boolean {
  if (ringsEquivalent(left.outer, right.outer)) return true;
  const leftEdges = [left.outer, ...(left.holes ?? [])].flatMap(ringEdgesRaw);
  const rightEdges = [right.outer, ...(right.holes ?? [])].flatMap(ringEdgesRaw);
  if (leftEdges.some((leftEdge) => rightEdges.some((rightEdge) => segmentsProperlyIntersectRaw(leftEdge, rightEdge)))) return true;
  if (outerBoundarySamples(left.outer, right.outer).some((point) => pointInPolygonAreaStrictRaw(point, right))) return true;
  if (outerBoundarySamples(right.outer, left.outer).some((point) => pointInPolygonAreaStrictRaw(point, left))) return true;
  return false;
}

/**
 * Splits every edge at opposing collinear vertices, then samples each open
 * subsegment. This detects overlap hidden behind collinear boundaries while a
 * pure shared boundary remains outside both strict interiors.
 */
function outerBoundarySamples(ring: readonly Point2[], opposingRing: readonly Point2[]): Point2[] {
  return ringEdgesRaw(ring).flatMap((edge) => {
    const dx = edge.end.x - edge.start.x;
    const dy = edge.end.y - edge.start.y;
    const lengthSquared = dx * dx + dy * dy;
    const parameters = [0, 1];
    for (const point of opposingRing) {
      if (isPointOnSegmentRaw(point, edge)) {
        parameters.push(((point.x - edge.start.x) * dx + (point.y - edge.start.y) * dy) / lengthSquared);
      }
    }
    const sorted = [...new Set(parameters)].sort((left, right) => left - right);
    const samples = sorted.map((parameter) => pointAlongSegmentRaw(edge, parameter));
    for (let index = 0; index < sorted.length - 1; index += 1) {
      samples.push(pointAlongSegmentRaw(edge, (sorted[index] + sorted[index + 1]) / 2));
    }
    return samples;
  });
}

function pointAlongSegmentRaw(segment: Segment2, parameter: number): Point2 {
  return {
    x: segment.start.x + (segment.end.x - segment.start.x) * parameter,
    y: segment.start.y + (segment.end.y - segment.start.y) * parameter
  };
}

function pointInPolygonAreaStrictRaw(point: Point2, area: PolygonArea): boolean {
  return !ringEdgesRaw(area.outer).some((edge) => isPointOnSegmentRaw(point, edge))
    && pointInRingStrict(point, area.outer)
    && !(area.holes ?? []).some((hole) => pointInRingInclusive(point, hole));
}

function ringsEquivalent(left: readonly Point2[], right: readonly Point2[]): boolean {
  if (left.length !== right.length) return false;
  const firstIndex = right.findIndex((point) => point.x === left[0].x && point.y === left[0].y);
  if (firstIndex < 0) return false;
  const matches = (direction: 1 | -1) => left.every((point, index) => {
    const candidate = right[(firstIndex + direction * index + right.length) % right.length];
    return point.x === candidate.x && point.y === candidate.y;
  });
  return matches(1) || matches(-1);
}

function segmentsProperlyIntersectRaw(left: Segment2, right: Segment2): boolean {
  const leftStart = crossRaw(left.start, left.end, right.start);
  const leftEnd = crossRaw(left.start, left.end, right.end);
  const rightStart = crossRaw(right.start, right.end, left.start);
  const rightEnd = crossRaw(right.start, right.end, left.end);
  return leftStart * leftEnd < -GEOMETRY_EPSILON && rightStart * rightEnd < -GEOMETRY_EPSILON;
}

function ringEdgesRaw(ring: readonly Point2[]): Segment2[] {
  return ring.map((start, index) => ({ start, end: ring[(index + 1) % ring.length] }));
}

function pointInRingInclusive(point: Point2, ring: readonly Point2[], epsilon = GEOMETRY_EPSILON): boolean {
  if (ringEdgesRaw(ring).some((edge) => isPointOnSegmentRaw(point, edge, epsilon))) return true;
  return pointInRingStrict(point, ring, epsilon);
}

function pointInRingStrict(point: Point2, ring: readonly Point2[], epsilon = GEOMETRY_EPSILON): boolean {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current, current += 1) {
    const start = ring[current];
    const end = ring[previous];
    const crosses = (start.y > point.y) !== (end.y > point.y);
    if (crosses && point.x < (end.x - start.x) * (point.y - start.y) / (end.y - start.y) + start.x - epsilon) inside = !inside;
  }
  return inside;
}

function validateSegment(segment: Segment2, label = 'Segment'): void {
  validatePoint(segment.start, `${label}.start`);
  validatePoint(segment.end, `${label}.end`);
}

function validateEpsilon(epsilon: number): void {
  if (!Number.isFinite(epsilon) || epsilon < 0) throw new Error('epsilon must be finite and non-negative.');
}

function distanceRaw(left: Point2, right: Point2): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function squaredDistanceRaw(left: Point2, right: Point2): number {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  return dx * dx + dy * dy;
}

function crossRaw(origin: Point2, first: Point2, second: Point2): number {
  return (first.x - origin.x) * (second.y - origin.y) - (first.y - origin.y) * (second.x - origin.x);
}

function signedAreaRaw(vertices: readonly Point2[]): number {
  let twiceArea = 0;
  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index];
    const next = vertices[(index + 1) % vertices.length];
    twiceArea += current.x * next.y - current.y * next.x;
  }
  return twiceArea / 2;
}

function isPointOnSegmentRaw(point: Point2, segment: Segment2, epsilon = GEOMETRY_EPSILON): boolean {
  if (Math.abs(crossRaw(segment.start, segment.end, point)) > epsilon) return false;
  return point.x >= Math.min(segment.start.x, segment.end.x) - epsilon
    && point.x <= Math.max(segment.start.x, segment.end.x) + epsilon
    && point.y >= Math.min(segment.start.y, segment.end.y) - epsilon
    && point.y <= Math.max(segment.start.y, segment.end.y) + epsilon;
}

function distancePointToSegmentRaw(point: Point2, segment: Segment2): number {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= GEOMETRY_EPSILON) return distanceRaw(point, segment.start);
  const projection = Math.max(0, Math.min(1, ((point.x - segment.start.x) * dx + (point.y - segment.start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (segment.start.x + projection * dx), point.y - (segment.start.y + projection * dy));
}

function segmentsIntersectRaw(left: Segment2, right: Segment2): boolean {
  const orientation = (first: Point2, second: Point2, third: Point2) => Math.sign(crossRaw(first, second, third));
  const leftStart = orientation(left.start, left.end, right.start);
  const leftEnd = orientation(left.start, left.end, right.end);
  const rightStart = orientation(right.start, right.end, left.start);
  const rightEnd = orientation(right.start, right.end, left.end);
  if (leftStart !== leftEnd && rightStart !== rightEnd) return true;
  return isPointOnSegmentRaw(right.start, left)
    || isPointOnSegmentRaw(right.end, left)
    || isPointOnSegmentRaw(left.start, right)
    || isPointOnSegmentRaw(left.end, right);
}

function distanceBetweenSegmentsRaw(left: Segment2, right: Segment2): number {
  if (segmentsIntersectRaw(left, right)) return 0;
  return Math.min(
    distancePointToSegmentRaw(left.start, right),
    distancePointToSegmentRaw(left.end, right),
    distancePointToSegmentRaw(right.start, left),
    distancePointToSegmentRaw(right.end, left)
  );
}

function pointInConvexPolygonRaw(point: Point2, vertices: readonly Point2[], epsilon = GEOMETRY_EPSILON): boolean {
  const orientation = signedAreaRaw(vertices) >= 0 ? 1 : -1;
  return vertices.every((vertex, index) => orientation * crossRaw(vertex, vertices[(index + 1) % vertices.length], point) >= -epsilon);
}

function segmentFromPoints(points: readonly [Point2, Point2]): Segment2 {
  return { start: points[0], end: points[1] };
}

function polygonAxesRaw(vertices: readonly Point2[]): Point2[] {
  return ringEdgesRaw(vertices).map(({ start, end }) => ({ x: -(end.y - start.y), y: end.x - start.x }));
}

function projectPolygonRaw(vertices: readonly Point2[], axis: Point2): readonly [number, number] {
  const projections = vertices.map((vertex) => vertex.x * axis.x + vertex.y * axis.y);
  return [Math.min(...projections), Math.max(...projections)];
}

function projectionsOverlapRaw(left: readonly [number, number], right: readonly [number, number]): boolean {
  return left[0] <= right[1] + GEOMETRY_EPSILON && right[0] <= left[1] + GEOMETRY_EPSILON;
}
