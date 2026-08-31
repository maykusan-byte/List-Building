import {
  BATTLE_STATE_V1_SCHEMA_VERSION,
  COMPLETE_GAME_SESSION_V1_SCHEMA_VERSION,
  GAME_EVENT_STREAM_V1_SCHEMA_VERSION,
  MISSION_STATE_V1_SCHEMA_VERSION,
  OBJECTIVE_MARKER_V1_SCHEMA_VERSION,
  RESOLUTION_QUEUE_V1_SCHEMA_VERSION,
  type BattleStateV1,
  type CompleteGameSessionSetupV1,
  type MissionObjectiveRoleV1,
  type MissionStateV1,
  type ResolutionQueueEntryV1,
  type ResolutionQueueV1,
  type SessionSetup,
  type WorldBoundsV1
} from './types';
import { assertCompatibleCompatibilityReportV2, type CompatibilityReportV2 } from './full-game-compiler';
import { CORE_OBJECTIVE_CONTROL_SOURCE, CORE_TERRAIN_OBJECTIVE_SOURCE, OFFICIAL_APP_OBJECTIVE_MARKER_SOURCE, OFFICIAL_APP_TERRAIN_OBJECTIVE_SOURCE } from '../rules/m8-source-references';

const OBJECTIVE_MARKER_SOURCE_REFS = [
  CORE_TERRAIN_OBJECTIVE_SOURCE,
  CORE_OBJECTIVE_CONTROL_SOURCE,
  OFFICIAL_APP_TERRAIN_OBJECTIVE_SOURCE,
  OFFICIAL_APP_OBJECTIVE_MARKER_SOURCE
] as const;

const CLOSED_MISSION_OBJECTIVE_ROLES: readonly MissionObjectiveRoleV1[] = [
  'attacker-home', 'defender-home', 'no-mans-land-1', 'no-mans-land-2', 'centre-1', 'centre-2'
];

function assertUniqueNonEmpty(values: readonly string[], label: string): void {
  if (values.length === 0 || values.some((value) => !value.trim()) || new Set(values).size !== values.length) {
    throw new RangeError(`${label} must contain unique non-empty identifiers.`);
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

function assertWorldBounds(bounds: WorldBoundsV1, label: string): void {
  if (![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isSafeInteger)
    || bounds.minX >= bounds.maxX || bounds.minY >= bounds.maxY) {
    throw new RangeError(`${label} must be a non-empty integer AABB.`);
  }
}

/**
 * Exact executable proof used by CompatibilityReportV2. It includes battle and
 * mission facts but omits only compatibility/report metadata to avoid a cycle.
 */
export function completeGameExecutableSessionFingerprintV1(
  session: SessionSetup,
  completeGameFacts: Pick<CompleteGameSessionSetupV1, 'battle' | 'mission'> | undefined = session.completeGame
): string {
  return canonicalJson({
    manifest: {
      ...session.manifest,
      rulePackIds: [...session.manifest.rulePackIds].sort()
    },
    shootingEnvironmentFingerprint: session.shootingEnvironmentFingerprint ?? null,
    completeGameFacts: completeGameFacts === undefined ? null : {
      battle: completeGameFacts.battle,
      mission: completeGameFacts.mission
    },
    players: [...session.players].map((player) => ({ ...player })).sort((left, right) => left.id.localeCompare(right.id)),
    models: [...session.models].map((model) => ({
      id: model.id,
      playerId: model.playerId,
      profileId: model.profileId,
      position: model.position,
      orientationDegrees: model.orientationDegrees
    })).sort((left, right) => left.id.localeCompare(right.id)),
    units: [...(session.units ?? [])].map((unit) => ({
      id: unit.id,
      fixtureId: unit.fixtureId,
      coverageSubject: unit.coverageSubject ?? null,
      playerId: unit.playerId,
      movement: unit.movement ?? null,
      modelIds: [...unit.modelIds].sort(),
      keywords: [...unit.keywords].sort(),
      toughness: unit.toughness,
      save: unit.save,
      woundsPerModel: unit.woundsPerModel,
      leadership: unit.leadership ?? null,
      objectiveControl: unit.objectiveControl ?? null,
      weaponProfiles: [...unit.weaponProfiles].sort((left, right) => left.id.localeCompare(right.id)),
      weaponAssignments: [...(unit.weaponAssignments ?? [])].sort((left, right) => `${left.modelId}:${left.weaponProfileId}:${left.quantity}`.localeCompare(`${right.modelId}:${right.weaponProfileId}:${right.quantity}`)),
      extendedDefence: unit.extendedDefence ?? null,
      sourceRefs: [...unit.sourceRefs].sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)))
    })).sort((left, right) => left.id.localeCompare(right.id))
  });
}

