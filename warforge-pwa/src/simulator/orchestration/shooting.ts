import {
  declaredShootingWeaponProfileIds,
  prngStatesEqual,
  rollDice,
  validateGameCommand,
  type BasicShootingEvidence,
  type BasicShootingAttackGroup,
  type BasicShootingHitRoll,
  type BasicShootingHitStageGroup,
  type CommandExecution,
  type DecisionRequest,
  type ExtendedAllocationChoiceV1,
  type ExtendedDamageEvidenceV1,
  type PendingExtendedShootingResolutionV1,
  type PendingDuplicateWeaponAbilitySelectionV1,
  type PendingSplitFireShootingResolutionV1,
  type GameCommand,
  type GameEvent,
  type GameState,
  type LethalHitsChoiceV1,
  type PendingRerollShootingResolutionV1,
  type PendingLethalShootingResolutionV1,
  type ModelState,
  type OathOfMomentSelectionV1,
  type PhysicalModelProfileV1,
  type RuleRejection,
  type RerollChoiceV1,
  type RerollDieKeyV1,
  type SplitFireResolutionV1,
  type SplitFireRetargetChoiceV1,
  type SplitFireWeaponDeclarationV1,
  scheduleSplitFireRetarget,
  type SourceReferenceV1,
  type UnitState,
  type WeaponProfileV1
} from '../domain';
import { unsafeReduceGameEvent } from '../domain/reducer';
import type { UnsafeSimulationReplayVerifier } from '../domain/serialization';
import { executeDeploymentCommand } from './deployment';
import { executeCompleteGameMovementCommand } from './battle-movement';
import { executeDeclareChargeCommand, executeResolveChargeCommand } from './battle-charge';
import { executeBasicMeleeAllocationDecisionCommand, executeBasicMeleeCommand, executeEmptyFightCommand, executeFightMovementCommand, executePassFightWindowCommand } from './battle-fight';
import {
  evaluateLineOfSight,
  evaluateSampledCylinderLineOfSight,
  footprintDistance,
  pointInMultiPolygonArea,
  SAMPLED_CYLINDER_LINE_OF_SIGHT_POLICY,
  type Footprint,
  type LineOfSightResult,
  type MultiPolygonArea,
  type TerrainBlocker
} from '../geometry';
import { CORE_ATTACK_SEQUENCE_STEP_SOURCES, CORE_BASIC_RANGED_ATTACK_SOURCE, CORE_BENEFIT_OF_COVER_SOURCE, CORE_CHARACTERISTIC_TESTS_SOURCE, CORE_DUPLICATE_ABILITY_SOURCE, CORE_ENGAGEMENT_RANGE_SOURCE, CORE_HAZARDOUS_SOURCE, CORE_MORTAL_WOUNDS_SOURCE, CORE_NORMAL_SHOOTING_SOURCE, CORE_ONE_SHOT_SOURCE, CORE_TWIN_LINKED_SOURCE, CORE_UNIT_SELECTED_TO_SHOOT_SOURCE, OFFICIAL_APP_REROLLS_SOURCE, OFFICIAL_APP_TARGET_NO_LONGER_ELIGIBLE_SOURCE, duplicateWeaponAbilityOccurrences, evaluateExtendedSave, requiredWoundRoll, resolveAttackVolume, resolveBasicShooting, resolveExtendedDamage, resolveLethalHitsContinuation, resolveLethalHitsHitStage, resolveRerollableHitStage, resolveRerollableShootingContinuation, resolveRerollableWoundStage, weaponWithSelectedDuplicateAbility } from '../rules';
import { resolveCharacteristicModifierPlan, resolveDieRollModifierPlan } from '../rules/modifiers';
import { resolveRandomCharacteristic } from '../rules/random-characteristics';
import { executeObjectiveAwareAdvanceBattlePhaseCommand } from './objective-control';
import { executeMissionScoringCommand } from './mission-scoring';

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

/** The two source-backed Oath variants needed by the closed M4 pilot only. */
export interface OathOfMomentRuleFact {
  readonly id: 'adeptus-astartes.oath-of-moment';
  readonly variants: readonly {
    readonly playerId: string;
    readonly rerollFailedHits: true;
    readonly woundRollModifier: 0 | 1;
    readonly sourceRefs: readonly SourceReferenceV1[];
  }[];
}

/** The finite, local visibility convention accepted only for the closed M4 pilot. */
export interface SampledCylinderLineOfSightRuleFact {
  readonly id: 'm4-sampled-cylinder-los-v1';
  readonly version: '1.0.0';
}

/**
 * Fixture-only grant for the generic 01.05.02 primitive.  The source defines
 * how a reroll behaves, while this explicit fact alone grants either scope.
 */
export interface GenericRerollRuleFact {
  readonly id: 'simulator.fixture-generic-rerolls-v1';
  readonly source: SourceReferenceV1;
  readonly hitRolls: boolean;
  readonly woundRolls: boolean;
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
  readonly oathOfMoment?: OathOfMomentRuleFact;
  readonly lineOfSightPolicy?: SampledCylinderLineOfSightRuleFact;
  readonly genericRerolls?: GenericRerollRuleFact;
}

export interface ShootingEnvironmentInput {
  readonly physicalProfiles: Readonly<Record<string, PhysicalModelProfileV1>>;
  readonly weaponProfiles: Readonly<Record<string, WeaponProfileV1>>;
  readonly terrainZones: readonly ShootingTerrainZone[];
  readonly coverRules: readonly ShootingCoverRuleFact[];
  readonly oathOfMoment?: OathOfMomentRuleFact;
  readonly lineOfSightPolicy?: SampledCylinderLineOfSightRuleFact;
  readonly genericRerolls?: GenericRerollRuleFact;
}

export interface ShootingCommandResolver {
  execute(state: GameState, command: Extract<GameCommand, { readonly type: 'resolve-basic-shooting' }>): CommandExecution;
}

const SHOOTING_RULE_ID = 'core.basic-ranged-attack';
const GEOMETRY_RULE_ID = 'simulator.geometry.line-of-sight';
const TRUST_RULE_ID = 'simulator.core.trusted-shooting-environment';
const FIXTURE_ENGAGEMENT_RANGE = 508;

