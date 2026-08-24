import { rollDice } from '../domain/prng';
import type {
  BasicShootingAllocationRecord,
  BasicShootingDieStep,
  BasicShootingHitRoll,
  BasicShootingRandomCharacteristicEvidence,
  BasicShootingSaveRoll,
  BasicShootingWoundRoll,
  DieRollModifierSetV1,
  LethalHitsChoiceV1,
  PrngStateV1,
  RerollChoiceV1,
  RerollDieKeyV1,
  SourceReferenceV1,
  WeaponProfileV1
} from '../domain/types';
import { OFFICIAL_APP_RANDOM_CHARACTERISTICS_SOURCE } from './m5-source-references';
import { resolveDieRollModifierPlan } from './modifiers';
import { parseRandomCharacteristicExpression, resolveRandomCharacteristic } from './random-characteristics';
import { hasSupportedWeaponKeywords } from './weapon-keywords';

/** Rule 04 supplies the closed basic ranged-attack sequence. */
export const CORE_BASIC_RANGED_ATTACK_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-core-rules-fr-2026-07',
  version: 'archive-2026-07-28',
  effectiveFrom: '2026-07-28',
  reference: '04'
};

/** Rule 13.08 on printed page 50 supplies the M3 cover modifier. */
export const CORE_BENEFIT_OF_COVER_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-core-rules-fr-2026-07',
  version: 'archive-2026-07-28',
  effectiveFrom: '2026-07-28',
  reference: '13.08',
  page: 50
};

export const CORE_ATTACK_SEQUENCE_STEP_SOURCES: readonly SourceReferenceV1[] = [
  { ...CORE_BASIC_RANGED_ATTACK_SOURCE, reference: '05.01', page: 18 },
  { ...CORE_BASIC_RANGED_ATTACK_SOURCE, reference: '05.02', page: 18 },
  { ...CORE_BASIC_RANGED_ATTACK_SOURCE, reference: '05.03', page: 19 },
  { ...CORE_BASIC_RANGED_ATTACK_SOURCE, reference: '05.04', page: 19 }
];

/** Retained as a stable public descriptor for the pre-M3 rules API. */
export const CORE_ATTACK_SEQUENCE_SOURCE = {
  sourceId: CORE_BASIC_RANGED_ATTACK_SOURCE.sourceId,
  version: CORE_BASIC_RANGED_ATTACK_SOURCE.version,
  effectiveFrom: CORE_BASIC_RANGED_ATTACK_SOURCE.effectiveFrom,
  pages: [16, 18, 19],
  references: [CORE_BASIC_RANGED_ATTACK_SOURCE, ...CORE_ATTACK_SEQUENCE_STEP_SOURCES, CORE_BENEFIT_OF_COVER_SOURCE]
} as const;

/** Backward-compatible numeric subset of WeaponProfileV1. */
export type BasicRangedWeapon = Pick<WeaponProfileV1,
  'id' | 'range' | 'attacks' | 'ballisticSkill' | 'strength' | 'armourPenetration' | 'damage' | 'randomDamage' | 'weaponKeywords'>;

export interface BasicTargetModel {
  readonly id: string;
  readonly wounds: number;
  readonly active: boolean;
}

export interface BasicTargetProfile {
  readonly toughness: number;
  readonly save: number;
  readonly woundsPerModel: number;
  /** Kept for the original standalone API; session play supplies actual models. */
  readonly modelCount?: number;
  /** Actual model identities and current wounds for deterministic allocation. */
  readonly models?: readonly BasicTargetModel[];
  /** Authoritative unit keywords, used only for a covered [ANTI-X Y+] fact. */
  readonly keywords?: readonly string[];
  /** Benefit of Cover degrades BS; it never improves an armour save. */
  readonly coverBallisticSkillPenalty?: number;
}

export interface BasicShootingRequest {
  readonly attackerId: string;
  readonly targetId: string;
  readonly weapon: BasicRangedWeapon;
  readonly target: BasicTargetProfile;
  /** Authoritative edge-to-edge distance in integer world units. */
  readonly distance: number;
  /** Authoritative geometric visibility.  It is not supplied by the UI path. */
  readonly visible: boolean;
  /** Covered attack modifiers derived by orchestration from persistent state. */
  readonly attackModifiers?: {
    readonly rerollFailedHits: boolean;
    readonly woundRollModifier: 0 | 1;
    readonly sourceRefs: readonly SourceReferenceV1[];
    /** Trusted profile fact, applied after any reroll. */
    readonly hitRollModifiers?: DieRollModifierSetV1;
  };
}

export type ShootingRejectionCode = 'not-visible' | 'out-of-range' | 'invalid-profile' | 'lethal-hits-decision-required';

export type ShootingDieStep = BasicShootingDieStep;

export interface ShootingResolution {
  readonly accepted: true;
  readonly source: typeof CORE_ATTACK_SEQUENCE_SOURCE;
  readonly sourceRefs: readonly SourceReferenceV1[];
  readonly hitRequired: number;
  readonly woundRequired: number;
  readonly saveRequired: number;
  readonly steps: readonly ShootingDieStep[];
  readonly hitRolls: readonly BasicShootingHitRoll[];
  readonly woundRolls: readonly BasicShootingWoundRoll[];
  readonly saveRolls: readonly BasicShootingSaveRoll[];
  readonly allocations: readonly BasicShootingAllocationRecord[];
  readonly hits: number;
  readonly wounds: number;
  readonly failedSaves: number;
  readonly damageInflicted: number;
  readonly modelsDestroyed: number;
  readonly destroyedModelIds: readonly string[];
  readonly remainingModels: number;
  readonly remainingWoundsOnDamagedModel: number | null;
  readonly targetModelsAfter: readonly BasicTargetModel[];
  readonly prngAfter: PrngStateV1;
}

/** Deterministic checkpoint after every 05.01 hit die and before 05.02. */
export interface LethalHitsHitStageResolution {
  readonly accepted: true;
  readonly sourceRefs: readonly SourceReferenceV1[];
  readonly hitRequired: number;
  readonly woundRequired: number;
  readonly saveRequired: number;
  readonly hitRolls: readonly BasicShootingHitRoll[];
  readonly prngAfter: PrngStateV1;
}

export type LethalHitsHitStageResult = LethalHitsHitStageResolution | {
  readonly accepted: false;
  readonly code: ShootingRejectionCode;
  readonly message: string;
  readonly sourceRefs: readonly SourceReferenceV1[];
  readonly prngAfter: PrngStateV1;
};

/** The unmodified hit checkpoint for the optional generic-reroll fixture. */
export interface RerollableHitStageResolution {
  readonly accepted: true;
  readonly sourceRefs: readonly SourceReferenceV1[];
  readonly hitRequired: number;
  readonly woundRequired: number;
  readonly saveRequired: number;
  readonly hitRolls: readonly BasicShootingHitRoll[];
  readonly prngAfter: PrngStateV1;
}

export type RerollableHitStageResult = RerollableHitStageResolution | {
  readonly accepted: false;
  readonly code: ShootingRejectionCode;
  readonly message: string;
  readonly sourceRefs: readonly SourceReferenceV1[];
  readonly prngAfter: PrngStateV1;
};

/** Original wound dice after final hit rerolls and hit modifiers. */
export interface RerollableWoundStageResolution {
  readonly accepted: true;
  readonly sourceRefs: readonly SourceReferenceV1[];
  readonly hitRequired: number;
  readonly woundRequired: number;
  readonly saveRequired: number;
  readonly hitRolls: readonly BasicShootingHitRoll[];
  readonly woundRolls: readonly BasicShootingWoundRoll[];
  readonly prngAfter: PrngStateV1;
}

