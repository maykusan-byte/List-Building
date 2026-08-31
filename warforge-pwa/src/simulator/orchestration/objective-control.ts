import { executeGameCommand, prepareObjectiveAwareBattlePhaseAdvance } from '../domain/commands';
import { unsafeReduceGameEvent } from '../domain/reducer';
import type {
  CommandExecution,
  GameCommand,
  GameEvent,
  GameState,
  ModelState,
  ObjectiveControlResolutionV1,
  ObjectiveMarkerV1,
  PhysicalModelProfileV1,
  RuleRejection,
  UnitState
} from '../domain/types';
import { footprintDistance, type Footprint } from '../geometry';
import { resolveCharacteristicModifierPlan } from '../rules/modifiers';
import {
  CORE_OBJECTIVE_CONTROL_SOURCE,
  CORE_TERRAIN_OBJECTIVE_SOURCE,
  OFFICIAL_APP_OBJECTIVE_MARKER_SOURCE,
  OFFICIAL_APP_TERRAIN_OBJECTIVE_SOURCE
} from '../rules/m8-source-references';
import type { ShootingEnvironment } from './shooting';

export type ObjectiveControlEnvironment = Pick<ShootingEnvironment, 'fingerprint' | 'physicalProfiles'>;

export const OBJECTIVE_CONTROL_SOURCE_REFS = [
  CORE_TERRAIN_OBJECTIVE_SOURCE,
  CORE_OBJECTIVE_CONTROL_SOURCE,
  OFFICIAL_APP_TERRAIN_OBJECTIVE_SOURCE,
  OFFICIAL_APP_OBJECTIVE_MARKER_SOURCE
] as const;

