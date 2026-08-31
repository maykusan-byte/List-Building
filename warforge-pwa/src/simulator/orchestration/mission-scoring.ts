import { validateGameCommand } from '../domain/commands';
import { calculateMissionScoringV1, missionScoringSourceRefsV1 } from '../domain/mission-scoring';
import { unsafeReduceGameEvent } from '../domain/reducer';
import {
  MISSION_SCORING_V1_SCHEMA_VERSION,
  type CommandExecution,
  type GameCommand,
  type GameEvent,
  type GameState,
  type MissionScoringEnvironmentV1,
  type MissionScoringEvidenceV1,
  type MissionTableQuarterV1,
  type ModelState,
  type PhysicalModelProfileV1,
  type RuleRejection
} from '../domain/types';
import { footprintBounds, footprintDistance, type Footprint } from '../geometry';
import { OBJECTIVE_CONTROL_SOURCE_REFS, evaluateObjectiveControlV1 } from './objective-control';

const ENGAGE_DISTANCE_FROM_CENTRE = 1_524;

function reject(state: GameState, command: GameCommand, code: string, message: string, details?: RuleRejection['details']): CommandExecution {
  return {
    accepted: false,
    state,
    rejection: {
      commandId: command.id,
      code,
      message,
      sourceRuleIds: ['simulator.mission.closed-score-v1'],
      ...(details === undefined ? {} : { details })
    }
  };
}

function footprintFor(model: ModelState, profile: PhysicalModelProfileV1): Footprint {
  switch (profile.baseShape.kind) {
    case 'circle': return { kind: 'circle', center: model.position, radius: profile.baseShape.radius };
    case 'capsule': return {
      kind: 'capsule', center: model.position, radius: profile.baseShape.radius,
      length: profile.baseShape.length, orientationDegrees: model.orientationDegrees
    };
    case 'polygon': return {
      kind: 'oriented-convex-polygon', center: model.position,
      orientationDegrees: model.orientationDegrees, vertices: profile.baseShape.vertices
    };
  }
}

function engageQuarterForUnit(
  state: GameState,
  unitId: string,
  environment: MissionScoringEnvironmentV1
): MissionTableQuarterV1 | null {
  const battle = state.battle!;
  const unit = state.units[unitId]!;
  if (unit.keywords.includes('AIRCRAFT') || state.battleResources?.battleShockedUnitIds.includes(unit.id)) return null;
  const footprints = unit.models.filter((member) => member.active).map((member) => {
    const model = state.models[member.id];
    const profile = model === undefined ? undefined : environment.physicalProfiles[model.profileId];
    if (!model || !profile) throw new RangeError(`Model ${member.id} has no trusted physical profile for mission scoring.`);
    return footprintFor(model, profile);
  });
  if (footprints.length === 0) return null;
  const centre = {
    x: (battle.boardBounds.minX + battle.boardBounds.maxX) / 2,
    y: (battle.boardBounds.minY + battle.boardBounds.maxY) / 2
  };
  if (footprints.some((footprint) => footprintDistance(footprint, { kind: 'circle', center: centre, radius: 0 }) <= ENGAGE_DISTANCE_FROM_CENTRE)) return null;
  const bounds = footprints.map(footprintBounds);
  const minX = Math.min(...bounds.map((candidate) => candidate.minX));
  const maxX = Math.max(...bounds.map((candidate) => candidate.maxX));
  const minY = Math.min(...bounds.map((candidate) => candidate.minY));
  const maxY = Math.max(...bounds.map((candidate) => candidate.maxY));
  const horizontal = maxX <= centre.x ? 'left' : minX >= centre.x ? 'right' : null;
  const vertical = maxY <= centre.y ? 'bottom' : minY >= centre.y ? 'top' : null;
  return horizontal === null || vertical === null ? null : `${vertical}-${horizontal}` as MissionTableQuarterV1;
}

