import { evaluateLineOfSight } from './line-of-sight';
import { validatePoint3 } from './primitives';
import type {
  LineOfSightBlockerHit,
  LineOfSightRay
} from './line-of-sight';
import type { Point3, TerrainBlocker } from './types';

/**
 * The locally-versioned M4 convention. It decides only the finite set of
 * representative rays below; it is not continuous hitbox line of sight and
 * does not make a cover determination.
 */
export interface SampledCylinderLineOfSightPolicy {
  readonly id: 'm4-sampled-cylinder-los-v1';
  readonly version: '1.0.0';
  readonly hitboxKind: 'closed-vertical-cylinder';
  readonly samplePointCount: 15;
  readonly candidatePairCount: 225;
  readonly endpointContact: 'blocks';
  readonly terrainBoundaryContact: 'blocks';
  /** This policy has no ray thickness; a non-zero width is a different convention. */
  readonly rayWidthWorldUnits: 0;
  /** Only static terrain volumes are inputs to this evaluator. */
  readonly blockerDomain: 'static-terrain-only';
  /** Other miniatures never become occlusion volumes under this policy. */
  readonly modelOcclusion: 'excluded';
  readonly approximation: 'finite-representative-points';
}

export const SAMPLED_CYLINDER_LINE_OF_SIGHT_POLICY = Object.freeze({
  id: 'm4-sampled-cylinder-los-v1',
  version: '1.0.0',
  hitboxKind: 'closed-vertical-cylinder',
  samplePointCount: 15,
  candidatePairCount: 225,
  endpointContact: 'blocks',
  terrainBoundaryContact: 'blocks',
  rayWidthWorldUnits: 0,
  blockerDomain: 'static-terrain-only',
  modelOcclusion: 'excluded',
  approximation: 'finite-representative-points'
} as const) satisfies SampledCylinderLineOfSightPolicy;

/** Radius and height of a closed, vertical cylindrical hitbox in world units. */
export interface SampledCylinderProfile {
  readonly radius: number;
  readonly height: number;
}

/**
 * A closed cylinder whose `center` is the centre of its bottom disc. The
 * generated z offsets are therefore 0, height / 2 and height.
 *
 * There is deliberately no orientation: a circle is orientation-invariant.
 */
export interface SampledCylinderHitbox extends SampledCylinderProfile {
  readonly center: Point3;
}

export type SampledCylinderVerticalPosition = 'bottom' | 'middle' | 'top';
export type SampledCylinderHorizontalPosition = 'center' | 'east' | 'north' | 'west' | 'south';
export type SampledCylinderPointId =
  | 'bottom.center' | 'bottom.east' | 'bottom.north' | 'bottom.west' | 'bottom.south'
  | 'middle.center' | 'middle.east' | 'middle.north' | 'middle.west' | 'middle.south'
  | 'top.center' | 'top.east' | 'top.north' | 'top.west' | 'top.south';

/** One of the fifteen ordered representative points of a sampled cylinder. */
export interface SampledCylinderPoint {
  readonly id: SampledCylinderPointId;
  readonly verticalPosition: SampledCylinderVerticalPosition;
  readonly horizontalPosition: SampledCylinderHorizontalPosition;
  readonly point: Point3;
}

/** One source-major, target-minor candidate from the fixed 15 by 15 product. */
export interface SampledCylinderLineOfSightCandidate {
  /** Source-major, target-minor index: sourceIndex * 15 + targetIndex. */
  readonly pairIndex: number;
  readonly sourcePoint: SampledCylinderPoint;
  readonly targetPoint: SampledCylinderPoint;
}

export interface SampledCylinderLineOfSightWitness {
  readonly pairIndex: number;
  readonly sourcePoint: SampledCylinderPoint;
  readonly targetPoint: SampledCylinderPoint;
  readonly ray: LineOfSightRay;
  readonly blockerHits: readonly LineOfSightBlockerHit[];
}

export interface SampledCylinderLineOfSightBlockedEvidence extends SampledCylinderLineOfSightWitness {
  readonly firstBlocker: LineOfSightBlockerHit;
}