function reject(command: GameCommand, code: string, message: string, sourceRuleIds: readonly string[], details?: Readonly<Record<string, string | number | boolean>>): RuleRejection {
  return { commandId: command.id, code, message, sourceRuleIds, ...(details ? { details } : {}) };
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * A shared printed weapon can originate from several approved unit sheets.
 * Its execution-relevant profile is canonical here; the per-unit source list
 * is retained separately in the session and event provenance.
 */
function sameExecutableWeaponProfile(left: WeaponProfileV1, right: WeaponProfileV1): boolean {
  return left.id === right.id
    && left.displayName === right.displayName
    && (left.weaponType ?? 'ranged') === (right.weaponType ?? 'ranged')
    && left.range === right.range
    && left.attacks === right.attacks
    && left.ballisticSkill === right.ballisticSkill
    && left.strength === right.strength
    && left.armourPenetration === right.armourPenetration
    && left.damage === right.damage
    && left.randomAttacks === right.randomAttacks
    && left.randomDamage === right.randomDamage
    && sameJson(left.modifierPlan ?? {}, right.modifierPlan ?? {})
    && sameJson(left.attackVolumeAbilities ?? [], right.attackVolumeAbilities ?? [])
    && sameJson(left.weaponKeywords ?? [], right.weaponKeywords ?? []);
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

export function isTrustedShootingEnvironment(environment: ShootingEnvironment): boolean {
  if (environment[SHOOTING_ENVIRONMENT_BRAND] !== true) return false;
  return environment.fingerprint === createShootingEnvironment({
    physicalProfiles: environment.physicalProfiles,
    weaponProfiles: environment.weaponProfiles,
    terrainZones: environment.terrainZones,
    coverRules: environment.coverRules,
    oathOfMoment: environment.oathOfMoment,
    lineOfSightPolicy: environment.lineOfSightPolicy,
    genericRerolls: environment.genericRerolls
  }).fingerprint;
}

function sourceReferenceKey(reference: SourceReferenceV1): string {
  return JSON.stringify({ sourceId: reference.sourceId, version: reference.version, effectiveFrom: reference.effectiveFrom, page: reference.page, reference: reference.reference });
}

function uniqueSources(references: readonly SourceReferenceV1[]): readonly SourceReferenceV1[] {
  return [...new Map(references.map((reference) => [sourceReferenceKey(reference), reference])).values()];
}

function validateEnvironment(environment: ShootingEnvironment, command: GameCommand): RuleRejection | null {
  if (!isTrustedShootingEnvironment(environment)) return reject(command, 'invalid-shooting-environment', 'L’environnement de tir doit provenir de la fabrique canonique et correspondre à son empreinte.', [TRUST_RULE_ID]);
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
  if (environment.oathOfMoment !== undefined) {
    const oath = environment.oathOfMoment;
    if (oath.id !== 'adeptus-astartes.oath-of-moment'
      || oath.variants.length !== 2
      || new Set(oath.variants.map((variant) => variant.playerId)).size !== oath.variants.length
      || oath.variants.some((variant) => !variant.playerId.trim() || variant.rerollFailedHits !== true || ![0, 1].includes(variant.woundRollModifier) || variant.sourceRefs.length === 0)) {
      return reject(command, 'invalid-oath-of-moment-fact', 'Le fait Oath of Moment doit déclarer exactement deux variantes sourcées du pilote.', ['adeptus-astartes.oath-of-moment']);
    }
  }
  if (environment.lineOfSightPolicy !== undefined
    && (environment.lineOfSightPolicy.id !== SAMPLED_CYLINDER_LINE_OF_SIGHT_POLICY.id
      || environment.lineOfSightPolicy.version !== SAMPLED_CYLINDER_LINE_OF_SIGHT_POLICY.version)) {
    return reject(command, 'invalid-line-of-sight-policy', 'La convention de ligne de vue M4 doit être la politique échantillonnée versionnée.', [GEOMETRY_RULE_ID]);
  }
  if (environment.genericRerolls !== undefined) {
    const rerolls = environment.genericRerolls;
    if (rerolls.id !== 'simulator.fixture-generic-rerolls-v1'
      || !sameJson(rerolls.source, OFFICIAL_APP_REROLLS_SOURCE)
      || typeof rerolls.hitRolls !== 'boolean'
      || typeof rerolls.woundRolls !== 'boolean'
      || (!rerolls.hitRolls && !rerolls.woundRolls)) {
      return reject(command, 'invalid-generic-reroll-fact', 'Le fait de relance générique doit être exactement la fixture sourcée 01.05.02 et autoriser au moins une portée.', ['simulator.fixture-generic-rerolls-v1']);
    }
  }
  return null;
}

function attackModifiersFor(
  state: GameState,
  attacker: UnitState,
  target: UnitState,
  environment: ShootingEnvironment,
  command: GameCommand
): BasicShootingEvidence['attackModifiers'] | RuleRejection {
  if (!environment.oathOfMoment) {
    return { rerollFailedHits: false, woundRollModifier: 0, sourceRuleIds: [], sourceRefs: [] };
  }
  const selection = state.oathOfMomentSelections[attacker.playerId];
  if (!selection || selection.round !== state.round) {
    return reject(command, 'oath-selection-required', 'Le joueur doit sélectionner sa cible Oath of Moment avant de tirer.', ['adeptus-astartes.oath-of-moment']);
  }
  if (selection.targetUnitId !== target.id) {
    return { rerollFailedHits: false, woundRollModifier: 0, sourceRuleIds: [], sourceRefs: [] };
  }
  return {
    rerollFailedHits: selection.rerollFailedHits,
    woundRollModifier: selection.woundRollModifier,
    sourceRuleIds: [selection.ruleId],
    sourceRefs: selection.sourceRefs
  };
}

function selectionFor(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'select-oath-of-moment-target' }>,
  environment: ShootingEnvironment
): OathOfMomentSelectionV1 | RuleRejection {
  const oath = environment.oathOfMoment;
  const variant = oath?.variants.find((candidate) => candidate.playerId === command.actorId);
  if (!oath || !variant) return reject(command, 'unsupported-oath-of-moment-player', 'Aucune variante Oath of Moment couverte ne correspond à ce joueur.', ['adeptus-astartes.oath-of-moment']);
  return {
    ruleId: oath.id,
    playerId: command.actorId,
    targetUnitId: command.targetUnitId,
    round: state.round,
    rerollFailedHits: variant.rerollFailedHits,
    woundRollModifier: variant.woundRollModifier,
    sourceRefs: variant.sourceRefs
  };
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

/**
 * Fixtures all stand on the same ground plane, so their vertical separation is
 * zero.  The full 03.04 vertical model is deferred with elevated placement;
 * this guard nevertheless uses exact footprints and the canonical 2" horizontal
 * range instead of trusting a UI flag.
 */
function fixtureUnitIsEngaged(
  state: GameState,
  unit: UnitState,
  environment: ShootingEnvironment,
  command: GameCommand
): boolean | RuleRejection {
  const ownModels = activeModels(state, unit);
  for (const opposingUnit of Object.values(state.units)) {
    if (opposingUnit.playerId === unit.playerId) continue;
    for (const ownModel of ownModels) {
      const ownProfile = profileFor(environment, ownModel, command);
      if ('code' in ownProfile) return ownProfile;
      for (const opposingModel of activeModels(state, opposingUnit)) {
        const opposingProfile = profileFor(environment, opposingModel, command);
        if ('code' in opposingProfile) return opposingProfile;
        if (footprintDistance(footprintForModel(ownModel, ownProfile), footprintForModel(opposingModel, opposingProfile)) <= FIXTURE_ENGAGEMENT_RANGE) {
          return true;
        }
      }
    }
  }
  return false;
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

function sampledCylinderRays(
  attacker: ModelState,
  attackerProfile: PhysicalModelProfileV1,
  target: ModelState,
  targetProfile: PhysicalModelProfileV1,
  blockers: readonly TerrainBlocker[]
): readonly LineOfSightResult[] {
  if (attackerProfile.baseShape.kind !== 'circle' || targetProfile.baseShape.kind !== 'circle') {
    throw new Error('La convention LoS M4 échantillonnée exige deux hitboxes cylindriques circulaires.');
  }
  const result = evaluateSampledCylinderLineOfSight(
    { center: { ...attacker.position, z: 0 }, radius: attackerProfile.baseShape.radius, height: attackerProfile.height },
    { center: { ...target.position, z: 0 }, radius: targetProfile.baseShape.radius, height: targetProfile.height },
    blockers
  );
  if (result.visible) {
    const witness = result.firstClearWitness;
    return [{ visible: true, reason: 'clear', ray: witness.ray, blockerHits: witness.blockerHits }];
  }
  const evidence = result.firstBlockedEvidence;
  return [{
    visible: false,
    reason: 'blocked',
    ray: evidence.ray,
    blockerHits: evidence.blockerHits,
    firstBlocker: evidence.firstBlocker
  }];
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
        const rays: readonly LineOfSightResult[] = environment.lineOfSightPolicy
          ? sampledCylinderRays(attackerModel, attackerProfile, targetModel, targetProfile, blockers)
          : attackerProfile.visibilityPoints.flatMap((attackerPoint) => {
            const attackerOffset = rotateOffset(attackerPoint.x, attackerPoint.y, attackerModel.orientationDegrees);
            return targetProfile.visibilityPoints.map((targetPoint) => {
              const targetOffset = rotateOffset(targetPoint.x, targetPoint.y, targetModel.orientationDegrees);
              return evaluateLineOfSight({
                from: { x: attackerModel.position.x + attackerOffset.x, y: attackerModel.position.y + attackerOffset.y, z: attackerPoint.z },
                to: { x: targetModel.position.x + targetOffset.x, y: targetModel.position.y + targetOffset.y, z: targetPoint.z }
              }, blockers);
            });
          });
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
  // Catalog keywords retain their display casing (e.g. "Infantry"), while
  // rule facts use their canonical uppercase token.  Comparison is semantic;
  // neither the source data nor the event provenance is rewritten.
  const targetKeywordTokens = new Set(target.keywords.map((keyword) => keyword.trim().toUpperCase()));
  const qualifyingKeyword = rule.branches[0].qualifyingKeywords.some((keyword) => targetKeywordTokens.has(keyword));
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
  readonly weapon: WeaponProfileV1;
  readonly weaponCount: number;
  /** Present only when an assignment's random-A weapons are split by instance. */
  readonly weaponInstanceIndex?: number;
  readonly effectiveRange: number;
  readonly rangeModifierSourceRefs: readonly SourceReferenceV1[];
  readonly pair: ModelPairEvidence;
  readonly cover: BasicShootingEvidence['cover'];
}

interface ShootingPlan {
  readonly attackModifiers: BasicShootingEvidence['attackModifiers'];
  readonly weaponProfileIds: readonly string[];
  readonly groups: readonly PlannedAttackGroup[];
}

/**
 * Rule 02.02.03 generates every random A for identical carried weapons before
 * any hit roll. This preparation is deterministic and contains no UI input.
 */
interface PreparedAttackGroup {
  readonly group: PlannedAttackGroup;
  readonly randomAttacks?: BasicShootingAttackGroup['randomAttacks'];
  readonly attackVolume: BasicShootingAttackGroup['attackVolume'];
  readonly ballisticSkill: number;
  readonly hitRollModifiers?: NonNullable<WeaponProfileV1['modifierPlan']>['hitRoll'];
  readonly modifierSourceRefs: readonly SourceReferenceV1[];
}

type WeaponCharacteristic = 'range' | 'attacks' | 'ballisticSkill';

function resolveWeaponCharacteristic(
  weapon: WeaponProfileV1,
  characteristic: WeaponCharacteristic,
  baseValue: number,
  command: Extract<GameCommand, { readonly type: 'resolve-basic-shooting' }>
): { readonly value: number; readonly sourceRefs: readonly SourceReferenceV1[] } | RuleRejection {
  const modifierSet = weapon.modifierPlan?.[characteristic];
  if (!modifierSet) return { value: baseValue, sourceRefs: [] };
  const mappedCharacteristic = characteristic === 'ballisticSkill' ? 'ballistic-skill' : characteristic;
  const resolution = resolveCharacteristicModifierPlan({ characteristic: mappedCharacteristic, baseValue, ...modifierSet });
  if (!resolution.accepted) return reject(command, resolution.code, resolution.message, [SHOOTING_RULE_ID]);
  return { value: resolution.value, sourceRefs: resolution.sourceRefs };
}

function hitRollModifierPlanFor(
  weapon: WeaponProfileV1,
  command: Extract<GameCommand, { readonly type: 'resolve-basic-shooting' }>
): { readonly plan?: NonNullable<WeaponProfileV1['modifierPlan']>['hitRoll']; readonly sourceRefs: readonly SourceReferenceV1[] } | RuleRejection {
  const plan = weapon.modifierPlan?.hitRoll;
  if (!plan) return { sourceRefs: [] };
  const validation = resolveDieRollModifierPlan({ rollKind: 'hit', unmodifiedRoll: 1, sides: 6, ...plan });
  if (!validation.accepted) return reject(command, validation.code, validation.message, [SHOOTING_RULE_ID]);
  return { plan, sourceRefs: validation.sourceRefs };
}

function computeEvidence(state: GameState, command: Extract<GameCommand, { readonly type: 'resolve-basic-shooting' }>, environment: ShootingEnvironment): ShootingPlan | RuleRejection {
  const attacker = state.units[command.attackerUnitId];
  const target = state.units[command.targetUnitId];
  const weaponProfileIds = declaredShootingWeaponProfileIds(command);
  const weapons = attacker ? weaponProfileIds.map((weaponProfileId) => attacker.weaponProfiles.find((profile) => profile.id === weaponProfileId)) : [];
  if (!attacker || !target || weapons.some((weapon) => !weapon)) return reject(command, 'unknown-shooting-subject', 'Les sujets de tir validés sont introuvables.', [SHOOTING_RULE_ID]);
  const attackModifiers = attackModifiersFor(state, attacker, target, environment, command);
  if ('code' in attackModifiers) return attackModifiers;
  const targetModels = activeModels(state, target);
  if (targetModels.length === 0) return reject(command, 'no-active-models', 'Le tir exige un porteur actif et une cible active.', [SHOOTING_RULE_ID]);
  const groups: PlannedAttackGroup[] = [];
  for (const weapon of weapons) {
    if (!weapon) throw new Error('Validated weapon declaration is missing.');
    const carriers = firingModels(state, attacker, weapon.id);
    if (carriers.models.length === 0 || carriers.weaponCount === 0) return reject(command, 'no-active-models', 'Le tir exige un porteur actif pour chaque profil déclaré.', [SHOOTING_RULE_ID]);
    const pairs = modelPairs(command, carriers.models, targetModels, environment);
    if ('code' in pairs) return pairs;
    const range = resolveWeaponCharacteristic(weapon, 'range', weapon.range, command);
    if ('code' in range) return range;
    const validGroups: PlannedAttackGroup[] = [];
    for (const firingModel of carriers.models) {
      const carrierPairs = pairs.filter((pair) => pair.attackerModel.id === firingModel.id);
      const pair = carrierPairs.find((candidate) => candidate.distance <= range.value && candidate.clearRay !== undefined);
      const assignment = attacker.weaponAssignments.find((candidate) => candidate.modelId === firingModel.id && candidate.weaponProfileId === weapon.id);
      if (!pair || !assignment) continue;
      const shared = {
        firingModel,
        weapon,
        effectiveRange: range.value,
        rangeModifierSourceRefs: range.sourceRefs,
        pair,
        cover: coverEvidence(target, targetModels, carrierPairs, environment)
      };
      // 02.02.03 requires an independently generated A characteristic for
      // every physical weapon before identical attacks may be grouped.
      if (weapon.randomAttacks !== undefined) {
        for (let weaponInstanceIndex = 0; weaponInstanceIndex < assignment.quantity; weaponInstanceIndex += 1) {
          validGroups.push({ ...shared, weaponCount: 1, weaponInstanceIndex });
        }
      } else {
        validGroups.push({ ...shared, weaponCount: assignment.quantity });
      }
    }
    if (validGroups.length === 0) {
      const anyVisible = pairs.some((pair) => pair.clearRay !== undefined);
      return anyVisible
        ? reject(command, 'out-of-range', 'Aucune paire visible de figurines n’est à portée bord-à-bord.', [SHOOTING_RULE_ID])
        : reject(command, 'not-visible', 'Aucune paire de figurines à portée ne possède une ligne de vue claire.', [GEOMETRY_RULE_ID]);
    }
    groups.push(...validGroups);
  }
  return { attackModifiers, weaponProfileIds, groups };
}

/**
 * T05.2 deliberately models declarations at the physical-weapon level.  It
 * does not reuse the legacy profile aggregate, because an identical printed
 * profile can be sent to a different target by each individual carrier.
 */
interface PlannedSplitFireAssignment {
  readonly declaration: SplitFireWeaponDeclarationV1;
  readonly weapon: WeaponProfileV1;
  readonly target: UnitState;
  readonly pair: ModelPairEvidence;
  readonly cover: BasicShootingEvidence['cover'];
}

function splitFireAssignmentPlan(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'resolve-split-fire' }>,
  environment: ShootingEnvironment,
  declaration: SplitFireWeaponDeclarationV1
): PlannedSplitFireAssignment | RuleRejection {
  const attacker = state.units[command.attackerUnitId];
  if (!attacker) return reject(command, 'unknown-unit', 'L’unité attaquante du tir partagé est introuvable.', [SHOOTING_RULE_ID]);
  const target = state.units[declaration.targetUnitId];
  const weapon = attacker.weaponProfiles.find((profile) => profile.id === declaration.weaponProfileId);
  const firingModel = state.models[declaration.firingModelId];
  const assignment = attacker.weaponAssignments.find((entry) => entry.modelId === declaration.firingModelId && entry.weaponProfileId === declaration.weaponProfileId);
  if (!target || !weapon || !firingModel || !firingModel.active || !assignment || declaration.weaponInstanceIndex < 0 || declaration.weaponInstanceIndex >= assignment.quantity) {
    return reject(command, 'unknown-shooting-subject', 'Une instance ou cible déclarée n’existe plus dans l’état autoritaire.', [SHOOTING_RULE_ID]);
  }
  if (weapon.weaponType === 'melee') return reject(command, 'melee-weapon-cannot-shoot', 'Une arme de mêlée ne peut pas être déclarée dans un tir partagé.', [SHOOTING_RULE_ID]);
  if (attacker.coverageSubject?.subjectType === 'unit' || target.coverageSubject?.subjectType === 'unit' || attacker.extendedDefence !== undefined || target.extendedDefence !== undefined) {
    return reject(command, 'unsupported-split-fire-fixture-scope', 'Le tir partagé est limité aux unités de fixture simples et n’active aucun roster M4.', [SHOOTING_RULE_ID]);
  }
  if (target.playerId === attacker.playerId || !target.models.some((model) => model.active)) {
    return reject(command, 'invalid-target-unit', 'Chaque instance doit cibler une unité ennemie active.', [SHOOTING_RULE_ID], { targetUnitId: target.id });
  }
  if (weapon.randomAttacks !== undefined || weapon.randomDamage !== undefined || weapon.modifierPlan !== undefined
    || (weapon.attackVolumeAbilities?.length ?? 0) !== 0 || (weapon.weaponKeywords?.length ?? 0) !== 0) {
    return reject(command, 'unsupported-split-fire-weapon', 'Le tir partagé T05.2 ne couvre pour l’instant que des armes de fixture à caractéristiques fixes, sans mot-clé ni profil alternatif.', [SHOOTING_RULE_ID], { weaponProfileId: weapon.id });
  }
  const canonicalWeapon = environment.weaponProfiles[weapon.id];
  if (!canonicalWeapon || !sameExecutableWeaponProfile(canonicalWeapon, weapon)) {
    return reject(command, 'shooting-weapon-profile-mismatch', 'Le profil d’arme ne correspond pas à l’environnement canonique.', [TRUST_RULE_ID]);
  }
  const attackerEngaged = fixtureUnitIsEngaged(state, attacker, environment, command);
  if (typeof attackerEngaged === 'object') return attackerEngaged;
  if (attackerEngaged) return reject(command, 'attacker-engaged', 'Le tir normal partagé exige une unité attaquante non engagée.', [SHOOTING_RULE_ID], { unitId: attacker.id });
  const targetEngaged = fixtureUnitIsEngaged(state, target, environment, command);
  if (typeof targetEngaged === 'object') return targetEngaged;
  if (targetEngaged) return reject(command, 'target-engaged', 'Une cible de tir partagé doit être non engagée.', [SHOOTING_RULE_ID], { targetUnitId: target.id });
  const targets = activeModels(state, target);
  const pairs = modelPairs(command, [firingModel], targets, environment);
  if ('code' in pairs) return pairs;
  const pair = pairs.find((candidate) => candidate.distance <= weapon.range && candidate.clearRay !== undefined);
  if (!pair) {
    return pairs.some((candidate) => candidate.clearRay !== undefined)
      ? reject(command, 'out-of-range', 'Une instance du tir partagé ne possède aucune cible visible à portée.', [SHOOTING_RULE_ID], { assignmentId: declaration.id })
      : reject(command, 'not-visible', 'Une instance du tir partagé ne possède aucune ligne de vue claire vers sa cible.', [GEOMETRY_RULE_ID], { assignmentId: declaration.id });
  }
  return { declaration, weapon, target, pair, cover: coverEvidence(target, targets, pairs, environment) };
}

function splitFirePlan(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'resolve-split-fire' }>,
  environment: ShootingEnvironment
): readonly PlannedSplitFireAssignment[] | RuleRejection {
  const byId = new Map(command.assignments.map((assignment) => [assignment.id, assignment]));
  const plans: PlannedSplitFireAssignment[] = [];
  for (const assignmentId of command.resolutionOrder) {
    const declaration = byId.get(assignmentId);
    if (!declaration) return reject(command, 'invalid-split-fire-order', 'L’ordre de tir partagé référence une arme non déclarée.', [SHOOTING_RULE_ID]);
    const plan = splitFireAssignmentPlan(state, command, environment, declaration);
    if ('code' in plan) return plan;
    plans.push(plan);
  }
  return plans;
}

function splitFireAttackGroup(
  plan: PlannedSplitFireAssignment,
  attackVolume: BasicShootingAttackGroup['attackVolume'],
  resolution: Extract<ReturnType<typeof resolveBasicShooting>, { readonly accepted: true }>,
  prngBefore: GameState['prng']
): BasicShootingAttackGroup {
  const blockerIds = [...new Set(plan.pair.rays.flatMap((ray) => ray.blockerHits.map((hit) => hit.blockerId)))].sort();
  return {
    firingModelId: plan.declaration.firingModelId,
    weaponProfileId: plan.declaration.weaponProfileId,
    weaponInstanceIndex: plan.declaration.weaponInstanceIndex,
    weaponCount: 1,
    attackVolume,
    range: {
      edgeToEdgeDistance: plan.pair.distance,
      weaponRange: plan.weapon.range,
      attackerModelId: plan.declaration.firingModelId,
      targetModelId: plan.pair.targetModel.id
    },
    lineOfSight: {
      visible: true,
      reason: 'clear',
      attackerModelId: plan.declaration.firingModelId,
      targetModelId: plan.pair.targetModel.id,
      ray: plan.pair.clearRay?.ray,
      blockerIds
    },
    cover: plan.cover,
    hitRolls: resolution.hitRolls,
    woundRolls: resolution.woundRolls,
    saveRolls: resolution.saveRolls,
    allocations: resolution.allocations,
    rolls: resolution.steps,
    result: shootingResult(resolution),
    prngBefore,
    prngAfter: resolution.prngAfter
  };
}

function derivedStateAfterSplitResults(state: GameState, resolutions: readonly SplitFireResolutionV1[]): GameState {
  const units: Record<string, UnitState> = { ...state.units };
  const models: Record<string, ModelState> = { ...state.models };
  for (const resolution of resolutions) {
    const target = units[resolution.declaration.targetUnitId];
    if (!target) continue;
    units[target.id] = { ...target, models: resolution.targetModelsAfter };
    for (const casualtyModelId of resolution.casualtyModelIds) {
      const model = models[casualtyModelId];
      if (model) models[casualtyModelId] = { ...model, active: false };
    }
  }
  return { ...state, units, models };
}

function resolveSplitFirePlan(
  attacker: UnitState,
  plan: PlannedSplitFireAssignment,
  currentTargetModels: readonly UnitState['models'][number][],
  prng: GameState['prng'],
  command: Extract<GameCommand, { readonly type: 'resolve-split-fire' }>
): SplitFireResolutionV1 | RuleRejection {
  const attackVolume = resolveAttackVolume(plan.weapon, plan.pair.distance, currentTargetModels.filter((model) => model.active).length);
  if (!attackVolume.accepted) return reject(command, attackVolume.code, attackVolume.message, [SHOOTING_RULE_ID]);
  const resolution = resolveBasicShooting({
    attackerId: attacker.id,
    targetId: plan.target.id,
    weapon: { ...plan.weapon, attacks: attackVolume.breakdown.attacksPerWeapon },
    target: {
      toughness: plan.target.toughness,
      save: plan.target.save,
      woundsPerModel: plan.target.woundsPerModel,
      models: currentTargetModels,
      keywords: plan.target.keywords,
      coverBallisticSkillPenalty: plan.cover.ballisticSkillPenalty
    },
    distance: plan.pair.distance,
    visible: true,
    attackModifiers: { rerollFailedHits: false, woundRollModifier: 0, sourceRefs: [] }
  }, prng);
  if (!resolution.accepted) return reject(command, resolution.code, resolution.message, [SHOOTING_RULE_ID]);
  return {
    declaration: plan.declaration,
    outcome: 'resolved',
    attackGroup: splitFireAttackGroup(plan, attackVolume.breakdown, resolution, prng),
    casualtyModelIds: resolution.destroyedModelIds,
    targetModelsAfter: resolution.targetModelsAfter
  };
}

function splitFireSourceRefs(plans: readonly PlannedSplitFireAssignment[], resolutions: readonly SplitFireResolutionV1[]): readonly SourceReferenceV1[] {
  return uniqueSources([
    CORE_BASIC_RANGED_ATTACK_SOURCE,
    ...CORE_ATTACK_SEQUENCE_STEP_SOURCES,
    CORE_UNIT_SELECTED_TO_SHOOT_SOURCE,
    CORE_NORMAL_SHOOTING_SOURCE,
    CORE_ENGAGEMENT_RANGE_SOURCE,
    ...plans.flatMap((plan) => plan.weapon.sourceRefs),
    ...resolutions.flatMap((resolution) => resolution.attackGroup?.attackVolume.sourceRefs ?? []),
    ...resolutions.flatMap((resolution) => resolution.attackGroup?.cover.sourceRefs ?? [])
  ]);
}

function retargetOptionTargetIds(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'resolve-split-fire' }>,
  environment: ShootingEnvironment,
  declaration: SplitFireWeaponDeclarationV1
): readonly string[] {
  const attacker = state.units[command.attackerUnitId];
  if (!attacker) return [];
  return Object.values(state.units)
    .filter((target) => target.playerId !== attacker.playerId && target.models.some((model) => model.active))
    .map((target) => target.id)
    .sort()
    .filter((targetUnitId) => {
      const plan = splitFireAssignmentPlan(state, command, environment, { ...declaration, targetUnitId });
      return !('code' in plan);
    });
}

function splitFireRetargetRequest(resolution: PendingSplitFireShootingResolutionV1, playerId: string): DecisionRequest {
  return {
    id: `${resolution.originCommandId}:split-fire:retarget:${resolution.nextResolutionIndex}`,
    kind: 'split-fire-retarget',
    playerId,
    prompt: 'La cible choisie n’a plus de figurine active : choisissez une nouvelle cible légale ou abandonnez cette instance.',
    options: [
      { id: 'abandon', label: 'Abandonner cette instance' },
      ...resolution.retargetOptionTargetUnitIds.map((targetUnitId) => ({ id: targetUnitId, label: targetUnitId }))
    ],
    sourceRuleIds: ['core.attack-target-no-longer-eligible']
  };
}

/** Builds the legacy aggregate evidence only after each carrier's A value is known. */
function evidenceFromAttackGroups(groups: readonly BasicShootingAttackGroup[], attackModifiers: BasicShootingEvidence['attackModifiers']): BasicShootingEvidence {
  const first = groups[0];
  if (!first) throw new Error('A validated shooting event requires at least one attack group.');
  const primaryGroups = groups.filter((group) => group.weaponProfileId === first.weaponProfileId);
  const blockerIds = first.lineOfSight.blockerIds;
  return {
    range: {
      edgeToEdgeDistance: first.range.edgeToEdgeDistance,
      weaponRange: first.range.weaponRange,
      attackerModelId: first.range.attackerModelId,
      targetModelId: first.range.targetModelId
    },
    lineOfSight: {
      visible: true,
      reason: 'clear',
      attackerModelId: first.lineOfSight.attackerModelId,
      targetModelId: first.lineOfSight.targetModelId,
      ray: first.lineOfSight.ray,
      blockerIds
    },
    cover: first.cover,
    attackModifiers,
    weapon: {
      firingModelIds: [...new Set(primaryGroups.map((group) => group.firingModelId))],
      weaponCount: primaryGroups.reduce((total, group) => total + group.weaponCount, 0),
      attacksPerWeapon: new Set(primaryGroups.map((group) => group.attackVolume.attacksPerWeapon)).size === 1
        ? first.attackVolume.attacksPerWeapon
        : null,
      totalAttacks: primaryGroups.reduce((total, group) => total + group.weaponCount * group.attackVolume.attacksPerWeapon, 0)
    }
  };
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

interface LethalFixtureContext {
  readonly attacker: UnitState;
  readonly target: UnitState;
  readonly weapon: WeaponProfileV1;
  readonly plan: ShootingPlan;
  readonly group: PlannedAttackGroup;
  readonly attackVolume: BasicShootingAttackGroup['attackVolume'];
}

function lethalScopeRejection(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'resolve-basic-shooting' }>,
  plan: ShootingPlan,
  attacker: UnitState,
  target: UnitState,
  weapon: WeaponProfileV1
): RuleRejection | null {
  const carriers = firingModels(state, attacker, weapon.id);
  const lethalOnly = weapon.weaponKeywords?.length === 1 && weapon.weaponKeywords[0]?.kind === 'lethal-hits';
  const fixtureOnly = attacker.coverageSubject?.subjectType !== 'unit' && target.coverageSubject?.subjectType !== 'unit';
  if (!fixtureOnly || plan.weaponProfileIds.length !== 1 || plan.groups.length !== 1
    || carriers.models.length !== 1 || carriers.weaponCount !== 1 || plan.groups[0]?.weaponCount !== 1
    || !lethalOnly || weapon.randomAttacks !== undefined || weapon.randomDamage !== undefined
    || weapon.modifierPlan !== undefined || (weapon.attackVolumeAbilities?.length ?? 0) !== 0
    || plan.attackModifiers.rerollFailedHits || plan.attackModifiers.woundRollModifier !== 0) {
    return reject(command, 'unsupported-lethal-hits-fixture-scope', '[TOUCHES FATALES] est limité à la fixture : un profil, un porteur, une instance, A/D fixes et aucune autre interaction de tir.', ['core.weapon-ability.lethal-hits']);
  }
  return null;
}

function buildLethalFixtureContext(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'resolve-basic-shooting' }>,
  plan: ShootingPlan
): LethalFixtureContext | RuleRejection {
  const attacker = state.units[command.attackerUnitId];
  const target = state.units[command.targetUnitId];
  const weapon = plan.weaponProfileIds.length === 1 ? attacker?.weaponProfiles.find((profile) => profile.id === plan.weaponProfileIds[0]) : undefined;
  if (!attacker || !target || !weapon || !weapon.weaponKeywords?.some((keyword) => keyword.kind === 'lethal-hits')) {
    return reject(command, 'unknown-shooting-subject', 'Les sujets [TOUCHES FATALES] validés sont introuvables.', [SHOOTING_RULE_ID]);
  }
  const scopeRejection = lethalScopeRejection(state, command, plan, attacker, target, weapon);
  if (scopeRejection) return scopeRejection;
  const group = plan.groups[0];
  const attackVolume = resolveAttackVolume(weapon, group.pair.distance, target.models.filter((model) => model.active).length);
  if (!attackVolume.accepted) return reject(command, attackVolume.code, attackVolume.message, [SHOOTING_RULE_ID]);
  return { attacker, target, weapon, plan, group, attackVolume: attackVolume.breakdown };
}

function lethalRequest(context: LethalFixtureContext) {
  return {
    attackerId: context.attacker.id,
    targetId: context.target.id,
    weapon: {
      ...context.weapon,
      range: context.group.effectiveRange,
      attacks: context.attackVolume.attacksPerWeapon,
      ballisticSkill: context.weapon.ballisticSkill
    },
    target: {
      toughness: context.target.toughness,
      save: context.target.save,
      woundsPerModel: context.target.woundsPerModel,
      models: context.target.models,
      keywords: context.target.keywords,
      coverBallisticSkillPenalty: context.group.cover.ballisticSkillPenalty
    },
    distance: context.group.pair.distance,
    visible: true,
    attackModifiers: context.plan.attackModifiers
  } as const;
}

