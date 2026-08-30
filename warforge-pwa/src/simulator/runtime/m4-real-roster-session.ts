import realRosterFactsRaw from '../../../data/simulator/m4-real-roster-facts.json';
import pilotProposalRaw from '../../../docs/simulator/roster-pilots/real-roster-shooting-duel-v1.proposal.json';
import {
  SIMULATOR_SCHEMA_VERSION,
  type GameState,
  type CoverageEntryV1,
  type CoverageReportV1,
  type ModelSetup,
  type PhysicalModelProfileV1,
  type SessionSetup,
  type SimulatorManifestV1,
  type SourceReferenceV1,
  type UnitSetup,
  type WeaponProfileV1,
  type WorldUnit,
  type WorldPoint
} from '../domain';
import { createSessionCompatibilityReport, type SimulationCompatibilityReport } from '../orchestration/compatibility';
import { executeM4RealRosterMove } from '../orchestration/m4-real-roster-controller';
import { createSimulatorActor, type SimulatorActor } from '../orchestration/machine';
import { createShootingEnvironment, type ShootingEnvironment, type ShootingTerrainZone } from '../orchestration/shooting';
import { CORE_BENEFIT_OF_COVER_SOURCE } from '../rules';

const M4_SCENARIO_ID = 'real-roster-shooting-duel-v1';
const M4_COVERAGE_VERSION = 'm4-real-roster-integration/v3';
const M4_RULE_PACK_IDS = [
  'adeptus-astartes.oath-of-moment',
  'core-basic-shooting-v1',
  'core.benefit-of-cover',
  'm4-sampled-cylinder-los-v1',
  'simulator.m4.real-roster-movement',
  'weapon.pistol'
] as const;
const M4_BOARD = Object.freeze({ width: 11_176, height: 7_620 });

export interface M4RealRosterSessionDocuments {
  readonly proposal: unknown;
  readonly facts: unknown;
}

export interface M4RealRosterDeployment {
  readonly board: typeof M4_BOARD;
  readonly status: 'covered';
  readonly reason: string;
}

/** Closed scenario movement facts. Engagement is retained solely as the [PISTOL] guard. */
export interface M4RealRosterMovementPolicy {
  readonly board: typeof M4_BOARD;
  readonly normalMoveByModelId: Readonly<Record<string, WorldUnit>>;
  readonly engagementRange: WorldUnit;
  readonly pistolWeaponProfileIds: readonly string[];
}

/**
 * The M4 compiler exposes the narrow, source-bound and fully covered shooting
 * path approved for this real-roster pilot.
 */
export interface M4RealRosterSessionPlan {
  readonly session: SessionSetup;
  /** Trusted facts for the limited M4 shooting path. */
  readonly environment: ShootingEnvironment;
  readonly movement: M4RealRosterMovementPolicy;
  readonly coverage: CoverageReportV1;
  readonly compatibility: SimulationCompatibilityReport;
  readonly deployment: M4RealRosterDeployment;
}

/** The only normal application constructor for a compatible M4 session. */
export interface CreateM4RealRosterActorInput {
  readonly initialState: GameState;
  readonly gameState?: GameState;
  readonly runtime?: M4RealRosterSessionPlan;
}

export const M4_REAL_ROSTER_SESSION_DOCUMENTS: M4RealRosterSessionDocuments = Object.freeze({
  proposal: pilotProposalRaw,
  facts: realRosterFactsRaw
});

type JsonRecord = Record<string, unknown>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RangeError(`Session M4 réelle invalide : ${message}`);
}

function record(value: unknown, label: string): JsonRecord {
  assert(typeof value === 'object' && value !== null && !Array.isArray(value), `${label} doit être un objet.`);
  return value as JsonRecord;
}

function array(value: unknown, label: string): readonly unknown[] {
  assert(Array.isArray(value), `${label} doit être un tableau.`);
  return value;
}

function text(value: unknown, label: string): string {
  assert(typeof value === 'string' && value.trim().length > 0, `${label} doit être un texte non vide.`);
  return value;
}

