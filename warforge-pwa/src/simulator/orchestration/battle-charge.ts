import { validateGameCommand } from '../domain/commands';
import { rollDice } from '../domain/prng';
import { unsafeReduceGameEvent } from '../domain/reducer';
import { PENDING_CHARGE_V1_SCHEMA_VERSION, type CommandExecution, type DeploymentModelPoseV1, type GameCommand, type GameEvent, type GameState, type ModelState, type PhysicalModelProfileV1, type RuleRejection, type UnitMovementPathV1, type UnitState } from '../domain/types';
import { classifyFootprintContact, evaluateMovement, footprintDistance, type Footprint, type IdentifiedFootprint, type MovementPose } from '../geometry';
import { evaluateV11UnitCoherency } from '../rules/coherency';
import { CORE_CHARGE_MOVE_SOURCE, CORE_CHARGE_SEQUENCE_SOURCE, CORE_UNIT_COHERENCY_SOURCE } from '../rules/m7-source-references';
import type { DeploymentEnvironment } from './deployment';

const ENGAGEMENT_RANGE = 508;
const ONE_INCH = 254;
const TWELVE_INCHES = 3_048;
const CHARGE_RULE_ID = '11.02';

interface UnitFootprints {
  readonly unit: UnitState;
  readonly footprints: readonly IdentifiedFootprint[];
}

function reject(state: GameState, command: GameCommand, code: string, message: string, sourceRuleIds: readonly string[], details?: RuleRejection['details']): CommandExecution {
  return { accepted: false, state, rejection: { commandId: command.id, code, message, sourceRuleIds, ...(details ? { details } : {}) } };
}

function footprintFor(model: ModelState, profile: PhysicalModelProfileV1, pose: { readonly position: ModelState['position']; readonly orientationDegrees: number } = model): Footprint {
  switch (profile.baseShape.kind) {
    case 'circle': return { kind: 'circle', center: pose.position, radius: profile.baseShape.radius };
    case 'capsule': return { kind: 'capsule', center: pose.position, radius: profile.baseShape.radius, length: profile.baseShape.length, orientationDegrees: pose.orientationDegrees };
    case 'polygon': return { kind: 'oriented-convex-polygon', center: pose.position, orientationDegrees: pose.orientationDegrees, vertices: profile.baseShape.vertices };
  }
}

function activeUnitFootprints(state: GameState, unit: UnitState, environment: DeploymentEnvironment): IdentifiedFootprint[] | RuleRejection {
  const footprints: IdentifiedFootprint[] = [];
  for (const member of unit.models.filter((model) => model.active).sort((left, right) => left.id.localeCompare(right.id))) {
    const model = state.models[member.id];
    const profile = model === undefined ? undefined : environment.physicalProfiles[model.profileId];
    if (!model || !profile) return { commandId: '', code: 'charge-profile-missing', message: 'Une figurine ne possède pas de profil physique compilé pour la charge.', sourceRuleIds: [CHARGE_RULE_ID], details: { modelId: member.id } };
    if (profile.baseShape.kind !== 'circle') return { commandId: '', code: 'charge-profile-not-covered', message: 'Le pilote M7-T03 borne les charges aux empreintes circulaires ; les rotations de véhicules restent différées.', sourceRuleIds: [CHARGE_RULE_ID], details: { modelId: member.id, profileId: profile.id } };
    footprints.push({ id: member.id, footprint: footprintFor(model, profile) });
  }
  return footprints;
}

function deployedUnitFootprints(state: GameState, environment: DeploymentEnvironment): UnitFootprints[] | RuleRejection {
  const result: UnitFootprints[] = [];
  for (const unitId of [...(state.battle?.deployedUnitIds ?? [])].sort()) {
    const unit = state.units[unitId];
    if (!unit || !unit.models.some((model) => model.active)) continue;
    const footprints = activeUnitFootprints(state, unit, environment);
    if (!Array.isArray(footprints)) return footprints;
    result.push({ unit, footprints });
  }
  return result;
}

function minimumDistance(left: readonly IdentifiedFootprint[], right: readonly IdentifiedFootprint[]): number {
  return Math.min(...left.flatMap((one) => right.map((two) => footprintDistance(one.footprint, two.footprint))));
}

function unitEngaged(left: readonly IdentifiedFootprint[], right: readonly IdentifiedFootprint[]): boolean {
  return minimumDistance(left, right) <= ENGAGEMENT_RANGE;
}