function lethalHitStageGroup(context: LethalFixtureContext, stage: Extract<ReturnType<typeof resolveLethalHitsHitStage>, { readonly accepted: true }>, prngBefore: GameState['prng']): BasicShootingHitStageGroup {
  const blockerIds = [...new Set(context.group.pair.rays.flatMap((ray) => ray.blockerHits.map((hit) => hit.blockerId)))].sort();
  return {
    firingModelId: context.group.firingModel.id,
    weaponProfileId: context.weapon.id,
    weaponCount: 1,
    attackVolume: context.attackVolume,
    range: { edgeToEdgeDistance: context.group.pair.distance, weaponRange: context.group.effectiveRange, attackerModelId: context.group.firingModel.id, targetModelId: context.group.pair.targetModel.id },
    lineOfSight: { visible: true, reason: 'clear', attackerModelId: context.group.firingModel.id, targetModelId: context.group.pair.targetModel.id, ray: context.group.pair.clearRay?.ray, blockerIds },
    cover: context.group.cover,
    hitRolls: stage.hitRolls,
    hitRequired: stage.hitRequired,
    woundRequired: stage.woundRequired,
    saveRequired: stage.saveRequired,
    prngBefore,
    prngAfter: stage.prngAfter
  };
}

function lethalDecision(resolution: PendingLethalShootingResolutionV1, playerId: string) {
  const key = resolution.criticalHitKeys[resolution.choices.length];
  if (!key) throw new Error('A lethal decision requires an unresolved critical hit.');
  return {
    id: `${resolution.originCommandId}:lethal:${key.groupIndex}:${key.attackIndex}`,
    kind: 'lethal-hits-choice',
    playerId,
    prompt: '[TOUCHES FATALES] : choisir la résolution de cette touche critique.',
    options: [
      { id: 'auto-wound', label: 'Blesser automatiquement' },
      { id: 'roll-to-wound', label: 'Faire le jet de blessure' }
    ],
    sourceRuleIds: ['core.weapon-ability.lethal-hits']
  } as const;
}

function fullLethalAttackGroup(
  stageGroup: BasicShootingHitStageGroup,
  resolution: Extract<ReturnType<typeof resolveLethalHitsContinuation>, { readonly accepted: true }>
): BasicShootingAttackGroup {
  return {
    firingModelId: stageGroup.firingModelId,
    weaponProfileId: stageGroup.weaponProfileId,
    weaponCount: stageGroup.weaponCount,
    attackVolume: stageGroup.attackVolume,
    range: stageGroup.range,
    lineOfSight: stageGroup.lineOfSight,
    cover: stageGroup.cover,
    hitRolls: resolution.hitRolls,
    woundRolls: resolution.woundRolls,
    saveRolls: resolution.saveRolls,
    allocations: resolution.allocations,
    rolls: resolution.steps,
    result: shootingResult(resolution),
    prngBefore: stageGroup.prngBefore,
    prngAfter: resolution.prngAfter
  };
}

function fullLethalEvent(
  type: 'basic-shooting-resolved' | 'basic-shooting-completed',
  id: string,
  commandId: string,
  context: LethalFixtureContext,
  stageGroup: BasicShootingHitStageGroup,
  resolution: Extract<ReturnType<typeof resolveLethalHitsContinuation>, { readonly accepted: true }>,
  prngBefore: GameState['prng'],
  shootingEnvironmentFingerprint: string
): Extract<GameEvent, { readonly type: 'basic-shooting-resolved' | 'basic-shooting-completed' }> {
  const attackGroup = fullLethalAttackGroup(stageGroup, resolution);
  const evidence = evidenceFromAttackGroups([attackGroup], context.plan.attackModifiers);
  return {
    id,
    commandId,
    type,
    attackerUnitId: context.attacker.id,
    targetUnitId: context.target.id,
    weaponProfileId: context.weapon.id,
    ...(type === 'basic-shooting-resolved' ? { weaponProfileIds: context.plan.weaponProfileIds } : {}),
    evidence,
    attackGroups: [attackGroup],
    rolls: attackGroup.rolls,
    result: attackGroup.result,
    casualtyModelIds: resolution.destroyedModelIds,
    targetModelsAfter: resolution.targetModelsAfter,
    shootingEnvironmentFingerprint,
    prngBefore,
    prngAfter: resolution.prngAfter,
    sourceRefs: uniqueSources([
      CORE_BASIC_RANGED_ATTACK_SOURCE,
      ...CORE_ATTACK_SEQUENCE_STEP_SOURCES,
      CORE_UNIT_SELECTED_TO_SHOOT_SOURCE,
      ...context.weapon.sourceRefs,
      ...(context.weapon.weaponKeywords?.map((keyword) => keyword.source) ?? []),
      ...attackGroup.attackVolume.sourceRefs,
      ...attackGroup.cover.sourceRefs,
      ...context.plan.attackModifiers.sourceRefs
    ])
  };
}

function executeLethalFixtureShooting(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'resolve-basic-shooting' }>,
  environment: ShootingEnvironment,
  plan: ShootingPlan
): CommandExecution {
  const context = buildLethalFixtureContext(state, command, plan);
  if ('code' in context) return { accepted: false, state, rejection: context };
  const hitStage = resolveLethalHitsHitStage(lethalRequest(context), state.prng);
  if (!hitStage.accepted) return { accepted: false, state, rejection: reject(command, hitStage.code, hitStage.message, [SHOOTING_RULE_ID]) };
  const stageGroup = lethalHitStageGroup(context, hitStage, state.prng);
  const criticalHitKeys = hitStage.hitRolls
    .filter((hit) => hit.hit && hit.critical)
    .map((hit) => ({ groupIndex: 0, attackIndex: hit.attackIndex } as const));
  if (criticalHitKeys.length === 0) {
    const continuation = resolveLethalHitsContinuation(lethalRequest(context), hitStage, [], hitStage.prngAfter);
    if (!continuation.accepted) return { accepted: false, state, rejection: reject(command, continuation.code, continuation.message, [SHOOTING_RULE_ID]) };
    const event = fullLethalEvent('basic-shooting-resolved', `${command.id}:0`, command.id, context, stageGroup, continuation, state.prng, environment.fingerprint);
    return { accepted: true, state: unsafeReduceGameEvent(state, event), events: [event] };
  }
  const pending: PendingLethalShootingResolutionV1 = {
    originCommandId: command.id,
    attackerUnitId: context.attacker.id,
    targetUnitId: context.target.id,
    weaponProfileId: context.weapon.id,
    attackGroups: [stageGroup],
    criticalHitKeys,
    choices: [],
    shootingEnvironmentFingerprint: environment.fingerprint,
    prngBefore: state.prng,
    prngAfterHits: hitStage.prngAfter,
    sourceRefs: uniqueSources([
      CORE_BASIC_RANGED_ATTACK_SOURCE,
      ...CORE_ATTACK_SEQUENCE_STEP_SOURCES,
      ...context.weapon.sourceRefs,
      ...(context.weapon.weaponKeywords?.map((keyword) => keyword.source) ?? []),
      ...stageGroup.attackVolume.sourceRefs,
      ...stageGroup.cover.sourceRefs
    ])
  };
  const stageEvent: GameEvent = { id: `${command.id}:0`, commandId: command.id, type: 'basic-shooting-hit-stage-resolved', resolution: pending };
  const decisionEvent: GameEvent = { id: `${command.id}:1`, commandId: command.id, type: 'decision-requested', decision: lethalDecision(pending, context.attacker.playerId) };
  const events = [stageEvent, decisionEvent] as const;
  return { accepted: true, state: events.reduce(unsafeReduceGameEvent, state), events };
}

/** Handles the existing decision command through trusted shooting orchestration. */
export function executeLethalHitsDecisionCommand(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'resolve-decision' }>,
  environment: ShootingEnvironment
): CommandExecution {
  const validation = validateGameCommand(state, command);
  if (validation) return { accepted: false, state, rejection: validation };
  const environmentRejection = validateEnvironment(environment, command);
  if (environmentRejection) return { accepted: false, state, rejection: environmentRejection };
  if (state.shootingEnvironmentFingerprint !== environment.fingerprint) {
    return { accepted: false, state, rejection: reject(command, 'shooting-environment-mismatch', 'L’environnement de tir ne correspond pas à la session.', [TRUST_RULE_ID]) };
  }
  const pending = state.pendingLethalShooting;
  const decision = state.pendingDecisions.find((entry) => entry.id === command.decisionId);
  const key = pending?.criticalHitKeys[pending.choices.length];
  if (!pending || !decision || decision.kind !== 'lethal-hits-choice' || !key
    || decision.id !== `${pending.originCommandId}:lethal:${key.groupIndex}:${key.attackIndex}`
    || (command.optionId !== 'auto-wound' && command.optionId !== 'roll-to-wound')) {
    return { accepted: false, state, rejection: reject(command, 'invalid-lethal-hits-decision', 'La décision [TOUCHES FATALES] ne correspond pas à la continuation en attente.', ['core.weapon-ability.lethal-hits']) };
  }
  const choice: LethalHitsChoiceV1 = { ...key, optionId: command.optionId };
  const choiceEvent: GameEvent = {
    id: `${command.id}:0`,
    commandId: command.id,
    type: 'basic-shooting-lethal-choice-resolved',
    decisionId: decision.id,
    playerId: command.actorId,
    choice
  };
  const choiceState = unsafeReduceGameEvent(state, choiceEvent);
  const pendingAfterChoice = choiceState.pendingLethalShooting;
  if (!pendingAfterChoice) throw new Error('Validated lethal choice did not preserve its continuation.');
  if (pendingAfterChoice.choices.length < pendingAfterChoice.criticalHitKeys.length) {
    const requestEvent: GameEvent = {
      id: `${command.id}:1`,
      commandId: command.id,
      type: 'decision-requested',
      decision: lethalDecision(pendingAfterChoice, command.actorId)
    };
    return { accepted: true, state: unsafeReduceGameEvent(choiceState, requestEvent), events: [choiceEvent, requestEvent] };
  }

  const declaration: Extract<GameCommand, { readonly type: 'resolve-basic-shooting' }> = {
    id: pendingAfterChoice.originCommandId,
    actorId: command.actorId,
    type: 'resolve-basic-shooting',
    attackerUnitId: pendingAfterChoice.attackerUnitId,
    targetUnitId: pendingAfterChoice.targetUnitId,
    weaponProfileId: pendingAfterChoice.weaponProfileId
  };
  const plan = computeEvidence(choiceState, declaration, environment);
  if ('code' in plan) return { accepted: false, state, rejection: plan };
  const context = buildLethalFixtureContext(choiceState, declaration, plan);
  if ('code' in context) return { accepted: false, state, rejection: context };
  const recomputedHitStage = resolveLethalHitsHitStage(lethalRequest(context), pendingAfterChoice.prngBefore);
  if (!recomputedHitStage.accepted) return { accepted: false, state, rejection: reject(command, recomputedHitStage.code, recomputedHitStage.message, [SHOOTING_RULE_ID]) };
  const recomputedStageGroup = lethalHitStageGroup(context, recomputedHitStage, pendingAfterChoice.prngBefore);
  const recomputedKeys = recomputedHitStage.hitRolls.filter((hit) => hit.hit && hit.critical).map((hit) => ({ groupIndex: 0, attackIndex: hit.attackIndex }));
  if (!sameJson(pendingAfterChoice.attackGroups, [recomputedStageGroup])
    || !sameJson(pendingAfterChoice.criticalHitKeys, recomputedKeys)
    || !sameJson(pendingAfterChoice.sourceRefs, uniqueSources([
      CORE_BASIC_RANGED_ATTACK_SOURCE,
      ...CORE_ATTACK_SEQUENCE_STEP_SOURCES,
      ...context.weapon.sourceRefs,
      ...(context.weapon.weaponKeywords?.map((keyword) => keyword.source) ?? []),
      ...recomputedStageGroup.attackVolume.sourceRefs,
      ...recomputedStageGroup.cover.sourceRefs
    ]))
    || pendingAfterChoice.shootingEnvironmentFingerprint !== environment.fingerprint
    || !sameJson(pendingAfterChoice.prngAfterHits, recomputedHitStage.prngAfter)) {
    return { accepted: false, state, rejection: reject(command, 'lethal-hits-continuation-mismatch', 'La continuation [TOUCHES FATALES] ne peut pas être vérifiée contre l’environnement autoritaire.', [TRUST_RULE_ID]) };
  }
  const completion = resolveLethalHitsContinuation(lethalRequest(context), recomputedHitStage, pendingAfterChoice.choices, choiceState.prng);
  if (!completion.accepted) return { accepted: false, state, rejection: reject(command, completion.code, completion.message, [SHOOTING_RULE_ID]) };
  const completionEvent = fullLethalEvent('basic-shooting-completed', `${command.id}:1`, command.id, context, recomputedStageGroup, completion, choiceState.prng, environment.fingerprint);
  return { accepted: true, state: unsafeReduceGameEvent(choiceState, completionEvent), events: [choiceEvent, completionEvent] };
}

interface RerollFixtureContext {
  readonly attacker: UnitState;
  readonly target: UnitState;
  readonly weapon: WeaponProfileV1;
  readonly plan: ShootingPlan;
  readonly group: PlannedAttackGroup;
  readonly attackVolume: BasicShootingAttackGroup['attackVolume'];
  readonly hitRollModifiers?: NonNullable<WeaponProfileV1['modifierPlan']>['hitRoll'];
  readonly modifierSourceRefs: readonly SourceReferenceV1[];
  readonly permissions: PendingRerollShootingResolutionV1['permissions'];
}

function genericRerollPermissions(weapon: WeaponProfileV1, environment: ShootingEnvironment): PendingRerollShootingResolutionV1['permissions'] {
  const generic = environment.genericRerolls;
  const twinLinked = weapon.weaponKeywords?.find((keyword) => keyword.kind === 'twin-linked');
  return {
    hit: generic?.hitRolls === true,
    wound: generic?.woundRolls === true || twinLinked !== undefined,
    sourceRefs: uniqueSources([
      ...(generic && (generic.hitRolls || generic.woundRolls) ? [generic.source] : []),
      // [JUMELÉ] grants the wound-roll scope (24.38); every reroll still
      // follows the sourced generic procedure (01.05.02).
      ...(twinLinked === undefined ? [] : [OFFICIAL_APP_REROLLS_SOURCE, CORE_TWIN_LINKED_SOURCE])
    ])
  };
}

function rerollFixtureScopeRejection(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'resolve-basic-shooting' }>,
  plan: ShootingPlan,
  attacker: UnitState,
  target: UnitState,
  weapon: WeaponProfileV1
): RuleRejection | null {
  const carriers = firingModels(state, attacker, weapon.id);
  const fixtureOnly = attacker.coverageSubject?.subjectType !== 'unit' && target.coverageSubject?.subjectType !== 'unit';
  const keywordsSupported = weapon.weaponKeywords?.every((keyword) => keyword.kind === 'twin-linked') ?? true;
  const modifierKinds = Object.keys(weapon.modifierPlan ?? {});
  if (!fixtureOnly || plan.weaponProfileIds.length !== 1 || plan.groups.length !== 1
    || carriers.models.length !== 1 || carriers.weaponCount !== 1 || plan.groups[0]?.weaponCount !== 1
    || !keywordsSupported || weapon.randomAttacks !== undefined || weapon.randomDamage !== undefined
    || (weapon.attackVolumeAbilities?.length ?? 0) !== 0
    || modifierKinds.some((kind) => kind !== 'hitRoll')
    || plan.attackModifiers.rerollFailedHits) {
    return reject(command, 'unsupported-generic-reroll-fixture-scope', 'Les relances génériques sont limitées à la fixture : un profil, un porteur, une instance, A/D fixes, seulement [JUMELÉ] et un éventuel modificateur de jet de touche.', ['simulator.fixture-generic-rerolls-v1']);
  }
  return null;
}

function buildRerollFixtureContext(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'resolve-basic-shooting' }>,
  environment: ShootingEnvironment,
  plan: ShootingPlan
): RerollFixtureContext | RuleRejection {
  const attacker = state.units[command.attackerUnitId];
  const target = state.units[command.targetUnitId];
  const weapon = plan.weaponProfileIds.length === 1 ? attacker?.weaponProfiles.find((profile) => profile.id === plan.weaponProfileIds[0]) : undefined;
  if (!attacker || !target || !weapon) return reject(command, 'unknown-shooting-subject', 'Les sujets de relance validés sont introuvables.', [SHOOTING_RULE_ID]);
  const permissions = genericRerollPermissions(weapon, environment);
  if (!permissions.hit && !permissions.wound) return reject(command, 'unsupported-generic-reroll-scope', 'Aucune règle sourcée ne donne une relance générique à ce tir.', ['simulator.fixture-generic-rerolls-v1']);
  const scopeRejection = rerollFixtureScopeRejection(state, command, plan, attacker, target, weapon);
  if (scopeRejection) return scopeRejection;
  const hitRollModifiers = hitRollModifierPlanFor(weapon, command);
  if ('code' in hitRollModifiers) return hitRollModifiers;
  const attackVolume = resolveAttackVolume(weapon, plan.groups[0].pair.distance, target.models.filter((model) => model.active).length);
  if (!attackVolume.accepted) return reject(command, attackVolume.code, attackVolume.message, [SHOOTING_RULE_ID]);
  return {
    attacker,
    target,
    weapon,
    plan,
    group: plan.groups[0],
    attackVolume: attackVolume.breakdown,
    ...(hitRollModifiers.plan === undefined ? {} : { hitRollModifiers: hitRollModifiers.plan }),
    modifierSourceRefs: hitRollModifiers.sourceRefs,
    permissions
  };
}

function rerollRequest(context: RerollFixtureContext) {
  return {
    attackerId: context.attacker.id,
    targetId: context.target.id,
    weapon: { ...context.weapon, range: context.group.effectiveRange, attacks: context.attackVolume.attacksPerWeapon, ballisticSkill: context.weapon.ballisticSkill },
    target: {
      toughness: context.target.toughness,
      save: context.target.save,
      woundsPerModel: context.target.woundsPerModel,
      models: context.target.models,
      keywords: context.target.keywords,
      coverBallisticSkillPenalty: context.group.cover.ballisticSkillPenalty
    },
    distance: context.group.pair.distance,
    visible: true,
    attackModifiers: {
      ...context.plan.attackModifiers,
      sourceRefs: uniqueSources([...context.plan.attackModifiers.sourceRefs, ...context.modifierSourceRefs, ...context.permissions.sourceRefs]),
      ...(context.hitRollModifiers === undefined ? {} : { hitRollModifiers: context.hitRollModifiers })
    }
  } as const;
}

function rerollStageGroup(
  context: RerollFixtureContext,
  stage: { readonly hitRolls: readonly BasicShootingHitRoll[]; readonly hitRequired: number; readonly woundRequired: number; readonly saveRequired: number; readonly prngAfter: GameState['prng'] },
  prngBefore: GameState['prng']
): BasicShootingHitStageGroup {
  const blockerIds = [...new Set(context.group.pair.rays.flatMap((ray) => ray.blockerHits.map((hit) => hit.blockerId)))].sort();
  return {
    firingModelId: context.group.firingModel.id,
    weaponProfileId: context.weapon.id,
    weaponCount: 1,
    attackVolume: context.attackVolume,
    range: { edgeToEdgeDistance: context.group.pair.distance, weaponRange: context.group.effectiveRange, attackerModelId: context.group.firingModel.id, targetModelId: context.group.pair.targetModel.id },
    lineOfSight: { visible: true, reason: 'clear', attackerModelId: context.group.firingModel.id, targetModelId: context.group.pair.targetModel.id, ray: context.group.pair.clearRay?.ray, blockerIds },
    cover: context.group.cover,
    hitRolls: stage.hitRolls,
    hitRequired: stage.hitRequired,
    woundRequired: stage.woundRequired,
    saveRequired: stage.saveRequired,
    prngBefore,
    prngAfter: stage.prngAfter
  };
}