function scoringEvidence(
  state: GameState,
  environment: MissionScoringEnvironmentV1,
  finalCheckpoint: boolean
): MissionScoringEvidenceV1 {
  const engageQuarterByUnitId: Record<string, MissionTableQuarterV1> = {};
  for (const unitId of [...state.battle!.deployedUnitIds].sort((left, right) => left.localeCompare(right))) {
    const quarter = engageQuarterForUnit(state, unitId, environment);
    if (quarter !== null) engageQuarterByUnitId[unitId] = quarter;
  }
  const objectiveRoleById = Object.fromEntries(Object.entries(state.mission!.objectiveRoleById ?? {})
    .sort(([left], [right]) => left.localeCompare(right)));
  const battleReadyByPlayerId = !finalCheckpoint ? null : environment.battleReadyByPlayerId === undefined
    ? null
    : Object.fromEntries(state.battle!.playerIds.map((playerId) => [playerId, environment.battleReadyByPlayerId![playerId]]));
  return {
    schemaVersion: MISSION_SCORING_V1_SCHEMA_VERSION,
    objectiveRoleById,
    engageQuarterByUnitId,
    battleReadyByPlayerId
  };
}

/** Resolves objective control, card scoring, caps and the final result as one journaled checkpoint. */
export function executeMissionScoringCommand(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'resolve-mission-scoring' }>,
  environment: MissionScoringEnvironmentV1
): CommandExecution {
  const basicRejection = validateGameCommand(state, command);
  if (basicRejection) return { accepted: false, state, rejection: basicRejection };
  if (!environment.fingerprint.trim() || environment.fingerprint !== state.shootingEnvironmentFingerprint) {
    return reject(state, command, 'mission-scoring-environment-mismatch', 'Le score exige l’environnement physique compilé de la session.');
  }
  const battle = state.battle!;
  const markers = state.mission!.objectiveMarkers;
  if (markers.length !== state.mission!.objectiveMarkerIds.length) {
    return reject(state, command, 'mission-objective-geometry-incomplete', 'Chaque objectif de mission doit posséder une géométrie autoritaire avant le score.');
  }
  const boundaries = battle.phase === 'fight' ? ['phase-end', 'turn-end'] as const : ['phase-end'] as const;
  const objectiveEvents: Extract<GameEvent, { readonly type: 'objective-control-resolved' }>[] = boundaries.map((boundary) => {
    const checkpoint = {
      battleRound: battle.battleRound,
      turnNumber: battle.turnNumber,
      phase: battle.phase,
      boundary
    } as const;
    return {
      id: `${command.id}:objective:${boundary}`,
      commandId: command.id,
      type: 'objective-control-resolved',
      checkpoint,
      resolutions: [...markers].sort((left, right) => left.id.localeCompare(right.id))
        .map((marker) => evaluateObjectiveControlV1(state, marker, checkpoint, environment)),
      environmentFingerprint: environment.fingerprint,
      sourceRefs: OBJECTIVE_CONTROL_SOURCE_REFS
    };
  });
  let checkpointState = state;
  try {
    checkpointState = objectiveEvents.reduce(unsafeReduceGameEvent, state);
    const finalCheckpoint = battle.battleRound === 5 && battle.turnNumber === 2 && battle.phase === 'fight';
    const evidence = scoringEvidence(checkpointState, environment, finalCheckpoint);
    const calculation = calculateMissionScoringV1(checkpointState, evidence);
    const scoringEvent: Extract<GameEvent, { readonly type: 'mission-scoring-resolved' }> = {
      id: `${command.id}:score`,
      commandId: command.id,
      type: 'mission-scoring-resolved',
      checkpointId: calculation.checkpointId,
      checkpoint: calculation.checkpoint,
      battleRound: battle.battleRound,
      turnNumber: battle.turnNumber,
      activePlayerId: battle.activePlayerId!,
      evidence,
      scoreEvents: calculation.scoreEvents,
      finalResult: calculation.finalResult,
      environmentFingerprint: environment.fingerprint,
      prngBefore: checkpointState.prng,
      prngAfter: checkpointState.prng,
      sourceRefs: missionScoringSourceRefsV1()
    };
    const events: readonly GameEvent[] = [...objectiveEvents, scoringEvent];
    return { accepted: true, state: unsafeReduceGameEvent(checkpointState, scoringEvent), events };
  } catch (error) {
    return reject(state, command, 'mission-scoring-evidence-invalid', error instanceof Error ? error.message : 'Le score ne peut pas être calculé.');
  }
}
