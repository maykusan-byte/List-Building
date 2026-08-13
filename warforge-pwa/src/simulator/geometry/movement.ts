import {
  GEOMETRY_EPSILON,
  classifyFootprintContact,
  convexHull,
  footprintBounds,
  footprintCoreVertices,
  footprintRadius,
  validateAabb,
  validateFootprint,
  validateOrientation,
  validatePoint
} from './primitives';
import type {
  Aabb,
  BoardContainmentEvidence,
  CircleFootprint,
  ContactEvidence,
  Footprint,
  IdentifiedFootprint,
  MovementPose,
  Point2,
  Segment2
} from './types';

export interface SweptCollision {
  readonly obstacleId: string;
  readonly pathSegmentIndex: number;
  /** Fraction along the colliding path segment, from 0 through 1. */
  readonly segmentT: number;
  /** World-unit distance travelled from the first waypoint to the contact. */
  readonly pathDistance: number;
  /** The moving profile's translation anchor at contact. */
  readonly contactCenter: Point2;
  readonly contact: ContactEvidence;
}

export interface BoardExitEvidence {
  readonly pathSegmentIndex: number;
  readonly segmentT: number;
  readonly pathDistance: number;
  readonly pose: MovementPose;
  readonly containment: BoardContainmentEvidence;
}

/** An explainable all-or-nothing movement result. */
export interface MovementVerdict {
  readonly allowed: boolean;
  readonly reason: 'clear' | 'collision' | 'outside-board';
  readonly pathLength: number;
  readonly firstCollision?: SweptCollision;
  readonly boardExit?: BoardExitEvidence;
}

export interface MovementOptions {
  /** A board is a closed AABB: touching its edge is legal, crossing it is not. */
  readonly board?: Aabb;
}

/** Returns the length of a polyline in world units. */
export function movementPathLength(waypoints: readonly Point2[]): number {
  waypoints.forEach((point, index) => validatePoint(point, `waypoints[${index}]`));
  return waypoints.slice(1).reduce((total, point, index) => total + distanceRaw(waypoints[index], point), 0);
}

/**
 * Generic continuous translation sweep for circles, capsules and convex
 * polygons. Every segment has a fixed orientation; a requested rotation is
 * rejected rather than approximated by samples.
 */
export function firstSweptFootprintCollision(
  moving: Footprint,
  poses: readonly MovementPose[],
  obstacles: readonly IdentifiedFootprint[]
): SweptCollision | undefined {
  validateMovementInputs(moving, poses, obstacles);
  if (poses.length === 1) return collisionAtPose(moving, poses[0], obstacles);
  let completedDistance = 0;
  for (let index = 0; index < poses.length - 1; index += 1) {
    const start = poses[index];
    const end = poses[index + 1];
    const segmentLength = distanceRaw(start.position, end.position);
    const movingAtStart = footprintAtPose(moving, start);
    const candidates = obstacles
      .map((obstacle) => ({ obstacle, entryT: sweepEntryT(movingAtStart, start.position, end.position, obstacle.footprint) }))
      .filter((candidate): candidate is { obstacle: IdentifiedFootprint; entryT: number } => candidate.entryT !== undefined)
      .sort((left, right) => left.entryT - right.entryT || compareIds(left.obstacle.id, right.obstacle.id));
    const first = candidates[0];
    if (first) {
      const contactPosition = pointAlong(start.position, end.position, first.entryT);
      const contact = first.entryT <= GEOMETRY_EPSILON
        ? classifyFootprintContact(movingAtStart, first.obstacle.footprint)
        : {
            classification: 'touching' as const,
            distance: 0,
            leftKind: movingAtStart.kind,
            rightKind: first.obstacle.footprint.kind
          };
      return {
        obstacleId: first.obstacle.id,
        pathSegmentIndex: index,
        segmentT: first.entryT,
        pathDistance: completedDistance + segmentLength * first.entryT,
        contactCenter: contactPosition,
        contact
      };
    }
    completedDistance += segmentLength;
  }
  return undefined;
}

