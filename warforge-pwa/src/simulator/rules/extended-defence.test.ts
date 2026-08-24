import { describe, expect, it } from 'vitest';
import { createPrngState, rollDice } from '../domain';
import { CORE_CHARACTERISTIC_TESTS_SOURCE, CORE_DEVASTATING_WOUNDS_SOURCE, CORE_FEEL_NO_PAIN_SOURCE, CORE_MORTAL_WOUNDS_SOURCE } from './m5-source-references';
import { resolveExtendedDamage } from './extended-defence';

const defence = {
  save: 3 as const,
  sourceRefs: [CORE_CHARACTERISTIC_TESTS_SOURCE]
};

function seedFor(firstRoll: number): number {
  for (let seed = 0; seed < 10_000; seed += 1) {
    if (rollDice(createPrngState(seed), 6, 1).results[0] === firstRoll) return seed;
  }
  throw new Error(`No deterministic seed found for D6=${firstRoll}.`);
}

describe('T04 extended fixture defence', () => {
  it('uses SvIn before Sv+PA and preserves an unmodified natural 4 save at PA-4', () => {
    const seed = createPrngState(seedFor(4));
    const result = resolveExtendedDamage({ armourPenetration: -4, damage: 1, atHalfRange: false, defence: { ...defence, invulnerableSave: 4 } }, seed);

    expect(result).toMatchObject({
      accepted: true,
      save: { roll: 4, path: 'invulnerable', saved: true },
      damageLost: 0,
      prngAfter: rollDice(seed, 6, 1).state
    });
  });

  it('adds [MELTA 2] only at the frozen half-range target-choice boundary after resolving D3', () => {
    const seed = createPrngState(seedFor(1));
    const atHalfRange = resolveExtendedDamage({ armourPenetration: -4, damage: 1, randomDamage: 'D3', fusionBonus: 2, atHalfRange: true, defence }, seed);
    const beyondHalfRange = resolveExtendedDamage({ armourPenetration: -4, damage: 1, randomDamage: 'D3', fusionBonus: 2, atHalfRange: false, defence }, seed);

    expect(atHalfRange).toMatchObject({ accepted: true, save: { roll: 1, saved: false } });
    expect(beyondHalfRange).toMatchObject({ accepted: true, save: { roll: 1, saved: false } });
    if (!atHalfRange.accepted || !beyondHalfRange.accepted) throw new Error('The fixture damage request must be valid.');
    expect(atHalfRange.randomDamage).toEqual(beyondHalfRange.randomDamage);
    expect(atHalfRange.damageBeforeFeelNoPain).toBe(beyondHalfRange.damageBeforeFeelNoPain + 2);
    expect(atHalfRange.prngAfter).toEqual(beyondHalfRange.prngAfter);
  });

  it('turns a devastating critical wound into exactly its own mortal-damage packet with no save roll', () => {
    const seed = createPrngState(0);
    const result = resolveExtendedDamage({ armourPenetration: -4, damage: 2, atHalfRange: false, devastatingCriticalWound: true, defence }, seed);

    expect(result).toMatchObject({ accepted: true, damageBeforeFeelNoPain: 2, damageLost: 2, mortalWounds: true, prngAfter: seed });
    expect(result).not.toHaveProperty('save');
    if (!result.accepted) throw new Error('The fixture damage request must be valid.');
    expect(result.sourceRefs).toEqual(expect.arrayContaining([CORE_DEVASTATING_WOUNDS_SOURCE, CORE_MORTAL_WOUNDS_SOURCE]));
  });

  it('rolls random D before each individual Feel No Pain roll in the same PRNG chain', () => {
    const seed = createPrngState(seedFor(1));
    const result = resolveExtendedDamage({
      armourPenetration: -4,
      damage: 1,
      randomDamage: 'D3',
      atHalfRange: false,
      defence: { ...defence, feelNoPain: 5 }
    }, seed);

    expect(result).toMatchObject({ accepted: true, save: { roll: 1, saved: false } });
    if (!result.accepted || result.randomDamage === undefined || result.feelNoPain === undefined) throw new Error('The fixture damage request must resolve D3 then FNP.');
    const expected = rollDice(seed, 6, 1 + 1 + result.randomDamage.value);
    expect(result.feelNoPain.rolls).toEqual(expected.results.slice(2));
    expect(result.prngAfter).toEqual(expected.state);
    expect(result.sourceRefs).toEqual(expect.arrayContaining([CORE_FEEL_NO_PAIN_SOURCE]));
  });
});