export function createCompleteGameSessionSetupV1(
  report: CompatibilityReportV2,
  setup: Pick<CompleteGameSessionSetupV1, 'battle' | 'mission'>
): CompleteGameSessionSetupV1 {
  assertCompatibleCompatibilityReportV2(report);
  if (setup.mission.id !== report.missionCandidate.id) throw new RangeError('Complete-game mission does not match its compatibility report.');
  return {
    schemaVersion: COMPLETE_GAME_SESSION_V1_SCHEMA_VERSION,
    eventStreamSchemaVersion: GAME_EVENT_STREAM_V1_SCHEMA_VERSION,
    compatibility: {
      status: 'compatible',
      reportVersion: report.reportVersion,
      reportFingerprint: report.canonicalFingerprint,
      coverageScope: report.coverageScope,
      coverageVersion: report.coverageVersion,
      report
    },
    battle: setup.battle,
    mission: setup.mission
  };
}

export function assertCompleteGameSessionSetupV1(setup: CompleteGameSessionSetupV1, session: SessionSetup): void {
  const { manifest } = session;
  const sessionPlayerIds = session.players.map((player) => player.id);
  const report = setup.compatibility.report;
  assertCompatibleCompatibilityReportV2(report);
  if (setup.schemaVersion !== COMPLETE_GAME_SESSION_V1_SCHEMA_VERSION
    || setup.eventStreamSchemaVersion !== GAME_EVENT_STREAM_V1_SCHEMA_VERSION
    || setup.compatibility.status !== 'compatible'
    || !setup.compatibility.reportVersion.trim()
    || !setup.compatibility.reportFingerprint.trim()
    || !setup.compatibility.coverageScope.trim()
    || !setup.compatibility.coverageVersion.trim()
    || setup.compatibility.reportVersion !== report.reportVersion
    || setup.compatibility.reportFingerprint !== report.canonicalFingerprint
    || setup.compatibility.coverageScope !== report.coverageScope
    || setup.compatibility.coverageVersion !== report.coverageVersion) {
    throw new RangeError('Complete-game compatibility metadata is malformed.');
  }
  assertUniqueNonEmpty(setup.battle.playerIds, 'Complete-game playerIds');
  if (setup.battle.maxBattleRounds !== 5
    || setup.battle.playerIds.length !== sessionPlayerIds.length
    || setup.battle.playerIds.some((playerId) => !sessionPlayerIds.includes(playerId))) {
    throw new RangeError('Complete-game battle setup is malformed.');
  }
  assertWorldBounds(setup.battle.boardBounds, 'Complete-game boardBounds');
  if (setup.battle.attackerPlayerId === setup.battle.defenderPlayerId
    || !setup.battle.playerIds.includes(setup.battle.attackerPlayerId)
    || !setup.battle.playerIds.includes(setup.battle.defenderPlayerId)) {
    throw new RangeError('Complete-game attacker and defender roles are malformed.');
  }
  assertUniqueNonEmpty(setup.battle.deploymentZones.map((zone) => zone.id), 'Complete-game deployment zone IDs');
  if (setup.battle.deploymentZones.length !== setup.battle.playerIds.length
    || new Set(setup.battle.deploymentZones.map((zone) => zone.playerId)).size !== setup.battle.playerIds.length
    || setup.battle.deploymentZones.some((zone) => {
      assertWorldBounds(zone.bounds, `Complete-game deployment zone ${zone.id}`);
      const polygon = zone.polygon;
      if (polygon !== undefined) {
        if (polygon.length < 3 || polygon.some((point) => !Number.isSafeInteger(point.x) || !Number.isSafeInteger(point.y)
          || point.x < zone.bounds.minX || point.x > zone.bounds.maxX
          || point.y < zone.bounds.minY || point.y > zone.bounds.maxY)) return true;
        const polygonBounds = {
          minX: Math.min(...polygon.map((point) => point.x)),
          minY: Math.min(...polygon.map((point) => point.y)),
          maxX: Math.max(...polygon.map((point) => point.x)),
          maxY: Math.max(...polygon.map((point) => point.y))
        };
        if (canonicalJson(polygonBounds) !== canonicalJson(zone.bounds)) return true;
      }
      return !setup.battle.playerIds.includes(zone.playerId)
        || zone.bounds.minX < setup.battle.boardBounds.minX
        || zone.bounds.minY < setup.battle.boardBounds.minY
        || zone.bounds.maxX > setup.battle.boardBounds.maxX
        || zone.bounds.maxY > setup.battle.boardBounds.maxY;
    })) {
    throw new RangeError('Complete-game deployment zones are malformed.');
  }
  assertUniqueNonEmpty(setup.mission.objectiveMarkerIds, 'Complete-game objectiveMarkerIds');
  const objectiveMarkers = setup.mission.objectiveMarkers ?? [];
  if (objectiveMarkers.length > 0) {
    assertUniqueNonEmpty(objectiveMarkers.map((marker) => marker.id), 'Complete-game objective marker IDs');
    const declaredIds = [...setup.mission.objectiveMarkerIds].sort();
    const geometryIds = objectiveMarkers.map((marker) => marker.id).sort();
    if (declaredIds.length !== geometryIds.length || declaredIds.some((id, index) => id !== geometryIds[index])
      || objectiveMarkers.some((marker) => marker.schemaVersion !== OBJECTIVE_MARKER_V1_SCHEMA_VERSION
        || marker.kind !== 'objective-marker'
        || !Number.isSafeInteger(marker.center.x) || !Number.isSafeInteger(marker.center.y)
        || !Number.isSafeInteger(marker.elevation) || marker.elevation < 0
        || marker.center.x < setup.battle.boardBounds.minX || marker.center.x > setup.battle.boardBounds.maxX
        || marker.center.y < setup.battle.boardBounds.minY || marker.center.y > setup.battle.boardBounds.maxY
        || marker.diameter !== 400 || marker.horizontalRange !== 762 || marker.verticalRange !== 1_270
        || canonicalJson(marker.sourceRefs) !== canonicalJson(OBJECTIVE_MARKER_SOURCE_REFS))) {
      throw new RangeError('Complete-game objective marker geometry is malformed.');
    }
  }
  if (!setup.mission.id.trim() || !setup.mission.definitionFingerprint.trim()) {
    throw new RangeError('Complete-game mission setup is malformed.');
  }
  if (setup.mission.scoringProfileId !== undefined
    && (setup.mission.scoringProfileId !== 'closed-complete-game-disruption-v1'
      || setup.mission.id !== 'closed-complete-game-disruption-v1')) {
    throw new RangeError('Complete-game mission scoring profile is malformed.');
  }
  if (setup.mission.scoringProfileId !== undefined) {
    const roleById = setup.mission.objectiveRoleById;
    const declaredIds = [...setup.mission.objectiveMarkerIds].sort((left, right) => left.localeCompare(right));
    const roleIds = roleById === undefined ? [] : Object.keys(roleById).sort((left, right) => left.localeCompare(right));
    const roles = roleById === undefined ? [] : Object.values(roleById).sort((left, right) => left.localeCompare(right));
    if (canonicalJson(roleIds) !== canonicalJson(declaredIds)
      || canonicalJson(roles) !== canonicalJson([...CLOSED_MISSION_OBJECTIVE_ROLES].sort((left, right) => left.localeCompare(right)))) {
      throw new RangeError('Complete-game mission objective roles are malformed.');
    }
  } else if (setup.mission.objectiveRoleById !== undefined) {
    throw new RangeError('Complete-game mission objective roles require an executable scoring profile.');
  }
  if (manifest.scenarioId !== setup.mission.id
    || report.missionCandidate.id !== setup.mission.id
    || manifest.scenarioFingerprint !== setup.mission.definitionFingerprint
    || manifest.coverageVersion !== setup.compatibility.coverageVersion) {
    throw new RangeError('Complete-game setup does not match its simulator manifest.');
  }
  if (completeGameExecutableSessionFingerprintV1(session) !== report.executableSessionFingerprint) {
    throw new RangeError('Complete-game executable facts do not match their compatibility report.');
  }

  const reportRostersById = new Map(report.rosterCandidates.map((roster) => [roster.id, roster]));
  const playerByRosterId = new Map(session.players.map((player) => [player.rosterId, player]));
  if (reportRostersById.size !== session.players.length
    || playerByRosterId.size !== session.players.length
    || [...reportRostersById.keys()].some((rosterId) => !playerByRosterId.has(rosterId))) {
    throw new RangeError('Complete-game players do not match the compiled rosters.');
  }

  const units = session.units ?? [];
  const expectedCoverageSubjectType = report.coverageScope === 'closed-complete-game-core-poc-v1' ? 'fixture-unit' : 'unit';
  const unitsById = new Map(units.map((unit) => [unit.id, unit]));
  const expectedUnitIds = report.rosterCandidates.flatMap((roster) => roster.units.map((unit) => unit.instanceId));
  if (unitsById.size !== units.length || units.length !== expectedUnitIds.length
    || units.some((unit) => !expectedUnitIds.includes(unit.id))) {
    throw new RangeError('Complete-game session units do not match the compiled rosters.');
  }
  for (const player of session.players) {
    const roster = reportRostersById.get(player.rosterId)!;
    for (const expectedUnit of roster.units) {
      const unit = unitsById.get(expectedUnit.instanceId);
      if (!unit
        || unit.playerId !== player.id
        || unit.coverageSubject?.subjectType !== expectedCoverageSubjectType
        || unit.coverageSubject.subjectId !== expectedUnit.unitId
        || unit.modelIds.length !== expectedUnit.modelCount
        || !Number.isInteger(unit.movement) || unit.movement! <= 0
        || !Number.isInteger(unit.leadership) || unit.leadership! < 2 || unit.leadership! > 12
        || !Number.isInteger(unit.objectiveControl) || unit.objectiveControl! < 0) {
        throw new RangeError(`Complete-game unit ${expectedUnit.instanceId} does not match its compiled roster.`);
      }
    }
  }
  const allocatedModelIds = units.flatMap((unit) => unit.modelIds).sort();
  const sessionModelIds = session.models.map((model) => model.id).sort();
  if (new Set(allocatedModelIds).size !== allocatedModelIds.length
    || allocatedModelIds.length !== sessionModelIds.length
    || allocatedModelIds.some((modelId, index) => modelId !== sessionModelIds[index])) {
    throw new RangeError('Complete-game models must belong to exactly one compiled unit.');
  }
}