interface SampledCylinderLineOfSightSummary {
  readonly policy: SampledCylinderLineOfSightPolicy;
  readonly candidatePairCount: 225;
  readonly evaluatedPairCount: number;
  readonly blockedPairCount: number;
  readonly degeneratePairCount: number;
  /** Sorted, unique blocker ids observed in the processed candidate rays. */
  readonly blockerIds: readonly string[];
}

/** A clear result carries the first clear candidate in canonical order. */
export interface SampledCylinderLineOfSightVisibleResult extends SampledCylinderLineOfSightSummary {
  readonly status: 'visible';
  readonly visible: true;
  readonly reason: 'sample-clear';
  readonly firstClearWitness: SampledCylinderLineOfSightWitness;
}

/** A blocked result is returned only after every canonical candidate is processed. */
export interface SampledCylinderLineOfSightBlockedResult extends SampledCylinderLineOfSightSummary {
  readonly status: 'blocked';
  readonly visible: false;
  /**
   * `no-clear-sample` also covers a canonical set containing a degenerate
   * pair outside terrain: it was not clear, but it was not a blocker hit.
   */
  readonly reason: 'all-samples-blocked' | 'no-clear-sample';
  readonly firstBlockedEvidence: SampledCylinderLineOfSightBlockedEvidence;
}

export type SampledCylinderLineOfSightResult =
  | SampledCylinderLineOfSightVisibleResult
  | SampledCylinderLineOfSightBlockedResult;

const VERTICAL_SAMPLES = [
  { position: 'bottom', offsetZ: 0 },
  { position: 'middle', offsetZ: 'half-height' },
  { position: 'top', offsetZ: 'height' }
] as const;

const HORIZONTAL_SAMPLES = [
  { position: 'center', offsetX: 0, offsetY: 0 },
  { position: 'east', offsetX: 'radius', offsetY: 0 },
  { position: 'north', offsetX: 0, offsetY: 'radius' },
  { position: 'west', offsetX: 'negative-radius', offsetY: 0 },
  { position: 'south', offsetX: 0, offsetY: 'negative-radius' }
] as const;

/** Generates the fifteen representative points in the policy's z-major order. */
export function generateSampledCylinderPoints(hitbox: SampledCylinderHitbox): readonly SampledCylinderPoint[] {
  validateSampledCylinderHitbox(hitbox);
  const points: SampledCylinderPoint[] = [];

  for (const vertical of VERTICAL_SAMPLES) {
    const offsetZ = vertical.offsetZ === 'half-height'
      ? hitbox.height / 2
      : vertical.offsetZ === 'height'
        ? hitbox.height
        : 0;
    for (const horizontal of HORIZONTAL_SAMPLES) {
      const offsetX = horizontal.offsetX === 'radius'
        ? hitbox.radius
        : horizontal.offsetX === 'negative-radius'
          ? -hitbox.radius
          : 0;
      const offsetY = horizontal.offsetY === 'radius'
        ? hitbox.radius
        : horizontal.offsetY === 'negative-radius'
          ? -hitbox.radius
          : 0;
      const point = {
        x: hitbox.center.x + offsetX,
        y: hitbox.center.y + offsetY,
        z: hitbox.center.z + offsetZ
      };
      validatePoint3(point, `Sampled cylinder point ${vertical.position}.${horizontal.position}`);
      points.push({
        id: `${vertical.position}.${horizontal.position}` as SampledCylinderPointId,
        verticalPosition: vertical.position,
        horizontalPosition: horizontal.position,
        point
      });
    }
  }
  return points;
}

/** Generates exactly 225 source-major, target-minor candidate point pairs. */
export function generateSampledCylinderLineOfSightCandidates(
  source: SampledCylinderHitbox,
  target: SampledCylinderHitbox
): readonly SampledCylinderLineOfSightCandidate[] {
  return candidatePairsFromPoints(generateSampledCylinderPoints(source), generateSampledCylinderPoints(target));
}

/**
 * Decides M4 sampled-cylinder visibility. Existing `evaluateLineOfSight`
 * supplies the closed endpoint and terrain-boundary behaviour for every ray;
 * no blocker is excluded specially for either endpoint.
 */