function genericRerollSources(context: RerollFixtureContext, group: BasicShootingHitStageGroup): readonly SourceReferenceV1[] {
  return uniqueSources([
    CORE_BASIC_RANGED_ATTACK_SOURCE,
    ...CORE_ATTACK_SEQUENCE_STEP_SOURCES,
    ...context.weapon.sourceRefs,
    ...(context.weapon.weaponKeywords?.map((keyword) => keyword.source) ?? []),
    ...context.permissions.sourceRefs,
    ...context.modifierSourceRefs,
    ...group.attackVolume.sourceRefs,
    ...group.cover.sourceRefs
  ]);
}

function rerollDecision(resolution: PendingRerollShootingResolutionV1, playerId: string) {
  const key = resolution.eligibleKeys[resolution.choices.length];
  if (!key) throw new Error('A generic reroll decision requires an unresolved die.');
  const label = resolution.stage === 'hit' ? 'touche' : 'blessure';
  return {
    id: `${resolution.originCommandId}:reroll:${resolution.stage}:${key.groupIndex}:${key.attackIndex}`,
    kind: 'generic-reroll-choice',
    playerId,
    prompt: `Relance : choisir de conserver ou relancer ce jet de ${label}.`,
    options: [{ id: 'keep', label: 'Conserver le dé' }, { id: 'reroll', label: 'Relancer le dé' }],
    sourceRuleIds: ['simulator.fixture-generic-rerolls-v1']
  } as const;
}

function rerollChoiceEvent(command: Extract<GameCommand, { readonly type: 'resolve-decision' }>, resolution: PendingRerollShootingResolutionV1, decisionId: string): Extract<GameEvent, { readonly type: 'basic-shooting-reroll-choice-resolved' }> {
  const key = resolution.eligibleKeys[resolution.choices.length];
  if (!key) throw new Error('A generic reroll choice has no eligible die.');
  return {
    id: `${command.id}:0`,
    commandId: command.id,
    type: 'basic-shooting-reroll-choice-resolved',
    decisionId,
    playerId: command.actorId,
    choice: { ...key, rollKind: resolution.stage, optionId: command.optionId as 'keep' | 'reroll' }
  };
}

function genericRerollCompletionEvent(
  id: string,
  commandId: string,
  context: RerollFixtureContext,
  stageGroup: BasicShootingHitStageGroup,
  resolution: Extract<ReturnType<typeof resolveRerollableShootingContinuation>, { readonly accepted: true }>,
  prngBefore: GameState['prng'],
  fingerprint: string
): Extract<GameEvent, { readonly type: 'basic-shooting-reroll-completed' }> {
  const attackGroup: BasicShootingAttackGroup = {
    firingModelId: stageGroup.firingModelId,
    weaponProfileId: stageGroup.weaponProfileId,
    weaponCount: 1,
    ...(context.modifierSourceRefs.length === 0 ? {} : { modifierSourceRefs: context.modifierSourceRefs }),
    attackVolume: stageGroup.attackVolume,
    range: stageGroup.range,
    lineOfSight: stageGroup.lineOfSight,
    cover: stageGroup.cover,
    hitRolls: resolution.hitRolls,
    woundRolls: resolution.woundRolls,
    saveRolls: resolution.saveRolls,
    allocations: resolution.allocations,
    rolls: resolution.steps,
    result: shootingResult(resolution),
    prngBefore: stageGroup.prngBefore,
    prngAfter: resolution.prngAfter
  };
  const evidence = evidenceFromAttackGroups([attackGroup], context.plan.attackModifiers);
  return {
    id,
    commandId,
    type: 'basic-shooting-reroll-completed',
    attackerUnitId: context.attacker.id,
    targetUnitId: context.target.id,
    weaponProfileId: context.weapon.id,
    evidence,
    attackGroups: [attackGroup],
    rolls: attackGroup.rolls,
    result: attackGroup.result,
    casualtyModelIds: resolution.destroyedModelIds,
    targetModelsAfter: resolution.targetModelsAfter,
    shootingEnvironmentFingerprint: fingerprint,
    prngBefore,
    prngAfter: resolution.prngAfter,
    sourceRefs: uniqueSources([...genericRerollSources(context, stageGroup), ...resolution.sourceRefs])
  };
}

function rerollDeclaration(resolution: PendingRerollShootingResolutionV1, actorId: string): Extract<GameCommand, { readonly type: 'resolve-basic-shooting' }> {
  return { id: resolution.originCommandId, actorId, type: 'resolve-basic-shooting', attackerUnitId: resolution.attackerUnitId, targetUnitId: resolution.targetUnitId, weaponProfileId: resolution.weaponProfileId };
}

function advanceRerollHitStage(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'resolve-decision' }>,
  environment: ShootingEnvironment
): CommandExecution {
  const pending = state.pendingRerollShooting;
  if (!pending || pending.stage !== 'hit' || pending.choices.length !== pending.eligibleKeys.length) return { accepted: false, state, rejection: reject(command, 'generic-reroll-continuation-mismatch', 'La continuation de relance de touche est incomplète.', [TRUST_RULE_ID]) };
  const declaration = rerollDeclaration(pending, command.actorId);
  const plan = computeEvidence(state, declaration, environment);
  if ('code' in plan) return { accepted: false, state, rejection: plan };
  const context = buildRerollFixtureContext(state, declaration, environment, plan);
  if ('code' in context) return { accepted: false, state, rejection: context };
  const hitStage = resolveRerollableHitStage(rerollRequest(context), pending.prngBefore);
  if (!hitStage.accepted) return { accepted: false, state, rejection: reject(command, hitStage.code, hitStage.message, [SHOOTING_RULE_ID]) };
  const hitGroup = rerollStageGroup(context, hitStage, pending.prngBefore);
  if (!sameJson(pending.attackGroup, hitGroup) || !sameJson(pending.sourceRefs, genericRerollSources(context, hitGroup)) || !sameJson(pending.prngAfterHits, hitStage.prngAfter) || pending.shootingEnvironmentFingerprint !== environment.fingerprint) {
    return { accepted: false, state, rejection: reject(command, 'generic-reroll-continuation-mismatch', 'Le stade de touche de relance ne correspond pas à l’environnement autoritaire.', [TRUST_RULE_ID]) };
  }
  const effectiveHitChoices: readonly RerollChoiceV1[] = pending.permissions.hit
    ? pending.choices
    : hitStage.hitRolls.map((roll) => ({ groupIndex: 0, attackIndex: roll.attackIndex, rollKind: 'hit' as const, optionId: 'keep' as const }));
  const woundStage = resolveRerollableWoundStage(rerollRequest(context), hitStage, effectiveHitChoices, state.prng);
  if (!woundStage.accepted) return { accepted: false, state, rejection: reject(command, woundStage.code, woundStage.message, [SHOOTING_RULE_ID]) };
  const woundGroup = rerollStageGroup(context, woundStage, pending.prngBefore);
  const woundPending: PendingRerollShootingResolutionV1 = {
    ...pending,
    stage: 'wound',
    attackGroup: woundGroup,
    woundRolls: woundStage.woundRolls,
    eligibleKeys: context.permissions.wound ? woundStage.woundRolls.map((roll) => ({ groupIndex: 0, attackIndex: roll.attackIndex })) : [],
    choices: [],
    hitChoices: effectiveHitChoices,
    prngAfterWounds: woundStage.prngAfter
  };
  const stageEvent: GameEvent = { id: `${command.id}:1`, commandId: command.id, type: 'basic-shooting-reroll-stage-resolved', resolution: woundPending };
  const stageState = unsafeReduceGameEvent(state, stageEvent);
  if (woundPending.eligibleKeys.length > 0) {
    const decisionEvent: GameEvent = { id: `${command.id}:2`, commandId: command.id, type: 'decision-requested', decision: rerollDecision(woundPending, context.attacker.playerId) };
    return { accepted: true, state: unsafeReduceGameEvent(stageState, decisionEvent), events: [stageEvent, decisionEvent] };
  }
  const effectiveWoundChoices: readonly RerollChoiceV1[] = context.permissions.wound
    ? []
    : woundStage.woundRolls.map((roll) => ({ groupIndex: 0, attackIndex: roll.attackIndex, rollKind: 'wound' as const, optionId: 'keep' as const }));
  const completion = resolveRerollableShootingContinuation(rerollRequest(context), woundStage, effectiveWoundChoices, stageState.prng);
  if (!completion.accepted) return { accepted: false, state, rejection: reject(command, completion.code, completion.message, [SHOOTING_RULE_ID]) };
  const completionEvent = genericRerollCompletionEvent(`${command.id}:2`, command.id, context, woundGroup, completion, stageState.prng, environment.fingerprint);
  return { accepted: true, state: unsafeReduceGameEvent(stageState, completionEvent), events: [stageEvent, completionEvent] };
}

/** Handles the bounded, journaled generic reroll decision window. */
export function executeGenericRerollDecisionCommand(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'resolve-decision' }>,
  environment: ShootingEnvironment
): CommandExecution {
  const validation = validateGameCommand(state, command);
  if (validation) return { accepted: false, state, rejection: validation };
  const environmentRejection = validateEnvironment(environment, command);
  if (environmentRejection) return { accepted: false, state, rejection: environmentRejection };
  if (state.shootingEnvironmentFingerprint !== environment.fingerprint) return { accepted: false, state, rejection: reject(command, 'shooting-environment-mismatch', 'L’environnement de tir ne correspond pas à la session.', [TRUST_RULE_ID]) };
  const pending = state.pendingRerollShooting;
  const decision = state.pendingDecisions.find((entry) => entry.id === command.decisionId);
  const key = pending?.eligibleKeys[pending.choices.length];
  if (!pending || !decision || !key || decision.kind !== 'generic-reroll-choice'
    || decision.id !== `${pending.originCommandId}:reroll:${pending.stage}:${key.groupIndex}:${key.attackIndex}`
    || (command.optionId !== 'keep' && command.optionId !== 'reroll')) {
    return { accepted: false, state, rejection: reject(command, 'invalid-generic-reroll-decision', 'La décision de relance ne correspond pas au dé en attente.', ['simulator.fixture-generic-rerolls-v1']) };
  }
  const choiceEvent = rerollChoiceEvent(command, pending, decision.id);
  const choiceState = unsafeReduceGameEvent(state, choiceEvent);
  const afterChoice = choiceState.pendingRerollShooting;
  if (!afterChoice) throw new Error('Validated generic reroll choice did not preserve its continuation.');
  if (afterChoice.choices.length < afterChoice.eligibleKeys.length) {
    const requestEvent: GameEvent = { id: `${command.id}:1`, commandId: command.id, type: 'decision-requested', decision: rerollDecision(afterChoice, command.actorId) };
    return { accepted: true, state: unsafeReduceGameEvent(choiceState, requestEvent), events: [choiceEvent, requestEvent] };
  }
  if (afterChoice.stage === 'hit') {
    const continuation = advanceRerollHitStage(choiceState, command, environment);
    if (!continuation.accepted) return continuation;
    return { accepted: true, state: continuation.state, events: [choiceEvent, ...continuation.events] };
  }
  const declaration = rerollDeclaration(afterChoice, command.actorId);
  const plan = computeEvidence(choiceState, declaration, environment);
  if ('code' in plan) return { accepted: false, state, rejection: plan };
  const context = buildRerollFixtureContext(choiceState, declaration, environment, plan);
  if ('code' in context) return { accepted: false, state, rejection: context };
  const hitStage = resolveRerollableHitStage(rerollRequest(context), afterChoice.prngBefore);
  if (!hitStage.accepted) return { accepted: false, state, rejection: reject(command, hitStage.code, hitStage.message, [SHOOTING_RULE_ID]) };
  const woundStage = resolveRerollableWoundStage(rerollRequest(context), hitStage, afterChoice.hitChoices ?? [], afterChoice.prngAfterHits);
  if (!woundStage.accepted || !sameJson(afterChoice.attackGroup, rerollStageGroup(context, woundStage, afterChoice.prngBefore)) || !sameJson(afterChoice.woundRolls, woundStage.woundRolls) || !sameJson(afterChoice.prngAfterWounds, woundStage.prngAfter)) {
    return { accepted: false, state, rejection: reject(command, 'generic-reroll-continuation-mismatch', 'Le stade de blessure de relance ne correspond pas à l’environnement autoritaire.', [TRUST_RULE_ID]) };
  }
  const completion = resolveRerollableShootingContinuation(rerollRequest(context), woundStage, afterChoice.choices, choiceState.prng);
  if (!completion.accepted) return { accepted: false, state, rejection: reject(command, completion.code, completion.message, [SHOOTING_RULE_ID]) };
  const completionEvent = genericRerollCompletionEvent(`${command.id}:1`, command.id, context, afterChoice.attackGroup, completion, choiceState.prng, environment.fingerprint);
  return { accepted: true, state: unsafeReduceGameEvent(choiceState, completionEvent), events: [choiceEvent, completionEvent] };
}

function executeGenericRerollFixtureShooting(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'resolve-basic-shooting' }>,
  environment: ShootingEnvironment,
  plan: ShootingPlan
): CommandExecution {
  const context = buildRerollFixtureContext(state, command, environment, plan);
  if ('code' in context) return { accepted: false, state, rejection: context };
  const hitStage = resolveRerollableHitStage(rerollRequest(context), state.prng);
  if (!hitStage.accepted) return { accepted: false, state, rejection: reject(command, hitStage.code, hitStage.message, [SHOOTING_RULE_ID]) };
  const hitGroup = rerollStageGroup(context, hitStage, state.prng);
  const pending: PendingRerollShootingResolutionV1 = {
    originCommandId: command.id,
    attackerUnitId: context.attacker.id,
    targetUnitId: context.target.id,
    weaponProfileId: context.weapon.id,
    stage: 'hit',
    attackGroup: hitGroup,
    eligibleKeys: context.permissions.hit ? hitStage.hitRolls.map((roll) => ({ groupIndex: 0, attackIndex: roll.attackIndex })) : [],
    choices: [],
    permissions: context.permissions,
    shootingEnvironmentFingerprint: environment.fingerprint,
    prngBefore: state.prng,
    prngAfterHits: hitStage.prngAfter,
    sourceRefs: genericRerollSources(context, hitGroup)
  };
  const stageEvent: GameEvent = { id: `${command.id}:0`, commandId: command.id, type: 'basic-shooting-reroll-stage-resolved', resolution: pending };
  const stageState = unsafeReduceGameEvent(state, stageEvent);
  if (pending.eligibleKeys.length > 0) {
    const decisionEvent: GameEvent = { id: `${command.id}:1`, commandId: command.id, type: 'decision-requested', decision: rerollDecision(pending, context.attacker.playerId) };
    return { accepted: true, state: unsafeReduceGameEvent(stageState, decisionEvent), events: [stageEvent, decisionEvent] };
  }
  const advance = advanceRerollHitStage(stageState, { id: command.id, actorId: command.actorId, type: 'resolve-decision', decisionId: '', optionId: 'keep' }, environment);
  return advance.accepted
    ? { accepted: true, state: advance.state, events: [stageEvent, ...advance.events] }
    : advance;
}

/** Selects the source-backed Oath target; only the target ID comes from the command. */
export function executeOathOfMomentSelectionCommand(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'select-oath-of-moment-target' }>,
  environment: ShootingEnvironment
): CommandExecution {
  const validation = validateGameCommand(state, command);
  if (validation) return { accepted: false, state, rejection: validation };
  const environmentRejection = validateEnvironment(environment, command);
  if (environmentRejection) return { accepted: false, state, rejection: environmentRejection };
  if (state.shootingEnvironmentFingerprint !== environment.fingerprint) {
    return { accepted: false, state, rejection: reject(command, 'shooting-environment-mismatch', 'L’environnement M4 ne correspond pas à la session.', [TRUST_RULE_ID]) };
  }
  const selection = selectionFor(state, command, environment);
  if ('code' in selection) return { accepted: false, state, rejection: selection };
  const event: GameEvent = { id: `${command.id}:0`, commandId: command.id, type: 'oath-of-moment-selected', selection };
  return { accepted: true, state: unsafeReduceGameEvent(state, event), events: [event] };
}

interface ExtendedFixtureContext {
  readonly attacker: UnitState;
  readonly target: UnitState;
  readonly weapon: WeaponProfileV1;
  readonly group: PlannedAttackGroup;
  readonly attackCount: number;
  readonly hitRequired: number;
  readonly woundRequired: number;
  readonly atHalfRange: boolean;
  readonly hazardous: boolean;
  readonly oneShotInstanceKey?: string;
  readonly sourceRefs: readonly SourceReferenceV1[];
}

function extendedAllocationGroups(target: UnitState): PendingExtendedShootingResolutionV1['allocationGroups'] | null {
  const defence = target.extendedDefence;
  if (!defence) return null;
  const groups = new Map<string, string[]>();
  for (const model of target.models.filter((entry) => entry.active).sort((left, right) => left.id.localeCompare(right.id))) {
    const fact = defence[model.id];
    if (!fact) return null;
    const id = fact.isCharacter ? `character:${model.id}` : fact.allocationGroupId ?? `profile:${target.woundsPerModel}:${target.save}:${fact.invulnerableSave ?? 'none'}`;
    const members = groups.get(id) ?? [];
    members.push(model.id);
    groups.set(id, members);
  }
  return [...groups.entries()].map(([id, modelIds]) => ({ id, modelIds })).sort((left, right) => left.id.localeCompare(right.id));
}