export type RerollableWoundStageResult = RerollableWoundStageResolution | {
  readonly accepted: false;
  readonly code: ShootingRejectionCode;
  readonly message: string;
  readonly sourceRefs: readonly SourceReferenceV1[];
  readonly prngAfter: PrngStateV1;
};

export type ShootingResult = ShootingResolution | {
  readonly accepted: false;
  readonly code: ShootingRejectionCode;
  readonly message: string;
  readonly source: typeof CORE_ATTACK_SEQUENCE_SOURCE;
  readonly sourceRefs: readonly SourceReferenceV1[];
  readonly prngAfter: PrngStateV1;
};

export function requiredWoundRoll(strength: number, toughness: number): number {
  if (strength >= toughness * 2) return 2;
  if (strength > toughness) return 3;
  if (strength === toughness) return 4;
  if (strength * 2 <= toughness) return 6;
  return 5;
}

function validRequest(request: BasicShootingRequest): boolean {
  const { weapon, target } = request;
  const targetModelsValid = target.models === undefined
    ? Number.isInteger(target.modelCount) && (target.modelCount ?? 0) > 0
    : target.models.length > 0
      && new Set(target.models.map((model) => model.id)).size === target.models.length
      && target.models.every((model) => model.id.trim().length > 0
        && Number.isInteger(model.wounds)
        && model.wounds >= 0
        && model.wounds <= target.woundsPerModel
        && (model.active || model.wounds === 0));
  const damageValid = weapon.randomDamage === undefined
    ? Number.isInteger(weapon.damage) && weapon.damage > 0
    : parseRandomCharacteristicExpression(weapon.randomDamage).accepted;
  const hitRollModifiersValid = request.attackModifiers?.hitRollModifiers === undefined
    || resolveDieRollModifierPlan({ rollKind: 'hit', unmodifiedRoll: 1, sides: 6, ...request.attackModifiers.hitRollModifiers }).accepted;
  return [weapon.range, weapon.attacks, weapon.ballisticSkill, weapon.strength,
    target.toughness, target.save, target.woundsPerModel]
    .every((value) => Number.isInteger(value) && value >= 0)
    && Number.isFinite(request.distance) && request.distance >= 0
    // 02.02.01 allows a modified CT between 1+ and 7+.  Unmodified profiles
    // are still validated at setup; this resolver receives the final trusted
    // characteristic from orchestration.
    && weapon.attacks > 0 && weapon.ballisticSkill >= 1 && weapon.ballisticSkill <= 7
    && weapon.strength > 0 && damageValid && target.toughness > 0
    && target.save >= 2 && target.save <= 7 && target.woundsPerModel > 0
    && Number.isInteger(weapon.armourPenetration) && weapon.armourPenetration <= 0
    && hasSupportedWeaponKeywords(weapon.weaponKeywords)
    && (target.keywords === undefined || (new Set(target.keywords.map((keyword) => keyword.trim().toUpperCase())).size === target.keywords.length
      && target.keywords.every((keyword) => keyword.trim().length > 0)))
    && (target.coverBallisticSkillPenalty === undefined
      || target.coverBallisticSkillPenalty === 0
      || target.coverBallisticSkillPenalty === 1)
    && (request.attackModifiers === undefined
      || (typeof request.attackModifiers.rerollFailedHits === 'boolean'
        && (request.attackModifiers.woundRollModifier === 0 || request.attackModifiers.woundRollModifier === 1)
        && Array.isArray(request.attackModifiers.sourceRefs)
        && hitRollModifiersValid))
    && targetModelsValid;
}

function normaliseTargetModels(target: BasicTargetProfile): BasicTargetModel[] {
  if (target.models) return [...target.models].sort((left, right) => left.id.localeCompare(right.id));
  return Array.from({ length: target.modelCount ?? 0 }, (_unused, index) => ({
    id: `model-${String(index + 1).padStart(6, '0')}`,
    wounds: target.woundsPerModel,
    active: true
  }));
}

function selectAllocatedModel(models: readonly BasicTargetModel[], woundsPerModel: number): BasicTargetModel | undefined {
  const active = models.filter((model) => model.active);
  return active.find((model) => model.wounds < woundsPerModel) ?? active[0];
}

/** 05.01: an unmodified 1 always fails and an unmodified 6 always hits critically. */
function isSuccessfulHit(unmodifiedRoll: number, resolvedRoll: number, hitRequired: number): boolean {
  return unmodifiedRoll !== 1 && (unmodifiedRoll === 6 || resolvedRoll >= hitRequired);
}

function normaliseKeyword(keyword: string): string {
  return keyword.trim().replace(/\s+/gu, ' ').toUpperCase();
}

interface CriticalTriggerFacts {
  readonly antiCriticalWound?: 2 | 3 | 4 | 5 | 6;
  readonly sustainedHits?: number;
}

interface PendingHitInstance {
  readonly attackIndex: number;
  readonly generatedByCriticalHitOfAttackIndex?: number;
}

function criticalTriggerFacts(request: BasicShootingRequest): CriticalTriggerFacts {
  const targetKeywords = new Set((request.target.keywords ?? []).map(normaliseKeyword));
  const anti = request.weapon.weaponKeywords?.find((keyword) => keyword.kind === 'anti');
  const sustained = request.weapon.weaponKeywords?.find((keyword) => keyword.kind === 'sustained-hits');
  return {
    ...(anti?.kind === 'anti' && targetKeywords.has(normaliseKeyword(anti.targetKeyword)) ? { antiCriticalWound: anti.criticalWound } : {}),
    ...(sustained?.kind === 'sustained-hits' ? { sustainedHits: sustained.value } : {})
  };
}

function requiresLethalHitsDecision(request: BasicShootingRequest): boolean {
  return request.weapon.weaponKeywords?.some((keyword) => keyword.kind === 'lethal-hits') ?? false;
}

function shootingSourceRefs(request: BasicShootingRequest, modifiers: NonNullable<BasicShootingRequest['attackModifiers']>): readonly SourceReferenceV1[] {
  return [
    CORE_BASIC_RANGED_ATTACK_SOURCE,
    ...CORE_ATTACK_SEQUENCE_STEP_SOURCES,
    ...(request.target.coverBallisticSkillPenalty ? [CORE_BENEFIT_OF_COVER_SOURCE] : []),
    ...modifiers.sourceRefs,
    ...(request.weapon.weaponKeywords?.map((keyword) => keyword.source) ?? []),
    ...(request.weapon.randomDamage === undefined ? [] : [OFFICIAL_APP_RANDOM_CHARACTERISTICS_SOURCE])
  ];
}

/**
 * Resolves exactly rule 05.01. This is intentionally separate from the
 * ordinary atomic resolver so a [LETHAL HITS] choice cannot be skipped.
 */
