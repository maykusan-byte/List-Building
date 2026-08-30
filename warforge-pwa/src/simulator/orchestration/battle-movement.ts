import { validateGameCommand } from '../domain/commands';
import { resolveDesperateEscapeRiskV1 } from '../domain/desperate-escape';
import { rollDie } from '../domain/prng';
import { unsafeReduceGameEvent } from '../domain/reducer';
import type { CommandExecution, DeploymentModelPoseV1, GameCommand, GameEvent, GameState, ModelState, PhysicalModelProfileV1, RuleRejection, UnitMovementPathV1 } from '../domain/types';
import { classifyFootprintContact, evaluateMovement, footprintDistance, type Footprint, type IdentifiedFootprint, type MovementVerdict } from '../geometry';
import { evaluateV11UnitCoherency } from '../rules/coherency';
import { CORE_ADVANCE_MOVE_SOURCE, CORE_FALL_BACK_SOURCE, CORE_HAZARD_ROLL_SOURCE, CORE_MORTAL_WOUNDS_SOURCE, CORE_MOVEMENT_SEQUENCE_SOURCE, CORE_NORMAL_MOVE_SOURCE, CORE_REMAIN_STATIONARY_SOURCE, CORE_UNIT_COHERENCY_SOURCE } from '../rules/m7-source-references';
import type { DeploymentEnvironment } from './deployment';

const ENGAGEMENT_RANGE = 508;
const MOVEMENT_RULE_ID = '03.01';

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

function deployedEnemyFootprints(state: GameState, playerId: string, environment: DeploymentEnvironment): IdentifiedFootprint[] | RuleRejection {
  const result: IdentifiedFootprint[] = [];
  for (const unitId of state.battle?.deployedUnitIds ?? []) {
    const unit = state.units[unitId];
    if (!unit || unit.playerId === playerId) continue;
    for (const member of unit.models.filter((model) => model.active)) {
      const model = state.models[member.id];
      const profile = model && environment.physicalProfiles[model.profileId];
      if (!model || !profile) return { commandId: '', code: 'movement-profile-missing', message: 'Un profil physique ennemi est manquant.', sourceRuleIds: [MOVEMENT_RULE_ID], details: { modelId: member.id } };
      result.push({ id: member.id, footprint: footprintFor(model, profile) });
    }
  }
  return result.sort((left, right) => left.id.localeCompare(right.id));
}

function unitIsEngaged(unitFootprints: readonly IdentifiedFootprint[], enemyFootprints: readonly IdentifiedFootprint[]): boolean {
  return unitFootprints.some((model) => enemyFootprints.some((enemy) => footprintDistance(model.footprint, enemy.footprint) <= ENGAGEMENT_RANGE));
}