function buildExtendedFixtureContext(state: GameState, command: Extract<GameCommand, { readonly type: 'resolve-basic-shooting' }>, plan: ShootingPlan): ExtendedFixtureContext | RuleRejection {
  const attacker = state.units[command.attackerUnitId];
  const target = state.units[command.targetUnitId];
  const weapon = plan.weaponProfileIds.length === 1 ? attacker?.weaponProfiles.find((profile) => profile.id === plan.weaponProfileIds[0]) : undefined;
  const group = plan.groups.length === 1 ? plan.groups[0] : undefined;
  if (!attacker || !target || !weapon || !group || target.extendedDefence === undefined
    || attacker.coverageSubject?.subjectType === 'unit' || target.coverageSubject?.subjectType === 'unit') {
    return reject(command, 'unsupported-extended-fixture', 'Le tir étendu est limité à une fixture fermée, un profil et une instance physique.', [SHOOTING_RULE_ID]);
  }
  const unsupported = weapon.weaponKeywords?.some((keyword) => !['hazardous', 'one-shot', 'melta', 'devastating-wounds'].includes(keyword.kind)) ?? false;
  if (unsupported || (weapon.weaponKeywords?.length ?? 0) > 1 || weapon.randomAttacks !== undefined || weapon.modifierPlan !== undefined || plan.attackModifiers.rerollFailedHits || plan.attackModifiers.woundRollModifier !== 0
    || group.weaponCount !== 1 || (weapon.attackVolumeAbilities?.length ?? 0) !== 0) {
    return reject(command, 'unsupported-extended-fixture', 'La fixture T04 n’autorise ni profils mixtes, ni relances, ni volume d’attaque variable.', [SHOOTING_RULE_ID]);
  }
  const allocationGroups = extendedAllocationGroups(target);
  if (allocationGroups === null || allocationGroups.length === 0) return reject(command, 'invalid-extended-fixture-defence', 'Chaque figurine cible de la fixture T04 doit avoir une défense et un groupe d’allocation fermés.', [SHOOTING_RULE_ID]);
  const oneShot = weapon.weaponKeywords?.find((keyword) => keyword.kind === 'one-shot');
  const oneShotInstanceKey = oneShot === undefined ? undefined : `${attacker.id}:${group.firingModel.id}:${weapon.id}:${group.weaponInstanceIndex ?? 0}`;
  if (oneShotInstanceKey !== undefined && state.spentOneShotWeaponInstanceKeys.includes(oneShotInstanceKey)) {
    return reject(command, 'one-shot-already-used', '[TIR UNIQUE] a déjà été consommé par cette instance physique.', ['core.weapon-ability.one-shot']);
  }
  return {
    attacker,
    target,
    weapon,
    group,
    attackCount: weapon.attacks,
    hitRequired: Math.min(7, weapon.ballisticSkill + group.cover.ballisticSkillPenalty),
    woundRequired: requiredWoundRoll(weapon.strength, target.toughness),
    atHalfRange: group.pair.distance <= group.effectiveRange / 2,
    hazardous: weapon.weaponKeywords?.some((keyword) => keyword.kind === 'hazardous') === true,
    ...(oneShotInstanceKey === undefined ? {} : { oneShotInstanceKey }),
    sourceRefs: uniqueSources([
      CORE_BASIC_RANGED_ATTACK_SOURCE,
      ...CORE_ATTACK_SEQUENCE_STEP_SOURCES,
      CORE_CHARACTERISTIC_TESTS_SOURCE,
      ...weapon.sourceRefs,
      ...(weapon.weaponKeywords?.map((keyword) => keyword.source) ?? []),
      ...target.models.flatMap((model) => target.extendedDefence?.[model.id] ? [target.extendedDefence[model.id].source] : []),
      ...group.cover.sourceRefs
    ])
  };
}

function extendedStage(
  context: ExtendedFixtureContext,
  originCommandId: string,
  environment: ShootingEnvironment,
  prng: GameState['prng']
): PendingExtendedShootingResolutionV1 {
  const hits = rollDice(prng, 6, context.attackCount);
  // 05.01: a natural 1 always misses and a natural 6 always hits, even when
  // a final modified characteristic would otherwise require 7+.
  const successfulHits = hits.results.map((roll, attackIndex) => ({ roll, attackIndex }))
    .filter((entry) => entry.roll === 6 || (entry.roll !== 1 && entry.roll >= context.hitRequired));
  const wounds = successfulHits.length === 0 ? { results: [] as readonly number[], state: hits.state } : rollDice(hits.state, 6, successfulHits.length);
  const woundRolls = successfulHits.map((hit, index) => ({
    attackIndex: hit.attackIndex,
    roll: wounds.results[index],
    wound: wounds.results[index] !== 1 && wounds.results[index] >= context.woundRequired,
    critical: wounds.results[index] === 6
  }));
  const devastating = context.weapon.weaponKeywords?.some((keyword) => keyword.kind === 'devastating-wounds') === true;
  const melta = context.weapon.weaponKeywords?.find((keyword) => keyword.kind === 'melta');
  const normal = woundRolls.filter((wound) => wound.wound && !(devastating && wound.critical));
  const mortal = woundRolls.filter((wound) => wound.wound && devastating && wound.critical);
  const packets = [...normal, ...mortal].map((wound, packetIndex) => ({
    packetIndex,
    kind: devastating && wound.critical ? 'mortal' as const : 'normal' as const,
    damage: context.weapon.damage,
    ...(context.weapon.randomDamage === undefined ? {} : { randomDamage: context.weapon.randomDamage }),
    ...(melta === undefined ? {} : { fusionBonus: melta.value }),
    atHalfRange: context.atHalfRange,
    sourceAttackIndex: wound.attackIndex
  }));
  const groups = extendedAllocationGroups(context.target);
  if (groups === null) throw new Error('Extended fixture allocation groups disappeared during stage resolution.');
  return {
    originCommandId,
    attackerUnitId: context.attacker.id,
    targetUnitId: context.target.id,
    weaponProfileId: context.weapon.id,
    firingModelId: context.group.firingModel.id,
    weaponInstanceIndex: context.group.weaponInstanceIndex ?? 0,
    packets,
    allocationGroups: groups,
    // 05.03: announce the full defender-group order before any saves.  The
    // current group during later resolution is derived from this order and
    // from the models that remain alive; it is never tied to a packet index.
    groupPlan: groups.length === 1 ? [groups[0].id] : [],
    ...(groups.length === 1 ? { selectedGroupId: groups[0].id } : {}),
    stage: 'group-planning',
    choices: [],
    resolvedPacketCount: 0,
    attackRolls: hits.results,
    woundRolls,
    hazardous: context.hazardous,
    ...(context.oneShotInstanceKey === undefined ? {} : { oneShotInstanceKey: context.oneShotInstanceKey }),
    shootingEnvironmentFingerprint: environment.fingerprint,
    prngBefore: prng,
    prngAfterAttacks: wounds.state,
    sourceRefs: context.sourceRefs
  };
}

function prioritizedAllocationModels(unit: UnitState) {
  const active = unit.models.filter((model) => model.active);
  const rank = (model: UnitState['models'][number]) => {
    const character = unit.extendedDefence?.[model.id]?.isCharacter === true;
    const wounded = model.wounds < unit.woundsPerModel;
    return character ? (wounded ? 2 : 3) : (wounded ? 0 : 1);
  };
  const bestRank = Math.min(...active.map(rank));
  return active.filter((model) => rank(model) === bestRank);
}

function hazardousAllocationModels(state: GameState, resolution: PendingExtendedShootingResolutionV1) {
  const unit = state.units[resolution.attackerUnitId];
  if (!unit) return [];
  return prioritizedAllocationModels(unit);
}

function currentExtendedAllocationGroup(state: GameState, resolution: PendingExtendedShootingResolutionV1) {
  const target = state.units[resolution.targetUnitId];
  if (!target) return undefined;
  return resolution.groupPlan
    .map((groupId) => resolution.allocationGroups.find((group) => group.id === groupId))
    .find((group) => group !== undefined && group.modelIds.some((modelId) => target.models.some((model) => model.id === modelId && model.active)));
}

function extendedAllocationPacketIndex(resolution: PendingExtendedShootingResolutionV1): number | undefined {
  return resolution.stage === 'group-planning'
    ? undefined
    : resolution.awaitingAllocationPacketIndex ?? resolution.allocationOrder?.[resolution.resolvedPacketCount];
}

function allocationDecision(state: GameState, resolution: PendingExtendedShootingResolutionV1): DecisionRequest {
  const target = state.units[resolution.targetUnitId];
  if (resolution.stage === 'hazardous-allocation') {
    const hazardTarget = state.units[resolution.attackerUnitId];
    if (!hazardTarget || !resolution.hazardousWoundsRemaining) throw new Error('No hazardous wound is waiting for allocation.');
    const models = hazardousAllocationModels(state, resolution);
    return {
      id: `${resolution.originCommandId}:hazardous:${resolution.hazardousWoundsRemaining}`,
      kind: 'extended-hazardous-allocation', playerId: hazardTarget.playerId,
      prompt: '[À RISQUE] : choisir la figurine qui subit la blessure mortelle.',
      options: models.map((model) => ({ id: model.id, label: model.id })), sourceRuleIds: ['core.mortal-wounds-allocation']
    };
  }
  if (!target) throw new Error('Extended allocation decision has no target.');
  if (resolution.stage === 'group-planning') {
    const rank = (group: PendingExtendedShootingResolutionV1['allocationGroups'][number]) => {
      const members = target.models.filter((model) => group.modelIds.includes(model.id) && model.active);
      const character = members.every((model) => target.extendedDefence?.[model.id]?.isCharacter === true);
      const hasWounded = members.some((model) => model.wounds < target.woundsPerModel);
      return character ? (hasWounded ? 2 : 3) : (hasWounded ? 0 : 1);
    };
    const allLegalGroups = resolution.allocationGroups.filter((group) => !resolution.groupPlan.includes(group.id)
      && group.modelIds.some((id) => target.models.some((model) => model.id === id && model.active)));
    const bestRank = Math.min(...allLegalGroups.map(rank));
    const legalGroups = allLegalGroups.filter((group) => rank(group) === bestRank);
    return {
      id: `${resolution.originCommandId}:extended:group:${resolution.groupPlan.length}`,
      kind: 'extended-allocation-group',
      playerId: target.playerId,
      prompt: 'Allouer l’attaque : annoncer le prochain groupe défenseur.',
      options: legalGroups.map((group) => ({ id: group.id, label: group.id })),
      sourceRuleIds: ['core.allocate-attack']
    };
  }
  const packetIndex = extendedAllocationPacketIndex(resolution);
  const packet = packetIndex === undefined ? undefined : resolution.packets[packetIndex];
  const group = currentExtendedAllocationGroup(state, resolution);
  if (!packet || !group) throw new Error('Extended allocation decision has no current packet or living group.');
  const members = target.models.filter((model) => model.active && group.modelIds.includes(model.id));
  const wounded = members.filter((model) => model.wounds < target.woundsPerModel);
  const legalModels = wounded.length > 0 ? wounded : members;
  return {
    id: `${resolution.originCommandId}:extended:${packet.packetIndex}:model`,
    kind: 'extended-allocation-model',
    playerId: target.playerId,
    prompt: 'Allouer l’attaque : choisir la figurine défenseuse.',
    options: legalModels.map((model) => ({ id: model.id, label: model.id })),
    sourceRuleIds: ['core.allocate-attack']
  };
}

function extendedSaveStageEvent(state: GameState, commandId: string, eventId: string): Extract<GameEvent, { readonly type: 'extended-shooting-save-stage-resolved' }> {
  const pending = state.pendingExtendedShooting;
  if (!pending || pending.groupPlan.length !== pending.allocationGroups.length) throw new Error('The extended allocation plan is incomplete.');
  const normalPackets = pending.packets.filter((packet) => packet.kind === 'normal');
  const dice = normalPackets.length === 0 ? { results: [] as readonly number[], state: state.prng } : rollDice(state.prng, 6, normalPackets.length);
  const saveRolls = normalPackets.map((packet, index) => ({ packetIndex: packet.packetIndex, roll: dice.results[index] }));
  const order = [
    ...saveRolls.sort((left, right) => left.roll - right.roll
      || pending.packets[left.packetIndex].sourceAttackIndex - pending.packets[right.packetIndex].sourceAttackIndex).map((save) => save.packetIndex),
    ...pending.packets.filter((packet) => packet.kind === 'mortal').sort((left, right) => left.sourceAttackIndex - right.sourceAttackIndex).map((packet) => packet.packetIndex)
  ];
  return { id: eventId, commandId, type: 'extended-shooting-save-stage-resolved', packetIndexOrder: order, saveRolls, prngBefore: state.prng, prngAfter: dice.state };
}

function extendedSaveResolutionEvent(state: GameState, commandId: string, eventId: string): Extract<GameEvent, { readonly type: 'extended-shooting-save-resolved' }> {
  const pending = state.pendingExtendedShooting;
  const target = pending ? state.units[pending.targetUnitId] : undefined;
  const attacker = pending ? state.units[pending.attackerUnitId] : undefined;
  const packetIndex = pending?.allocationOrder?.[pending.resolvedPacketCount];
  const packet = packetIndex === undefined ? undefined : pending?.packets[packetIndex];
  const group = pending ? currentExtendedAllocationGroup(state, pending) : undefined;
  const model = target?.models.find((entry) => entry.active && group?.modelIds.includes(entry.id));
  const fact = model ? target?.extendedDefence?.[model.id] : undefined;
  const roll = pending?.saveRolls?.find((entry) => entry.packetIndex === packetIndex)?.roll;
  const armourPenetration = attacker?.weaponProfiles.find((weapon) => weapon.id === pending?.weaponProfileId)?.armourPenetration;
  if (!pending || !target || !packet || packet.kind !== 'normal' || !group || !fact || roll === undefined || armourPenetration === undefined) throw new Error('The current extended save cannot be resolved.');
  const evidence = evaluateExtendedSave({ save: target.save as 2 | 3 | 4 | 5 | 6 | 7, invulnerableSave: fact.invulnerableSave, sourceRefs: [fact.source] }, armourPenetration, roll);
  return { id: eventId, commandId, type: 'extended-shooting-save-resolved', packetIndex: packet.packetIndex, groupId: group.id, evidence, prngBefore: state.prng, prngAfter: state.prng };
}

function toExtendedEvidence(result: Extract<ReturnType<typeof resolveExtendedDamage>, { readonly accepted: true }>): ExtendedDamageEvidenceV1 {
  return {
    ...(result.save === undefined ? {} : { save: result.save }),
    damageBeforeFeelNoPain: result.damageBeforeFeelNoPain,
    damageLost: result.damageLost,
    ...(result.randomDamage === undefined ? {} : { randomDamage: result.randomDamage }),
    ...(result.feelNoPain === undefined ? {} : { feelNoPain: result.feelNoPain }),
    mortalWounds: result.mortalWounds,
    sourceRefs: result.sourceRefs
  };
}

function extendedPacketEvent(state: GameState, commandId: string, eventId: string): Extract<GameEvent, { readonly type: 'extended-shooting-packet-resolved' }> {
  const pending = state.pendingExtendedShooting;
  if (!pending) throw new Error('No extended packet is pending.');
  const packetIndex = pending.allocationOrder?.[pending.resolvedPacketCount];
  const packet = packetIndex === undefined ? undefined : pending.packets[packetIndex];
  const modelChoice = pending.choices.at(-1);
  const target = state.units[pending.targetUnitId];
  if (!packet || !target || modelChoice?.kind !== 'model') throw new Error('The current extended packet has no defender model choice.');
  const model = target.models.find((entry) => entry.id === modelChoice.modelId);
  const defenceFact = model ? target.extendedDefence?.[model.id] : undefined;
  if (!model || !model.active || !defenceFact) throw new Error('The selected extended defender is unavailable.');
  const resolved = resolveExtendedDamage({
    armourPenetration: state.units[pending.attackerUnitId].weaponProfiles.find((weapon) => weapon.id === pending.weaponProfileId)?.armourPenetration ?? 0,
    damage: packet.damage,
    ...(packet.randomDamage === undefined ? {} : { randomDamage: packet.randomDamage }),
    atHalfRange: packet.atHalfRange,
    ...(packet.fusionBonus === undefined ? {} : { fusionBonus: packet.fusionBonus }),
    devastatingCriticalWound: packet.kind === 'mortal',
    ...(packet.kind === 'normal' ? { saveRoll: pending.saveRolls?.find((save) => save.packetIndex === packet.packetIndex)?.roll } : {}),
    defence: { save: target.save as 2 | 3 | 4 | 5 | 6 | 7, invulnerableSave: defenceFact.invulnerableSave, feelNoPain: defenceFact.feelNoPain, sourceRefs: [defenceFact.source] }
  }, state.prng);
  if (!resolved.accepted) throw new Error(`Extended packet could not be resolved: ${resolved.code}.`);
  const wounds = Math.max(0, model.wounds - Math.min(model.wounds, resolved.damageLost));
  return {
    id: eventId,
    commandId,
    type: 'extended-shooting-packet-resolved',
    packetIndex: packet.packetIndex,
    modelId: model.id,
    evidence: toExtendedEvidence(resolved),
    modelAfter: { ...model, wounds, active: wounds > 0 },
    prngBefore: state.prng,
    prngAfter: resolved.prngAfter
  };
}

function hazardousPacketEvent(state: GameState, commandId: string, eventId: string): Extract<GameEvent, { readonly type: 'extended-shooting-hazardous-packet-resolved' }> {
  const pending = state.pendingExtendedShooting;
  const attacker = pending ? state.units[pending.attackerUnitId] : undefined;
  const choice = pending?.choices.at(-1);
  const model = choice?.kind === 'hazardous-model' ? attacker?.models.find((entry) => entry.id === choice.modelId) : undefined;
  if (!pending || !attacker || !model || !model.active || !pending.hazardousWoundsRemaining) throw new Error('No legal [À RISQUE] allocation is pending.');
  const fact = attacker.extendedDefence?.[model.id];
  const resolved = resolveExtendedDamage({
    armourPenetration: 0, damage: 1, atHalfRange: false, mortalWound: true,
    defence: { save: attacker.save as 2 | 3 | 4 | 5 | 6 | 7, invulnerableSave: fact?.invulnerableSave, feelNoPain: fact?.feelNoPain, sourceRefs: fact ? [fact.source] : attacker.sourceRefs }
  }, state.prng);
  if (!resolved.accepted) throw new Error(`Hazardous mortal wound could not be resolved: ${resolved.code}.`);
  const wounds = Math.max(0, model.wounds - Math.min(model.wounds, resolved.damageLost));
  return { id: eventId, commandId, type: 'extended-shooting-hazardous-packet-resolved', modelId: model.id, evidence: toExtendedEvidence(resolved), modelAfter: { ...model, wounds, active: wounds > 0 }, prngBefore: state.prng, prngAfter: resolved.prngAfter };
}

function extendedCompletionEvent(state: GameState, commandId: string, eventId: string): Extract<GameEvent, { readonly type: 'extended-shooting-completed' }> {
  const pending = state.pendingExtendedShooting;
  if (!pending) throw new Error('No extended shooting continuation is pending.');
  return {
    id: eventId, commandId, type: 'extended-shooting-completed',
    attackerUnitId: pending.attackerUnitId, targetUnitId: pending.targetUnitId, weaponProfileId: pending.weaponProfileId,
    shootingEnvironmentFingerprint: pending.shootingEnvironmentFingerprint,
    prngBefore: state.prng, prngAfter: state.prng, sourceRefs: pending.sourceRefs
  };
}

function continueHazardousAllocations(state: GameState, commandId: string, firstEventIndex: number): { readonly state: GameState; readonly events: readonly GameEvent[] } {
  const events: GameEvent[] = [];
  let current = state;
  while ((current.pendingExtendedShooting?.hazardousWoundsRemaining ?? 0) > 0) {
    const resolution = current.pendingExtendedShooting!;
    const attacker = current.units[resolution.attackerUnitId];
    const legalModels = hazardousAllocationModels(current, resolution);
    if (legalModels.length === 0) {
      const lostEvent: GameEvent = {
        id: `${commandId}:${firstEventIndex + events.length}`, commandId, type: 'extended-shooting-hazardous-wounds-lost',
        count: resolution.hazardousWoundsRemaining ?? 0, sourceRefs: uniqueSources([CORE_MORTAL_WOUNDS_SOURCE, ...resolution.sourceRefs])
      };
      events.push(lostEvent);
      current = unsafeReduceGameEvent(current, lostEvent);
      break;
    }
    if (legalModels.length > 1) {
      const request: GameEvent = { id: `${commandId}:${firstEventIndex + events.length}`, commandId, type: 'decision-requested', decision: allocationDecision(current, resolution) };
      events.push(request);
      return { state: unsafeReduceGameEvent(current, request), events };
    }
    const choice: ExtendedAllocationChoiceV1 = { packetIndex: -1, kind: 'hazardous-model', modelId: legalModels[0].id };
    const choiceEvent: GameEvent = {
      id: `${commandId}:${firstEventIndex + events.length}`, commandId, type: 'extended-shooting-allocation-choice-resolved',
      decisionId: `${resolution.originCommandId}:hazardous:auto:${resolution.hazardousWoundsRemaining}`,
      playerId: attacker.playerId, choice
    };
    events.push(choiceEvent);
    current = unsafeReduceGameEvent(current, choiceEvent);
    const packetEvent = hazardousPacketEvent(current, commandId, `${commandId}:${firstEventIndex + events.length}`);
    events.push(packetEvent);
    current = unsafeReduceGameEvent(current, packetEvent);
  }
  const completion = extendedCompletionEvent(current, commandId, `${commandId}:${firstEventIndex + events.length}`);
  events.push(completion);
  return { state: unsafeReduceGameEvent(current, completion), events };
}