export function resolveLethalHitsHitStage(request: BasicShootingRequest, prng: PrngStateV1): LethalHitsHitStageResult {
  const modifiers = request.attackModifiers ?? { rerollFailedHits: false, woundRollModifier: 0 as const, sourceRefs: [] };
  const sourceRefs = shootingSourceRefs(request, modifiers);
  if (!validRequest(request) || !requiresLethalHitsDecision(request)) {
    return { accepted: false, code: 'invalid-profile', message: 'Le profil [TOUCHES FATALES] fermé est invalide.', sourceRefs, prngAfter: prng };
  }
  if (!request.visible) return { accepted: false, code: 'not-visible', message: 'La cible doit être visible pour ce profil de tir direct.', sourceRefs, prngAfter: prng };
  if (request.distance > request.weapon.range) return { accepted: false, code: 'out-of-range', message: 'La cible est au-delà de la portée de l’arme.', sourceRefs, prngAfter: prng };

  const woundRequired = Math.max(2, requiredWoundRoll(request.weapon.strength, request.target.toughness) - modifiers.woundRollModifier);
  const hitRequired = Math.min(7, request.weapon.ballisticSkill + (request.target.coverBallisticSkillPenalty ?? 0));
  const saveRequired = Math.max(2, request.target.save - request.weapon.armourPenetration);
  let currentPrng = prng;
  const hitOutcome = rollDice(currentPrng, 6, request.weapon.attacks);
  currentPrng = hitOutcome.state;
  let hitRolls: BasicShootingHitRoll[] = hitOutcome.results.map((roll, attackIndex) => ({ attackIndex, roll, hit: isSuccessfulHit(roll, roll, hitRequired), critical: roll === 6 }));
  if (modifiers.rerollFailedHits) {
    const failedHits = hitRolls.filter((entry) => !entry.hit);
    const rerollOutcome = failedHits.length === 0 ? { results: [] as number[], state: currentPrng } : rollDice(currentPrng, 6, failedHits.length);
    currentPrng = rerollOutcome.state;
    const rerollsByAttack = new Map(failedHits.map((entry, index) => [entry.attackIndex, rerollOutcome.results[index]]));
    hitRolls = hitRolls.map((entry) => {
      const reroll = rerollsByAttack.get(entry.attackIndex);
      return reroll === undefined ? entry : { ...entry, rerollRoll: reroll, hit: isSuccessfulHit(reroll, reroll, hitRequired), critical: reroll === 6 };
    });
  }
  if (modifiers.hitRollModifiers !== undefined) {
    hitRolls = hitRolls.map((entry) => {
      const unmodifiedRoll = entry.rerollRoll ?? entry.roll;
      const modified = resolveDieRollModifierPlan({ rollKind: 'hit', unmodifiedRoll, sides: 6, ...modifiers.hitRollModifiers! });
      if (!modified.accepted) throw new RangeError(`Hit roll modifiers could not be resolved: ${modified.code}.`);
      return { ...entry, modifiedRoll: modified.modifiedRoll, hit: isSuccessfulHit(unmodifiedRoll, modified.modifiedRoll, hitRequired), critical: unmodifiedRoll === 6 };
    });
  }
  return { accepted: true, sourceRefs, hitRequired, woundRequired, saveRequired, hitRolls, prngAfter: currentPrng };
}

/** 05.02: an unmodified 1 always fails; 6 is critical, or [ANTI-X Y+] may lower that critical threshold. */
function woundOutcome(unmodifiedRoll: number, woundRequired: number, antiCriticalWound: number | undefined): { readonly wound: boolean; readonly critical: boolean } {
  const critical = unmodifiedRoll !== 1 && (unmodifiedRoll === 6 || (antiCriticalWound !== undefined && unmodifiedRoll >= antiCriticalWound));
  return { wound: unmodifiedRoll !== 1 && (critical || unmodifiedRoll >= woundRequired), critical };
}

function rerollChoicesMatch(
  keys: readonly RerollDieKeyV1[],
  choices: readonly RerollChoiceV1[],
  rollKind: 'hit' | 'wound'
): boolean {
  return choices.length === keys.length
    && choices.every((choice, index) => choice.rollKind === rollKind
      && (choice.optionId === 'keep' || choice.optionId === 'reroll')
      && choice.groupIndex === keys[index]?.groupIndex
      && choice.attackIndex === keys[index]?.attackIndex);
}

function hitRerolls(
  request: BasicShootingRequest,
  initialRolls: readonly BasicShootingHitRoll[],
  choices: readonly RerollChoiceV1[],
  prng: PrngStateV1,
  hitRequired: number
): { readonly hitRolls: readonly BasicShootingHitRoll[]; readonly prngAfter: PrngStateV1 } {
  const selected = choices.filter((choice) => choice.optionId === 'reroll');
  const rerollOutcome = selected.length === 0 ? { results: [] as number[], state: prng } : rollDice(prng, 6, selected.length);
  const rerolls = new Map(selected.map((choice, index) => [choice.attackIndex, rerollOutcome.results[index]]));
  let hitRolls = initialRolls.map((entry) => {
    const reroll = rerolls.get(entry.attackIndex);
    const unmodifiedRoll = reroll ?? entry.roll;
    return {
      attackIndex: entry.attackIndex,
      roll: entry.roll,
      ...(reroll === undefined ? {} : { rerollRoll: reroll }),
      hit: isSuccessfulHit(unmodifiedRoll, unmodifiedRoll, hitRequired),
      critical: unmodifiedRoll === 6
    };
  });
  const modifiers = request.attackModifiers;
  if (modifiers?.hitRollModifiers !== undefined) {
    hitRolls = hitRolls.map((entry) => {
      const unmodifiedRoll = entry.rerollRoll ?? entry.roll;
      const modified = resolveDieRollModifierPlan({ rollKind: 'hit', unmodifiedRoll, sides: 6, ...modifiers.hitRollModifiers! });
      if (!modified.accepted) throw new RangeError(`Hit roll modifiers could not be resolved: ${modified.code}.`);
      return {
        ...entry,
        modifiedRoll: modified.modifiedRoll,
        hit: isSuccessfulHit(unmodifiedRoll, modified.modifiedRoll, hitRequired),
        critical: unmodifiedRoll === 6
      };
    });
  }
  return { hitRolls, prngAfter: rerollOutcome.state };
}

/** Rolls original hit dice only, leaving every individual reroll to the player. */
export function resolveRerollableHitStage(request: BasicShootingRequest, prng: PrngStateV1): RerollableHitStageResult {
  const modifiers = request.attackModifiers ?? { rerollFailedHits: false, woundRollModifier: 0 as const, sourceRefs: [] };
  const sourceRefs = shootingSourceRefs(request, modifiers);
  if (!validRequest(request) || requiresLethalHitsDecision(request)) {
    return { accepted: false, code: 'invalid-profile', message: 'Le profil de relance générique fermé est invalide.', sourceRefs, prngAfter: prng };
  }
  if (!request.visible) return { accepted: false, code: 'not-visible', message: 'La cible doit être visible pour ce profil de tir direct.', sourceRefs, prngAfter: prng };
  if (request.distance > request.weapon.range) return { accepted: false, code: 'out-of-range', message: 'La cible est au-delà de la portée de l’arme.', sourceRefs, prngAfter: prng };
  if (modifiers.rerollFailedHits) {
    return { accepted: false, code: 'invalid-profile', message: 'La relance générique journalisée ne se cumule pas avec la relance automatique existante.', sourceRefs, prngAfter: prng };
  }
  const woundRequired = Math.max(2, requiredWoundRoll(request.weapon.strength, request.target.toughness) - modifiers.woundRollModifier);
  const hitRequired = Math.min(7, request.weapon.ballisticSkill + (request.target.coverBallisticSkillPenalty ?? 0));
  const saveRequired = Math.max(2, request.target.save - request.weapon.armourPenetration);
  const hitOutcome = rollDice(prng, 6, request.weapon.attacks);
  return {
    accepted: true,
    sourceRefs,
    hitRequired,
    woundRequired,
    saveRequired,
    hitRolls: hitOutcome.results.map((roll, attackIndex) => ({ attackIndex, roll, hit: isSuccessfulHit(roll, roll, hitRequired), critical: roll === 6 })),
    prngAfter: hitOutcome.state
  };
}

