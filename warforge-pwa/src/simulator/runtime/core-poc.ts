import corePocCoverageRaw from '../../../data/simulator/core-poc-coverage.json';
import corePocFixturesRaw from '../../../data/simulator/core-poc-fixtures.json';
import corePocLayoutRaw from '../../../data/simulator/core-poc-layout.json';
import manifestRaw from '../../../data/simulator/manifest.json';
import physicalProfilesRaw from '../../../data/simulator/physical-profiles.json';
import {
  compileCorePocCompatibilityV1,
  compileCorePocTechnicalCompatibilityReportV2,
  completeGameExecutableSessionFingerprintV1,
  createCompleteGameSessionSetupV1,
  materializeCorePocSpatialRuntimeV1,
  type CorePocCompatibilityReportV1,
  type CorePocCoverageDocumentV1,
  type CorePocLayoutDocumentV1,
  type CorePocSpatialRuntimeV1,
  type ModelSetup,
  type PhysicalModelProfileV1,
  type SessionSetup,
  type SimulatorManifestV1,
  type SourceReferenceV1,
  type UnitSetup,
  type WeaponProfileV1
} from '../domain';
import { OBJECTIVE_CONTROL_SOURCE_REFS } from '../orchestration/objective-control';
import { createShootingEnvironment, type ShootingEnvironment } from '../orchestration/shooting';
import { CORE_MELEE_ATTACK_SOURCE } from '../rules/m7-source-references';
import { CORE_BASIC_RANGED_ATTACK_SOURCE, CORE_BENEFIT_OF_COVER_SOURCE } from '../rules/shooting';

export const CORE_POC_FIXTURES_SCHEMA = 'warforge-simulator-core-poc-fixtures/v1' as const;

interface CorePocFixtureWeaponV1 {
  readonly id: string;
  readonly name: string;
  readonly weaponType: 'ranged' | 'melee';
  readonly range: number;
  readonly attacks: number;
  readonly skill: number;
  readonly strength: number;
  readonly armourPenetration: number;
  readonly damage: number;
}

interface CorePocFixtureTemplateV1 {
  readonly id: string;
  readonly role: 'line' | 'character';
  readonly physicalProfileId: string;
  readonly keywords: readonly string[];
  readonly characteristics: {
    readonly movement: number;
    readonly toughness: number;
    readonly save: number;
    readonly wounds: number;
    readonly leadership: number;
    readonly objectiveControl: number;
  };
  readonly weapons: readonly CorePocFixtureWeaponV1[];
}

export interface CorePocFixturesDocumentV1 {
  readonly schemaVersion: typeof CORE_POC_FIXTURES_SCHEMA;
  readonly version: string;
  readonly manifestVersion: string;
  readonly scope: 'closed-complete-game-core-poc-v1';
  readonly status: 'ready';
  readonly sourceId: 'warforge-core-poc-fixtures-v1';
  readonly coverageClaim: 'none';
  readonly statement: string;
  readonly templates: readonly CorePocFixtureTemplateV1[];
  readonly unitTemplateByFixtureId: Readonly<Record<string, string>>;
}

export interface CorePocRuntimeDocumentsV1 {
  readonly manifest: typeof manifestRaw;
  readonly coverage: CorePocCoverageDocumentV1;
  readonly fixtures: CorePocFixturesDocumentV1;
  readonly layout: CorePocLayoutDocumentV1;
  readonly physicalProfiles: typeof physicalProfilesRaw;
}

export interface CorePocRuntimeV1 {
  readonly schemaVersion: 'warforge-core-poc-runtime/v1';
  readonly session: SessionSetup;
  readonly environment: ShootingEnvironment;
  readonly spatial: CorePocSpatialRuntimeV1;
  readonly compatibility: CorePocCompatibilityReportV1;
  readonly fixtureSource: SourceReferenceV1;
  readonly readyForCompleteGame: true;
  readonly blockers: readonly string[];
}

/** @deprecated Use CorePocRuntimeV1; retained for callers compiled during S02. */
export type CorePocRuntimeDraftV1 = CorePocRuntimeV1;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RangeError(`Runtime POC invalide : ${message}`);
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
}

