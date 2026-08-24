import type {
  CharacteristicModifierOperationV1,
  CharacteristicModifierPlanV1,
  CharacteristicModifierV1,
  DieRollModifierPlanV1,
  DieRollModifierV1,
  ModifiedCharacteristicV1,
  SourceReferenceV1
} from '../domain/types';
import { isExactSourceReference, OFFICIAL_APP_MODIFIERS_SOURCE } from './m5-source-references';

export type {
  CharacteristicModifierOperationV1,
  CharacteristicModifierPlanV1,
  CharacteristicModifierV1,
  DieRollModifierPlanV1,
  DieRollModifierV1,
  ModifiedCharacteristicV1
} from '../domain/types';

export type ModifierPlanRejectionCode =
  | 'invalid-modifier-plan'
  | 'duplicate-modifier-id'
  | 'unsupported-modifier-source'
  | 'ambiguous-replacement-modifier'
  | 'invalid-ignored-modifier';

export type CharacteristicModifierResolution =
  | {
    readonly accepted: true;
    readonly characteristic: ModifiedCharacteristicV1;
    readonly baseValue: number;
    readonly valueBeforeRounding: number;
    readonly value: number;
    readonly appliedModifierIds: readonly string[];
    readonly ignoredModifierIds: readonly string[];
    readonly sourceRefs: readonly [SourceReferenceV1];
  }
  | { readonly accepted: false; readonly code: ModifierPlanRejectionCode; readonly message: string; readonly sourceRefs: readonly [SourceReferenceV1] };

export type DieRollModifierResolution =
  | {
    readonly accepted: true;
    readonly rollKind: DieRollModifierPlanV1['rollKind'];
    readonly unmodifiedRoll: number;
    readonly modifierTotal: number;
    readonly effectiveModifierTotal: number;
    readonly modifiedRoll: number;
    readonly appliedModifierIds: readonly string[];
    readonly ignoredModifierIds: readonly string[];
    readonly sourceRefs: readonly [SourceReferenceV1];
  }
  | { readonly accepted: false; readonly code: ModifierPlanRejectionCode; readonly message: string; readonly sourceRefs: readonly [SourceReferenceV1] };

const OPERATION_ORDER: readonly CharacteristicModifierOperationV1[] = ['replace', 'multiply', 'add', 'divide', 'subtract'];
const MODIFIED_CHARACTERISTICS: readonly ModifiedCharacteristicV1[] = [
  'movement', 'toughness', 'range', 'attacks', 'strength', 'damage',
  'save', 'invulnerable-save', 'leadership', 'objective-control',
  'weapon-skill', 'ballistic-skill', 'armour-penetration'
];

function reject(code: ModifierPlanRejectionCode, message: string): { readonly accepted: false; readonly code: ModifierPlanRejectionCode; readonly message: string; readonly sourceRefs: readonly [SourceReferenceV1] } {
  return { accepted: false, code, message, sourceRefs: [OFFICIAL_APP_MODIFIERS_SOURCE] };
}

function canonicalIds(values: readonly { readonly id: string }[]): readonly string[] {
  return values.map((entry) => entry.id).sort((left, right) => left.localeCompare(right));
}

function validId(id: string): boolean {
  return id.trim().length > 0;
}

function validateIgnoredIds<T extends { readonly id: string; readonly canBeIgnored?: boolean }>(
  modifiers: readonly T[],
  ignoredModifierIds: readonly string[] | undefined
): { readonly ok: true; readonly ignored: ReadonlySet<string> } | { readonly ok: false; readonly message: string } {
  const ignored = new Set(ignoredModifierIds ?? []);
  if ((ignoredModifierIds?.length ?? 0) !== ignored.size) return { ok: false, message: 'Chaque modificateur ignoré ne peut être désigné qu’une fois.' };
  for (const id of ignored) {
    const modifier = modifiers.find((candidate) => candidate.id === id);
    if (!modifier || modifier.canBeIgnored !== true) return { ok: false, message: 'Un modificateur ignoré doit exister et être explicitement ignorable.' };
  }
  return { ok: true, ignored };
}

function cappedCharacteristic(characteristic: ModifiedCharacteristicV1, value: number): number {
  switch (characteristic) {
    case 'movement':
    case 'toughness':
    case 'range':
    case 'attacks':
    case 'strength':
    case 'damage':
      return Math.max(1, value);
    case 'save':
    case 'invulnerable-save':
      return Math.max(1, value);
    case 'leadership':
      return Math.min(9, Math.max(4, value));
    case 'objective-control':
      return Math.max(0, value);
    case 'weapon-skill':
    case 'ballistic-skill':
      return Math.min(7, Math.max(1, value));
    case 'armour-penetration':
      return Math.min(0, value);
  }
}

/**
 * Applies the official replacement → multiplication → addition → division →
 * subtraction order, independently from UI or catalog order.  Two replacement
 * effects require a later explicit decision contract and are rejected here.
 */