/** Applies journaled hit choices, then rolls the original wound dice. */
export function resolveRerollableWoundStage(
  request: BasicShootingRequest,
  hitStage: RerollableHitStageResolution,
  hitChoices: readonly RerollChoiceV1[],
  prng: PrngStateV1
): RerollableWoundStageResult {
  const modifiers = request.attackModifiers ?? { rerollFailedHits: false, woundRollModifier: 0 as const, sourceRefs: [] };
  const sourceRefs = shootingSourceRefs(request, modifiers);
  const invalid = (message: string): RerollableWoundStageResult => ({ accepted: false, code: 'invalid-profile', message, sourceRefs, prngAfter: prng });
  const hitKeys = hitStage.hitRolls.map((roll) => ({ groupIndex: 0, attackIndex: roll.attackIndex }));
  if (!validRequest(request) || requiresLethalHitsDecision(request) || modifiers.rerollFailedHits) return invalid('Le profil de relance de touche est invalide.');
  if (!rerollChoicesMatch(hitKeys, hitChoices, 'hit')) return invalid('Les choix de relance de touche doivent couvrir chaque dé éligible, une seule fois et dans l’ordre.');
  if (hitStage.hitRolls.length !== request.weapon.attacks
    || !hitStage.hitRolls.every((roll, index) => roll.attackIndex === index && Number.isInteger(roll.roll) && roll.roll >= 1 && roll.roll <= 6 && roll.rerollRoll === undefined && roll.modifiedRoll === undefined)) {
    return invalid('Le stade de touche initial est incompatible avec le tir autoritaire.');
  }
  const woundRequired = Math.max(2, requiredWoundRoll(request.weapon.strength, request.target.toughness) - modifiers.woundRollModifier);
  const hitRequired = Math.min(7, request.weapon.ballisticSkill + (request.target.coverBallisticSkillPenalty ?? 0));
  const saveRequired = Math.max(2, request.target.save - request.weapon.armourPenetration);
  if (hitStage.hitRequired !== hitRequired || hitStage.woundRequired !== woundRequired || hitStage.saveRequired !== saveRequired) return invalid('Le seuil de relance ne correspond pas au tir autoritaire.');
  const resolvedHits = hitRerolls(request, hitStage.hitRolls, hitChoices, prng, hitRequired);
  const triggers = criticalTriggerFacts(request);
  const hitInstances: PendingHitInstance[] = [];
  let nextGeneratedAttackIndex = resolvedHits.hitRolls.length;
  for (const hit of resolvedHits.hitRolls.filter((entry) => entry.hit)) {
    hitInstances.push({ attackIndex: hit.attackIndex });
    for (let generated = 0; generated < (hit.critical ? (triggers.sustainedHits ?? 0) : 0); generated += 1) {
      hitInstances.push({ attackIndex: nextGeneratedAttackIndex, generatedByCriticalHitOfAttackIndex: hit.attackIndex });
      nextGeneratedAttackIndex += 1;
    }
  }
  const woundOutcomeDice = hitInstances.length === 0 ? { results: [] as number[], state: resolvedHits.prngAfter } : rollDice(resolvedHits.prngAfter, 6, hitInstances.length);
  return {
    accepted: true,
    sourceRefs,
    hitRequired,
    woundRequired,
    saveRequired,
    hitRolls: resolvedHits.hitRolls,
    woundRolls: hitInstances.map((instance, index) => {
      const roll = woundOutcomeDice.results[index];
      const outcome = woundOutcome(roll, woundRequired, triggers.antiCriticalWound);
      return {
        attackIndex: instance.attackIndex,
        roll,
        wound: outcome.wound,
        critical: outcome.critical,
        ...(instance.generatedByCriticalHitOfAttackIndex === undefined ? {} : { generatedByCriticalHitOfAttackIndex: instance.generatedByCriticalHitOfAttackIndex })
      };
    }),
    prngAfter: woundOutcomeDice.state
  };
}