export function evaluateSampledCylinderLineOfSight(
  source: SampledCylinderHitbox,
  target: SampledCylinderHitbox,
  blockers: readonly TerrainBlocker[]
): SampledCylinderLineOfSightResult {
  const candidates = generateSampledCylinderLineOfSightCandidates(source, target);
  validateUniqueBlockerIds(blockers);

  let evaluatedPairCount = 0;
  let blockedPairCount = 0;
  let degeneratePairCount = 0;
  let firstBlockedEvidence: SampledCylinderLineOfSightBlockedEvidence | undefined;
  const blockerIds = new Set<string>();

  for (const candidate of candidates) {
    const ray = { from: candidate.sourcePoint.point, to: candidate.targetPoint.point };
    evaluatedPairCount += 1;

    if (samePoint(ray.from, ray.to)) {
      degeneratePairCount += 1;
      const blockerHits = degeneratePointBlockerHits(ray.from, blockers);
      blockerHits.forEach((hit) => blockerIds.add(hit.blockerId));
      if (blockerHits.length > 0) {
        blockedPairCount += 1;
        if (!firstBlockedEvidence) {
          firstBlockedEvidence = blockedEvidence(candidate, ray, blockerHits, blockerHits[0]);
        }
      }
      continue;
    }
    const result = evaluateLineOfSight(ray, blockers);
    result.blockerHits.forEach((hit) => blockerIds.add(hit.blockerId));
    if (result.reason === 'blocked') {
      blockedPairCount += 1;
      if (!firstBlockedEvidence && result.firstBlocker) {
        firstBlockedEvidence = blockedEvidence(candidate, result.ray, result.blockerHits, result.firstBlocker);
      }
      continue;
    }
    return {
      ...summary(evaluatedPairCount, blockedPairCount, degeneratePairCount, blockerIds),
      status: 'visible',
      visible: true,
      reason: 'sample-clear',
      firstClearWitness: witness(candidate, result.ray, result.blockerHits)
    };
  }

  if (firstBlockedEvidence) {
    return {
      ...summary(evaluatedPairCount, blockedPairCount, degeneratePairCount, blockerIds),
      status: 'blocked',
      visible: false,
      reason: blockedPairCount === SAMPLED_CYLINDER_LINE_OF_SIGHT_POLICY.candidatePairCount
        ? 'all-samples-blocked'
        : 'no-clear-sample',
      firstBlockedEvidence
    };
  }
  throw new Error('Sampled-cylinder point-generation invariant violated: valid cylinders cannot produce 225 degenerate pairs.');
}

function candidatePairsFromPoints(
  sourcePoints: readonly SampledCylinderPoint[],
  targetPoints: readonly SampledCylinderPoint[]
): readonly SampledCylinderLineOfSightCandidate[] {
  const candidates: SampledCylinderLineOfSightCandidate[] = [];
  for (let sourceIndex = 0; sourceIndex < sourcePoints.length; sourceIndex += 1) {
    for (let targetIndex = 0; targetIndex < targetPoints.length; targetIndex += 1) {
      candidates.push({
        pairIndex: sourceIndex * SAMPLED_CYLINDER_LINE_OF_SIGHT_POLICY.samplePointCount + targetIndex,
        sourcePoint: sourcePoints[sourceIndex],
        targetPoint: targetPoints[targetIndex]
      });
    }
  }
  if (candidates.length !== SAMPLED_CYLINDER_LINE_OF_SIGHT_POLICY.candidatePairCount) {
    throw new Error('Sampled-cylinder policy must generate exactly 225 candidate pairs.');
  }
  return candidates;
}

function validateSampledCylinderHitbox(hitbox: SampledCylinderHitbox): void {
  validatePoint3(hitbox.center, 'Sampled cylinder center');
  if (!Number.isSafeInteger(hitbox.radius) || hitbox.radius <= 0) {
    throw new Error('Sampled cylinder radius must be a positive safe integer world-unit value.');
  }
  if (!Number.isSafeInteger(hitbox.height) || hitbox.height <= 0 || hitbox.height % 2 !== 0) {
    throw new Error('Sampled cylinder height must be a positive, even safe integer world-unit value.');
  }
}