function movementPoses(moving: Footprint, path: UnitMovementPathV1): readonly MovementPose[] {
  const orientationDegrees = moving.kind === 'capsule' || moving.kind === 'oriented-convex-polygon' ? moving.orientationDegrees : undefined;
  const center = moving.kind === 'convex-polygon' ? moving.vertices[0] : moving.center;
  return [
    { position: center, ...(orientationDegrees === undefined ? {} : { orientationDegrees }) },
    ...path.waypoints.map((position) => ({ position, ...(orientationDegrees === undefined ? {} : { orientationDegrees }) }))
  ];
}

type ThresholdReachability = 'reachable' | 'impossible' | 'unresolved';

function circleThresholdReachability(
  moving: Extract<Footprint, { readonly kind: 'circle' }>,
  targets: readonly IdentifiedFootprint[],
  maximumDistance: number,
  threshold: number,
  sweptObstacles: readonly IdentifiedFootprint[],
  board: NonNullable<GameState['battle']>['boardBounds'],
  candidateAllowed: (candidate: Footprint) => boolean
): ThresholdReachability {
  let hasEuclideanCandidate = false;
  for (const target of targets) {
    if (target.footprint.kind !== 'circle') continue;
    const dx = target.footprint.center.x - moving.center.x;
    const dy = target.footprint.center.y - moving.center.y;
    const centreDistance = Math.hypot(dx, dy);
    const currentGap = Math.max(0, centreDistance - moving.radius - target.footprint.radius);
    const travel = Math.max(0, currentGap - threshold + 1);
    if (travel > maximumDistance || centreDistance === 0) continue;
    hasEuclideanCandidate = true;
    const candidate = {
      x: Math.round(moving.center.x + dx / centreDistance * travel),
      y: Math.round(moving.center.y + dy / centreDistance * travel)
    };
    const placed: Footprint = { ...moving, center: candidate };
    if (footprintDistance(placed, target.footprint) > threshold) continue;
    const verdict = evaluateMovement(moving, [{ position: moving.center }, { position: candidate }], sweptObstacles, { board });
    if (verdict.allowed && verdict.pathLength <= maximumDistance && candidateAllowed(placed)) return 'reachable';
  }
  return hasEuclideanCandidate ? 'unresolved' : 'impossible';
}

export function endsCloserToAtLeastOneChargeTarget(
  initial: Footprint,
  final: Footprint,
  targetUnits: readonly (readonly IdentifiedFootprint[])[]
): boolean {
  return targetUnits.some((target) => {
    const initialDistance = Math.min(...target.map((footprint) => footprintDistance(initial, footprint.footprint)));
    const finalDistance = Math.min(...target.map((footprint) => footprintDistance(final, footprint.footprint)));
    return finalDistance < initialDistance;
  });
}

/** Rolls the charge and opens the mandatory after-roll player continuation. */
export function executeDeclareChargeCommand(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'declare-charge' }>,
  environment: DeploymentEnvironment
): CommandExecution {
  const basic = validateGameCommand(state, command);
  if (basic) return { accepted: false, state, rejection: basic };
  if (!environment.fingerprint.trim() || environment.fingerprint !== state.shootingEnvironmentFingerprint) return reject(state, command, 'charge-environment-mismatch', 'La charge ne correspond pas à l’environnement compilé.', [CHARGE_RULE_ID]);
  const unit = state.units[command.unitId]!;
  const allUnits = deployedUnitFootprints(state, environment);
  if (!Array.isArray(allUnits)) return { accepted: false, state, rejection: { ...allUnits, commandId: command.id } };
  const attacker = allUnits.find((entry) => entry.unit.id === unit.id)!;
  const enemies = allUnits.filter((entry) => entry.unit.playerId !== unit.playerId);
  if (enemies.some((enemy) => unitEngaged(attacker.footprints, enemy.footprints))) return reject(state, command, 'charge-unit-engaged', 'Une unité engagée ne peut pas déclarer de charge.', [CHARGE_RULE_ID]);
  const eligible = enemies
    .map((enemy) => ({ unitId: enemy.unit.id, edgeToEdgeDistance: minimumDistance(attacker.footprints, enemy.footprints) }))
    .filter((candidate) => candidate.edgeToEdgeDistance <= TWELVE_INCHES)
    .sort((left, right) => left.unitId.localeCompare(right.unitId));
  if (eligible.length === 0) return reject(state, command, 'charge-no-enemy-within-twelve', 'Aucune unité ennemie active n’est à 12″ ou moins.', [CHARGE_RULE_ID]);
  const roll = rollDice(state.prng, 6, 2);
  const rolledDistance = (roll.results[0]! + roll.results[1]!) * ONE_INCH;
  const pending = {
    schemaVersion: PENDING_CHARGE_V1_SCHEMA_VERSION,
    playerId: command.actorId,
    unitId: unit.id,
    roll: [roll.results[0]!, roll.results[1]!] as const,
    maximumDistance: rolledDistance,
    candidates: eligible.map((candidate) => ({ ...candidate, withinChargeRoll: candidate.edgeToEdgeDistance <= rolledDistance })),
    environmentFingerprint: environment.fingerprint,
    prngBefore: state.prng,
    prngAfter: roll.state,
    sourceRefs: [CORE_CHARGE_SEQUENCE_SOURCE]
  };
  const event: Extract<GameEvent, { readonly type: 'charge-declared' }> = {
    id: `${command.id}:0`, commandId: command.id, type: 'charge-declared', pending
  };
  return { accepted: true, state: unsafeReduceGameEvent(state, event), events: [event] };
}