/** Applies the one permitted wound reroll, then finishes saves and allocation. */
export function resolveRerollableShootingContinuation(
  request: BasicShootingRequest,
  woundStage: RerollableWoundStageResolution,
  woundChoices: readonly RerollChoiceV1[],
  prng: PrngStateV1
): ShootingResult {
  const modifiers = request.attackModifiers ?? { rerollFailedHits: false, woundRollModifier: 0 as const, sourceRefs: [] };
  const sourceRefs = shootingSourceRefs(request, modifiers);
  const invalid = (message: string): ShootingResult => ({ accepted: false, code: 'invalid-profile', message, source: CORE_ATTACK_SEQUENCE_SOURCE, sourceRefs, prngAfter: prng });
  const woundKeys = woundStage.woundRolls.map((roll) => ({ groupIndex: 0, attackIndex: roll.attackIndex }));
  if (!validRequest(request) || requiresLethalHitsDecision(request) || modifiers.rerollFailedHits) return invalid('Le profil de relance de blessure est invalide.');
  if (!rerollChoicesMatch(woundKeys, woundChoices, 'wound')) return invalid('Les choix de relance de blessure doivent couvrir chaque dé éligible, une seule fois et dans l’ordre.');
  if (!woundStage.woundRolls.every((roll) => Number.isInteger(roll.roll) && (roll.roll ?? 0) >= 1 && (roll.roll ?? 0) <= 6 && roll.rerollRoll === undefined)) {
    return invalid('Le stade de blessure initial est incompatible avec le tir autoritaire.');
  }
  const woundRequired = Math.max(2, requiredWoundRoll(request.weapon.strength, request.target.toughness) - modifiers.woundRollModifier);
  const hitRequired = Math.min(7, request.weapon.ballisticSkill + (request.target.coverBallisticSkillPenalty ?? 0));
  const saveRequired = Math.max(2, request.target.save - request.weapon.armourPenetration);
  if (woundStage.hitRequired !== hitRequired || woundStage.woundRequired !== woundRequired || woundStage.saveRequired !== saveRequired) return invalid('Le seuil de blessure ne correspond pas au tir autoritaire.');
  const selected = woundChoices.filter((choice) => choice.optionId === 'reroll');
  const rerollOutcome = selected.length === 0 ? { results: [] as number[], state: prng } : rollDice(prng, 6, selected.length);
  const rerolls = new Map(selected.map((choice, index) => [choice.attackIndex, rerollOutcome.results[index]]));
  const triggers = criticalTriggerFacts(request);
  const woundRolls = woundStage.woundRolls.map((entry) => {
    const reroll = rerolls.get(entry.attackIndex);
    const roll = reroll ?? entry.roll;
    if (roll === undefined) throw new Error('A generic reroll wound stage cannot contain an automatic wound.');
    const outcome = woundOutcome(roll, woundRequired, triggers.antiCriticalWound);
    return {
      ...entry,
      ...(reroll === undefined ? {} : { rerollRoll: reroll }),
      wound: outcome.wound,
      critical: outcome.critical
    };
  });
  const successfulWounds = woundRolls.filter((entry) => entry.wound);
  let currentPrng = rerollOutcome.state;
  const saveOutcome = successfulWounds.length === 0 ? { results: [] as number[], state: currentPrng } : rollDice(currentPrng, 6, successfulWounds.length);
  currentPrng = saveOutcome.state;
  const saveRolls: BasicShootingSaveRoll[] = saveOutcome.results.map((roll, index) => ({ attackIndex: successfulWounds[index].attackIndex, roll, saved: saveRequired <= 6 && roll >= saveRequired }));
  let targetModels = normaliseTargetModels(request.target);
  let damageInflicted = 0;
  const destroyedModelIds: string[] = [];
  const allocations: BasicShootingAllocationRecord[] = [];
  for (const save of [...saveRolls].sort((left, right) => left.roll - right.roll || left.attackIndex - right.attackIndex)) {
    const allocated = selectAllocatedModel(targetModels, request.target.woundsPerModel);
    if (!allocated) {
      allocations.push({ attackIndex: save.attackIndex, saveRoll: save.roll, outcome: 'lost-no-target' });
      continue;
    }
    if (save.saved) {
      allocations.push({ attackIndex: save.attackIndex, saveRoll: save.roll, outcome: 'saved' });
      continue;
    }
    let damageCharacteristic = request.weapon.damage;
    let randomDamage: BasicShootingRandomCharacteristicEvidence | undefined;
    if (request.weapon.randomDamage !== undefined) {
      const randomResolution = resolveRandomCharacteristic(request.weapon.randomDamage, { characteristic: 'damage', timing: 'allocate-damage' }, currentPrng);
      if (!randomResolution.accepted) throw new RangeError(`Variable damage could not be resolved: ${randomResolution.code}.`);
      currentPrng = randomResolution.prngAfter;
      damageCharacteristic = randomResolution.value;
      randomDamage = { expression: request.weapon.randomDamage, dice: randomResolution.dice, value: randomResolution.value, sourceRefs: randomResolution.sourceRefs };
    }
    const appliedDamage = Math.min(damageCharacteristic, allocated.wounds);
    damageInflicted += appliedDamage;
    const woundsAfter = allocated.wounds - appliedDamage;
    const destroyed = woundsAfter === 0;
    if (destroyed) destroyedModelIds.push(allocated.id);
    targetModels = targetModels.map((model) => model.id !== allocated.id ? model : { ...model, wounds: woundsAfter, active: !destroyed });
    allocations.push({ attackIndex: save.attackIndex, saveRoll: save.roll, outcome: destroyed ? 'destroyed' : 'damaged', damage: appliedDamage, ...(randomDamage === undefined ? {} : { randomDamage }), allocatedModelId: allocated.id, ...(destroyed ? { destroyedModelId: allocated.id } : {}) });
  }
  const saveByAttack = new Map(saveRolls.map((entry) => [entry.attackIndex, entry]));
  const allocationByAttack = new Map(allocations.map((entry) => [entry.attackIndex, entry]));
  const hitByAttack = new Map(woundStage.hitRolls.map((entry) => [entry.attackIndex, entry]));
  const woundSteps: ShootingDieStep[] = woundRolls.map((wound) => {
    const hit = hitByAttack.get(wound.attackIndex);
    if (!hit?.hit) throw new Error('A failed hit cannot reach the wound stage.');
    const finalHitRoll = hit.modifiedRoll ?? hit.rerollRoll ?? hit.roll;
    const finalWoundRoll = wound.rerollRoll ?? wound.roll;
    const hitRerollFields = hit.rerollRoll === undefined ? {} : { initialHitRoll: hit.roll };
    const woundRerollFields = wound.rerollRoll === undefined ? {} : { initialWoundRoll: wound.roll };
    if (!wound.wound) return { attackIndex: wound.attackIndex, outcome: 'failed-to-wound', hitRoll: finalHitRoll, hit: true, criticalHit: hit.critical, ...(wound.generatedByCriticalHitOfAttackIndex === undefined ? {} : { generatedByCriticalHitOfAttackIndex: wound.generatedByCriticalHitOfAttackIndex }), woundRoll: finalWoundRoll, wound: false, criticalWound: wound.critical, ...hitRerollFields, ...woundRerollFields };
    const save = saveByAttack.get(wound.attackIndex)!;
    const allocation = allocationByAttack.get(wound.attackIndex)!;
    return { attackIndex: wound.attackIndex, outcome: allocation.outcome, hitRoll: finalHitRoll, hit: true, criticalHit: hit.critical, ...(wound.generatedByCriticalHitOfAttackIndex === undefined ? {} : { generatedByCriticalHitOfAttackIndex: wound.generatedByCriticalHitOfAttackIndex }), woundRoll: finalWoundRoll, wound: true, criticalWound: wound.critical, saveRoll: save.roll, saved: allocation.outcome === 'saved', ...(allocation.damage === undefined ? {} : { damage: allocation.damage }), ...(allocation.randomDamage === undefined ? {} : { randomDamage: allocation.randomDamage }), ...(allocation.allocatedModelId === undefined ? {} : { allocatedModelId: allocation.allocatedModelId }), ...(allocation.destroyedModelId === undefined ? {} : { destroyedModelId: allocation.destroyedModelId }), ...hitRerollFields, ...woundRerollFields };
  });
  const missedSteps: ShootingDieStep[] = woundStage.hitRolls.filter((hit) => !hit.hit).map((hit) => ({ attackIndex: hit.attackIndex, outcome: 'missed', hitRoll: hit.modifiedRoll ?? hit.rerollRoll ?? hit.roll, hit: false, criticalHit: hit.critical, ...(hit.rerollRoll === undefined ? {} : { initialHitRoll: hit.roll }) }));
  const activeModels = targetModels.filter((model) => model.active);
  const woundedModel = activeModels.find((model) => model.wounds < request.target.woundsPerModel);
  return {
    accepted: true,
    source: CORE_ATTACK_SEQUENCE_SOURCE,
    sourceRefs,
    hitRequired,
    woundRequired,
    saveRequired,
    steps: [...woundSteps, ...missedSteps].sort((left, right) => left.attackIndex - right.attackIndex),
    hitRolls: woundStage.hitRolls,
    woundRolls,
    saveRolls,
    allocations,
    hits: woundStage.hitRolls.filter((entry) => entry.hit).length,
    wounds: successfulWounds.length,
    failedSaves: allocations.filter((entry) => entry.outcome === 'damaged' || entry.outcome === 'destroyed').length,
    damageInflicted,
    modelsDestroyed: destroyedModelIds.length,
    destroyedModelIds,
    remainingModels: activeModels.length,
    remainingWoundsOnDamagedModel: woundedModel?.wounds ?? null,
    targetModelsAfter: targetModels,
    prngAfter: currentPrng
  };
}

/**
 * Continues an already journaled 05.01 stage. Automatic wounds suppress
 * exactly their own 05.02 die and are never critical (24.23).
 */
