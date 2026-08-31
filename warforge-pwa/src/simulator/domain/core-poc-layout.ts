import type {
  MissionObjectiveRoleV1,
  SourceReferenceV1,
  TerrainLayoutV1,
  WorldBoundsV1,
  WorldPoint
} from './types';

export const CORE_POC_LAYOUT_SCHEMA = 'warforge-simulator-core-poc-layout/v1' as const;
export const CORE_POC_LAYOUT_ID = 'disruption-mirror-1-core-poc-v1' as const;

export interface TenthsPointV1 {
  readonly x: number;
  readonly y: number;
}

export interface CorePocLayoutMeasurementsV1 {
  readonly schemaVersion: 'warforge-layout-measurements/v1';
  readonly manifestVersion: string;
  readonly layouts: readonly {
    readonly layoutId: string;
    readonly status: 'verified';
    readonly measurementCount: number;
    readonly measurements: readonly {
      readonly measurementId: string;
      readonly axis: 'x' | 'y';
      readonly coordinateTenthsOfInch: number;
      readonly status: 'verified';
    }[];
  }[];
}

export interface CorePocLayoutFeatureV1 {
  readonly id: string;
  readonly kind: 'ruin-wall' | 'obstacle';
  readonly polygonTenthsInch: readonly TenthsPointV1[];
}

export interface CorePocLayoutTerrainV1 {
  readonly id: string;
  readonly baseplateTenthsInch: readonly TenthsPointV1[];
  readonly anchors?: readonly { readonly id: string; readonly pointTenthsInch: TenthsPointV1 }[];
  readonly subregions?: readonly {
    readonly id: string;
    readonly boundsTenthsInch: { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number };
  }[];
  readonly features: readonly CorePocLayoutFeatureV1[];
}

export interface CorePocLayoutDocumentV1 {
  readonly schemaVersion: typeof CORE_POC_LAYOUT_SCHEMA;
  readonly version: string;
  readonly manifestVersion: string;
  readonly scope: 'closed-complete-game-core-poc-v1';
  readonly id: typeof CORE_POC_LAYOUT_ID;
  readonly status: 'draft-human-review' | 'covered';
  readonly source: {
    readonly sourceId: 'approved-gdm-2026-layout-images';
    readonly measurementArtifact: 'gdm-2026-layout-measurements.json';
    readonly measurementLayoutId: 'disruption-mirror-1';
    readonly measuredImageSha256: string;
    readonly plainImageSha256: string;
    readonly boardRectPx: { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number };
    readonly transcription: Readonly<Record<'baseplates' | 'features' | 'objectives' | 'deployment', string>>;
  };
  readonly board: {
    readonly widthTenthsInch: 440;
    readonly heightTenthsInch: 600;
    readonly origin: 'top-left';
    readonly worldUnitsPerInch: 254;
  };
  readonly deploymentZones: readonly {
    readonly id: string;
    readonly role: 'attacker' | 'defender';
    readonly polygonTenthsInch: readonly TenthsPointV1[];
  }[];
  readonly objectives: readonly {
    readonly id: string;
    readonly role: MissionObjectiveRoleV1;
    readonly centerTenthsInch: TenthsPointV1;
    readonly sourceCenterPx: { readonly x: number; readonly y: number };
  }[];
  readonly terrain: readonly CorePocLayoutTerrainV1[];
  readonly measurementBindings: readonly {
    readonly measurementId: string;
    readonly subjectId: string;
    readonly target: string;
  }[];
  readonly physicalConvention: {
    readonly status: 'pending-human-review' | 'human-reviewed';
    readonly baseplateRuleIds: readonly ['core.benefit-of-cover'];
    readonly featureSemantics: 'non-executable' | 'executable';
    readonly ruinWallHeightWorldUnits: number | null;
    readonly obstacleHeightWorldUnits: number | null;
    readonly reviewedBy: 'project-owner' | null;
    readonly reviewedAt: string | null;
    readonly reviewRequest: readonly string[];
  };
}