function collisionAtPose(
  moving: Footprint,
  pose: MovementPose,
  obstacles: readonly IdentifiedFootprint[]
): SweptCollision | undefined {
  const placed = footprintAtPose(moving, pose);
  const first = obstacles
    .map((obstacle) => ({ obstacle, contact: classifyFootprintContact(placed, obstacle.footprint) }))
    .filter(({ contact }) => contact.classification !== 'separated')
    .sort((left, right) => compareIds(left.obstacle.id, right.obstacle.id))[0];
  return first ? {
    obstacleId: first.obstacle.id,
    pathSegmentIndex: 0,
    segmentT: 0,
    pathDistance: 0,
    contactCenter: pose.position,
    contact: first.contact
  } : undefined;
}

/** Compatibility wrapper for the original circular movement API. */
export function firstSweptCircleCollision(
  moving: CircleFootprint,
  waypoints: readonly Point2[],
  obstacles: readonly IdentifiedFootprint[]
): SweptCollision | undefined {
  return firstSweptFootprintCollision(moving, waypoints.map((position) => ({ position })), obstacles);
}

/**
 * Validates a generic sweep, including the optional closed board boundary.
 * Obstacles at an equal first-contact time win by id only among obstacles; a
 * simultaneous board exit is reported as an outside-board rejection.
 */
export function evaluateMovement(
  moving: Footprint,
  poses: readonly MovementPose[],
  obstacles: readonly IdentifiedFootprint[],
  options: MovementOptions = {}
): MovementVerdict {
  validateMovementInputs(moving, poses, obstacles);
  if (options.board) validateAabb(options.board, 'board');
  const pathLength = movementPathLength(poses.map((pose) => pose.position));
  const collision = firstSweptFootprintCollision(moving, poses, obstacles);
  const boardExit = options.board ? firstBoardExit(moving, poses, options.board) : undefined;
  if (boardExit && (!collision || boardExit.pathDistance <= collision.pathDistance + GEOMETRY_EPSILON)) {
    return { allowed: false, reason: 'outside-board', pathLength, boardExit };
  }
  if (collision) return { allowed: false, reason: 'collision', pathLength, firstCollision: collision };
  return { allowed: true, reason: 'clear', pathLength };
}

/** Returns containment for a concrete profile. Touching a board edge is valid. */
export function classifyBoardContainment(footprint: Footprint, board: Aabb): BoardContainmentEvidence {
  validateFootprint(footprint);
  validateAabb(board, 'board');
  const bounds = footprintBounds(footprint);
  const crossedEdges: Array<'left' | 'right' | 'bottom' | 'top'> = [];
  if (bounds.minX < board.minX - GEOMETRY_EPSILON) crossedEdges.push('left');
  if (bounds.maxX > board.maxX + GEOMETRY_EPSILON) crossedEdges.push('right');
  if (bounds.minY < board.minY - GEOMETRY_EPSILON) crossedEdges.push('bottom');
  if (bounds.maxY > board.maxY + GEOMETRY_EPSILON) crossedEdges.push('top');
  if (crossedEdges.length > 0) return { classification: 'outside', bounds, crossedEdges };
  const touches = bounds.minX <= board.minX + GEOMETRY_EPSILON
    || bounds.maxX >= board.maxX - GEOMETRY_EPSILON
    || bounds.minY <= board.minY + GEOMETRY_EPSILON
    || bounds.maxY >= board.maxY - GEOMETRY_EPSILON;
  return { classification: touches ? 'touching-boundary' : 'inside', bounds, crossedEdges };
}

function validateMovementInputs(moving: Footprint, poses: readonly MovementPose[], obstacles: readonly IdentifiedFootprint[]): void {
  validateFootprint(moving);
  if (poses.length === 0) throw new Error('A swept movement requires at least one pose.');
  const ids = new Set<string>();
  for (const obstacle of obstacles) {
    if (!obstacle.id.trim()) throw new Error('Movement obstacle ids must be non-empty.');
    if (ids.has(obstacle.id)) throw new Error(`Movement obstacle id '${obstacle.id}' is duplicated.`);
    ids.add(obstacle.id);
    validateFootprint(obstacle.footprint);
  }
  const initialPosition = footprintAnchor(moving);
  poses.forEach((pose, index) => validateMovementPose(moving, pose, index));
  if (!samePoint(poses[0].position, initialPosition)) {
    throw new Error('The first movement pose must equal the moving footprint translation anchor.');
  }
}

