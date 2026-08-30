import type { SourceReferenceV1 } from '../domain/types';

const OFFICIAL_APP_SOURCE_ID = 'warforge-official-app-references-fr-2026-07';
const OFFICIAL_APP_SOURCE_VERSION = 'app-snapshot-2026-08-24';
/**
 * The official application only exposes a visible "last updated" date, not a
 * rules effective date.  This is therefore the date at which this immutable
 * reference snapshot entered the local canonical corpus; it must never be
 * read as an inferred effective date for the underlying rule.
 */
const OFFICIAL_APP_SNAPSHOT_CAPTURED_AT = '2026-08-24';

/** Core rule 01.05, printed page 9: D3 is one D6, halved and rounded up. */
export const CORE_DICE_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-core-rules-fr-2026-07',
  version: 'archive-2026-07-28',
  effectiveFrom: '2026-07-28',
  reference: '01.05',
  page: 9
};

/** Official-app reference 02.02.01, captured in the local canonical corpus. */
export const OFFICIAL_APP_MODIFIERS_SOURCE: SourceReferenceV1 = {
  sourceId: OFFICIAL_APP_SOURCE_ID,
  version: OFFICIAL_APP_SOURCE_VERSION,
  effectiveFrom: OFFICIAL_APP_SNAPSHOT_CAPTURED_AT,
  reference: '02.02.01'
};

/** Official-app reference 02.02.03, captured in the local canonical corpus. */
export const OFFICIAL_APP_RANDOM_CHARACTERISTICS_SOURCE: SourceReferenceV1 = {
  sourceId: OFFICIAL_APP_SOURCE_ID,
  version: OFFICIAL_APP_SOURCE_VERSION,
  effectiveFrom: OFFICIAL_APP_SNAPSHOT_CAPTURED_AT,
  reference: '02.02.03'
};

/** Official-app reference 01.05.02, captured in the local canonical corpus. */
export const OFFICIAL_APP_REROLLS_SOURCE: SourceReferenceV1 = {
  sourceId: OFFICIAL_APP_SOURCE_ID,
  version: OFFICIAL_APP_SOURCE_VERSION,
  effectiveFrom: OFFICIAL_APP_SNAPSHOT_CAPTURED_AT,
  reference: '01.05.02'
};

/** Official-app reference 04.03.03: a target can cease to be eligible while attacks are resolved. */
export const OFFICIAL_APP_TARGET_NO_LONGER_ELIGIBLE_SOURCE: SourceReferenceV1 = {
  sourceId: OFFICIAL_APP_SOURCE_ID,
  version: OFFICIAL_APP_SOURCE_VERSION,
  effectiveFrom: OFFICIAL_APP_SNAPSHOT_CAPTURED_AT,
  reference: '04.03.03'
};

/** Engagement, rule 03.04 on printed page 14. */
export const CORE_ENGAGEMENT_RANGE_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-core-rules-fr-2026-07',
  version: 'archive-2026-07-28',
  effectiveFrom: '2026-07-28',
  reference: '03.04',
  page: 14
};

/** Normal shooting, rule 10.04 on printed page 34. */
export const CORE_NORMAL_SHOOTING_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-core-rules-fr-2026-07',
  version: 'archive-2026-07-28',
  effectiveFrom: '2026-07-28',
  reference: '10.04',
  page: 34
};

/** Repeated abilities, rule 24.02 on printed page 78. */
export const CORE_DUPLICATE_ABILITY_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-core-rules-fr-2026-07',
  version: 'archive-2026-07-28',
  effectiveFrom: '2026-07-28',
  reference: '24.02',
  page: 78
};

/** Core rule 05.01, printed page 18: unmodified 1 fails, unmodified 6 is a critical hit. */
export const CORE_CRITICAL_HIT_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-core-rules-fr-2026-07',
  version: 'archive-2026-07-28',
  effectiveFrom: '2026-07-28',
  reference: '05.01',
  page: 18
};

/** Core rule 05.02, printed page 18: unmodified 1 fails, unmodified 6 is a critical wound. */
export const CORE_CRITICAL_WOUND_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-core-rules-fr-2026-07',
  version: 'archive-2026-07-28',
  effectiveFrom: '2026-07-28',
  reference: '05.02',
  page: 18
};

/** [ANTI-X Y+], rule 24.03 on printed page 79. */
export const CORE_ANTI_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-core-rules-fr-2026-07',
  version: 'archive-2026-07-28',
  effectiveFrom: '2026-07-28',
  reference: '24.03',
  page: 79
};

/** [LETHAL HITS], rule 24.23 on printed page 85. */
export const CORE_LETHAL_HITS_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-core-rules-fr-2026-07',
  version: 'archive-2026-07-28',
  effectiveFrom: '2026-07-28',
  reference: '24.23',
  page: 85
};

/** [SUSTAINED HITS X], rule 24.36 on printed page 85. */
export const CORE_SUSTAINED_HITS_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-core-rules-fr-2026-07',
  version: 'archive-2026-07-28',
  effectiveFrom: '2026-07-28',
  reference: '24.36',
  page: 85
};

/** [JUMELÉ], rule 24.38 on printed page 83. */
export const CORE_TWIN_LINKED_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-core-rules-fr-2026-07',
  version: 'archive-2026-07-28',
  effectiveFrom: '2026-07-28',
  reference: '24.38',
  page: 83
};

/** Characteristic tests and saving throws, rule 02.02 on printed page 10. */
export const CORE_CHARACTERISTIC_TESTS_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-core-rules-fr-2026-07', version: 'archive-2026-07-28', effectiveFrom: '2026-07-28', reference: '02.02', page: 10
};

/** Mortal wounds, rule 06.02 on printed page 24. */
export const CORE_MORTAL_WOUNDS_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-core-rules-fr-2026-07', version: 'archive-2026-07-28', effectiveFrom: '2026-07-28', reference: '06.02', page: 24
};

/** Feel No Pain, rule 24.12 on printed page 83. */
export const CORE_FEEL_NO_PAIN_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-core-rules-fr-2026-07', version: 'archive-2026-07-28', effectiveFrom: '2026-07-28', reference: '24.12', page: 83
};

/** [HAZARDOUS], rule 24.15 on printed page 79. */
export const CORE_HAZARDOUS_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-core-rules-fr-2026-07', version: 'archive-2026-07-28', effectiveFrom: '2026-07-28', reference: '24.15', page: 79
};

/** [DEVASTATING WOUNDS], rule 24.10 on printed page 80. */
export const CORE_DEVASTATING_WOUNDS_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-core-rules-fr-2026-07', version: 'archive-2026-07-28', effectiveFrom: '2026-07-28', reference: '24.10', page: 80
};

/** [MELTA X], rule 24.25 on printed page 82. */
export const CORE_MELTA_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-core-rules-fr-2026-07', version: 'archive-2026-07-28', effectiveFrom: '2026-07-28', reference: '24.25', page: 82
};

/** [ONE SHOT], rule 24.26 on printed page 85. */
export const CORE_ONE_SHOT_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-core-rules-fr-2026-07', version: 'archive-2026-07-28', effectiveFrom: '2026-07-28', reference: '24.26', page: 85
};

/**
 * Source references are part of the executable input.  Compare every field
 * so a catalog value cannot silently substitute a different edition or page.
 */
export function isExactSourceReference(actual: SourceReferenceV1, expected: SourceReferenceV1): boolean {
  return actual.sourceId === expected.sourceId
    && actual.version === expected.version
    && actual.effectiveFrom === expected.effectiveFrom
    && actual.reference === expected.reference
    && actual.page === expected.page;
}
