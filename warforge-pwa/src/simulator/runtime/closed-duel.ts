import {
  WORLD_UNITS_PER_INCH,
  type CoverageEntryV1,
  type CoverageReportV1,
  type PhysicalModelProfileV1,
  type SessionSetup,
  type SimulatorManifestV1,
  type SourceReferenceV1,
  type UnitSetup,
  type WeaponProfileV1
} from '../domain';
import { createSessionCompatibilityReport, type SimulationCompatibilityReport } from '../orchestration';
import { createShootingEnvironment, type ShootingEnvironment } from '../orchestration/shooting';
import { CORE_BASIC_RANGED_ATTACK_SOURCE, CORE_BENEFIT_OF_COVER_SOURCE } from '../rules';

export interface ClosedDuelDocuments {
  readonly manifest: any;
  readonly physicalProfiles: any;
  readonly rulepacks: any;
  readonly scenarios: any;
  readonly coverage: any;
}

export interface ClosedDuelRuntime {
  readonly session: SessionSetup;
  readonly environment: ShootingEnvironment;
  readonly coverage: CoverageReportV1;
  readonly compatibility: SimulationCompatibilityReport;
  readonly board: { readonly width: number; readonly height: number };
  readonly moveDistance: number;
  readonly coherencyDistance: number;
  readonly terrain: readonly { readonly id: string; readonly footprint: readonly { readonly x: number; readonly y: number }[]; readonly label: string }[];
}

const scenarioId = 'closed-core-shooting-duel-v1';
const rifleId = 'closed-core-training-rifle-v1';
const templateId = 'closed-core-training-infantry-v1';
const redFixtureId = 'closed-core-red-unit-v1';
const blueFixtureId = 'closed-core-blue-unit-v1';

function source(reference: SourceReferenceV1): SourceReferenceV1 { return reference; }

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RangeError(`Données du duel fermé invalides : ${message}`);
}