function fingerprint(prefix: string, value: unknown): string {
  let hash = 0x811c9dc5;
  for (const character of canonical(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${prefix}:fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}

function fixtureWeapon(profile: CorePocFixtureWeaponV1, fixtureSource: SourceReferenceV1): WeaponProfileV1 {
  assert(profile.id.trim() && profile.name.trim()
    && Number.isInteger(profile.range) && profile.range >= 0
    && Number.isInteger(profile.attacks) && profile.attacks > 0
    && Number.isInteger(profile.skill) && profile.skill >= 2 && profile.skill <= 6
    && Number.isInteger(profile.strength) && profile.strength > 0
    && Number.isInteger(profile.armourPenetration)
    && Number.isInteger(profile.damage) && profile.damage > 0,
  `profil d'arme ${profile.id} incomplet.`);
  return {
    id: profile.id,
    displayName: profile.name,
    weaponType: profile.weaponType,
    range: profile.range,
    attacks: profile.attacks,
    ballisticSkill: profile.skill,
    strength: profile.strength,
    armourPenetration: profile.armourPenetration,
    damage: profile.damage,
    sourceRefs: [fixtureSource, profile.weaponType === 'ranged' ? CORE_BASIC_RANGED_ATTACK_SOURCE : CORE_MELEE_ATTACK_SOURCE]
  };
}

/** Compiles the executable fixture-only technical POC and its V6 proof. */
function assembleCorePocRuntimeWithSpatialV1(
  documents: CorePocRuntimeDocumentsV1,
  spatial: CorePocSpatialRuntimeV1
): CorePocRuntimeV1 {
  const { manifest, coverage, fixtures, layout, physicalProfiles } = documents;
  assert(fixtures.schemaVersion === CORE_POC_FIXTURES_SCHEMA
    && fixtures.version === '1.0.0'
    && fixtures.manifestVersion === manifest.version
    && fixtures.scope === coverage.scope
    && fixtures.status === 'ready'
    && fixtures.coverageClaim === 'none', 'identité des fixtures incompatible.');
  assert(layout.manifestVersion === manifest.version
    && spatial.manifestVersion === manifest.version
    && spatial.layoutVersion === layout.version, 'layout compact incompatible avec le manifeste.');
  assert(fixtures.statement.length > 0 && !/(?:codex|datasheet).*(?:représente|couvre)/i.test(fixtures.statement),
    'la limite synthétique doit être explicite.');

  const registeredSourceIds = manifest.sources.map((source) => source.id);
  assert(registeredSourceIds.includes(fixtures.sourceId), 'source locale des fixtures absente du manifeste.');
  const compatibility = compileCorePocCompatibilityV1(coverage, {
    manifestVersion: manifest.version,
    registeredSourceIds
  });
  const fixtureSource: SourceReferenceV1 = {
    sourceId: fixtures.sourceId,
    version: fixtures.version,
    effectiveFrom: '2026-08-31',
    dateBasis: 'retrieved',
    retrievedAt: '2026-08-31'
  };

  const profileData = physicalProfiles.profiles.find((profile) => profile.id === 'training-infantry-32mm-v1');
  const pocProfileConvention = physicalProfiles.conventions.find((convention) => convention.id === 'closed-core-poc-infantry-geometry-v1');
  assert(profileData?.shape.kind === 'circle' && profileData.visibilityPoints.length > 0,
    'profil physique synthétique 32 mm × 40 mm absent.');
  assert(pocProfileConvention?.scope === coverage.scope
    && pocProfileConvention.decisionReference === 'ADR-023'
    && pocProfileConvention.reviewedBy === 'project-owner'
    && pocProfileConvention.reviewedAt === '2026-08-31',
  'extension du profil physique au POC non approuvée.');
  const profile: PhysicalModelProfileV1 = {
    schemaVersion: 'warforge-simulator/v1',
    id: profileData.id,
    displayName: profileData.displayName,
    baseShape: { kind: 'circle', radius: profileData.shape.radius },
    height: profileData.height,
    visibilityPoints: profileData.visibilityPoints,
    source: fixtureSource,
    isConvention: true
  };

  const templatesById = new Map(fixtures.templates.map((template) => [template.id, template]));
  assert(templatesById.size === 2
    && fixtures.templates.filter((template) => template.role === 'line').length === 1
    && fixtures.templates.filter((template) => template.role === 'character').length === 1,
  'un template de ligne et un template personnage sont requis.');
  const weaponProfiles = new Map<string, WeaponProfileV1>();
  for (const template of fixtures.templates) {
    assert(template.physicalProfileId === profile.id
      && template.keywords.includes('INFANTRY')
      && (template.role !== 'character' || template.keywords.includes('CHARACTER')),
    `template ${template.id} incompatible.`);
    for (const weapon of template.weapons) {
      const compiled = fixtureWeapon(weapon, fixtureSource);
      const existing = weaponProfiles.get(compiled.id);
      assert(existing === undefined || canonical(existing) === canonical(compiled), `profil d'arme partagé incohérent ${compiled.id}.`);
      weaponProfiles.set(compiled.id, compiled);
    }
  }

  const fixtureUnits = coverage.forces.flatMap((force) => force.units);
  assert(Object.keys(fixtures.unitTemplateByFixtureId).length === fixtureUnits.length
    && fixtureUnits.every((unit) => fixtures.unitTemplateByFixtureId[unit.id]),
  'association exhaustive fixture/template requise.');
  const players = coverage.forces.map((force) => ({
    id: force.playerId,
    displayName: force.displayName,
    rosterId: force.id
  }));
  const models: ModelSetup[] = [];
  const units: UnitSetup[] = [];
  for (const [forceIndex, force] of coverage.forces.entries()) {
    for (const [unitIndex, fixture] of force.units.entries()) {
      const template = templatesById.get(fixtures.unitTemplateByFixtureId[fixture.id]);
      assert(template?.role === fixture.role, `rôle du template incohérent pour ${fixture.id}.`);
      const modelIds = Array.from({ length: fixture.modelCount }, (_, index) => `${fixture.id}-model-${index + 1}`);
      const weapons = template.weapons.map((weapon) => weaponProfiles.get(weapon.id)!);
      units.push({
        id: fixture.id,
        fixtureId: fixture.id,
        coverageSubject: { subjectType: 'fixture-unit', subjectId: fixture.id },
        playerId: force.playerId,
        movement: template.characteristics.movement,
        modelIds,
        keywords: template.keywords,
        toughness: template.characteristics.toughness,
        save: template.characteristics.save,
        woundsPerModel: template.characteristics.wounds,
        leadership: template.characteristics.leadership,
        objectiveControl: template.characteristics.objectiveControl,
        weaponProfiles: weapons,
        weaponAssignments: modelIds.flatMap((modelId) => weapons.map((weapon) => ({ modelId, weaponProfileId: weapon.id, quantity: 1 }))),
        sourceRefs: [fixtureSource]
      });
      for (const [modelIndex, modelId] of modelIds.entries()) {
        const ownerIsAttacker = forceIndex === 0;
        models.push({
          id: modelId,
          playerId: force.playerId,
          profileId: profile.id,
          position: {
            x: ownerIsAttacker ? 800 + modelIndex * 400 : 8_376 + modelIndex * 400,
            y: ownerIsAttacker ? 800 + unitIndex * 700 : 14_440 - unitIndex * 700
          },
          orientationDegrees: ownerIsAttacker ? 0 : 180
        });
      }
    }
  }

  const featureTerrainZones = spatial.featureSurfaces.map((surface) => {
    const height = surface.height;
    assert(surface.executable && height !== null && Number.isInteger(height) && height > 0,
      `volume physique ${surface.id} non exécutable.`);
    const footprint = { polygons: [{ outer: surface.polygon }] } as const;
    return {
      id: surface.id,
      footprint,
      ruleIds: [],
      blocker: {
        id: surface.id,
        footprint,
        minZ: 0,
        maxZ: height,
        occlusionBands: [{ minZ: 0, maxZ: height }]
      }
    };
  });
  const environment = createShootingEnvironment({
    physicalProfiles: { [profile.id]: profile },
    weaponProfiles: Object.fromEntries(weaponProfiles),
    terrainZones: [
      ...spatial.terrainAreas.map((area) => ({
        id: area.id,
        footprint: area.footprint,
        ruleIds: area.ruleIds
      })),
      ...featureTerrainZones
    ],
    coverRules: [{
      id: 'core.benefit-of-cover',
      source: CORE_BENEFIT_OF_COVER_SOURCE,
      ballisticSkillPenalty: 1,
      branches: [
        { kind: 'inside-terrain-zone', qualifyingKeywords: ['INFANTRY', 'BEAST', 'SWARM'] },
        { kind: 'not-entirely-visible-due-to-terrain' }
      ]
    }],
    lineOfSightPolicy: { id: 'm4-sampled-cylinder-los-v1', version: '1.0.0' }
  });
  const sessionManifest: SimulatorManifestV1 = {
    schemaVersion: 'warforge-simulator/v1',
    simulatorVersion: manifest.engineVersion,
    catalogFingerprint: 'fixture-only:no-catalog-coverage',
    rulePackIds: ['core-poc-common-rules-v1'],
    rulePackFingerprint: fingerprint('core-poc-rules', { coverage: coverage.requirements, fixtures: fixtures.templates }),
    scenarioId: 'closed-complete-game-disruption-v1',
    scenarioFingerprint: fingerprint('core-poc-scenario', { layout: layout.id, objectives: layout.objectives, deploymentZones: layout.deploymentZones }),
    coverageVersion: coverage.version
  };
  const sessionBase: SessionSetup = {
    manifest: sessionManifest,
    players,
    models,
    units,
    shootingEnvironmentFingerprint: environment.fingerprint
  };
  const attackerPlayerId = players[0]!.id;
  const defenderPlayerId = players[1]!.id;
  const objectiveMarkers = spatial.layout.objectiveMarkers.map((marker) => ({
    schemaVersion: 'warforge-objective-marker/v1' as const,
    id: marker.id,
    kind: 'objective-marker' as const,
    center: marker.position,
    elevation: 0,
    diameter: 400 as const,
    horizontalRange: 762 as const,
    verticalRange: 1_270 as const,
    sourceRefs: OBJECTIVE_CONTROL_SOURCE_REFS
  }));
  const completeGameFacts = {
    battle: {
      maxBattleRounds: 5,
      playerIds: players.map((player) => player.id),
      boardBounds: { minX: 0, minY: 0, maxX: spatial.layout.board.width, maxY: spatial.layout.board.height },
      attackerPlayerId,
      defenderPlayerId,
      deploymentZones: spatial.deploymentZones.map((zone) => ({
        id: zone.id,
        playerId: zone.role === 'attacker' ? attackerPlayerId : defenderPlayerId,
        bounds: zone.bounds,
        polygon: zone.polygon
      }))
    },
    mission: {
      id: sessionManifest.scenarioId,
      definitionFingerprint: sessionManifest.scenarioFingerprint,
      objectiveMarkerIds: objectiveMarkers.map((marker) => marker.id),
      objectiveMarkers,
      scoringProfileId: 'closed-complete-game-disruption-v1' as const,
      objectiveRoleById: spatial.objectiveRoleById
    }
  };
  const report = compileCorePocTechnicalCompatibilityReportV2(
    coverage,
    { manifestVersion: manifest.version, registeredSourceIds },
    completeGameExecutableSessionFingerprintV1(sessionBase, completeGameFacts)
  );
  const session: SessionSetup = {
    ...sessionBase,
    completeGame: createCompleteGameSessionSetupV1(report, completeGameFacts)
  };
  const blockers = [...new Set([
    ...compatibility.blockingRequirementIds,
    ...compatibility.pendingOwnerActions,
    ...spatial.pendingReview
  ])];
  assert(compatibility.compatible && spatial.readyForPlay && blockers.length === 0,
    'le runtime POC technique ne peut démarrer qu’après validation de son périmètre et de ses quatre limites.');
  return {
    schemaVersion: 'warforge-core-poc-runtime/v1',
    session,
    environment,
    spatial,
    compatibility,
    fixtureSource,
    readyForCompleteGame: true,
    blockers
  };
}

/** Materializes custom documents once for a bounded caller such as a test. */
export function assembleCorePocRuntimeDraftV1(documents: CorePocRuntimeDocumentsV1): CorePocRuntimeDraftV1 {
  return assembleCorePocRuntimeWithSpatialV1(documents, materializeCorePocSpatialRuntimeV1(documents.layout));
}

export function assembleCorePocRuntimeV1(documents: CorePocRuntimeDocumentsV1): CorePocRuntimeV1 {
  return assembleCorePocRuntimeWithSpatialV1(documents, materializeCorePocSpatialRuntimeV1(documents.layout));
}

export const CORE_POC_RUNTIME_DOCUMENTS: CorePocRuntimeDocumentsV1 = {
  manifest: manifestRaw,
  coverage: corePocCoverageRaw as unknown as CorePocCoverageDocumentV1,
  fixtures: corePocFixturesRaw as unknown as CorePocFixturesDocumentV1,
  layout: corePocLayoutRaw as unknown as CorePocLayoutDocumentV1,
  physicalProfiles: physicalProfilesRaw
};

// The current gameplay layout is immutable source data: compile it once per
// module load, then share the static spatial result across session assemblies.
const CURRENT_CORE_POC_SPATIAL_RUNTIME = materializeCorePocSpatialRuntimeV1(CORE_POC_RUNTIME_DOCUMENTS.layout);

export function assembleCurrentCorePocRuntimeDraftV1(): CorePocRuntimeDraftV1 {
  return assembleCorePocRuntimeWithSpatialV1(CORE_POC_RUNTIME_DOCUMENTS, CURRENT_CORE_POC_SPATIAL_RUNTIME);
}

export function assembleCurrentCorePocRuntimeV1(): CorePocRuntimeV1 {
  return assembleCorePocRuntimeWithSpatialV1(CORE_POC_RUNTIME_DOCUMENTS, CURRENT_CORE_POC_SPATIAL_RUNTIME);
}
