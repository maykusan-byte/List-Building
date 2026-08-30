import { validateGameCommand } from '../domain/commands';
import { unsafeReduceGameEvent } from '../domain/reducer';
import { rollDie } from '../domain/prng';
import {
  FIGHT_PHASE_V1_SCHEMA_VERSION,
  type BasicShootingAllocationRecord,
  type BasicShootingDieStep,
  type CommandExecution,
  type DecisionRequest,
  type DeploymentModelPoseV1,
  type FightPhaseStateV1,
  type GameCommand,
  type GameEvent,
  type GameState,
  type ModelState,
  type PendingBasicMeleeResolutionV1,
  type PhysicalModelProfileV1,
  type RuleRejection,
  type UnitMovementPathV1,
  type UnitState,
  type WeaponProfileV1
} from '../domain/types';
import { classifyFootprintContact, evaluateMovement, footprintDistance, type Footprint, type IdentifiedFootprint, type MovementPose } from '../geometry';
import { evaluateV11UnitCoherency } from '../rules/coherency';
import { resolveRerollableHitStage, resolveRerollableWoundStage } from '../rules/shooting';
import {
  CORE_CONSOLIDATION_SOURCE,
  CORE_CONSOLIDATION_SEQUENCE_SOURCE,
  CORE_FIGHT_SEQUENCE_SOURCE,
  CORE_MELEE_ATTACK_SOURCE,
  CORE_NORMAL_FIGHT_SOURCE,
  CORE_PILE_IN_SOURCE,
  CORE_PILE_IN_SEQUENCE_SOURCE,
  CORE_UNIT_COHERENCY_SOURCE,
  OFFICIAL_APP_SELECT_UNIT_WITHOUT_WEAPONS_SOURCE
} from '../rules/m7-source-references';
import type { DeploymentEnvironment } from './deployment';

export interface FightEnvironment extends DeploymentEnvironment {
  readonly weaponProfiles: Readonly<Record<string, WeaponProfileV1>>;
}

const ENGAGEMENT_RANGE = 508;
const THREE_INCHES = 762;
const FIVE_INCHES = 1_270;

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

function movementPoses(moving: Footprint, path: UnitMovementPathV1): readonly MovementPose[] {
  const orientationDegrees = moving.kind === 'capsule' || moving.kind === 'oriented-convex-polygon' ? moving.orientationDegrees : undefined;
  const center = moving.kind === 'convex-polygon' ? moving.vertices[0] : moving.center;
  return [{ position: center, ...(orientationDegrees === undefined ? {} : { orientationDegrees }) }, ...path.waypoints.map((position) => ({ position, ...(orientationDegrees === undefined ? {} : { orientationDegrees }) }))];
}

function permitsTerminalTargetContact(
  verdict: ReturnType<typeof evaluateMovement>,
  poses: readonly MovementPose[],
  targetModelIds: ReadonlySet<string>
): boolean {
  if (verdict.allowed) return true;
  const collision = verdict.firstCollision;
  if (verdict.reason !== 'collision' || !collision || collision.contact.classification !== 'touching'
    || !targetModelIds.has(collision.obstacleId)) return false;
  if (poses.length === 1) return verdict.pathLength === 0 && collision.segmentT === 0;
  return collision.pathSegmentIndex === poses.length - 2 && collision.segmentT >= 1 - 1e-9;
}

function unitFootprints(state: GameState, unit: UnitState, environment: DeploymentEnvironment): IdentifiedFootprint[] | RuleRejection {
  const result: IdentifiedFootprint[] = [];
  for (const member of unit.models.filter((model) => model.active).sort((left, right) => left.id.localeCompare(right.id))) {
    const model = state.models[member.id];
    const profile = model === undefined ? undefined : environment.physicalProfiles[model.profileId];
    if (!model || !profile) return { commandId: '', code: 'fight-profile-missing', message: 'Une figurine ne possède pas de profil physique compilé pour le combat.', sourceRuleIds: ['12'] };
    if (profile.baseShape.kind !== 'circle') return { commandId: '', code: 'fight-profile-not-covered', message: 'Le pilote T04 borne les mouvements de mêlée aux empreintes circulaires.', sourceRuleIds: ['12'], details: { modelId: model.id } };
    result.push({ id: model.id, footprint: footprintFor(model, profile) });
  }
  return result;
}

function allUnitFootprints(state: GameState, environment: DeploymentEnvironment): UnitFootprints[] | RuleRejection {
  const result: UnitFootprints[] = [];
  for (const unitId of [...(state.battle?.deployedUnitIds ?? [])].sort()) {
    const unit = state.units[unitId];
    if (!unit || !unit.models.some((model) => model.active)) continue;
    const footprints = unitFootprints(state, unit, environment);
    if (!Array.isArray(footprints)) return footprints;
    result.push({ unit, footprints });
  }
  return result;
}

function minimumDistance(left: readonly IdentifiedFootprint[], right: readonly IdentifiedFootprint[]): number {
  return Math.min(...left.flatMap((one) => right.map((two) => footprintDistance(one.footprint, two.footprint))));
}

function engaged(left: readonly IdentifiedFootprint[], right: readonly IdentifiedFootprint[]): boolean {
  return minimumDistance(left, right) <= ENGAGEMENT_RANGE;
}

function otherPlayer(state: GameState, playerId: string): string {
  return state.battle!.playerIds.find((candidate) => candidate !== playerId)!;
}

