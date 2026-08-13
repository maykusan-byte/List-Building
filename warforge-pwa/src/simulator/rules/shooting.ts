import { rollDice } from '../domain/prng';
import type {
  BasicShootingAllocationRecord,
  BasicShootingDieStep,
  BasicShootingHitRoll,
  BasicShootingSaveRoll,
  BasicShootingWoundRoll,
  PrngStateV1,
  SourceReferenceV1,
  WeaponProfileV1
} from '../domain/types';

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
  'id' | 'range' | 'attacks' | 'ballisticSkill' | 'strength' | 'armourPenetration' | 'damage'>;

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
}

export type ShootingRejectionCode = 'not-visible' | 'out-of-range' | 'invalid-profile';

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
  return [weapon.range, weapon.attacks, weapon.ballisticSkill, weapon.strength, weapon.damage,
    target.toughness, target.save, target.woundsPerModel]
    .every((value) => Number.isInteger(value) && value >= 0)
    && Number.isFinite(request.distance) && request.distance >= 0
    && weapon.attacks > 0 && weapon.ballisticSkill >= 2 && weapon.ballisticSkill <= 6
    && weapon.strength > 0 && weapon.damage > 0 && target.toughness > 0
    && target.save >= 2 && target.save <= 7 && target.woundsPerModel > 0
    && Number.isInteger(weapon.armourPenetration) && weapon.armourPenetration <= 0
    && (target.coverBallisticSkillPenalty === undefined
      || target.coverBallisticSkillPenalty === 0
      || target.coverBallisticSkillPenalty === 1)
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

/**
 * Resolves only the closed core dice/allocation sequence.  Callers must obtain
 * range and visibility from a trusted spatial resolver before invoking it.
 */
export function resolveBasicShooting(request: BasicShootingRequest, prng: PrngStateV1): ShootingResult {
  const sourceRefs = [CORE_BASIC_RANGED_ATTACK_SOURCE, ...CORE_ATTACK_SEQUENCE_STEP_SOURCES, ...(request.target.coverBallisticSkillPenalty ? [CORE_BENEFIT_OF_COVER_SOURCE] : [])];
  if (!validRequest(request)) return { accepted: false, code: 'invalid-profile', message: 'Le profil de tir fermé est invalide.', source: CORE_ATTACK_SEQUENCE_SOURCE, sourceRefs, prngAfter: prng };
  if (!request.visible) return { accepted: false, code: 'not-visible', message: 'La cible doit être visible pour ce profil de tir direct.', source: CORE_ATTACK_SEQUENCE_SOURCE, sourceRefs, prngAfter: prng };
  if (request.distance > request.weapon.range) return { accepted: false, code: 'out-of-range', message: 'La cible est au-delà de la portée de l’arme.', source: CORE_ATTACK_SEQUENCE_SOURCE, sourceRefs, prngAfter: prng };

  const woundRequired = requiredWoundRoll(request.weapon.strength, request.target.toughness);
  const hitRequired = Math.min(6, request.weapon.ballisticSkill + (request.target.coverBallisticSkillPenalty ?? 0));
  const saveRequired = Math.max(2, request.target.save - request.weapon.armourPenetration);
  let currentPrng = prng;
  let targetModels = normaliseTargetModels(request.target);
  let damageInflicted = 0;
  const destroyedModelIds: string[] = [];
  const hitOutcome = rollDice(currentPrng, 6, request.weapon.attacks);
  currentPrng = hitOutcome.state;
  const hitRolls: BasicShootingHitRoll[] = hitOutcome.results.map((roll, attackIndex) => ({ attackIndex, roll, hit: roll >= hitRequired, critical: roll === 6 }));

  const successfulHits = hitRolls.filter((entry) => entry.hit);
  const woundOutcome = successfulHits.length === 0
    ? { results: [] as number[], state: currentPrng }
    : rollDice(currentPrng, 6, successfulHits.length);
  currentPrng = woundOutcome.state;
  const woundRolls: BasicShootingWoundRoll[] = woundOutcome.results.map((roll, index) => ({
    attackIndex: successfulHits[index].attackIndex,
    roll,
    wound: roll >= woundRequired,
    critical: roll === 6
  }));

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
    const appliedDamage = Math.min(request.weapon.damage, allocated.wounds);
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
      allocatedModelId: allocated.id,
      ...(destroyed ? { destroyedModelId: allocated.id } : {})
    });
  }

  const woundByAttack = new Map(woundRolls.map((entry) => [entry.attackIndex, entry]));
  const saveByAttack = new Map(saveRolls.map((entry) => [entry.attackIndex, entry]));
  const allocationByAttack = new Map(allocations.map((entry) => [entry.attackIndex, entry]));
  const steps: ShootingDieStep[] = hitRolls.map((hit): ShootingDieStep => {
    if (!hit.hit) return { attackIndex: hit.attackIndex, outcome: 'missed', hitRoll: hit.roll, hit: false, criticalHit: hit.critical };
    const wound = woundByAttack.get(hit.attackIndex)!;
    if (!wound.wound) return { attackIndex: hit.attackIndex, outcome: 'failed-to-wound', hitRoll: hit.roll, hit: true, criticalHit: hit.critical, woundRoll: wound.roll, wound: false, criticalWound: wound.critical };
    const save = saveByAttack.get(hit.attackIndex)!;
    const allocation = allocationByAttack.get(hit.attackIndex)!;
    return {
      attackIndex: hit.attackIndex,
      outcome: allocation.outcome,
      hitRoll: hit.roll,
      hit: true,
      criticalHit: hit.critical,
      woundRoll: wound.roll,
      wound: true,
      criticalWound: wound.critical,
      saveRoll: save.roll,
      saved: allocation.outcome === 'saved',
      ...(allocation.damage === undefined ? {} : { damage: allocation.damage }),
      ...(allocation.allocatedModelId === undefined ? {} : { allocatedModelId: allocation.allocatedModelId }),
      ...(allocation.destroyedModelId === undefined ? {} : { destroyedModelId: allocation.destroyedModelId })
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
    steps,
    hitRolls,
    woundRolls,
    saveRolls,
    allocations,
    hits: successfulHits.length,
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