function integer(value: unknown, label: string): number {
  assert(typeof value === 'number' && Number.isSafeInteger(value), `${label} doit être un entier sûr.`);
  return value;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const source = record(value, 'Valeur d’empreinte');
  return `{${Object.keys(source).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(source[key])}`).join(',')}}`;
}

function fingerprint(value: unknown): string {
  let hash = 0x811c9dc5;
  for (const character of canonicalJson(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `m4-real-roster-fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}

function sourceFor(fact: JsonRecord, catalogVersion: string, effectiveDate: string): SourceReferenceV1 {
  const link = record(fact.catalogLink, 'catalogLink');
  return {
    sourceId: text(link.sourceId, 'catalogLink.sourceId'),
    version: catalogVersion,
    effectiveFrom: effectiveDate
  };
}

function profileIdFor(fact: JsonRecord): string {
  return text(fact.physicalProfileId, 'physicalProfileId');
}

function modelId(proposalId: string, rosterId: string, itemId: string, compositionId: string, index: number): string {
  return `m4:${proposalId}:${rosterId}:${itemId}:${compositionId}:model:${index}`;
}

function draftDeploymentPosition(side: string, index: number): WorldPoint {
  const column = Math.floor(index / 4);
  const row = index % 4;
  const x = side === 'salamanders' ? 1_500 + column * 500 : M4_BOARD.width - 1_500 - column * 500;
  return { x, y: 1_600 + row * 550 };
}

function exactModelIds(proposalId: string, roster: JsonRecord, item: JsonRecord, resolvedUnit: JsonRecord): readonly string[] {
  const rosterId = text(record(roster.draft, 'roster.draft').id, 'roster.draft.id');
  const itemId = text(item.id, 'draft item id');
  const compositions = array(record(resolvedUnit.frozenDefaultLoadout, 'frozenDefaultLoadout').byComposition, 'frozenDefaultLoadout.byComposition')
    .map((value) => record(value, 'composition'))
    .sort((left, right) => text(left.id, 'composition.id').localeCompare(text(right.id, 'composition.id')));
  return compositions.flatMap((composition) => {
    const compositionId = text(composition.id, 'composition.id');
    const count = integer(composition.modelCount, 'composition.modelCount');
    assert(count > 0, 'composition.modelCount doit être positif.');
    return Array.from({ length: count }, (_unused, index) => modelId(proposalId, rosterId, itemId, compositionId, index));
  });
}

function weaponFor(fact: JsonRecord, catalogVersion: string, effectiveDate: string): WeaponProfileV1 {
  const selected = record(fact.selectedRangedWeapon, 'selectedRangedWeapon');
  return {
    id: text(selected.id, 'selectedRangedWeapon.id'),
    displayName: text(selected.catalogName, 'selectedRangedWeapon.catalogName'),
    range: integer(selected.range, 'selectedRangedWeapon.range'),
    attacks: integer(selected.attacks, 'selectedRangedWeapon.attacks'),
    ballisticSkill: integer(selected.ballisticSkill, 'selectedRangedWeapon.ballisticSkill'),
    strength: integer(selected.strength, 'selectedRangedWeapon.strength'),
    armourPenetration: integer(selected.armourPenetration, 'selectedRangedWeapon.armourPenetration'),
    damage: integer(selected.damage, 'selectedRangedWeapon.damage'),
    sourceRefs: [sourceFor(fact, catalogVersion, effectiveDate)]
  };
}