export function resolveLethalHitsContinuation(
  request: BasicShootingRequest,
  hitStage: LethalHitsHitStageResolution,
  choices: readonly LethalHitsChoiceV1[],
  prng: PrngStateV1
): ShootingResult {
  const modifiers = request.attackModifiers ?? { rerollFailedHits: false, woundRollModifier: 0 as const, sourceRefs: [] };
  const sourceRefs = shootingSourceRefs(request, modifiers);
  const invalid = (message: string): ShootingResult => ({ accepted: false, code: 'invalid-profile', message, source: CORE_ATTACK_SEQUENCE_SOURCE, sourceRefs, prngAfter: prng });
  if (!validRequest(request) || !requiresLethalHitsDecision(request)) return invalid('Le profil [TOUCHES FATALES] fermé est invalide.');
  if (!request.visible || request.distance > request.weapon.range) return invalid('La continuation [TOUCHES FATALES] ne correspond pas au tir autoritaire.');
  const woundRequired = Math.max(2, requiredWoundRoll(request.weapon.strength, request.target.toughness) - modifiers.woundRollModifier);
  const hitRequired = Math.min(7, request.weapon.ballisticSkill + (request.target.coverBallisticSkillPenalty ?? 0));
  const saveRequired = Math.max(2, request.target.save - request.weapon.armourPenetration);
  const expectedCriticals = hitStage.hitRolls.filter((hit) => hit.hit && hit.critical).map((hit) => hit.attackIndex);
  if (hitStage.hitRequired !== hitRequired || hitStage.woundRequired !== woundRequired || hitStage.saveRequired !== saveRequired
    || hitStage.hitRolls.length !== request.weapon.attacks
    || !hitStage.hitRolls.every((hit, index) => hit.attackIndex === index && Number.isInteger(hit.roll) && hit.roll >= 1 && hit.roll <= 6)
    || choices.length !== expectedCriticals.length
    || !choices.every((choice, index) => choice.groupIndex === 0 && choice.attackIndex === expectedCriticals[index]
      && (choice.optionId === 'auto-wound' || choice.optionId === 'roll-to-wound'))) {
    return invalid('Le stade de touches ou les choix [TOUCHES FATALES] sont incompatibles.');
  }

  const choicesByAttack = new Map(choices.map((choice) => [choice.attackIndex, choice.optionId]));
  const triggers = criticalTriggerFacts(request);
  let currentPrng = prng;
  let targetModels = normaliseTargetModels(request.target);
  let damageInflicted = 0;
  const destroyedModelIds: string[] = [];
  const woundRolls: BasicShootingWoundRoll[] = [];
  for (const hit of hitStage.hitRolls.filter((entry) => entry.hit)) {
    const choice = choicesByAttack.get(hit.attackIndex);
    if (choice === 'auto-wound') {
      woundRolls.push({ attackIndex: hit.attackIndex, wound: true, critical: false, automatic: true });
      continue;
    }
    const outcome = rollDice(currentPrng, 6, 1);
    currentPrng = outcome.state;
    const wound = woundOutcome(outcome.results[0], woundRequired, triggers.antiCriticalWound);
    woundRolls.push({ attackIndex: hit.attackIndex, roll: outcome.results[0], wound: wound.wound, critical: wound.critical });
  }

  const successfulWounds = woundRolls.filter((entry) => entry.wound);
  const saveOutcome = successfulWounds.length === 0 ? { results: [] as number[], state: currentPrng } : rollDice(currentPrng, 6, successfulWounds.length);
  currentPrng = saveOutcome.state;
  const saveRolls: BasicShootingSaveRoll[] = saveOutcome.results.map((roll, index) => ({
    attackIndex: successfulWounds[index].attackIndex,
    roll,
    saved: saveRequired <= 6 && roll >= saveRequired
  }));

  const allocations: BasicShootingAllocationRecord[] = [];
  for (const save of [...saveRolls].sort((left, right) => left.roll - right.roll || left.attackIndex - right.attackIndex)) {
    const allocated = selectAllocatedModel(targetModels, request.target.woundsPerModel);
    if (!allocated) {
      allocations.push({ attackIndex: save.attackIndex, saveRoll: save.roll, outcome: 'lost-no-target' });
      continue;
    }
    if (save.saved) {
      allocations.push({ attackIndex: save.attackIndex, saveRoll: save.roll, outcome: 'saved' });
      continue;
    }
    let damageCharacteristic = request.weapon.damage;
    let randomDamage: BasicShootingRandomCharacteristicEvidence | undefined;
    if (request.weapon.randomDamage !== undefined) {
      const randomResolution = resolveRandomCharacteristic(request.weapon.randomDamage, { characteristic: 'damage', timing: 'allocate-damage' }, currentPrng);
      if (!randomResolution.accepted) throw new RangeError(`Variable damage could not be resolved: ${randomResolution.code}.`);
      currentPrng = randomResolution.prngAfter;
      damageCharacteristic = randomResolution.value;
      randomDamage = {
        expression: request.weapon.randomDamage,
        dice: randomResolution.dice,
        value: randomResolution.value,
        sourceRefs: randomResolution.sourceRefs
      };
    }
    const appliedDamage = Math.min(damageCharacteristic, allocated.wounds);
    damageInflicted += appliedDamage;
    const woundsAfter = allocated.wounds - appliedDamage;
    const destroyed = woundsAfter === 0;
    if (destroyed) destroyedModelIds.push(allocated.id);
    targetModels = targetModels.map((model) => model.id !== allocated.id ? model : { ...model, wounds: woundsAfter, active: !destroyed });
    allocations.push({
      attackIndex: save.attackIndex,
      saveRoll: save.roll,
      outcome: destroyed ? 'destroyed' : 'damaged',
      damage: appliedDamage,
      ...(randomDamage === undefined ? {} : { randomDamage }),
      allocatedModelId: allocated.id,
      ...(destroyed ? { destroyedModelId: allocated.id } : {})
    });
  }

  const saveByAttack = new Map(saveRolls.map((entry) => [entry.attackIndex, entry]));
  const allocationByAttack = new Map(allocations.map((entry) => [entry.attackIndex, entry]));
  const hitByAttack = new Map(hitStage.hitRolls.map((entry) => [entry.attackIndex, entry]));
  const woundSteps: ShootingDieStep[] = woundRolls.map((wound) => {
    const hit = hitByAttack.get(wound.attackIndex);
    if (!hit?.hit) throw new Error('A failed hit cannot reach the wound stage.');
    const finalHitRoll = hit.modifiedRoll ?? hit.rerollRoll ?? hit.roll;
    const rerollFields = hit.rerollRoll === undefined ? {} : { initialHitRoll: hit.roll };
    if (!wound.wound) return {
      attackIndex: wound.attackIndex,
      outcome: 'failed-to-wound',
      hitRoll: finalHitRoll,
      hit: true,
      criticalHit: hit.critical,
      woundRoll: wound.roll,
      wound: false,
      criticalWound: wound.critical,
      ...rerollFields
    };
    const save = saveByAttack.get(wound.attackIndex)!;
    const allocation = allocationByAttack.get(wound.attackIndex)!;
    return {
      attackIndex: wound.attackIndex,
      outcome: allocation.outcome,
      hitRoll: finalHitRoll,
      ...rerollFields,
      hit: true,
      criticalHit: hit.critical,
      ...(wound.roll === undefined ? {} : { woundRoll: wound.roll }),
      wound: true,
      criticalWound: wound.critical,
      saveRoll: save.roll,
      saved: allocation.outcome === 'saved',
      ...(allocation.damage === undefined ? {} : { damage: allocation.damage }),
      ...(allocation.randomDamage === undefined ? {} : { randomDamage: allocation.randomDamage }),
      ...(allocation.allocatedModelId === undefined ? {} : { allocatedModelId: allocation.allocatedModelId }),
      ...(allocation.destroyedModelId === undefined ? {} : { destroyedModelId: allocation.destroyedModelId })
    };
  });
  const missedSteps: ShootingDieStep[] = hitStage.hitRolls.filter((hit) => !hit.hit).map((hit) => {
    const finalHitRoll = hit.modifiedRoll ?? hit.rerollRoll ?? hit.roll;
    return {
      attackIndex: hit.attackIndex,
      outcome: 'missed',
      hitRoll: finalHitRoll,
      ...(hit.rerollRoll === undefined ? {} : { initialHitRoll: hit.roll }),
      hit: false,
      criticalHit: hit.critical
    };
  });
  const activeModels = targetModels.filter((model) => model.active);
  const woundedModel = activeModels.find((model) => model.wounds < request.target.woundsPerModel);
  return {
    accepted: true,
    source: CORE_ATTACK_SEQUENCE_SOURCE,
    sourceRefs,
    hitRequired,
    woundRequired,
    saveRequired,
    steps: [...woundSteps, ...missedSteps].sort((left, right) => left.attackIndex - right.attackIndex),
    hitRolls: hitStage.hitRolls,
    woundRolls,
    saveRolls,
    allocations,
    hits: hitStage.hitRolls.filter((entry) => entry.hit).length,
    wounds: successfulWounds.length,
    failedSaves: allocations.filter((entry) => entry.outcome === 'damaged' || entry.outcome === 'destroyed').length,
    damageInflicted,
    modelsDestroyed: destroyedModelIds.length,
    destroyedModelIds,
    remainingModels: activeModels.length,
    remainingWoundsOnDamagedModel: woundedModel?.wounds ?? null,
    targetModelsAfter: targetModels,
    prngAfter: currentPrng
  };
}

