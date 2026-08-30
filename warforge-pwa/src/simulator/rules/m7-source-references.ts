import type { SourceReferenceV1 } from '../domain/types';

const EVENT_COMPANION_SOURCE = {
  sourceId: 'warforge-event-companion-fr-2026-07',
  version: '1.1',
  effectiveFrom: '2026-07-22',
  page: 2
} as const;

/** Event Companion step 8: deploy one unit at a time, starting with the Defender. */
export const EVENT_COMPANION_DEPLOY_ARMIES_SOURCE: SourceReferenceV1 = {
  ...EVENT_COMPANION_SOURCE,
  reference: 'event-mission-sequence.8'
};

/** Event Companion step 10: the roll-off winner takes the first turn. */
export const EVENT_COMPANION_FIRST_TURN_SOURCE: SourceReferenceV1 = {
  ...EVENT_COMPANION_SOURCE,
  reference: 'event-mission-sequence.10'
};

/** Core rules 03.03: every deployed unit must be in Unit Coherency. */
export const CORE_UNIT_COHERENCY_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-core-rules-fr-2026-07',
  version: 'archive-2026-07-28',
  effectiveFrom: '2026-07-28',
  reference: '03.03',
  page: 14
};

export const CORE_BATTLE_ROUND_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-core-rules-fr-2026-07', version: 'archive-2026-07-28', effectiveFrom: '2026-07-28', reference: '07', page: 28
};

export const CORE_MOVEMENT_SEQUENCE_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-core-rules-fr-2026-07', version: 'archive-2026-07-28', effectiveFrom: '2026-07-28', reference: '09.02', page: 32
};

export const CORE_REMAIN_STATIONARY_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-core-rules-fr-2026-07', version: 'archive-2026-07-28', effectiveFrom: '2026-07-28', reference: '09.04', page: 33
};

export const CORE_NORMAL_MOVE_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-core-rules-fr-2026-07', version: 'archive-2026-07-28', effectiveFrom: '2026-07-28', reference: '09.05', page: 33
};

export const CORE_ADVANCE_MOVE_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-core-rules-fr-2026-07', version: 'archive-2026-07-28', effectiveFrom: '2026-07-28', reference: '09.06', page: 33
};

export const CORE_FALL_BACK_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-core-rules-fr-2026-07', version: 'archive-2026-07-28', effectiveFrom: '2026-07-28', reference: '09.07', page: 33
};

export const CORE_CHARGE_SEQUENCE_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-core-rules-fr-2026-07', version: 'archive-2026-07-28', effectiveFrom: '2026-07-28', reference: '11.02', page: 36
};

export const CORE_CHARGE_MOVE_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-core-rules-fr-2026-07', version: 'archive-2026-07-28', effectiveFrom: '2026-07-28', reference: '11.04', page: 37
};

export const CORE_PILE_IN_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-core-rules-fr-2026-07', version: 'archive-2026-07-28', effectiveFrom: '2026-07-28', reference: '12.03', page: 38
};

export const CORE_PILE_IN_SEQUENCE_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-core-rules-fr-2026-07',
  version: 'archive-2026-07-28',
  effectiveFrom: '2026-07-28',
  reference: '12.02',
  page: 38
};

export const CORE_FIGHT_SEQUENCE_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-core-rules-fr-2026-07', version: 'archive-2026-07-28', effectiveFrom: '2026-07-28', reference: '12.04', page: 40
};

export const CORE_NORMAL_FIGHT_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-core-rules-fr-2026-07', version: 'archive-2026-07-28', effectiveFrom: '2026-07-28', reference: '12.05', page: 40
};

export const CORE_CONSOLIDATION_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-core-rules-fr-2026-07', version: 'archive-2026-07-28', effectiveFrom: '2026-07-28', reference: '12.08', page: 42
};

export const CORE_CONSOLIDATION_SEQUENCE_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-core-rules-fr-2026-07',
  version: 'archive-2026-07-28',
  effectiveFrom: '2026-07-28',
  reference: '12.07',
  page: 42
};

export const CORE_MELEE_ATTACK_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-core-rules-fr-2026-07', version: 'archive-2026-07-28', effectiveFrom: '2026-07-28', reference: '04', page: 16
};

export const OFFICIAL_APP_SELECT_UNIT_WITHOUT_WEAPONS_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-official-app-faq-fr-2026-07',
  version: 'app-snapshot-2026-08-24',
  effectiveFrom: '2026-07-22',
  reference: 'faq.select-unit-without-weapons'
};

export const CORE_MORTAL_WOUNDS_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-core-rules-fr-2026-07', version: 'archive-2026-07-28', effectiveFrom: '2026-07-28', reference: '06.02', page: 24
};

export const CORE_HAZARD_ROLL_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-core-rules-fr-2026-07', version: 'archive-2026-07-28', effectiveFrom: '2026-07-28', reference: '06.03', page: 24
};

export const EVENT_COMPANION_FIVE_ROUNDS_SOURCE: SourceReferenceV1 = {
  ...EVENT_COMPANION_SOURCE,
  reference: 'event-mission-sequence.13'
};