function unitFor(
  proposalId: string,
  roster: JsonRecord,
  item: JsonRecord,
  resolvedUnit: JsonRecord,
  fact: JsonRecord,
  catalogVersion: string,
  effectiveDate: string
): UnitSetup {
  const draft = record(roster.draft, 'roster.draft');
  const side = text(roster.side, 'roster.side');
  const unitId = text(record(fact.catalogLink, 'catalogLink').unitId, 'catalogLink.unitId');
  assert(unitId === text(resolvedUnit.id, 'resolvedUnit.id') && unitId === text(item.unitId, 'draft item.unitId'), 'Unité factuelle, résolue et draft doivent être identiques.');
  const modelIds = exactModelIds(proposalId, roster, item, resolvedUnit);
  assert(modelIds.length === integer(fact.modelCount, 'unitFact.modelCount'), `Effectif M4 incohérent pour ${unitId}.`);
  const characteristics = record(fact.characteristics, 'characteristics');
  const weapon = weaponFor(fact, catalogVersion, effectiveDate);
  const keywordValues = array(fact.keywords, 'unitFact.keywords').map((keyword) => text(keyword, 'keyword'));
  const internalId = `m4:unit:${text(draft.id, 'roster id')}:${text(item.id, 'draft item id')}`;
  return {
    id: internalId,
    fixtureId: text(fact.id, 'unitFact.id'),
    coverageSubject: { subjectType: 'unit', subjectId: unitId },
    playerId: side,
    movement: integer(characteristics.movement, 'characteristics.movement'),
    modelIds,
    keywords: keywordValues,
    toughness: integer(characteristics.toughness, 'characteristics.toughness'),
    save: integer(characteristics.save, 'characteristics.save'),
    woundsPerModel: integer(characteristics.wounds, 'characteristics.wounds'),
    leadership: integer(characteristics.leadership, 'characteristics.leadership'),
    objectiveControl: integer(characteristics.objectiveControl, 'characteristics.objectiveControl'),
    weaponProfiles: [weapon],
    weaponAssignments: modelIds.map((modelId) => ({ modelId, weaponProfileId: weapon.id, quantity: 1 })),
    sourceRefs: [sourceFor(fact, catalogVersion, effectiveDate)]
  };
}

function coverageEntries(facts: JsonRecord, units: readonly UnitSetup[]): readonly CoverageEntryV1[] {
  const mandatoryRules = array(facts.mandatoryRules, 'mandatoryRules').map((entry) => record(entry, 'mandatory rule'));
  assert(mandatoryRules.every((rule) => text(rule.implementationStatus, 'mandatoryRule.implementationStatus') === 'implemented-closed-m4'
    && text(rule.requiredByTask, 'mandatoryRule.requiredByTask') === 'SIM-M4-T08'), 'Toutes les règles obligatoires M4 doivent être implémentées par T08.');
  const terrainLayout = record(facts.terrainLayout, 'terrainLayout');
  assert(text(terrainLayout.reviewStatus, 'terrainLayout.reviewStatus') === 'human-reviewed', 'Le terrain M4 doit être approuvé humainement avant sa couverture.');
  const ruleEntries: CoverageEntryV1[] = [
    { subjectType: 'rule', subjectId: 'core-basic-shooting-v1', status: 'covered' },
    { subjectType: 'rule', subjectId: 'core.benefit-of-cover', status: 'covered' },
    { subjectType: 'rule', subjectId: 'm4-sampled-cylinder-los-v1', status: 'covered' },
    { subjectType: 'rule', subjectId: 'simulator.m4.real-roster-movement', status: 'covered' },
    ...mandatoryRules.map((rule) => ({
      subjectType: 'rule' as const,
      subjectId: text(rule.id, 'mandatoryRule.id'),
      status: 'covered' as const
    }))
  ];
  const entries: CoverageEntryV1[] = [
    ...units.map((unit) => ({ subjectType: 'unit' as const, subjectId: unit.coverageSubject!.subjectId, status: 'covered' as const })),
    ...units.map((unit) => ({ subjectType: 'weapon' as const, subjectId: unit.weaponProfiles[0].id, status: 'covered' as const })),
    ...array(facts.physicalProfiles, 'physicalProfiles').map((profile) => ({ subjectType: 'physical-profile' as const, subjectId: text(record(profile, 'physicalProfile').id, 'physicalProfile.id'), status: 'covered' as const })),
    ...ruleEntries,
    { subjectType: 'terrain', subjectId: text(terrainLayout.id, 'terrainLayout.id'), status: 'covered' },
    { subjectType: 'scenario', subjectId: M4_SCENARIO_ID, status: 'covered' }
  ];
  return [...new Map(entries.map((entry) => [`${entry.subjectType}:${entry.subjectId}`, entry])).values()]
    .sort((left, right) => `${left.subjectType}:${left.subjectId}`.localeCompare(`${right.subjectType}:${right.subjectId}`));
}

