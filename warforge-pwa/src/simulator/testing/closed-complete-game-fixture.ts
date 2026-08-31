import fullGameCoverageRaw from '../../../data/simulator/full-game-coverage.json';
import simulatorManifestRaw from '../../../data/simulator/manifest.json';
import { completeGameExecutableSessionFingerprintV1, createCompleteGameSessionSetupV1 } from '../domain/battle-state';
import {
  candidateFactsFromCoverageGraphV1,
  compileClosedCompleteGameCompatibilityV2,
  type CompatibilityReportV2,
  type FullGameCoverageGraphV1
} from '../domain/full-game-compiler';
import type { MissionObjectiveRoleV1, ObjectiveMarkerV1, SessionSetup, SourceReferenceV1, WeaponProfileV1 } from '../domain/types';
import { CORE_OBJECTIVE_CONTROL_SOURCE, CORE_TERRAIN_OBJECTIVE_SOURCE, OFFICIAL_APP_OBJECTIVE_MARKER_SOURCE, OFFICIAL_APP_TERRAIN_OBJECTIVE_SOURCE } from '../rules/m8-source-references';

export const COMPLETE_GAME_TEST_SOURCE: SourceReferenceV1 = {
  sourceId: 'complete-game-test-source',
  version: '1.0.0',
  effectiveFrom: '2026-08-27'
};

export const COMPLETE_GAME_TEST_WEAPON: WeaponProfileV1 = {
  id: 'complete-game-test-rifle',
  displayName: 'Complete game test rifle',
  weaponType: 'ranged',
  range: 6_096,
  attacks: 1,
  ballisticSkill: 3,
  strength: 4,
  armourPenetration: 0,
  damage: 1,
  sourceRefs: [COMPLETE_GAME_TEST_SOURCE]
};

export const COMPLETE_GAME_TEST_MELEE_WEAPON: WeaponProfileV1 = {
  id: 'complete-game-test-chainblade',
  displayName: 'Complete game test chainblade',
  weaponType: 'melee',
  range: 0,
  attacks: 2,
  ballisticSkill: 3,
  strength: 4,
  armourPenetration: 0,
  damage: 1,
  sourceRefs: [COMPLETE_GAME_TEST_SOURCE]
};

const characterInstanceIds = ['blood-angels-captain-1', 'salamanders-captain-1'] as const;
export const COMPLETE_GAME_SCORING_OBJECTIVE_ROLE_BY_ID: Readonly<Record<string, MissionObjectiveRoleV1>> = {
  'objective-attacker-home': 'attacker-home',
  'objective-defender-home': 'defender-home',
  'objective-no-mans-land-1': 'no-mans-land-1',
  'objective-no-mans-land-2': 'no-mans-land-2',
  'objective-centre-1': 'centre-1',
  'objective-centre-2': 'centre-2'
};
const graph = fullGameCoverageRaw as unknown as FullGameCoverageGraphV1;
const compilationEnvironment = {
  manifestVersion: simulatorManifestRaw.version,
  registeredSourceIds: simulatorManifestRaw.sources.map((source) => source.id)
};

export function createCurrentClosedPilotReportForTests(): CompatibilityReportV2 {
  return compileClosedCompleteGameCompatibilityV2({
    graph,
    facts: candidateFactsFromCoverageGraphV1(graph, characterInstanceIds),
    environment: compilationEnvironment
  });
}