/** Validate every terrain input even when an early candidate is degenerate. */
function validateUniqueBlockerIds(blockers: readonly TerrainBlocker[]): void {
  const ids = new Set<string>();
  for (const blocker of blockers) {
    validateStaticTerrainBlocker(blocker);
    if (!blocker.id.trim()) throw new Error('Sampled-cylinder line-of-sight blocker ids must be non-empty.');
    if (ids.has(blocker.id)) throw new Error(`Sampled-cylinder line-of-sight blocker id '${blocker.id}' must be unique.`);
    ids.add(blocker.id);
    // This non-degenerate validation ray delegates all accepted terrain shapes,
    // bands and closed-boundary validation to the existing LoS implementation.
    evaluateLineOfSight({ from: { x: 0, y: 0, z: 0 }, to: { x: 1, y: 0, z: 0 } }, [blocker]);
  }
}

/**
 * The M4 policy deliberately accepts only the two existing, static terrain
 * contracts. Closing the top-level shape prevents callers from silently
 * attaching unsupported model, mobility, or ray-width semantics to a terrain
 * volume that the legacy evaluator would otherwise ignore.
 */
function validateStaticTerrainBlocker(blocker: TerrainBlocker): void {
  if (!isPlainObject(blocker)) {
    throw new Error('Sampled-cylinder line-of-sight blockers must be plain static terrain objects.');
  }
  const allowedKeys = isLegacyTerrainBlocker(blocker)
    ? ['id', 'footprint', 'minZ', 'maxZ']
    : ['id', 'footprint', 'minZ', 'maxZ', 'occlusionBands'];
  const unexpectedKeys = Object.keys(blocker).filter((key) => !allowedKeys.includes(key));
  if (unexpectedKeys.length > 0) {
    throw new Error(`Sampled-cylinder line-of-sight rejects unsupported blocker fields: ${unexpectedKeys.sort(compareIds).join(', ')}.`);
  }
}

function isLegacyTerrainBlocker(blocker: TerrainBlocker): boolean {
  return isPlainObject(blocker.footprint)
    && Object.prototype.hasOwnProperty.call(blocker.footprint, 'kind')
    && blocker.footprint.kind === 'convex-polygon';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

function samePoint(left: Point3, right: Point3): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

/**
 * The shared evaluator classifies a zero-length ray before inspecting terrain.
 * For this policy, a coincident representative pair still contacts a closed
 * terrain volume, so probe vertically by one world unit and retain only hits
 * present at t=0. This does not make terrain one unit away block the point.
 */
function degeneratePointBlockerHits(point: Point3, blockers: readonly TerrainBlocker[]): readonly LineOfSightBlockerHit[] {
  const probeEnd = point.z < Number.MAX_SAFE_INTEGER
    ? { x: point.x, y: point.y, z: point.z + 1 }
    : { x: point.x, y: point.y, z: point.z - 1 };
  return evaluateLineOfSight({ from: point, to: probeEnd }, blockers).blockerHits
    .filter((hit) => hit.enterT === 0)
    // The probe determines containment only. Evidence must still describe the
    // actual zero-length candidate, so its sole contact lies at t=0.
    .map((hit) => ({
      ...hit,
      enterT: 0,
      exitT: 0,
      enterPoint: point,
      exitPoint: point
    }));
}

function witness(
  candidate: SampledCylinderLineOfSightCandidate,
  ray: LineOfSightRay,
  blockerHits: readonly LineOfSightBlockerHit[]
): SampledCylinderLineOfSightWitness {
  return { pairIndex: candidate.pairIndex, sourcePoint: candidate.sourcePoint, targetPoint: candidate.targetPoint, ray, blockerHits };
}

function blockedEvidence(
  candidate: SampledCylinderLineOfSightCandidate,
  ray: LineOfSightRay,
  blockerHits: readonly LineOfSightBlockerHit[],
  firstBlocker: LineOfSightBlockerHit
): SampledCylinderLineOfSightBlockedEvidence {
  return { ...witness(candidate, ray, blockerHits), firstBlocker };
}

function summary(
  evaluatedPairCount: number,
  blockedPairCount: number,
  degeneratePairCount: number,
  blockerIds: ReadonlySet<string>
): SampledCylinderLineOfSightSummary {
  return {
    policy: SAMPLED_CYLINDER_LINE_OF_SIGHT_POLICY,
    candidatePairCount: SAMPLED_CYLINDER_LINE_OF_SIGHT_POLICY.candidatePairCount,
    evaluatedPairCount,
    blockedPairCount,
    degeneratePairCount,
    blockerIds: [...blockerIds].sort(compareIds)
  };
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
