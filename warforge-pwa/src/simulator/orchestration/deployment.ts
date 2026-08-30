import { validateGameCommand } from '../domain/commands';
import { nextDeploymentPlayerIdV1 } from '../domain/battle-sequence';
import { unsafeReduceGameEvent } from '../domain/reducer';
import type {
  CommandExecution,
  DeploymentModelPoseV1,
  GameCommand,
  GameEvent,
  GameState,
  ModelState,
  PhysicalModelProfileV1,
  RuleRejection
} from '../domain/types';
import {
  classifyBoardContainment,
  classifyFootprintContact,
  type Footprint,
  type IdentifiedFootprint
} from '../geometry';
import { CORE_UNIT_COHERENCY_SOURCE, EVENT_COMPANION_DEPLOY_ARMIES_SOURCE } from '../rules/m7-source-references';
import { evaluateV11UnitCoherency } from '../rules/coherency';

const DEPLOYMENT_RULE_ID = 'event-mission-sequence.8';
const COHERENCY_RULE_ID = '03.03';
const GEOMETRY_RULE_ID = 'simulator.geometry.deployment';

export interface DeploymentEnvironment {
  readonly fingerprint: string;
  readonly physicalProfiles: Readonly<Record<string, PhysicalModelProfileV1>>;
}

function reject(
  state: GameState,
  command: GameCommand,
  code: string,
  message: string,
  sourceRuleIds: readonly string[],
  details?: RuleRejection['details']
): CommandExecution {
  return { accepted: false, state, rejection: { commandId: command.id, code, message, sourceRuleIds, ...(details ? { details } : {}) } };
}

function footprintForPose(model: ModelState, pose: DeploymentModelPoseV1, profile: PhysicalModelProfileV1): Footprint {
  switch (profile.baseShape.kind) {
    case 'circle':
      return { kind: 'circle', center: pose.position, radius: profile.baseShape.radius };
    case 'capsule':
      return {
        kind: 'capsule',
        center: pose.position,
        radius: profile.baseShape.radius,
        length: profile.baseShape.length,
        orientationDegrees: pose.orientationDegrees
      };
    case 'polygon':
      return {
        kind: 'oriented-convex-polygon',
        center: pose.position,
        orientationDegrees: pose.orientationDegrees,
        vertices: profile.baseShape.vertices
      };
  }
}

function currentFootprint(model: ModelState, profile: PhysicalModelProfileV1): Footprint {
  return footprintForPose(model, {
    modelId: model.id,
    position: model.position,
    orientationDegrees: model.orientationDegrees
  }, profile);
}

function sortedPair(leftId: string, rightId: string): readonly [string, string] {
  return leftId.localeCompare(rightId) <= 0 ? [leftId, rightId] : [rightId, leftId];
}

/**
 * Authoritative deployment placement. The command chooses poses; this layer
 * derives board/zone containment, physical contacts and unit coherency.
 */