export function createBattleStateV1(setup: CompleteGameSessionSetupV1): BattleStateV1 {
  return {
    schemaVersion: BATTLE_STATE_V1_SCHEMA_VERSION,
    lifecycle: 'deployment',
    maxBattleRounds: setup.battle.maxBattleRounds,
    battleRound: 0,
    turnNumber: 0,
    playerIds: [...setup.battle.playerIds],
    boardBounds: { ...setup.battle.boardBounds },
    attackerPlayerId: setup.battle.attackerPlayerId,
    defenderPlayerId: setup.battle.defenderPlayerId,
    deploymentZones: setup.battle.deploymentZones.map((zone) => ({
      ...zone,
      bounds: { ...zone.bounds },
      ...(zone.polygon === undefined ? {} : { polygon: zone.polygon.map((point) => ({ ...point })) })
    })),
    nextDeploymentPlayerId: setup.battle.defenderPlayerId,
    deployedUnitIds: [],
    deploymentOrder: [],
    firstPlayerId: null,
    activePlayerId: null,
    phase: 'deployment'
  };
}

export function createMissionStateV1(setup: CompleteGameSessionSetupV1): MissionStateV1 {
  const objectiveMarkers = (setup.mission.objectiveMarkers ?? []).map((marker) => structuredClone(marker));
  const emptyBreakdown = () => ({
    primaryVp: 0,
    secondaryVp: 0,
    battleReadyVp: 0,
    fixedSecondaryVpById: { assassination: 0, 'engage-on-all-fronts': 0 },
    primaryVpByBattleRound: {},
    secondaryVpByBattleRound: {},
    totalVp: 0
  });
  return {
    schemaVersion: MISSION_STATE_V1_SCHEMA_VERSION,
    missionId: setup.mission.id,
    missionDefinitionFingerprint: setup.mission.definitionFingerprint,
    lifecycle: 'ready',
    objectiveMarkerIds: [...setup.mission.objectiveMarkerIds],
    objectiveMarkers,
    objectiveControllers: Object.fromEntries(setup.mission.objectiveMarkerIds.map((objectiveId) => [objectiveId, null])),
    latestObjectiveControlById: Object.fromEntries(setup.mission.objectiveMarkerIds.map((objectiveId) => [objectiveId, null])),
    objectiveControlEventIds: [],
    scoresByPlayerId: Object.fromEntries(setup.battle.playerIds.map((playerId) => [playerId, 0])),
    scoreEventIds: [],
    ...(setup.mission.scoringProfileId === undefined ? {} : {
      scoringProfileId: setup.mission.scoringProfileId,
      objectiveRoleById: structuredClone(setup.mission.objectiveRoleById!),
      scoreBreakdownByPlayerId: Object.fromEntries(setup.battle.playerIds.map((playerId) => [playerId, emptyBreakdown()])),
      scoredCheckpointIds: [],
      scoredAssassinationModelIds: [],
      finalResult: null
    })
  };
}