function validateMovementPose(moving: Footprint, pose: MovementPose, index: number): void {
  validatePoint(pose.position, `poses[${index}].position`);
  if (pose.orientationDegrees !== undefined) validateOrientation(pose.orientationDegrees, `poses[${index}].orientationDegrees`);
  const fixedOrientation = footprintOrientation(moving);
  if (fixedOrientation === undefined && pose.orientationDegrees !== undefined) {
    throw new Error(`Footprint '${moving.kind}' does not expose a movement orientation; rotation is unsupported.`);
  }
  if (fixedOrientation !== undefined && pose.orientationDegrees !== undefined && Math.abs(pose.orientationDegrees - fixedOrientation) > GEOMETRY_EPSILON) {
    throw new Error('Continuous orientation sweeps are unsupported; each movement segment must keep the footprint orientation fixed.');
  }
}

function footprintAnchor(footprint: Footprint): Point2 {
  switch (footprint.kind) {
    case 'circle': return footprint.center;
    case 'capsule': return footprint.center;
    case 'oriented-convex-polygon': return footprint.center;
    /** First vertex is the integer, stable translation anchor for legacy absolute polygons. */
    case 'convex-polygon': return footprint.vertices[0];
  }
}

function footprintOrientation(footprint: Footprint): number | undefined {
  return footprint.kind === 'capsule' || footprint.kind === 'oriented-convex-polygon' ? footprint.orientationDegrees : undefined;
}

function footprintAtPose(footprint: Footprint, pose: MovementPose): Footprint {
  const anchor = footprintAnchor(footprint);
  const dx = pose.position.x - anchor.x;
  const dy = pose.position.y - anchor.y;
  switch (footprint.kind) {
    case 'circle': return { ...footprint, center: pose.position };
    case 'capsule': return { ...footprint, center: pose.position };
    case 'oriented-convex-polygon': return { ...footprint, center: pose.position };
    case 'convex-polygon': return {
      kind: 'convex-polygon',
      vertices: footprint.vertices.map((vertex) => ({ x: vertex.x + dx, y: vertex.y + dy }))
    };
  }
}

/** Exact translational CCD via the Minkowski difference of the two convex cores. */
function sweepEntryT(moving: Footprint, start: Point2, end: Point2, obstacle: Footprint): number | undefined {
  if (classifyFootprintContact(moving, obstacle).classification !== 'separated') return 0;
  const delta = { x: end.x - start.x, y: end.y - start.y };
  if (Math.abs(delta.x) <= GEOMETRY_EPSILON && Math.abs(delta.y) <= GEOMETRY_EPSILON) return undefined;
  const differences = footprintCoreVertices(moving).flatMap((movingPoint) => footprintCoreVertices(obstacle).map((obstaclePoint) => ({
    x: movingPoint.x - obstaclePoint.x,
    y: movingPoint.y - obstaclePoint.y
  })));
  const differenceHull = convexHull(differences);
  return firstPathExpandedConvexEntry({ start: { x: 0, y: 0 }, end: { x: -delta.x, y: -delta.y } }, differenceHull, footprintRadius(moving) + footprintRadius(obstacle));
}

/** First hit of a point path against a point/segment/polygon dilated by radius. */
function firstPathExpandedConvexEntry(path: Segment2, hull: readonly Point2[], radius: number): number | undefined {
  if (hull.length === 1) return firstSegmentCircleEntry(path, hull[0], radius);
  if (hull.length === 2) return firstSegmentCapsuleEntry(path, { start: hull[0], end: hull[1] }, radius);
  if (pointInConvexPolygonRaw(path.start, hull)) return 0;
  const entries = hull
    .map((start, index) => ({ start, end: hull[(index + 1) % hull.length] }))
    .map((edge) => firstSegmentCapsuleEntry(path, edge, radius))
    .filter((entry): entry is number => entry !== undefined);
  return entries.length === 0 ? undefined : Math.min(...entries);
}

function firstSegmentCapsuleEntry(path: Segment2, capsuleAxis: Segment2, radius: number): number | undefined {
  if (radius <= GEOMETRY_EPSILON) return firstSegmentAgainstSegment(path, capsuleAxis);
  const entries = [
    firstSegmentCircleEntry(path, capsuleAxis.start, radius),
    firstSegmentCircleEntry(path, capsuleAxis.end, radius),
    firstSegmentOffsetLineEntry(path, capsuleAxis, radius, 1),
    firstSegmentOffsetLineEntry(path, capsuleAxis, radius, -1)
  ].filter((entry): entry is number => entry !== undefined);
  return entries.length === 0 ? undefined : Math.min(...entries);
}

