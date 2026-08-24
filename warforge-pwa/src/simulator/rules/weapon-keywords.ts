import type { SourceReferenceV1, WeaponKeywordV1 } from '../domain/types';
import { CORE_ANTI_SOURCE, CORE_DEVASTATING_WOUNDS_SOURCE, CORE_HAZARDOUS_SOURCE, CORE_LETHAL_HITS_SOURCE, CORE_MELTA_SOURCE, CORE_ONE_SHOT_SOURCE, CORE_SUSTAINED_HITS_SOURCE, CORE_TWIN_LINKED_SOURCE, isExactSourceReference } from './m5-source-references';

const CORE_RULES_SOURCE_ID = 'warforge-core-rules-fr-2026-07';
const CORE_RULES_SOURCE_VERSION = 'archive-2026-07-28';
const CORE_RULES_REFERENCE_DATE = '2026-07-28';

export { CORE_DEVASTATING_WOUNDS_SOURCE, CORE_HAZARDOUS_SOURCE, CORE_MELTA_SOURCE } from './m5-source-references';

/** [IGNORES COVER], rule 24.18 on printed page 82. */
export const CORE_IGNORES_COVER_SOURCE: SourceReferenceV1 = {
  sourceId: CORE_RULES_SOURCE_ID,
  version: CORE_RULES_SOURCE_VERSION,
  effectiveFrom: CORE_RULES_REFERENCE_DATE,
  reference: '24.18',
  page: 82
};

/** [TORRENT], rule 24.37 on printed page 85. */
export const CORE_TORRENT_SOURCE: SourceReferenceV1 = {
  sourceId: CORE_RULES_SOURCE_ID,
  version: CORE_RULES_SOURCE_VERSION,
  effectiveFrom: CORE_RULES_REFERENCE_DATE,
  reference: '24.37',
  page: 85
};

/** [PISTOL], rule 24.27 on printed page 84. */
export const CORE_PISTOL_SOURCE: SourceReferenceV1 = {
  sourceId: CORE_RULES_SOURCE_ID,
  version: CORE_RULES_SOURCE_VERSION,
  effectiveFrom: CORE_RULES_REFERENCE_DATE,
  reference: '24.27',
  page: 84
};

export type { WeaponKeywordV1 } from '../domain/types';

export type WeaponKeywordNormalizationRejectionCode =
  | 'invalid-weapon-keyword-input'
  | 'invalid-melta-value'
  | 'invalid-anti-value'
  | 'invalid-sustained-hits-value'
  | 'unsupported-weapon-keyword'
  | 'duplicate-weapon-keyword';

export type WeaponKeywordNormalizationResult =
  | {
    readonly accepted: true;
    /** Stable canonical order, independent from the catalog label order. */
    readonly keywords: readonly WeaponKeywordV1[];
  }
  | {
    readonly accepted: false;
    readonly code: WeaponKeywordNormalizationRejectionCode;
    readonly message: string;
    readonly inputIndex?: number;
  };

type StaticKeyword = Exclude<WeaponKeywordV1,
  { readonly kind: 'melta' }
  | { readonly kind: 'anti' }
  | { readonly kind: 'sustained-hits' }>;

const CANONICAL_KIND_ORDER: readonly WeaponKeywordV1['kind'][] = [
  'hazardous',
  'devastating-wounds',
  'melta',
  'ignores-cover',
  'torrent',
  'pistol',
  'anti',
  'sustained-hits',
  'lethal-hits',
  'twin-linked',
  'one-shot'
];