/** Applies the player's after-roll choice and, when requested, verifies the full charge translation. */
export function executeResolveChargeCommand(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'resolve-charge' }>,
  environment: DeploymentEnvironment
): CommandExecution {
  const basic = validateGameCommand(state, command);
  if (basic) return { accepted: false, state, rejection: basic };
  const pending = state.pendingCharge!;
  if (!environment.fingerprint.trim() || pending.environmentFingerprint !== environment.fingerprint || environment.fingerprint !== state.shootingEnvironmentFingerprint) return reject(state, command, 'charge-environment-mismatch', 'La continuation ne correspond pas à l’environnement compilé.', [CHARGE_RULE_ID]);
  const unit = state.units[command.unitId]!;
  const allUnits = deployedUnitFootprints(state, environment);
  if (!Array.isArray(allUnits)) return { accepted: false, state, rejection: { ...allUnits, commandId: command.id } };
  const attacker = allUnits.find((entry) => entry.unit.id === unit.id)!;
  const coherency = evaluateV11UnitCoherency(attacker.footprints);
  const emptyEvidence: Extract<GameEvent, { readonly type: 'charge-resolved' }>['evidence'] = {
    paths: [], engagedTargetUnitIds: [], engagedNonTargetUnitIds: [], coherency: {
      maximumLinkDistance: coherency.maximumLinkDistance, requiredNeighbours: coherency.requiredNeighbours,
      maximumPairDistance: coherency.maximumPairDistance, incoherentModelIds: coherency.incoherentModelIds, distantPairs: coherency.distantPairs
    }
  };
  if (!command.proceed) {
    const event: Extract<GameEvent, { readonly type: 'charge-resolved' }> = {
      id: `${command.id}:0`, commandId: command.id, type: 'charge-resolved', playerId: command.actorId, unitId: unit.id,
      outcome: 'declined', targetUnitIds: [], paths: [], finalPoses: [], evidence: emptyEvidence,
      environmentFingerprint: environment.fingerprint, prngBefore: pending.prngAfter, prngAfter: pending.prngAfter,
      sourceRefs: [CORE_CHARGE_SEQUENCE_SOURCE]
    };
    return { accepted: true, state: unsafeReduceGameEvent(state, event), events: [event] };
  }

  const targetIds = [...command.targetUnitIds].sort((left, right) => left.localeCompare(right));
  const targets = targetIds.map((targetId) => allUnits.find((entry) => entry.unit.id === targetId));
  if (targets.some((target) => target === undefined || target.unit.playerId === unit.playerId)) return reject(state, command, 'charge-target-ineligible', 'Chaque cible doit être une unité ennemie active et déployée.', ['11.04']);
  const targetUnits = targets as UnitFootprints[];
  for (const target of targetUnits) {
    const distance = minimumDistance(attacker.footprints, target.footprints);
    if (distance > pending.maximumDistance || distance > TWELVE_INCHES) return reject(state, command, 'charge-target-out-of-range', 'Chaque cible doit être à la distance maximale du jet et à 12″ ou moins.', ['11.04'], { targetUnitId: target.unit.id, distance, maximumDistance: pending.maximumDistance });
  }

  const targetFootprints = targetUnits.flatMap((target) => target.footprints);
  const otherUnitFootprints = allUnits.filter((entry) => entry.unit.id !== unit.id).flatMap((entry) => entry.footprints);
  const enemyFootprints = allUnits.filter((entry) => entry.unit.playerId !== unit.playerId).flatMap((entry) => entry.footprints);
  const pathEvidence: Extract<GameEvent, { readonly type: 'charge-resolved' }>['evidence']['paths'][number][] = [];
  const finalPoses: DeploymentModelPoseV1[] = [];
  const finalFootprints: IdentifiedFootprint[] = [];
  for (const path of [...command.paths].sort((left, right) => left.modelId.localeCompare(right.modelId))) {
    const model = state.models[path.modelId]!;
    const profile = environment.physicalProfiles[model.profileId]!;
    const moving = footprintFor(model, profile);
    const finalPosition = path.waypoints.at(-1) ?? model.position;
    const finalOrientationDegrees = path.finalOrientationDegrees ?? model.orientationDegrees;
    if (finalOrientationDegrees !== model.orientationDegrees) return reject(state, command, 'continuous-rotation-not-covered', 'Les rotations continues restent hors couverture du pilote de charge.', ['11.04'], { modelId: model.id });
    const verdict = evaluateMovement(moving, movementPoses(moving, path), enemyFootprints, { board: state.battle!.boardBounds });
    if (!verdict.allowed) return reject(state, command, `charge-${verdict.reason}`, 'La trajectoire de charge franchit le plateau ou une autre figurine.', ['11.04'], { modelId: model.id, pathLength: verdict.pathLength, obstacleId: verdict.firstCollision?.obstacleId ?? '' });
    if (verdict.pathLength > pending.maximumDistance) return reject(state, command, 'charge-movement-too-far', 'Une figurine dépasse la distance maximale du jet de charge.', ['11.04'], { modelId: model.id, pathLength: verdict.pathLength, maximumDistance: pending.maximumDistance });
    const finalPose = { modelId: model.id, position: finalPosition, orientationDegrees: finalOrientationDegrees };
    const placed = footprintFor(model, profile, finalPose);
    const targetDistances = targetUnits.map((target) => ({
      initial: Math.min(...target.footprints.map((footprint) => footprintDistance(moving, footprint.footprint))),
      final: Math.min(...target.footprints.map((footprint) => footprintDistance(placed, footprint.footprint)))
    }));
    const initialTargetDistance = Math.min(...targetDistances.map((distance) => distance.initial));
    const finalTargetDistance = Math.min(...targetDistances.map((distance) => distance.final));
    if (!endsCloserToAtLeastOneChargeTarget(moving, placed, targetUnits.map((target) => target.footprints))) return reject(state, command, 'charge-model-not-closer', 'Chaque figurine déplacée doit finir plus proche d’au moins une cible de charge.', ['11.04'], { modelId: model.id, initialTargetDistance, finalTargetDistance });
    finalPoses.push(finalPose);
    finalFootprints.push({ id: model.id, footprint: placed });
    pathEvidence.push({ modelId: model.id, pathLength: verdict.pathLength, initialTargetDistance, finalTargetDistance });
  }

  for (let leftIndex = 0; leftIndex < finalFootprints.length; leftIndex += 1) {
    const left = finalFootprints[leftIndex]!;
    for (const right of [...finalFootprints.slice(leftIndex + 1), ...otherUnitFootprints]) {
      if (classifyFootprintContact(left.footprint, right.footprint).classification === 'overlapping') return reject(state, command, 'charge-model-overlap', 'Une figurine ne peut terminer sa charge sur une autre figurine.', ['11.04'], { modelId: left.id, obstacleId: right.id });
    }
  }
  const engagedTargetUnitIds = targetUnits.filter((target) => unitEngaged(finalFootprints, target.footprints)).map((target) => target.unit.id).sort();
  if (engagedTargetUnitIds.length !== targetIds.length || engagedTargetUnitIds.some((targetId, index) => targetId !== targetIds[index])) return reject(state, command, 'charge-target-not-engaged', 'La charge doit finir engagée avec toutes ses cibles.', ['11.04']);
  const engagedNonTargetUnitIds = allUnits
    .filter((entry) => entry.unit.playerId !== unit.playerId && !targetIds.includes(entry.unit.id) && unitEngaged(finalFootprints, entry.footprints))
    .map((entry) => entry.unit.id).sort();
  if (engagedNonTargetUnitIds.length > 0) return reject(state, command, 'charge-non-target-engaged', 'La charge ne peut finir engagée avec une unité ennemie non ciblée.', ['11.04'], { unitIds: engagedNonTargetUnitIds.join(',') });
  const finalCoherency = evaluateV11UnitCoherency(finalFootprints);
  if (!finalCoherency.isCoherent) return reject(state, command, 'charge-unit-incoherent', 'L’unité doit terminer son mouvement de charge en cohérence.', ['03.03'], { incoherentModelIds: finalCoherency.incoherentModelIds.join(',') });

  for (const path of pathEvidence) {
    const moving = attacker.footprints.find((footprint) => footprint.id === path.modelId)!.footprint;
    if (moving.kind !== 'circle') continue;
    const candidateAllowed = (candidate: Footprint) => {
      if (otherUnitFootprints.some((obstacle) => classifyFootprintContact(candidate, obstacle.footprint).classification === 'overlapping')) return false;
      const witness = finalFootprints.map((footprint) => footprint.id === path.modelId ? { ...footprint, footprint: candidate } : footprint);
      if (witness.some((left, index) => witness.slice(index + 1).some((right) => classifyFootprintContact(left.footprint, right.footprint).classification === 'overlapping'))) return false;
      if (!evaluateV11UnitCoherency(witness).isCoherent) return false;
      if (!targetUnits.every((target) => unitEngaged(witness, target.footprints))) return false;
      return !allUnits.some((entry) => entry.unit.playerId !== unit.playerId && !targetIds.includes(entry.unit.id) && unitEngaged(witness, entry.footprints));
    };
    for (const [threshold, requiredCode, unresolvedCode, requiredMessage] of [
      [ONE_INCH, 'charge-model-must-end-within-one', 'charge-one-inch-reachability-unresolved', 'Cette figurine peut finir à 1″ ou moins d’une cible et doit le faire.'],
      [ENGAGEMENT_RANGE, 'charge-model-must-engage', 'charge-engagement-reachability-unresolved', 'Cette figurine peut finir engagée avec une cible et doit le faire.']
    ] as const) {
      if (path.finalTargetDistance <= threshold) continue;
      const reachability = circleThresholdReachability(moving, targetFootprints, pending.maximumDistance, threshold, enemyFootprints, state.battle!.boardBounds, candidateAllowed);
      if (reachability === 'reachable') return reject(state, command, requiredCode, requiredMessage, ['11.04'], { modelId: path.modelId, finalTargetDistance: path.finalTargetDistance });
      if (reachability === 'unresolved') return reject(state, command, unresolvedCode, 'Le pilote ne peut pas prouver cette exception de priorité par un témoin direct cohérent ; fournissez une fin prioritaire ou renoncez à la charge.', ['11.04'], { modelId: path.modelId, finalTargetDistance: path.finalTargetDistance });
    }
  }

  const event: Extract<GameEvent, { readonly type: 'charge-resolved' }> = {
    id: `${command.id}:0`, commandId: command.id, type: 'charge-resolved', playerId: command.actorId, unitId: unit.id,
    outcome: 'moved', targetUnitIds: targetIds, paths: [...command.paths].sort((left, right) => left.modelId.localeCompare(right.modelId)),
    finalPoses: finalPoses.sort((left, right) => left.modelId.localeCompare(right.modelId)), evidence: {
      paths: pathEvidence.sort((left, right) => left.modelId.localeCompare(right.modelId)), engagedTargetUnitIds, engagedNonTargetUnitIds,
      coherency: { maximumLinkDistance: finalCoherency.maximumLinkDistance, requiredNeighbours: finalCoherency.requiredNeighbours,
        maximumPairDistance: finalCoherency.maximumPairDistance, incoherentModelIds: finalCoherency.incoherentModelIds, distantPairs: finalCoherency.distantPairs }
    },
    environmentFingerprint: environment.fingerprint, prngBefore: pending.prngAfter, prngAfter: pending.prngAfter,
    sourceRefs: [CORE_CHARGE_SEQUENCE_SOURCE, CORE_CHARGE_MOVE_SOURCE, CORE_UNIT_COHERENCY_SOURCE]
  };
  return { accepted: true, state: unsafeReduceGameEvent(state, event), events: [event] };
}
