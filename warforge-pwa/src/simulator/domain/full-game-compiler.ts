/**
 * M6's compiler is deliberately a report compiler, not a game-session
 * compiler. It can preserve the candidate identities and enumerate every
 * blocker, but it cannot materialize a CompleteGameSessionSetupV1.
 */

export const COMPATIBILITY_REPORT_V2_SCHEMA_VERSION = 'warforge-compatibility-report/v2' as const;

export type FullGameCoverageNodeStatus = 'covered' | 'partial' | 'source-available' | 'human-review-required' | 'missing-source' | 'planned' | 'deferred';
export type FullGameGapStatus = 'open-human-review' | 'open-source-request' | 'resolved';

export interface FullGameRosterUnitCandidateV1 {
  readonly instanceId: string;
  readonly unitId: string;
  readonly modelCount: number;
  readonly points: number;
  readonly origin: string;
}

export interface FullGameRosterCandidateV1 {
  readonly id: string;
  readonly side: string;
  readonly status: 'human-review-required' | 'covered';
  readonly expectedPoints: number;
  readonly units: readonly FullGameRosterUnitCandidateV1[];
  readonly attachmentPolicy: 'all-characters-unattached';
  readonly blockingGapIds: readonly string[];
}

export interface FullGameCoverageSourceRefV1 {
  readonly sourceId: string;
  readonly references: readonly string[];
  readonly printedPages?: readonly number[];
}

export interface FullGameMissionCandidateV1 {
  readonly id: string;
  readonly status: 'missing-source' | 'covered';
  readonly primaryMission: string;
  readonly deploymentLayout: string;
  readonly missionRuleBySide: Readonly<Record<string, string>>;
  readonly fixedSecondaryIds: readonly string[];
  readonly blockingGapIds: readonly string[];
  readonly authorityNote: string;
}

export interface FullGameCoverageNodeV1 {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly status: FullGameCoverageNodeStatus;
  readonly ownerMilestones: readonly string[];
  readonly sourceRefs: readonly FullGameCoverageSourceRefV1[];
  readonly dependsOn: readonly string[];
  readonly blockingGapIds: readonly string[];
  readonly note: string;
}

export interface FullGameCoverageGapV1 {
  readonly id: string;
  readonly category: string;
  readonly status: FullGameGapStatus;
  readonly title: string;
  readonly blocksNodeIds: readonly string[];
  readonly requiredAction: string;
  readonly manualOwnerAction: string;
}

/** Versioned, locally validated full-game coverage graph input. */
export interface FullGameCoverageGraphV1 {
  readonly schemaVersion: 'warforge-simulator-full-game-coverage/v1';
  readonly version: string;
  readonly manifestVersion: string;
  readonly scope: string;
  readonly status: 'draft-blocked' | 'covered';
  readonly activationPolicy: string;
  readonly canonicalSourceIds: readonly string[];
  readonly rosterCandidates: readonly FullGameRosterCandidateV1[];
  readonly missionCandidate: FullGameMissionCandidateV1;
  readonly nodes: readonly FullGameCoverageNodeV1[];
  readonly gaps: readonly FullGameCoverageGapV1[];
  readonly arbitrationIds: readonly string[];
  readonly readiness: {
    readonly compatible: boolean;
    readonly blockingNodeIds: readonly string[];
    readonly nextOwnerActions: readonly string[];
  };
}

/**
 * Identity-only facts.  They intentionally contain no inferred profiles,
 * loadouts, abilities, physical dimensions, or computed points.
 */
export interface ClosedPilotCandidateFactsV1 {
  readonly rosterCandidates: readonly FullGameRosterCandidateV1[];
  readonly missionCandidate: FullGameMissionCandidateV1;
  /** Explicit roster-adapter fact; never inferred from an instance name. */
  readonly characterInstanceIds: readonly string[];
}

export interface FullGameCompatibilityEnvironmentV1 {
  readonly manifestVersion: string;
  readonly registeredSourceIds: readonly string[];
}

export interface FullGameCompatibilityCompilationInputV1 {
  readonly graph: FullGameCoverageGraphV1;
  readonly facts: ClosedPilotCandidateFactsV1;
  readonly environment: FullGameCompatibilityEnvironmentV1;
  /** Canonical manifest/unit/model proof produced by the executable roster compiler. */
  readonly executableSessionFingerprint?: string;
}

export interface CompatibilityRequirementV2 {
  readonly nodeId: string;
  readonly kind: string;
  readonly title: string;
  readonly status: FullGameCoverageNodeStatus;
  readonly satisfied: boolean;
  readonly sourceIds: readonly string[];
  readonly sourceRefs: readonly FullGameCoverageSourceRefV1[];
  readonly dependsOn: readonly string[];
  readonly blockingGapIds: readonly string[];
}

export interface CompatibilityBlockingGapV2 {
  readonly gapId: string;
  readonly category: string;
  readonly title: string;
  readonly blocksNodeIds: readonly string[];
  readonly requiredAction: string;
}

export interface CompatibilityHumanDecisionV2 {
  readonly subjectType: 'roster-candidate' | 'gap';
  readonly subjectId: string;
  readonly reason: string;
  readonly ownerAction: string;
}

export interface CompatibilityMissingSourceV2 {
  readonly subjectType: 'mission-candidate' | 'gap';
  readonly subjectId: string;
  readonly reason: string;
  readonly requiredAction: string;
}

export interface CompatibilityIssueV2 {
  readonly code: 'uncovered-requirement' | 'blocking-gap' | 'human-decision-required' | 'missing-source' | 'candidate-identity-mismatch' | 'invalid-coverage-graph' | 'coverage-graph-not-covered';
  readonly subjectId: string;
  readonly message: string;
}

export interface CompiledRosterCandidateV2 {
  readonly id: string;
  readonly side: string;
  readonly status: 'human-review-required' | 'covered';
  readonly expectedPoints: number;
  readonly attachmentPolicy: 'all-characters-unattached';
  readonly characterInstanceIds: readonly string[];
  readonly blockingGapIds: readonly string[];
  readonly units: readonly FullGameRosterUnitCandidateV1[];
  readonly executable: false;
}

export interface CompiledMissionCandidateV2 {
  readonly id: string;
  readonly status: 'missing-source' | 'covered';
  readonly primaryMission: string;
  readonly deploymentLayout: string;
  readonly missionRuleBySide: Readonly<Record<string, string>>;
  readonly fixedSecondaryIds: readonly string[];
  readonly blockingGapIds: readonly string[];
  readonly authorityNote: string;
  readonly executable: false;
}