function finishExtendedEvents(state: GameState, commandId: string, firstEventIndex: number): { readonly state: GameState; readonly events: readonly GameEvent[] } {
  const pending = state.pendingExtendedShooting;
  if (!pending || pending.resolvedPacketCount !== (pending.allocationOrder?.length ?? 0)) throw new Error('Extended shooting cannot complete before all packets are resolved.');
  if (pending.hazardousWoundsRemaining !== undefined) return continueHazardousAllocations(state, commandId, firstEventIndex);
  if (!pending.hazardous) {
    const completion = extendedCompletionEvent(state, commandId, `${commandId}:${firstEventIndex}`);
    return { state: unsafeReduceGameEvent(state, completion), events: [completion] };
  }
  const attacker = state.units[pending.attackerUnitId];
  if (!attacker || !attacker.models.some((model) => model.active)) throw new Error('The hazardous unit is unavailable.');
  const hazardRoll = rollDice(state.prng, 6, 1);
  const keywordTokens = new Set(attacker.keywords.map((keyword) => keyword.trim().toUpperCase()));
  const monsterOrVehicle = keywordTokens.has('MONSTRE') || keywordTokens.has('VEHICULE') || keywordTokens.has('VÉHICULE');
  const mortalWounds = hazardRoll.results[0] <= 2 ? (monsterOrVehicle ? 3 : 1) : 0;
  const hazardousEvent: GameEvent = {
    id: `${commandId}:${firstEventIndex}`, commandId, type: 'extended-shooting-hazardous-resolved', roll: hazardRoll.results[0], mortalWounds,
    prngBefore: state.prng, prngAfter: hazardRoll.state,
    sourceRefs: uniqueSources([CORE_HAZARDOUS_SOURCE, ...(mortalWounds > 0 ? [CORE_MORTAL_WOUNDS_SOURCE] : []), ...pending.sourceRefs])
  };
  const afterHazard = unsafeReduceGameEvent(state, hazardousEvent);
  const continued = continueHazardousAllocations(afterHazard, commandId, firstEventIndex + 1);
  return { state: continued.state, events: [hazardousEvent, ...continued.events] };
}

function continueExtendedAllocation(state: GameState, commandId: string, firstEventIndex: number): { readonly state: GameState; readonly events: readonly GameEvent[] } {
  const events: GameEvent[] = [];
  let current = state;
  while (true) {
    const pending = current.pendingExtendedShooting;
    if (!pending) throw new Error('Extended allocation continuation disappeared.');
    if (pending.resolvedPacketCount === (pending.allocationOrder?.length ?? 0)) {
      const completed = finishExtendedEvents(current, commandId, firstEventIndex + events.length);
      return { state: completed.state, events: [...events, ...completed.events] };
    }
    const packetIndex = pending.allocationOrder?.[pending.resolvedPacketCount];
    const packet = packetIndex === undefined ? undefined : pending.packets[packetIndex];
    if (!packet) throw new Error('Extended allocation continuation has no current packet.');
    const target = current.units[pending.targetUnitId];
    if (!target || !target.models.some((model) => model.active)) {
      const lostEvent: GameEvent = {
        id: `${commandId}:${firstEventIndex + events.length}`, commandId, type: 'extended-shooting-packet-lost',
        packetIndex: packet.packetIndex, reason: 'no-active-target', prngBefore: current.prng, prngAfter: current.prng,
        sourceRefs: pending.sourceRefs
      };
      events.push(lostEvent);
      current = unsafeReduceGameEvent(current, lostEvent);
      continue;
    }
    if (packet.kind === 'normal') {
      const saveEvent = extendedSaveResolutionEvent(current, commandId, `${commandId}:${firstEventIndex + events.length}`);
      events.push(saveEvent);
      current = unsafeReduceGameEvent(current, saveEvent);
      if (saveEvent.evidence.saved) continue;
    }
    const request: GameEvent = { id: `${commandId}:${firstEventIndex + events.length}`, commandId, type: 'decision-requested', decision: allocationDecision(current, current.pendingExtendedShooting!) };
    events.push(request);
    return { state: unsafeReduceGameEvent(current, request), events };
  }
}

function beginExtendedModelAllocation(state: GameState, commandId: string, firstEventIndex: number): { readonly state: GameState; readonly events: readonly GameEvent[] } {
  const saveStage = extendedSaveStageEvent(state, commandId, `${commandId}:${firstEventIndex}`);
  const current = unsafeReduceGameEvent(state, saveStage);
  const continued = continueExtendedAllocation(current, commandId, firstEventIndex + 1);
  return { state: continued.state, events: [saveStage, ...continued.events] };
}

function executeExtendedFixtureShooting(state: GameState, command: Extract<GameCommand, { readonly type: 'resolve-basic-shooting' }>, environment: ShootingEnvironment, plan: ShootingPlan): CommandExecution {
  const context = buildExtendedFixtureContext(state, command, plan);
  if ('code' in context) return { accepted: false, state, rejection: context };
  const events: GameEvent[] = [];
  let current = state;
  if (context.oneShotInstanceKey !== undefined) {
    const event: GameEvent = {
      id: `${command.id}:0`, commandId: command.id, type: 'extended-shooting-one-shot-selected', instanceKey: context.oneShotInstanceKey,
      attackerUnitId: context.attacker.id, weaponProfileId: context.weapon.id, firingModelId: context.group.firingModel.id, weaponInstanceIndex: context.group.weaponInstanceIndex ?? 0, sourceRefs: [CORE_ONE_SHOT_SOURCE]
    };
    events.push(event);
    current = unsafeReduceGameEvent(current, event);
  }
  const resolution = extendedStage(context, command.id, environment, current.prng);
  const stageEvent: GameEvent = { id: `${command.id}:${events.length}`, commandId: command.id, type: 'extended-shooting-stage-resolved', resolution };
  events.push(stageEvent);
  current = unsafeReduceGameEvent(current, stageEvent);
  if (resolution.packets.length === 0) {
    const completed = finishExtendedEvents(current, command.id, events.length);
    events.push(...completed.events);
    current = completed.state;
  } else if (resolution.groupPlan.length < resolution.allocationGroups.length) {
    const request: GameEvent = { id: `${command.id}:${events.length}`, commandId: command.id, type: 'decision-requested', decision: allocationDecision(current, resolution) };
    events.push(request);
    current = unsafeReduceGameEvent(current, request);
  } else {
    const progressed = beginExtendedModelAllocation(current, command.id, events.length);
    events.push(...progressed.events);
    current = progressed.state;
  }
  return { accepted: true, state: current, events };
}

/** Resolves a defender allocation decision through the V4 trusted continuation. */
export function executeExtendedAllocationDecisionCommand(state: GameState, command: Extract<GameCommand, { readonly type: 'resolve-decision' }>, environment: ShootingEnvironment): CommandExecution {
  const validation = validateGameCommand(state, command);
  if (validation) return { accepted: false, state, rejection: validation };
  const environmentRejection = validateEnvironment(environment, command);
  if (environmentRejection) return { accepted: false, state, rejection: environmentRejection };
  const pending = state.pendingExtendedShooting;
  const decision = state.pendingDecisions.find((entry) => entry.id === command.decisionId);
  if (pending?.stage === 'hazardous-allocation') {
    if (!decision || decision.playerId !== command.actorId || !decision.options.some((option) => option.id === command.optionId)) {
      return { accepted: false, state, rejection: reject(command, 'invalid-hazardous-allocation-decision', 'La blessure mortelle [À RISQUE] doit être allouée par son unité.', ['core.mortal-wounds-allocation']) };
    }
    const choice: ExtendedAllocationChoiceV1 = { packetIndex: -1, kind: 'hazardous-model', modelId: command.optionId };
    const choiceEvent: GameEvent = { id: `${command.id}:0`, commandId: command.id, type: 'extended-shooting-allocation-choice-resolved', decisionId: decision.id, playerId: command.actorId, choice };
    let current = unsafeReduceGameEvent(state, choiceEvent);
    const packetEvent = hazardousPacketEvent(current, command.id, `${command.id}:1`);
    current = unsafeReduceGameEvent(current, packetEvent);
    const completed = finishExtendedEvents(current, command.id, 2);
    return { accepted: true, state: completed.state, events: [choiceEvent, packetEvent, ...completed.events] };
  }
  const packetIndex = pending?.stage === 'group-planning' ? pending.groupPlan.length : pending ? extendedAllocationPacketIndex(pending) : undefined;
  if (!pending || !decision || packetIndex === undefined || decision.playerId !== command.actorId || !decision.options.some((option) => option.id === command.optionId)) {
    return { accepted: false, state, rejection: reject(command, 'invalid-extended-allocation-decision', 'La décision d’allocation T04 ne correspond pas à la continuation.', ['core.allocate-attack']) };
  }
  const choice: ExtendedAllocationChoiceV1 = decision.kind === 'extended-allocation-group'
    ? { packetIndex, kind: 'group', groupId: command.optionId }
    : decision.kind === 'extended-allocation-model'
      ? { packetIndex, kind: 'model', modelId: command.optionId }
      : (() => { throw new Error('The pending decision is not an extended allocation decision.'); })();
  const choiceEvent: GameEvent = { id: `${command.id}:0`, commandId: command.id, type: 'extended-shooting-allocation-choice-resolved', decisionId: decision.id, playerId: command.actorId, choice };
  let current = unsafeReduceGameEvent(state, choiceEvent);
  if (choice.kind === 'group') {
    const afterGroup = current.pendingExtendedShooting!;
    if (afterGroup.groupPlan.length < afterGroup.allocationGroups.length) {
      const requestEvent: GameEvent = { id: `${command.id}:1`, commandId: command.id, type: 'decision-requested', decision: allocationDecision(current, afterGroup) };
      return { accepted: true, state: unsafeReduceGameEvent(current, requestEvent), events: [choiceEvent, requestEvent] };
    }
    const progressed = beginExtendedModelAllocation(current, command.id, 1);
    return { accepted: true, state: progressed.state, events: [choiceEvent, ...progressed.events] };
  }
  const packetEvent = extendedPacketEvent(current, command.id, `${command.id}:1`);
  current = unsafeReduceGameEvent(current, packetEvent);
  const continued = continueExtendedAllocation(current, command.id, 2);
  return { accepted: true, state: continued.state, events: [choiceEvent, packetEvent, ...continued.events] };
}

type DuplicateAbilitySelection = NonNullable<PendingDuplicateWeaponAbilitySelectionV1['selection']>;

function duplicateAbilityPending(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'resolve-basic-shooting' }>
): PendingDuplicateWeaponAbilitySelectionV1 | RuleRejection | null {
  const attacker = state.units[command.attackerUnitId];
  const target = state.units[command.targetUnitId];
  const weaponIds = declaredShootingWeaponProfileIds(command);
  const weapons = weaponIds.map((weaponId) => attacker?.weaponProfiles.find((weapon) => weapon.id === weaponId));
  const duplicateFacts = weapons.flatMap((weapon) => weapon === undefined
    ? []
    : duplicateWeaponAbilityOccurrences(weapon).map((duplicate) => ({ weapon, ...duplicate })));
  if (duplicateFacts.length === 0) return null;
  if (!attacker || !target || attacker.coverageSubject?.subjectType === 'unit' || target.coverageSubject?.subjectType === 'unit'
    || attacker.extendedDefence !== undefined || target.extendedDefence !== undefined || weaponIds.length !== 1
    || duplicateFacts.length !== 1 || duplicateFacts[0]?.kind !== 'sustained-hits') {
    return reject(command, 'unsupported-duplicate-weapon-ability-scope', 'Les aptitudes dupliquées T05.4 sont limitées à une arme de fixture [TOUCHES SOUTENUES], sans autre interaction.', [SHOOTING_RULE_ID]);
  }
  const duplicate = duplicateFacts[0];
  return {
    originCommand: command,
    attackerUnitId: attacker.id,
    weaponProfileId: duplicate.weapon.id,
    kind: 'sustained-hits',
    occurrenceIndexes: duplicate.occurrenceIndexes,
    shootingEnvironmentFingerprint: state.shootingEnvironmentFingerprint ?? '',
    sourceRefs: [CORE_DUPLICATE_ABILITY_SOURCE]
  };
}

function duplicateAbilityRequest(selection: PendingDuplicateWeaponAbilitySelectionV1, playerId: string): DecisionRequest {
  return {
    id: `${selection.originCommand.id}:duplicate-ability:${selection.weaponProfileId}:${selection.kind}`,
    kind: 'duplicate-weapon-ability',
    playerId,
    prompt: '[TOUCHES SOUTENUES] est présente plusieurs fois : choisissez une seule occurrence applicable.',
    options: selection.occurrenceIndexes.map((index) => ({ id: String(index), label: `Occurrence ${index + 1}` })),
    sourceRuleIds: ['core.duplicate-abilities']
  };
}

function stateWithDuplicateAbilitySelection(state: GameState, attackerUnitId: string, selection: DuplicateAbilitySelection): GameState | null {
  const unit = state.units[attackerUnitId];
  const weapon = unit?.weaponProfiles.find((candidate) => candidate.id === selection.weaponProfileId);
  const selectedWeapon = weapon === undefined ? null : weaponWithSelectedDuplicateAbility(weapon, selection);
  if (!unit || !weapon || !selectedWeapon) return null;
  return {
    ...state,
    units: {
      ...state.units,
      [unit.id]: { ...unit, weaponProfiles: unit.weaponProfiles.map((candidate) => candidate.id === weapon.id ? selectedWeapon : candidate) }
    }
  };
}

export function executeBasicShootingCommand(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'resolve-basic-shooting' }>,
  environment: ShootingEnvironment
): CommandExecution {
  return executeBasicShootingCommandInternal(state, command, environment);
}