function pathVerdict(
  moving: Footprint,
  path: UnitMovementPathV1,
  enemyFootprints: readonly IdentifiedFootprint[],
  board: NonNullable<GameState['battle']>['boardBounds'],
  movementType: Extract<GameEvent, { readonly type: 'unit-movement-resolved' }>['movementType']
): MovementVerdict {
  const orientation = moving.kind === 'capsule' || moving.kind === 'oriented-convex-polygon' ? moving.orientationDegrees : undefined;
  const poses = [
    { position: moving.kind === 'circle' || moving.kind === 'capsule' || moving.kind === 'oriented-convex-polygon' ? moving.center : moving.vertices[0]!, ...(orientation === undefined ? {} : { orientationDegrees: orientation }) },
    ...path.waypoints.map((position) => ({ position, ...(orientation === undefined ? {} : { orientationDegrees: orientation }) }))
  ];
  if (movementType !== 'fall-back' || poses.length < 2) return evaluateMovement(moving, poses, enemyFootprints, { board });

  const initiallyTouching = enemyFootprints.filter((enemy) => classifyFootprintContact(moving, enemy.footprint).classification === 'touching');
  if (initiallyTouching.length === 0) return evaluateMovement(moving, poses, enemyFootprints, { board });
  if (moving.kind !== 'circle' || initiallyTouching.some((enemy) => enemy.footprint.kind !== 'circle')) return evaluateMovement(moving, poses, enemyFootprints, { board });
  const firstEnd = poses[1]!.position;
  const movingAway = initiallyTouching.every((enemy) => {
    const obstacle = enemy.footprint as Extract<Footprint, { kind: 'circle' }>;
    return (firstEnd.x - moving.center.x) * (moving.center.x - obstacle.center.x)
      + (firstEnd.y - moving.center.y) * (moving.center.y - obstacle.center.y) > 0;
  });
  if (!movingAway) return evaluateMovement(moving, poses, enemyFootprints, { board });
  const first = evaluateMovement(moving, poses.slice(0, 2), enemyFootprints.filter((enemy) => !initiallyTouching.includes(enemy)), { board });
  if (!first.allowed || poses.length === 2) return { ...first, pathLength: first.pathLength };
  const moved: Footprint = { ...moving, center: firstEnd };
  const rest = evaluateMovement(moved, poses.slice(1), enemyFootprints, { board });
  return rest.allowed
    ? { allowed: true, reason: 'clear', pathLength: first.pathLength + rest.pathLength }
    : { ...rest, pathLength: first.pathLength + rest.pathLength };
}