/** Test-only future state: all currently explicit M6 blockers are resolved. */
export function createCoveredClosedPilotReportForTests(
  executableSessionFingerprint?: string
): CompatibilityReportV2 {
  const coveredGraph: FullGameCoverageGraphV1 = {
    ...graph,
    status: 'covered',
    rosterCandidates: graph.rosterCandidates.map((roster) => ({ ...roster, status: 'covered', blockingGapIds: [] })),
    missionCandidate: { ...graph.missionCandidate, status: 'covered', blockingGapIds: [] },
    nodes: graph.nodes.map((node) => ({
      ...node,
      status: node.status === 'deferred' ? node.status : 'covered',
      blockingGapIds: [],
      sourceRefs: node.id === 'coverage.mission' && node.sourceRefs.length === 0
        ? [{ sourceId: graph.canonicalSourceIds[0], references: ['complete-game-test-mission'] }]
        : node.sourceRefs
    })),
    gaps: graph.gaps.map((gap) => ({ ...gap, status: 'resolved', blocksNodeIds: [] })),
    readiness: { ...graph.readiness, compatible: true, blockingNodeIds: [] }
  };
  if (executableSessionFingerprint === undefined) {
    const base = createCompleteGameSessionBaseForTests();
    executableSessionFingerprint = completeGameExecutableSessionFingerprintV1(base, createCompleteGameExecutionFactsForTests(base));
  }
  return compileClosedCompleteGameCompatibilityV2({
    graph: coveredGraph,
    facts: candidateFactsFromCoverageGraphV1(coveredGraph, characterInstanceIds),
    environment: compilationEnvironment,
    executableSessionFingerprint
  });
}

function createCompleteGameExecutionFactsForTests(
  base: Omit<SessionSetup, 'completeGame'>,
  scoring = false
): Pick<NonNullable<SessionSetup['completeGame']>, 'battle' | 'mission'> {
  const playerIds = base.players.map((player) => player.id);
  const defenderPlayerId = playerIds[0]!;
  const attackerPlayerId = playerIds[1]!;
  const objectiveMarkers: readonly ObjectiveMarkerV1[] = scoring
    ? [
      ['objective-attacker-home', 5_588, 14_000],
      ['objective-defender-home', 5_588, 1_240],
      ['objective-no-mans-land-1', 2_000, 5_000],
      ['objective-no-mans-land-2', 9_176, 10_240],
      ['objective-centre-1', 3_000, 7_620],
      ['objective-centre-2', 8_176, 7_620]
    ].map(([id, x, y]) => ({
      schemaVersion: 'warforge-objective-marker/v1', id: id as string, kind: 'objective-marker',
      center: { x: x as number, y: y as number }, elevation: 0, diameter: 400,
      horizontalRange: 762, verticalRange: 1_270,
      sourceRefs: [CORE_TERRAIN_OBJECTIVE_SOURCE, CORE_OBJECTIVE_CONTROL_SOURCE, OFFICIAL_APP_TERRAIN_OBJECTIVE_SOURCE, OFFICIAL_APP_OBJECTIVE_MARKER_SOURCE]
    }))
    : [{
      schemaVersion: 'warforge-objective-marker/v1', id: 'objective-centre', kind: 'objective-marker',
      center: { x: 5_588, y: 7_620 }, elevation: 0, diameter: 400, horizontalRange: 762, verticalRange: 1_270,
      sourceRefs: [CORE_TERRAIN_OBJECTIVE_SOURCE, CORE_OBJECTIVE_CONTROL_SOURCE, OFFICIAL_APP_TERRAIN_OBJECTIVE_SOURCE, OFFICIAL_APP_OBJECTIVE_MARKER_SOURCE]
    }];
  return {
    battle: {
      maxBattleRounds: 5,
      playerIds,
      boardBounds: { minX: 0, minY: 0, maxX: 11_176, maxY: 15_240 },
      attackerPlayerId,
      defenderPlayerId,
      deploymentZones: [
        { id: 'defender-zone', playerId: defenderPlayerId, bounds: { minX: 0, minY: 0, maxX: 11_176, maxY: 7_620 } },
        { id: 'attacker-zone', playerId: attackerPlayerId, bounds: { minX: 0, minY: 7_620, maxX: 11_176, maxY: 15_240 } }
      ]
    },
    mission: {
      id: 'closed-complete-game-disruption-v1',
      definitionFingerprint: base.manifest.scenarioFingerprint,
      objectiveMarkerIds: objectiveMarkers.map((marker) => marker.id),
      objectiveMarkers,
      ...(scoring ? {
        scoringProfileId: 'closed-complete-game-disruption-v1' as const,
        objectiveRoleById: COMPLETE_GAME_SCORING_OBJECTIVE_ROLE_BY_ID
      } : {})
    }
  };
}