function executeBasicShootingCommandInternal(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'resolve-basic-shooting' }>,
  environment: ShootingEnvironment,
  selectedDuplicateAbility?: DuplicateAbilitySelection,
  resumeDuplicateAbility = false
): CommandExecution {
  const validation = resumeDuplicateAbility ? null : validateGameCommand(state, command);
  if (validation) return { accepted: false, state, rejection: validation };
  const environmentRejection = validateEnvironment(environment, command);
  if (environmentRejection) return { accepted: false, state, rejection: environmentRejection };
  if (state.shootingEnvironmentFingerprint !== environment.fingerprint) {
    return { accepted: false, state, rejection: reject(command, 'shooting-environment-mismatch', 'L’environnement de tir ne correspond pas à la session.', [TRUST_RULE_ID]) };
  }
  let stateForResolution = state;
  if (selectedDuplicateAbility === undefined) {
    const pending = duplicateAbilityPending(state, command);
    if (pending !== null && 'code' in pending) return { accepted: false, state, rejection: pending };
    if (pending !== null) {
      const attacker = state.units[pending.attackerUnitId];
      if (!attacker) throw new Error('Validated duplicate ability attacker is missing.');
      const stageEvent: GameEvent = { id: `${command.id}:0`, commandId: command.id, type: 'duplicate-weapon-ability-selection-requested', selection: pending };
      const staged = unsafeReduceGameEvent(state, stageEvent);
      const requestEvent: GameEvent = { id: `${command.id}:1`, commandId: command.id, type: 'decision-requested', decision: duplicateAbilityRequest(pending, attacker.playerId) };
      return { accepted: true, state: unsafeReduceGameEvent(staged, requestEvent), events: [stageEvent, requestEvent] };
    }
  } else {
    const effective = stateWithDuplicateAbilitySelection(state, command.attackerUnitId, selectedDuplicateAbility);
    if (!effective) return { accepted: false, state, rejection: reject(command, 'invalid-duplicate-weapon-ability-choice', 'L’occurrence d’aptitude choisie ne correspond plus au profil autoritaire.', [SHOOTING_RULE_ID]) };
    stateForResolution = effective;
  }
  const plan = computeEvidence(stateForResolution, command, environment);
  if ('code' in plan) return { accepted: false, state, rejection: plan };
  const attacker = stateForResolution.units[command.attackerUnitId];
  const target = stateForResolution.units[command.targetUnitId];
  const weapons = plan.weaponProfileIds.map((weaponProfileId) => attacker?.weaponProfiles.find((profile) => profile.id === weaponProfileId));
  const canonicalWeapons = plan.weaponProfileIds.map((weaponProfileId) => state.units[command.attackerUnitId]?.weaponProfiles.find((profile) => profile.id === weaponProfileId));
  if (!attacker || !target || weapons.some((weapon) => !weapon)) throw new Error('Validated shooting subjects are missing.');
  if (canonicalWeapons.some((weapon) => !weapon || !environment.weaponProfiles[weapon.id] || !sameExecutableWeaponProfile(environment.weaponProfiles[weapon.id], weapon))) {
    return { accepted: false, state, rejection: reject(command, 'shooting-weapon-profile-mismatch', 'Le profil d’arme ne correspond pas à l’environnement canonique.', [TRUST_RULE_ID]) };
  }
  if (target.extendedDefence !== undefined) {
    return executeExtendedFixtureShooting(state, command, environment, plan);
  }
  if (weapons.some((weapon) => weapon?.weaponKeywords?.some((keyword) => ['hazardous', 'one-shot', 'melta', 'devastating-wounds'].includes(keyword.kind)))) {
    return { accepted: false, state, rejection: reject(command, 'extended-fixture-target-required', 'Les mots-clés T04 exigent une cible fixture avec défense étendue ; le pipeline M4 historique ne les interprète pas.', [SHOOTING_RULE_ID]) };
  }
  if (weapons.some((weapon) => weapon?.weaponKeywords?.some((keyword) => keyword.kind === 'lethal-hits'))) {
    return executeLethalFixtureShooting(state, command, environment, plan);
  }
  if (weapons.some((weapon) => weapon !== undefined && (environment.genericRerolls !== undefined || weapon.weaponKeywords?.some((keyword) => keyword.kind === 'twin-linked')))) {
    return executeGenericRerollFixtureShooting(state, command, environment, plan);
  }
  let groupPrng = state.prng;
  const preparedGroups: PreparedAttackGroup[] = [];
  const targetModelCount = target.models.filter((model) => model.active).length;
  for (const group of plan.groups) {
    let baseAttacks = group.weapon.attacks;
    let randomAttacks: BasicShootingAttackGroup['randomAttacks'];
    if (group.weapon.randomAttacks !== undefined) {
      const randomResolution = resolveRandomCharacteristic(group.weapon.randomAttacks, { characteristic: 'attacks', timing: 'generate-attacks' }, groupPrng);
      if (!randomResolution.accepted) return { accepted: false, state, rejection: reject(command, randomResolution.code, randomResolution.message, [SHOOTING_RULE_ID]) };
      groupPrng = randomResolution.prngAfter;
      baseAttacks = randomResolution.value;
      randomAttacks = {
        expression: group.weapon.randomAttacks,
        dice: randomResolution.dice,
        value: randomResolution.value,
        sourceRefs: randomResolution.sourceRefs
      };
    }
    const attacks = resolveWeaponCharacteristic(group.weapon, 'attacks', baseAttacks, command);
    if ('code' in attacks) return { accepted: false, state, rejection: attacks };
    const ballisticSkill = resolveWeaponCharacteristic(group.weapon, 'ballisticSkill', group.weapon.ballisticSkill, command);
    if ('code' in ballisticSkill) return { accepted: false, state, rejection: ballisticSkill };
    const hitRollModifiers = hitRollModifierPlanFor(group.weapon, command);
    if ('code' in hitRollModifiers) return { accepted: false, state, rejection: hitRollModifiers };
    const modifierSourceRefs = uniqueSources([
      ...group.rangeModifierSourceRefs,
      ...attacks.sourceRefs,
      ...ballisticSkill.sourceRefs,
      ...hitRollModifiers.sourceRefs
    ]);
    const volume = resolveAttackVolume({ ...group.weapon, attacks: attacks.value }, group.pair.distance, targetModelCount);
    if (!volume.accepted) return { accepted: false, state, rejection: reject(command, volume.code, volume.message, [SHOOTING_RULE_ID]) };
    preparedGroups.push({
      group,
      ...(randomAttacks === undefined ? {} : { randomAttacks }),
      attackVolume: volume.breakdown,
      ballisticSkill: ballisticSkill.value,
      ...(hitRollModifiers.plan === undefined ? {} : { hitRollModifiers: hitRollModifiers.plan }),
      modifierSourceRefs
    });
  }
  let targetModels = target.models;
  const attackGroups: BasicShootingAttackGroup[] = [];
  const casualtyModelIds: string[] = [];
  for (const prepared of preparedGroups) {
    const { group } = prepared;
    const groupPrngBefore = groupPrng;
    const resolution = resolveBasicShooting({
      attackerId: attacker.id,
      targetId: target.id,
      weapon: {
        ...group.weapon,
        range: group.effectiveRange,
        attacks: prepared.attackVolume.attacksPerWeapon * group.weaponCount,
        ballisticSkill: prepared.ballisticSkill
      },
      target: { toughness: target.toughness, save: target.save, woundsPerModel: target.woundsPerModel, models: targetModels, keywords: target.keywords, coverBallisticSkillPenalty: group.cover.ballisticSkillPenalty },
      distance: group.pair.distance,
      visible: true,
      attackModifiers: {
        rerollFailedHits: plan.attackModifiers.rerollFailedHits,
        woundRollModifier: plan.attackModifiers.woundRollModifier,
        sourceRefs: uniqueSources([...plan.attackModifiers.sourceRefs, ...prepared.modifierSourceRefs]),
        ...(prepared.hitRollModifiers === undefined ? {} : { hitRollModifiers: prepared.hitRollModifiers })
      }
    }, groupPrng);
    if (!resolution.accepted) return { accepted: false, state, rejection: reject(command, resolution.code, resolution.message, [SHOOTING_RULE_ID]) };
    const blockerIds = [...new Set(group.pair.rays.flatMap((ray) => ray.blockerHits.map((hit) => hit.blockerId)))].sort();
    attackGroups.push({
      firingModelId: group.firingModel.id,
      weaponProfileId: group.weapon.id,
      ...(group.weaponInstanceIndex === undefined ? {} : { weaponInstanceIndex: group.weaponInstanceIndex }),
      weaponCount: group.weaponCount,
      ...(selectedDuplicateAbility !== undefined && group.weapon.id === selectedDuplicateAbility.weaponProfileId
        ? { duplicateAbilitySelection: selectedDuplicateAbility }
        : {}),
      ...(prepared.randomAttacks === undefined ? {} : { randomAttacks: prepared.randomAttacks }),
      ...(prepared.modifierSourceRefs.length === 0 ? {} : { modifierSourceRefs: prepared.modifierSourceRefs }),
      attackVolume: prepared.attackVolume,
      range: { edgeToEdgeDistance: group.pair.distance, weaponRange: group.effectiveRange, attackerModelId: group.firingModel.id, targetModelId: group.pair.targetModel.id },
      lineOfSight: { visible: true, reason: 'clear', attackerModelId: group.firingModel.id, targetModelId: group.pair.targetModel.id, ray: group.pair.clearRay?.ray, blockerIds },
      cover: group.cover,
      hitRolls: resolution.hitRolls,
      woundRolls: resolution.woundRolls,
      saveRolls: resolution.saveRolls,
      allocations: resolution.allocations,
      rolls: resolution.steps,
      result: shootingResult(resolution),
      prngBefore: groupPrngBefore,
      prngAfter: resolution.prngAfter
    });
    groupPrng = resolution.prngAfter;
    targetModels = resolution.targetModelsAfter;
    casualtyModelIds.push(...resolution.destroyedModelIds);
  }
  const rolls = attackGroups.flatMap((group, groupIndex) => {
    const offset = attackGroups.slice(0, groupIndex).reduce((total, previous) => total + previous.rolls.length, 0);
    return group.rolls.map((roll) => ({
      ...roll,
      attackIndex: roll.attackIndex + offset,
      ...(roll.generatedByCriticalHitOfAttackIndex === undefined
        ? {}
        : { generatedByCriticalHitOfAttackIndex: roll.generatedByCriticalHitOfAttackIndex + offset })
    }));
  });
  const lastResult = attackGroups.at(-1)?.result;
  if (!lastResult) throw new Error('Validated shooting plan has no attack groups.');
  const evidence = evidenceFromAttackGroups(attackGroups, plan.attackModifiers);
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
    id: resumeDuplicateAbility ? `${command.id}:duplicate:resolved` : `${command.id}:0`,
    commandId: command.id,
    type: 'basic-shooting-resolved',
    attackerUnitId: attacker.id,
    targetUnitId: target.id,
    weaponProfileId: plan.weaponProfileIds[0],
    weaponProfileIds: plan.weaponProfileIds,
    evidence,
    attackGroups,
    rolls,
    result,
    casualtyModelIds,
    targetModelsAfter: targetModels,
    shootingEnvironmentFingerprint: environment.fingerprint,
    prngBefore: state.prng,
    prngAfter: groupPrng,
    sourceRefs: uniqueSources([
      CORE_BASIC_RANGED_ATTACK_SOURCE,
      ...CORE_ATTACK_SEQUENCE_STEP_SOURCES,
      CORE_UNIT_SELECTED_TO_SHOOT_SOURCE,
      ...weapons.flatMap((weapon) => weapon?.sourceRefs ?? []),
      ...canonicalWeapons.flatMap((weapon) => weapon?.weaponKeywords?.map((keyword) => keyword.source) ?? []),
      ...(selectedDuplicateAbility === undefined ? [] : [CORE_DUPLICATE_ABILITY_SOURCE]),
      ...attackGroups.flatMap((group) => group.attackVolume.sourceRefs),
      ...attackGroups.flatMap((group) => group.cover.sourceRefs),
      ...attackGroups.flatMap((group) => group.randomAttacks?.sourceRefs ?? []),
      ...attackGroups.flatMap((group) => group.modifierSourceRefs ?? []),
      ...attackGroups.flatMap((group) => group.allocations.flatMap((allocation) => allocation.randomDamage?.sourceRefs ?? [])),
      ...evidence.attackModifiers.sourceRefs
    ])
  };
  return { accepted: true, state: unsafeReduceGameEvent(state, event), events: [event] };
}

/** Resolves the V5 choice required when a weapon repeats [TOUCHES SOUTENUES]. */
export function executeDuplicateWeaponAbilityDecisionCommand(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'resolve-decision' }>,
  environment: ShootingEnvironment
): CommandExecution {
  const validation = validateGameCommand(state, command);
  if (validation) return { accepted: false, state, rejection: validation };
  const environmentRejection = validateEnvironment(environment, command);
  if (environmentRejection) return { accepted: false, state, rejection: environmentRejection };
  if (state.shootingEnvironmentFingerprint !== environment.fingerprint) return { accepted: false, state, rejection: reject(command, 'shooting-environment-mismatch', 'L’environnement de tir ne correspond pas à la session.', [TRUST_RULE_ID]) };
  const pending = state.pendingDuplicateWeaponAbilitySelection;
  const attacker = pending ? state.units[pending.attackerUnitId] : undefined;
  const decision = state.pendingDecisions.find((entry) => entry.id === command.decisionId);
  const selectedOccurrenceIndex = Number(command.optionId);
  if (!pending || !attacker || !decision || pending.selection !== undefined || decision.kind !== 'duplicate-weapon-ability'
    || decision.id !== `${pending.originCommand.id}:duplicate-ability:${pending.weaponProfileId}:${pending.kind}`
    || decision.playerId !== command.actorId || !Number.isInteger(selectedOccurrenceIndex)
    || String(selectedOccurrenceIndex) !== command.optionId || !pending.occurrenceIndexes.includes(selectedOccurrenceIndex)) {
    return { accepted: false, state, rejection: reject(command, 'invalid-duplicate-weapon-ability-choice', 'La décision d’aptitude dupliquée ne correspond pas à la fenêtre de tir en attente.', [SHOOTING_RULE_ID]) };
  }
  const selection: DuplicateAbilitySelection = { weaponProfileId: pending.weaponProfileId, kind: pending.kind, selectedOccurrenceIndex };
  const choiceEvent: GameEvent = { id: `${command.id}:0`, commandId: command.id, type: 'duplicate-weapon-ability-choice-resolved', decisionId: decision.id, playerId: command.actorId, selection };
  const afterChoice = unsafeReduceGameEvent(state, choiceEvent);
  const continued = executeBasicShootingCommandInternal(afterChoice, pending.originCommand, environment, selection, true);
  if (!continued.accepted) return { accepted: false, state, rejection: continued.rejection };
  return { accepted: true, state: continued.state, events: [choiceEvent, ...continued.events] };
}

/**
 * Resolves a complete T05.2 weapon-instance declaration atomically.  All
 * target eligibility, range and LoS evidence is obtained before the first D6
 * is rolled.  This intentionally excludes every feature that would open a
 * decision window; those interactions need their own durable contract.
 */
export function executeSplitFireCommand(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'resolve-split-fire' }>,
  environment: ShootingEnvironment
): CommandExecution {
  const validation = validateGameCommand(state, command);
  if (validation) return { accepted: false, state, rejection: validation };
  const environmentRejection = validateEnvironment(environment, command);
  if (environmentRejection) return { accepted: false, state, rejection: environmentRejection };
  if (state.shootingEnvironmentFingerprint !== environment.fingerprint) {
    return { accepted: false, state, rejection: reject(command, 'shooting-environment-mismatch', 'L’environnement de tir ne correspond pas à la session.', [TRUST_RULE_ID]) };
  }
  if (environment.oathOfMoment !== undefined || environment.genericRerolls !== undefined) {
    return { accepted: false, state, rejection: reject(command, 'unsupported-split-fire-fixture-interaction', 'Le tir partagé T05.2 ne cumule pas encore Oath of Moment ni une fenêtre de relance.', [SHOOTING_RULE_ID]) };
  }
  const plans = splitFirePlan(state, command, environment);
  if ('code' in plans) return { accepted: false, state, rejection: plans };
  const attacker = state.units[command.attackerUnitId];
  if (!attacker) throw new Error('Validated split-fire attacker is missing.');
  const targetModels = new Map(Object.values(state.units).map((unit) => [unit.id, unit.models] as const));
  let prng = state.prng;
  const resolutions: SplitFireResolutionV1[] = [];
  let nextResolutionIndex = 0;
  for (const plan of plans) {
    const currentTargetModels = targetModels.get(plan.target.id);
    if (!currentTargetModels) throw new Error('Validated split-fire target is missing.');
    if (!currentTargetModels.some((model) => model.active)) {
      break;
    }
    const resolution = resolveSplitFirePlan(attacker, plan, currentTargetModels, prng, command);
    if ('code' in resolution) return { accepted: false, state, rejection: resolution };
    resolutions.push(resolution);
    targetModels.set(plan.target.id, resolution.targetModelsAfter);
    prng = resolution.attackGroup!.prngAfter;
    nextResolutionIndex += 1;
  }
  if (nextResolutionIndex < plans.length) {
    const postResultsState = derivedStateAfterSplitResults(state, resolutions);
    const pending: PendingSplitFireShootingResolutionV1 = {
      originCommandId: command.id,
      attackerUnitId: attacker.id,
      declarations: plans.map((plan) => plan.declaration),
      nextResolutionIndex,
      resolutions,
      choices: [],
      retargetOptionTargetUnitIds: retargetOptionTargetIds(postResultsState, command, environment, plans[nextResolutionIndex].declaration),
      shootingEnvironmentFingerprint: environment.fingerprint,
      prngBefore: state.prng,
      prngAfter: prng,
      sourceRefs: uniqueSources([...splitFireSourceRefs(plans, resolutions), OFFICIAL_APP_TARGET_NO_LONGER_ELIGIBLE_SOURCE])
    };
    const stageEvent: GameEvent = { id: `${command.id}:0`, commandId: command.id, type: 'split-fire-stage-resolved', resolution: pending };
    const decisionEvent: GameEvent = { id: `${command.id}:1`, commandId: command.id, type: 'decision-requested', decision: splitFireRetargetRequest(pending, attacker.playerId) };
    const events = [stageEvent, decisionEvent] as const;
    return { accepted: true, state: events.reduce(unsafeReduceGameEvent, state), events };
  }
  const event: Extract<GameEvent, { readonly type: 'split-fire-resolved' }> = {
    id: `${command.id}:0`,
    commandId: command.id,
    type: 'split-fire-resolved',
    attackerUnitId: attacker.id,
    resolutions,
    shootingEnvironmentFingerprint: environment.fingerprint,
    prngBefore: state.prng,
    prngAfter: prng,
    sourceRefs: splitFireSourceRefs(plans, resolutions)
  };
  return { accepted: true, state: unsafeReduceGameEvent(state, event), events: [event] };
}

/** Resolves the V5 reciblage window without allowing the UI to supply measurements. */
export function executeSplitFireRetargetDecisionCommand(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'resolve-decision' }>,
  environment: ShootingEnvironment
): CommandExecution {
  const validation = validateGameCommand(state, command);
  if (validation) return { accepted: false, state, rejection: validation };
  const environmentRejection = validateEnvironment(environment, command);
  if (environmentRejection) return { accepted: false, state, rejection: environmentRejection };
  if (state.shootingEnvironmentFingerprint !== environment.fingerprint) return { accepted: false, state, rejection: reject(command, 'shooting-environment-mismatch', 'L’environnement de tir ne correspond pas à la session.', [TRUST_RULE_ID]) };
  const pending = state.pendingSplitFireShooting;
  const attacker = pending ? state.units[pending.attackerUnitId] : undefined;
  const decision = state.pendingDecisions.find((entry) => entry.id === command.decisionId);
  const declaration = pending?.declarations[pending.nextResolutionIndex];
  if (!pending || !attacker || !decision || !declaration || decision.kind !== 'split-fire-retarget'
    || decision.id !== `${pending.originCommandId}:split-fire:retarget:${pending.nextResolutionIndex}`
    || decision.playerId !== command.actorId || !decision.options.some((option) => option.id === command.optionId)) {
    return { accepted: false, state, rejection: reject(command, 'invalid-split-fire-retarget-decision', 'La décision de reciblage ne correspond pas au tir partagé en attente.', [SHOOTING_RULE_ID]) };
  }
  const scheduledDeclarations = scheduleSplitFireRetarget(pending.declarations, pending.nextResolutionIndex, command.optionId);
  const splitCommand: Extract<GameCommand, { readonly type: 'resolve-split-fire' }> = {
    id: pending.originCommandId,
    actorId: attacker.playerId,
    type: 'resolve-split-fire',
    attackerUnitId: attacker.id,
    assignments: scheduledDeclarations,
    resolutionOrder: scheduledDeclarations.map((entry) => entry.id)
  };
  const choice: SplitFireRetargetChoiceV1 = { assignmentId: declaration.id, targetUnitId: command.optionId };
  const planned: PlannedSplitFireAssignment[] = [];
  let cursor = pending.nextResolutionIndex;
  const newResolutions: SplitFireResolutionV1[] = [];
  let workingState = state;
  let prng = state.prng;
  if (choice.targetUnitId === 'abandon') {
    const originalTarget = workingState.units[declaration.targetUnitId];
    if (!originalTarget || originalTarget.models.some((model) => model.active)) return { accepted: false, state, rejection: reject(command, 'invalid-split-fire-retarget-decision', 'L’abandon n’est disponible que lorsque la cible initiale n’est plus active.', [SHOOTING_RULE_ID]) };
    newResolutions.push({ declaration, outcome: 'target-no-longer-active', casualtyModelIds: [], targetModelsAfter: originalTarget.models });
    cursor += 1;
  }
  for (; cursor < scheduledDeclarations.length; cursor += 1) {
    const nextDeclaration = scheduledDeclarations[cursor];
    const target = workingState.units[nextDeclaration.targetUnitId];
    if (!target || !target.models.some((model) => model.active)) break;
    const plan = splitFireAssignmentPlan(workingState, splitCommand, environment, nextDeclaration);
    if ('code' in plan) return { accepted: false, state, rejection: plan };
    planned.push(plan);
    const result = resolveSplitFirePlan(attacker, plan, target.models, prng, splitCommand);
    if ('code' in result) return { accepted: false, state, rejection: result };
    newResolutions.push(result);
    workingState = derivedStateAfterSplitResults(workingState, [result]);
    prng = result.attackGroup!.prngAfter;
  }
  const allResolutions = [...pending.resolutions, ...newResolutions];
  const choices = [...pending.choices, choice];
  const complete = cursor === pending.declarations.length;
  const nextDeclaration = complete ? undefined : pending.declarations[cursor];
  const continuation: PendingSplitFireShootingResolutionV1 = {
    ...pending,
    declarations: scheduledDeclarations,
    nextResolutionIndex: cursor,
    resolutions: allResolutions,
    choices,
    retargetOptionTargetUnitIds: nextDeclaration === undefined ? [] : retargetOptionTargetIds(workingState, splitCommand, environment, nextDeclaration),
    prngAfter: prng,
    sourceRefs: uniqueSources([...pending.sourceRefs, OFFICIAL_APP_TARGET_NO_LONGER_ELIGIBLE_SOURCE, ...splitFireSourceRefs(planned, newResolutions)])
  };
  const choiceEvent: GameEvent = { id: `${command.id}:0`, commandId: command.id, type: 'split-fire-retarget-choice-resolved', decisionId: decision.id, playerId: command.actorId, choice };
  const progressEvent: GameEvent = complete
    ? { id: `${command.id}:1`, commandId: command.id, type: 'split-fire-completed', resolution: continuation }
    : { id: `${command.id}:1`, commandId: command.id, type: 'split-fire-stage-resolved', resolution: continuation };
  const events: readonly GameEvent[] = complete
    ? [choiceEvent, progressEvent]
    : [choiceEvent, progressEvent, { id: `${command.id}:2`, commandId: command.id, type: 'decision-requested', decision: splitFireRetargetRequest(continuation, attacker.playerId) }];
  return { accepted: true, state: events.reduce(unsafeReduceGameEvent, state), events };
}

