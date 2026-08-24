import { rollDice } from '../domain/prng';
import type { PrngStateV1, RandomCharacteristicNotationV1, SourceReferenceV1 } from '../domain/types';
import {
  CORE_CHARACTERISTIC_TESTS_SOURCE,
  CORE_DEVASTATING_WOUNDS_SOURCE,
  CORE_FEEL_NO_PAIN_SOURCE,
  CORE_MORTAL_WOUNDS_SOURCE,
  OFFICIAL_APP_RANDOM_CHARACTERISTICS_SOURCE
} from './m5-source-references';
import { resolveRandomCharacteristic } from './random-characteristics';

/** Immutable, fixture-only T04 facts. No catalogue or M4 profile is inferred. */
export interface ExtendedDefenceProfileV1 {
  readonly save: 2 | 3 | 4 | 5 | 6 | 7;
  readonly invulnerableSave?: 2 | 3 | 4 | 5 | 6;
  readonly feelNoPain?: 2 | 3 | 4 | 5 | 6;
  readonly sourceRefs: readonly SourceReferenceV1[];
}

export interface ExtendedDamageRequestV1 {
  readonly armourPenetration: number;
  readonly damage: number;
  readonly randomDamage?: RandomCharacteristicNotationV1;
  /** A journaled 05.04 save die; it is never rolled again during D/FNP. */
  readonly saveRoll?: number;
  /** The target-choice distance is frozen before this primitive is called. */
  readonly atHalfRange: boolean;
  readonly fusionBonus?: number;
  readonly devastatingCriticalWound?: boolean;
  /** A non-devastating mortal-wound packet (06.02/06.03) also skips saves. */
  readonly mortalWound?: boolean;
  readonly defence: ExtendedDefenceProfileV1;
}

export interface ExtendedSaveEvidenceV1 {
  readonly roll: number;
  readonly path: 'invulnerable' | 'armour' | 'failed';
  readonly saved: boolean;
}

/** Evaluates one already-rolled save; callers keep the physical die in the journal. */
export function evaluateExtendedSave(defence: ExtendedDefenceProfileV1, armourPenetration: number, roll: number): ExtendedSaveEvidenceV1 {
  if (!validDefence(defence) || !Number.isInteger(armourPenetration) || armourPenetration > 0 || !Number.isInteger(roll) || roll < 1 || roll > 6) {
    throw new RangeError('Le jet de sauvegarde étendu est invalide.');
  }
  const savedByInvulnerable = roll !== 1 && defence.invulnerableSave !== undefined && roll >= defence.invulnerableSave;
  const armourRequired = Math.max(2, defence.save - armourPenetration);
  const savedByArmour = !savedByInvulnerable && roll !== 1 && armourRequired <= 6 && roll >= armourRequired;
  return { roll, path: savedByInvulnerable ? 'invulnerable' : savedByArmour ? 'armour' : 'failed', saved: savedByInvulnerable || savedByArmour };
}

export interface FeelNoPainEvidenceV1 {
  readonly threshold: number;
  readonly rolls: readonly number[];
  readonly prevented: number;
}

export interface ExtendedDamageResolutionV1 {
  readonly accepted: true;
  readonly save?: ExtendedSaveEvidenceV1;
  readonly damageBeforeFeelNoPain: number;
  readonly damageLost: number;
  readonly randomDamage?: { readonly expression: string; readonly dice: readonly number[]; readonly value: number; readonly sourceRefs: readonly SourceReferenceV1[] };
  readonly feelNoPain?: FeelNoPainEvidenceV1;
  readonly mortalWounds: boolean;
  readonly sourceRefs: readonly SourceReferenceV1[];
  readonly prngAfter: PrngStateV1;
}

export type ExtendedDamageResultV1 = ExtendedDamageResolutionV1 | {
  readonly accepted: false;
  readonly code: 'invalid-extended-defence-profile' | 'unsupported-extended-damage';
  readonly message: string;
  readonly prngAfter: PrngStateV1;
};

function validDefence(defence: ExtendedDefenceProfileV1): boolean {
  return Number.isInteger(defence.save) && defence.save >= 2 && defence.save <= 7
    && (defence.invulnerableSave === undefined || [2, 3, 4, 5, 6].includes(defence.invulnerableSave))
    && (defence.feelNoPain === undefined || [2, 3, 4, 5, 6].includes(defence.feelNoPain))
    && defence.sourceRefs.length > 0;
}

