/**
 * Deterministic exact rational arithmetic for geometry predicates that cannot
 * accept floating-point rounding. Every value is reduced, has a positive
 * denominator, and can therefore be persisted in one canonical representation.
 */
export interface ExactRational {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

/** Canonical JSON-safe representation of an {@link ExactRational}. */
export interface SerializedExactRational {
  readonly numerator: string;
  readonly denominator: string;
}

const CANONICAL_NUMERATOR = /^(?:0|-[1-9][0-9]*|[1-9][0-9]*)$/;
const CANONICAL_DENOMINATOR = /^[1-9][0-9]*$/;

/**
 * Creates an exact rational and normalises its sign and greatest common divisor.
 * Both arguments must be BigInts; use {@link exactRationalFromSafeInteger} for
 * validated simulator world-unit inputs.
 */
export function createExactRational(numerator: bigint, denominator: bigint = 1n): ExactRational {
  assertBigInt(numerator, 'numerator');
  assertBigInt(denominator, 'denominator');
  if (denominator === 0n) throw new RangeError('An exact rational denominator cannot be zero.');

  let normalisedNumerator = numerator;
  let normalisedDenominator = denominator;
  if (normalisedDenominator < 0n) {
    normalisedNumerator = -normalisedNumerator;
    normalisedDenominator = -normalisedDenominator;
  }
  if (normalisedNumerator === 0n) return freezeExactRational(0n, 1n);

  const divisor = greatestCommonDivisor(normalisedNumerator, normalisedDenominator);
  return freezeExactRational(normalisedNumerator / divisor, normalisedDenominator / divisor);
}

/** Creates a rational from one validated integer world-unit value. */
export function exactRationalFromSafeInteger(value: number): ExactRational {
  if (!Number.isSafeInteger(value)) throw new TypeError('An exact rational integer input must be a safe integer.');
  return createExactRational(BigInt(value));
}

/**
 * Parses a canonical serialized rational. Alternate spellings such as `2/4`,
 * `01/2`, and negative denominators are rejected instead of silently changing
 * persisted data during a replay.
 */
export function parseExactRational(value: SerializedExactRational): ExactRational {
  if (typeof value !== 'object' || value === null) throw new TypeError('A serialized exact rational must be an object.');
  if (typeof value.numerator !== 'string' || typeof value.denominator !== 'string') {
    throw new TypeError('A serialized exact rational requires decimal numerator and denominator strings.');
  }
  if (!CANONICAL_NUMERATOR.test(value.numerator) || !CANONICAL_DENOMINATOR.test(value.denominator)) {
    throw new TypeError('A serialized exact rational must use canonical decimal strings with a positive denominator.');
  }

  const rational = createExactRational(BigInt(value.numerator), BigInt(value.denominator));
  if (rational.numerator.toString() !== value.numerator || rational.denominator.toString() !== value.denominator) {
    throw new TypeError('A serialized exact rational must be reduced and canonical.');
  }
  return rational;
}

/** Serializes a rational as canonical decimal strings safe for JSON persistence. */
export function serializeExactRational(value: ExactRational): SerializedExactRational {
  assertCanonicalExactRational(value);
  return Object.freeze({ numerator: value.numerator.toString(), denominator: value.denominator.toString() });
}

/** Returns `left + right` with canonical normalisation. */
export function addExactRationals(left: ExactRational, right: ExactRational): ExactRational {
  assertCanonicalExactRational(left, 'left exact rational');
  assertCanonicalExactRational(right, 'right exact rational');
  return createExactRational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator
  );
}

/** Returns `left - right` with canonical normalisation. */
export function subtractExactRationals(left: ExactRational, right: ExactRational): ExactRational {
  assertCanonicalExactRational(left, 'left exact rational');
  assertCanonicalExactRational(right, 'right exact rational');
  return createExactRational(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator
  );
}

/** Returns `left * right` with canonical normalisation. */
export function multiplyExactRationals(left: ExactRational, right: ExactRational): ExactRational {
  assertCanonicalExactRational(left, 'left exact rational');
  assertCanonicalExactRational(right, 'right exact rational');
  return createExactRational(left.numerator * right.numerator, left.denominator * right.denominator);
}

/** Returns `left / right`; division by zero is rejected explicitly. */
export function divideExactRationals(left: ExactRational, right: ExactRational): ExactRational {
  assertCanonicalExactRational(left, 'left exact rational');
  assertCanonicalExactRational(right, 'right exact rational');
  if (right.numerator === 0n) throw new RangeError('Cannot divide an exact rational by zero.');
  return createExactRational(left.numerator * right.denominator, left.denominator * right.numerator);
}

/** Returns `-value` with canonical normalisation. */
export function negateExactRational(value: ExactRational): ExactRational {
  assertCanonicalExactRational(value);
  return createExactRational(-value.numerator, value.denominator);
}

/** Compares two rationals exactly without converting either value to a Number. */
export function compareExactRationals(left: ExactRational, right: ExactRational): -1 | 0 | 1 {
  assertCanonicalExactRational(left, 'left exact rational');
  assertCanonicalExactRational(right, 'right exact rational');
  const difference = left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

/** Returns whether two rationals have exactly the same mathematical value. */
export function areExactRationalsEqual(left: ExactRational, right: ExactRational): boolean {
  return compareExactRationals(left, right) === 0;
}

/** Rejects forged or non-canonical values before they can affect a geometry decision. */
export function assertCanonicalExactRational(value: ExactRational, label = 'Exact rational'): void {
  if (typeof value !== 'object' || value === null) throw new TypeError(`${label} must be an object.`);
  assertBigInt(value.numerator, `${label} numerator`);
  assertBigInt(value.denominator, `${label} denominator`);
  if (value.denominator <= 0n) throw new RangeError(`${label} denominator must be positive.`);
  if (value.numerator === 0n && value.denominator !== 1n) throw new RangeError(`${label} zero must have denominator 1.`);
  if (value.numerator !== 0n && greatestCommonDivisor(value.numerator, value.denominator) !== 1n) {
    throw new RangeError(`${label} must be reduced.`);
  }
}

function freezeExactRational(numerator: bigint, denominator: bigint): ExactRational {
  return Object.freeze({ numerator, denominator });
}

function assertBigInt(value: unknown, label: string): asserts value is bigint {
  if (typeof value !== 'bigint') throw new TypeError(`${label} must be a BigInt.`);
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let first = absoluteBigInt(left);
  let second = absoluteBigInt(right);
  while (second !== 0n) {
    const remainder = first % second;
    first = second;
    second = remainder;
  }
  return first;
}

function absoluteBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
}