export interface CorePocSpatialRuntimeV1 {
  readonly schemaVersion: 'warforge-core-poc-spatial-runtime/v1';
  readonly layoutVersion: string;
  readonly manifestVersion: string;
  readonly readyForPlay: boolean;
  readonly layout: TerrainLayoutV1;
  readonly deploymentZones: readonly {
    readonly id: string;
    readonly role: 'attacker' | 'defender';
    readonly polygon: readonly WorldPoint[];
    readonly bounds: WorldBoundsV1;
  }[];
  readonly objectiveRoleById: Readonly<Record<string, MissionObjectiveRoleV1>>;
  readonly terrainAreas: readonly {
    readonly id: string;
    readonly footprint: { readonly polygons: readonly [{ readonly outer: readonly WorldPoint[] }] };
    readonly ruleIds: readonly ['core.benefit-of-cover'];
  }[];
  readonly featureSurfaces: readonly {
    readonly id: string;
    readonly terrainId: string;
    readonly kind: CorePocLayoutFeatureV1['kind'];
    readonly polygon: readonly WorldPoint[];
    readonly height: number | null;
    readonly executable: boolean;
  }[];
  readonly measurementEvidence: readonly {
    readonly measurementId: string;
    readonly subjectId: string;
    readonly target: string;
    readonly axis: 'x' | 'y';
    readonly coordinateTenthsOfInch: number;
    readonly worldCoordinate: number;
  }[];
  readonly pendingReview: readonly string[];
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RangeError(`Layout POC invalide : ${message}`);
}

function unique(values: readonly string[], label: string): void {
  assert(values.every((value) => value.trim().length > 0) && new Set(values).size === values.length, `${label} doit contenir des identifiants uniques.`);
}

function pointIsInsideBoard(point: TenthsPointV1, document: CorePocLayoutDocumentV1): boolean {
  return Number.isInteger(point.x) && Number.isInteger(point.y)
    && point.x >= 0 && point.x <= document.board.widthTenthsInch
    && point.y >= 0 && point.y <= document.board.heightTenthsInch;
}

function world(valueTenthsInch: number): number {
  return Math.round(valueTenthsInch * 254 / 10);
}

function worldPoint(point: TenthsPointV1): WorldPoint {
  return { x: world(point.x), y: world(point.y) };
}

function boundsFor(points: readonly TenthsPointV1[]): { minX: number; minY: number; maxX: number; maxY: number } {
  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y))
  };
}

function resolveTarget(terrain: CorePocLayoutTerrainV1, target: string): { axis: 'x' | 'y'; value: number } {
  const [subject, property] = target.split('.');
  assert(subject && property, `cible de mesure ${target} mal formée.`);
  if (subject === 'baseplate') {
    const bounds = boundsFor(terrain.baseplateTenthsInch);
    assert(property in bounds, `propriété de baseplate inconnue ${property}.`);
    return { axis: property.endsWith('X') ? 'x' : 'y', value: bounds[property as keyof typeof bounds] };
  }
  if (subject.startsWith('anchor:')) {
    const anchor = terrain.anchors?.find((candidate) => candidate.id === subject.slice('anchor:'.length));
    assert(anchor && (property === 'x' || property === 'y'), `ancre de mesure inconnue ${target}.`);
    return { axis: property, value: anchor.pointTenthsInch[property] };
  }
  if (subject.startsWith('subregion:')) {
    const subregion = terrain.subregions?.find((candidate) => candidate.id === subject.slice('subregion:'.length));
    assert(subregion && property in subregion.boundsTenthsInch, `sous-région de mesure inconnue ${target}.`);
    return {
      axis: property.endsWith('X') ? 'x' : 'y',
      value: subregion.boundsTenthsInch[property as keyof typeof subregion.boundsTenthsInch]
    };
  }
  throw new RangeError(`Layout POC invalide : cible de mesure inconnue ${target}.`);
}

/**
 * Materializes the compact, gameplay-facing layout. The 45-layout measurement
 * archive is deliberately absent here: its hashes and bindings are checked by
 * the data gate and by `compileCorePocSpatialRuntimeV1`, not by every session.
 */
