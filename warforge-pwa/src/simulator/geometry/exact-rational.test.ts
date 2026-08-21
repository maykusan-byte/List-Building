import { describe, expect, it } from 'vitest';
import {
  addExactRationals,
  areExactRationalsEqual,
  compareExactRationals,
  createExactRational,
  divideExactRationals,
  exactRationalFromSafeInteger,
  multiplyExactRationals,
  negateExactRational,
  parseExactRational,
  serializeExactRational,
  subtractExactRationals
} from './exact-rational';

describe('exact rational arithmetic', () => {
  it('normalizes signs and the greatest common divisor into one canonical value', () => {
    expect(createExactRational(-6n, -8n)).toEqual({ numerator: 3n, denominator: 4n });
    expect(createExactRational(6n, -8n)).toEqual({ numerator: -3n, denominator: 4n });
    expect(createExactRational(0n, -11n)).toEqual({ numerator: 0n, denominator: 1n });
  });

  it('keeps zero and negation exact', () => {
    const zero = createExactRational(0n);
    const value = createExactRational(-13n, 17n);
    expect(addExactRationals(value, zero)).toEqual(value);
    expect(negateExactRational(negateExactRational(value))).toEqual(value);
    expect(areExactRationalsEqual(zero, negateExactRational(zero))).toBe(true);
  });

  it('compares values beyond the Number safe-integer boundary without a float decision', () => {
    const denominator = 9_007_199_254_740_992n;
    const justAboveOne = createExactRational(denominator + 1n, denominator);
    const justBelowOne = createExactRational(denominator - 1n, denominator);
    const one = createExactRational(1n);

    expect(compareExactRationals(justAboveOne, one)).toBe(1);
    expect(compareExactRationals(justBelowOne, one)).toBe(-1);
    expect(compareExactRationals(justAboveOne, justBelowOne)).toBe(1);
  });

  it('preserves arithmetic laws and rejects division by exact zero', () => {
    const left = createExactRational(3n, 7n);
    const right = createExactRational(-5n, 9n);
    const zero = createExactRational(0n);

    expect(addExactRationals(left, right)).toEqual(createExactRational(-8n, 63n));
    expect(subtractExactRationals(left, right)).toEqual(createExactRational(62n, 63n));
    expect(divideExactRationals(multiplyExactRationals(left, right), right)).toEqual(left);
    expect(addExactRationals(left, negateExactRational(left))).toEqual(zero);
    expect(() => divideExactRationals(left, zero)).toThrow(/zero/i);
  });

  it('rejects unsafe or non-integer Number inputs and invalid BigInt denominators', () => {
    expect(() => exactRationalFromSafeInteger(1.5)).toThrow(/safe integer/i);
    expect(() => exactRationalFromSafeInteger(Number.MAX_SAFE_INTEGER + 1)).toThrow(/safe integer/i);
    expect(() => createExactRational(1n, 0n)).toThrow(/zero/i);
    expect(() => createExactRational(1 as unknown as bigint, 1n)).toThrow(/BigInt/i);
  });

  it('round-trips only canonical decimal serialization', () => {
    const original = createExactRational(-123_456_789_123_456_789n, 1_000_000_007n);
    const serialized = serializeExactRational(original);

    expect(serialized).toEqual({ numerator: '-123456789123456789', denominator: '1000000007' });
    expect(parseExactRational(serialized)).toEqual(original);
  });

  it('rejects malformed, non-positive, and non-canonical serialized values', () => {
    expect(() => parseExactRational({ numerator: '2', denominator: '4' })).toThrow(/reduced/i);
    expect(() => parseExactRational({ numerator: '01', denominator: '2' })).toThrow(/canonical/i);
    expect(() => parseExactRational({ numerator: '-0', denominator: '1' })).toThrow(/canonical/i);
    expect(() => parseExactRational({ numerator: '1', denominator: '-2' })).toThrow(/positive/i);
    expect(() => parseExactRational({ numerator: '1', denominator: '0' })).toThrow(/positive/i);
    expect(() => parseExactRational({ numerator: '1.5', denominator: '2' })).toThrow(/canonical/i);
  });
});