function firstSegmentCircleEntry(path: Segment2, center: Point2, radius: number): number | undefined {
  const dx = path.end.x - path.start.x;
  const dy = path.end.y - path.start.y;
  const offsetX = path.start.x - center.x;
  const offsetY = path.start.y - center.y;
  const a = dx * dx + dy * dy;
  const c = offsetX * offsetX + offsetY * offsetY - radius * radius;
  if (c <= GEOMETRY_EPSILON) return 0;
  if (a <= GEOMETRY_EPSILON) return undefined;
  const b = 2 * (offsetX * dx + offsetY * dy);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < -GEOMETRY_EPSILON) return undefined;
  const root = Math.sqrt(Math.max(0, discriminant));
  const entry = (-b - root) / (2 * a);
  return entry >= -GEOMETRY_EPSILON && entry <= 1 + GEOMETRY_EPSILON ? clampUnit(entry) : undefined;
}

function firstSegmentOffsetLineEntry(path: Segment2, axis: Segment2, radius: number, side: 1 | -1): number | undefined {
  const edgeX = axis.end.x - axis.start.x;
  const edgeY = axis.end.y - axis.start.y;
  const edgeLength = Math.hypot(edgeX, edgeY);
  if (edgeLength <= GEOMETRY_EPSILON) return undefined;
  const startCross = edgeX * (path.start.y - axis.start.y) - edgeY * (path.start.x - axis.start.x);
  const deltaCross = edgeX * (path.end.y - path.start.y) - edgeY * (path.end.x - path.start.x);
  const target = side * radius * edgeLength;
  if (Math.abs(deltaCross) <= GEOMETRY_EPSILON) return undefined;
  const t = (target - startCross) / deltaCross;
  if (t < -GEOMETRY_EPSILON || t > 1 + GEOMETRY_EPSILON) return undefined;
  const contact = pointAlong(path.start, path.end, clampUnit(t));
  const projection = ((contact.x - axis.start.x) * edgeX + (contact.y - axis.start.y) * edgeY) / (edgeLength * edgeLength);
  return projection >= -GEOMETRY_EPSILON && projection <= 1 + GEOMETRY_EPSILON ? clampUnit(t) : undefined;
}

function firstSegmentAgainstSegment(path: Segment2, target: Segment2): number | undefined {
  if (distancePointToSegmentRaw(path.start, target) <= GEOMETRY_EPSILON) return 0;
  const px = path.end.x - path.start.x;
  const py = path.end.y - path.start.y;
  const qx = target.end.x - target.start.x;
  const qy = target.end.y - target.start.y;
  const determinant = px * qy - py * qx;
  if (Math.abs(determinant) <= GEOMETRY_EPSILON) {
    const cross = px * (target.start.y - path.start.y) - py * (target.start.x - path.start.x);
    const pathLengthSquared = px * px + py * py;
    if (Math.abs(cross) > GEOMETRY_EPSILON || pathLengthSquared <= GEOMETRY_EPSILON) return undefined;
    const first = ((target.start.x - path.start.x) * px + (target.start.y - path.start.y) * py) / pathLengthSquared;
    const second = ((target.end.x - path.start.x) * px + (target.end.y - path.start.y) * py) / pathLengthSquared;
    const entry = Math.max(0, Math.min(first, second));
    const exit = Math.min(1, Math.max(first, second));
    return entry <= exit + GEOMETRY_EPSILON ? clampUnit(entry) : undefined;
  }
  const rx = target.start.x - path.start.x;
  const ry = target.start.y - path.start.y;
  const t = (rx * qy - ry * qx) / determinant;
  const u = (rx * py - ry * px) / determinant;
  return t >= -GEOMETRY_EPSILON && t <= 1 + GEOMETRY_EPSILON && u >= -GEOMETRY_EPSILON && u <= 1 + GEOMETRY_EPSILON ? clampUnit(t) : undefined;
}