const STATIC_KEYWORDS: Readonly<Record<string, StaticKeyword>> = {
  HAZARDOUS: { kind: 'hazardous', source: CORE_HAZARDOUS_SOURCE },
  'DEVASTATING WOUNDS': { kind: 'devastating-wounds', source: CORE_DEVASTATING_WOUNDS_SOURCE },
  'IGNORES COVER': { kind: 'ignores-cover', source: CORE_IGNORES_COVER_SOURCE },
  TORRENT: { kind: 'torrent', source: CORE_TORRENT_SOURCE },
  PISTOL: { kind: 'pistol', source: CORE_PISTOL_SOURCE },
  'LETHAL HITS': { kind: 'lethal-hits', source: CORE_LETHAL_HITS_SOURCE },
  'TOUCHES FATALES': { kind: 'lethal-hits', source: CORE_LETHAL_HITS_SOURCE },
  // The local French core source proves this exact heading only.  Do not add
  // an English synonym without a separately archived, exact source.
  JUMELÉ: { kind: 'twin-linked', source: CORE_TWIN_LINKED_SOURCE },
  'ONE SHOT': { kind: 'one-shot', source: CORE_ONE_SHOT_SOURCE },
  'TIR UNIQUE': { kind: 'one-shot', source: CORE_ONE_SHOT_SOURCE }
};

function normalizeCatalogLabel(label: string): string {
  const trimmed = label.trim();
  const withoutBrackets = trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed.slice(1, -1) : trimmed;
  return withoutBrackets.trim().replace(/\s+/gu, ' ').toUpperCase();
}

function canonicalOrder(keyword: WeaponKeywordV1): number {
  return CANONICAL_KIND_ORDER.indexOf(keyword.kind);
}

function invalid(
  code: WeaponKeywordNormalizationRejectionCode,
  message: string,
  inputIndex?: number
): WeaponKeywordNormalizationResult {
  return { accepted: false, code, message, ...(inputIndex === undefined ? {} : { inputIndex }) };
}

function normalizedTargetKeyword(value: string): string | null {
  const keyword = value.trim().replace(/\s+/gu, ' ').toUpperCase();
  return /^[A-Z][A-Z0-9 -]*$/u.test(keyword) ? keyword : null;
}

function exactKeywordSource(keyword: WeaponKeywordV1): boolean {
  if (!isSourceReference(keyword.source)) return false;
  switch (keyword.kind) {
    case 'hazardous': return isExactSourceReference(keyword.source, CORE_HAZARDOUS_SOURCE);
    case 'devastating-wounds': return isExactSourceReference(keyword.source, CORE_DEVASTATING_WOUNDS_SOURCE);
    case 'melta': return isExactSourceReference(keyword.source, CORE_MELTA_SOURCE);
    case 'ignores-cover': return isExactSourceReference(keyword.source, CORE_IGNORES_COVER_SOURCE);
    case 'torrent': return isExactSourceReference(keyword.source, CORE_TORRENT_SOURCE);
    case 'pistol': return isExactSourceReference(keyword.source, CORE_PISTOL_SOURCE);
    case 'anti': return isExactSourceReference(keyword.source, CORE_ANTI_SOURCE);
    case 'sustained-hits': return isExactSourceReference(keyword.source, CORE_SUSTAINED_HITS_SOURCE);
    case 'lethal-hits': return isExactSourceReference(keyword.source, CORE_LETHAL_HITS_SOURCE);
    case 'twin-linked': return isExactSourceReference(keyword.source, CORE_TWIN_LINKED_SOURCE);
    case 'one-shot': return isExactSourceReference(keyword.source, CORE_ONE_SHOT_SOURCE);
  }
}

function isSourceReference(value: unknown): value is SourceReferenceV1 {
  return typeof value === 'object'
    && value !== null
    && typeof (value as SourceReferenceV1).sourceId === 'string'
    && typeof (value as SourceReferenceV1).version === 'string'
    && typeof (value as SourceReferenceV1).effectiveFrom === 'string';
}

/**
 * Validates already-compiled fixture facts at the state/environment boundary.
 * A repeated kind is refused rather than choosing a rule occurrence from UI
 * input: the M5 fixture contract admits exactly one occurrence per ability.
 */
