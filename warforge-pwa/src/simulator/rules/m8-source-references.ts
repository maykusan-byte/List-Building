import type { SourceReferenceV1 } from '../domain/types';

const CORE_RULES = {
  sourceId: 'warforge-core-rules-fr-2026-07',
  version: 'archive-2026-07-28',
  effectiveFrom: '2026-07-28',
  dateBasis: 'retrieved',
  retrievedAt: '2026-07-28'
} as const;

const OFFICIAL_APP = {
  sourceId: 'warforge-official-app-supplemental-rules-fr-2026-08',
  version: 'owner-transcription-2026-08-28',
  effectiveFrom: '2026-08-28',
  dateBasis: 'retrieved',
  retrievedAt: '2026-08-28'
} as const;

const UNIVERSAL_RULES_UPDATE = {
  sourceId: 'warforge-universal-rules-updates-en-2026-07',
  version: '1.0',
  effectiveFrom: '2026-07-22',
  dateBasis: 'effective'
} as const;

export const CORE_COMMAND_ROLL_SOURCE: SourceReferenceV1 = {
  ...CORE_RULES, reference: '01.06', page: 9
};

export const CORE_BATTLE_SHOCK_SOURCE: SourceReferenceV1 = {
  ...CORE_RULES, reference: '01.07', page: 9
};

export const CORE_COMMAND_PHASE_START_SOURCE: SourceReferenceV1 = {
  ...CORE_RULES, reference: '08.01', page: 30
};

export const CORE_BASE_COMMAND_POINTS_SOURCE: SourceReferenceV1 = {
  ...CORE_RULES, reference: '08.02', page: 30
};

export const CORE_COMMAND_PHASE_BATTLE_SHOCK_SOURCE: SourceReferenceV1 = {
  ...CORE_RULES, reference: '08.03', page: 30
};

export const CORE_COMMAND_ABILITIES_SOURCE: SourceReferenceV1 = {
  ...CORE_RULES, reference: '08.04', page: 30
};

export const CORE_COMMAND_PHASE_END_SOURCE: SourceReferenceV1 = {
  ...CORE_RULES, reference: '08.05', page: 30
};

export const CORE_DESPERATE_ESCAPE_SOURCE: SourceReferenceV1 = {
  ...CORE_RULES, reference: '09.07', page: 33
};

export const CORE_TERRAIN_OBJECTIVE_SOURCE: SourceReferenceV1 = {
  ...CORE_RULES, reference: '14.01', page: 52
};

export const CORE_OBJECTIVE_CONTROL_SOURCE: SourceReferenceV1 = {
  ...CORE_RULES, reference: '14.02', page: 52
};

export const CORE_USE_STRATAGEMS_SOURCE: SourceReferenceV1 = {
  ...CORE_RULES, reference: '15.01', page: 54
};

export const CORE_INSANE_BRAVERY_SOURCE: SourceReferenceV1 = {
  ...CORE_RULES, reference: '15.04', page: 56
};

export const CORE_COUNTER_OFFENSIVE_SOURCE: SourceReferenceV1 = {
  ...CORE_RULES, reference: '15.12', page: 57
};

export const UNIVERSAL_STRATAGEM_UPDATES_SOURCE: SourceReferenceV1 = {
  ...UNIVERSAL_RULES_UPDATE, reference: 'stratagem-updates', page: 1
};

export const OFFICIAL_APP_INITIAL_STRENGTH_SOURCE: SourceReferenceV1 = {
  ...OFFICIAL_APP, reference: '01.02.01'
};

export const OFFICIAL_APP_PERSISTING_EFFECTS_SOURCE: SourceReferenceV1 = {
  ...OFFICIAL_APP, reference: '01.02.02'
};

export const OFFICIAL_APP_BATTLE_SHOCK_STEP_SOURCE: SourceReferenceV1 = {
  ...OFFICIAL_APP, reference: '08.03'
};

export const OFFICIAL_APP_MULTIPLE_BATTLE_SHOCK_SOURCE: SourceReferenceV1 = {
  ...OFFICIAL_APP, reference: '08.03.01'
};

export const OFFICIAL_APP_TERRAIN_OBJECTIVE_SOURCE: SourceReferenceV1 = {
  ...OFFICIAL_APP, reference: '14.01'
};

export const OFFICIAL_APP_OBJECTIVE_MARKER_SOURCE: SourceReferenceV1 = {
  ...OFFICIAL_APP, reference: '14.01.01'
};

export const OFFICIAL_APP_USE_STRATAGEMS_SOURCE: SourceReferenceV1 = {
  ...OFFICIAL_APP, reference: '15.01'
};

export const OFFICIAL_APP_MODIFY_CP_COST_SOURCE: SourceReferenceV1 = {
  ...OFFICIAL_APP, reference: '15.01.01'
};