/** Exhaustive, serializable compatibility result for the closed M6 pilot. */
export interface CompatibilityReportV2 {
  readonly schemaVersion: typeof COMPATIBILITY_REPORT_V2_SCHEMA_VERSION;
  readonly reportVersion: '2.0.0';
  readonly coverageScope: string;
  readonly coverageVersion: string;
  readonly coverageStatus: 'draft-blocked' | 'covered';
  readonly manifestVersion: string;
  readonly canonicalSourceIds: readonly string[];
  readonly arbitrationIds: readonly string[];
  readonly gapStatuses: readonly { readonly gapId: string; readonly status: FullGameGapStatus }[];
  readonly gapInventory: readonly FullGameCoverageGapV1[];
  /** Null while the graph is diagnostic; mandatory before `compatible: true`. */
  readonly executableSessionFingerprint: string | null;
  readonly canonicalFingerprint: string;
  readonly compatible: boolean;
  readonly rosterCandidates: readonly CompiledRosterCandidateV2[];
  readonly missionCandidate: CompiledMissionCandidateV2;
  readonly satisfiedRequirements: readonly CompatibilityRequirementV2[];
  readonly unmetRequirements: readonly CompatibilityRequirementV2[];
  readonly nonReachableRequirements: readonly CompatibilityRequirementV2[];
  readonly blockingGaps: readonly CompatibilityBlockingGapV2[];
  readonly humanDecisions: readonly CompatibilityHumanDecisionV2[];
  readonly missingSources: readonly CompatibilityMissingSourceV2[];
  readonly issues: readonly CompatibilityIssueV2[];
}

/** This task never creates an executable setup, even for a future graph. */
export interface CompleteGameSessionSetupRefusalV1 {
  readonly accepted: false;
  readonly code: 'complete-game-setup-not-produced-by-m6-compiler';
  readonly message: string;
  readonly reportFingerprint: string;
}