/**
 * Resolves exactly one successful wound allocated to one fixture model. The
 * caller orders normal wounds before the separately queued devastating mortal
 * wounds, so a critical never spills to another model through this primitive.
 */
export function resolveExtendedDamage(request: ExtendedDamageRequestV1, prng: PrngStateV1): ExtendedDamageResultV1 {
  if (!validDefence(request.defence) || !Number.isInteger(request.armourPenetration) || request.armourPenetration > 0
    || !Number.isInteger(request.damage) || request.damage < 1
    || (request.saveRoll !== undefined && (!Number.isInteger(request.saveRoll) || request.saveRoll < 1 || request.saveRoll > 6))
    || (request.fusionBonus !== undefined && (!Number.isInteger(request.fusionBonus) || request.fusionBonus < 1))) {
    return { accepted: false, code: 'invalid-extended-defence-profile', message: 'Le contrat de défense étendu est invalide.', prngAfter: prng };
  }
  let currentPrng = prng;
  let save: ExtendedSaveEvidenceV1 | undefined;
  if (request.devastatingCriticalWound && request.mortalWound) {
    return { accepted: false, code: 'unsupported-extended-damage', message: 'Un paquet mortel ne peut pas être simultanément dévastateur et [À RISQUE].', prngAfter: prng };
  }
  const skipsSave = request.devastatingCriticalWound === true || request.mortalWound === true;
  if (!skipsSave) {
    if (request.saveRoll !== undefined) {
      save = evaluateExtendedSave(request.defence, request.armourPenetration, request.saveRoll);
    } else {
      const roll = rollDice(currentPrng, 6, 1);
      currentPrng = roll.state;
      // 02.02: an unmodified 1 always fails. SvIn is evaluated before Sv+PA.
      save = evaluateExtendedSave(request.defence, request.armourPenetration, roll.results[0]);
    }
    if (save.saved) return { accepted: true, save, damageBeforeFeelNoPain: 0, damageLost: 0, mortalWounds: false, sourceRefs: [CORE_CHARACTERISTIC_TESTS_SOURCE], prngAfter: currentPrng };
  }
  let damage = request.damage + (request.atHalfRange ? request.fusionBonus ?? 0 : 0);
  let randomDamage: ExtendedDamageResolutionV1['randomDamage'];
  if (request.randomDamage !== undefined) {
    const resolved = resolveRandomCharacteristic(request.randomDamage, { characteristic: 'damage', timing: 'allocate-damage' }, currentPrng);
    if (!resolved.accepted) return { accepted: false, code: 'unsupported-extended-damage', message: resolved.message, prngAfter: prng };
    currentPrng = resolved.prngAfter;
    damage = resolved.value + (request.atHalfRange ? request.fusionBonus ?? 0 : 0);
    randomDamage = { expression: request.randomDamage, dice: resolved.dice, value: resolved.value, sourceRefs: resolved.sourceRefs };
  }
  let damageLost = damage;
  let feelNoPain: FeelNoPainEvidenceV1 | undefined;
  if (request.defence.feelNoPain !== undefined) {
    const fnp = rollDice(currentPrng, 6, damage);
    currentPrng = fnp.state;
    const prevented = fnp.results.filter((roll) => roll >= request.defence.feelNoPain!).length;
    damageLost -= prevented;
    feelNoPain = { threshold: request.defence.feelNoPain, rolls: fnp.results, prevented };
  }
  return {
    accepted: true,
    ...(save === undefined ? {} : { save }),
    damageBeforeFeelNoPain: damage,
    damageLost,
    ...(randomDamage === undefined ? {} : { randomDamage }),
    ...(feelNoPain === undefined ? {} : { feelNoPain }),
    mortalWounds: skipsSave,
    sourceRefs: [
      ...(request.devastatingCriticalWound ? [CORE_DEVASTATING_WOUNDS_SOURCE, CORE_MORTAL_WOUNDS_SOURCE] : request.mortalWound ? [CORE_MORTAL_WOUNDS_SOURCE] : [CORE_CHARACTERISTIC_TESTS_SOURCE]),
      ...(request.randomDamage === undefined ? [] : [OFFICIAL_APP_RANDOM_CHARACTERISTICS_SOURCE]),
      ...(feelNoPain === undefined ? [] : [CORE_FEEL_NO_PAIN_SOURCE]),
      ...request.defence.sourceRefs
    ],
    prngAfter: currentPrng
  };
}