function physicalProfilesFor(facts: JsonRecord): Readonly<Record<string, PhysicalModelProfileV1>> {
  const profiles = array(facts.physicalProfiles, 'physicalProfiles').map((value) => record(value, 'physicalProfile'));
  const entries = profiles.map((profile) => {
    const shape = record(profile.shape, 'physicalProfile.shape');
    const provenance = record(profile.provenance, 'physicalProfile.provenance');
    const id = text(profile.id, 'physicalProfile.id');
    assert(text(shape.kind, 'physicalProfile.shape.kind') === 'circle', 'Le pilote M4 exige des socles circulaires pour sa convention LoS.');
    return [id, {
      schemaVersion: SIMULATOR_SCHEMA_VERSION,
      id,
      displayName: text(profile.displayName, 'physicalProfile.displayName'),
      baseShape: { kind: 'circle' as const, radius: integer(shape.radius, 'physicalProfile.shape.radius') },
      height: integer(profile.height, 'physicalProfile.height'),
      // ADR-008 deliberately replaces the historical normalized sample list.
      visibilityPoints: [],
      source: {
        sourceId: text(provenance.sourceId, 'physicalProfile.provenance.sourceId'),
        version: text(provenance.version, 'physicalProfile.provenance.version'),
        effectiveFrom: text(provenance.effectiveDate, 'physicalProfile.provenance.effectiveDate')
      },
      isConvention: true
    } satisfies PhysicalModelProfileV1] as const;
  });
  assert(new Set(entries.map(([id]) => id)).size === entries.length, 'Les profils physiques M4 doivent être uniques.');
  return Object.fromEntries(entries);
}

function oathOfMomentFor(facts: JsonRecord, catalogVersion: string, effectiveDate: string) {
  const oath = array(facts.mandatoryRules, 'mandatoryRules')
    .map((value) => record(value, 'mandatoryRule'))
    .find((rule) => text(rule.id, 'mandatoryRule.id') === 'adeptus-astartes.oath-of-moment');
  assert(oath, 'Le fait Oath of Moment est requis pour le pilote M4.');
  const sources = array(oath.sourceReferences, 'Oath.sourceReferences').map((value) => record(value, 'Oath.sourceReference'));
  const sourceBySide = new Map<string, SourceReferenceV1>(sources.map((source) => {
    const sourceId = text(source.sourceId, 'Oath.sourceReference.sourceId');
    const side = sourceId.includes('salamanders') ? 'salamanders' : sourceId.includes('blood-angels') ? 'blood-angels' : '';
    assert(side, 'Chaque source Oath M4 doit être rattachée à un camp du pilote.');
    return [side, { sourceId, version: catalogVersion, effectiveFrom: effectiveDate } satisfies SourceReferenceV1] as const;
  }));
  const variants = array(oath.variants, 'Oath.variants').map((value) => record(value, 'Oath.variant')).map((variant) => {
    const playerId = text(variant.side, 'Oath.variant.side');
    const source = sourceBySide.get(playerId);
    assert(source, `La variante Oath ${playerId} doit posséder une source locale.`);
    assert(variant.rerollHit === true, 'Le pilote M4 exige la relance des touches Oath.');
    const woundRollModifier = integer(variant.woundRollModifier, 'Oath.variant.woundRollModifier');
    assert(woundRollModifier === 0 || woundRollModifier === 1, 'Le bonus Oath M4 doit être 0 ou +1.');
    return { playerId, rerollFailedHits: true as const, woundRollModifier: woundRollModifier as 0 | 1, sourceRefs: [source] };
  });
  assert(variants.length === 2 && new Set(variants.map((variant) => variant.playerId)).size === 2, 'Deux variantes Oath M4 exactes sont requises.');
  return { id: 'adeptus-astartes.oath-of-moment' as const, variants };
}