export function createResolutionQueueV1(): ResolutionQueueV1 {
  return {
    schemaVersion: RESOLUTION_QUEUE_V1_SCHEMA_VERSION,
    activeEntryId: null,
    entries: [],
    resolvedEntryIds: []
  };
}

function assertResolutionQueueEntryV1(entry: ResolutionQueueEntryV1): void {
  const keys = Object.keys(entry).sort();
  const expectedKeys = ['id', 'kind', 'openedByEventId', 'ownerPlayerId', 'sourceRuleIds'].sort();
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])
    || !entry.id.trim() || !entry.openedByEventId.trim()
    || !['phase-start', 'phase-end', 'reaction', 'decision', 'attack', 'damage', 'score'].includes(entry.kind)
    || (entry.ownerPlayerId !== null && !entry.ownerPlayerId.trim())
    || entry.sourceRuleIds.length === 0
    || entry.sourceRuleIds.some((ruleId) => !ruleId.trim())
    || new Set(entry.sourceRuleIds).size !== entry.sourceRuleIds.length) {
    throw new RangeError('Resolution queue entry is malformed.');
  }
}

function assertResolutionQueueV1(queue: ResolutionQueueV1): void {
  const entryIds = queue.entries.map((entry) => entry.id);
  if (queue.schemaVersion !== RESOLUTION_QUEUE_V1_SCHEMA_VERSION
    || new Set(entryIds).size !== entryIds.length
    || new Set(queue.resolvedEntryIds).size !== queue.resolvedEntryIds.length
    || entryIds.some((id) => queue.resolvedEntryIds.includes(id))
    || (queue.activeEntryId !== null && queue.activeEntryId !== entryIds[0])) {
    throw new RangeError('Resolution queue is malformed.');
  }
  for (const entry of queue.entries) assertResolutionQueueEntryV1(entry);
}