export function materializeCorePocSpatialRuntimeV1(
  document: CorePocLayoutDocumentV1
): CorePocSpatialRuntimeV1 {
  assert(document.schemaVersion === CORE_POC_LAYOUT_SCHEMA && document.id === CORE_POC_LAYOUT_ID, 'identité de document incompatible.');
  assert(document.board.widthTenthsInch === 440 && document.board.heightTenthsInch === 600
    && document.board.origin === 'top-left' && document.board.worldUnitsPerInch === 254, 'repère de plateau incompatible.');

  unique(document.deploymentZones.map((zone) => zone.id), 'zones de déploiement');
  unique(document.objectives.map((objective) => objective.id), 'objectifs');
  unique(document.terrain.map((terrain) => terrain.id), 'terrains');
  unique(document.terrain.flatMap((terrain) => terrain.features.map((feature) => feature.id)), 'caractéristiques de terrain');
  assert(document.deploymentZones.length === 2
    && document.deploymentZones.map((zone) => zone.role).sort().join(',') === 'attacker,defender', 'deux zones attaquant/défenseur sont requises.');
  assert(document.objectives.length === 6 && new Set(document.objectives.map((objective) => objective.role)).size === 6, 'six rôles objectifs uniques sont requis.');
  assert(document.terrain.length === 13, 'treize baseplates sont requises par ce layout.');

  for (const polygon of [
    ...document.deploymentZones.map((zone) => zone.polygonTenthsInch),
    ...document.terrain.map((terrain) => terrain.baseplateTenthsInch),
    ...document.terrain.flatMap((terrain) => terrain.features.map((feature) => feature.polygonTenthsInch))
  ]) {
    assert(polygon.length >= 3 && polygon.every((point) => pointIsInsideBoard(point, document)), 'chaque polygone doit rester dans le plateau et contenir au moins trois points entiers.');
  }

  const rect = document.source.boardRectPx;
  for (const objective of document.objectives) {
    assert(pointIsInsideBoard(objective.centerTenthsInch, document), `objectif ${objective.id} hors plateau.`);
    const projected = {
      x: Math.round((objective.sourceCenterPx.x - rect.left) * document.board.widthTenthsInch / (rect.right - rect.left)),
      y: Math.round((objective.sourceCenterPx.y - rect.top) * document.board.heightTenthsInch / (rect.bottom - rect.top))
    };
    assert(projected.x === objective.centerTenthsInch.x && projected.y === objective.centerTenthsInch.y,
      `projection pixel/plateau incohérente pour ${objective.id}.`);
  }

  const terrainById = new Map(document.terrain.map((terrain) => [terrain.id, terrain]));
  unique(document.measurementBindings.map((binding) => binding.measurementId), 'liaisons de mesures');
  assert(document.measurementBindings.length === 32, 'chaque cote doit être liée exactement une fois.');
  const measurementEvidence = document.measurementBindings.map((binding) => {
    const terrain = terrainById.get(binding.subjectId);
    assert(terrain, `liaison orpheline ${binding.measurementId}.`);
    const target = resolveTarget(terrain, binding.target);
    return {
      measurementId: binding.measurementId,
      subjectId: binding.subjectId,
      target: binding.target,
      axis: target.axis,
      coordinateTenthsOfInch: target.value,
      worldCoordinate: world(target.value)
    };
  });

  const source: SourceReferenceV1 = {
    sourceId: document.source.sourceId,
    version: document.version,
    effectiveFrom: '2026-08-31'
  };
  const conventionReady = document.status === 'covered'
    && document.physicalConvention.status === 'human-reviewed'
    && document.physicalConvention.featureSemantics === 'executable'
    && document.physicalConvention.reviewedBy === 'project-owner'
    && document.physicalConvention.reviewedAt !== null
    && Number.isInteger(document.physicalConvention.ruinWallHeightWorldUnits)
    && Number.isInteger(document.physicalConvention.obstacleHeightWorldUnits);
  const featureSurfaces = document.terrain.flatMap((terrain) => terrain.features.map((feature) => ({
    id: feature.id,
    terrainId: terrain.id,
    kind: feature.kind,
    polygon: feature.polygonTenthsInch.map(worldPoint),
    height: conventionReady
      ? feature.kind === 'ruin-wall' ? document.physicalConvention.ruinWallHeightWorldUnits : document.physicalConvention.obstacleHeightWorldUnits
      : null,
    executable: conventionReady
  })));
  const terrainAreas = document.terrain.map((terrain) => ({
    id: terrain.id,
    footprint: { polygons: [{ outer: terrain.baseplateTenthsInch.map(worldPoint) }] } as const,
    ruleIds: ['core.benefit-of-cover'] as const
  }));
  const layout: TerrainLayoutV1 = {
    schemaVersion: 'warforge-simulator/v1',
    id: document.id,
    board: { width: world(document.board.widthTenthsInch), height: world(document.board.heightTenthsInch) },
    deploymentZones: document.deploymentZones.map((zone) => ({ id: zone.id, polygon: zone.polygonTenthsInch.map(worldPoint) })),
    objectiveMarkers: document.objectives.map((objective) => ({ id: objective.id, position: worldPoint(objective.centerTenthsInch), radius: 200 })),
    terrain: [
      ...document.terrain.map((terrain) => ({
        id: terrain.id,
        footprint: terrain.baseplateTenthsInch.map(worldPoint),
        height: 0,
        elevation: 0,
        occlusionBands: [],
        traits: ['baseplate', 'benefit-of-cover']
      })),
      ...(conventionReady ? featureSurfaces.map((surface) => ({
        id: surface.id,
        footprint: surface.polygon,
        height: surface.height!,
        elevation: 0,
        occlusionBands: [{ minZ: 0, maxZ: surface.height! }],
        traits: [surface.kind, 'line-of-sight-blocker', 'infantry-traversable']
      })) : [])
    ],
    source
  };
  return {
    schemaVersion: 'warforge-core-poc-spatial-runtime/v1',
    layoutVersion: document.version,
    manifestVersion: document.manifestVersion,
    readyForPlay: conventionReady,
    layout,
    deploymentZones: document.deploymentZones.map((zone) => {
      const bounds = boundsFor(zone.polygonTenthsInch);
      return {
        id: zone.id,
        role: zone.role,
        polygon: zone.polygonTenthsInch.map(worldPoint),
        bounds: { minX: world(bounds.minX), minY: world(bounds.minY), maxX: world(bounds.maxX), maxY: world(bounds.maxY) }
      };
    }),
    objectiveRoleById: Object.fromEntries(document.objectives.map((objective) => [objective.id, objective.role])),
    terrainAreas,
    featureSurfaces,
    measurementEvidence,
    pendingReview: conventionReady ? [] : [...document.physicalConvention.reviewRequest]
  };
}

