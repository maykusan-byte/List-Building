import {
  validateGameCommand,
  type BasicShootingEvidence,
  type BasicShootingAttackGroup,
  type CommandExecution,
  type GameCommand,
  type GameEvent,
  type GameState,
  type ModelState,
  type PhysicalModelProfileV1,
  type RuleRejection,
  type SourceReferenceV1,
  type UnitState,
  type WeaponProfileV1
} from '../domain';
import { unsafeReduceGameEvent } from '../domain/reducer';
import type { UnsafeSimulationReplayVerifier } from '../domain/serialization';
import {
  evaluateLineOfSight,
  footprintDistance,
  pointInMultiPolygonArea,
  type Footprint,
  type LineOfSightResult,
  type MultiPolygonArea,
  type TerrainBlocker
} from '../geometry';
import { CORE_ATTACK_SEQUENCE_STEP_SOURCES, CORE_BASIC_RANGED_ATTACK_SOURCE, CORE_BENEFIT_OF_COVER_SOURCE, resolveBasicShooting } from '../rules';

export interface ShootingTerrainZone {
  readonly id: string;
  readonly footprint: MultiPolygonArea;
  readonly ruleIds: readonly string[];
  readonly blocker?: TerrainBlocker;
}

export interface ShootingCoverRuleFact {
  readonly id: 'core.benefit-of-cover';
  readonly source: SourceReferenceV1;
  readonly ballisticSkillPenalty: 1;
  readonly branches: readonly [
    { readonly kind: 'inside-terrain-zone'; readonly qualifyingKeywords: readonly ['INFANTRY', 'BEAST', 'SWARM'] },
    { readonly kind: 'not-entirely-visible-due-to-terrain' }
  ];
}

/** Trusted immutable facts compiled from one versioned scenario/rulepack. */
const SHOOTING_ENVIRONMENT_BRAND: unique symbol = Symbol('warforge.shooting-environment');

export interface ShootingEnvironment {
  readonly [SHOOTING_ENVIRONMENT_BRAND]: true;
  readonly fingerprint: string;
  readonly physicalProfiles: Readonly<Record<string, PhysicalModelProfileV1>>;
  readonly weaponProfiles: Readonly<Record<string, WeaponProfileV1>>;
  readonly terrainZones: readonly ShootingTerrainZone[];
  readonly coverRules: readonly ShootingCoverRuleFact[];
}

export interface ShootingEnvironmentInput {
  readonly physicalProfiles: Readonly<Record<string, PhysicalModelProfileV1>>;
  readonly weaponProfiles: Readonly<Record<string, WeaponProfileV1>>;
  readonly terrainZones: readonly ShootingTerrainZone[];
  readonly coverRules: readonly ShootingCoverRuleFact[];
}

export interface ShootingCommandResolver {
  execute(state: GameState, command: Extract<GameCommand, { readonly type: 'resolve-basic-shooting' }>): CommandExecution;
}

const SHOOTING_RULE_ID = 'core.basic-ranged-attack';
const GEOMETRY_RULE_ID = 'simulator.geometry.line-of-sight';
const TRUST_RULE_ID = 'simulator.core.trusted-shooting-environment';

function reject(command: GameCommand, code: string, message: string, sourceRuleIds: readonly string[], details?: Readonly<Record<string, string | number | boolean>>): RuleRejection {
  return { commandId: command.id, code, message, sourceRuleIds, ...(details ? { details } : {}) };
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function stableCanonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableCanonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableCanonicalize(entry)]));
  }
  return value;
}