/**
 * Resolves only the closed core dice/allocation sequence.  Callers must obtain
 * range and visibility from a trusted spatial resolver before invoking it.
 */
export function resolveBasicShooting(request: BasicShootingRequest, prng: PrngStateV1): ShootingResult {
  const modifiers = request.attackModifiers ?? { rerollFailedHits: false, woundRollModifier: 0 as const, sourceRefs: [] };
  const sourceRefs = [
    CORE_BASIC_RANGED_ATTACK_SOURCE,
    ...CORE_ATTACK_SEQUENCE_STEP_SOURCES,
    ...(request.target.coverBallisticSkillPenalty ? [CORE_BENEFIT_OF_COVER_SOURCE] : []),
    ...modifiers.sourceRefs,
    ...(request.weapon.weaponKeywords?.map((keyword) => keyword.source) ?? []),
    ...(request.weapon.randomDamage === undefined ? [] : [OFFICIAL_APP_RANDOM_CHARACTERISTICS_SOURCE])
  ];
  if (!validRequest(request)) return { accepted: false, code: 'invalid-profile', message: 'Le profil de tir fermé est invalide.', source: CORE_ATTACK_SEQUENCE_SOURCE, sourceRefs, prngAfter: prng };
  if (requiresLethalHitsDecision(request)) {
    return {
      accepted: false,
      code: 'lethal-hits-decision-required',
      message: '[TOUCHES FATALES] exige une décision humaine journalisée pour chaque touche critique ; ce flux DecisionRequest n’est pas encore couvert.',
      source: CORE_ATTACK_SEQUENCE_SOURCE,
      sourceRefs,
      prngAfter: prng
    };
  }
  if (!request.visible) return { accepted: false, code: 'not-visible', message: 'La cible doit être visible pour ce profil de tir direct.', source: CORE_ATTACK_SEQUENCE_SOURCE, sourceRefs, prngAfter: prng };
  if (request.distance > request.weapon.range) return { accepted: false, code: 'out-of-range', message: 'La cible est au-delà de la portée de l’arme.', source: CORE_ATTACK_SEQUENCE_SOURCE, sourceRefs, prngAfter: prng };

  const woundRequired = Math.max(2, requiredWoundRoll(request.weapon.strength, request.target.toughness) - modifiers.woundRollModifier);
  const hitRequired = Math.min(7, request.weapon.ballisticSkill + (request.target.coverBallisticSkillPenalty ?? 0));
  const saveRequired = Math.max(2, request.target.save - request.weapon.armourPenetration);
  let currentPrng = prng;
  let targetModels = normaliseTargetModels(request.target);
  let damageInflicted = 0;
  const destroyedModelIds: string[] = [];
  const triggers = criticalTriggerFacts(request);
  const hitOutcome = rollDice(currentPrng, 6, request.weapon.attacks);
  currentPrng = hitOutcome.state;
  let hitRolls: BasicShootingHitRoll[] = hitOutcome.results.map((roll, attackIndex) => ({ attackIndex, roll, hit: isSuccessfulHit(roll, roll, hitRequired), critical: roll === 6 }));
  if (modifiers.rerollFailedHits) {
    const failedHits = hitRolls.filter((entry) => !entry.hit);
    const rerollOutcome = failedHits.length === 0
      ? { results: [] as number[], state: currentPrng }
      : rollDice(currentPrng, 6, failedHits.length);
    currentPrng = rerollOutcome.state;
    const rerollsByAttack = new Map(failedHits.map((entry, index) => [entry.attackIndex, rerollOutcome.results[index]]));
    hitRolls = hitRolls.map((entry) => {
      const reroll = rerollsByAttack.get(entry.attackIndex);
      return reroll === undefined ? entry : { ...entry, rerollRoll: reroll, hit: isSuccessfulHit(reroll, reroll, hitRequired), critical: reroll === 6 };
    });
  }
  if (modifiers.hitRollModifiers !== undefined) {
    hitRolls = hitRolls.map((entry) => {
      const unmodifiedRoll = entry.rerollRoll ?? entry.roll;
      const modified = resolveDieRollModifierPlan({ rollKind: 'hit', unmodifiedRoll, sides: 6, ...modifiers.hitRollModifiers! });
      if (!modified.accepted) throw new RangeError(`Hit roll modifiers could not be resolved: ${modified.code}.`);
      return { ...entry, modifiedRoll: modified.modifiedRoll, hit: isSuccessfulHit(unmodifiedRoll, modified.modifiedRoll, hitRequired), critical: unmodifiedRoll === 6 };
    });
  }

  hitRolls = hitRolls.map((entry) => !entry.critical ? entry : {
    ...entry,
    ...(triggers.sustainedHits === undefined ? {} : { sustainedHitsGenerated: triggers.sustainedHits })
  });
  const successfulHits = hitRolls.filter((entry) => entry.hit);
  // The base attacks already own 0..A-1.  Assign generated hits from the
  // next free identity, not from the triggering attack's index: only some
  // base attacks may crit, so multiplication would leave gaps and can make a
  // later group collide after aggregation.
  const hitInstances: PendingHitInstance[] = [];
  let nextGeneratedAttackIndex = hitRolls.length;
  for (const entry of successfulHits) {
    hitInstances.push({ attackIndex: entry.attackIndex });
    for (let generated = 0; generated < (entry.critical ? (triggers.sustainedHits ?? 0) : 0); generated += 1) {
      hitInstances.push({
        attackIndex: nextGeneratedAttackIndex,
        generatedByCriticalHitOfAttackIndex: entry.attackIndex
      });
      nextGeneratedAttackIndex += 1;
    }
  }
  const woundDiceOutcome = hitInstances.length === 0
    ? { results: [] as number[], state: currentPrng }
    : rollDice(currentPrng, 6, hitInstances.length);
  currentPrng = woundDiceOutcome.state;
  const woundRolls: BasicShootingWoundRoll[] = hitInstances.map((instance, index) => {
    const roll = woundDiceOutcome.results[index];
    const outcome = woundOutcome(roll, woundRequired, triggers.antiCriticalWound);
    return {
      attackIndex: instance.attackIndex,
      roll,
      wound: outcome.wound,
      critical: outcome.critical,
      ...(instance.generatedByCriticalHitOfAttackIndex === undefined ? {} : { generatedByCriticalHitOfAttackIndex: instance.generatedByCriticalHitOfAttackIndex })
    };
  });

  const successfulWounds = woundRolls.filter((entry) => entry.wound);
  const saveOutcome = successfulWounds.length === 0
    ? { results: [] as number[], state: currentPrng }
    : rollDice(currentPrng, 6, successfulWounds.length);
  currentPrng = saveOutcome.state;
  const saveRolls: BasicShootingSaveRoll[] = saveOutcome.results.map((roll, index) => ({
    attackIndex: successfulWounds[index].attackIndex,
    roll,
    saved: saveRequired <= 6 && roll >= saveRequired
  }));

  const allocations: BasicShootingAllocationRecord[] = [];
  for (const save of [...saveRolls].sort((left, right) => left.roll - right.roll || left.attackIndex - right.attackIndex)) {
    const allocated = selectAllocatedModel(targetModels, request.target.woundsPerModel);
    if (!allocated) {
      allocations.push({ attackIndex: save.attackIndex, saveRoll: save.roll, outcome: 'lost-no-target' });
      continue;
    }
    if (save.saved) {
      allocations.push({ attackIndex: save.attackIndex, saveRoll: save.roll, outcome: 'saved' });
      continue;
    }
    let damageCharacteristic = request.weapon.damage;
    let randomDamage: BasicShootingRandomCharacteristicEvidence | undefined;
    if (request.weapon.randomDamage !== undefined) {
      const randomResolution = resolveRandomCharacteristic(request.weapon.randomDamage, { characteristic: 'damage', timing: 'allocate-damage' }, currentPrng);
      // validRequest parsed the notation before any die was rolled.  A failure
      // here therefore signals an internal contract violation, never a player
      // rejection after entropy has been consumed.
      if (!randomResolution.accepted) throw new RangeError(`Variable damage could not be resolved: ${randomResolution.code}.`);
      currentPrng = randomResolution.prngAfter;
      damageCharacteristic = randomResolution.value;
      randomDamage = {
        expression: request.weapon.randomDamage,
        dice: randomResolution.dice,
        value: randomResolution.value,
        sourceRefs: randomResolution.sourceRefs
      };
    }
    const appliedDamage = Math.min(damageCharacteristic ?? 0, allocated.wounds);
    damageInflicted += appliedDamage;
    const woundsAfter = allocated.wounds - appliedDamage;
    const destroyed = woundsAfter === 0;
    if (destroyed) destroyedModelIds.push(allocated.id);
    targetModels = targetModels.map((model) => model.id !== allocated.id ? model : { ...model, wounds: woundsAfter, active: !destroyed });
    allocations.push({
      attackIndex: save.attackIndex,
      saveRoll: save.roll,
      outcome: destroyed ? 'destroyed' : 'damaged',
      damage: appliedDamage,
      ...(randomDamage === undefined ? {} : { randomDamage }),
      allocatedModelId: allocated.id,
      ...(destroyed ? { destroyedModelId: allocated.id } : {})
    });
  }

  const saveByAttack = new Map(saveRolls.map((entry) => [entry.attackIndex, entry]));
  const allocationByAttack = new Map(allocations.map((entry) => [entry.attackIndex, entry]));
  const hitByAttack = new Map(hitRolls.map((entry) => [entry.attackIndex, entry]));
  const woundSteps: ShootingDieStep[] = woundRolls.map((wound): ShootingDieStep => {
    const hit = hitByAttack.get(wound.attackIndex);
    const generated = wound.generatedByCriticalHitOfAttackIndex;
    const finalHitRoll = hit?.modifiedRoll ?? hit?.rerollRoll ?? hit?.roll;
    const rerollFields = hit?.rerollRoll === undefined ? {} : { initialHitRoll: hit.roll };
    if (hit && !hit.hit) throw new Error('A failed hit cannot reach the wound stage.');
    const criticalHit = hit?.critical ?? false;
    if (!wound.wound) return {
      attackIndex: wound.attackIndex,
      outcome: 'failed-to-wound',
      ...(finalHitRoll === undefined ? {} : { hitRoll: finalHitRoll }),
      hit: true,
      criticalHit,
      ...(generated === undefined ? {} : { generatedByCriticalHitOfAttackIndex: generated }),
      woundRoll: wound.roll,
      wound: false,
      criticalWound: wound.critical,
      ...rerollFields
    };
    const save = saveByAttack.get(wound.attackIndex)!;
    const allocation = allocationByAttack.get(wound.attackIndex)!;
    return {
      attackIndex: wound.attackIndex,
      outcome: allocation.outcome,
      ...(finalHitRoll === undefined ? {} : { hitRoll: finalHitRoll }),
      ...rerollFields,
      hit: true,
      criticalHit,
      ...(generated === undefined ? {} : { generatedByCriticalHitOfAttackIndex: generated }),
      ...(wound.roll === undefined ? {} : { woundRoll: wound.roll }),
      wound: true,
      criticalWound: wound.critical,
      saveRoll: save.roll,
      saved: allocation.outcome === 'saved',
      ...(allocation.damage === undefined ? {} : { damage: allocation.damage }),
      ...(allocation.randomDamage === undefined ? {} : { randomDamage: allocation.randomDamage }),
      ...(allocation.allocatedModelId === undefined ? {} : { allocatedModelId: allocation.allocatedModelId }),
      ...(allocation.destroyedModelId === undefined ? {} : { destroyedModelId: allocation.destroyedModelId })
    };
  });
  const missedSteps: ShootingDieStep[] = hitRolls.filter((hit) => !hit.hit).map((hit) => {
    const finalHitRoll = hit.modifiedRoll ?? hit.rerollRoll ?? hit.roll;
    const rerollFields = hit.rerollRoll === undefined ? {} : { initialHitRoll: hit.roll };
    return { attackIndex: hit.attackIndex, outcome: 'missed', hitRoll: finalHitRoll, hit: false, criticalHit: hit.critical, ...rerollFields };
  });
  const steps = [...woundSteps, ...missedSteps].sort((left, right) => left.attackIndex - right.attackIndex);

  const activeModels = targetModels.filter((model) => model.active);
  const woundedModel = activeModels.find((model) => model.wounds < request.target.woundsPerModel);
  return {
    accepted: true,
    source: CORE_ATTACK_SEQUENCE_SOURCE,
    sourceRefs,
    hitRequired,
    woundRequired,
    saveRequired,
    steps,
    hitRolls,
    woundRolls,
    saveRolls,
    allocations,
    hits: hitInstances.length,
    wounds: successfulWounds.length,
    failedSaves: allocations.filter((entry) => entry.outcome === 'damaged' || entry.outcome === 'destroyed').length,
    damageInflicted,
    modelsDestroyed: destroyedModelIds.length,
    destroyedModelIds,
    remainingModels: activeModels.length,
    remainingWoundsOnDamagedModel: woundedModel?.wounds ?? null,
    targetModelsAfter: targetModels,
    prngAfter: currentPrng
  };
}