/** Compiles the human-reviewed local terrain used by the covered M4 duel. */
function terrainZonesFor(facts: JsonRecord): readonly ShootingTerrainZone[] {
  const layout = record(facts.terrainLayout, 'terrainLayout');
  assert(text(layout.reviewStatus, 'terrainLayout.reviewStatus') === 'human-reviewed', 'Le terrain M4 doit être approuvé avant son exécution.');
  const board = record(layout.board, 'terrainLayout.board');
  assert(integer(board.width, 'terrainLayout.board.width') === M4_BOARD.width
    && integer(board.height, 'terrainLayout.board.height') === M4_BOARD.height, 'Le terrain M4 doit correspondre au plateau fermé.');
  const zones = array(layout.zones, 'terrainLayout.zones').map((value) => record(value, 'terrainLayout.zone'));
  return zones.map((zone) => {
    const footprint = record(zone.footprint, 'terrainLayout.zone.footprint');
    const outer = array(footprint.outer, 'terrainLayout.zone.footprint.outer').map((point) => {
      const value = record(point, 'terrainLayout.zone.point');
      return { x: integer(value.x, 'terrainLayout.zone.point.x'), y: integer(value.y, 'terrainLayout.zone.point.y') };
    });
    return {
      id: text(zone.id, 'terrainLayout.zone.id'),
      footprint: { polygons: [{ outer }] },
      ruleIds: array(zone.ruleIds, 'terrainLayout.zone.ruleIds').map((ruleId) => text(ruleId, 'terrainLayout.zone.ruleId'))
    };
  });
}

function shootingEnvironmentFor(
  facts: JsonRecord,
  units: readonly UnitSetup[],
  catalogVersion: string,
  effectiveDate: string
): ShootingEnvironment {
  const physicalProfiles = physicalProfilesFor(facts);
  const weaponProfiles: Record<string, WeaponProfileV1> = {};
  for (const weapon of units.flatMap((unit) => unit.weaponProfiles)) {
    // A profile ID can be shared by the same printed weapon on several unit
    // sheets. Source provenance remains on each UnitSetup and on the event.
    weaponProfiles[weapon.id] ??= weapon;
  }
  return createShootingEnvironment({
    physicalProfiles,
    weaponProfiles,
    terrainZones: terrainZonesFor(facts),
    coverRules: [{
      id: 'core.benefit-of-cover',
      source: CORE_BENEFIT_OF_COVER_SOURCE,
      ballisticSkillPenalty: 1,
      branches: [
        { kind: 'inside-terrain-zone', qualifyingKeywords: ['INFANTRY', 'BEAST', 'SWARM'] },
        { kind: 'not-entirely-visible-due-to-terrain' }
      ]
    }],
    oathOfMoment: oathOfMomentFor(facts, catalogVersion, effectiveDate),
    lineOfSightPolicy: { id: 'm4-sampled-cylinder-los-v1', version: '1.0.0' }
  });
}

function movementPolicyFor(facts: JsonRecord, units: readonly UnitSetup[], board: typeof M4_BOARD): M4RealRosterMovementPolicy {
  const factsByUnitId = new Map(array(facts.unitFacts, 'unitFacts').map((value) => {
    const fact = record(value, 'unitFact');
    return [text(record(fact.catalogLink, 'catalogLink').unitId, 'catalogLink.unitId'), fact] as const;
  }));
  const normalMoveByModelId: Record<string, WorldUnit> = {};
  const pistolWeaponProfileIds = new Set<string>();
  for (const unit of units) {
    const unitId = unit.coverageSubject?.subjectId;
    const fact = unitId ? factsByUnitId.get(unitId) : undefined;
    assert(fact, `Fait d’unité M4 manquant pour le mouvement de ${unit.id}.`);
    const movement = integer(record(fact.characteristics, 'characteristics').movement, 'characteristics.movement');
    assert(movement > 0, 'Le mouvement normal M4 doit être strictement positif.');
    unit.modelIds.forEach((modelId) => { normalMoveByModelId[modelId] = movement; });
    const selected = record(fact.selectedRangedWeapon, 'selectedRangedWeapon');
    const keywords = array(selected.keywords, 'selectedRangedWeapon.keywords').map((keyword) => text(keyword, 'selectedRangedWeapon.keyword'));
    assert(keywords.includes('PISTOL'), `Le profil M4 ${unit.id} doit déclarer le mot-clé PISTOL contrôlé.`);
    pistolWeaponProfileIds.add(unit.weaponProfiles[0].id);
  }
  return {
    board,
    normalMoveByModelId,
    // 10.06 (p. 35) est cité par le fait [PISTOL] M4 : le pilote refuse toute
    // position à 1\" ou moins plutôt que de prétendre résoudre l'exception PISTOL.
    engagementRange: 254,
    pistolWeaponProfileIds: [...pistolWeaponProfileIds].sort()
  };
}