function withoutForcedNextFightUnit(fight: FightPhaseStateV1): FightPhaseStateV1 {
  const { forcedNextFightUnitId: _resolvedCounterOffensive, ...remaining } = fight;
  return remaining;
}

export function createFightPhaseStateV1(activePlayerId: string): FightPhaseStateV1 {
  return {
    schemaVersion: FIGHT_PHASE_V1_SCHEMA_VERSION,
    stage: 'pile-in', activePlayerId, currentPlayerId: activePlayerId, passedPlayerIds: [], piledInUnitIds: [],
    eligibleAtFightStartUnitIds: [], selectionBand: null, foughtUnitIds: [], consolidatedUnitIds: []
  };
}

function unitIsCurrentlyEngaged(entry: UnitFootprints, allUnits: readonly UnitFootprints[]): boolean {
  return allUnits.some((other) => other.unit.playerId !== entry.unit.playerId && engaged(entry.footprints, other.footprints));
}

function fightCandidates(state: GameState, fight: FightPhaseStateV1, allUnits: readonly UnitFootprints[], playerId: string): readonly string[] {
  if (fight.forcedNextFightUnitId !== undefined) {
    return allUnits.filter((entry) => entry.unit.id === fight.forcedNextFightUnitId && entry.unit.playerId === playerId
      && !fight.foughtUnitIds.includes(entry.unit.id)
      && (unitIsCurrentlyEngaged(entry, allUnits) || fight.eligibleAtFightStartUnitIds.includes(entry.unit.id)
        || state.unitTurnStatuses[entry.unit.id]?.charged === true))
      .map((entry) => entry.unit.id);
  }
  return allUnits.filter((entry) => {
    if (entry.unit.playerId !== playerId || fight.foughtUnitIds.includes(entry.unit.id)) return false;
    const status = state.unitTurnStatuses[entry.unit.id];
    const eligible = unitIsCurrentlyEngaged(entry, allUnits) || fight.eligibleAtFightStartUnitIds.includes(entry.unit.id) || status?.charged === true;
    if (!eligible) return false;
    const fightsFirst = status?.fightsFirstFromCharge === true;
    return fight.selectionBand === 'fights-first' ? fightsFirst : !fightsFirst;
  }).map((entry) => entry.unit.id).sort();
}

function phaseAfterPass(state: GameState, allUnits: readonly UnitFootprints[]): FightPhaseStateV1 | RuleRejection {
  const fight = state.fightPhase!;
  const playerId = fight.currentPlayerId!;
  const other = otherPlayer(state, playerId);
  if (fight.stage === 'fight') {
    if (fightCandidates(state, fight, allUnits, playerId).length > 0) {
      return { commandId: '', code: 'fight-selection-required', message: 'Ce joueur possède encore une unité éligible dans cette séquence de combat.', sourceRuleIds: ['12.04'] };
    }
    if (fightCandidates(state, fight, allUnits, other).length > 0) {
      return { ...fight, currentPlayerId: other, passedPlayerIds: [playerId] };
    }
    if (fight.selectionBand === 'fights-first') {
      return { ...fight, currentPlayerId: playerId, passedPlayerIds: [], selectionBand: 'remaining' };
    }
    return { ...fight, stage: 'consolidation', currentPlayerId: fight.activePlayerId, passedPlayerIds: [], selectionBand: null };
  }
  const passedPlayerIds = [...new Set([...fight.passedPlayerIds, playerId])];
  if (!passedPlayerIds.includes(other)) return { ...fight, currentPlayerId: other, passedPlayerIds };
  if (fight.stage === 'pile-in') {
    const eligibleAtFightStartUnitIds = allUnits.filter((entry) => unitIsCurrentlyEngaged(entry, allUnits) || state.unitTurnStatuses[entry.unit.id]?.charged === true).map((entry) => entry.unit.id).sort();
    return { ...fight, stage: 'fight', currentPlayerId: fight.activePlayerId, passedPlayerIds: [], eligibleAtFightStartUnitIds, selectionBand: 'fights-first' };
  }
  if (fight.stage === 'consolidation') return { ...fight, stage: 'complete', currentPlayerId: null, passedPlayerIds };
  return { commandId: '', code: 'fight-window-complete', message: 'La phase de Combat est déjà résolue.', sourceRuleIds: ['12'] };
}

export function executePassFightWindowCommand(state: GameState, command: Extract<GameCommand, { readonly type: 'pass-fight-window' }>, environment: FightEnvironment): CommandExecution {
  const basic = validateGameCommand(state, command);
  if (basic) return { accepted: false, state, rejection: basic };
  if (environment.fingerprint !== state.shootingEnvironmentFingerprint) return reject(state, command, 'fight-environment-mismatch', 'La séquence de combat exige l’environnement physique compilé.', ['12']);
  const allUnits = allUnitFootprints(state, environment);
  if (!Array.isArray(allUnits)) return { accepted: false, state, rejection: { ...allUnits, commandId: command.id } };
  const nextFight = phaseAfterPass(state, allUnits);
  if ('code' in nextFight) return { accepted: false, state, rejection: { ...nextFight, commandId: command.id } };
  const source = state.fightPhase!.stage === 'pile-in'
    ? CORE_PILE_IN_SEQUENCE_SOURCE
    : state.fightPhase!.stage === 'consolidation' ? CORE_CONSOLIDATION_SEQUENCE_SOURCE : CORE_FIGHT_SEQUENCE_SOURCE;
  const event: Extract<GameEvent, { readonly type: 'fight-window-passed' }> = {
    id: `${command.id}:0`, commandId: command.id, type: 'fight-window-passed', playerId: command.actorId,
    fightPhaseAfter: nextFight, sourceRefs: [source]
  };
  return { accepted: true, state: unsafeReduceGameEvent(state, event), events: [event] };
}

