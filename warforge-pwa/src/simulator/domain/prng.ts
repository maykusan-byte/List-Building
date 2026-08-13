import type { PrngStateV1 } from './types';

const UINT32_MAX_EXCLUSIVE = 0x1_0000_0000;

function assertUint32(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value >= UINT32_MAX_EXCLUSIVE) {
    throw new RangeError(`${label} must be an unsigned 32-bit integer.`);
  }
}

export function createPrngState(seed: number): PrngStateV1 {
  assertUint32(seed, 'seed');
  return { algorithm: 'mulberry32', version: 1, seed, value: seed, draws: 0 };
}

/**
 * A specified mulberry32 step. Math.imul and unsigned shifts deliberately
 * constrain every intermediate to the same 32-bit behaviour in all engines.
 */
export function nextUint32(state: PrngStateV1): { readonly value: number; readonly state: PrngStateV1 } {
  assertPrngState(state);
  const nextValue = (state.value + 0x6d2b79f5) >>> 0;
  let mixed = nextValue;
  mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  const value = (mixed ^ (mixed >>> 14)) >>> 0;
  return {
    value,
    state: { ...state, value: nextValue, draws: state.draws + 1 }
  };
}

/** Rolls uniformly without modulo bias; discarded values remain auditable draws. */
export function rollDie(state: PrngStateV1, sides: number): { readonly face: number; readonly state: PrngStateV1 } {
  if (!Number.isInteger(sides) || sides < 2 || sides > 1_000_000) throw new RangeError('sides must be an integer between 2 and 1,000,000.');
  const ceiling = Math.floor(UINT32_MAX_EXCLUSIVE / sides) * sides;
  let current = state;
  do {
    const next = nextUint32(current);
    current = next.state;
    if (next.value < ceiling) return { face: (next.value % sides) + 1, state: current };
  } while (true);
}

export function rollDice(state: PrngStateV1, sides: number, count: number): { readonly results: readonly number[]; readonly state: PrngStateV1 } {
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new RangeError('count must be an integer between 1 and 100.');
  const results: number[] = [];
  let current = state;
  for (let index = 0; index < count; index += 1) {
    const roll = rollDie(current, sides);
    results.push(roll.face);
    current = roll.state;
  }
  return { results, state: current };
}

export function prngStatesEqual(left: PrngStateV1, right: PrngStateV1): boolean {
  return left.algorithm === right.algorithm
    && left.version === right.version
    && left.seed === right.seed
    && left.value === right.value
    && left.draws === right.draws;
}

export function assertPrngState(value: PrngStateV1): void {
  if (value.algorithm !== 'mulberry32' || value.version !== 1) throw new RangeError('Unsupported PRNG algorithm or version.');
  assertUint32(value.seed, 'seed');
  assertUint32(value.value, 'value');
  if (!Number.isInteger(value.draws) || value.draws < 0) throw new RangeError('draws must be a non-negative integer.');
}
