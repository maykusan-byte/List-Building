import { describe, expect, it } from 'vitest';
import { createPrngState, rollDice } from '../domain';
import { CORE_DICE_SOURCE, OFFICIAL_APP_RANDOM_CHARACTERISTICS_SOURCE } from './m5-source-references';
import { parseRandomCharacteristicExpression, resolveRandomCharacteristic } from './random-characteristics';

describe('M5 random characteristics', () => {
  it('parses only the compact N / D3 / D6 plus addition grammar with canonical provenance', () => {
    expect(parseRandomCharacteristicExpression(' 2d6 + 1 ')).toEqual({
      accepted: true,
      expression: { kind: 'dice', diceCount: 2, sides: 6, addend: 1, source: OFFICIAL_APP_RANDOM_CHARACTERISTICS_SOURCE }
    });
    expect(parseRandomCharacteristicExpression(3)).toEqual({
      accepted: true,
      expression: { kind: 'fixed', value: 3, source: OFFICIAL_APP_RANDOM_CHARACTERISTICS_SOURCE }
    });
  });

  it.each(['D6-1', 'D6*2', 'D8', '0', 'D6+foo', 'N'])('rejects uncovered random syntax without a state transition: %s', (expression) => {
    const seed = createPrngState(0x57465247);
    const result = resolveRandomCharacteristic(expression, { characteristic: 'attacks', timing: 'generate-attacks' }, seed);
    expect(result).toMatchObject({ accepted: false, prngAfter: seed });
  });

  it('uses the versioned PRNG and stores each die for attacks generated at 04.03', () => {
    const seed = createPrngState(0x57465247);
    const expected = rollDice(seed, 6, 2);
    const result = resolveRandomCharacteristic('2D6+1', { characteristic: 'attacks', timing: 'generate-attacks' }, seed);
    expect(result).toMatchObject({ accepted: true, dice: expected.results, value: expected.results[0] + expected.results[1] + 1, prngBefore: seed, prngAfter: expected.state });
  });

  it('resolves D3 from physical D6 rolls, halved and rounded up under 01.05', () => {
    const seed = createPrngState(0);
    const expectedD6 = rollDice(seed, 6, 1);
    const result = resolveRandomCharacteristic('D3', { characteristic: 'attacks', timing: 'generate-attacks' }, seed);
    expect(expectedD6.results).toEqual([3]);
    expect(result).toEqual(expect.objectContaining({
      accepted: true,
      dice: [3],
      value: 2,
      sourceRefs: [OFFICIAL_APP_RANDOM_CHARACTERISTICS_SOURCE, CORE_DICE_SOURCE],
      prngBefore: seed,
      prngAfter: expectedD6.state
    }));
  });

  it('refuses an incorrect rule window before consuming a die', () => {
    const seed = createPrngState(7);
    expect(resolveRandomCharacteristic('D6', { characteristic: 'damage', timing: 'generate-attacks' }, seed)).toMatchObject({
      accepted: false,
      code: 'invalid-random-characteristic-timing',
      prngAfter: seed
    });
  });

  it('keeps fixed characteristics deterministic without a PRNG draw', () => {
    const seed = createPrngState(7);
    expect(resolveRandomCharacteristic('6', { characteristic: 'other', timing: 'when-required' }, seed)).toMatchObject({ accepted: true, dice: [], value: 6, prngAfter: seed });
  });
});