export function hasSupportedWeaponKeywords(keywords: unknown): keywords is readonly WeaponKeywordV1[] | undefined {
  if (keywords === undefined) return true;
  if (!Array.isArray(keywords)) return false;
  const kinds = new Set<WeaponKeywordV1['kind']>();
  return keywords.every((entry) => {
    if (typeof entry !== 'object' || entry === null || typeof (entry as { readonly kind?: unknown }).kind !== 'string') return false;
    const keyword = entry as WeaponKeywordV1;
    if (kinds.has(keyword.kind)) return false;
    kinds.add(keyword.kind);
    if (!exactKeywordSource(keyword)) return false;
    if (keyword.kind === 'melta' || keyword.kind === 'sustained-hits') return Number.isSafeInteger(keyword.value) && keyword.value > 0;
    if (keyword.kind === 'anti') return normalizedTargetKeyword(keyword.targetKeyword) !== null && Number.isInteger(keyword.criticalWound) && keyword.criticalWound >= 2 && keyword.criticalWound <= 6;
    return true;
  });
}

/**
 * Parses the closed English catalogue vocabulary approved for M5-T02.0.
 * It never accepts a caller-supplied provenance or a free-text extension.
 */
export function normalizeWeaponKeywords(rawKeywords: unknown): WeaponKeywordNormalizationResult {
  if (!Array.isArray(rawKeywords) || rawKeywords.some((keyword) => typeof keyword !== 'string')) {
    return invalid('invalid-weapon-keyword-input', 'Les mots-clés d’arme doivent former une liste de libellés texte.');
  }

  const normalizedKeywords: WeaponKeywordV1[] = [];
  const seenKinds = new Set<WeaponKeywordV1['kind']>();
  for (const [inputIndex, rawKeyword] of rawKeywords.entries()) {
    const label = normalizeCatalogLabel(rawKeyword);
    const staticKeyword = STATIC_KEYWORDS[label];
    let keyword: WeaponKeywordV1 | undefined = staticKeyword;

    if (keyword === undefined && (label === 'MELTA' || label.startsWith('MELTA '))) {
      const match = /^MELTA ([1-9]\d*)$/u.exec(label);
      const value = match === null ? Number.NaN : Number(match[1]);
      if (!Number.isSafeInteger(value) || value <= 0) {
        return invalid('invalid-melta-value', 'MELTA exige une valeur entière strictement positive, sans texte additionnel.', inputIndex);
      }
      keyword = { kind: 'melta', value, source: CORE_MELTA_SOURCE };
    }

    if (keyword === undefined && label.startsWith('ANTI-')) {
      const match = /^ANTI-(.+?) ([2-6])\+$/u.exec(label);
      const targetKeyword = match === null ? null : normalizedTargetKeyword(match[1]);
      const criticalWound = match === null ? Number.NaN : Number(match[2]);
      if (targetKeyword === null || !Number.isSafeInteger(criticalWound)) {
        return invalid('invalid-anti-value', 'ANTI exige un mot-clé cible et un seuil entier de 2+ à 6+.', inputIndex);
      }
      keyword = { kind: 'anti', targetKeyword, criticalWound: criticalWound as 2 | 3 | 4 | 5 | 6, source: CORE_ANTI_SOURCE };
    }

    if (keyword === undefined && (label.startsWith('SUSTAINED HITS') || label.startsWith('TOUCHES SOUTENUES'))) {
      const match = /^(?:SUSTAINED HITS|TOUCHES SOUTENUES) ([1-9]\d*)$/u.exec(label);
      const value = match === null ? Number.NaN : Number(match[1]);
      if (!Number.isSafeInteger(value) || value <= 0) {
        return invalid('invalid-sustained-hits-value', 'TOUCHES SOUTENUES exige une valeur entière strictement positive.', inputIndex);
      }
      keyword = { kind: 'sustained-hits', value, source: CORE_SUSTAINED_HITS_SOURCE };
    }

    if (keyword === undefined) {
      return invalid('unsupported-weapon-keyword', `Le mot-clé d’arme « ${label || rawKeyword} » n’est pas couvert.`, inputIndex);
    }
    if (seenKinds.has(keyword.kind)) {
      return invalid('duplicate-weapon-keyword', `Le mot-clé d’arme « ${keyword.kind} » est présent plusieurs fois.`, inputIndex);
    }
    seenKinds.add(keyword.kind);
    normalizedKeywords.push(keyword);
  }

  return {
    accepted: true,
    keywords: normalizedKeywords.sort((left, right) => canonicalOrder(left) - canonicalOrder(right))
  };
}
