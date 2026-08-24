import type { SourceReferenceV1, WeaponAttackVolumeAbilityV1, WeaponProfileV1, WorldUnit } from '../domain/types';

const CORE_SOURCE_ID = 'warforge-core-rules-fr-2026-07';
const CORE_SOURCE_VERSION = 'archive-2026-07-28';
const CORE_SOURCE_EFFECTIVE_FROM = '2026-07-28';

/** [DÉFLAGRATION X], rule 24.05 on printed page 81. */
export const CORE_BLAST_SOURCE: SourceReferenceV1 = {
  sourceId: CORE_SOURCE_ID,
  version: CORE_SOURCE_VERSION,
  effectiveFrom: CORE_SOURCE_EFFECTIVE_FROM,
  reference: '24.05',
  page: 81
};

/** [TIR RAPIDE X], rule 24.30 on printed page 85. */
export const CORE_RAPID_FIRE_SOURCE: SourceReferenceV1 = {
  sourceId: CORE_SOURCE_ID,
  version: CORE_SOURCE_VERSION,
  effectiveFrom: CORE_SOURCE_EFFECTIVE_FROM,
  reference: '24.30',
  page: 85
};

/** Choosing a unit to shoot once per phase, rule 10.02 on printed page 34. */
export const CORE_UNIT_SELECTED_TO_SHOOT_SOURCE: SourceReferenceV1 = {
  sourceId: CORE_SOURCE_ID,
  version: CORE_SOURCE_VERSION,
  effectiveFrom: CORE_SOURCE_EFFECTIVE_FROM,
  reference: '10.02',
  page: 34
};

export interface AttackVolumeBreakdown {
  readonly targetModelCount: number;
  readonly baseAttacksPerWeapon: number;
  readonly rapidFireBonus: number;
  readonly blastBonus: number;
  readonly attacksPerWeapon: number;
  readonly atHalfRange: boolean;
  readonly sourceRefs: readonly SourceReferenceV1[];
}

export type AttackVolumeResolution =
  | { readonly accepted: true; readonly breakdown: AttackVolumeBreakdown }
  | { readonly accepted: false; readonly code: 'unsupported-attack-volume-ability' | 'invalid-attack-volume-input'; readonly message: string };

function sameSource(left: SourceReferenceV1, right: SourceReferenceV1): boolean {
  return left.sourceId === right.sourceId
    && left.version === right.version
    && left.effectiveFrom === right.effectiveFrom
    && left.reference === right.reference
    && left.page === right.page;
}

function expectedSource(ability: WeaponAttackVolumeAbilityV1): SourceReferenceV1 {
  return ability.kind === 'rapid-fire' ? CORE_RAPID_FIRE_SOURCE : CORE_BLAST_SOURCE;
}

/**
 * M5-T02.3 only accepts the two typed, canonical abilities.  This gives an
 * explicit refusal path for every future keyword until its own contract exists.
 */
export function hasSupportedAttackVolumeAbilities(weapon: WeaponProfileV1): boolean {
  const abilities = weapon.attackVolumeAbilities ?? [];
  return new Set(abilities.map((ability) => ability.kind)).size === abilities.length
    && abilities.every((ability) => Number.isInteger(ability.value) && ability.value > 0 && sameSource(ability.source, expectedSource(ability)));
}

/**
 * Resolves a weapon's attacks per carried weapon.  `targetModelCount` must be
 * supplied by trusted orchestration from the active models in GameState; it is
 * captured once when targets are chosen, before any dice are rolled.
 */
export function resolveAttackVolume(
  weapon: WeaponProfileV1,
  distance: WorldUnit,
  targetModelCount: number
): AttackVolumeResolution {
  if (!Number.isInteger(weapon.attacks) || weapon.attacks <= 0
    || !Number.isInteger(weapon.range) || weapon.range < 0
    || !Number.isFinite(distance) || distance < 0
    || !Number.isInteger(targetModelCount) || targetModelCount <= 0) {
    return { accepted: false, code: 'invalid-attack-volume-input', message: 'Le volume d’attaques exige une arme, une distance et un nombre de figurines autoritaires entiers.' };
  }
  if (!hasSupportedAttackVolumeAbilities(weapon)) {
    return { accepted: false, code: 'unsupported-attack-volume-ability', message: 'Une aptitude de volume d’attaques n’est pas couverte ou sa provenance n’est pas canonique.' };
  }
  const abilities = weapon.attackVolumeAbilities ?? [];
  const rapidFire = abilities.find((ability) => ability.kind === 'rapid-fire');
  const blast = abilities.find((ability) => ability.kind === 'blast');
  // This avoids fractions while implementing “within half range” exactly.
  const atHalfRange = distance * 2 <= weapon.range;
  const rapidFireBonus = rapidFire && atHalfRange ? rapidFire.value : 0;
  const blastBonus = blast ? Math.floor(targetModelCount / 5) * blast.value : 0;
  return {
    accepted: true,
    breakdown: {
      targetModelCount,
      baseAttacksPerWeapon: weapon.attacks,
      rapidFireBonus,
      blastBonus,
      attacksPerWeapon: weapon.attacks + rapidFireBonus + blastBonus,
      atHalfRange,
      sourceRefs: abilities.map((ability) => ability.source)
    }
  };
}
