import { rollDice } from './prng';
import {
  BATTLE_RESOURCES_V1_SCHEMA_VERSION,
  COMMAND_PHASE_V1_SCHEMA_VERSION,
  TIMED_EFFECT_V1_SCHEMA_VERSION,
  type BattleMomentV1,
  type BattleResourcesV1,
  type BattleShockTestResultV1,
  type CommandPhaseStateV1,
  type GameState,
  type PrngStateV1,
  type TimedEffectV1,
  type TimedEffectExpirationV1,
  type UnitState
} from './types';

const PHASE_ORDER = ['command', 'movement', 'shooting', 'charge', 'fight'] as const;
const MODIFIED_CHARACTERISTICS = new Set([
  'movement', 'toughness', 'range', 'attacks', 'strength', 'damage',
  'save', 'invulnerable-save', 'leadership', 'objective-control',
  'weapon-skill', 'ballistic-skill', 'armour-penetration'
]);
const MODIFIER_OPERATIONS = new Set(['replace', 'multiply', 'add', 'divide', 'subtract']);

function isValidSourceReference(source: TimedEffectV1['sourceRefs'][number]): boolean {
  return Boolean(source.sourceId.trim() && source.version.trim())
    && !Number.isNaN(Date.parse(source.effectiveFrom))
    && (source.dateBasis === undefined || source.dateBasis === 'effective' || source.dateBasis === 'retrieved')
    && (source.retrievedAt === undefined || !Number.isNaN(Date.parse(source.retrievedAt)))
    && (source.dateBasis !== 'retrieved' || source.retrievedAt !== undefined);
}

export function createBattleResourcesV1(playerIds: readonly string[]): BattleResourcesV1 {
  if (playerIds.length !== 2 || new Set(playerIds).size !== playerIds.length || playerIds.some((id) => !id.trim())) {
    throw new RangeError('Battle resources require exactly two distinct players.');
  }
  return {
    schemaVersion: BATTLE_RESOURCES_V1_SCHEMA_VERSION,
    commandPointsByPlayerId: Object.fromEntries(playerIds.map((playerId) => [playerId, 0])),
    battleShockedUnitIds: [],
    timedEffects: [],
    stratagemUses: []
  };
}

export function createCommandPhaseStateV1(activePlayerId: string): CommandPhaseStateV1 {
  if (!activePlayerId.trim()) throw new RangeError('A command phase requires an active player.');
  return {
    schemaVersion: COMMAND_PHASE_V1_SCHEMA_VERSION,
    activePlayerId,
    stage: 'start',
    pendingBattleShockUnitIds: [],
    testedBattleShockUnitIds: []
  };
}

/** 01.02.01: single-model units use wounds; other units use surviving models. */
export function unitIsAtOrBelowHalfStrengthV1(unit: UnitState): boolean {
  const active = unit.models.filter((model) => model.active);
  if (unit.initialStrength === 1) return (active[0]?.wounds ?? 0) * 2 <= unit.woundsPerModel;
  return active.length * 2 <= unit.initialStrength;
}

export function commandPhaseBattleShockUnitIdsV1(state: GameState): readonly string[] {
  const activePlayerId = state.commandPhase?.activePlayerId;
  const resources = state.battleResources;
  if (activePlayerId === undefined || resources === null) return [];
  return Object.values(state.units)
    .filter((unit) => unit.playerId === activePlayerId && unit.models.some((model) => model.active)
      && (resources.battleShockedUnitIds.includes(unit.id) || unitIsAtOrBelowHalfStrengthV1(unit)))
    .map((unit) => unit.id)
    .sort((left, right) => left.localeCompare(right));
}

export function resolveBattleShockTestV1(
  prng: PrngStateV1,
  unit: UnitState,
  resources: BattleResourcesV1,
  reason: BattleShockTestResultV1['reason']
): { readonly result: BattleShockTestResultV1; readonly prngAfter: PrngStateV1; readonly battleShockedUnitIdsAfter: readonly string[] } {
  const leadership = unit.leadership;
  if (!Number.isInteger(leadership) || leadership! < 2 || leadership! > 12) {
    throw new RangeError(`Unit ${unit.id} has no executable Leadership characteristic.`);
  }
  const dice = rollDice(prng, 6, 2);
  const roll = dice.results as unknown as readonly [number, number];
  const total = roll[0] + roll[1];
  const passed = total >= leadership!;
  const wasBattleShocked = resources.battleShockedUnitIds.includes(unit.id);
  const nextIds = new Set(resources.battleShockedUnitIds);
  if (passed) nextIds.delete(unit.id);
  else nextIds.add(unit.id);
  return {
    result: {
      unitId: unit.id,
      reason,
      roll,
      total,
      leadership: leadership!,
      passed,
      wasBattleShocked,
      atOrBelowHalfStrength: unitIsAtOrBelowHalfStrengthV1(unit)
    },
    prngAfter: dice.state,
    battleShockedUnitIdsAfter: [...nextIds].sort((left, right) => left.localeCompare(right))
  };
}

