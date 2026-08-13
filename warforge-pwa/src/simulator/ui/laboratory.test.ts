import { describe, expect, it } from 'vitest';
import { LABORATORY_MODELS, LABORATORY_TERRAIN, inchesFromWorldUnits, inspectLaboratory } from './laboratory';

describe('simulator laboratory projection', () => {
  it('keeps the ruler in exact world units and exposes its inch presentation separately', () => {
    const analysis = inspectLaboratory(LABORATORY_MODELS, 'amber-1', 'cobalt-1', null);
    expect(analysis.rulerDistance).toBe(7_840);
    expect(analysis.centerDistance).toBe(8_600);
    expect(inchesFromWorldUnits(254)).toBe(1);
    expect(analysis.centerDistance).toBeGreaterThan(analysis.rulerDistance ?? 0);
  });

  it('projects the generic movement verdict from a lab drag instead of silently snapping the model', () => {
    const analysis = inspectLaboratory(
      LABORATORY_MODELS,
      'amber-1',
      'cobalt-1',
      { modelId: 'amber-1', from: { x: 2_900, y: 4_800 }, to: { x: 11_500, y: 4_800 } }
    );
    expect(analysis.movementVerdict).toMatchObject({
      allowed: false,
      reason: 'collision',
      firstCollision: {
        obstacleId: 'amber-2',
        pathSegmentIndex: 0,
        contact: { classification: 'touching', leftKind: 'circle', rightKind: 'circle' }
      }
    });
    expect(analysis.movementVerdict?.firstCollision?.segmentT).toBeCloseTo(0.03508330116234376, 12);
    expect(analysis.movementVerdict?.firstCollision?.pathDistance).toBeCloseTo(301.71638999615635, 9);
  });

  it('keeps an outside-board rejection and its crossed edge explainable', () => {
    const analysis = inspectLaboratory(
      LABORATORY_MODELS,
      'amber-3',
      'cobalt-1',
      { modelId: 'amber-3', from: { x: 3_100, y: 6_100 }, to: { x: 3_100, y: 12_000 } }
    );
    expect(analysis.movementVerdict).toMatchObject({
      allowed: false,
      reason: 'outside-board',
      boardExit: {
        pathSegmentIndex: 0,
        segmentT: 0.7959322033898305,
        pathDistance: 4_696,
        containment: { crossedEdges: ['top'] }
      }
    });
  });

  it('projects terrain-backed LoS explanations through the pure geometry API', () => {
    const analysis = inspectLaboratory(LABORATORY_MODELS, 'amber-1', 'cobalt-1', null);
    expect(LABORATORY_TERRAIN).toHaveLength(2);
    expect(analysis.lineOfSight?.reason).toBe('blocked');
    expect(analysis.lineOfSight?.firstBlocker).toMatchObject({
      blockerId: 'ruin-amber',
      occlusionBandIndex: 0,
      exitT: 0.5387596899224806,
      enterPoint: { y: 4_800, z: 600 },
      exitPoint: { x: 7_533.333333333333, y: 4_800, z: 600 }
    });
    expect(analysis.lineOfSight?.firstBlocker?.enterT).toBeCloseTo(0.26411960132890366, 12);
    expect(analysis.lineOfSight?.firstBlocker?.enterPoint.x).toBeCloseTo(5_171.428571428572, 9);
  });
});
