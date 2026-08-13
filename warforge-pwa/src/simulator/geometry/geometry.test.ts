import { describe, expect, it } from 'vitest';
import {
  WORLD_UNITS_PER_INCH,
  SpatialHash,
  checkUnitCoherency,
  classifyBoardContainment,
  classifyFootprintContact,
  circleIntersectsCircle,
  circleIntersectsConvexPolygon,
  convexPolygonsOverlap,
  distanceBetweenSegments,
  distancePointToSegment,
  evaluateLineOfSight,
  evaluateLineOfSightRays,
  evaluateMovement,
  firstSweptFootprintCollision,
  firstSweptCircleCollision,
  footprintBounds,
  footprintDistance,
  isPointOnSegment,
  lineMultiPolygonIntervals,
  movementPathLength,
  pointInConvexPolygon,
  pointInMultiPolygonArea,
  validateMultiPolygonArea
} from './index';

const square = (minX: number, minY: number, maxX: number, maxY: number) => ({
  kind: 'convex-polygon' as const,
  vertices: [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }]
});

describe('simulator geometry primitives', () => {
  it('uses 254 integer world units per inch', () => {
    expect(WORLD_UNITS_PER_INCH).toBe(254);
  });

  it('handles segment tests and distances, including degenerate segments', () => {
    const horizontal = { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
    expect(isPointOnSegment({ x: 5, y: 0 }, horizontal)).toBe(true);
    expect(isPointOnSegment({ x: 11, y: 0 }, horizontal)).toBe(false);
    expect(distancePointToSegment({ x: 5, y: 3 }, horizontal)).toBe(3);
    expect(distancePointToSegment({ x: 3, y: 4 }, { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } })).toBe(5);
    expect(distanceBetweenSegments(horizontal, { start: { x: 4, y: -2 }, end: { x: 4, y: 2 } })).toBe(0);
  });

  it('calculates circle and convex polygon contact with touching boundaries inclusive', () => {
    const circle = (x: number, y: number, radius: number) => ({ kind: 'circle' as const, center: { x, y }, radius });
    expect(circleIntersectsCircle(circle(0, 0, 2), circle(4, 0, 2))).toBe(true);
    expect(circleIntersectsCircle(circle(0, 0, 2), circle(5, 0, 2))).toBe(false);
    expect(circleIntersectsConvexPolygon(circle(-1, 5, 1), square(0, 0, 10, 10))).toBe(true);
    expect(circleIntersectsConvexPolygon(circle(-2, 5, 1), square(0, 0, 10, 10))).toBe(false);
    expect(pointInConvexPolygon({ x: 0, y: 5 }, square(0, 0, 10, 10))).toBe(true);
  });

  it('uses SAT and footprint edge distance for every supported footprint pairing', () => {
    const first = square(0, 0, 10, 10);
    const touching = square(10, 2, 20, 8);
    const separate = square(12, 0, 20, 10);
    expect(convexPolygonsOverlap(first, touching)).toBe(true);
    expect(convexPolygonsOverlap(first, separate)).toBe(false);
    expect(footprintDistance(first, separate)).toBe(2);
    expect(footprintDistance({ kind: 'circle', center: { x: -5, y: 5 }, radius: 2 }, first)).toBe(3);
  });
});