/**
 * Compiles the exact approved real rosters into a session-shaped object and a
 * complete compatibility matrix for the approved M4 shooting scope.
 */
export function assembleM4RealRosterSession(documents: M4RealRosterSessionDocuments = M4_REAL_ROSTER_SESSION_DOCUMENTS): M4RealRosterSessionPlan {
  const proposal = record(documents.proposal, 'proposal M4');
  const facts = record(documents.facts, 'faits M4');
  const proposalId = text(proposal.id, 'proposal.id');
  assert(proposalId === M4_SCENARIO_ID, 'proposal.id doit définir le scénario M4 exact.');
  assert(text(facts.status, 'facts.status') === 'draft' && text(facts.coverageClaim, 'facts.coverageClaim') === 'none', 'Les faits M4 ne doivent pas revendiquer de couverture.');
  const los = record(facts.lineOfSightConvention, 'lineOfSightConvention');
  assert(text(los.id, 'lineOfSightConvention.id') === 'm4-sampled-cylinder-los-v1'
    && text(los.implementationStatus, 'lineOfSightConvention.implementationStatus') === 'implemented-closed-m4'
    && text(los.requiredByTask, 'lineOfSightConvention.requiredByTask') === 'SIM-M4-T08', 'La convention LoS M4 T08 implémentée est requise.');

  const catalog = record(facts.catalog, 'facts.catalog');
  const catalogVersion = text(catalog.version, 'facts.catalog.version');
  const catalogEffectiveDate = text(catalog.publishDate, 'facts.catalog.publishDate').slice(0, 10);
  assert(!Number.isNaN(Date.parse(catalogEffectiveDate)), 'facts.catalog.publishDate doit contenir une date valide.');
  const factsByUnitId = new Map(array(facts.unitFacts, 'unitFacts').map((value) => {
    const fact = record(value, 'unitFact');
    return [text(record(fact.catalogLink, 'catalogLink').unitId, 'catalogLink.unitId'), fact] as const;
  }));
  const rosters = array(proposal.rosters, 'proposal.rosters').map((value) => record(value, 'proposal.roster'));
  assert(rosters.length === 2, 'Deux rosters M4 exacts sont requis.');
  const sides = rosters.map((roster) => text(roster.side, 'roster.side')).sort();
  assert(JSON.stringify(sides) === JSON.stringify(['blood-angels', 'salamanders']), 'Les côtés Salamanders et Blood Angels sont requis.');

  const units: UnitSetup[] = [];
  const models: ModelSetup[] = [];
  for (const roster of rosters.sort((left, right) => text(left.side, 'roster.side').localeCompare(text(right.side, 'roster.side')))) {
    const side = text(roster.side, 'roster.side');
    const draft = record(roster.draft, 'roster.draft');
    const items = array(draft.items, 'roster.draft.items').map((value) => record(value, 'roster item'))
      .sort((left, right) => text(left.id, 'roster item.id').localeCompare(text(right.id, 'roster item.id')));
    const resolvedUnits = array(record(roster.resolved, 'roster.resolved').units, 'roster.resolved.units').map((value) => record(value, 'resolved unit'));
    for (const item of items) {
      const unitId = text(item.unitId, 'roster item.unitId');
      const resolvedUnit = resolvedUnits.find((candidate) => text(candidate.id, 'resolvedUnit.id') === unitId);
      const fact = factsByUnitId.get(unitId);
      assert(resolvedUnit && fact, `L’unité approuvée ${unitId} doit avoir un fait M4 exact.`);
      const unit = unitFor(proposalId, roster, item, resolvedUnit, fact, catalogVersion, catalogEffectiveDate);
      const startingIndex = models.length;
      models.push(...unit.modelIds.map((id, index) => ({
        id,
        playerId: side,
        profileId: profileIdFor(fact),
        position: draftDeploymentPosition(side, startingIndex + index),
        orientationDegrees: side === 'salamanders' ? 0 : 180
      })));
      units.push(unit);
    }
  }
  assert(units.length === 4 && models.length === 14, 'Les quatre unités et quatorze figurines M4 approuvées sont requises.');
  const environment = shootingEnvironmentFor(facts, units, catalogVersion, catalogEffectiveDate);
  const movement = movementPolicyFor(facts, units, M4_BOARD);

  const rulePackFingerprint = fingerprint({ mandatoryRules: facts.mandatoryRules, lineOfSightConvention: facts.lineOfSightConvention, terrainLayout: facts.terrainLayout });
  const scenarioFingerprint = fingerprint({ proposalId, rosters: proposal.rosters, board: M4_BOARD, deployment: 'm4-preset-deployment-v1' });
  const manifest: SimulatorManifestV1 = {
    schemaVersion: SIMULATOR_SCHEMA_VERSION,
    simulatorVersion: text(facts.baseManifestVersion, 'facts.baseManifestVersion'),
    catalogFingerprint: text(catalog.fingerprint, 'facts.catalog.fingerprint'),
    rulePackIds: [...M4_RULE_PACK_IDS],
    rulePackFingerprint,
    scenarioId: M4_SCENARIO_ID,
    scenarioFingerprint,
    coverageVersion: M4_COVERAGE_VERSION
  };
  const session: SessionSetup = {
    manifest,
    players: rosters.map((roster) => {
      const side = text(roster.side, 'roster.side');
      return { id: side, displayName: side === 'salamanders' ? 'Salamanders' : 'Blood Angels', rosterId: text(record(roster.draft, 'roster.draft').id, 'roster.draft.id') };
    }).sort((left, right) => left.id.localeCompare(right.id)),
    models,
    units,
    shootingEnvironmentFingerprint: environment.fingerprint
  };
  const coverage: CoverageReportV1 = { schemaVersion: SIMULATOR_SCHEMA_VERSION, version: M4_COVERAGE_VERSION, entries: coverageEntries(facts, units) };
  const terrainLayout = record(facts.terrainLayout, 'terrainLayout');
  const compatibility = createSessionCompatibilityReport(session, coverage, [{ subjectType: 'terrain', subjectId: text(terrainLayout.id, 'terrainLayout.id') }]);
  assert(coverage.entries.every((entry) => entry.status === 'covered'), 'La matrice M4 T08 doit couvrir chaque dépendance déclarée.');
  assert(compatibility.failures.length === 0 && compatibility.isCompatible, 'La session M4 doit être compatible après l’intégration T08.');
  return {
    session,
    environment,
    movement,
    coverage,
    compatibility,
    deployment: { board: M4_BOARD, status: 'covered', reason: 'Placement prédéfini M4 lié à la session, au terrain local approuvé et aux empreintes de scénario.' }
  };
}

/**
 * Binds every authoritative M4 resolver at once. UI and persistence adapters
 * must use this factory rather than assembling a generic simulator actor.
 */
export function createM4RealRosterActor(input: CreateM4RealRosterActorInput): SimulatorActor {
  const runtime = input.runtime ?? assembleM4RealRosterSession();
  return createSimulatorActor({
    initialState: input.initialState,
    gameState: input.gameState,
    compatibility: runtime.compatibility,
    shootingEnvironment: runtime.environment,
    movementCommandResolver: {
      execute: (state, command) => executeM4RealRosterMove(state, command, runtime)
    }
  });
}