function fnv1a32(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function createShootingEnvironment(input: ShootingEnvironmentInput): ShootingEnvironment {
  const content = structuredClone(input);
  const fingerprint = `shooting-env-fnv1a32:${fnv1a32(JSON.stringify(stableCanonicalize(content)))}`;
  return Object.freeze({ ...content, fingerprint, [SHOOTING_ENVIRONMENT_BRAND]: true as const });
}

function sourceReferenceKey(reference: SourceReferenceV1): string {
  return JSON.stringify({ sourceId: reference.sourceId, version: reference.version, effectiveFrom: reference.effectiveFrom, page: reference.page, reference: reference.reference });
}

function uniqueSources(references: readonly SourceReferenceV1[]): readonly SourceReferenceV1[] {
  return [...new Map(references.map((reference) => [sourceReferenceKey(reference), reference])).values()];
}

function validateEnvironment(environment: ShootingEnvironment, command: GameCommand): RuleRejection | null {
  if (environment[SHOOTING_ENVIRONMENT_BRAND] !== true) return reject(command, 'invalid-shooting-environment', 'L’environnement de tir doit provenir de la fabrique canonique.', [TRUST_RULE_ID]);
  const expectedFingerprint = createShootingEnvironment({ physicalProfiles: environment.physicalProfiles, weaponProfiles: environment.weaponProfiles, terrainZones: environment.terrainZones, coverRules: environment.coverRules }).fingerprint;
  if (environment.fingerprint !== expectedFingerprint) return reject(command, 'invalid-shooting-environment', 'L’empreinte de l’environnement ne correspond pas à son contenu canonique.', [TRUST_RULE_ID]);
  const rule = environment.coverRules[0];
  if (environment.coverRules.length !== 1
    || rule.id !== 'core.benefit-of-cover'
    || rule.ballisticSkillPenalty !== 1
    || !sameJson(rule.source, CORE_BENEFIT_OF_COVER_SOURCE)
    || !sameJson(rule.branches, [
      { kind: 'inside-terrain-zone', qualifyingKeywords: ['INFANTRY', 'BEAST', 'SWARM'] },
      { kind: 'not-entirely-visible-due-to-terrain' }
    ])) {
    return reject(command, 'invalid-cover-rule-fact', 'Le fait compilé de couvert doit être exactement la règle 13.08 canonique avec une pénalité de CT de 1.', ['core.benefit-of-cover']);
  }
  if (environment.terrainZones.some((zone) => !zone.id.trim() || new Set(zone.ruleIds).size !== zone.ruleIds.length || (zone.blocker && zone.blocker.id !== zone.id))) {
    return reject(command, 'invalid-shooting-terrain', 'Les zones de terrain de tir doivent être canoniques et leurs bloqueurs liés au même identifiant.', [TRUST_RULE_ID]);
  }
  return null;
}

function activeModels(state: GameState, unit: UnitState): readonly ModelState[] {
  return unit.models
    .filter((entry) => entry.active)
    .map((entry) => {
      const model = state.models[entry.id];
      if (!model || !model.active) throw new Error(`Unit ${unit.id} has an inactive or missing model ${entry.id}.`);
      return model;
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function firingModels(state: GameState, unit: UnitState, weaponProfileId: string): { readonly models: readonly ModelState[]; readonly weaponCount: number } {
  const quantities = new Map(unit.weaponAssignments
    .filter((assignment) => assignment.weaponProfileId === weaponProfileId)
    .map((assignment) => [assignment.modelId, assignment.quantity]));
  const models = activeModels(state, unit).filter((model) => quantities.has(model.id));
  return { models, weaponCount: models.reduce((total, model) => total + (quantities.get(model.id) ?? 0), 0) };
}

function footprintForModel(model: ModelState, profile: PhysicalModelProfileV1): Footprint {
  switch (profile.baseShape.kind) {
    case 'circle': return { kind: 'circle', center: model.position, radius: profile.baseShape.radius };
    case 'capsule': return { kind: 'capsule', center: model.position, radius: profile.baseShape.radius, length: profile.baseShape.length, orientationDegrees: model.orientationDegrees };
    case 'polygon': return { kind: 'oriented-convex-polygon', center: model.position, orientationDegrees: model.orientationDegrees, vertices: profile.baseShape.vertices };
  }
}

function profileFor(environment: ShootingEnvironment, model: ModelState, command: GameCommand): PhysicalModelProfileV1 | RuleRejection {
  const profile = environment.physicalProfiles[model.profileId];
  return profile ?? reject(command, 'unsupported-physical-profile', 'Le profil physique de tir n’est pas couvert par l’environnement autoritaire.', [GEOMETRY_RULE_ID], { profileId: model.profileId });
}

function rotateOffset(x: number, y: number, orientationDegrees: number): { readonly x: number; readonly y: number } {
  const radians = orientationDegrees * Math.PI / 180;
  return { x: Math.round(x * Math.cos(radians) - y * Math.sin(radians)), y: Math.round(x * Math.sin(radians) + y * Math.cos(radians)) };
}

interface ModelPairEvidence {
  readonly attackerModel: ModelState;
  readonly targetModel: ModelState;
  readonly distance: number;
  readonly rays: readonly LineOfSightResult[];
  readonly clearRay?: LineOfSightResult;
}

function modelPairs(
  command: GameCommand,
  attackers: readonly ModelState[],
  targets: readonly ModelState[],
  environment: ShootingEnvironment
): readonly ModelPairEvidence[] | RuleRejection {
  const blockers = environment.terrainZones.flatMap((zone) => zone.blocker ? [zone.blocker] : []);
  const pairs: ModelPairEvidence[] = [];
  try {
    for (const attackerModel of attackers) {
      const attackerProfile = profileFor(environment, attackerModel, command);
      if ('code' in attackerProfile) return attackerProfile;
      for (const targetModel of targets) {
        const targetProfile = profileFor(environment, targetModel, command);
        if ('code' in targetProfile) return targetProfile;
        const rays: LineOfSightResult[] = [];
        for (const attackerPoint of attackerProfile.visibilityPoints) {
          const attackerOffset = rotateOffset(attackerPoint.x, attackerPoint.y, attackerModel.orientationDegrees);
          for (const targetPoint of targetProfile.visibilityPoints) {
            const targetOffset = rotateOffset(targetPoint.x, targetPoint.y, targetModel.orientationDegrees);
            rays.push(evaluateLineOfSight({
              from: { x: attackerModel.position.x + attackerOffset.x, y: attackerModel.position.y + attackerOffset.y, z: attackerPoint.z },
              to: { x: targetModel.position.x + targetOffset.x, y: targetModel.position.y + targetOffset.y, z: targetPoint.z }
            }, blockers));
          }
        }
        pairs.push({
          attackerModel,
          targetModel,
          distance: footprintDistance(footprintForModel(attackerModel, attackerProfile), footprintForModel(targetModel, targetProfile)),
          rays,
          clearRay: rays.find((ray) => ray.visible)
        });
      }
    }
  } catch (error) {
    return reject(command, 'invalid-shooting-geometry', 'La géométrie autoritaire du tir est invalide.', [GEOMETRY_RULE_ID], { reason: error instanceof Error ? error.message : 'unknown' });
  }
  return pairs.sort((left, right) => left.distance - right.distance
    || left.attackerModel.id.localeCompare(right.attackerModel.id)
    || left.targetModel.id.localeCompare(right.targetModel.id));
}

function coverEvidence(target: UnitState, targets: readonly ModelState[], pairs: readonly ModelPairEvidence[], environment: ShootingEnvironment): BasicShootingEvidence['cover'] {
  const rule = environment.coverRules[0];
  const qualifyingKeyword = rule.branches[0].qualifyingKeywords.some((keyword) => target.keywords.includes(keyword));
  const terrainIds = new Set<string>();
  const everyTargetQualifies = targets.every((targetModel) => {
    const insideZones = qualifyingKeyword ? environment.terrainZones.filter((zone) => zone.ruleIds.includes(rule.id) && pointInMultiPolygonArea(targetModel.position, zone.footprint)) : [];
    const targetPairs = pairs.filter((pair) => pair.targetModel.id === targetModel.id);
    const terrainBlockerIds = [...new Set(targetPairs.flatMap((pair) => pair.rays
      .filter((ray) => !ray.visible)
      .flatMap((ray) => ray.blockerHits.map((hit) => hit.blockerId))))]
      .filter((blockerId) => environment.terrainZones.some((zone) => zone.id === blockerId));
    insideZones.forEach((zone) => terrainIds.add(zone.id));
    terrainBlockerIds.forEach((id) => terrainIds.add(id));
    return insideZones.length > 0 || terrainBlockerIds.length > 0;
  });
  const applies = targets.length > 0 && everyTargetQualifies;
  return {
    applies,
    ballisticSkillPenalty: applies ? 1 : 0,
    sourceRuleIds: applies ? [rule.id] : [],
    terrainZoneIds: applies ? [...terrainIds].sort() : [],
    sourceRefs: applies ? [rule.source] : []
  };
}

interface PlannedAttackGroup {
  readonly firingModel: ModelState;
  readonly weaponCount: number;
  readonly pair: ModelPairEvidence;
  readonly cover: BasicShootingEvidence['cover'];
}

interface ShootingPlan {
  readonly evidence: BasicShootingEvidence;
  readonly groups: readonly PlannedAttackGroup[];
}

function computeEvidence(state: GameState, command: Extract<GameCommand, { readonly type: 'resolve-basic-shooting' }>, environment: ShootingEnvironment): ShootingPlan | RuleRejection {
  const attacker = state.units[command.attackerUnitId];
  const target = state.units[command.targetUnitId];
  const weapon = attacker?.weaponProfiles.find((profile) => profile.id === command.weaponProfileId);
  if (!attacker || !target || !weapon) return reject(command, 'unknown-shooting-subject', 'Les sujets de tir validés sont introuvables.', [SHOOTING_RULE_ID]);
  const carriers = firingModels(state, attacker, weapon.id);
  const targetModels = activeModels(state, target);
  if (carriers.models.length === 0 || carriers.weaponCount === 0 || targetModels.length === 0) return reject(command, 'no-active-models', 'Le tir exige un porteur actif et une cible active.', [SHOOTING_RULE_ID]);
  const pairs = modelPairs(command, carriers.models, targetModels, environment);
  if ('code' in pairs) return pairs;
  const groups = carriers.models.flatMap((firingModel) => {
    const carrierPairs = pairs.filter((pair) => pair.attackerModel.id === firingModel.id);
    const pair = carrierPairs.find((candidate) => candidate.distance <= weapon.range && candidate.clearRay !== undefined);
    const assignment = attacker.weaponAssignments.find((candidate) => candidate.modelId === firingModel.id && candidate.weaponProfileId === weapon.id);
    return pair && assignment ? [{ firingModel, weaponCount: assignment.quantity, pair, cover: coverEvidence(target, targetModels, carrierPairs, environment) }] : [];
  });
  if (groups.length === 0) {
    const anyVisible = pairs.some((pair) => pair.clearRay !== undefined);
    return anyVisible
      ? reject(command, 'out-of-range', 'Aucune paire visible de figurines n’est à portée bord-à-bord.', [SHOOTING_RULE_ID])
      : reject(command, 'not-visible', 'Aucune paire de figurines à portée ne possède une ligne de vue claire.', [GEOMETRY_RULE_ID]);
  }
  const first = groups[0];
  const blockerIds = [...new Set(first.pair.rays.flatMap((ray) => ray.blockerHits.map((hit) => hit.blockerId)))].sort();
  const evidence: BasicShootingEvidence = {
    range: {
      edgeToEdgeDistance: first.pair.distance,
      weaponRange: weapon.range,
      attackerModelId: first.pair.attackerModel.id,
      targetModelId: first.pair.targetModel.id
    },
    lineOfSight: {
      visible: true,
      reason: 'clear',
      attackerModelId: first.pair.attackerModel.id,
      targetModelId: first.pair.targetModel.id,
      ray: first.pair.clearRay?.ray,
      blockerIds
    },
    cover: first.cover,
    weapon: {
      firingModelIds: groups.map((group) => group.firingModel.id),
      weaponCount: groups.reduce((total, group) => total + group.weaponCount, 0),
      attacksPerWeapon: weapon.attacks,
      totalAttacks: groups.reduce((total, group) => total + group.weaponCount * weapon.attacks, 0)
    }
  };
  return { evidence, groups };
}

function shootingResult(resolution: Extract<ReturnType<typeof resolveBasicShooting>, { readonly accepted: true }>) {
  return {
    hitRequired: resolution.hitRequired,
    woundRequired: resolution.woundRequired,
    saveRequired: resolution.saveRequired,
    hits: resolution.hits,
    wounds: resolution.wounds,
    failedSaves: resolution.failedSaves,
    damageInflicted: resolution.damageInflicted,
    modelsDestroyed: resolution.modelsDestroyed,
    remainingModels: resolution.remainingModels,
    remainingWoundsOnDamagedModel: resolution.remainingWoundsOnDamagedModel
  };
}

export function executeBasicShootingCommand(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'resolve-basic-shooting' }>,
  environment: ShootingEnvironment
): CommandExecution {
  const validation = validateGameCommand(state, command);
  if (validation) return { accepted: false, state, rejection: validation };
  const environmentRejection = validateEnvironment(environment, command);
  if (environmentRejection) return { accepted: false, state, rejection: environmentRejection };
  if (state.shootingEnvironmentFingerprint !== environment.fingerprint) {
    return { accepted: false, state, rejection: reject(command, 'shooting-environment-mismatch', 'L’environnement de tir ne correspond pas à la session.', [TRUST_RULE_ID]) };
  }
  const plan = computeEvidence(state, command, environment);
  if ('code' in plan) return { accepted: false, state, rejection: plan };
  const { evidence } = plan;
  const attacker = state.units[command.attackerUnitId];
  const target = state.units[command.targetUnitId];
  const weapon = attacker.weaponProfiles.find((profile) => profile.id === command.weaponProfileId);
  if (!weapon || !target) throw new Error('Validated shooting subjects are missing.');
  if (!sameJson(environment.weaponProfiles[weapon.id], weapon)) {
    return { accepted: false, state, rejection: reject(command, 'shooting-weapon-profile-mismatch', 'Le profil d’arme ne correspond pas à l’environnement canonique.', [TRUST_RULE_ID]) };
  }
  let groupPrng = state.prng;
  let targetModels = target.models;
  const attackGroups: BasicShootingAttackGroup[] = [];
  const casualtyModelIds: string[] = [];
  for (const group of plan.groups) {
    const resolution = resolveBasicShooting({
      attackerId: attacker.id,
      targetId: target.id,
      weapon: { ...weapon, attacks: weapon.attacks * group.weaponCount },
      target: { toughness: target.toughness, save: target.save, woundsPerModel: target.woundsPerModel, models: targetModels, coverBallisticSkillPenalty: group.cover.ballisticSkillPenalty },
      distance: group.pair.distance,
      visible: true
    }, groupPrng);
    if (!resolution.accepted) return { accepted: false, state, rejection: reject(command, resolution.code, resolution.message, [SHOOTING_RULE_ID]) };
    const blockerIds = [...new Set(group.pair.rays.flatMap((ray) => ray.blockerHits.map((hit) => hit.blockerId)))].sort();
    attackGroups.push({
      firingModelId: group.firingModel.id,
      weaponCount: group.weaponCount,
      range: { edgeToEdgeDistance: group.pair.distance, weaponRange: weapon.range, attackerModelId: group.firingModel.id, targetModelId: group.pair.targetModel.id },
      lineOfSight: { visible: true, reason: 'clear', attackerModelId: group.firingModel.id, targetModelId: group.pair.targetModel.id, ray: group.pair.clearRay?.ray, blockerIds },
      cover: group.cover,
      hitRolls: resolution.hitRolls,
      woundRolls: resolution.woundRolls,
      saveRolls: resolution.saveRolls,
      allocations: resolution.allocations,
      rolls: resolution.steps,
      result: shootingResult(resolution),
      prngBefore: groupPrng,
      prngAfter: resolution.prngAfter
    });
    groupPrng = resolution.prngAfter;
    targetModels = resolution.targetModelsAfter;
    casualtyModelIds.push(...resolution.destroyedModelIds);
  }
  const rolls = attackGroups.flatMap((group, groupIndex) => {
    const offset = attackGroups.slice(0, groupIndex).reduce((total, previous) => total + previous.rolls.length, 0);
    return group.rolls.map((roll) => ({ ...roll, attackIndex: roll.attackIndex + offset }));
  });
  const lastResult = attackGroups.at(-1)?.result;
  if (!lastResult) throw new Error('Validated shooting plan has no attack groups.');
  const result = {
    ...lastResult,
    hitRequired: attackGroups[0].result.hitRequired,
    hits: attackGroups.reduce((total, group) => total + group.result.hits, 0),
    wounds: attackGroups.reduce((total, group) => total + group.result.wounds, 0),
    failedSaves: attackGroups.reduce((total, group) => total + group.result.failedSaves, 0),
    damageInflicted: attackGroups.reduce((total, group) => total + group.result.damageInflicted, 0),
    modelsDestroyed: casualtyModelIds.length
  };
  const event: GameEvent = {
    id: `${command.id}:0`,
    commandId: command.id,
    type: 'basic-shooting-resolved',
    attackerUnitId: attacker.id,
    targetUnitId: target.id,
    weaponProfileId: weapon.id,
    evidence,
    attackGroups,
    rolls,
    result,
    casualtyModelIds,
    targetModelsAfter: targetModels,
    shootingEnvironmentFingerprint: environment.fingerprint,
    prngBefore: state.prng,
    prngAfter: groupPrng,
    sourceRefs: uniqueSources([CORE_BASIC_RANGED_ATTACK_SOURCE, ...CORE_ATTACK_SEQUENCE_STEP_SOURCES, ...weapon.sourceRefs, ...attackGroups.flatMap((group) => group.cover.sourceRefs)])
  };
  return { accepted: true, state: unsafeReduceGameEvent(state, event), events: [event] };
}

/** Replays a journal while recomputing every spatial shooting proof from trusted facts. */
export function replayGameEventsWithShootingEnvironment(initialState: GameState, events: readonly GameEvent[], environment: ShootingEnvironment): GameState {
  if (initialState.eventLog.length > 0) throw new Error('A verified replay must start from an event-free initial state.');
  let state = initialState;
  for (const event of events) {
    if (event.type === 'session-setup' && event.session.shootingEnvironmentFingerprint !== environment.fingerprint) {
      throw new Error('Session setup does not match the trusted shooting environment fingerprint.');
    }
    if (event.type !== 'basic-shooting-resolved') {
      state = unsafeReduceGameEvent(state, event);
      continue;
    }
    const attacker = state.units[event.attackerUnitId];
    if (!attacker) throw new Error(`Verified shooting replay cannot find attacker ${event.attackerUnitId}.`);
    const command: Extract<GameCommand, { readonly type: 'resolve-basic-shooting' }> = {
      id: event.commandId,
      actorId: attacker.playerId,
      type: 'resolve-basic-shooting',
      attackerUnitId: event.attackerUnitId,
      targetUnitId: event.targetUnitId,
      weaponProfileId: event.weaponProfileId
    };
    const verified = executeBasicShootingCommand(state, command, environment);
    if (!verified.accepted || !sameJson(verified.events[0], event)) throw new Error(`Shooting event ${event.id} failed trusted spatial verification.`);
    state = verified.state;
  }
  return state;
}

export function createShootingReplayVerifier(environment: ShootingEnvironment): UnsafeSimulationReplayVerifier {
  return (initialState, events) => replayGameEventsWithShootingEnvironment(initialState, events, environment);
}

export function createShootingCommandResolver(environment: ShootingEnvironment): ShootingCommandResolver {
  return { execute: (state, command) => executeBasicShootingCommand(state, command, environment) };
}
