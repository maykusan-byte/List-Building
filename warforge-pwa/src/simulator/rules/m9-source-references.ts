import type { SourceReferenceV1 } from '../domain/types';

const APPROVED_GDM_ARCHIVE = {
  sourceId: 'approved-gdm-2026-11th-archive',
  version: 'archive-2026-08-08',
  effectiveFrom: '2026-08-08',
  dateBasis: 'retrieved',
  retrievedAt: '2026-08-08'
} as const;

const EVENT_COMPANION = {
  sourceId: 'warforge-event-companion-fr-2026-07',
  version: '1.1',
  effectiveFrom: '2026-07-22',
  dateBasis: 'effective'
} as const;

export const GDM_OUTMANOEUVRE_SOURCE: SourceReferenceV1 = {
  ...APPROVED_GDM_ARCHIVE,
  reference: '/11th/primary-missions/disruption/outmanoeuvre'
};

export const GDM_ASSASSINATION_FIXED_SOURCE: SourceReferenceV1 = {
  ...APPROVED_GDM_ARCHIVE,
  reference: '/11th/secondary-missions/assassination-defender#fixed'
};

export const GDM_ENGAGE_FIXED_SOURCE: SourceReferenceV1 = {
  ...APPROVED_GDM_ARCHIVE,
  reference: '/11th/secondary-missions/engage-on-all-fronts-defender#fixed'
};

export const EVENT_COMPANION_SCORING_LIMITS_SOURCE: SourceReferenceV1 = {
  ...EVENT_COMPANION,
  reference: 'event-mission-sequence.14',
  page: 2
};

export const EVENT_COMPANION_BATTLE_READY_SOURCE: SourceReferenceV1 = {
  ...EVENT_COMPANION,
  reference: 'event-mission-sequence.14',
  page: 2
};

export const EVENT_COMPANION_GAME_END_SOURCE: SourceReferenceV1 = {
  ...EVENT_COMPANION,
  reference: 'event-mission-sequence.13',
  page: 2
};

export const EVENT_COMPANION_CUMULATIVE_OR_SOURCE: SourceReferenceV1 = {
  ...EVENT_COMPANION,
  reference: 'card-terminology.cumulative-or',
  page: 3
};