function reject(state: GameState, command: GameCommand, code: string, message: string): CommandExecution {
  const rejection: RuleRejection = {
    commandId: command.id,
    code,
    message,
    sourceRuleIds: ['14.01', '14.02', '14.01.01']
  };
  return { accepted: false, state, rejection };
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

function verticalDistanceToMarker(profile: PhysicalModelProfileV1, marker: ObjectiveMarkerV1): number {
  if (marker.elevation >= 0 && marker.elevation <= profile.height) return 0;
  return marker.elevation < 0 ? -marker.elevation : marker.elevation - profile.height;
}

function effectiveObjectiveControl(state: GameState, unit: UnitState): { readonly value: number; readonly battleShocked: boolean } {
  const battleShocked = state.battleResources?.battleShockedUnitIds.includes(unit.id) === true;
  if (battleShocked) return { value: 0, battleShocked: true };
  const baseValue = unit.objectiveControl;
  if (!Number.isInteger(baseValue) || baseValue! < 0) throw new RangeError(`Unit ${unit.id} has no executable Objective Control characteristic.`);
  const modifiers = (state.battleResources?.timedEffects ?? [])
    .filter((effect) => effect.targetUnitId === unit.id && effect.modifier.characteristic === 'objective-control')
    .map((effect) => ({
      id: effect.modifier.id,
      operation: effect.modifier.operation,
      value: effect.modifier.value,
      source: effect.modifier.source,
      ...(effect.modifier.canBeIgnored === undefined ? {} : { canBeIgnored: effect.modifier.canBeIgnored })
    }));
  if (modifiers.length === 0) return { value: baseValue!, battleShocked: false };
  const resolution = resolveCharacteristicModifierPlan({ characteristic: 'objective-control', baseValue: baseValue!, modifiers });
  if (!resolution.accepted) throw new RangeError(`Objective Control modifier plan for ${unit.id} is not executable: ${resolution.code}.`);
  return { value: resolution.value, battleShocked: false };
}

export function evaluateObjectiveControlV1(
  state: GameState,
  marker: ObjectiveMarkerV1,
  checkpoint: ObjectiveControlResolutionV1['checkpoint'],
  environment: ObjectiveControlEnvironment
): ObjectiveControlResolutionV1 {
  const battle = state.battle;
  if (!battle || battle.lifecycle !== 'in-progress' || !state.mission?.objectiveMarkerIds.includes(marker.id)) {
    throw new RangeError(`Objective ${marker.id} is outside an active battle.`);
  }
  if (!environment.fingerprint.trim() || environment.fingerprint !== state.shootingEnvironmentFingerprint) {
    throw new RangeError('Objective control requires the trusted physical environment of the session.');
  }
  if (JSON.stringify(marker.sourceRefs) !== JSON.stringify(OBJECTIVE_CONTROL_SOURCE_REFS)) {
    throw new RangeError(`Objective ${marker.id} does not use the canonical M8 objective sources.`);
  }
  const markerFootprint: Footprint = { kind: 'circle', center: marker.center, radius: marker.diameter / 2 };
  const modelEvidence: ObjectiveControlResolutionV1['modelEvidence'][number][] = [];
  for (const unitId of [...battle.deployedUnitIds].sort((left, right) => left.localeCompare(right))) {
    const unit = state.units[unitId];
    if (!unit) throw new RangeError(`Deployed unit ${unitId} is missing from objective control state.`);
    const objectiveControl = effectiveObjectiveControl(state, unit);
    for (const member of unit.models.filter((model) => model.active).sort((left, right) => left.id.localeCompare(right.id))) {
      const model = state.models[member.id];
      const profile = model && environment.physicalProfiles[model.profileId];
      if (!model || !profile) throw new RangeError(`Model ${member.id} has no trusted physical profile for objective control.`);
      const horizontalDistance = footprintDistance(footprintFor(model, profile), markerFootprint);
      const verticalDistance = verticalDistanceToMarker(profile, marker);
      modelEvidence.push({
        modelId: member.id,
        unitId: unit.id,
        playerId: unit.playerId,
        horizontalDistance,
        verticalDistance,
        withinRange: horizontalDistance <= marker.horizontalRange && verticalDistance <= marker.verticalRange,
        baseObjectiveControl: unit.objectiveControl!,
        effectiveObjectiveControl: objectiveControl.value,
        battleShocked: objectiveControl.battleShocked
      });
    }
  }
  modelEvidence.sort((left, right) => left.modelId.localeCompare(right.modelId));
  const controlLevelByPlayerId = Object.fromEntries(battle.playerIds.map((playerId) => [
    playerId,
    modelEvidence.filter((model) => model.playerId === playerId && model.withinRange)
      .reduce((total, model) => total + model.effectiveObjectiveControl, 0)
  ]));
  const [firstPlayerId, secondPlayerId] = battle.playerIds;
  const firstLevel = controlLevelByPlayerId[firstPlayerId] ?? 0;
  const secondLevel = controlLevelByPlayerId[secondPlayerId] ?? 0;
  const tied = firstLevel === secondLevel;
  const controllerPlayerId = tied ? null : firstLevel > secondLevel ? firstPlayerId : secondPlayerId;
  const controllingUnitIdsByPlayerId = Object.fromEntries(battle.playerIds.map((playerId) => [
    playerId,
    controllerPlayerId !== playerId ? [] : [...new Set(modelEvidence
      .filter((model) => model.playerId === playerId && model.withinRange && model.effectiveObjectiveControl >= 1)
      .map((model) => model.unitId))].sort((left, right) => left.localeCompare(right))
  ]));
  return {
    objectiveId: marker.id,
    checkpoint,
    controlLevelByPlayerId,
    controllerPlayerId,
    tied,
    controllingUnitIdsByPlayerId,
    modelEvidence
  };
}

/** Adds the mandatory §14.02 checkpoints before the deterministic phase event. */
export function executeObjectiveAwareAdvanceBattlePhaseCommand(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'advance-battle-phase' }>,
  environment: ShootingEnvironment
): CommandExecution {
  if (!environment.fingerprint.trim() || environment.fingerprint !== state.shootingEnvironmentFingerprint) {
    return reject(state, command, 'trusted-objective-environment-required', 'Le contrôle des objectifs exige l’environnement physique autoritaire de la session.');
  }
  const battle = state.battle;
  const markers = state.mission?.objectiveMarkers ?? [];
  if (!battle || markers.length === 0) return executeGameCommand(state, command);
  const phaseAdvance = prepareObjectiveAwareBattlePhaseAdvance(state, command);
  if (!phaseAdvance.accepted) return phaseAdvance;

  const checkpointBases: ObjectiveControlResolutionV1['checkpoint'][] = [{
    battleRound: battle.battleRound,
    turnNumber: battle.turnNumber,
    phase: battle.phase,
    boundary: 'phase-end'
  }];
  if (battle.phase === 'fight') checkpointBases.push({
    battleRound: battle.battleRound,
    turnNumber: battle.turnNumber,
    phase: battle.phase,
    boundary: 'turn-end'
  });
  // Mission scoring may already have emitted both fight phase-end and
  // turn-end checkpoints. Do not recreate phase-end afterwards: that would
  // replace the latest terminal proof just before the phase event.
  const terminalCheckpoint = checkpointBases.at(-1)!;
  const terminalCheckpointAlreadyResolved = markers.every((marker) => {
    const latest = state.mission?.latestObjectiveControlById[marker.id]?.checkpoint;
    return latest?.battleRound === terminalCheckpoint.battleRound && latest.turnNumber === terminalCheckpoint.turnNumber
      && latest.phase === terminalCheckpoint.phase && latest.boundary === terminalCheckpoint.boundary;
  });
  const objectiveEvents: Extract<GameEvent, { readonly type: 'objective-control-resolved' }>[] = (terminalCheckpointAlreadyResolved ? [] : checkpointBases)
    .filter((checkpoint) => !markers.every((marker) => {
      const latest = state.mission?.latestObjectiveControlById[marker.id]?.checkpoint;
      return latest?.battleRound === checkpoint.battleRound && latest.turnNumber === checkpoint.turnNumber
        && latest.phase === checkpoint.phase && latest.boundary === checkpoint.boundary;
    }))
    .map((checkpoint) => ({
    id: `${command.id}:objective:${checkpoint.boundary}`,
    commandId: command.id,
    type: 'objective-control-resolved',
    checkpoint,
    resolutions: [...markers]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((marker) => evaluateObjectiveControlV1(state, marker, checkpoint, environment)),
    environmentFingerprint: environment.fingerprint,
    sourceRefs: OBJECTIVE_CONTROL_SOURCE_REFS
    }));
  const events: readonly GameEvent[] = [...objectiveEvents, phaseAdvance.event];
  return { accepted: true, state: events.reduce(unsafeReduceGameEvent, state), events };
}
