import { rollDice } from '../domain/prng';
import type { PrngStateV1, SourceReferenceV1 } from '../domain/types';
import { CORE_DICE_SOURCE, OFFICIAL_APP_RANDOM_CHARACTERISTICS_SOURCE } from './m5-source-references';

/** A deliberately small grammar: fixed N, D3/D6, optional dice count and +N. */
export type RandomCharacteristicExpressionV1 =
  | { readonly kind: 'fixed'; readonly value: number; readonly source: SourceReferenceV1 }
  | { readonly kind: 'dice'; readonly diceCount: number; readonly sides: 3 | 6; readonly addend: number; readonly source: SourceReferenceV1 };

export type RandomCharacteristicKindV1 = 'movement' | 'attacks' | 'damage' | 'other';
export type RandomCharacteristicTimingV1 = 'selected-for-movement' | 'generate-attacks' | 'allocate-damage' | 'when-required';

export interface RandomCharacteristicContextV1 {
  readonly characteristic: RandomCharacteristicKindV1;
  /** The authoritative rule-engine window; never inferred from the UI. */
  readonly timing: RandomCharacteristicTimingV1;
}

export type RandomCharacteristicRejectionCode =
  | 'invalid-random-characteristic-expression'
  | 'unsupported-random-characteristic-expression'
  | 'invalid-random-characteristic-timing';

type RandomCharacteristicParseRejectionCode = Exclude<RandomCharacteristicRejectionCode, 'invalid-random-characteristic-timing'>;

export type RandomCharacteristicParseResult =
  | { readonly accepted: true; readonly expression: RandomCharacteristicExpressionV1 }
  | { readonly accepted: false; readonly code: RandomCharacteristicParseRejectionCode; readonly message: string };

export type RandomCharacteristicResolution =
  | {
    readonly accepted: true;
    readonly expression: RandomCharacteristicExpressionV1;
    readonly context: RandomCharacteristicContextV1;
    readonly dice: readonly number[];
    readonly value: number;
    readonly sourceRefs: readonly SourceReferenceV1[];
    readonly prngBefore: PrngStateV1;
    readonly prngAfter: PrngStateV1;
  }
  | {
    readonly accepted: false;
    readonly code: RandomCharacteristicRejectionCode;
    readonly message: string;
    readonly sourceRefs: readonly SourceReferenceV1[];
    readonly prngAfter: PrngStateV1;
  };

function invalidExpression(code: RandomCharacteristicParseRejectionCode, message: string): RandomCharacteristicParseResult {
  return { accepted: false, code, message };
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

/**
 * Parses only formats directly exercised by the captured rule: an integer N,
 * D3/D6, 2D6 and a non-negative addition such as D6+1.  Multiplication,
 * subtraction, variable names and free prose remain explicit refusals.
 */
export function parseRandomCharacteristicExpression(raw: unknown): RandomCharacteristicParseResult {
  if (typeof raw === 'number') {
    return isPositiveSafeInteger(raw)
      ? { accepted: true, expression: { kind: 'fixed', value: raw, source: OFFICIAL_APP_RANDOM_CHARACTERISTICS_SOURCE } }
      : invalidExpression('invalid-random-characteristic-expression', 'Une caractéristique fixe doit être un entier positif sûr.');
  }
  if (typeof raw !== 'string') return invalidExpression('invalid-random-characteristic-expression', 'Une caractéristique aléatoire doit être un nombre ou une expression texte.');

  const expression = raw.trim().toUpperCase().replace(/\s+/gu, '');
  if (/^[1-9]\d*$/u.test(expression)) {
    const value = Number(expression);
    return isPositiveSafeInteger(value)
      ? { accepted: true, expression: { kind: 'fixed', value, source: OFFICIAL_APP_RANDOM_CHARACTERISTICS_SOURCE } }
      : invalidExpression('invalid-random-characteristic-expression', 'La valeur fixe dépasse la plage entière sûre.');
  }

  const match = /^(?<count>[1-9]\d*)?D(?<sides>3|6)(?:\+(?<addend>\d+))?$/u.exec(expression);
  if (match?.groups) {
    const diceCount = match.groups.count === undefined ? 1 : Number(match.groups.count);
    const sides = Number(match.groups.sides) as 3 | 6;
    const addend = match.groups.addend === undefined ? 0 : Number(match.groups.addend);
    if (Number.isSafeInteger(diceCount) && diceCount >= 1 && diceCount <= 100 && Number.isSafeInteger(addend)) {
      return { accepted: true, expression: { kind: 'dice', diceCount, sides, addend, source: OFFICIAL_APP_RANDOM_CHARACTERISTICS_SOURCE } };
    }
    return invalidExpression('invalid-random-characteristic-expression', 'Le nombre de dés doit être compris entre 1 et 100 et l’addition doit être sûre.');
  }
  return invalidExpression('unsupported-random-characteristic-expression', `L’expression aléatoire « ${raw} » n’est pas couverte.`);
}

function expectedTiming(characteristic: RandomCharacteristicKindV1): RandomCharacteristicTimingV1 {
  switch (characteristic) {
    case 'movement': return 'selected-for-movement';
    case 'attacks': return 'generate-attacks';
    case 'damage': return 'allocate-damage';
    case 'other': return 'when-required';
  }
}

function sourceReferences(expression: RandomCharacteristicExpressionV1): readonly SourceReferenceV1[] {
  return expression.kind === 'dice'
    ? [expression.source, CORE_DICE_SOURCE]
    : [expression.source];
}

/**
 * Resolves exactly one characteristic at its official decision window.  The
 * returned dice and states are event-ready, while rejected inputs preserve the
 * supplied PRNG state byte-for-byte.
 */
export function resolveRandomCharacteristic(
  raw: unknown,
  context: RandomCharacteristicContextV1,
  prng: PrngStateV1
): RandomCharacteristicResolution {
  const parsed = parseRandomCharacteristicExpression(raw);
  if (!parsed.accepted) return { ...parsed, sourceRefs: [OFFICIAL_APP_RANDOM_CHARACTERISTICS_SOURCE], prngAfter: prng };
  if (context.timing !== expectedTiming(context.characteristic)) {
    return {
      accepted: false,
      code: 'invalid-random-characteristic-timing',
      message: 'La caractéristique aléatoire est demandée hors de sa fenêtre de règle autoritaire.',
      sourceRefs: [OFFICIAL_APP_RANDOM_CHARACTERISTICS_SOURCE],
      prngAfter: prng
    };
  }
  if (parsed.expression.kind === 'fixed') {
    return {
      accepted: true,
      expression: parsed.expression,
      context,
      dice: [],
      value: parsed.expression.value,
      sourceRefs: sourceReferences(parsed.expression),
      prngBefore: prng,
      prngAfter: prng
    };
  }
  const diceExpression = parsed.expression;
  if (diceExpression.kind !== 'dice') throw new Error('A non-fixed random characteristic must resolve from dice.');
  // 01.05 defines D3 as a D6 result divided by two and rounded up. The
  // physical D6 results are retained for deterministic replay and audit.
  const outcome = rollDice(prng, 6, diceExpression.diceCount);
  return {
    accepted: true,
    expression: diceExpression,
    context,
    dice: outcome.results,
    value: outcome.results.reduce((sum, die) => sum + (diceExpression.sides === 3 ? Math.ceil(die / 2) : die), diceExpression.addend),
    sourceRefs: sourceReferences(diceExpression),
    prngBefore: prng,
    prngAfter: outcome.state
  };
}