function exactIds(actual: readonly string[], expected: readonly string[]): boolean {
  const left = [...actual].sort();
  const right = [...expected].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameFixedMeleeProfile(left: WeaponProfileV1 | undefined, right: WeaponProfileV1): boolean {
  return left !== undefined
    && left.id === right.id
    && left.displayName === right.displayName
    && left.weaponType === right.weaponType
    && left.range === right.range
    && left.attacks === right.attacks
    && left.ballisticSkill === right.ballisticSkill
    && left.strength === right.strength
    && left.armourPenetration === right.armourPenetration
    && left.damage === right.damage;
}

export function executeFightMovementCommand(state: GameState, command: Extract<GameCommand, { readonly type: 'resolve-fight-movement' }>, environment: FightEnvironment): CommandExecution {
  const basic = validateGameCommand(state, command);
  if (basic) return { accepted: false, state, rejection: basic };
  if (environment.fingerprint !== state.shootingEnvironmentFingerprint) return reject(state, command, 'fight-environment-mismatch', 'Le mouvement de mêlée exige l’environnement physique compilé.', ['12']);
  const fight = state.fightPhase!;
  const allUnits = allUnitFootprints(state, environment);
  if (!Array.isArray(allUnits)) return { accepted: false, state, rejection: { ...allUnits, commandId: command.id } };
  const movingEntry = allUnits.find((entry) => entry.unit.id === command.unitId)!;
  const enemies = allUnits.filter((entry) => entry.unit.playerId !== movingEntry.unit.playerId);
  const engagedEnemies = enemies.filter((enemy) => engaged(movingEntry.footprints, enemy.footprints));
  if (command.movementKind === 'pile-in' && engagedEnemies.length === 0 && state.unitTurnStatuses[movingEntry.unit.id]?.charged !== true) {
    return reject(state, command, 'unit-not-eligible-to-pile-in', 'Une unité non engagée qui n’a pas chargé ne peut pas effectuer de mouvement d’insertion.', ['12.03']);
  }
  let targets: UnitFootprints[];
  if (command.movementKind === 'consolidation' && engagedEnemies.length === 0) {
    return reject(state, command, 'consolidation-engagement-not-covered', 'La consolidation qui engage une nouvelle unité et déclenche son combat immédiat reste différée à M8.', ['12.08']);
  }
  if (engagedEnemies.length > 0) {
    if (!exactIds(command.targetUnitIds, engagedEnemies.map((entry) => entry.unit.id))) return reject(state, command, 'fight-targets-incomplete', 'Toutes les unités ennemies engagées doivent être les cibles de ce mouvement.', [command.movementKind === 'pile-in' ? '12.03' : '12.08']);
    targets = engagedEnemies;
  } else {
    const maximumTargetDistance = command.movementKind === 'pile-in' ? FIVE_INCHES : THREE_INCHES;
    targets = command.targetUnitIds.map((unitId) => enemies.find((entry) => entry.unit.id === unitId)).filter((entry): entry is UnitFootprints => entry !== undefined);
    if (targets.length !== command.targetUnitIds.length || targets.length === 0 || targets.some((target) => minimumDistance(movingEntry.footprints, target.footprints) > maximumTargetDistance)) {
      return reject(state, command, command.movementKind === 'pile-in' ? 'pile-in-target-ineligible' : 'consolidation-target-ineligible', command.movementKind === 'pile-in'
        ? 'Chaque cible doit être une unité ennemie éligible à portée du mouvement.'
        : 'Aucune unité ennemie éligible n’est à 3″ ; la consolidation vers un objectif reste différée à M8.', [command.movementKind === 'pile-in' ? '12.03' : '12.08']);
    }
  }
  const targetFootprints = targets.flatMap((target) => target.footprints);
  const targetModelIds = new Set(targetFootprints.map((target) => target.id));
  const enemyFootprints = enemies.flatMap((entry) => entry.footprints);
  const otherFootprints = allUnits.filter((entry) => entry.unit.id !== movingEntry.unit.id).flatMap((entry) => entry.footprints);
  const finalFootprints: IdentifiedFootprint[] = [];
  const finalPoses: DeploymentModelPoseV1[] = [];
  const pathEvidence: Extract<GameEvent, { readonly type: 'fight-movement-resolved' }>['evidence']['paths'][number][] = [];
  for (const path of [...command.paths].sort((left, right) => left.modelId.localeCompare(right.modelId))) {
    const model = state.models[path.modelId]!;
    const profile = environment.physicalProfiles[model.profileId]!;
    const moving = footprintFor(model, profile);
    const finalPosition = path.waypoints.at(-1) ?? model.position;
    const orientationDegrees = path.finalOrientationDegrees ?? model.orientationDegrees;
    if (orientationDegrees !== model.orientationDegrees) return reject(state, command, 'fight-rotation-not-covered', 'Les rotations de mêlée restent hors du pilote circulaire.', ['12'], { modelId: model.id });
    const startedBaseContact = targetFootprints.some((target) => footprintDistance(moving, target.footprint) === 0);
    if (startedBaseContact && path.waypoints.length > 0) return reject(state, command, 'fight-base-contact-model-moved', 'Une figurine en contact socle à socle avec l’ennemi ne peut pas être déplacée.', [command.movementKind === 'pile-in' ? '12.03' : '12.08'], { modelId: model.id });
    const poses = movementPoses(moving, path);
    const verdict = evaluateMovement(moving, poses, enemyFootprints, { board: state.battle!.boardBounds });
    if (!permitsTerminalTargetContact(verdict, poses, targetModelIds)) return reject(state, command, `fight-${verdict.reason}`, 'La trajectoire traverse une figurine ennemie ou le bord du plateau.', [command.movementKind === 'pile-in' ? '12.03' : '12.08'], { modelId: model.id });
    if (verdict.pathLength > THREE_INCHES) return reject(state, command, 'fight-movement-too-far', 'Une figurine dépasse les 3″ autorisés.', [command.movementKind === 'pile-in' ? '12.03' : '12.08'], { modelId: model.id, pathLength: verdict.pathLength });
    const finalPose = { modelId: model.id, position: finalPosition, orientationDegrees };
    const placed = footprintFor(model, profile, finalPose);
    const initialDistance = Math.min(...targetFootprints.map((target) => footprintDistance(moving, target.footprint)));
    const finalDistance = Math.min(...targetFootprints.map((target) => footprintDistance(placed, target.footprint)));
    if (path.waypoints.length > 0 && !(finalDistance < initialDistance)) return reject(state, command, 'fight-model-not-closer', 'Chaque figurine déplacée doit finir plus proche de sa cible la plus proche.', [command.movementKind === 'pile-in' ? '12.03' : '12.08'], { modelId: model.id });
    if (path.waypoints.length > 0 && finalDistance > ENGAGEMENT_RANGE && initialDistance <= THREE_INCHES + ENGAGEMENT_RANGE) return reject(state, command, 'fight-model-must-engage', 'Cette figurine doit finir engagée lorsqu’une fin engagée est géométriquement à sa portée.', [command.movementKind === 'pile-in' ? '12.03' : '12.08'], { modelId: model.id });
    if (command.movementKind === 'consolidation' && engagedEnemies.length > 0 && path.waypoints.length > 0) {
      const directMinimum = Math.max(0, initialDistance - THREE_INCHES);
      if (finalDistance > directMinimum + 1) return reject(state, command, 'continuous-consolidation-not-closest', 'La Consolidation Continue doit finir aussi proche que possible de la cible la plus proche dans le pilote direct.', ['12.08'], { modelId: model.id, finalDistance, directMinimum });
    }
    finalPoses.push(finalPose);
    finalFootprints.push({ id: model.id, footprint: placed });
    pathEvidence.push({ modelId: model.id, pathLength: verdict.pathLength, initialTargetDistance: initialDistance, finalTargetDistance: finalDistance });
  }
  for (const left of finalFootprints) {
    if ([...finalFootprints.filter((right) => right.id !== left.id), ...otherFootprints].some((right) => classifyFootprintContact(left.footprint, right.footprint).classification === 'overlapping')) {
      return reject(state, command, 'fight-model-overlap', 'Une figurine ne peut terminer sur une autre figurine.', [command.movementKind === 'pile-in' ? '12.03' : '12.08'], { modelId: left.id });
    }
  }
  const coherency = evaluateV11UnitCoherency(finalFootprints);
  if (!coherency.isCoherent) return reject(state, command, 'fight-unit-incoherent', 'L’unité doit terminer en cohérence.', ['03.03']);
  if (!targets.every((target) => engaged(finalFootprints, target.footprints))) return reject(state, command, 'fight-target-not-engaged', 'Le mouvement doit finir engagé avec toutes les cibles choisies.', [command.movementKind === 'pile-in' ? '12.03' : '12.08']);
  for (const original of movingEntry.footprints) {
    const final = finalFootprints.find((candidate) => candidate.id === original.id)!;
    const initiallyEngaged = enemies.filter((enemy) => enemy.footprints.some((enemyModel) => footprintDistance(original.footprint, enemyModel.footprint) <= ENGAGEMENT_RANGE));
    if (initiallyEngaged.some((enemy) => !enemy.footprints.some((enemyModel) => footprintDistance(final.footprint, enemyModel.footprint) <= ENGAGEMENT_RANGE))) {
      return reject(state, command, 'fight-existing-engagement-lost', 'Une figurine qui commence engagée avec une unité doit le rester.', [command.movementKind === 'pile-in' ? '12.03' : '12.08'], { modelId: original.id });
    }
  }
  const nextFight: FightPhaseStateV1 = command.movementKind === 'pile-in'
    ? { ...fight, piledInUnitIds: [...fight.piledInUnitIds, command.unitId].sort() }
    : { ...fight, consolidatedUnitIds: [...fight.consolidatedUnitIds, command.unitId].sort() };
  const source = command.movementKind === 'pile-in' ? CORE_PILE_IN_SOURCE : CORE_CONSOLIDATION_SOURCE;
  const event: Extract<GameEvent, { readonly type: 'fight-movement-resolved' }> = {
    id: `${command.id}:0`, commandId: command.id, type: 'fight-movement-resolved', playerId: command.actorId,
    movementKind: command.movementKind, unitId: command.unitId, targetUnitIds: [...command.targetUnitIds].sort(), paths: [...command.paths].sort((left, right) => left.modelId.localeCompare(right.modelId)),
    finalPoses: finalPoses.sort((left, right) => left.modelId.localeCompare(right.modelId)), evidence: {
      paths: pathEvidence.sort((left, right) => left.modelId.localeCompare(right.modelId)),
      coherency: { maximumLinkDistance: coherency.maximumLinkDistance, requiredNeighbours: coherency.requiredNeighbours, maximumPairDistance: coherency.maximumPairDistance, incoherentModelIds: coherency.incoherentModelIds, distantPairs: coherency.distantPairs }
    }, fightPhaseAfter: nextFight, environmentFingerprint: environment.fingerprint, prngBefore: state.prng, prngAfter: state.prng,
    sourceRefs: [source, CORE_UNIT_COHERENCY_SOURCE]
  };
  return { accepted: true, state: unsafeReduceGameEvent(state, event), events: [event] };
}

function basicMeleeAllocationModels(state: GameState, pending: PendingBasicMeleeResolutionV1): readonly UnitState['models'][number][] {
  const target = state.units[pending.targetUnitId];
  if (!target) return [];
  const active = target.models.filter((model) => model.active).sort((left, right) => left.id.localeCompare(right.id));
  const wounded = active.filter((model) => model.wounds < target.woundsPerModel);
  return wounded.length > 0 ? wounded : active;
}

function basicMeleeDecision(state: GameState, pending: PendingBasicMeleeResolutionV1): DecisionRequest {
  return {
    id: `${pending.originCommandId}:melee:${pending.nextWoundIndex}:model`,
    kind: 'basic-melee-allocation',
    playerId: pending.defenderPlayerId,
    prompt: 'Choisissez la figurine qui reçoit le prochain résultat de sauvegarde, conformément à 05.04.',
    options: basicMeleeAllocationModels(state, pending).map((model) => ({ id: model.id, label: model.id })),
    sourceRuleIds: ['05.04']
  };
}

function basicMeleeAllocationEvent(
  state: GameState,
  commandId: string,
  eventId: string,
  modelId: string,
  decisionId: string | null
): Extract<GameEvent, { readonly type: 'basic-melee-allocation-resolved' }> {
  const pending = state.pendingBasicMelee;
  const target = pending ? state.units[pending.targetUnitId] : undefined;
  const model = target?.models.find((entry) => entry.id === modelId && entry.active);
  const save = pending?.saveRolls[pending.nextWoundIndex];
  if (!pending || !target || !model || !save) throw new Error('No legal melee allocation is pending.');
  const saved = save.saved;
  const damage = saved ? 0 : Math.min(pending.damage, model.wounds);
  const wounds = model.wounds - damage;
  return {
    id: eventId,
    commandId,
    type: 'basic-melee-allocation-resolved',
    decisionId,
    playerId: pending.defenderPlayerId,
    packetIndex: pending.nextWoundIndex,
    attackIndex: save.attackIndex,
    modelId,
    saveRoll: save.roll,
    saved,
    damage,
    modelAfter: { ...model, wounds, active: wounds > 0 },
    prngBefore: state.prng,
    prngAfter: state.prng,
    sourceRefs: pending.sourceRefs
  };
}

function basicMeleeRolls(pending: PendingBasicMeleeResolutionV1): readonly BasicShootingDieStep[] {
  const hitByAttack = new Map(pending.hitRolls.map((roll) => [roll.attackIndex, roll]));
  const saveByAttack = new Map(pending.saveRolls.map((roll) => [roll.attackIndex, roll]));
  const allocationByAttack = new Map(pending.allocations.map((allocation) => [allocation.attackIndex, allocation]));
  const woundSteps = pending.woundRolls.map((wound): BasicShootingDieStep => {
    const hit = hitByAttack.get(wound.attackIndex);
    if (!hit?.hit) throw new Error('A failed melee hit cannot have a wound roll.');
    if (!wound.wound) return {
      attackIndex: wound.attackIndex,
      outcome: 'failed-to-wound',
      hitRoll: hit.roll,
      hit: true,
      criticalHit: hit.critical,
      woundRoll: wound.roll,
      wound: false,
      criticalWound: wound.critical
    };
    const allocation = allocationByAttack.get(wound.attackIndex);
    if (!allocation) {
      const save = saveByAttack.get(wound.attackIndex);
      return {
        attackIndex: wound.attackIndex,
        outcome: 'lost-no-target',
        hitRoll: hit.roll,
        hit: true,
        criticalHit: hit.critical,
        woundRoll: wound.roll,
        wound: true,
        criticalWound: wound.critical,
        ...(save === undefined ? {} : { saveRoll: save.roll, saved: save.saved })
      };
    }
    return {
      attackIndex: wound.attackIndex,
      outcome: allocation.outcome,
      hitRoll: hit.roll,
      hit: true,
      criticalHit: hit.critical,
      woundRoll: wound.roll,
      wound: true,
      criticalWound: wound.critical,
      saveRoll: allocation.saveRoll,
      saved: allocation.outcome === 'saved',
      ...(allocation.damage === undefined ? {} : { damage: allocation.damage }),
      ...(allocation.allocatedModelId === undefined ? {} : { allocatedModelId: allocation.allocatedModelId }),
      ...(allocation.destroyedModelId === undefined ? {} : { destroyedModelId: allocation.destroyedModelId })
    };
  });
  const missed = pending.hitRolls.filter((hit) => !hit.hit).map((hit): BasicShootingDieStep => ({
    attackIndex: hit.attackIndex,
    outcome: 'missed',
    hitRoll: hit.roll,
    hit: false,
    criticalHit: hit.critical
  }));
  return [...woundSteps, ...missed].sort((left, right) => left.attackIndex - right.attackIndex);
}

function basicMeleeCompletionEvent(state: GameState, commandId: string, eventId: string): Extract<GameEvent, { readonly type: 'basic-melee-resolved' }> {
  const pending = state.pendingBasicMelee;
  const target = pending ? state.units[pending.targetUnitId] : undefined;
  if (!pending || !target) throw new Error('No melee continuation can be completed.');
  const active = target.models.filter((model) => model.active);
  const wounded = active.find((model) => model.wounds < target.woundsPerModel);
  const damagedAllocations = pending.allocations.filter((allocation) => allocation.outcome === 'damaged' || allocation.outcome === 'destroyed');
  return {
    id: eventId,
    commandId,
    type: 'basic-melee-resolved',
    playerId: state.units[pending.attackerUnitId]!.playerId,
    attackerUnitId: pending.attackerUnitId,
    targetUnitId: pending.targetUnitId,
    weaponProfileId: pending.weaponProfileId,
    attackingModelIds: pending.attackingModelIds,
    rolls: basicMeleeRolls(pending),
    result: {
      hitRequired: pending.hitRequired,
      woundRequired: pending.woundRequired,
      saveRequired: pending.saveRequired,
      hits: pending.hitRolls.filter((roll) => roll.hit).length,
      wounds: pending.saveRolls.length,
      failedSaves: damagedAllocations.length,
      damageInflicted: damagedAllocations.reduce((sum, allocation) => sum + (allocation.damage ?? 0), 0),
      modelsDestroyed: damagedAllocations.filter((allocation) => allocation.outcome === 'destroyed').length,
      remainingModels: active.length,
      remainingWoundsOnDamagedModel: wounded?.wounds ?? null
    },
    targetModelsAfter: target.models,
    fightPhaseAfter: pending.fightPhaseAfter,
    environmentFingerprint: pending.environmentFingerprint,
    prngBefore: state.prng,
    prngAfter: state.prng,
    sourceRefs: pending.sourceRefs
  };
}

function continueBasicMelee(state: GameState, commandId: string, firstEventIndex: number): { readonly state: GameState; readonly events: readonly GameEvent[] } {
  const events: GameEvent[] = [];
  let current = state;
  while (true) {
    const pending = current.pendingBasicMelee;
    if (!pending) throw new Error('The melee continuation disappeared.');
    const legalModels = basicMeleeAllocationModels(current, pending);
    if (pending.nextWoundIndex >= pending.saveRolls.length || legalModels.length === 0) {
      const completed = basicMeleeCompletionEvent(current, commandId, `${commandId}:${firstEventIndex + events.length}`);
      events.push(completed);
      return { state: unsafeReduceGameEvent(current, completed), events };
    }
    if (legalModels.length > 1) {
      const request: GameEvent = {
        id: `${commandId}:${firstEventIndex + events.length}`,
        commandId,
        type: 'decision-requested',
        decision: basicMeleeDecision(current, pending)
      };
      events.push(request);
      return { state: unsafeReduceGameEvent(current, request), events };
    }
    const allocation = basicMeleeAllocationEvent(
      current,
      commandId,
      `${commandId}:${firstEventIndex + events.length}`,
      legalModels[0]!.id,
      null
    );
    events.push(allocation);
    current = unsafeReduceGameEvent(current, allocation);
  }
}

export function executeBasicMeleeCommand(state: GameState, command: Extract<GameCommand, { readonly type: 'resolve-basic-melee' }>, environment: FightEnvironment): CommandExecution {
  const basic = validateGameCommand(state, command);
  if (basic) return { accepted: false, state, rejection: basic };
  if (environment.fingerprint !== state.shootingEnvironmentFingerprint) return reject(state, command, 'fight-environment-mismatch', 'Le combat exige l’environnement physique compilé.', ['12.04']);
  const fight = state.fightPhase!;
  const allUnits = allUnitFootprints(state, environment);
  if (!Array.isArray(allUnits)) return { accepted: false, state, rejection: { ...allUnits, commandId: command.id } };
  const attacker = allUnits.find((entry) => entry.unit.id === command.attackerUnitId)!;
  const target = allUnits.find((entry) => entry.unit.id === command.targetUnitId)!;
  if (!fightCandidates(state, fight, allUnits, command.actorId).includes(attacker.unit.id)) return reject(state, command, 'fight-unit-not-eligible-in-band', 'Cette unité n’est pas éligible dans la séquence de combat actuelle.', ['12.04']);
  const engagedEnemyUnits = allUnits.filter((entry) => entry.unit.playerId !== attacker.unit.playerId && engaged(attacker.footprints, entry.footprints));
  if (engagedEnemyUnits.length === 0) return reject(state, command, 'sweep-fight-not-covered', 'Une unité non engagée doit résoudre un combat de débordement, différé à M8.', ['12.06']);
  if (engagedEnemyUnits.length > 1) return reject(state, command, 'multiple-melee-targets-not-covered', 'Le pilote T04 exige une seule unité ennemie engagée ; la répartition multi-cible reste différée.', ['04.02']);
  if (engagedEnemyUnits[0]!.unit.id !== target.unit.id) return reject(state, command, 'melee-target-not-engaged', 'La cible doit être l’unité ennemie engagée avec les figurines attaquantes.', ['04.02']);
  const weapon = attacker.unit.weaponProfiles.find((profile) => profile.id === command.weaponProfileId && profile.weaponType === 'melee');
  if (!weapon) return reject(state, command, 'melee-weapon-not-covered', 'Le profil de mêlée choisi n’appartient pas à cette unité.', ['04.01']);
  if (weapon.randomAttacks !== undefined || weapon.randomDamage !== undefined || weapon.modifierPlan !== undefined
    || (weapon.attackVolumeAbilities?.length ?? 0) > 0 || (weapon.weaponKeywords?.length ?? 0) > 0 || target.unit.extendedDefence !== undefined) {
    return reject(state, command, 'advanced-melee-profile-not-covered', 'Le pilote T04 accepte uniquement un profil de mêlée fixe et une défense homogène sans aptitude.', ['04', '05']);
  }
  if (!sameFixedMeleeProfile(environment.weaponProfiles[weapon.id], weapon)) return reject(state, command, 'melee-weapon-profile-mismatch', 'Le profil de mêlée ne correspond pas à l’environnement canonique compilé.', ['04.01']);
  const engagedModelIds = attacker.footprints.filter((model) => target.footprints.some((enemy) => footprintDistance(model.footprint, enemy.footprint) <= ENGAGEMENT_RANGE)).map((model) => model.id).sort();
  if (engagedModelIds.length === 0) return reject(state, command, 'no-engaged-melee-models', 'Aucune figurine de cette unité n’est engagée avec la cible.', ['04.02']);
  const meleeProfileIds = new Set(attacker.unit.weaponProfiles.filter((profile) => profile.weaponType === 'melee').map((profile) => profile.id));
  const armedEngagedModelIds = engagedModelIds.filter((modelId) => attacker.unit.weaponAssignments.some((assignment) => assignment.modelId === modelId && assignment.quantity > 0 && meleeProfileIds.has(assignment.weaponProfileId)));
  if (armedEngagedModelIds.length === 0) return reject(state, command, 'empty-fight-required', 'Aucune figurine engagée ne peut effectuer d’attaque ; résolvez ce combat sans attaque.', ['04.01', '04.02']);
  if (armedEngagedModelIds.some((modelId) => !attacker.unit.weaponAssignments.some((assignment) => assignment.modelId === modelId && assignment.weaponProfileId === weapon.id && assignment.quantity > 0))) {
    return reject(state, command, 'mixed-melee-profiles-not-covered', 'Toutes les figurines engagées armées doivent pouvoir choisir le même profil de mêlée dans le pilote T04.', ['04.01']);
  }
  const attackingModelIds = armedEngagedModelIds;
  // §04.01 requires exactly one melee weapon per attacking model. Multiple
  // identical equipped instances never multiply that weapon's A value.
  const weaponInstances = attackingModelIds.length;
  const attackRequest = {
    attackerId: attacker.unit.id,
    targetId: target.unit.id,
    weapon: { ...weapon, attacks: weapon.attacks * weaponInstances, range: 0 },
    target: { toughness: target.unit.toughness, save: target.unit.save, woundsPerModel: target.unit.woundsPerModel, models: target.unit.models, keywords: target.unit.keywords },
    distance: 0,
    visible: true
  } as const;
  const hitStage = resolveRerollableHitStage(attackRequest, state.prng);
  if (!hitStage.accepted) return reject(state, command, `melee-${hitStage.code}`, hitStage.message, ['04', '05']);
  const woundStage = resolveRerollableWoundStage(
    attackRequest,
    hitStage,
    hitStage.hitRolls.map((roll) => ({ groupIndex: 0, attackIndex: roll.attackIndex, rollKind: 'hit' as const, optionId: 'keep' as const })),
    hitStage.prngAfter
  );
  if (!woundStage.accepted) return reject(state, command, `melee-${woundStage.code}`, woundStage.message, ['04', '05']);
  let savePrng = woundStage.prngAfter;
  const saveRolls = woundStage.woundRolls.filter((roll) => roll.wound).map((wound) => {
    const save = rollDie(savePrng, 6);
    savePrng = save.state;
    return {
      attackIndex: wound.attackIndex,
      roll: save.face,
      saved: woundStage.saveRequired <= 6 && save.face >= woundStage.saveRequired
    };
  }).sort((left, right) => left.roll - right.roll || left.attackIndex - right.attackIndex);
  const nextFight: FightPhaseStateV1 = {
    ...withoutForcedNextFightUnit(fight),
    currentPlayerId: otherPlayer(state, command.actorId),
    passedPlayerIds: [],
    foughtUnitIds: [...fight.foughtUnitIds, attacker.unit.id].sort()
  };
  const pending: PendingBasicMeleeResolutionV1 = {
    originCommandId: command.id,
    attackerUnitId: attacker.unit.id,
    targetUnitId: target.unit.id,
    weaponProfileId: weapon.id,
    attackingModelIds,
    defenderPlayerId: target.unit.playerId,
    hitRequired: woundStage.hitRequired,
    woundRequired: woundStage.woundRequired,
    saveRequired: woundStage.saveRequired,
    damage: weapon.damage,
    hitRolls: woundStage.hitRolls,
    woundRolls: woundStage.woundRolls,
    successfulWoundAttackIndexes: woundStage.woundRolls.filter((roll) => roll.wound).map((roll) => roll.attackIndex),
    saveRolls,
    nextWoundIndex: 0,
    allocations: [],
    fightPhaseAfter: nextFight,
    environmentFingerprint: environment.fingerprint,
    prngBefore: state.prng,
    prngAfter: savePrng,
    sourceRefs: [CORE_FIGHT_SEQUENCE_SOURCE, CORE_NORMAL_FIGHT_SOURCE, CORE_MELEE_ATTACK_SOURCE, ...woundStage.sourceRefs]
  };
  const stageEvent: Extract<GameEvent, { readonly type: 'basic-melee-stage-resolved' }> = {
    id: `${command.id}:0`, commandId: command.id, type: 'basic-melee-stage-resolved', playerId: command.actorId, resolution: pending
  };
  const staged = unsafeReduceGameEvent(state, stageEvent);
  const continued = continueBasicMelee(staged, command.id, 1);
  return { accepted: true, state: continued.state, events: [stageEvent, ...continued.events] };
}

/** Allocates one already-rolled 05.03 save result under defender-owned 05.04. */
export function executeBasicMeleeAllocationDecisionCommand(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'resolve-decision' }>,
  environment: FightEnvironment
): CommandExecution {
  const validation = validateGameCommand(state, command);
  if (validation) return { accepted: false, state, rejection: validation };
  if (environment.fingerprint !== state.shootingEnvironmentFingerprint) return reject(state, command, 'fight-environment-mismatch', 'L’allocation de mêlée exige l’environnement compilé.', ['05.04']);
  const pending = state.pendingBasicMelee;
  const decision = state.pendingDecisions.find((entry) => entry.id === command.decisionId);
  const legalModels = pending ? basicMeleeAllocationModels(state, pending) : [];
  if (!pending || !decision || decision.kind !== 'basic-melee-allocation' || decision.playerId !== command.actorId
    || !legalModels.some((model) => model.id === command.optionId)) {
    return reject(state, command, 'invalid-melee-allocation-decision', 'Le choix ne correspond pas à l’allocation de mêlée 05.04 en attente.', ['05.04']);
  }
  const allocation = basicMeleeAllocationEvent(state, command.id, `${command.id}:0`, command.optionId, decision.id);
  const afterAllocation = unsafeReduceGameEvent(state, allocation);
  const continued = continueBasicMelee(afterAllocation, command.id, 1);
  return { accepted: true, state: continued.state, events: [allocation, ...continued.events] };
}

