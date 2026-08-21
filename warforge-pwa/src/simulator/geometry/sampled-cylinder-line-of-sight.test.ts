import { expect, expectTypeOf, describe, it } from 'vitest';
import {
  SAMPLED_CYLINDER_LINE_OF_SIGHT_POLICY,
  evaluateSampledCylinderLineOfSight,
  generateSampledCylinderLineOfSightCandidates,
  generateSampledCylinderPoints,
  type SampledCylinderHitbox
} from './sampled-cylinder-line-of-sight';

const square = (minX: number, minY: number, maxX: number, maxY: number) => ({
  kind: 'convex-polygon' as const,
  vertices: [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }]
});

const cylinder = (x: number, y: number, z: number, radius = 160, height = 400): SampledCylinderHitbox => ({
  center: { x, y, z },
  radius,
  height
});

describe('m4 sampled-cylinder line of sight', () => {
  it('generates the exact z-major points and stable ids for radius 160 and height 400', () => {
    expect(generateSampledCylinderPoints(cylinder(1_000, -200, 50))).toEqual([
      { id: 'bottom.center', verticalPosition: 'bottom', horizontalPosition: 'center', point: { x: 1_000, y: -200, z: 50 } },
      { id: 'bottom.east', verticalPosition: 'bottom', horizontalPosition: 'east', point: { x: 1_160, y: -200, z: 50 } },
      { id: 'bottom.north', verticalPosition: 'bottom', horizontalPosition: 'north', point: { x: 1_000, y: -40, z: 50 } },
      { id: 'bottom.west', verticalPosition: 'bottom', horizontalPosition: 'west', point: { x: 840, y: -200, z: 50 } },
      { id: 'bottom.south', verticalPosition: 'bottom', horizontalPosition: 'south', point: { x: 1_000, y: -360, z: 50 } },
      { id: 'middle.center', verticalPosition: 'middle', horizontalPosition: 'center', point: { x: 1_000, y: -200, z: 250 } },
      { id: 'middle.east', verticalPosition: 'middle', horizontalPosition: 'east', point: { x: 1_160, y: -200, z: 250 } },
      { id: 'middle.north', verticalPosition: 'middle', horizontalPosition: 'north', point: { x: 1_000, y: -40, z: 250 } },
      { id: 'middle.west', verticalPosition: 'middle', horizontalPosition: 'west', point: { x: 840, y: -200, z: 250 } },
      { id: 'middle.south', verticalPosition: 'middle', horizontalPosition: 'south', point: { x: 1_000, y: -360, z: 250 } },
      { id: 'top.center', verticalPosition: 'top', horizontalPosition: 'center', point: { x: 1_000, y: -200, z: 450 } },
      { id: 'top.east', verticalPosition: 'top', horizontalPosition: 'east', point: { x: 1_160, y: -200, z: 450 } },
      { id: 'top.north', verticalPosition: 'top', horizontalPosition: 'north', point: { x: 1_000, y: -40, z: 450 } },
      { id: 'top.west', verticalPosition: 'top', horizontalPosition: 'west', point: { x: 840, y: -200, z: 450 } },
      { id: 'top.south', verticalPosition: 'top', horizontalPosition: 'south', point: { x: 1_000, y: -360, z: 450 } }
    ]);
  });

  it('generates the exact z-major coordinates for radius 200 and height 450', () => {
    expect(generateSampledCylinderPoints(cylinder(-50, 70, 10, 200, 450)).map((sample) => sample.point)).toEqual([
      { x: -50, y: 70, z: 10 }, { x: 150, y: 70, z: 10 }, { x: -50, y: 270, z: 10 }, { x: -250, y: 70, z: 10 }, { x: -50, y: -130, z: 10 },
      { x: -50, y: 70, z: 235 }, { x: 150, y: 70, z: 235 }, { x: -50, y: 270, z: 235 }, { x: -250, y: 70, z: 235 }, { x: -50, y: -130, z: 235 },
      { x: -50, y: 70, z: 460 }, { x: 150, y: 70, z: 460 }, { x: -50, y: 270, z: 460 }, { x: -250, y: 70, z: 460 }, { x: -50, y: -130, z: 460 }
    ]);
  });

  it('uses 225 source-major, target-minor candidates and the first clear canonical witness', () => {
    const source = cylinder(0, 0, 0);
    const target = cylinder(2_000, 0, 0);
    const candidates = generateSampledCylinderLineOfSightCandidates(source, target);
    const result = evaluateSampledCylinderLineOfSight(source, target, []);

    expect(candidates).toHaveLength(225);
    expect(candidates.slice(0, 6).map((candidate) => [candidate.pairIndex, candidate.sourcePoint.id, candidate.targetPoint.id])).toEqual([
      [0, 'bottom.center', 'bottom.center'], [1, 'bottom.center', 'bottom.east'], [2, 'bottom.center', 'bottom.north'],
      [3, 'bottom.center', 'bottom.west'], [4, 'bottom.center', 'bottom.south'], [5, 'bottom.center', 'middle.center']
    ]);
    expect(result).toMatchObject({
      status: 'visible',
      visible: true,
      policy: SAMPLED_CYLINDER_LINE_OF_SIGHT_POLICY,
      candidatePairCount: 225,
      evaluatedPairCount: 1,
      blockedPairCount: 0,
      degeneratePairCount: 0,
      reason: 'sample-clear',
      firstClearWitness: { pairIndex: 0, sourcePoint: { id: 'bottom.center' }, targetPoint: { id: 'bottom.center' } }
    });
  });

  it('processes every candidate when terrain blocks all rays and preserves first evidence', () => {
    const source = cylinder(0, 0, 0);
    const target = cylinder(2_000, 0, 0);
    const wall = { id: 'wall', footprint: square(900, -1_000, 1_100, 1_000), minZ: -100, maxZ: 1_000 };
    const result = evaluateSampledCylinderLineOfSight(source, target, [wall]);

    expect(result).toMatchObject({
      status: 'blocked',
      visible: false,
      candidatePairCount: 225,
      evaluatedPairCount: 225,
      blockedPairCount: 225,
      degeneratePairCount: 0,
      reason: 'all-samples-blocked',
      blockerIds: ['wall'],
      firstBlockedEvidence: {
        pairIndex: 0,
        sourcePoint: { id: 'bottom.center' },
        targetPoint: { id: 'bottom.center' },
        firstBlocker: { blockerId: 'wall' }
      }
    });
  });

  it('counts degenerate representative-point contacts with closed terrain as blocked', () => {
    const source = cylinder(0, 0, 0);
    const target = cylinder(320, 0, 0);
    const enclosingTerrain = { id: 'enclosing', footprint: square(-1_000, -1_000, 1_000, 1_000), minZ: -100, maxZ: 1_000 };
    const result = evaluateSampledCylinderLineOfSight(source, target, [enclosingTerrain]);

    expect(result).toMatchObject({
      status: 'blocked',
      reason: 'all-samples-blocked',
      evaluatedPairCount: 225,
      blockedPairCount: 225,
      degeneratePairCount: 3
    });

    expect(result.status).toBe('blocked');
  });

  it('canonicalizes a degenerate blocked witness at its sole contact point', () => {
    const coincident = cylinder(0, 0, 0);
    const enclosingTerrain = { id: 'enclosing', footprint: square(-1_000, -1_000, 1_000, 1_000), minZ: -100, maxZ: 1_000 };
    const result = evaluateSampledCylinderLineOfSight(coincident, coincident, [enclosingTerrain]);

    if (result.status === 'blocked') {
      const degenerateEvidence = result.firstBlockedEvidence;
      expect(degenerateEvidence).toMatchObject({
        pairIndex: 0,
        ray: { from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 0 } }
      });
      expect(degenerateEvidence.firstBlocker).toMatchObject({
        enterT: 0,
        exitT: 0,
        enterPoint: { x: 0, y: 0, z: 0 },
        exitPoint: { x: 0, y: 0, z: 0 }
      });
    } else {
      throw new Error('The enclosing terrain must block the coincident cylinders.');
    }
  });

  it('keeps an all-degenerate result unreachable for valid positive cylinder hitboxes', () => {
    const coincident = cylinder(0, 0, 0);
    const result = evaluateSampledCylinderLineOfSight(coincident, coincident, []);

    expect(result).toMatchObject({
      status: 'visible',
      evaluatedPairCount: 2,
      blockedPairCount: 0,
      degeneratePairCount: 1,
      firstClearWitness: { pairIndex: 1, sourcePoint: { id: 'bottom.center' }, targetPoint: { id: 'bottom.east' } }
    });
  });

  it('is invariant to terrain blocker input permutation and sorts observed ids', () => {
    const source = cylinder(0, 0, 0);
    const target = cylinder(2_000, 0, 0);
    const blockers = [
      { id: 'zulu', footprint: square(900, -1_000, 1_100, 1_000), minZ: -100, maxZ: 1_000 },
      { id: 'alpha', footprint: square(900, -1_000, 1_100, 1_000), minZ: -100, maxZ: 1_000 }
    ] as const;

    const ordered = evaluateSampledCylinderLineOfSight(source, target, blockers);
    const permuted = evaluateSampledCylinderLineOfSight(source, target, [...blockers].reverse());

    expect(ordered).toEqual(permuted);
    expect(ordered).toMatchObject({ blockerIds: ['alpha', 'zulu'], firstBlockedEvidence: { firstBlocker: { blockerId: 'alpha' } } });
  });

  it('keeps endpoint and terrain-boundary contact blocking, without endpoint exclusions', () => {
    const source = cylinder(0, 0, 0);
    const target = cylinder(2_000, 0, 0);
    const boundaryWall = { id: 'boundary-wall', footprint: square(2_000, -1_000, 2_100, 1_000), minZ: -100, maxZ: 1_000 };
    const result = evaluateSampledCylinderLineOfSight(source, target, [boundaryWall]);

    expect(result).toMatchObject({
      status: 'visible',
      evaluatedPairCount: 4,
      blockedPairCount: 3,
      blockerIds: ['boundary-wall'],
      firstClearWitness: { pairIndex: 3, targetPoint: { id: 'bottom.west' } }
    });
  });

  it('rejects invalid cylinder input, blocker ids, and terrain geometry', () => {
    expect(() => generateSampledCylinderPoints(cylinder(0, 0, 0, 0, 400))).toThrow(/positive safe integer/i);
    expect(() => generateSampledCylinderPoints(cylinder(0, 0, 0, 160, 401))).toThrow(/positive, even safe integer/i);
    expect(() => generateSampledCylinderPoints(cylinder(0.5, 0, 0))).toThrow(/safe integer/i);

    const wall = { footprint: square(900, -1_000, 1_100, 1_000), minZ: -100, maxZ: 1_000 };
    expect(() => evaluateSampledCylinderLineOfSight(cylinder(0, 0, 0), cylinder(2_000, 0, 0), [
      { ...wall, id: 'duplicate' }, { ...wall, id: 'duplicate' }
    ])).toThrow(/must be unique/i);
    expect(() => evaluateSampledCylinderLineOfSight(cylinder(0, 0, 0), cylinder(2_000, 0, 0), [
      { ...wall, id: ' ' }
    ])).toThrow(/non-empty/i);
    expect(() => evaluateSampledCylinderLineOfSight(cylinder(0, 0, 0), cylinder(2_000, 0, 0), [{
      id: 'invalid-footprint',
      footprint: {
        kind: 'convex-polygon' as const,
        vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }]
      },
      minZ: 0,
      maxZ: 100
    }])).toThrow(/polygon/i);
    expect(() => evaluateSampledCylinderLineOfSight(cylinder(0, 0, 0), cylinder(2_000, 0, 0), [{
      ...wall,
      id: 'unsupported-model',
      mobile: true,
      rayWidth: 10,
      blockerKind: 'model'
    } as unknown as import('./types').TerrainBlocker])).toThrow(/unsupported blocker fields/i);
  });

  it('has no orientation input because the cylindrical footprint is circular', () => {
    expectTypeOf<SampledCylinderHitbox>().not.toHaveProperty('orientationDegrees');
    const hitbox: SampledCylinderHitbox = cylinder(0, 0, 0);
    expect(Object.hasOwn(hitbox, 'orientationDegrees')).toBe(false);
  });

  it('freezes the exported policy so JavaScript callers cannot mutate it', () => {
    expect(Object.isFrozen(SAMPLED_CYLINDER_LINE_OF_SIGHT_POLICY)).toBe(true);
    expect(() => {
      (SAMPLED_CYLINDER_LINE_OF_SIGHT_POLICY as { id: string }).id = 'changed';
    }).toThrow();
    expect(SAMPLED_CYLINDER_LINE_OF_SIGHT_POLICY.id).toBe('m4-sampled-cylinder-los-v1');
    expect(SAMPLED_CYLINDER_LINE_OF_SIGHT_POLICY).toMatchObject({
      rayWidthWorldUnits: 0,
      blockerDomain: 'static-terrain-only',
      modelOcclusion: 'excluded'
    });
  });
});