/**
 * Development/build-time compiler. It proves that every compact runtime
 * binding still equals the reviewed measurement archive before returning the
 * same materialized layout used by gameplay.
 */
export function compileCorePocSpatialRuntimeV1(
  document: CorePocLayoutDocumentV1,
  measurements: CorePocLayoutMeasurementsV1
): CorePocSpatialRuntimeV1 {
  assert(document.manifestVersion === measurements.manifestVersion, 'versions de manifeste désynchronisées.');
  const measuredLayout = measurements.layouts.find((layout) => layout.layoutId === document.source.measurementLayoutId);
  assert(measurements.schemaVersion === 'warforge-layout-measurements/v1' && measuredLayout?.status === 'verified'
    && measuredLayout.measurementCount === 32 && measuredLayout.measurements.length === 32, 'les 32 mesures vérifiées sont requises.');
  const runtime = materializeCorePocSpatialRuntimeV1(document);
  const measurementById = new Map(measuredLayout.measurements.map((measurement) => [measurement.measurementId, measurement]));
  for (const evidence of runtime.measurementEvidence) {
    const measurement = measurementById.get(evidence.measurementId);
    assert(measurement?.status === 'verified'
      && evidence.axis === measurement.axis
      && evidence.coordinateTenthsOfInch === measurement.coordinateTenthsOfInch,
    `${evidence.measurementId} ne correspond pas à ${evidence.subjectId}.${evidence.target}.`);
  }
  return runtime;
}