/** Resolves the official no-weapon case without fabricating an attack or consuming entropy. */
export function executeEmptyFightCommand(state: GameState, command: Extract<GameCommand, { readonly type: 'resolve-empty-fight' }>, environment: FightEnvironment): CommandExecution {
  const basic = validateGameCommand(state, command);
  if (basic) return { accepted: false, state, rejection: basic };
  if (environment.fingerprint !== state.shootingEnvironmentFingerprint) return reject(state, command, 'fight-environment-mismatch', 'Le combat exige l’environnement physique compilé.', ['12.04']);
  const fight = state.fightPhase!;
  const allUnits = allUnitFootprints(state, environment);
  if (!Array.isArray(allUnits)) return { accepted: false, state, rejection: { ...allUnits, commandId: command.id } };
  const entry = allUnits.find((candidate) => candidate.unit.id === command.unitId)!;
  if (!fightCandidates(state, fight, allUnits, command.actorId).includes(entry.unit.id)) return reject(state, command, 'fight-unit-not-eligible-in-band', 'Cette unité n’est pas éligible dans la séquence de combat actuelle.', ['12.04']);
  if (!unitIsCurrentlyEngaged(entry, allUnits)) return reject(state, command, 'sweep-fight-not-covered', 'Une unité non engagée doit résoudre un combat de débordement, différé à M8.', ['12.06']);
  const enemies = allUnits.filter((candidate) => candidate.unit.playerId !== entry.unit.playerId);
  const engagedModelIds = new Set(entry.footprints.filter((model) => enemies.some((enemy) => enemy.footprints.some((enemyModel) => footprintDistance(model.footprint, enemyModel.footprint) <= ENGAGEMENT_RANGE))).map((model) => model.id));
  const hasEngagedMeleeWeapon = entry.unit.weaponAssignments.some((assignment) => engagedModelIds.has(assignment.modelId)
    && assignment.quantity > 0 && entry.unit.weaponProfiles.some((profile) => profile.id === assignment.weaponProfileId && profile.weaponType === 'melee'));
  if (hasEngagedMeleeWeapon) return reject(state, command, 'melee-weapon-selection-required', 'Au moins une figurine engagée possède une arme de mêlée ; ses attaques doivent être résolues.', ['04.01']);
  const nextFight: FightPhaseStateV1 = {
    ...withoutForcedNextFightUnit(fight),
    currentPlayerId: otherPlayer(state, command.actorId),
    passedPlayerIds: [],
    foughtUnitIds: [...fight.foughtUnitIds, entry.unit.id].sort()
  };
  const event: Extract<GameEvent, { readonly type: 'empty-fight-resolved' }> = {
    id: `${command.id}:0`, commandId: command.id, type: 'empty-fight-resolved', playerId: command.actorId, unitId: entry.unit.id,
    fightPhaseAfter: nextFight, environmentFingerprint: environment.fingerprint, prngBefore: state.prng, prngAfter: state.prng,
    sourceRefs: [CORE_FIGHT_SEQUENCE_SOURCE, CORE_NORMAL_FIGHT_SOURCE, OFFICIAL_APP_SELECT_UNIT_WITHOUT_WEAPONS_SOURCE]
  };
  return { accepted: true, state: unsafeReduceGameEvent(state, event), events: [event] };
}