function createCompleteGameSessionBaseForTests(shootingEnvironmentFingerprint = 'complete-game-test-environment'): Omit<SessionSetup, 'completeGame'> {
  const report = createCurrentClosedPilotReportForTests();
  const players = report.rosterCandidates.map((roster) => ({
    id: `player-${roster.side}`,
    displayName: roster.side,
    rosterId: roster.id
  }));
  const playerIdByRosterId = new Map(players.map((player) => [player.rosterId, player.id]));
  let modelIndex = 0;
  const units = report.rosterCandidates.flatMap((roster) => roster.units.map((candidate) => {
    const playerId = playerIdByRosterId.get(roster.id)!;
    const modelIds = Array.from({ length: candidate.modelCount }, (_, index) => `${candidate.instanceId}-model-${index + 1}`);
    return {
      id: candidate.instanceId,
      fixtureId: candidate.instanceId,
      coverageSubject: { subjectType: 'unit' as const, subjectId: candidate.unitId },
      playerId,
      movement: 1_524,
      modelIds,
      keywords: characterInstanceIds.includes(candidate.instanceId as typeof characterInstanceIds[number]) ? ['INFANTRY', 'CHARACTER'] : ['INFANTRY'],
      toughness: 4,
      save: 3,
      woundsPerModel: 2,
      leadership: 6,
      objectiveControl: 2,
      weaponProfiles: [COMPLETE_GAME_TEST_WEAPON, COMPLETE_GAME_TEST_MELEE_WEAPON],
      weaponAssignments: modelIds.flatMap((modelId) => [
        { modelId, weaponProfileId: COMPLETE_GAME_TEST_WEAPON.id, quantity: 1 },
        { modelId, weaponProfileId: COMPLETE_GAME_TEST_MELEE_WEAPON.id, quantity: 1 }
      ]),
      sourceRefs: [COMPLETE_GAME_TEST_SOURCE]
    };
  }));
  const models = units.flatMap((unit) => unit.modelIds.map((modelId) => {
    const index = modelIndex++;
    return {
      id: modelId,
      playerId: unit.playerId,
      profileId: 'infantry',
      position: { x: index * 254, y: unit.playerId.includes('blood-angels') ? 2_540 : 0 },
      orientationDegrees: 0
    };
  }));
  const missionDefinitionFingerprint = 'closed-complete-game-test-mission-definition';
  return {
    manifest: {
      schemaVersion: 'warforge-simulator/v1',
      simulatorVersion: '0.1.0',
      catalogFingerprint: 'closed-complete-game-test-catalog',
      rulePackIds: ['closed-complete-game-test-core'],
      rulePackFingerprint: 'closed-complete-game-test-rules',
      scenarioId: report.missionCandidate.id,
      scenarioFingerprint: missionDefinitionFingerprint,
      coverageVersion: report.coverageVersion
    },
    players,
    models,
    units,
    shootingEnvironmentFingerprint
  };
}

export function createCompleteGameSessionForTests(shootingEnvironmentFingerprint = 'complete-game-test-environment'): SessionSetup {
  const base = createCompleteGameSessionBaseForTests(shootingEnvironmentFingerprint);
  const executionFacts = createCompleteGameExecutionFactsForTests(base);
  const report = createCoveredClosedPilotReportForTests(completeGameExecutableSessionFingerprintV1(base, executionFacts));
  const completeGame = createCompleteGameSessionSetupV1(report, executionFacts);
  return { ...base, completeGame };
}

export function createCompleteGameScoringSessionForTests(shootingEnvironmentFingerprint = 'complete-game-test-environment'): SessionSetup {
  const base = createCompleteGameSessionBaseForTests(shootingEnvironmentFingerprint);
  const executionFacts = createCompleteGameExecutionFactsForTests(base, true);
  const report = createCoveredClosedPilotReportForTests(completeGameExecutableSessionFingerprintV1(base, executionFacts));
  const completeGame = createCompleteGameSessionSetupV1(report, executionFacts);
  return { ...base, completeGame };
}