/** Replays a journal while recomputing every spatial shooting proof from trusted facts. */
export function replayGameEventsWithShootingEnvironment(initialState: GameState, events: readonly GameEvent[], environment: ShootingEnvironment): GameState {
  if (initialState.eventLog.length > 0) throw new Error('A verified replay must start from an event-free initial state.');
  let state = initialState;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.type === 'session-setup' && event.session.shootingEnvironmentFingerprint !== environment.fingerprint) {
      throw new Error('Session setup does not match the trusted shooting environment fingerprint.');
    }
    if (event.type === 'objective-control-resolved') {
      const scoringEvent = events.slice(index).find((candidate) => candidate.commandId === event.commandId && candidate.type === 'mission-scoring-resolved');
      if (scoringEvent?.type === 'mission-scoring-resolved') {
        const command: Extract<GameCommand, { readonly type: 'resolve-mission-scoring' }> = {
          id: event.commandId,
          actorId: state.battle?.activePlayerId ?? '',
          type: 'resolve-mission-scoring'
        };
        const verified = executeMissionScoringCommand(state, command, {
          fingerprint: environment.fingerprint,
          physicalProfiles: environment.physicalProfiles,
          ...(scoringEvent.evidence.battleReadyByPlayerId === null ? {} : { battleReadyByPlayerId: scoringEvent.evidence.battleReadyByPlayerId })
        });
        if (!verified.accepted || !sameJson(verified.events, events.slice(index, index + verified.events.length))) {
          throw new Error(`Mission-scoring event ${scoringEvent.id} failed trusted geometry verification.`);
        }
        state = verified.state;
        index += verified.events.length - 1;
        continue;
      }
      const command: Extract<GameCommand, { readonly type: 'advance-battle-phase' }> = {
        id: event.commandId,
        actorId: state.battle?.activePlayerId ?? '',
        type: 'advance-battle-phase'
      };
      const verified = executeObjectiveAwareAdvanceBattlePhaseCommand(state, command, environment);
      if (!verified.accepted || !sameJson(verified.events, events.slice(index, index + verified.events.length))) {
        throw new Error(`Objective-control event ${event.id} failed trusted geometry verification.`);
      }
      state = verified.state;
      index += verified.events.length - 1;
      continue;
    }
    if (event.type === 'mission-scoring-resolved') {
      throw new Error(`Mission-scoring event ${event.id} is not preceded by its trusted objective checkpoint.`);
    }
    if (event.type === 'unit-deployed') {
      const command: Extract<GameCommand, { readonly type: 'deploy-unit' }> = {
        id: event.commandId,
        actorId: event.playerId,
        type: 'deploy-unit',
        unitId: event.unitId,
        modelPoses: event.modelPoses
      };
      const verified = executeDeploymentCommand(state, command, environment);
      if (!verified.accepted || !sameJson(verified.events[0], event)) {
        throw new Error(`Deployment event ${event.id} failed trusted geometry verification.`);
      }
      state = verified.state;
      continue;
    }
    if (event.type === 'unit-movement-resolved') {
      const command: Extract<GameCommand, { readonly type: 'move-unit' }> = {
        id: event.commandId,
        actorId: event.playerId,
        type: 'move-unit',
        unitId: event.unitId,
        movementType: event.movementType,
        ...(event.fallBackMode === undefined ? {} : { fallBackMode: event.fallBackMode }),
        ...(event.desperateEscape === undefined ? {} : { desperateEscapeAllocationOrder: event.desperateEscape.playerAllocationOrder }),
        paths: event.paths
      };
      const verified = executeCompleteGameMovementCommand(state, command, environment);
      if (!verified.accepted || !sameJson(verified.events[0], event)) {
        throw new Error(`Movement event ${event.id} failed trusted geometry verification.`);
      }
      state = verified.state;
      continue;
    }
    if (event.type === 'charge-declared') {
      const command: Extract<GameCommand, { readonly type: 'declare-charge' }> = {
        id: event.commandId,
        actorId: event.pending.playerId,
        type: 'declare-charge',
        unitId: event.pending.unitId
      };
      const verified = executeDeclareChargeCommand(state, command, environment);
      if (!verified.accepted || !sameJson(verified.events[0], event)) throw new Error(`Charge declaration ${event.id} failed trusted geometry verification.`);
      state = verified.state;
      continue;
    }
    if (event.type === 'charge-resolved') {
      const command: Extract<GameCommand, { readonly type: 'resolve-charge' }> = event.outcome === 'declined'
        ? { id: event.commandId, actorId: event.playerId, type: 'resolve-charge', unitId: event.unitId, proceed: false }
        : { id: event.commandId, actorId: event.playerId, type: 'resolve-charge', unitId: event.unitId, proceed: true, targetUnitIds: event.targetUnitIds, paths: event.paths };
      const verified = executeResolveChargeCommand(state, command, environment);
      if (!verified.accepted || !sameJson(verified.events[0], event)) throw new Error(`Charge resolution ${event.id} failed trusted geometry verification.`);
      state = verified.state;
      continue;
    }
    if (event.type === 'fight-window-passed') {
      const command: Extract<GameCommand, { readonly type: 'pass-fight-window' }> = {
        id: event.commandId,
        actorId: event.playerId,
        type: 'pass-fight-window'
      };
      const verified = executePassFightWindowCommand(state, command, environment);
      if (!verified.accepted || !sameJson(verified.events[0], event)) throw new Error(`Fight pass ${event.id} failed trusted geometry verification.`);
      state = verified.state;
      continue;
    }
    if (event.type === 'fight-movement-resolved') {
      const command: Extract<GameCommand, { readonly type: 'resolve-fight-movement' }> = {
        id: event.commandId,
        actorId: event.playerId,
        type: 'resolve-fight-movement',
        movementKind: event.movementKind,
        unitId: event.unitId,
        targetUnitIds: event.targetUnitIds,
        paths: event.paths
      };
      const verified = executeFightMovementCommand(state, command, environment);
      if (!verified.accepted || !sameJson(verified.events[0], event)) throw new Error(`Fight movement ${event.id} failed trusted geometry verification.`);
      state = verified.state;
      continue;
    }
    if (event.type === 'basic-melee-stage-resolved') {
      const command: Extract<GameCommand, { readonly type: 'resolve-basic-melee' }> = {
        id: event.commandId,
        actorId: event.playerId,
        type: 'resolve-basic-melee',
        attackerUnitId: event.resolution.attackerUnitId,
        targetUnitId: event.resolution.targetUnitId,
        weaponProfileId: event.resolution.weaponProfileId
      };
      const verified = executeBasicMeleeCommand(state, command, environment);
      if (!verified.accepted || !sameJson(verified.events, events.slice(index, index + verified.events.length))) throw new Error(`Basic melee ${event.id} failed trusted verification.`);
      state = verified.state;
      index += verified.events.length - 1;
      continue;
    }
    if (event.type === 'basic-melee-allocation-resolved' && event.decisionId !== null) {
      const command: Extract<GameCommand, { readonly type: 'resolve-decision' }> = {
        id: event.commandId,
        actorId: event.playerId,
        type: 'resolve-decision',
        decisionId: event.decisionId,
        optionId: event.modelId
      };
      const verified = executeBasicMeleeAllocationDecisionCommand(state, command, environment);
      if (!verified.accepted || !sameJson(verified.events, events.slice(index, index + verified.events.length))) throw new Error(`Basic melee allocation ${event.id} failed trusted verification.`);
      state = verified.state;
      index += verified.events.length - 1;
      continue;
    }
    if (event.type === 'basic-melee-allocation-resolved' || event.type === 'basic-melee-resolved'
      || (event.type === 'decision-requested' && event.decision.kind === 'basic-melee-allocation')) {
      throw new Error(`Basic melee continuation ${event.id} is not preceded by its trusted command.`);
    }
    if (event.type === 'empty-fight-resolved') {
      const command: Extract<GameCommand, { readonly type: 'resolve-empty-fight' }> = {
        id: event.commandId,
        actorId: event.playerId,
        type: 'resolve-empty-fight',
        unitId: event.unitId
      };
      const verified = executeEmptyFightCommand(state, command, environment);
      if (!verified.accepted || !sameJson(verified.events[0], event)) throw new Error(`Empty fight ${event.id} failed trusted verification.`);
      state = verified.state;
      continue;
    }
    if (event.type === 'duplicate-weapon-ability-selection-requested') {
      const verified = executeBasicShootingCommand(state, event.selection.originCommand, environment);
      if (!verified.accepted || !sameJson(verified.events, events.slice(index, index + verified.events.length))) {
        throw new Error(`Duplicate weapon ability stage ${event.id} failed trusted verification.`);
      }
      state = verified.state;
      index += verified.events.length - 1;
      continue;
    }
    if (event.type === 'duplicate-weapon-ability-choice-resolved') {
      const command: Extract<GameCommand, { readonly type: 'resolve-decision' }> = {
        id: event.commandId,
        actorId: event.playerId,
        type: 'resolve-decision',
        decisionId: event.decisionId,
        optionId: String(event.selection.selectedOccurrenceIndex)
      };
      const verified = executeDuplicateWeaponAbilityDecisionCommand(state, command, environment);
      if (!verified.accepted || !sameJson(verified.events, events.slice(index, index + verified.events.length))) {
        throw new Error(`Duplicate weapon ability choice ${event.id} failed trusted verification.`);
      }
      state = verified.state;
      index += verified.events.length - 1;
      continue;
    }
    if (event.type === 'split-fire-stage-resolved') {
      const attacker = state.units[event.resolution.attackerUnitId];
      if (!attacker) throw new Error(`Split fire stage ${event.id} cannot find its attacker.`);
      const command: Extract<GameCommand, { readonly type: 'resolve-split-fire' }> = {
        id: event.resolution.originCommandId,
        actorId: attacker.playerId,
        type: 'resolve-split-fire',
        attackerUnitId: event.resolution.attackerUnitId,
        assignments: event.resolution.declarations,
        resolutionOrder: event.resolution.declarations.map((declaration) => declaration.id)
      };
      const verified = executeSplitFireCommand(state, command, environment);
      if (!verified.accepted || !sameJson(verified.events, events.slice(index, index + verified.events.length))) throw new Error(`Split fire stage ${event.id} failed trusted spatial verification.`);
      state = verified.state;
      index += verified.events.length - 1;
      continue;
    }
    if (event.type === 'split-fire-retarget-choice-resolved') {
      const command: Extract<GameCommand, { readonly type: 'resolve-decision' }> = {
        id: event.commandId,
        actorId: event.playerId,
        type: 'resolve-decision',
        decisionId: event.decisionId,
        optionId: event.choice.targetUnitId
      };
      const verified = executeSplitFireRetargetDecisionCommand(state, command, environment);
      if (!verified.accepted || !sameJson(verified.events, events.slice(index, index + verified.events.length))) throw new Error(`Split fire retarget ${event.id} failed trusted spatial verification.`);
      state = verified.state;
      index += verified.events.length - 1;
      continue;
    }
    if (event.type === 'split-fire-resolved') {
      const attacker = state.units[event.attackerUnitId];
      if (!attacker) throw new Error(`Split fire event ${event.id} cannot find its attacker.`);
      const command: Extract<GameCommand, { readonly type: 'resolve-split-fire' }> = {
        id: event.commandId,
        actorId: attacker.playerId,
        type: 'resolve-split-fire',
        attackerUnitId: event.attackerUnitId,
        assignments: event.resolutions.map((resolution) => resolution.declaration),
        resolutionOrder: event.resolutions.map((resolution) => resolution.declaration.id)
      };
      const verified = executeSplitFireCommand(state, command, environment);
      if (!verified.accepted || !sameJson(verified.events[0], event)) throw new Error(`Split fire event ${event.id} failed trusted spatial verification.`);
      state = verified.state;
      continue;
    }
    if (event.type === 'extended-shooting-one-shot-selected' || event.type === 'extended-shooting-stage-resolved') {
      const attackerUnitId = event.type === 'extended-shooting-one-shot-selected' ? event.attackerUnitId : event.resolution.attackerUnitId;
      const nextEvent = events[index + 1];
      const targetUnitId = event.type === 'extended-shooting-one-shot-selected'
        ? (nextEvent?.type === 'extended-shooting-stage-resolved' ? nextEvent.resolution.targetUnitId : undefined)
        : event.resolution.targetUnitId;
      const weaponProfileId = event.type === 'extended-shooting-one-shot-selected' ? event.weaponProfileId : event.resolution.weaponProfileId;
      const attacker = state.units[attackerUnitId];
      if (!attacker || !targetUnitId) throw new Error(`Extended shooting event ${event.id} has no trusted declaration.`);
      const command: Extract<GameCommand, { readonly type: 'resolve-basic-shooting' }> = {
        id: event.commandId, actorId: attacker.playerId, type: 'resolve-basic-shooting', attackerUnitId, targetUnitId, weaponProfileId
      };
      const verified = executeBasicShootingCommand(state, command, environment);
      if (!verified.accepted) throw new Error(`Extended shooting event ${event.id} failed trusted verification.`);
      const expected = events.slice(index, index + verified.events.length);
      if (!sameJson(verified.events, expected)) throw new Error(`Extended shooting event ${event.id} failed trusted verification.`);
      state = verified.state;
      index += verified.events.length - 1;
      continue;
    }
    if (event.type === 'extended-shooting-allocation-choice-resolved') {
      const command: Extract<GameCommand, { readonly type: 'resolve-decision' }> = {
        id: event.commandId, actorId: event.playerId, type: 'resolve-decision', decisionId: event.decisionId,
        optionId: event.choice.kind === 'group' ? event.choice.groupId : event.choice.modelId
      };
      const verified = executeExtendedAllocationDecisionCommand(state, command, environment);
      if (!verified.accepted) throw new Error(`Extended allocation event ${event.id} failed trusted verification.`);
      const expected = events.slice(index, index + verified.events.length);
      if (!sameJson(verified.events, expected)) throw new Error(`Extended allocation event ${event.id} failed trusted verification.`);
      state = verified.state;
      index += verified.events.length - 1;
      continue;
    }
    if (event.type === 'basic-shooting-hit-stage-resolved') {
      const attacker = state.units[event.resolution.attackerUnitId];
      if (!attacker) throw new Error(`Verified lethal replay cannot find attacker ${event.resolution.attackerUnitId}.`);
      const command: Extract<GameCommand, { readonly type: 'resolve-basic-shooting' }> = {
        id: event.commandId,
        actorId: attacker.playerId,
        type: 'resolve-basic-shooting',
        attackerUnitId: event.resolution.attackerUnitId,
        targetUnitId: event.resolution.targetUnitId,
        weaponProfileId: event.resolution.weaponProfileId
      };
      const verified = executeBasicShootingCommand(state, command, environment);
      if (!verified.accepted) throw new Error(`Lethal hit-stage event ${event.id} failed trusted verification.`);
      const expected = events.slice(index, index + verified.events.length);
      if (verified.events.length !== 2 || !sameJson(verified.events, expected)) throw new Error(`Lethal hit-stage event ${event.id} failed trusted verification.`);
      state = verified.state;
      index += verified.events.length - 1;
      continue;
    }
    if (event.type === 'basic-shooting-lethal-choice-resolved') {
      const command: Extract<GameCommand, { readonly type: 'resolve-decision' }> = {
        id: event.commandId,
        actorId: event.playerId,
        type: 'resolve-decision',
        decisionId: event.decisionId,
        optionId: event.choice.optionId
      };
      const verified = executeLethalHitsDecisionCommand(state, command, environment);
      if (!verified.accepted) throw new Error(`Lethal choice event ${event.id} failed trusted verification.`);
      const expected = events.slice(index, index + verified.events.length);
      if (verified.events.length !== 2 || !sameJson(verified.events, expected)) throw new Error(`Lethal choice event ${event.id} failed trusted verification.`);
      state = verified.state;
      index += verified.events.length - 1;
      continue;
    }
    if (event.type === 'basic-shooting-reroll-stage-resolved') {
      if (event.resolution.stage !== 'hit') throw new Error(`Generic reroll stage ${event.id} is not preceded by its trusted decision.`);
      const attacker = state.units[event.resolution.attackerUnitId];
      if (!attacker) throw new Error(`Verified reroll replay cannot find attacker ${event.resolution.attackerUnitId}.`);
      const command: Extract<GameCommand, { readonly type: 'resolve-basic-shooting' }> = {
        id: event.commandId,
        actorId: attacker.playerId,
        type: 'resolve-basic-shooting',
        attackerUnitId: event.resolution.attackerUnitId,
        targetUnitId: event.resolution.targetUnitId,
        weaponProfileId: event.resolution.weaponProfileId
      };
      const verified = executeBasicShootingCommand(state, command, environment);
      if (!verified.accepted) throw new Error(`Generic reroll hit-stage event ${event.id} failed trusted verification.`);
      const expected = events.slice(index, index + verified.events.length);
      if (!sameJson(verified.events, expected)) throw new Error(`Generic reroll hit-stage event ${event.id} failed trusted verification.`);
      state = verified.state;
      index += verified.events.length - 1;
      continue;
    }
    if (event.type === 'basic-shooting-reroll-choice-resolved') {
      const command: Extract<GameCommand, { readonly type: 'resolve-decision' }> = {
        id: event.commandId,
        actorId: event.playerId,
        type: 'resolve-decision',
        decisionId: event.decisionId,
        optionId: event.choice.optionId
      };
      const verified = executeGenericRerollDecisionCommand(state, command, environment);
      if (!verified.accepted) throw new Error(`Generic reroll choice event ${event.id} failed trusted verification.`);
      const expected = events.slice(index, index + verified.events.length);
      if (!sameJson(verified.events, expected)) throw new Error(`Generic reroll choice event ${event.id} failed trusted verification.`);
      state = verified.state;
      index += verified.events.length - 1;
      continue;
    }
    if (event.type === 'split-fire-completed' || event.type === 'basic-shooting-completed' || event.type === 'basic-shooting-reroll-completed'
      || event.type === 'extended-shooting-save-stage-resolved' || event.type === 'extended-shooting-save-resolved' || event.type === 'extended-shooting-packet-resolved' || event.type === 'extended-shooting-packet-lost' || event.type === 'extended-shooting-hazardous-resolved' || event.type === 'extended-shooting-hazardous-packet-resolved' || event.type === 'extended-shooting-hazardous-wounds-lost' || event.type === 'extended-shooting-completed'
      || (event.type === 'decision-requested' && (event.decision.kind === 'lethal-hits-choice' || event.decision.kind === 'generic-reroll-choice' || event.decision.kind === 'extended-allocation-group' || event.decision.kind === 'extended-allocation-model' || event.decision.kind === 'extended-hazardous-allocation' || event.decision.kind === 'split-fire-retarget' || event.decision.kind === 'duplicate-weapon-ability'))) {
      throw new Error(`Lethal shooting event ${event.id} is not preceded by its trusted continuation.`);
    }
    if (event.type === 'decision-resolved' && (state.pendingLethalShooting !== null || state.pendingRerollShooting !== null || state.pendingExtendedShooting !== null || state.pendingBasicMelee !== null || state.pendingSplitFireShooting !== null)) {
      throw new Error(`Lethal decision event ${event.id} bypasses the trusted shooting continuation.`);
    }
    if (event.type === 'oath-of-moment-selected') {
      const command: Extract<GameCommand, { readonly type: 'select-oath-of-moment-target' }> = {
        id: event.commandId,
        actorId: event.selection.playerId,
        type: 'select-oath-of-moment-target',
        targetUnitId: event.selection.targetUnitId
      };
      const verified = executeOathOfMomentSelectionCommand(state, command, environment);
      if (!verified.accepted || !sameJson(verified.events[0], event)) throw new Error(`Oath of Moment event ${event.id} failed trusted verification.`);
      state = verified.state;
      continue;
    }
    if (event.type !== 'basic-shooting-resolved') {
      state = unsafeReduceGameEvent(state, event);
      continue;
    }
    const attacker = state.units[event.attackerUnitId];
    if (!attacker) throw new Error(`Verified shooting replay cannot find attacker ${event.attackerUnitId}.`);
    const command: Extract<GameCommand, { readonly type: 'resolve-basic-shooting' }> = event.weaponProfileIds
      ? {
        id: event.commandId,
        actorId: attacker.playerId,
        type: 'resolve-basic-shooting',
        attackerUnitId: event.attackerUnitId,
        targetUnitId: event.targetUnitId,
        weaponProfileIds: event.weaponProfileIds
      }
      : {
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