describe('spatial broad phase', () => {
  it('returns stable candidate entries and de-duplicated pairs', () => {
    const hash = new SpatialHash<string>(10);
    hash.insert({ id: 'bravo', bounds: { minX: 8, minY: 0, maxX: 12, maxY: 2 }, value: 'B' });
    hash.insert({ id: 'alpha', bounds: { minX: 0, minY: 0, maxX: 15, maxY: 2 }, value: 'A' });
    hash.insert({ id: 'charlie', bounds: { minX: 30, minY: 0, maxX: 31, maxY: 2 }, value: 'C' });
    expect(hash.query({ minX: 9, minY: 0, maxX: 9, maxY: 1 }).map((entry) => entry.id)).toEqual(['alpha', 'bravo']);
    expect(hash.queryPairs().map(([left, right]) => [left.id, right.id])).toEqual([['alpha', 'bravo']]);
    hash.update({ id: 'bravo', bounds: { minX: 40, minY: 0, maxX: 41, maxY: 1 }, value: 'B2' });
    expect(hash.queryPairs()).toEqual([]);
  });

  it('accepts conservative fractional bounds derived from rotated profiles without losing collisions', () => {
    const footprints = [
      { id: 'capsule', footprint: { kind: 'capsule' as const, center: { x: 10, y: 10 }, radius: 2, length: 10, orientationDegrees: 45 } },
      { id: 'capsule-hit', footprint: { kind: 'circle' as const, center: { x: 14, y: 14 }, radius: 2 } },
      {
        id: 'polygon',
        footprint: {
          kind: 'oriented-convex-polygon' as const,
          center: { x: 30, y: 10 },
          orientationDegrees: 45,
          vertices: [{ x: -4, y: -2 }, { x: 4, y: -2 }, { x: 4, y: 2 }, { x: -4, y: 2 }]
        }
      },
      { id: 'polygon-hit', footprint: { kind: 'circle' as const, center: { x: 34, y: 10 }, radius: 2 } }
    ];
    expect(Number.isInteger(footprintBounds(footprints[0].footprint).minX)).toBe(false);
    const hash = new SpatialHash<typeof footprints[number]>(10);
    footprints.forEach((entry) => hash.insert({ id: entry.id, bounds: footprintBounds(entry.footprint), value: entry }));
    const broad = hash.queryPairs()
      .filter(([left, right]) => classifyFootprintContact(left.value.footprint, right.value.footprint).classification !== 'separated')
      .map(([left, right]) => `${left.id}/${right.id}`);
    const brute: string[] = [];
    for (let left = 0; left < footprints.length; left += 1) for (let right = left + 1; right < footprints.length; right += 1) {
      if (classifyFootprintContact(footprints[left].footprint, footprints[right].footprint).classification !== 'separated') {
        brute.push([footprints[left].id, footprints[right].id].sort().join('/'));
      }
    }
    expect(broad).toEqual(brute.sort());
  });
});

