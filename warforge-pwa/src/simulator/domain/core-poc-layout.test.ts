import { describe, expect, it } from 'vitest';
import layoutRaw from '../../../data/simulator/core-poc-layout.json';
import measurementsRaw from '../../../data/simulator/gdm-2026-layout-measurements.json';
import {
  compileCorePocSpatialRuntimeV1,
  materializeCorePocSpatialRuntimeV1,
  type CorePocLayoutDocumentV1,
  type CorePocLayoutMeasurementsV1
} from './core-poc-layout';

function document(): CorePocLayoutDocumentV1 {
  return structuredClone(layoutRaw) as unknown as CorePocLayoutDocumentV1;
}

const measurements = measurementsRaw as unknown as CorePocLayoutMeasurementsV1;

describe('core POC spatial layout compiler', () => {
  it('binds every verified callout and materializes the owner-reviewed physical volumes', () => {
    const runtime = compileCorePocSpatialRuntimeV1(document(), measurements);

    expect(runtime.readyForPlay).toBe(true);
    expect(runtime.layout.board).toEqual({ width: 11_176, height: 15_240 });
    expect(runtime.measurementEvidence).toHaveLength(32);
    expect(runtime.measurementEvidence[0]).toEqual(expect.objectContaining({
      measurementId: 'm001',
      subjectId: 'terrain-upper-left-large',
      coordinateTenthsOfInch: 41,
      worldCoordinate: 1_041
    }));
    expect(runtime.terrainAreas).toHaveLength(13);
    expect(runtime.featureSurfaces).toHaveLength(28);
    expect(runtime.layout.terrain).toHaveLength(41);
    expect(runtime.featureSurfaces.filter((surface) => surface.kind === 'ruin-wall').every((surface) => surface.height === 1_270 && surface.executable)).toBe(true);
    expect(runtime.featureSurfaces.filter((surface) => surface.kind === 'obstacle').every((surface) => surface.height === 508 && surface.executable)).toBe(true);
    expect(runtime.pendingReview).toEqual([]);
    expect(runtime.objectiveRoleById).toEqual({
      'objective-attacker-home': 'attacker-home',
      'objective-defender-home': 'defender-home',
      'objective-no-mans-land-1': 'no-mans-land-1',
      'objective-no-mans-land-2': 'no-mans-land-2',
      'objective-centre-1': 'centre-1',
      'objective-centre-2': 'centre-2'
    });
  });

  it('materializes the same compact runtime without loading the 45-layout archive in gameplay', () => {
    const source = document();

    expect(materializeCorePocSpatialRuntimeV1(source)).toEqual(
      compileCorePocSpatialRuntimeV1(source, measurements)
    );
  });

  it('refuses a geometry binding that drifts from its reviewed measurement', () => {
    const changed = document();
    const upperLeft = changed.terrain.find((terrain) => terrain.id === 'terrain-upper-left-large')!;
    (upperLeft.baseplateTenthsInch[1] as { y: number }).y = 40;

    expect(() => compileCorePocSpatialRuntimeV1(changed, measurements)).toThrow(/m001 ne correspond pas/);
  });

  it('refuses an objective centre that no longer matches the source-image projection', () => {
    const changed = document();
    (changed.objectives[0].centerTenthsInch as { x: number }).x += 1;

    expect(() => compileCorePocSpatialRuntimeV1(changed, measurements)).toThrow(/projection pixel\/plateau incohérente/);
  });

  it('does not activate feature volumes when one owner-review field is missing', () => {
    const incomplete = document();
    (incomplete.physicalConvention as { reviewedBy: string | null }).reviewedBy = null;

    const runtime = compileCorePocSpatialRuntimeV1(incomplete, measurements);
    expect(runtime.readyForPlay).toBe(false);
    expect(runtime.layout.terrain).toHaveLength(13);
    expect(runtime.featureSurfaces.every((surface) => surface.height === null && !surface.executable)).toBe(true);
  });
});