function momentOrdinal(moment: BattleMomentV1): number {
  const phaseIndex = PHASE_ORDER.indexOf(moment.phase as (typeof PHASE_ORDER)[number]);
  if (!Number.isInteger(moment.battleRound) || moment.battleRound < 1
    || ![1, 2].includes(moment.turnNumber) || phaseIndex < 0
    || (moment.boundary !== 'start' && moment.boundary !== 'end')) {
    throw new RangeError('A timed-effect boundary must be a valid battle moment.');
  }
  return (((moment.battleRound * 3) + moment.turnNumber) * PHASE_ORDER.length + phaseIndex) * 2
    + (moment.boundary === 'end' ? 1 : 0);
}

export function assertTimedEffectV1(effect: TimedEffectV1): void {
  const modifierSource = effect.modifier.source;
  const hasModifierSource = effect.sourceRefs.some((source) => source.sourceId === modifierSource.sourceId
    && source.version === modifierSource.version
    && source.effectiveFrom === modifierSource.effectiveFrom
    && source.dateBasis === modifierSource.dateBasis
    && source.retrievedAt === modifierSource.retrievedAt
    && source.reference === modifierSource.reference
    && source.page === modifierSource.page);
  const modifierMagnitudeIsValid = Number.isSafeInteger(effect.modifier.value)
    && (effect.modifier.operation === 'multiply' || effect.modifier.operation === 'divide'
      ? effect.modifier.value > 0
      : effect.modifier.value >= 0);
  if (effect.schemaVersion !== TIMED_EFFECT_V1_SCHEMA_VERSION || !effect.id.trim() || !effect.targetUnitId.trim()
    || !effect.modifier.id.trim() || !MODIFIED_CHARACTERISTICS.has(effect.modifier.characteristic)
    || !MODIFIER_OPERATIONS.has(effect.modifier.operation) || !modifierMagnitudeIsValid
    || effect.sourceRefs.length === 0 || effect.sourceRefs.some((source) => !isValidSourceReference(source))
    || !isValidSourceReference(modifierSource)
    || !hasModifierSource
    || momentOrdinal(effect.appliedAt) < 0
    || (effect.expiresAt !== null && momentOrdinal(effect.expiresAt) <= momentOrdinal(effect.appliedAt))) {
    throw new RangeError('Timed effect is malformed or has a non-future expiration.');
  }
}

export function applyTimedEffectV1(resources: BattleResourcesV1, effect: TimedEffectV1): BattleResourcesV1 {
  assertTimedEffectV1(effect);
  if (resources.timedEffects.some((candidate) => candidate.id === effect.id)) throw new RangeError(`Timed effect ${effect.id} already exists.`);
  return { ...resources, timedEffects: [...resources.timedEffects, effect].sort((left, right) => left.id.localeCompare(right.id)) };
}

export function dueTimedEffectIdsV1(resources: BattleResourcesV1, moment: BattleMomentV1): readonly string[] {
  const ordinal = momentOrdinal(moment);
  return resources.timedEffects.filter((effect) => effect.expiresAt !== null && momentOrdinal(effect.expiresAt) <= ordinal)
    .map((effect) => effect.id).sort((left, right) => left.localeCompare(right));
}

export function expireTimedEffectsV1(resources: BattleResourcesV1, effectIds: readonly string[]): BattleResourcesV1 {
  if (new Set(effectIds).size !== effectIds.length || effectIds.some((id) => !resources.timedEffects.some((effect) => effect.id === id))) {
    throw new RangeError('Timed-effect expiration must reference existing unique effects.');
  }
  const expired = new Set(effectIds);
  return { ...resources, timedEffects: resources.timedEffects.filter((effect) => !expired.has(effect.id)) };
}

/** Exact end/start boundaries crossed by one deterministic battle-phase transition. */
export function timedEffectExpirationsForPhaseTransitionV1(
  resources: BattleResourcesV1,
  current: Pick<BattleMomentV1, 'battleRound' | 'turnNumber' | 'phase'>,
  next: Pick<BattleMomentV1, 'battleRound' | 'turnNumber' | 'phase'>
): readonly TimedEffectExpirationV1[] {
  const moments: BattleMomentV1[] = [];
  if (PHASE_ORDER.includes(current.phase as (typeof PHASE_ORDER)[number])) moments.push({ ...current, boundary: 'end' });
  if (PHASE_ORDER.includes(next.phase as (typeof PHASE_ORDER)[number])) moments.push({ ...next, boundary: 'start' });
  let remaining = resources;
  const expirations: TimedEffectExpirationV1[] = [];
  for (const moment of moments) {
    const effectIds = dueTimedEffectIdsV1(remaining, moment);
    if (effectIds.length === 0) continue;
    expirations.push({ moment, effectIds });
    remaining = expireTimedEffectsV1(remaining, effectIds);
  }
  return expirations;
}

export function applyTimedEffectExpirationsV1(
  resources: BattleResourcesV1,
  expirations: readonly TimedEffectExpirationV1[]
): BattleResourcesV1 {
  return expirations.reduce((current, expiration) => (
    expiration.effectIds.length === 0 ? current : expireTimedEffectsV1(current, expiration.effectIds)
  ), resources);
}