export function executeDeploymentCommand(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'deploy-unit' }>,
  environment: DeploymentEnvironment
): CommandExecution {
  const basicRejection = validateGameCommand(state, command);
  if (basicRejection) return { accepted: false, state, rejection: basicRejection };
  const battle = state.battle!;
  if (!environment.fingerprint.trim() || environment.fingerprint !== state.shootingEnvironmentFingerprint) {
    return reject(state, command, 'deployment-environment-mismatch', 'Le placement ne correspond pas à l’environnement physique compilé de la session.', [GEOMETRY_RULE_ID]);
  }
  const unit = state.units[command.unitId]!;
  const zone = battle.deploymentZones.find((candidate) => candidate.playerId === command.actorId);
  if (!zone) return reject(state, command, 'missing-deployment-zone', 'Aucune zone de déploiement compilée ne correspond à ce joueur.', [DEPLOYMENT_RULE_ID]);

  const candidateFootprints: IdentifiedFootprint[] = [];
  for (const pose of [...command.modelPoses].sort((left, right) => left.modelId.localeCompare(right.modelId))) {
    const model = state.models[pose.modelId]!;
    const profile = environment.physicalProfiles[model.profileId];
    if (!profile) {
      return reject(state, command, 'unsupported-deployment-profile', 'Une figurine ne possède pas de profil physique couvert pour le déploiement.', [GEOMETRY_RULE_ID], { modelId: model.id, profileId: model.profileId });
    }
    candidateFootprints.push({ id: model.id, footprint: footprintForPose(model, pose, profile) });
  }

  const containment: Extract<GameEvent, { readonly type: 'unit-deployed' }>['evidence']['containment'][number][] = [];
  for (const candidate of candidateFootprints) {
    const board = classifyBoardContainment(candidate.footprint, battle.boardBounds);
    const deploymentZone = classifyBoardContainment(candidate.footprint, zone.bounds);
    if (board.classification === 'outside') {
      return reject(state, command, 'deployment-outside-board', 'La hitbox d’une figurine franchit le bord du champ de bataille.', [GEOMETRY_RULE_ID], { modelId: candidate.id, crossedEdges: board.crossedEdges.join(',') });
    }
    if (deploymentZone.classification === 'outside') {
      return reject(state, command, 'deployment-outside-zone', 'Chaque hitbox doit être entièrement dans la zone de déploiement de son joueur.', [DEPLOYMENT_RULE_ID, GEOMETRY_RULE_ID], { modelId: candidate.id, zoneId: zone.id, crossedEdges: deploymentZone.crossedEdges.join(',') });
    }
    containment.push({ modelId: candidate.id, board: board.classification, zone: deploymentZone.classification });
  }

  const existingFootprints: IdentifiedFootprint[] = [];
  for (const deployedUnitId of battle.deployedUnitIds) {
    const deployedUnit = state.units[deployedUnitId];
    if (!deployedUnit) throw new Error(`Deployed unit ${deployedUnitId} disappeared from the state.`);
    for (const member of deployedUnit.models.filter((model) => model.active)) {
      const model = state.models[member.id];
      const profile = model === undefined ? undefined : environment.physicalProfiles[model.profileId];
      if (!model || !profile) {
        return reject(state, command, 'unsupported-deployment-profile', 'Une figurine déjà déployée n’a plus de profil physique couvert.', [GEOMETRY_RULE_ID], { modelId: member.id });
      }
      existingFootprints.push({ id: model.id, footprint: currentFootprint(model, profile) });
    }
  }

  const contacts: Extract<GameEvent, { readonly type: 'unit-deployed' }>['evidence']['contacts'][number][] = [];
  const allComparisons: readonly (readonly [IdentifiedFootprint, IdentifiedFootprint])[] = [
    ...candidateFootprints.flatMap((left, leftIndex) => candidateFootprints.slice(leftIndex + 1).map((right) => [left, right] as const)),
    ...candidateFootprints.flatMap((left) => existingFootprints.map((right) => [left, right] as const))
  ];
  for (const [left, right] of allComparisons) {
    const evidence = classifyFootprintContact(left.footprint, right.footprint);
    const [leftModelId, rightModelId] = sortedPair(left.id, right.id);
    if (evidence.classification === 'overlapping') {
      return reject(state, command, 'deployment-model-overlap', 'Les hitbox des figurines ne peuvent pas se chevaucher.', [GEOMETRY_RULE_ID], { leftModelId, rightModelId });
    }
    contacts.push({ leftModelId, rightModelId, classification: evidence.classification, distance: evidence.distance });
  }
  contacts.sort((left, right) => left.leftModelId.localeCompare(right.leftModelId) || left.rightModelId.localeCompare(right.rightModelId));

  const coherency = evaluateV11UnitCoherency(candidateFootprints);
  if (!coherency.isCoherent) {
    return reject(state, command, 'deployment-unit-incoherent', 'Chaque figurine doit être à 2″ d’une autre et à 9″ de toutes les autres figurines de son unité.', [COHERENCY_RULE_ID], { incoherentModelIds: coherency.incoherentModelIds.join(',') });
  }

  const deployedUnitIds = [...battle.deployedUnitIds, unit.id];
  const nextPlayerId = nextDeploymentPlayerIdV1(battle.playerIds, command.actorId, deployedUnitIds, state.units);
  const event: Extract<GameEvent, { readonly type: 'unit-deployed' }> = {
    id: `${command.id}:0`,
    commandId: command.id,
    type: 'unit-deployed',
    playerId: command.actorId,
    unitId: unit.id,
    modelPoses: [...command.modelPoses].sort((left, right) => left.modelId.localeCompare(right.modelId)),
    evidence: {
      zoneId: zone.id,
      containment,
      contacts,
      coherency: {
        maximumLinkDistance: coherency.maximumLinkDistance,
        requiredNeighbours: coherency.requiredNeighbours,
        maximumPairDistance: coherency.maximumPairDistance,
        incoherentModelIds: coherency.incoherentModelIds,
        distantPairs: coherency.distantPairs
      }
    },
    environmentFingerprint: environment.fingerprint,
    nextPlayerId,
    deploymentComplete: nextPlayerId === null,
    sourceRefs: [EVENT_COMPANION_DEPLOY_ARMIES_SOURCE, CORE_UNIT_COHERENCY_SOURCE]
  };
  return { accepted: true, state: unsafeReduceGameEvent(state, event), events: [event] };
}