const CLOSED_PILOT_SCOPE = 'closed-complete-game-pilot-v1';
const CLOSED_PILOT_COVERAGE_VERSION = '0.8.0';
const CORE_POC_TECHNICAL_SCOPE = 'closed-complete-game-core-poc-v1';
const CORE_POC_TECHNICAL_COVERAGE_VERSION = '1.1.0';
const CORE_POC_TECHNICAL_SATISFIED_REQUIREMENT_IDS = [
  'poc.battle-sequence',
  'poc.command-and-resources',
  'poc.movement',
  'poc.shooting',
  'poc.charge',
  'poc.fight',
  'poc.objectives',
  'poc.mission-and-score',
  'poc.layout-and-terrain',
  'poc.fixture-runtime',
  'poc.persistence-and-replay',
  'poc.offline-ui'
] as const;
const CORE_POC_TECHNICAL_LIMITATION_IDS = [
  'core-stratagem.command-reroll',
  'core-stratagem.epic-challenge',
  'core-stratagem.overwatch',
  'core-stratagem.heroic-intervention'
] as const;
const CORE_POC_TECHNICAL_ROSTERS = [
  {
    id: 'core-poc-force-a-v1', side: 'poc-a', characterInstanceIds: ['core-poc-a-character-v1'],
    units: [
      { instanceId: 'core-poc-a-line-1-v1', unitId: 'core-poc-a-line-1-v1', modelCount: 5, points: 0, origin: 'core-poc-fixture' },
      { instanceId: 'core-poc-a-line-2-v1', unitId: 'core-poc-a-line-2-v1', modelCount: 5, points: 0, origin: 'core-poc-fixture' },
      { instanceId: 'core-poc-a-character-v1', unitId: 'core-poc-a-character-v1', modelCount: 1, points: 0, origin: 'core-poc-fixture' }
    ]
  },
  {
    id: 'core-poc-force-b-v1', side: 'poc-b', characterInstanceIds: ['core-poc-b-character-v1'],
    units: [
      { instanceId: 'core-poc-b-line-1-v1', unitId: 'core-poc-b-line-1-v1', modelCount: 5, points: 0, origin: 'core-poc-fixture' },
      { instanceId: 'core-poc-b-line-2-v1', unitId: 'core-poc-b-line-2-v1', modelCount: 5, points: 0, origin: 'core-poc-fixture' },
      { instanceId: 'core-poc-b-character-v1', unitId: 'core-poc-b-character-v1', modelCount: 1, points: 0, origin: 'core-poc-fixture' }
    ]
  }
] as const;
const CLOSED_PILOT_REQUIRED_REACHABLE_NODE_IDS = [
  'coverage.battle-round',
  'coverage.charge-phase',
  'coverage.command-phase',
  'coverage.complete-game',
  'coverage.core-foundations',
  'coverage.fight-phase',
  'coverage.mission',
  'coverage.movement-phase',
  'coverage.persistence-v6',
  'coverage.rosters',
  'coverage.shooting-phase',
  'coverage.stratagems',
  'coverage.terrain-objectives'
] as const;
const CLOSED_PILOT_REQUIRED_NODE_IDS = [...CLOSED_PILOT_REQUIRED_REACHABLE_NODE_IDS, 'coverage.out-of-scope-zones'] as const;
const CLOSED_PILOT_NODE_KINDS = new Map<string, string>([
  ['coverage.battle-round', 'phase-sequence'],
  ['coverage.charge-phase', 'phase'],
  ['coverage.command-phase', 'phase'],
  ['coverage.complete-game', 'scenario'],
  ['coverage.core-foundations', 'rule-set'],
  ['coverage.fight-phase', 'phase'],
  ['coverage.mission', 'mission'],
  ['coverage.movement-phase', 'phase'],
  ['coverage.out-of-scope-zones', 'explicit-exclusion'],
  ['coverage.persistence-v6', 'persistence'],
  ['coverage.rosters', 'roster'],
  ['coverage.shooting-phase', 'phase'],
  ['coverage.stratagems', 'decision-rules'],
  ['coverage.terrain-objectives', 'spatial-rules']
]);
const CLOSED_PILOT_REQUIRED_GAP_IDS = [
  'GAP-M6-DETACHMENT-001',
  'GAP-M6-MISSION-001',
  'GAP-M6-MISSION-002',
  'GAP-M6-MISSION-003',
  'GAP-M6-MISSION-004',
  'GAP-M6-MISSION-005',
  'GAP-M6-NONCORE-001',
  'GAP-M6-PHYSICAL-001',
  'GAP-M6-ROSTER-001',
  'GAP-M6-ROSTER-002'
] as const;
const CLOSED_PILOT_MISSION_GAP_IDS = [
  'GAP-M6-MISSION-001',
  'GAP-M6-MISSION-002',
  'GAP-M6-MISSION-003',
  'GAP-M6-MISSION-004',
  'GAP-M6-MISSION-005'
] as const;
const CLOSED_PILOT_ROSTERS = [
  {
    id: 'closed-complete-game-blood-angels-v1', side: 'blood-angels', expectedPoints: 240,
    draftBlockingGapIds: ['GAP-M6-PHYSICAL-001', 'GAP-M6-ROSTER-002'],
    units: [
      { instanceId: 'blood-angels-assault-intercessors-1', unitId: 'book-blood-angels:unit:33', modelCount: 5, points: 80, origin: 'm4-approved' },
      { instanceId: 'blood-angels-assault-intercessors-2', unitId: 'book-blood-angels:unit:33', modelCount: 5, points: 80, origin: 'plan-3-candidate' },
      { instanceId: 'blood-angels-captain-1', unitId: 'book-blood-angels:unit:12', modelCount: 1, points: 80, origin: 'm4-approved' }
    ]
  },
  {
    id: 'closed-complete-game-salamanders-v1', side: 'salamanders', expectedPoints: 235,
    draftBlockingGapIds: ['GAP-M6-PHYSICAL-001', 'GAP-M6-ROSTER-001'],
    units: [
      { instanceId: 'salamanders-assault-intercessors-1', unitId: 'book-space-marines:unit:18', modelCount: 5, points: 75, origin: 'm4-approved' },
      { instanceId: 'salamanders-bladeguard-1', unitId: 'book-space-marines:unit:28', modelCount: 3, points: 80, origin: 'm4-approved' },
      { instanceId: 'salamanders-captain-1', unitId: 'book-space-marines:unit:3', modelCount: 1, points: 80, origin: 'plan-3-candidate' }
    ]
  }
] as const;
const SOURCE_OPTIONAL_NODE_KINDS = new Set(['persistence', 'scenario', 'explicit-exclusion']);
const CLOSED_PILOT_CHARACTER_UNIT_IDS = new Set(['book-blood-angels:unit:12', 'book-space-marines:unit:3']);
const COVERAGE_NODE_STATUSES = new Set<FullGameCoverageNodeStatus>(['covered', 'partial', 'source-available', 'human-review-required', 'missing-source', 'planned', 'deferred']);
const COVERAGE_GAP_STATUSES = new Set<FullGameGapStatus>(['open-human-review', 'open-source-request', 'resolved']);

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareText);
}

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function addInvalidGraphIssue(issues: CompatibilityIssueV2[], subjectId: string, message: string): void {
  issues.push({ code: 'invalid-coverage-graph', subjectId, message });
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort(compareText).map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

function canonicalSourceRefs(sourceRefs: readonly FullGameCoverageSourceRefV1[]): FullGameCoverageSourceRefV1[] {
  return sourceRefs
    .map((sourceRef) => ({
      sourceId: sourceRef.sourceId,
      references: uniqueSorted(sourceRef.references),
      ...(sourceRef.printedPages === undefined ? {} : { printedPages: [...sourceRef.printedPages].sort((left, right) => left - right) })
    }))
    .sort((left, right) => compareText(canonicalJson(left), canonicalJson(right)));
}

function sameCanonicalValue(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

/** Canonical identity used when a report is embedded as the authority of a V6 setup. */
export function compatibilityReportFingerprintV2(report: Omit<CompatibilityReportV2, 'canonicalFingerprint'>): string {
  return canonicalJson(report);
}

function assertCorePocTechnicalCompatibilityReportV2(report: CompatibilityReportV2): void {
  if (report.coverageVersion !== CORE_POC_TECHNICAL_COVERAGE_VERSION
    || report.gapStatuses.length !== 0 || report.gapInventory.length !== 0) {
    throw new RangeError('Core POC technical compatibility identity is invalid.');
  }
  const satisfiedIds = report.satisfiedRequirements.map((requirement) => requirement.nodeId).sort(compareText);
  if (!sameCanonicalValue(satisfiedIds, [...CORE_POC_TECHNICAL_SATISFIED_REQUIREMENT_IDS].sort(compareText))
    || report.satisfiedRequirements.some((requirement) => !requirement.satisfied || requirement.status !== 'covered'
      || hasDuplicates(requirement.sourceIds)
      || !sameCanonicalValue(requirement.sourceIds, uniqueSorted(requirement.sourceRefs.map((sourceRef) => sourceRef.sourceId)))
      || requirement.sourceRefs.some((sourceRef) => !report.canonicalSourceIds.includes(sourceRef.sourceId)))) {
    throw new RangeError('Core POC technical satisfied requirements are incomplete.');
  }
  const limitationIds = report.nonReachableRequirements.map((requirement) => requirement.nodeId).sort(compareText);
  if (!sameCanonicalValue(limitationIds, [...CORE_POC_TECHNICAL_LIMITATION_IDS].sort(compareText))
    || report.nonReachableRequirements.some((requirement) => requirement.satisfied || requirement.status !== 'deferred'
      || hasDuplicates(requirement.sourceIds) || requirement.sourceRefs.length === 0
      || !sameCanonicalValue(requirement.sourceIds, uniqueSorted(requirement.sourceRefs.map((sourceRef) => sourceRef.sourceId)))
      || requirement.sourceRefs.some((sourceRef) => !report.canonicalSourceIds.includes(sourceRef.sourceId)
        || sourceRef.references.length === 0))) {
    throw new RangeError('Core POC technical limitations are incomplete.');
  }

  const orderedRosters = [...report.rosterCandidates].sort((left, right) => compareText(left.id, right.id));
  if (orderedRosters.length !== CORE_POC_TECHNICAL_ROSTERS.length) throw new RangeError('Core POC technical roster count is invalid.');
  for (const expected of CORE_POC_TECHNICAL_ROSTERS) {
    const roster = orderedRosters.find((candidate) => candidate.id === expected.id);
    if (!roster || roster.status !== 'covered' || roster.side !== expected.side || roster.expectedPoints !== 0
      || roster.attachmentPolicy !== 'all-characters-unattached' || roster.blockingGapIds.length !== 0
      || !sameCanonicalValue([...roster.units].sort((left, right) => compareText(left.instanceId, right.instanceId)), [...expected.units].sort((left, right) => compareText(left.instanceId, right.instanceId)))
      || !sameCanonicalValue([...roster.characterInstanceIds].sort(compareText), [...expected.characterInstanceIds].sort(compareText))) {
      throw new RangeError(`Core POC technical roster ${expected.id} is invalid.`);
    }
  }
  const mission = report.missionCandidate;
  if (mission.id !== 'closed-complete-game-disruption-v1' || mission.status !== 'covered'
    || mission.primaryMission !== 'Disruption' || mission.deploymentLayout !== 'mirror-layout-1'
    || mission.blockingGapIds.length !== 0
    || !sameCanonicalValue(mission.missionRuleBySide, { 'poc-a': 'Outmanoeuvre', 'poc-b': 'Outmanoeuvre' })
    || !sameCanonicalValue(mission.fixedSecondaryIds, ['Assassination', 'Engage on All Fronts'])) {
    throw new RangeError('Core POC technical mission is invalid.');
  }
}

/**
 * Validates the complete closed-pilot proof, not merely a caller-provided
 * `status: compatible` flag. This is a normal domain boundary and is replay-safe.
 */
export function assertCompatibleCompatibilityReportV2(report: CompatibilityReportV2): void {
  const { canonicalFingerprint, ...reportWithoutFingerprint } = report;
  if (report.schemaVersion !== COMPATIBILITY_REPORT_V2_SCHEMA_VERSION
    || report.reportVersion !== '2.0.0'
    || report.coverageStatus !== 'covered'
    || report.compatible !== true
    || typeof report.executableSessionFingerprint !== 'string'
    || !report.executableSessionFingerprint.trim()
    || canonicalFingerprint !== compatibilityReportFingerprintV2(reportWithoutFingerprint)) {
    throw new RangeError('Complete-game compatibility report identity is invalid.');
  }

  if (hasDuplicates(report.canonicalSourceIds) || report.canonicalSourceIds.length === 0
    || hasDuplicates(report.arbitrationIds)
    || report.unmetRequirements.length !== 0
    || report.blockingGaps.length !== 0
    || report.humanDecisions.length !== 0
    || report.missingSources.length !== 0
    || report.issues.length !== 0) {
    throw new RangeError('Complete-game compatibility report still contains blockers.');
  }

  if (report.coverageScope === CORE_POC_TECHNICAL_SCOPE) {
    assertCorePocTechnicalCompatibilityReportV2(report);
    return;
  }
  if (report.coverageScope !== CLOSED_PILOT_SCOPE || report.coverageVersion !== CLOSED_PILOT_COVERAGE_VERSION) {
    throw new RangeError('Complete-game compatibility report scope is invalid.');
  }

  const satisfiedIds = report.satisfiedRequirements.map((requirement) => requirement.nodeId).sort(compareText);
  if (!sameCanonicalValue(satisfiedIds, [...CLOSED_PILOT_REQUIRED_REACHABLE_NODE_IDS])
    || report.satisfiedRequirements.some((requirement) => !requirement.satisfied || requirement.status !== 'covered'
      || hasDuplicates(requirement.sourceIds)
      || !sameCanonicalValue(requirement.sourceIds, uniqueSorted(requirement.sourceRefs.map((sourceRef) => sourceRef.sourceId)))
      || requirement.sourceRefs.some((sourceRef) => !report.canonicalSourceIds.includes(sourceRef.sourceId)))) {
    throw new RangeError('Complete-game compatibility requirements are incomplete.');
  }
  if (report.nonReachableRequirements.length !== 1
    || report.nonReachableRequirements[0].nodeId !== 'coverage.out-of-scope-zones'
    || report.nonReachableRequirements[0].status !== 'deferred') {
    throw new RangeError('Complete-game non-reachable scope is invalid.');
  }

  const gapStatusIds = report.gapStatuses.map((gap) => gap.gapId).sort(compareText);
  const gapInventoryIds = report.gapInventory.map((gap) => gap.id).sort(compareText);
  if (!sameCanonicalValue(gapStatusIds, [...CLOSED_PILOT_REQUIRED_GAP_IDS])
    || !sameCanonicalValue(gapInventoryIds, [...CLOSED_PILOT_REQUIRED_GAP_IDS])
    || report.gapStatuses.some((gap) => gap.status !== 'resolved')
    || report.gapInventory.some((gap) => gap.status !== 'resolved')) {
    throw new RangeError('Complete-game gap inventory is not fully resolved.');
  }

  const orderedRosters = [...report.rosterCandidates].sort((left, right) => compareText(left.id, right.id));
  if (orderedRosters.length !== CLOSED_PILOT_ROSTERS.length) throw new RangeError('Complete-game roster count is invalid.');
  for (const expected of CLOSED_PILOT_ROSTERS) {
    const roster = orderedRosters.find((candidate) => candidate.id === expected.id);
    const expectedCharacterIds = expected.units
      .filter((unit) => CLOSED_PILOT_CHARACTER_UNIT_IDS.has(unit.unitId))
      .map((unit) => unit.instanceId)
      .sort(compareText);
    if (!roster
      || roster.status !== 'covered'
      || roster.side !== expected.side
      || roster.expectedPoints !== expected.expectedPoints
      || roster.attachmentPolicy !== 'all-characters-unattached'
      || roster.blockingGapIds.length !== 0
      || !sameCanonicalValue(roster.units, expected.units)
      || !sameCanonicalValue(roster.characterInstanceIds, expectedCharacterIds)) {
      throw new RangeError(`Complete-game roster ${expected.id} is not the compiled closed candidate.`);
    }
  }

  const mission = report.missionCandidate;
  if (mission.id !== 'closed-complete-game-disruption-v1'
    || mission.status !== 'covered'
    || mission.primaryMission !== 'Disruption'
    || mission.deploymentLayout !== 'mirror-layout-1'
    || mission.blockingGapIds.length !== 0
    || !sameCanonicalValue(mission.missionRuleBySide, { 'blood-angels': 'Outmanoeuvre', salamanders: 'Outmanoeuvre' })
    || !sameCanonicalValue(mission.fixedSecondaryIds, ['Assassination', 'Engage on All Fronts'])) {
    throw new RangeError('Complete-game mission is not the compiled closed candidate.');
  }
}

function compileRoster(candidate: FullGameRosterCandidateV1, characterInstanceIds: ReadonlySet<string>): CompiledRosterCandidateV2 {
  return {
    id: candidate.id,
    side: candidate.side,
    status: candidate.status,
    expectedPoints: candidate.expectedPoints,
    attachmentPolicy: candidate.attachmentPolicy,
    characterInstanceIds: candidate.units.map((unit) => unit.instanceId).filter((instanceId) => characterInstanceIds.has(instanceId)).sort(compareText),
    blockingGapIds: uniqueSorted(candidate.blockingGapIds),
    units: [...candidate.units].sort((left, right) => compareText(left.instanceId, right.instanceId)),
    executable: false
  };
}

function compileMission(candidate: FullGameMissionCandidateV1): CompiledMissionCandidateV2 {
  return {
    id: candidate.id,
    status: candidate.status,
    primaryMission: candidate.primaryMission,
    deploymentLayout: candidate.deploymentLayout,
    missionRuleBySide: Object.fromEntries(Object.entries(candidate.missionRuleBySide).sort(([left], [right]) => compareText(left, right))),
    fixedSecondaryIds: uniqueSorted(candidate.fixedSecondaryIds),
    blockingGapIds: uniqueSorted(candidate.blockingGapIds),
    authorityNote: candidate.authorityNote,
    executable: false
  };
}

function compileRequirement(node: FullGameCoverageNodeV1): CompatibilityRequirementV2 {
  return {
    nodeId: node.id,
    kind: node.kind,
    title: node.title,
    status: node.status,
    satisfied: node.status === 'covered',
    sourceIds: uniqueSorted(node.sourceRefs.map((sourceRef) => sourceRef.sourceId)),
    sourceRefs: canonicalSourceRefs(node.sourceRefs),
    dependsOn: uniqueSorted(node.dependsOn),
    blockingGapIds: uniqueSorted(node.blockingGapIds)
  };
}

function validateClosedPilotGraph(
  graph: FullGameCoverageGraphV1,
  environment: FullGameCompatibilityEnvironmentV1,
  issues: CompatibilityIssueV2[]
): void {
  if (graph.schemaVersion !== 'warforge-simulator-full-game-coverage/v1') {
    addInvalidGraphIssue(issues, 'schemaVersion', `Schéma de couverture incompatible : ${String(graph.schemaVersion)}.`);
  }
  if (graph.scope !== CLOSED_PILOT_SCOPE) {
    addInvalidGraphIssue(issues, 'scope', `Le compilateur fermé exige le périmètre ${CLOSED_PILOT_SCOPE}.`);
  }
  if (graph.version !== CLOSED_PILOT_COVERAGE_VERSION) {
    addInvalidGraphIssue(issues, 'version', `Le compilateur fermé exige le graphe ${CLOSED_PILOT_COVERAGE_VERSION}.`);
  }
  if (graph.manifestVersion !== environment.manifestVersion) {
    addInvalidGraphIssue(issues, 'manifestVersion', 'La version de manifeste du graphe ne correspond pas à l’environnement compilé.');
  }
  if (graph.status !== 'covered') {
    issues.push({
      code: 'coverage-graph-not-covered',
      subjectId: graph.scope,
      message: `Le graphe global reste ${graph.status} et ne peut pas produire une compatibilité exécutable.`
    });
  }

  const registeredSourceIds = uniqueSorted(environment.registeredSourceIds);
  if (hasDuplicates(environment.registeredSourceIds)) {
    addInvalidGraphIssue(issues, 'environment.registeredSourceIds', 'Le registre de sources contient des identifiants dupliqués.');
  }
  if (hasDuplicates(graph.canonicalSourceIds)) {
    addInvalidGraphIssue(issues, 'canonicalSourceIds', 'La liste des sources canoniques contient des doublons.');
  }
  for (const sourceId of graph.canonicalSourceIds) {
    if (!registeredSourceIds.includes(sourceId)) addInvalidGraphIssue(issues, sourceId, `La source canonique ${sourceId} est absente du manifeste compilé.`);
  }

  const nodeIds = graph.nodes.map((node) => node.id);
  const gapIds = graph.gaps.map((gap) => gap.id);
  if (hasDuplicates(nodeIds)) addInvalidGraphIssue(issues, 'nodes', 'Le graphe de couverture contient des identifiants de nœud dupliqués.');
  if (hasDuplicates(gapIds)) addInvalidGraphIssue(issues, 'gaps', 'Le graphe de couverture contient des identifiants de gap dupliqués.');
  const unexpectedNodeIds = uniqueSorted(nodeIds.filter((nodeId) => !CLOSED_PILOT_REQUIRED_NODE_IDS.includes(nodeId as typeof CLOSED_PILOT_REQUIRED_NODE_IDS[number])));
  const unexpectedGapIds = uniqueSorted(gapIds.filter((gapId) => !CLOSED_PILOT_REQUIRED_GAP_IDS.includes(gapId as typeof CLOSED_PILOT_REQUIRED_GAP_IDS[number])));
  if (unexpectedNodeIds.length > 0) addInvalidGraphIssue(issues, 'nodes', `Le graphe ${CLOSED_PILOT_COVERAGE_VERSION} contient des nœuds non versionnés : ${unexpectedNodeIds.join(', ')}.`);
  if (unexpectedGapIds.length > 0) addInvalidGraphIssue(issues, 'gaps', `Le graphe ${CLOSED_PILOT_COVERAGE_VERSION} contient des gaps non versionnés : ${unexpectedGapIds.join(', ')}.`);
  for (const nodeId of CLOSED_PILOT_REQUIRED_NODE_IDS) {
    if (!nodeIds.includes(nodeId)) addInvalidGraphIssue(issues, nodeId, `Le nœud obligatoire ${nodeId} est absent du pilote fermé.`);
  }
  for (const gapId of CLOSED_PILOT_REQUIRED_GAP_IDS) {
    if (!gapIds.includes(gapId)) addInvalidGraphIssue(issues, gapId, `Le gap canonique ${gapId} est absent du pilote fermé.`);
  }

  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const gapsById = new Map(graph.gaps.map((gap) => [gap.id, gap]));
  for (const node of graph.nodes) {
    if (!COVERAGE_NODE_STATUSES.has(node.status)) addInvalidGraphIssue(issues, node.id, `Le nœud ${node.id} possède le statut invalide ${String(node.status)}.`);
    const expectedKind = CLOSED_PILOT_NODE_KINDS.get(node.id);
    if (expectedKind !== undefined && node.kind !== expectedKind) addInvalidGraphIssue(issues, node.id, `Le nœud ${node.id} doit conserver le kind ${expectedKind}.`);
    if (hasDuplicates(node.dependsOn)) addInvalidGraphIssue(issues, node.id, `Le nœud ${node.id} contient des dépendances dupliquées.`);
    if (hasDuplicates(node.blockingGapIds)) addInvalidGraphIssue(issues, node.id, `Le nœud ${node.id} contient des gaps dupliqués.`);
    for (const dependencyId of node.dependsOn) {
      if (!nodesById.has(dependencyId)) addInvalidGraphIssue(issues, node.id, `Le nœud ${node.id} dépend du nœud absent ${dependencyId}.`);
    }
    for (const gapId of node.blockingGapIds) {
      const gap = gapsById.get(gapId);
      if (!gap) addInvalidGraphIssue(issues, node.id, `Le nœud ${node.id} référence le gap absent ${gapId}.`);
      else if (!gap.blocksNodeIds.includes(node.id)) addInvalidGraphIssue(issues, node.id, `La relation ${node.id}/${gapId} n’est pas bidirectionnelle.`);
    }
    if (node.status === 'covered' && node.blockingGapIds.length > 0) {
      addInvalidGraphIssue(issues, node.id, `Le nœud couvert ${node.id} conserve un gap bloquant.`);
    }
    if (node.status === 'covered' && !SOURCE_OPTIONAL_NODE_KINDS.has(node.kind) && node.sourceRefs.length === 0) {
      addInvalidGraphIssue(issues, node.id, `Le nœud couvert ${node.id} ne possède aucune provenance canonique.`);
    }
    for (const sourceRef of node.sourceRefs) {
      if (!graph.canonicalSourceIds.includes(sourceRef.sourceId)) {
        addInvalidGraphIssue(issues, node.id, `Le nœud ${node.id} référence la source non canonique ${sourceRef.sourceId}.`);
      }
      if (sourceRef.references.length === 0) addInvalidGraphIssue(issues, node.id, `La source ${sourceRef.sourceId} de ${node.id} ne contient aucune référence.`);
    }
  }
  for (const gap of graph.gaps) {
    if (!COVERAGE_GAP_STATUSES.has(gap.status)) addInvalidGraphIssue(issues, gap.id, `Le gap ${gap.id} possède le statut invalide ${String(gap.status)}.`);
    if (hasDuplicates(gap.blocksNodeIds)) addInvalidGraphIssue(issues, gap.id, `Le gap ${gap.id} contient des nœuds dupliqués.`);
    for (const nodeId of gap.blocksNodeIds) {
      const node = nodesById.get(nodeId);
      if (!node) addInvalidGraphIssue(issues, gap.id, `Le gap ${gap.id} bloque le nœud absent ${nodeId}.`);
      else if (!node.blockingGapIds.includes(gap.id)) addInvalidGraphIssue(issues, gap.id, `La relation ${gap.id}/${nodeId} n’est pas bidirectionnelle.`);
    }
  }
  const root = nodesById.get('coverage.complete-game');
  const openGapIds = graph.gaps.filter((gap) => gap.status !== 'resolved').map((gap) => gap.id).sort(compareText);
  if (root && !sameCanonicalValue(uniqueSorted(root.blockingGapIds), openGapIds)) {
    addInvalidGraphIssue(issues, root.id, 'La partie complète doit déclarer exactement tous les gaps encore ouverts.');
  }

  if (hasDuplicates(graph.arbitrationIds)) addInvalidGraphIssue(issues, 'arbitrationIds', 'Le registre d’arbitrages contient des identifiants dupliqués.');
  const expectedBlockingNodeIds = graph.nodes
    .filter((node) => node.status !== 'covered' && node.status !== 'deferred')
    .map((node) => node.id)
    .sort(compareText);
  if (hasDuplicates(graph.readiness.blockingNodeIds)
    || !sameCanonicalValue(uniqueSorted(graph.readiness.blockingNodeIds), expectedBlockingNodeIds)) {
    addInvalidGraphIssue(issues, 'readiness.blockingNodeIds', 'La readiness n’énumère pas exactement tous les nœuds non couverts du pilote.');
  }

  const rosterIds = graph.rosterCandidates.map((roster) => roster.id);
  if (hasDuplicates(rosterIds) || graph.rosterCandidates.length !== CLOSED_PILOT_ROSTERS.length) {
    addInvalidGraphIssue(issues, 'rosterCandidates', 'Le pilote fermé exige exactement deux rosters distincts.');
  }
  const allInstanceIds = graph.rosterCandidates.flatMap((roster) => roster.units.map((unit) => unit.instanceId));
  if (hasDuplicates(allInstanceIds)) addInvalidGraphIssue(issues, 'rosterCandidates.units', 'Les identifiants d’instances doivent être uniques entre les deux rosters.');
  for (const expected of CLOSED_PILOT_ROSTERS) {
    const roster = graph.rosterCandidates.find((candidate) => candidate.id === expected.id);
    if (!roster || roster.side !== expected.side || roster.expectedPoints !== expected.expectedPoints) {
      addInvalidGraphIssue(issues, expected.id, `Le roster ${expected.id} ne correspond pas au contrat fermé ${expected.expectedPoints} points.`);
      continue;
    }
    if (roster.units.length !== 3) addInvalidGraphIssue(issues, roster.id, `Le roster ${roster.id} doit contenir exactement trois unités.`);
    const orderedUnits = [...roster.units].sort((left, right) => compareText(left.instanceId, right.instanceId));
    if (!sameCanonicalValue(orderedUnits, expected.units)) {
      addInvalidGraphIssue(issues, roster.id, `Les trois identités d’unités de ${roster.id} ne correspondent pas au contrat fermé versionné.`);
    }
    if (roster.units.reduce((total, unit) => total + unit.points, 0) !== roster.expectedPoints) {
      addInvalidGraphIssue(issues, roster.id, `Le total des unités de ${roster.id} ne correspond pas aux points attendus.`);
    }
    if (roster.attachmentPolicy !== 'all-characters-unattached') {
      addInvalidGraphIssue(issues, roster.id, `Le roster ${roster.id} doit conserver tous ses personnages non attachés.`);
    }
    if (roster.status !== 'human-review-required' && roster.status !== 'covered') {
      addInvalidGraphIssue(issues, roster.id, `Le roster ${roster.id} possède le statut invalide ${String(roster.status)}.`);
    }
    const expectedRosterGapIds = roster.status === 'covered' ? [] : expected.draftBlockingGapIds;
    if (hasDuplicates(roster.blockingGapIds)
      || !sameCanonicalValue(uniqueSorted(roster.blockingGapIds), expectedRosterGapIds)) {
      addInvalidGraphIssue(issues, roster.id, `Les gaps de ${roster.id} ne correspondent pas à son statut de couverture.`);
    }
    for (const gapId of roster.blockingGapIds) {
      if (!gapsById.has(gapId)) addInvalidGraphIssue(issues, roster.id, `Le roster ${roster.id} référence le gap absent ${gapId}.`);
    }
  }
  if (graph.missionCandidate.status !== 'missing-source' && graph.missionCandidate.status !== 'covered') {
    addInvalidGraphIssue(issues, graph.missionCandidate.id, `La mission candidate possède le statut invalide ${String(graph.missionCandidate.status)}.`);
  }
  if (graph.missionCandidate.id !== 'closed-complete-game-disruption-v1'
    || graph.missionCandidate.primaryMission !== 'Disruption'
    || graph.missionCandidate.deploymentLayout !== 'mirror-layout-1'
    || !sameCanonicalValue(graph.missionCandidate.missionRuleBySide, { 'blood-angels': 'Outmanoeuvre', salamanders: 'Outmanoeuvre' })
    || hasDuplicates(graph.missionCandidate.fixedSecondaryIds)
    || !sameCanonicalValue(uniqueSorted(graph.missionCandidate.fixedSecondaryIds), ['Assassination', 'Engage on All Fronts'])) {
    addInvalidGraphIssue(issues, graph.missionCandidate.id, 'La mission candidate ne correspond pas au scénario fermé Disruption/mirror-layout-1.');
  }
  const expectedMissionGapIds = graph.missionCandidate.status === 'covered' ? [] : [...CLOSED_PILOT_MISSION_GAP_IDS];
  if (hasDuplicates(graph.missionCandidate.blockingGapIds)
    || !sameCanonicalValue(uniqueSorted(graph.missionCandidate.blockingGapIds), expectedMissionGapIds)) {
    addInvalidGraphIssue(issues, graph.missionCandidate.id, 'Les gaps de mission ne correspondent pas à son statut de couverture.');
  }
  for (const gapId of graph.missionCandidate.blockingGapIds) {
    if (!gapsById.has(gapId)) addInvalidGraphIssue(issues, graph.missionCandidate.id, `La mission candidate référence le gap absent ${gapId}.`);
  }
}

function reachableNodes(graph: FullGameCoverageGraphV1, issues: CompatibilityIssueV2[]): FullGameCoverageNodeV1[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (nodeId: string): void => {
    if (visited.has(nodeId)) return;
    if (visiting.has(nodeId)) {
      issues.push({ code: 'invalid-coverage-graph', subjectId: nodeId, message: `Le graphe de couverture contient un cycle atteignable à ${nodeId}.` });
      return;
    }
    const node = byId.get(nodeId);
    if (!node) {
      issues.push({ code: 'invalid-coverage-graph', subjectId: nodeId, message: `Le nœud de couverture ${nodeId} est référencé mais absent.` });
      return;
    }
    visiting.add(nodeId);
    for (const dependencyId of uniqueSorted(node.dependsOn)) visit(dependencyId);
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  visit('coverage.complete-game');
  return [...visited].map((nodeId) => byId.get(nodeId)!).sort((left, right) => compareText(left.id, right.id));
}

/** Copies candidate identities while requiring the roster adapter to identify characters explicitly. */
export function candidateFactsFromCoverageGraphV1(
  graph: FullGameCoverageGraphV1,
  characterInstanceIds: readonly string[]
): ClosedPilotCandidateFactsV1 {
  return {
    rosterCandidates: [...graph.rosterCandidates],
    missionCandidate: graph.missionCandidate,
    characterInstanceIds: uniqueSorted(characterInstanceIds)
  };
}

/**
 * Pure compilation of the closed pilot.  A report stays incompatible whenever
 * an attainable node is not covered, a graph gap remains open, an identity is
 * not the graph identity, or the draft mission is still unsourced.
 */
export function compileClosedCompleteGameCompatibilityV2(input: FullGameCompatibilityCompilationInputV1): CompatibilityReportV2 {
  const { graph, facts, environment } = input;
  const executableSessionFingerprint = input.executableSessionFingerprint?.trim() ?? '';
  const issues: CompatibilityIssueV2[] = [];
  validateClosedPilotGraph(graph, environment, issues);
  if (graph.status === 'covered' && !executableSessionFingerprint) {
    addInvalidGraphIssue(issues, 'executableSessionFingerprint', 'Un graphe couvert exige l’empreinte canonique des faits exécutables de session.');
  }
  const expectedRosters = [...graph.rosterCandidates].sort((left, right) => compareText(left.id, right.id));
  const factRosters = [...facts.rosterCandidates].sort((left, right) => compareText(left.id, right.id));
  if (!sameCanonicalValue(expectedRosters, factRosters)) {
    issues.push({ code: 'candidate-identity-mismatch', subjectId: 'rosterCandidates', message: 'Les rosters candidats doivent correspondre exactement aux identités du graphe versionné.' });
  }
  if (!sameCanonicalValue(graph.missionCandidate, facts.missionCandidate)) {
    issues.push({ code: 'candidate-identity-mismatch', subjectId: graph.missionCandidate.id, message: 'La mission candidate doit correspondre exactement à l’identité du graphe versionné.' });
  }
  const allCandidateInstanceIds = new Set(expectedRosters.flatMap((roster) => roster.units.map((unit) => unit.instanceId)));
  const explicitCharacterIds = uniqueSorted(facts.characterInstanceIds);
  const explicitCharacterUnits = expectedRosters
    .flatMap((roster) => roster.units)
    .filter((unit) => explicitCharacterIds.includes(unit.instanceId));
  const characterCountsByRoster = expectedRosters.map((roster) => roster.units.filter((unit) => explicitCharacterIds.includes(unit.instanceId)).length);
  if (hasDuplicates(facts.characterInstanceIds)
    || explicitCharacterIds.length !== 2
    || explicitCharacterIds.some((instanceId) => !allCandidateInstanceIds.has(instanceId))
    || explicitCharacterUnits.some((unit) => !CLOSED_PILOT_CHARACTER_UNIT_IDS.has(unit.unitId))
    || new Set(explicitCharacterUnits.map((unit) => unit.unitId)).size !== CLOSED_PILOT_CHARACTER_UNIT_IDS.size
    || characterCountsByRoster.some((count) => count !== 1)
    || expectedRosters.some((roster) => roster.attachmentPolicy !== 'all-characters-unattached')) {
    issues.push({ code: 'candidate-identity-mismatch', subjectId: 'attachment-policy', message: 'Le pilote doit déclarer explicitement un personnage non attaché dans chaque roster, sans l’inférer de son nom.' });
  }

  const reachable = reachableNodes(graph, issues);
  const reachableIds = new Set(reachable.map((node) => node.id));
  for (const nodeId of CLOSED_PILOT_REQUIRED_REACHABLE_NODE_IDS) {
    if (!reachableIds.has(nodeId)) addInvalidGraphIssue(issues, nodeId, `Le nœud obligatoire ${nodeId} n’est pas atteignable depuis coverage.complete-game.`);
  }
  const orderedReachableIds = [...reachableIds].sort(compareText);
  if (!sameCanonicalValue(orderedReachableIds, [...CLOSED_PILOT_REQUIRED_REACHABLE_NODE_IDS])) {
    addInvalidGraphIssue(issues, 'coverage.complete-game', `Le graphe ${CLOSED_PILOT_COVERAGE_VERSION} doit avoir exactement les treize nœuds atteignables canoniques.`);
  }
  const requirements = reachable.map(compileRequirement);
  const nonReachableRequirements = graph.nodes
    .filter((node) => !reachableIds.has(node.id))
    .sort((left, right) => compareText(left.id, right.id))
    .map(compileRequirement);
  const unmetRequirements = requirements.filter((requirement) => !requirement.satisfied);
  for (const requirement of unmetRequirements) {
    issues.push({ code: 'uncovered-requirement', subjectId: requirement.nodeId, message: `Le nœud atteignable ${requirement.nodeId} n’est pas couvert (${requirement.status}).` });
  }

  const allNodeIds = new Set(graph.nodes.map((node) => node.id));
  const blockingGaps = graph.gaps.filter((gap) => gap.status !== 'resolved').sort((left, right) => compareText(left.id, right.id)).map((gap) => {
    for (const nodeId of gap.blocksNodeIds) {
      if (!allNodeIds.has(nodeId)) issues.push({ code: 'invalid-coverage-graph', subjectId: gap.id, message: `Le gap ${gap.id} bloque le nœud absent ${nodeId}.` });
    }
    issues.push({ code: 'blocking-gap', subjectId: gap.id, message: `Le gap ${gap.id} reste ouvert.` });
    return { gapId: gap.id, category: gap.category, title: gap.title, blocksNodeIds: uniqueSorted(gap.blocksNodeIds), requiredAction: gap.requiredAction };
  });

  const humanDecisions: CompatibilityHumanDecisionV2[] = [
    ...expectedRosters.filter((roster) => roster.status !== 'covered').map((roster) => ({
      subjectType: 'roster-candidate' as const,
      subjectId: roster.id,
      reason: 'Le roster candidat attend une revue humaine avant toute couverture exécutable.',
      ownerAction: 'Approuver les loadouts, profils physiques et conventions signalés par le graphe.'
    })),
    ...graph.gaps.filter((gap) => gap.status === 'open-human-review').map((gap) => ({
      subjectType: 'gap' as const,
      subjectId: gap.id,
      reason: gap.title,
      ownerAction: gap.manualOwnerAction
    }))
  ].sort((left, right) => compareText(left.subjectType, right.subjectType) || compareText(left.subjectId, right.subjectId));
  for (const decision of humanDecisions) issues.push({ code: 'human-decision-required', subjectId: decision.subjectId, message: decision.reason });

  const missingSources: CompatibilityMissingSourceV2[] = [
    ...(graph.missionCandidate.status === 'missing-source' ? [{
      subjectType: 'mission-candidate' as const,
      subjectId: graph.missionCandidate.id,
      reason: 'La mission draft ne possède pas de source officielle complète versionnée.',
      requiredAction: graph.missionCandidate.authorityNote
    }] : []),
    ...graph.gaps.filter((gap) => gap.status === 'open-source-request').map((gap) => ({
      subjectType: 'gap' as const,
      subjectId: gap.id,
      reason: gap.title,
      requiredAction: gap.requiredAction
    }))
  ].sort((left, right) => compareText(left.subjectType, right.subjectType) || compareText(left.subjectId, right.subjectId));
  for (const source of missingSources) issues.push({ code: 'missing-source', subjectId: source.subjectId, message: source.reason });

  const expectedReadiness = graph.status === 'covered'
    && unmetRequirements.length === 0
    && blockingGaps.length === 0
    && humanDecisions.length === 0
    && missingSources.length === 0
    && issues.length === 0;
  if (graph.readiness.compatible !== expectedReadiness) {
    addInvalidGraphIssue(issues, 'readiness.compatible', `La readiness annonce ${graph.readiness.compatible} alors que la compilation structurée produit ${expectedReadiness}.`);
  }

  const orderedIssues = [...issues].sort((left, right) => compareText(left.code, right.code) || compareText(left.subjectId, right.subjectId) || compareText(left.message, right.message));
  const reportWithoutFingerprint = {
    schemaVersion: COMPATIBILITY_REPORT_V2_SCHEMA_VERSION,
    reportVersion: '2.0.0' as const,
    coverageScope: graph.scope,
    coverageVersion: graph.version,
    coverageStatus: graph.status,
    manifestVersion: graph.manifestVersion,
    canonicalSourceIds: uniqueSorted(graph.canonicalSourceIds),
    arbitrationIds: uniqueSorted(graph.arbitrationIds),
    gapStatuses: graph.gaps.map((gap) => ({ gapId: gap.id, status: gap.status })).sort((left, right) => compareText(left.gapId, right.gapId)),
    gapInventory: graph.gaps.map((gap) => ({
      ...gap,
      blocksNodeIds: uniqueSorted(gap.blocksNodeIds)
    })).sort((left, right) => compareText(left.id, right.id)),
    executableSessionFingerprint: executableSessionFingerprint || null,
    compatible: expectedReadiness && orderedIssues.length === 0,
    rosterCandidates: expectedRosters.map((roster) => compileRoster(roster, new Set(explicitCharacterIds))),
    missionCandidate: compileMission(graph.missionCandidate),
    satisfiedRequirements: requirements.filter((requirement) => requirement.satisfied),
    unmetRequirements,
    nonReachableRequirements,
    blockingGaps,
    humanDecisions,
    missingSources,
    issues: orderedIssues
  };
  return { ...reportWithoutFingerprint, canonicalFingerprint: canonicalJson(reportWithoutFingerprint) };
}

/** Explicitly refuses any attempt to use this diagnostic compiler as V6 setup creation. */
export function refuseCompleteGameSessionSetupV1(report: CompatibilityReportV2): CompleteGameSessionSetupRefusalV1 {
  return {
    accepted: false,
    code: 'complete-game-setup-not-produced-by-m6-compiler',
    message: 'SIM-M6-T03 compile un rapport de compatibilité ; il ne produit jamais de CompleteGameSessionSetupV1 et n’active pas la mission draft.',
    reportFingerprint: report.canonicalFingerprint
  };
}