/** Immutable FIFO append; typed events remain responsible for calling it. */
export function enqueueResolutionV1(queue: ResolutionQueueV1, entry: ResolutionQueueEntryV1): ResolutionQueueV1 {
  assertResolutionQueueV1(queue);
  assertResolutionQueueEntryV1(entry);
  if (queue.entries.some((candidate) => candidate.id === entry.id) || queue.resolvedEntryIds.includes(entry.id)) {
    throw new RangeError(`Resolution entry ${entry.id} already exists.`);
  }
  return { ...queue, entries: [...queue.entries, entry] };
}

export function activateNextResolutionV1(queue: ResolutionQueueV1): ResolutionQueueV1 {
  assertResolutionQueueV1(queue);
  if (queue.activeEntryId !== null || queue.entries.length === 0) return queue;
  return { ...queue, activeEntryId: queue.entries[0].id };
}

export function resolveActiveResolutionV1(queue: ResolutionQueueV1, entryId: string): ResolutionQueueV1 {
  assertResolutionQueueV1(queue);
  if (queue.activeEntryId !== entryId || queue.entries[0]?.id !== entryId) {
    throw new RangeError(`Resolution entry ${entryId} is not the active FIFO entry.`);
  }
  return {
    ...queue,
    activeEntryId: null,
    entries: queue.entries.slice(1),
    resolvedEntryIds: [...queue.resolvedEntryIds, entryId]
  };
}

/** Canonical identity used by V6; array order is intentional and executable. */
export function completeGameSessionFingerprint(setup: CompleteGameSessionSetupV1): string {
  return JSON.stringify({
    schemaVersion: setup.schemaVersion,
    eventStreamSchemaVersion: setup.eventStreamSchemaVersion,
    compatibility: {
      status: setup.compatibility.status,
      reportVersion: setup.compatibility.reportVersion,
      reportFingerprint: setup.compatibility.reportFingerprint,
      coverageScope: setup.compatibility.coverageScope,
      coverageVersion: setup.compatibility.coverageVersion
    },
    battle: {
      maxBattleRounds: setup.battle.maxBattleRounds,
      playerIds: [...setup.battle.playerIds],
      boardBounds: setup.battle.boardBounds,
      attackerPlayerId: setup.battle.attackerPlayerId,
      defenderPlayerId: setup.battle.defenderPlayerId,
      deploymentZones: setup.battle.deploymentZones
    },
    mission: {
      id: setup.mission.id,
      definitionFingerprint: setup.mission.definitionFingerprint,
      objectiveMarkerIds: [...setup.mission.objectiveMarkerIds],
      ...(setup.mission.objectiveMarkers === undefined ? {} : { objectiveMarkers: structuredClone(setup.mission.objectiveMarkers) }),
      ...(setup.mission.scoringProfileId === undefined ? {} : {
        scoringProfileId: setup.mission.scoringProfileId,
        objectiveRoleById: structuredClone(setup.mission.objectiveRoleById!)
      })
    }
  });
}