function fingerprint(value: unknown): string {
  let hash = 0x811c9dc5;
  for (const character of JSON.stringify(value)) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return `closed-duel-fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}

/** Compiles only validated simulator JSON into one exact, closed M3 session. */
export function assembleClosedDuel(documents: ClosedDuelDocuments): ClosedDuelRuntime {
  const scenario = documents.scenarios?.scenarios?.find((entry: any) => entry.id === scenarioId);
  const template = documents.scenarios?.fixtureUnitTemplates?.find((entry: any) => entry.id === templateId);
  const rulepack = documents.rulepacks?.rulepacks?.find((entry: any) => entry.id === 'core-basic-shooting-v1');
  const profileData = documents.physicalProfiles?.profiles?.find((entry: any) => entry.id === 'training-infantry-32mm-v1');
  const fixtureUnits = documents.scenarios?.fixtureUnits;
  assert(documents.scenarios?.fixtureUnitTemplates?.length === 1 && template?.id === templateId, 'template ferme exact requis');
  assert(Array.isArray(fixtureUnits) && fixtureUnits.length === 2, 'exactement deux fixtures requises');
  assert(fixtureUnits[0]?.id === redFixtureId && fixtureUnits[1]?.id === blueFixtureId, 'identifiants de fixture exacts requis');
  assert(fixtureUnits.every((fixture: any) => fixture.templateId === templateId && fixture.modelCount === 5 && fixture.status === 'ready'), 'fixtures exactes requises');
  assert(scenario?.status === 'covered' && rulepack?.status === 'covered', 'scénario et rulepack doivent être couverts');
  assert(template?.weapons?.length === 1 && template.weapons[0].id === rifleId, 'fusil fermé requis');
  assert(profileData?.shape?.kind === 'circle', 'profil circulaire requis');
  assert(scenario.players?.[0]?.id === 'red' && scenario.players[0]?.fixtureUnitId === redFixtureId, 'joueur rouge exact requis');
  assert(scenario.players?.[1]?.id === 'blue' && scenario.players[1]?.fixtureUnitId === blueFixtureId, 'joueur bleu exact requis');
  assert(scenario.players?.length === 2 && scenario.players.every((player: any) => player.modelPositions?.length === 5), 'deux unités de cinq requises');
  assert(documents.coverage?.supportedUnitIds?.length === 0, 'aucune unité réelle ne peut être supportée');

  assert(JSON.stringify(documents.coverage?.supportedFixtureUnitIds) === JSON.stringify([redFixtureId, blueFixtureId]), 'couverture exacte des fixtures requise');
  assert(JSON.stringify(documents.coverage?.supportedWeaponIds) === JSON.stringify([rifleId]), 'couverture exacte du fusil requise');

  const profileSource = source({ sourceId: profileData.provenance.sourceId, version: profileData.provenance.version, effectiveFrom: profileData.provenance.effectiveDate });
  const profile: PhysicalModelProfileV1 = {
    schemaVersion: 'warforge-simulator/v1', id: profileData.id, displayName: profileData.displayName,
    baseShape: { kind: 'circle', radius: profileData.shape.radius }, height: profileData.height,
    visibilityPoints: profileData.visibilityPoints, source: profileSource, isConvention: true
  };
  const weaponData = template.weapons[0];
  const weapon: WeaponProfileV1 = {
    id: weaponData.id, displayName: weaponData.name, range: weaponData.range, attacks: weaponData.attacks,
    ballisticSkill: weaponData.ballisticSkill, strength: weaponData.strength, armourPenetration: weaponData.armourPenetration,
    damage: weaponData.damage, sourceRefs: [CORE_BASIC_RANGED_ATTACK_SOURCE]
  };
  const environment = createShootingEnvironment({
    physicalProfiles: { [profile.id]: profile }, weaponProfiles: { [weapon.id]: weapon },
    terrainZones: scenario.terrainZones.map((zone: any) => ({ id: zone.id, footprint: { polygons: [{ outer: zone.footprint }] }, ruleIds: zone.ruleIds })),
    coverRules: [{ id: 'core.benefit-of-cover', source: CORE_BENEFIT_OF_COVER_SOURCE, ballisticSkillPenalty: 1,
      branches: [{ kind: 'inside-terrain-zone', qualifyingKeywords: ['INFANTRY', 'BEAST', 'SWARM'] }, { kind: 'not-entirely-visible-due-to-terrain' }] }]
  });
  const players = scenario.players.map((player: any) => ({ id: player.id, displayName: player.id === 'red' ? 'Red training unit' : 'Blue training unit', rosterId: `fixture:${player.fixtureUnitId}` }));
  const models = scenario.players.flatMap((player: any) => player.modelPositions.map((position: any, index: number) => ({
    id: `${player.id}-${index + 1}`, playerId: player.id, profileId: profile.id, position, orientationDegrees: player.id === 'red' ? 0 : 180
  })));
  const units: UnitSetup[] = scenario.players.map((player: any) => {
    const modelIds = player.modelPositions.map((_position: any, index: number) => `${player.id}-${index + 1}`);
    return {
      id: `${player.id}-unit`, fixtureId: player.fixtureUnitId, playerId: player.id, modelIds,
      keywords: template.keywords, toughness: template.characteristics.toughness, save: template.characteristics.save,
      woundsPerModel: template.characteristics.wounds, weaponProfiles: [weapon],
      weaponAssignments: modelIds.map((modelId: string) => ({ modelId, weaponProfileId: weapon.id, quantity: 1 })),
      sourceRefs: [CORE_BASIC_RANGED_ATTACK_SOURCE]
    };
  });
  const manifest: SimulatorManifestV1 = {
    schemaVersion: 'warforge-simulator/v1', simulatorVersion: documents.manifest.engineVersion,
    catalogFingerprint: `fixture-only:${documents.manifest.catalog.dataVersion}`, rulePackIds: scenario.rulepackIds,
    rulePackFingerprint: fingerprint(rulepack), scenarioId: scenario.id, scenarioFingerprint: fingerprint(scenario), coverageVersion: documents.coverage.manifestVersion
  };
  const session: SessionSetup = { manifest, players, models, units, shootingEnvironmentFingerprint: environment.fingerprint };
  const entries: CoverageEntryV1[] = [
    ...documents.coverage.supportedRuleIds.map((subjectId: string) => ({ subjectType: 'rule' as const, subjectId, status: 'covered' as const })),
    ...documents.coverage.supportedFixtureUnitIds.map((subjectId: string) => ({ subjectType: 'fixture-unit' as const, subjectId, status: 'covered' as const })),
    ...documents.coverage.supportedScenarioIds.map((subjectId: string) => ({ subjectType: 'scenario' as const, subjectId, status: 'covered' as const })),
    ...documents.coverage.supportedWeaponIds.map((subjectId: string) => ({ subjectType: 'weapon' as const, subjectId, status: 'covered' as const })),
    ...documents.coverage.supportedPhysicalProfileIds.map((subjectId: string) => ({ subjectType: 'physical-profile' as const, subjectId, status: 'covered' as const }))
  ];
  const coverage: CoverageReportV1 = { schemaVersion: 'warforge-simulator/v1', version: documents.coverage.manifestVersion, entries };
  return {
    session, environment, coverage, compatibility: createSessionCompatibilityReport(session, coverage), board: scenario.board,
    moveDistance: template.characteristics.movement, coherencyDistance: 2 * WORLD_UNITS_PER_INCH,
    terrain: scenario.terrainZones.map((zone: any) => ({ id: zone.id, footprint: zone.footprint, label: zone.visual.label }))
  };
}

/** Public-data loader; JSON is validated by the build/CI validator before being mirrored offline. */
export async function loadClosedDuelRuntime(): Promise<ClosedDuelRuntime> {
  const names = ['manifest', 'physical-profiles', 'rulepacks', 'scenarios', 'coverage'] as const;
  const values = await Promise.all(names.map(async (name) => {
    const response = await fetch(`data/simulator/${name}.json`);
    if (!response.ok) throw new Error(`Impossible de charger ${name}.json`);
    return response.json();
  }));
  return assembleClosedDuel(Object.fromEntries(names.map((name, index) => [name === 'physical-profiles' ? 'physicalProfiles' : name, values[index]])) as unknown as ClosedDuelDocuments);
}