export function executeCompleteGameMovementCommand(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'move-unit' }>,
  environment: DeploymentEnvironment
): CommandExecution {
  const basic = validateGameCommand(state, command);
  if (basic) return { accepted: false, state, rejection: basic };
  if (!environment.fingerprint.trim() || environment.fingerprint !== state.shootingEnvironmentFingerprint) return reject(state, command, 'movement-environment-mismatch', 'Le mouvement ne correspond pas à l’environnement compilé.', [MOVEMENT_RULE_ID]);
  const battle = state.battle!;
  const unit = state.units[command.unitId]!;
  const enemy = deployedEnemyFootprints(state, command.actorId, environment);
  if (!Array.isArray(enemy)) return { accepted: false, state, rejection: { ...enemy, commandId: command.id } };

  const currentFootprints: IdentifiedFootprint[] = [];
  for (const member of unit.models.filter((model) => model.active)) {
    const model = state.models[member.id]!;
    const profile = environment.physicalProfiles[model.profileId];
    if (!profile) return reject(state, command, 'movement-profile-missing', 'Une figurine ne possède pas de profil physique compilé.', [MOVEMENT_RULE_ID], { modelId: model.id });
    currentFootprints.push({ id: model.id, footprint: footprintFor(model, profile) });
  }
  const startedEngaged = unitIsEngaged(currentFootprints, enemy);
  if (command.movementType === 'fall-back' ? !startedEngaged : command.movementType !== 'remain-stationary' && startedEngaged) {
    return reject(state, command, 'movement-type-ineligible', command.movementType === 'fall-back' ? 'Seule une unité engagée peut Battre en Retraite.' : 'Une unité engagée ne peut pas effectuer de Mouvement Normal ou d’Avance.', [command.movementType === 'fall-back' ? '09.07' : command.movementType === 'advance' ? '09.06' : '09.05']);
  }
  if (command.fallBackMode === 'desperate-escape' && unit.keywords.some((keyword) => ['MONSTRE', 'MONSTER', 'VÉHICULE', 'VEHICULE', 'VEHICLE'].includes(keyword.trim().toUpperCase()))) {
    return reject(state, command, 'desperate-escape-monster-vehicle-not-covered', 'La valeur de blessure mortelle des unités MONSTRE/VÉHICULE exige des mots-clés par figurine hors du pilote fermé.', ['06.03']);
  }

  let maximumDistance = command.movementType === 'remain-stationary' ? 0 : unit.movement!;
  let prngAfter = state.prng;
  let advanceRoll: number | undefined;
  const desperateEscape = command.fallBackMode === 'desperate-escape'
    ? resolveDesperateEscapeRiskV1(state.prng, unit, command.desperateEscapeAllocationOrder!)
    : undefined;
  if (command.movementType === 'advance') {
    const advance = rollDie(state.prng, 6);
    advanceRoll = advance.face;
    prngAfter = advance.state;
    maximumDistance += advance.face * 254;
  } else if (desperateEscape !== undefined) {
    prngAfter = desperateEscape.prngAfter;
  }
  const survivingModelIds = new Set((desperateEscape?.unitModelsAfter ?? unit.models).filter((model) => model.active).map((model) => model.id));
  const pathObstacles = command.fallBackMode === 'desperate-escape' ? [] : enemy;

  const pathEvidence: { modelId: string; pathLength: number }[] = [];
  const finalPoses: DeploymentModelPoseV1[] = [];
  const finalFootprints: IdentifiedFootprint[] = [];
  for (const path of [...command.paths].sort((left, right) => left.modelId.localeCompare(right.modelId))) {
    if (!survivingModelIds.has(path.modelId)) continue;
    const model = state.models[path.modelId]!;
    const profile = environment.physicalProfiles[model.profileId]!;
    const finalPosition = path.waypoints.at(-1) ?? model.position;
    const finalOrientationDegrees = path.finalOrientationDegrees ?? model.orientationDegrees;
    if (profile.baseShape.kind !== 'circle' && finalOrientationDegrees !== model.orientationDegrees) {
      return reject(state, command, 'continuous-rotation-not-covered', 'Les rotations continues des hitbox non circulaires restent hors couverture.', [MOVEMENT_RULE_ID], { modelId: model.id });
    }
    const moving = footprintFor(model, profile);
    const verdict = pathVerdict(moving, path, pathObstacles, battle.boardBounds, command.movementType);
    if (!verdict.allowed) return reject(state, command, `movement-${verdict.reason}`, 'La trajectoire franchit le plateau ou une figurine ennemie.', [MOVEMENT_RULE_ID], { modelId: model.id, pathLength: verdict.pathLength, obstacleId: verdict.firstCollision?.obstacleId ?? '' });
    if (verdict.pathLength > maximumDistance) return reject(state, command, 'movement-too-far', 'Une figurine dépasse la distance maximale de ce mouvement.', [MOVEMENT_RULE_ID], { modelId: model.id, pathLength: verdict.pathLength, maximumDistance });
    pathEvidence.push({ modelId: model.id, pathLength: verdict.pathLength });
    const finalPose = { modelId: model.id, position: finalPosition, orientationDegrees: finalOrientationDegrees };
    finalPoses.push(finalPose);
    finalFootprints.push({ id: model.id, footprint: footprintFor(model, profile, finalPose) });
  }

  const otherFinalFootprints: IdentifiedFootprint[] = [];
  for (const unitId of battle.deployedUnitIds) {
    const otherUnit = state.units[unitId];
    if (!otherUnit || otherUnit.id === unit.id) continue;
    for (const member of otherUnit.models.filter((model) => model.active)) {
      const model = state.models[member.id]!;
      const profile = environment.physicalProfiles[model.profileId];
      if (!profile) return reject(state, command, 'movement-profile-missing', 'Une hitbox finale ne peut pas être vérifiée.', [MOVEMENT_RULE_ID], { modelId: model.id });
      otherFinalFootprints.push({ id: model.id, footprint: footprintFor(model, profile) });
    }
  }
  const allFinal = [...finalFootprints, ...otherFinalFootprints];
  for (const moving of finalFootprints) {
    for (const other of allFinal) {
      if (moving.id === other.id) continue;
      if (classifyFootprintContact(moving.footprint, other.footprint).classification === 'overlapping') return reject(state, command, 'movement-model-overlap', 'Une figurine ne peut terminer son mouvement sur une autre figurine.', [MOVEMENT_RULE_ID], { modelId: moving.id, obstacleId: other.id });
    }
  }
  const endedEngaged = unitIsEngaged(finalFootprints, enemy);
  if (command.movementType !== 'remain-stationary' && endedEngaged) return reject(state, command, 'movement-ended-engaged', 'Cette unité doit terminer ce mouvement non engagée.', [command.movementType === 'fall-back' ? '09.07' : command.movementType === 'advance' ? '09.06' : '09.05']);
  const coherency = finalFootprints.length === 0 ? {
    isCoherent: true,
    requiredNeighbours: 0,
    maximumLinkDistance: 508,
    maximumPairDistance: 2_286,
    incoherentModelIds: [] as readonly string[],
    distantPairs: [] as readonly { readonly leftModelId: string; readonly rightModelId: string; readonly distance: number }[]
  } : evaluateV11UnitCoherency(finalFootprints);
  if (!coherency.isCoherent) return reject(state, command, 'movement-unit-incoherent', 'L’unité doit terminer son mouvement en cohérence V11.', ['03.03'], { incoherentModelIds: coherency.incoherentModelIds.join(',') });

  const movementSource = command.movementType === 'remain-stationary' ? CORE_REMAIN_STATIONARY_SOURCE
    : command.movementType === 'normal' ? CORE_NORMAL_MOVE_SOURCE
      : command.movementType === 'advance' ? CORE_ADVANCE_MOVE_SOURCE : CORE_FALL_BACK_SOURCE;
  const battleShockTestRequired = desperateEscape !== undefined
    && desperateEscape.unitModelsAfter.some((model) => model.active)
    && state.battleResources?.battleShockedUnitIds.includes(unit.id) !== true;
  const event: Extract<GameEvent, { readonly type: 'unit-movement-resolved' }> = {
    id: `${command.id}:0`, commandId: command.id, type: 'unit-movement-resolved', playerId: command.actorId, unitId: unit.id,
    movementType: command.movementType, paths: [...command.paths].sort((left, right) => left.modelId.localeCompare(right.modelId)),
    ...(command.fallBackMode === undefined ? {} : { fallBackMode: command.fallBackMode }),
    finalPoses: finalPoses.sort((left, right) => left.modelId.localeCompare(right.modelId)), maximumDistance,
    ...(advanceRoll === undefined ? {} : { advanceRoll }),
    ...(desperateEscape === undefined ? {} : { desperateEscape: {
      riskRolls: desperateEscape.riskRolls,
      mortalWounds: desperateEscape.mortalWounds,
      unitModelsAfter: desperateEscape.unitModelsAfter,
      playerAllocationOrder: command.desperateEscapeAllocationOrder!,
      mortalWoundAllocations: desperateEscape.mortalWoundAllocations,
      allocationPolicy: 'mandatory-wounded-then-player-order' as const,
      ...(battleShockTestRequired ? { battleShockTestRequired: true as const } : {})
    } }),
    evidence: {
      startedEngaged, endedEngaged, paths: pathEvidence.sort((left, right) => left.modelId.localeCompare(right.modelId)),
      coherency: {
        maximumLinkDistance: coherency.maximumLinkDistance, requiredNeighbours: coherency.requiredNeighbours,
        maximumPairDistance: coherency.maximumPairDistance, incoherentModelIds: coherency.incoherentModelIds, distantPairs: coherency.distantPairs
      }
    },
    environmentFingerprint: environment.fingerprint, prngBefore: state.prng, prngAfter,
    sourceRefs: [CORE_MOVEMENT_SEQUENCE_SOURCE, movementSource, CORE_UNIT_COHERENCY_SOURCE,
      ...(desperateEscape === undefined ? [] : [CORE_HAZARD_ROLL_SOURCE, CORE_MORTAL_WOUNDS_SOURCE])]
  };
  return { accepted: true, state: unsafeReduceGameEvent(state, event), events: [event] };
}