function firstBoardExit(moving: Footprint, poses: readonly MovementPose[], board: Aabb): BoardExitEvidence | undefined {
  let completedDistance = 0;
  for (let index = 0; index < poses.length - 1; index += 1) {
    const start = poses[index];
    const end = poses[index + 1];
    const startShape = footprintAtPose(moving, start);
    const endShape = footprintAtPose(moving, end);
    const startContainment = classifyBoardContainment(startShape, board);
    const segmentLength = distanceRaw(start.position, end.position);
    if (startContainment.classification === 'outside') {
      return { pathSegmentIndex: index, segmentT: 0, pathDistance: completedDistance, pose: start, containment: startContainment };
    }
    const endContainment = classifyBoardContainment(endShape, board);
    if (endContainment.classification === 'outside') {
      const t = firstBoardCrossingT(footprintBounds(startShape), footprintBounds(endShape), board);
      const position = pointAlong(start.position, end.position, t);
      const pose = { ...start, position };
      return {
        pathSegmentIndex: index,
        segmentT: t,
        pathDistance: completedDistance + segmentLength * t,
        pose,
        containment: {
          classification: 'outside',
          bounds: interpolateBounds(footprintBounds(startShape), footprintBounds(endShape), t),
          crossedEdges: endContainment.crossedEdges
        }
      };
    }
    completedDistance += segmentLength;
  }
  const last = poses[poses.length - 1];
  const containment = classifyBoardContainment(footprintAtPose(moving, last), board);
  return containment.classification === 'outside'
    ? { pathSegmentIndex: Math.max(0, poses.length - 2), segmentT: 1, pathDistance: completedDistance, pose: last, containment }
    : undefined;
}

function firstBoardCrossingT(start: Aabb, end: Aabb, board: Aabb): number {
  const candidates: number[] = [];
  const collect = (startValue: number, endValue: number, limit: number, crossesWhen: (value: number) => boolean) => {
    if (crossesWhen(endValue) && !crossesWhen(startValue) && Math.abs(endValue - startValue) > GEOMETRY_EPSILON) {
      candidates.push(clampUnit((limit - startValue) / (endValue - startValue)));
    }
  };
  collect(start.minX, end.minX, board.minX, (value) => value < board.minX - GEOMETRY_EPSILON);
  collect(start.maxX, end.maxX, board.maxX, (value) => value > board.maxX + GEOMETRY_EPSILON);
  collect(start.minY, end.minY, board.minY, (value) => value < board.minY - GEOMETRY_EPSILON);
  collect(start.maxY, end.maxY, board.maxY, (value) => value > board.maxY + GEOMETRY_EPSILON);
  return candidates.length === 0 ? 0 : Math.min(...candidates);
}

function interpolateBounds(start: Aabb, end: Aabb, t: number): Aabb {
  return {
    minX: start.minX + (end.minX - start.minX) * t,
    minY: start.minY + (end.minY - start.minY) * t,
    maxX: start.maxX + (end.maxX - start.maxX) * t,
    maxY: start.maxY + (end.maxY - start.maxY) * t
  };
}

function pointAlong(start: Point2, end: Point2, t: number): Point2 {
  return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
}

function pointInConvexPolygonRaw(point: Point2, vertices: readonly Point2[]): boolean {
  let signedArea = 0;
  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index];
    const next = vertices[(index + 1) % vertices.length];
    signedArea += current.x * next.y - current.y * next.x;
  }
  const orientation = signedArea >= 0 ? 1 : -1;
  return vertices.every((vertex, index) => {
    const next = vertices[(index + 1) % vertices.length];
    return orientation * ((next.x - vertex.x) * (point.y - vertex.y) - (next.y - vertex.y) * (point.x - vertex.x)) >= -GEOMETRY_EPSILON;
  });
}

function distancePointToSegmentRaw(point: Point2, segment: Segment2): number {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= GEOMETRY_EPSILON) return distanceRaw(point, segment.start);
  const t = Math.max(0, Math.min(1, ((point.x - segment.start.x) * dx + (point.y - segment.start.y) * dy) / lengthSquared));
  return distanceRaw(point, { x: segment.start.x + dx * t, y: segment.start.y + dy * t });
}

function distanceRaw(left: Point2, right: Point2): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function samePoint(left: Point2, right: Point2): boolean {
  return Math.abs(left.x - right.x) <= GEOMETRY_EPSILON && Math.abs(left.y - right.y) <= GEOMETRY_EPSILON;
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