describe('movement and coherency', () => {
  it('measures polylines and detects the first circular swept collision exactly', () => {
    expect(movementPathLength([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 8 }])).toBe(9);
    const collision = firstSweptCircleCollision(
      { kind: 'circle', center: { x: 0, y: 0 }, radius: 1 },
      [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      [{ id: 'enemy', footprint: { kind: 'circle', center: { x: 8, y: 0 }, radius: 1 } }]
    );
    expect(collision).toMatchObject({ obstacleId: 'enemy', pathSegmentIndex: 0, segmentT: 0.6, pathDistance: 6, contactCenter: { x: 6, y: 0 } });
  });

  it('detects swept contact against a convex polygon expanded by the mover radius', () => {
    const collision = firstSweptCircleCollision(
      { kind: 'circle', center: { x: 0, y: 0 }, radius: 1 },
      [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      [{ id: 'wall', footprint: square(7, -2, 9, 2) }]
    );
    expect(collision?.contactCenter.x).toBeCloseTo(6);
    expect(collision?.obstacleId).toBe('wall');
  });

  it('checks coherence from footprint-edge distances and reports every isolated model', () => {
    const result = checkUnitCoherency([
      { id: 'a', footprint: { kind: 'circle', center: { x: 0, y: 0 }, radius: 1 } },
      { id: 'b', footprint: { kind: 'circle', center: { x: 4, y: 0 }, radius: 1 } },
      { id: 'c', footprint: { kind: 'circle', center: { x: 20, y: 0 }, radius: 1 } }
    ], 2);
    expect(result.isCoherent).toBe(false);
    expect(result.members.find((member) => member.id === 'a')?.neighbourIds).toEqual(['b']);
    expect(result.incoherentMemberIds).toEqual(['c']);
    expect(checkUnitCoherency([{ id: 'only', footprint: { kind: 'circle', center: { x: 0, y: 0 }, radius: 1 } }], 2, 2).isCoherent).toBe(true);
  });
});

describe('deterministic 2.5D line of sight', () => {
  const blocker = { id: 'ruin', footprint: square(5, -1, 7, 1), minZ: 0, maxZ: 5 };

  it('returns the blocking volume and contact interval that produced a blocked verdict', () => {
    const result = evaluateLineOfSight({ from: { x: 0, y: 0, z: 2 }, to: { x: 10, y: 0, z: 2 } }, [blocker]);
    expect(result).toMatchObject({ visible: false, reason: 'blocked', firstBlocker: { blockerId: 'ruin', enterT: 0.5, exitT: 0.7 } });
    expect(result.firstBlocker?.enterPoint).toEqual({ x: 5, y: 0, z: 2 });
  });

  it('keeps sight clear when the ray is above the blocking volume and supports exclusions', () => {
    expect(evaluateLineOfSight({ from: { x: 0, y: 0, z: 6 }, to: { x: 10, y: 0, z: 6 } }, [blocker]).visible).toBe(true);
    expect(evaluateLineOfSight({ from: { x: 0, y: 0, z: 2 }, to: { x: 10, y: 0, z: 2 } }, [blocker], { excludedBlockerIds: ['ruin'] }).visible).toBe(true);
  });

  it('handles vertical sight rays and rejects zero-length rays explicitly', () => {
    expect(evaluateLineOfSight({ from: { x: 6, y: 0, z: -1 }, to: { x: 6, y: 0, z: 6 } }, [blocker]).firstBlocker).toMatchObject({ enterT: 1 / 7, exitT: 6 / 7 });
    expect(evaluateLineOfSight({ from: { x: 0, y: 0, z: 1 }, to: { x: 0, y: 0, z: 1 } }, []).reason).toBe('degenerate');
  });

  it('accepts a target when any supplied ray is clear and preserves ray explanations', () => {
    const result = evaluateLineOfSightRays([
      { from: { x: 0, y: 0, z: 2 }, to: { x: 10, y: 0, z: 2 } },
      { from: { x: 0, y: 0, z: 6 }, to: { x: 10, y: 0, z: 6 } }
    ], [blocker]);
    expect(result).toMatchObject({ visible: true, reason: 'clear', rayResults: [{ reason: 'blocked' }, { reason: 'clear' }] });
  });
});

describe('complete deterministic footprint contract', () => {
  it('classifies circles, capsules and oriented convex polygons symmetrically', () => {
    const capsule = { kind: 'capsule' as const, center: { x: 0, y: 0 }, radius: 2, length: 8, orientationDegrees: 0 };
    const tangentCircle = { kind: 'circle' as const, center: { x: 0, y: 4 }, radius: 2 };
    const overlapCircle = { kind: 'circle' as const, center: { x: 0, y: 3 }, radius: 2 };
    const oriented = {
      kind: 'oriented-convex-polygon' as const,
      center: { x: 10, y: 0 },
      orientationDegrees: 90,
      vertices: [{ x: -2, y: -1 }, { x: 2, y: -1 }, { x: 2, y: 1 }, { x: -2, y: 1 }]
    };
    expect(classifyFootprintContact(capsule, tangentCircle).classification).toBe('touching');
    expect(classifyFootprintContact(capsule, overlapCircle).classification).toBe('overlapping');
    expect(classifyFootprintContact(capsule, oriented).distance).toBe(classifyFootprintContact(oriented, capsule).distance);
    expect(footprintDistance(oriented, { kind: 'circle', center: { x: 8, y: 0 }, radius: 1 })).toBe(0);
    expect(classifyFootprintContact(square(0, 0, 10, 10), square(5, 0, 15, 10)).classification).toBe('overlapping');
    expect(classifyFootprintContact(square(0, 0, 10, 10), square(10, 0, 15, 10)).classification).toBe('touching');
  });

  it('uses exact Minkowski sweeps for capsule and convex polygon movers', () => {
    const capsuleCollision = firstSweptFootprintCollision(
      { kind: 'capsule', center: { x: 0, y: 0 }, radius: 1, length: 4, orientationDegrees: 0 },
      [{ position: { x: 0, y: 0 }, orientationDegrees: 0 }, { position: { x: 20, y: 0 }, orientationDegrees: 0 }],
      [{ id: 'circle', footprint: { kind: 'circle', center: { x: 10, y: 0 }, radius: 1 } }]
    );
    expect(capsuleCollision).toMatchObject({ obstacleId: 'circle', segmentT: 0.3, contactCenter: { x: 6, y: 0 } });

    const polygonCollision = firstSweptFootprintCollision(
      square(0, -1, 2, 1),
      [{ position: { x: 0, y: -1 } }, { position: { x: 10, y: -1 } }],
      [{ id: 'circle', footprint: { kind: 'circle', center: { x: 8, y: 0 }, radius: 1 } }]
    );
    expect(polygonCollision).toMatchObject({ obstacleId: 'circle', segmentT: 0.5, contactCenter: { x: 5, y: -1 } });

    const fractionalContact = firstSweptFootprintCollision(
      { kind: 'circle', center: { x: 0, y: 0 }, radius: 1 },
      [{ position: { x: 0, y: 0 } }, { position: { x: 10, y: 0 } }],
      [{ id: 'offset', footprint: { kind: 'circle', center: { x: 5, y: 2 }, radius: 2 } }]
    );
    expect(fractionalContact?.segmentT).toBeCloseTo((5 - Math.sqrt(5)) / 10);
    expect(fractionalContact?.contact.classification).toBe('touching');

    expect(firstSweptFootprintCollision(
      { kind: 'circle', center: { x: 0, y: 0 }, radius: 0 },
      [{ position: { x: 0, y: 0 } }, { position: { x: 10, y: 0 } }],
      [{ id: 'zero-capsule', footprint: { kind: 'capsule', center: { x: 6, y: 0 }, radius: 0, length: 2, orientationDegrees: 0 } }]
    )).toMatchObject({ obstacleId: 'zero-capsule', segmentT: 0.5, contactCenter: { x: 5, y: 0 } });
  });

  it('reports static overlap identically for one pose and a zero-length segment', () => {
    const moving = { kind: 'circle' as const, center: { x: 0, y: 0 }, radius: 2 };
    const poses = [{ position: { x: 0, y: 0 } }] as const;
    const obstacles = [{ id: 'static', footprint: { kind: 'circle' as const, center: { x: 3, y: 0 }, radius: 2 } }];
    expect(firstSweptFootprintCollision(moving, poses, obstacles)).toEqual(
      firstSweptFootprintCollision(moving, [poses[0], poses[0]], obstacles)
    );
    expect(evaluateMovement(moving, poses, obstacles)).toMatchObject({ allowed: false, reason: 'collision' });
  });

  it('rejects continuous orientation sweeps instead of sampling a rotation', () => {
    expect(() => firstSweptFootprintCollision(
      { kind: 'capsule', center: { x: 0, y: 0 }, radius: 1, length: 4, orientationDegrees: 0 },
      [{ position: { x: 0, y: 0 }, orientationDegrees: 0 }, { position: { x: 5, y: 0 }, orientationDegrees: 90 }],
      []
    )).toThrow(/orientation sweeps/i);
  });

  it('allows touching a closed board boundary but rejects crossing it', () => {
    const moving = { kind: 'circle' as const, center: { x: 1, y: 5 }, radius: 1 };
    const board = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    expect(classifyBoardContainment(moving, board).classification).toBe('touching-boundary');
    expect(evaluateMovement(moving, [{ position: { x: 1, y: 5 } }, { position: { x: 9, y: 5 } }], [], { board })).toMatchObject({ allowed: true, reason: 'clear' });
    expect(evaluateMovement(moving, [{ position: { x: 1, y: 5 } }, { position: { x: 10, y: 5 } }], [], { board })).toMatchObject({ allowed: false, reason: 'outside-board', boardExit: { segmentT: 8 / 9 } });
  });

  it('rejects non-integer spatial input at runtime', () => {
    expect(() => footprintDistance(
      { kind: 'circle', center: { x: 0.5, y: 0 }, radius: 1 },
      { kind: 'circle', center: { x: 0, y: 0 }, radius: 1 }
    )).toThrow(/integer/i);
    expect(() => evaluateLineOfSight({ from: { x: 0, y: 0, z: 0 }, to: { x: 10, y: 0, z: 1.5 } }, [])).toThrow(/integer/i);
    expect(() => checkUnitCoherency([
      { id: 'only', footprint: { kind: 'circle', center: { x: 0.5, y: 0 }, radius: 1 } }
    ], 2)).toThrow(/integer/i);
  });
});

describe('multipolygon terrain and explanatory intervals', () => {
  const areaWithHole = {
    polygons: [{
      outer: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
      holes: [[{ x: 40, y: 40 }, { x: 60, y: 40 }, { x: 60, y: 60 }, { x: 40, y: 60 }]]
    }]
  };

  it('keeps holes empty and exposes their exact line intervals', () => {
    expect(pointInMultiPolygonArea({ x: 20, y: 50 }, areaWithHole)).toBe(true);
    expect(pointInMultiPolygonArea({ x: 50, y: 50 }, areaWithHole)).toBe(false);
    expect(lineMultiPolygonIntervals({ from: { x: -50, y: 50, z: 3 }, to: { x: 150, y: 50, z: 3 } }, areaWithHole)).toEqual([[0.25, 0.45], [0.55, 0.75]]);
  });

  it('uses explicit occlusion bands and lets a ray wholly inside a hole pass', () => {
    const terrain = {
      id: 'windowed-ruin',
      footprint: areaWithHole,
      minZ: 0,
      maxZ: 10,
      occlusionBands: [{ minZ: 2, maxZ: 4 }]
    } as const;
    expect(evaluateLineOfSight({ from: { x: 41, y: 50, z: 3 }, to: { x: 59, y: 50, z: 3 } }, [terrain])).toMatchObject({ visible: true, reason: 'clear' });
    expect(evaluateLineOfSight({ from: { x: -50, y: 50, z: 3 }, to: { x: 150, y: 50, z: 3 } }, [terrain])).toMatchObject({
      visible: false,
      firstBlocker: { blockerId: 'windowed-ruin', occlusionBandIndex: 0, enterT: 0.25, exitT: 0.45 }
    });
    expect(evaluateLineOfSight({ from: { x: -50, y: 50, z: 5 }, to: { x: 150, y: 50, z: 5 } }, [terrain]).visible).toBe(true);
  });

  it('rejects overlapping component interiors but permits boundary-only contact', () => {
    expect(() => validateMultiPolygonArea({
      polygons: [
        { outer: square(0, 0, 10, 10).vertices },
        { outer: square(5, 5, 15, 15).vertices }
      ]
    })).toThrow(/interiors must be disjoint/i);
    expect(() => validateMultiPolygonArea({
      polygons: [
        { outer: square(0, 0, 10, 10).vertices },
        { outer: square(5, 0, 15, 10).vertices }
      ]
    })).toThrow(/interiors must be disjoint/i);
    expect(() => validateMultiPolygonArea({
      polygons: [
        { outer: square(0, 0, 10, 10).vertices },
        { outer: square(10, 0, 20, 10).vertices }
      ]
    })).not.toThrow();
    expect(() => validateMultiPolygonArea({
      polygons: [
        { outer: square(0, 0, 10, 10).vertices },
        { outer: square(10, 2, 20, 8).vertices }
      ]
    })).not.toThrow();
  });
});

describe('deterministic geometry properties', () => {
  const translateCircle = (circle: { readonly kind: 'circle'; readonly center: { readonly x: number; readonly y: number }; readonly radius: number }, dx: number, dy: number) => ({
    ...circle,
    center: { x: circle.center.x + dx, y: circle.center.y + dy }
  });

  it('is translation-invariant, symmetric, and tangency-stable across deterministic cases', () => {
    for (let index = 1; index <= 24; index += 1) {
      const left = { kind: 'circle' as const, center: { x: index * 7, y: -index * 3 }, radius: index % 5 + 1 };
      const right = { kind: 'circle' as const, center: { x: index * 11 + 20, y: index * 5 }, radius: index % 4 + 1 };
      const shiftedLeft = translateCircle(left, 913, -407);
      const shiftedRight = translateCircle(right, 913, -407);
      expect(footprintDistance(left, right)).toBe(footprintDistance(shiftedLeft, shiftedRight));
      expect(classifyFootprintContact(left, right).classification).toBe(classifyFootprintContact(right, left).classification);
      const tangent = { kind: 'circle' as const, center: { x: left.center.x + left.radius + right.radius, y: left.center.y }, radius: right.radius };
      expect(classifyFootprintContact(left, tangent).classification).toBe('touching');
    }
  });

  it('uses id order as the stable tiebreaker and broad phase never loses a brute-force collision', () => {
    const tied = firstSweptCircleCollision(
      { kind: 'circle', center: { x: 0, y: 0 }, radius: 1 },
      [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      [
        { id: 'zulu', footprint: { kind: 'circle', center: { x: 7, y: 2 }, radius: 1 } },
        { id: 'alpha', footprint: { kind: 'circle', center: { x: 7, y: -2 }, radius: 1 } }
      ]
    );
    expect(tied?.obstacleId).toBe('alpha');

    const circles = Array.from({ length: 18 }, (_, index) => ({
      id: `m-${String(index).padStart(2, '0')}`,
      footprint: { kind: 'circle' as const, center: { x: (index % 6) * 8, y: Math.floor(index / 6) * 8 }, radius: index % 3 + 2 }
    }));
    const hash = new SpatialHash<typeof circles[number]>(10);
    circles.forEach((entry) => hash.insert({ id: entry.id, bounds: {
      minX: entry.footprint.center.x - entry.footprint.radius,
      minY: entry.footprint.center.y - entry.footprint.radius,
      maxX: entry.footprint.center.x + entry.footprint.radius,
      maxY: entry.footprint.center.y + entry.footprint.radius
    }, value: entry }));
    const broadPhaseCollisions = hash.queryPairs()
      .filter(([left, right]) => classifyFootprintContact(left.value.footprint, right.value.footprint).classification !== 'separated')
      .map(([left, right]) => `${left.id}/${right.id}`);
    const bruteForceCollisions: string[] = [];
    for (let left = 0; left < circles.length; left += 1) for (let right = left + 1; right < circles.length; right += 1) {
      if (classifyFootprintContact(circles[left].footprint, circles[right].footprint).classification !== 'separated') {
        bruteForceCollisions.push(`${circles[left].id}/${circles[right].id}`);
      }
    }
    expect(broadPhaseCollisions).toEqual(bruteForceCollisions);
  });

  it('keeps multi-ray clear-ray selection in caller order', () => {
    const blocker = { id: 'wall', footprint: square(4, -1, 6, 1), minZ: 0, maxZ: 4 };
    const result = evaluateLineOfSightRays([
      { from: { x: 0, y: 0, z: 2 }, to: { x: 10, y: 0, z: 2 } },
      { from: { x: 0, y: 0, z: 5 }, to: { x: 10, y: 0, z: 5 } },
      { from: { x: 0, y: 0, z: 6 }, to: { x: 10, y: 0, z: 6 } }
    ], [blocker]);
    expect(result.clearRay?.ray.to.z).toBe(5);
  });
});