export function resolveCharacteristicModifierPlan(plan: CharacteristicModifierPlanV1): CharacteristicModifierResolution {
  if (!MODIFIED_CHARACTERISTICS.includes(plan.characteristic) || !Number.isSafeInteger(plan.baseValue) || !Array.isArray(plan.modifiers)) return reject('invalid-modifier-plan', 'La caractéristique, la valeur de base et les modificateurs doivent être des entrées autoritaires valides.');
  if (plan.modifiers.some((modifier) => !validId(modifier.id)
    || !OPERATION_ORDER.includes(modifier.operation)
    || !Number.isSafeInteger(modifier.value)
    || (modifier.operation === 'multiply' || modifier.operation === 'divide' ? modifier.value <= 0 : modifier.value < 0))) {
    return reject('invalid-modifier-plan', 'Chaque modificateur doit avoir une opération et une magnitude valides.');
  }
  if (new Set(plan.modifiers.map((modifier) => modifier.id)).size !== plan.modifiers.length) return reject('duplicate-modifier-id', 'Les identifiants de modificateur doivent être uniques.');
  if (plan.modifiers.some((modifier) => !isExactSourceReference(modifier.source, OFFICIAL_APP_MODIFIERS_SOURCE))) return reject('unsupported-modifier-source', 'Un modificateur générique exige la provenance canonique 02.02.01.');
  const ignored = validateIgnoredIds(plan.modifiers, plan.ignoredModifierIds);
  if (!ignored.ok) return reject('invalid-ignored-modifier', ignored.message);
  const applied = plan.modifiers.filter((modifier) => !ignored.ignored.has(modifier.id));
  const replacements = applied.filter((modifier) => modifier.operation === 'replace');
  if (replacements.length > 1) return reject('ambiguous-replacement-modifier', 'Plusieurs remplacements exigent une décision explicite avant tout calcul.');

  let value = replacements.length === 1 ? replacements[0].value : plan.baseValue;
  // 02.02.01 makes a value replaced by 0 immutable.  In particular, the
  // general characteristic floors must not silently resurrect it as 1.
  if (replacements[0]?.value === 0) {
    return {
      accepted: true,
      characteristic: plan.characteristic,
      baseValue: plan.baseValue,
      valueBeforeRounding: 0,
      value: 0,
      appliedModifierIds: [replacements[0].id],
      ignoredModifierIds: [...ignored.ignored].sort(),
      sourceRefs: [OFFICIAL_APP_MODIFIERS_SOURCE]
    };
  }
  for (const operation of OPERATION_ORDER.slice(1)) {
    const modifiers = applied.filter((modifier) => modifier.operation === operation)
      .sort((left, right) => left.id.localeCompare(right.id));
    for (const modifier of modifiers) {
      switch (operation) {
        case 'multiply': value *= modifier.value; break;
        case 'add': value += modifier.value; break;
        case 'divide': value /= modifier.value; break;
        case 'subtract': value -= modifier.value; break;
      }
    }
  }
  const rounded = Math.ceil(value);
  return {
    accepted: true,
    characteristic: plan.characteristic,
    baseValue: plan.baseValue,
    valueBeforeRounding: value,
    value: cappedCharacteristic(plan.characteristic, rounded),
    appliedModifierIds: canonicalIds(applied),
    ignoredModifierIds: [...ignored.ignored].sort(),
    sourceRefs: [OFFICIAL_APP_MODIFIERS_SOURCE]
  };
}

/** Applies die modifiers after rerolls, including the official ±1 cap on hit and wound rolls. */
export function resolveDieRollModifierPlan(plan: DieRollModifierPlanV1): DieRollModifierResolution {
  if ((plan.rollKind !== 'hit' && plan.rollKind !== 'wound' && plan.rollKind !== 'other')
    || !Number.isInteger(plan.sides) || plan.sides < 2 || plan.sides > 1_000_000
    || !Number.isInteger(plan.unmodifiedRoll) || plan.unmodifiedRoll < 1 || plan.unmodifiedRoll > plan.sides
    || !Array.isArray(plan.modifiers)
    || plan.modifiers.some((modifier) => !validId(modifier.id) || !Number.isSafeInteger(modifier.value))) {
    return reject('invalid-modifier-plan', 'Le jet non modifié et les modificateurs de dé doivent être valides.');
  }
  if (new Set(plan.modifiers.map((modifier) => modifier.id)).size !== plan.modifiers.length) return reject('duplicate-modifier-id', 'Les identifiants de modificateur doivent être uniques.');
  if (plan.modifiers.some((modifier) => !isExactSourceReference(modifier.source, OFFICIAL_APP_MODIFIERS_SOURCE))) return reject('unsupported-modifier-source', 'Un modificateur de jet exige la provenance canonique 02.02.01.');
  const ignored = validateIgnoredIds(plan.modifiers, plan.ignoredModifierIds);
  if (!ignored.ok) return reject('invalid-ignored-modifier', ignored.message);
  const applied = plan.modifiers.filter((modifier) => !ignored.ignored.has(modifier.id));
  const modifierTotal = applied.reduce((total, modifier) => total + modifier.value, 0);
  const effectiveModifierTotal = plan.rollKind === 'hit' || plan.rollKind === 'wound'
    ? Math.min(1, Math.max(-1, modifierTotal))
    : modifierTotal;
  return {
    accepted: true,
    rollKind: plan.rollKind,
    unmodifiedRoll: plan.unmodifiedRoll,
    modifierTotal,
    effectiveModifierTotal,
    modifiedRoll: Math.min(plan.sides, Math.max(1, plan.unmodifiedRoll + effectiveModifierTotal)),
    appliedModifierIds: canonicalIds(applied),
    ignoredModifierIds: [...ignored.ignored].sort(),
    sourceRefs: [OFFICIAL_APP_MODIFIERS_SOURCE]
  };
}
