export const STRATEGY_KNOWLEDGE_URL = `${import.meta.env.BASE_URL}data/strategy-knowledge.json`;

export type StrategySourceTier = 'official' | 'trusted-archive' | 'observation' | 'inference' | 'hypothesis';
export type StrategyConfidence = 'high' | 'medium' | 'low';
export type StrategyStatus = 'draft' | 'needs-review' | 'reviewed' | 'published';
import type { RosterItem } from './types';

export type StrategyScenarioKind = 'pack-framework' | 'primary-card' | 'secondary-card' | 'matchup-plan';

export interface StrategySource {
  id: string;
  kind: string;
  authority: string;
  title: string;
  catalogSchema?: string;
  catalogDataVersion?: string;
}

export interface StrategyCompatibility {
  gameEdition: '11th';
  catalogSchema: 'warforge-catalog/v2';
  catalogDataVersion: string;
  missionPackIds: string[];
}

export interface StrategyEvidence {
  id: string;
  title: string;
  missionPackId: string;
  sourceTier: StrategySourceTier;
  sourceIds: string[];
  confidence: StrategyConfidence;
  status: StrategyStatus;
  summary?: string;
  limitations: string[];
}

export interface StrategyScenario extends StrategyEvidence {
  kind: StrategyScenarioKind;
  cardSourcePath?: string;
  forceDispositionId?: string;
  opponentForceDispositionId?: string;
  victoryAxes: string[];
  scoringWindows: string[];
}

export interface StrategyForceDisposition extends StrategyEvidence {
  deck: string;
  sourcePath: string;
}

export interface StrategyLayoutContext extends StrategyEvidence {
  deck: string;
  opponentDeck: string;
  sourcePath: string;
  layoutIds: number[];
}

export interface StrategyAxisRating {
  axis: string;
  score: number;
  basis: string;
}

export interface StrategyDetachmentProfile extends Omit<StrategyEvidence, 'missionPackId'> {
  catalogDetachmentId: string;
  catalogDataVersion: string;
  faction: string;
  sourcePages: number[];
  roles: string[];
  axisRatings: StrategyAxisRating[];
  rationale: string;
  preconditions: string[];
  reviewBy: string;
}

export interface StrategyUnitProfile extends Omit<StrategyEvidence, 'missionPackId'> {
  catalogUnitId: string;
  detachmentProfileIds: string[];
  catalogDataVersion: string;
  faction: string;
  sourcePages: number[];
  roles: string[];
  axisRatings: StrategyAxisRating[];
  rationale: string;
  preconditions: string[];
  reviewBy: string;
}

export type StrategyRuleKind = 'army-rule' | 'detachment-rule' | 'stratagem' | 'enhancement' | 'datasheet-ability' | 'mission-rule';
export type StrategyRuleRelationKind = 'enables' | 'amplifies' | 'protects' | 'repositions' | 'denies' | 'scores' | 'coordinates';

export interface StrategyParticipant {
  type: 'unit' | 'detachment';
  catalogId: string;
}

export interface StrategyRuleTarget {
  faction?: string;
  unitIds?: string[];
  allKeywords?: string[];
  anyKeywords?: string[];
  excludeUnitIds?: string[];
}

export interface StrategyRuleNode extends Omit<StrategyEvidence, 'missionPackId'> {
  kind: StrategyRuleKind;
  owner: StrategyParticipant;
  /** Extra composition prerequisites; still not a live-game activation check. */
  requiresParticipants?: StrategyParticipant[];
  sourcePages: number[];
  fact: string;
  timing: string;
  commandPointCost?: number;
  activation: 'detachment' | 'selected-enhancement';
  catalogEnhancementName?: string;
  target: StrategyRuleTarget;
  effectTags: string[];
  reviewBy: string;
}

export interface StrategySynergy extends Omit<StrategyEvidence, 'missionPackId'> {
  evidenceKind: 'rules-supported' | 'tested' | 'hypothesis';
  participants: StrategyParticipant[];
  ruleIds: string[];
  relationKind: StrategyRuleRelationKind;
  sourcePages: number[];
  claim: string;
  preconditions: string[];
  timing: string;
  counterplay: string[];
  tradeoffs: string[];
  axisEffects: StrategyAxisRating[];
  reviewBy: string;
}

export interface StrategyFactionMetric {
  faction: string;
  sourceFaction?: string;
  winRate: number;
  fieldShare: number;
  sampleSize: number;
  victoryPointDifference: number;
  top3Rate: number;
}

export interface StrategyMetaSnapshot extends Omit<StrategyEvidence, 'missionPackId'> {
  gameEdition: '11th';
  scope: string;
  observedAt: string;
  window: {
    id: string;
    coverageThrough: string;
    eventCount: number;
    gameCount: number;
  };
  factionMetrics: StrategyFactionMetric[];
}

export interface StrategyRecommendation extends Omit<StrategyEvidence, 'missionPackId'> {
  kind: 'list-construction' | 'play-pattern' | 'matchup-plan';
  statement: string;
  scope: {
    scenarioIds?: string[];
    synergyIds?: string[];
    metaSnapshotIds?: string[];
    detachmentProfileIds?: string[];
  };
  tradeoffs: string[];
  reviewBy: string;
}

export type StrategyTacticalClaimKind = 'advantage' | 'play-pattern' | 'pitfall' | 'counterplay' | 'scoring-model' | 'tradeoff' | 'list-construction' | 'decision-rule';
export type StrategyGuideSide = 'alpha' | 'beta' | 'global';

export type StrategySecondaryMissionCapability = 'action-capacity' | 'concentrated-damage' | 'distributed-damage' | 'durable-presence' | 'independent-units' | 'objective-control' | 'screening' | 'target-access' | 'territorial-projection' | 'unit-redundancy';
export type StrategySecondaryMissionFamilyId = 'destruction-targeted' | 'objective-control' | 'territorial-projection' | 'actions-operations';

export interface StrategySecondaryMissionFramework extends Omit<StrategyEvidence, 'missionPackId'> {
  missionPackId: string;
  mode: 'tactical';
  cardsDrawnPerCommandPhase: 2;
  uncompletedCardsRemainActive: true;
  completedCardsAreDiscarded: true;
  voluntaryEndTurnDiscard: { allowsMultiple: true; commandPointsGained: 1 };
  oncePerBattleRedraw: { commandPointCost: 1; discardedCards: 1; drawnCards: 1 };
  victoryPointCaps: { battle: 45; round: 15 };
  reviewBy: string;
}

export interface StrategySecondaryMissionFamily extends Omit<StrategyEvidence, 'missionPackId'> {
  familyId: StrategySecondaryMissionFamilyId;
  scenarioIds: string[];
  capabilityTags: StrategySecondaryMissionCapability[];
  claimIds: string[];
  reviewBy: string;
}

export interface StrategyMissionCapabilityRequirement {
  capability: StrategySecondaryMissionCapability;
  importance: 'core' | 'supporting';
  rationale: string;
}

export interface StrategySecondaryMissionGuide extends Omit<StrategyEvidence, 'missionPackId'> {
  locale: 'fr';
  mode: 'tactical';
  scenarioId: string;
  familyId: StrategySecondaryMissionFamilyId;
  capabilityRequirements: StrategyMissionCapabilityRequirement[];
  claimIds: string[];
  decisionExampleIds: string[];
  reviewBy: string;
}

export interface StrategySecondaryDecisionBranch {
  id: string;
  condition: string;
  line: string;
  rationale: string;
  risks: string[];
  claimIds: string[];
}

export interface StrategySecondaryDecisionExample extends Omit<StrategyEvidence, 'missionPackId'> {
  scenarioId: string;
  setup: string[];
  assumptions: string[];
  decisionPoint: string;
  branches: StrategySecondaryDecisionBranch[];
  lessonClaimIds: string[];
  reviewBy: string;
}

/** A small, reusable tactical conclusion. Rules text remains in mission/catalogue data. */
export interface StrategyTacticalClaim extends Omit<StrategyEvidence, 'missionPackId'> {
  kind: StrategyTacticalClaimKind;
  side: StrategyGuideSide;
  scenarioIds: string[];
  layoutContextIds: string[];
  statement: string;
  rationale: string;
  preconditions: string[];
  counterplay: string[];
  tradeoffs: string[];
  axisEffects: StrategyAxisRating[];
  reviewBy: string;
}

export interface StrategyMatchupGuideSide {
  side: Exclude<StrategyGuideSide, 'global'>;
  forceDispositionId: string;
  scenarioId: string;
  claimIds: string[];
  victoryPlanIds: string[];
  referenceRosterIds: string[];
}

/** Editorial composition of atomic claims for one unordered disposition pairing. */
export interface StrategyMatchupGuide extends Omit<StrategyEvidence, 'missionPackId'> {
  slug: string;
  locale: 'fr';
  layoutContextId: string;
  selectedLayoutId: number;
  overview: string;
  sides: [StrategyMatchupGuideSide, StrategyMatchupGuideSide];
  globalClaimIds: string[];
  workedExampleId: string;
  narrativeSourcePath: string;
  reviewBy: string;
}

export interface StrategyScoreItem {
  label: string;
  vp: number;
}

export interface StrategyWorkedExampleTurn {
  side: Exclude<StrategyGuideSide, 'global'>;
  summary: string;
  scoreItems: StrategyScoreItem[];
  roundTotal: number;
  cumulativeTotal: number;
}

export interface StrategyWorkedExampleRound {
  round: number;
  turns: [StrategyWorkedExampleTurn, StrategyWorkedExampleTurn];
}

/** A bounded teaching ledger, never evidence that an outcome is probable. */
export interface StrategyWorkedExample extends Omit<StrategyEvidence, 'missionPackId'> {
  guideId: string;
  layoutId: number;
  assumptions: string[];
  rounds: StrategyWorkedExampleRound[];
  finalScores: { alpha: number; beta: number };
  lessonClaimIds: string[];
  reviewBy: string;
}

/**
 * A bounded, ordered part of a victory plan. It is decision support rather
 * than a turn simulator: its gates must remain observable by the player and
 * any rules it relies on must be part of the plan's explicit rule graph.
 */
export interface StrategyOperationalStage {
  id: string;
  title: string;
  objective: string;
  execution: string[];
  decisionGate: string;
  abortCondition: string;
  ruleIds: string[];
  synergyIds: string[];
}

/** A conditional branch with an explicit safer fallback, never a guarantee. */
export interface StrategyDecisionBranch {
  id: string;
  signal: string;
  recommendation: string;
  fallback: string;
  guardrails: string[];
  ruleIds: string[];
  synergyIds: string[];
}

/**
 * An explainable, scenario-specific inference. It deliberately describes
 * composition and intended roles; it does not evaluate live game state.
 */
export interface StrategyVictoryPlan extends Omit<StrategyEvidence, 'missionPackId'> {
  detachmentProfileId: string;
  scenarioId: string;
  ruleIds: string[];
  synergyIds: string[];
  priorityAxes: string[];
  statement: string;
  preconditions: string[];
  counterplay: string[];
  tradeoffs: string[];
  operationalStages: StrategyOperationalStage[];
  decisionBranches: StrategyDecisionBranch[];
  reviewBy: string;
}

export interface StrategyReferenceRosterDraft {
  primaryFaction: string;
  battleSizePoints: number;
  scenario: string;
  primaryMissionId: string;
  detachmentIds: string[];
  items: RosterItem[];
}

/** A pinned, editable example list tied to one reviewed victory plan. */
export interface StrategyReferenceRoster extends Omit<StrategyEvidence, 'missionPackId'> {
  victoryPlanId: string;
  catalogDataVersion: string;
  draft: StrategyReferenceRosterDraft;
  reviewBy: string;
}

export interface StrategyAxisFit {
  axis: string;
  detachmentScore: number;
  scenarioCount: number;
}

export interface StrategyForceDispositionFit {
  profile: StrategyDetachmentProfile;
  deck: string;
  scenarioCount: number;
  matches: StrategyAxisFit[];
  cautions: string[];
  sourceIds: string[];
}

export interface StrategyKnowledge {
  schemaVersion: 'warforge-strategy-knowledge/v5';
  knowledgeVersion: string;
  catalogProvenanceSourceId: string;
  compatibility: StrategyCompatibility;
  sources: StrategySource[];
  scenarios: StrategyScenario[];
  forceDispositions: StrategyForceDisposition[];
  layoutContexts: StrategyLayoutContext[];
  ruleNodes: StrategyRuleNode[];
  unitProfiles: StrategyUnitProfile[];
  detachmentProfiles: StrategyDetachmentProfile[];
  synergies: StrategySynergy[];
  metaSnapshots: StrategyMetaSnapshot[];
  recommendations: StrategyRecommendation[];
  victoryPlans: StrategyVictoryPlan[];
  referenceRosters: StrategyReferenceRoster[];
  tacticalClaims: StrategyTacticalClaim[];
  matchupGuides: StrategyMatchupGuide[];
  workedExamples: StrategyWorkedExample[];
  secondaryMissionFrameworks: StrategySecondaryMissionFramework[];
  secondaryMissionFamilies: StrategySecondaryMissionFamily[];
  secondaryMissionGuides: StrategySecondaryMissionGuide[];
  secondaryDecisionExamples: StrategySecondaryDecisionExample[];
}

export interface StrategyRuleGraphUnit {
  id: string;
  factionName: string;
  Keywords?: string[];
  FactionKeywords?: string[];
}

export interface StrategySelectedEnhancement {
  detachmentId: string;
  name: string;
}

export interface StrategyRuleGraphContext {
  detachmentIds: string[];
  unitIds: string[];
  units: StrategyRuleGraphUnit[];
  selectedEnhancements?: StrategySelectedEnhancement[];
  primaryMissionId?: string;
}

export interface StrategyResolvedRule {
  rule: StrategyRuleNode;
  eligibleUnitIds: string[];
}

export interface StrategyPendingSynergy {
  synergy: StrategySynergy;
  missingUnitIds: string[];
  blockedRuleIds: string[];
}

export interface StrategyRuleGraphResolution {
  activeRules: StrategyResolvedRule[];
  activeSynergies: StrategySynergy[];
  pendingSynergies: StrategyPendingSynergy[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isSourceTier(value: unknown): value is StrategySourceTier {
  return value === 'official' || value === 'trusted-archive' || value === 'observation' || value === 'inference' || value === 'hypothesis';
}

function isConfidence(value: unknown): value is StrategyConfidence {
  return value === 'high' || value === 'medium' || value === 'low';
}

function isStatus(value: unknown): value is StrategyStatus {
  return value === 'draft' || value === 'needs-review' || value === 'reviewed' || value === 'published';
}

function isStrategySource(value: unknown): value is StrategySource {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.kind === 'string'
    && typeof value.authority === 'string'
    && typeof value.title === 'string'
    && (value.catalogSchema === undefined || typeof value.catalogSchema === 'string')
    && (value.catalogDataVersion === undefined || typeof value.catalogDataVersion === 'string');
}

function isCompatibility(value: unknown): value is StrategyCompatibility {
  return isRecord(value)
    && value.gameEdition === '11th'
    && value.catalogSchema === 'warforge-catalog/v2'
    && typeof value.catalogDataVersion === 'string'
    && isStringList(value.missionPackIds);
}

function isEvidence(value: unknown): value is StrategyEvidence {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.missionPackId === 'string'
    && isSourceTier(value.sourceTier)
    && isStringList(value.sourceIds)
    && isConfidence(value.confidence)
    && isStatus(value.status)
    && (value.summary === undefined || typeof value.summary === 'string')
    && isStringList(value.limitations);
}

function isScenario(value: unknown): value is StrategyScenario {
  return isEvidence(value)
    && isRecord(value)
    && (value.kind === 'pack-framework' || value.kind === 'primary-card' || value.kind === 'secondary-card' || value.kind === 'matchup-plan')
    && (value.cardSourcePath === undefined || typeof value.cardSourcePath === 'string')
    && (value.forceDispositionId === undefined || typeof value.forceDispositionId === 'string')
    && (value.opponentForceDispositionId === undefined || typeof value.opponentForceDispositionId === 'string')
    && isStringList(value.victoryAxes)
    && isStringList(value.scoringWindows);
}

function isForceDisposition(value: unknown): value is StrategyForceDisposition {
  return isEvidence(value) && isRecord(value) && typeof value.deck === 'string' && typeof value.sourcePath === 'string';
}

function isLayoutContext(value: unknown): value is StrategyLayoutContext {
  return isEvidence(value)
    && isRecord(value)
    && typeof value.deck === 'string'
    && typeof value.opponentDeck === 'string'
    && typeof value.sourcePath === 'string'
    && Array.isArray(value.layoutIds)
    && value.layoutIds.every((entry) => typeof entry === 'number');
}

function isSourcePages(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((entry) => Number.isInteger(entry) && entry > 0);
}

function isAxisRatings(value: unknown): value is StrategyAxisRating[] {
  return Array.isArray(value) && value.every((rating) => isRecord(rating)
    && typeof rating.axis === 'string'
    && typeof rating.score === 'number'
    && Number.isInteger(rating.score)
    && rating.score >= 0
    && rating.score <= 4
    && typeof rating.basis === 'string');
}

function isParticipant(value: unknown): value is StrategyParticipant {
  return isRecord(value)
    && (value.type === 'unit' || value.type === 'detachment')
    && typeof value.catalogId === 'string';
}

function isRuleTarget(value: unknown): value is StrategyRuleTarget {
  return isRecord(value)
    && (value.faction === undefined || typeof value.faction === 'string')
    && (value.unitIds === undefined || isStringList(value.unitIds))
    && (value.allKeywords === undefined || isStringList(value.allKeywords))
    && (value.anyKeywords === undefined || isStringList(value.anyKeywords))
    && (value.excludeUnitIds === undefined || isStringList(value.excludeUnitIds));
}

function isRuleNode(value: unknown): value is StrategyRuleNode {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && (value.kind === 'army-rule' || value.kind === 'detachment-rule' || value.kind === 'stratagem' || value.kind === 'enhancement' || value.kind === 'datasheet-ability' || value.kind === 'mission-rule')
    && isParticipant(value.owner)
    && (value.requiresParticipants === undefined || (Array.isArray(value.requiresParticipants) && value.requiresParticipants.every(isParticipant)))
    && isSourceTier(value.sourceTier)
    && isStringList(value.sourceIds)
    && isSourcePages(value.sourcePages)
    && isConfidence(value.confidence)
    && isStatus(value.status)
    && isStringList(value.limitations)
    && typeof value.fact === 'string'
    && typeof value.timing === 'string'
    && (value.commandPointCost === undefined || (typeof value.commandPointCost === 'number' && Number.isInteger(value.commandPointCost) && value.commandPointCost >= 0))
    && (value.activation === 'detachment' || value.activation === 'selected-enhancement')
    && (value.catalogEnhancementName === undefined || typeof value.catalogEnhancementName === 'string')
    && isRuleTarget(value.target)
    && isStringList(value.effectTags)
    && typeof value.reviewBy === 'string'
    && (value.activation !== 'selected-enhancement' || typeof value.catalogEnhancementName === 'string');
}

function isUnitProfile(value: unknown): value is StrategyUnitProfile {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.catalogUnitId === 'string'
    && Array.isArray(value.detachmentProfileIds)
    && value.detachmentProfileIds.length > 0
    && isStringList(value.detachmentProfileIds)
    && typeof value.catalogDataVersion === 'string'
    && typeof value.faction === 'string'
    && typeof value.title === 'string'
    && isSourceTier(value.sourceTier)
    && isStringList(value.sourceIds)
    && isSourcePages(value.sourcePages)
    && isConfidence(value.confidence)
    && isStatus(value.status)
    && isStringList(value.roles)
    && isAxisRatings(value.axisRatings)
    && typeof value.rationale === 'string'
    && isStringList(value.preconditions)
    && isStringList(value.limitations)
    && typeof value.reviewBy === 'string';
}

function isDetachmentProfile(value: unknown): value is StrategyDetachmentProfile {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.catalogDetachmentId === 'string'
    && typeof value.catalogDataVersion === 'string'
    && typeof value.faction === 'string'
    && typeof value.title === 'string'
    && isSourceTier(value.sourceTier)
    && isStringList(value.sourceIds)
    && isSourcePages(value.sourcePages)
    && isConfidence(value.confidence)
    && isStatus(value.status)
    && isStringList(value.roles)
    && isAxisRatings(value.axisRatings)
    && typeof value.rationale === 'string'
    && isStringList(value.preconditions)
    && isStringList(value.limitations)
    && typeof value.reviewBy === 'string';
}

function isSynergy(value: unknown): value is StrategySynergy {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && (value.evidenceKind === 'rules-supported' || value.evidenceKind === 'tested' || value.evidenceKind === 'hypothesis')
    && Array.isArray(value.participants)
    && value.participants.length >= 2
    && value.participants.every(isParticipant)
    && Array.isArray(value.ruleIds)
    && value.ruleIds.length > 0
    && isStringList(value.ruleIds)
    && (value.relationKind === 'enables' || value.relationKind === 'amplifies' || value.relationKind === 'protects' || value.relationKind === 'repositions' || value.relationKind === 'denies' || value.relationKind === 'scores' || value.relationKind === 'coordinates')
    && isSourceTier(value.sourceTier)
    && isStringList(value.sourceIds)
    && isSourcePages(value.sourcePages)
    && isConfidence(value.confidence)
    && isStatus(value.status)
    && typeof value.claim === 'string'
    && isStringList(value.preconditions)
    && typeof value.timing === 'string'
    && isStringList(value.counterplay)
    && isStringList(value.tradeoffs)
    && isAxisRatings(value.axisEffects)
    && isStringList(value.limitations)
    && typeof value.reviewBy === 'string';
}

function isMetaSnapshot(value: unknown): value is StrategyMetaSnapshot {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && value.gameEdition === '11th'
    && typeof value.scope === 'string'
    && typeof value.observedAt === 'string'
    && isRecord(value.window)
    && typeof value.window.id === 'string'
    && typeof value.window.coverageThrough === 'string'
    && Number.isInteger(value.window.eventCount)
    && Number.isInteger(value.window.gameCount)
    && isSourceTier(value.sourceTier)
    && isStringList(value.sourceIds)
    && isConfidence(value.confidence)
    && isStatus(value.status)
    && Array.isArray(value.factionMetrics)
    && value.factionMetrics.every((metric) => isRecord(metric)
      && typeof metric.faction === 'string'
      && (metric.sourceFaction === undefined || typeof metric.sourceFaction === 'string')
      && typeof metric.winRate === 'number'
      && typeof metric.fieldShare === 'number'
      && Number.isInteger(metric.sampleSize)
      && typeof metric.victoryPointDifference === 'number'
      && typeof metric.top3Rate === 'number')
    && isStringList(value.limitations);
}

function isRecommendation(value: unknown): value is StrategyRecommendation {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && (value.kind === 'list-construction' || value.kind === 'play-pattern' || value.kind === 'matchup-plan')
    && typeof value.statement === 'string'
    && isSourceTier(value.sourceTier)
    && isStringList(value.sourceIds)
    && isConfidence(value.confidence)
    && isStatus(value.status)
    && isRecord(value.scope)
    && (value.scope.scenarioIds === undefined || isStringList(value.scope.scenarioIds))
    && (value.scope.synergyIds === undefined || isStringList(value.scope.synergyIds))
    && (value.scope.metaSnapshotIds === undefined || isStringList(value.scope.metaSnapshotIds))
    && (value.scope.detachmentProfileIds === undefined || isStringList(value.scope.detachmentProfileIds))
    && isStringList(value.tradeoffs)
    && isStringList(value.limitations)
    && typeof value.reviewBy === 'string';
}

function isTacticalClaim(value: unknown): value is StrategyTacticalClaim {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && ['advantage', 'play-pattern', 'pitfall', 'counterplay', 'scoring-model', 'tradeoff', 'list-construction', 'decision-rule'].includes(String(value.kind))
    && ['alpha', 'beta', 'global'].includes(String(value.side))
    && isStringList(value.scenarioIds)
    && value.scenarioIds.length > 0
    && isStringList(value.layoutContextIds)
    && typeof value.statement === 'string'
    && typeof value.rationale === 'string'
    && isStringList(value.preconditions)
    && isStringList(value.counterplay)
    && isStringList(value.tradeoffs)
    && isAxisRatings(value.axisEffects)
    && isSourceTier(value.sourceTier)
    && isStringList(value.sourceIds)
    && isConfidence(value.confidence)
    && isStatus(value.status)
    && isStringList(value.limitations)
    && typeof value.reviewBy === 'string';
}

const secondaryCapabilities: StrategySecondaryMissionCapability[] = ['action-capacity', 'concentrated-damage', 'distributed-damage', 'durable-presence', 'independent-units', 'objective-control', 'screening', 'target-access', 'territorial-projection', 'unit-redundancy'];
const secondaryFamilyIds: StrategySecondaryMissionFamilyId[] = ['destruction-targeted', 'objective-control', 'territorial-projection', 'actions-operations'];

function isSecondaryCapability(value: unknown): value is StrategySecondaryMissionCapability {
  return secondaryCapabilities.includes(value as StrategySecondaryMissionCapability);
}

function isSecondaryMissionFramework(value: unknown): value is StrategySecondaryMissionFramework {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.missionPackId === 'string'
    && value.mode === 'tactical'
    && value.cardsDrawnPerCommandPhase === 2
    && value.uncompletedCardsRemainActive === true
    && value.completedCardsAreDiscarded === true
    && isRecord(value.voluntaryEndTurnDiscard)
    && value.voluntaryEndTurnDiscard.allowsMultiple === true
    && value.voluntaryEndTurnDiscard.commandPointsGained === 1
    && isRecord(value.oncePerBattleRedraw)
    && value.oncePerBattleRedraw.commandPointCost === 1
    && value.oncePerBattleRedraw.discardedCards === 1
    && value.oncePerBattleRedraw.drawnCards === 1
    && isRecord(value.victoryPointCaps)
    && value.victoryPointCaps.battle === 45
    && value.victoryPointCaps.round === 15
    && value.sourceTier === 'official'
    && isStringList(value.sourceIds)
    && isConfidence(value.confidence)
    && isStatus(value.status)
    && isStringList(value.limitations)
    && typeof value.reviewBy === 'string';
}

function isSecondaryMissionFamily(value: unknown): value is StrategySecondaryMissionFamily {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && secondaryFamilyIds.includes(value.familyId as StrategySecondaryMissionFamilyId)
    && isStringList(value.scenarioIds)
    && value.scenarioIds.length > 0
    && Array.isArray(value.capabilityTags)
    && value.capabilityTags.length > 0
    && value.capabilityTags.every(isSecondaryCapability)
    && isStringList(value.claimIds)
    && value.claimIds.length > 0
    && value.sourceTier === 'inference'
    && isStringList(value.sourceIds)
    && isConfidence(value.confidence)
    && isStatus(value.status)
    && isStringList(value.limitations)
    && typeof value.reviewBy === 'string';
}

function isCapabilityRequirement(value: unknown): value is StrategyMissionCapabilityRequirement {
  return isRecord(value)
    && isSecondaryCapability(value.capability)
    && (value.importance === 'core' || value.importance === 'supporting')
    && typeof value.rationale === 'string';
}

function isSecondaryMissionGuide(value: unknown): value is StrategySecondaryMissionGuide {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && value.locale === 'fr'
    && value.mode === 'tactical'
    && typeof value.scenarioId === 'string'
    && secondaryFamilyIds.includes(value.familyId as StrategySecondaryMissionFamilyId)
    && Array.isArray(value.capabilityRequirements)
    && value.capabilityRequirements.length > 0
    && value.capabilityRequirements.every(isCapabilityRequirement)
    && isStringList(value.claimIds)
    && value.claimIds.length > 0
    && isStringList(value.decisionExampleIds)
    && value.decisionExampleIds.length > 0
    && value.sourceTier === 'inference'
    && isStringList(value.sourceIds)
    && isConfidence(value.confidence)
    && isStatus(value.status)
    && isStringList(value.limitations)
    && typeof value.reviewBy === 'string';
}

function isSecondaryDecisionExample(value: unknown): value is StrategySecondaryDecisionExample {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.scenarioId === 'string'
    && isStringList(value.setup)
    && value.setup.length > 0
    && isStringList(value.assumptions)
    && value.assumptions.length > 0
    && typeof value.decisionPoint === 'string'
    && Array.isArray(value.branches)
    && value.branches.length >= 2
    && value.branches.every((branch) => isRecord(branch)
      && typeof branch.id === 'string'
      && typeof branch.condition === 'string'
      && typeof branch.line === 'string'
      && typeof branch.rationale === 'string'
      && isStringList(branch.risks)
      && isStringList(branch.claimIds)
      && branch.claimIds.length > 0)
    && isStringList(value.lessonClaimIds)
    && value.lessonClaimIds.length > 0
    && value.sourceTier === 'inference'
    && isStringList(value.sourceIds)
    && isConfidence(value.confidence)
    && isStatus(value.status)
    && isStringList(value.limitations)
    && typeof value.reviewBy === 'string';
}

function isMatchupGuideSide(value: unknown): value is StrategyMatchupGuideSide {
  return isRecord(value)
    && (value.side === 'alpha' || value.side === 'beta')
    && typeof value.forceDispositionId === 'string'
    && typeof value.scenarioId === 'string'
    && isStringList(value.claimIds)
    && value.claimIds.length > 0
    && isStringList(value.victoryPlanIds)
    && isStringList(value.referenceRosterIds);
}

function isMatchupGuide(value: unknown): value is StrategyMatchupGuide {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.slug === 'string'
    && value.locale === 'fr'
    && typeof value.layoutContextId === 'string'
    && Number.isInteger(value.selectedLayoutId)
    && typeof value.overview === 'string'
    && Array.isArray(value.sides)
    && value.sides.length === 2
    && value.sides.every(isMatchupGuideSide)
    && isStringList(value.globalClaimIds)
    && value.globalClaimIds.length > 0
    && typeof value.workedExampleId === 'string'
    && typeof value.narrativeSourcePath === 'string'
    && isSourceTier(value.sourceTier)
    && isStringList(value.sourceIds)
    && isConfidence(value.confidence)
    && isStatus(value.status)
    && isStringList(value.limitations)
    && typeof value.reviewBy === 'string';
}

function isWorkedExample(value: unknown): value is StrategyWorkedExample {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.guideId === 'string'
    && Number.isInteger(value.layoutId)
    && isStringList(value.assumptions)
    && Array.isArray(value.rounds)
    && value.rounds.length === 5
    && value.rounds.every((round, index) => isRecord(round)
      && round.round === index + 1
      && Array.isArray(round.turns)
      && round.turns.length === 2
      && round.turns.every((turn) => isRecord(turn)
        && (turn.side === 'alpha' || turn.side === 'beta')
        && typeof turn.summary === 'string'
        && Array.isArray(turn.scoreItems)
        && turn.scoreItems.every((item) => isRecord(item) && typeof item.label === 'string' && typeof item.vp === 'number' && Number.isInteger(item.vp) && item.vp >= 0)
        && typeof turn.roundTotal === 'number'
        && Number.isInteger(turn.roundTotal)
        && turn.roundTotal >= 0
        && turn.roundTotal <= 15
        && typeof turn.cumulativeTotal === 'number'
        && Number.isInteger(turn.cumulativeTotal)
        && turn.cumulativeTotal >= 0
        && turn.cumulativeTotal <= 45))
    && isRecord(value.finalScores)
    && typeof value.finalScores.alpha === 'number'
    && Number.isInteger(value.finalScores.alpha)
    && typeof value.finalScores.beta === 'number'
    && Number.isInteger(value.finalScores.beta)
    && value.finalScores.alpha >= 0
    && value.finalScores.alpha <= 45
    && value.finalScores.beta >= 0
    && value.finalScores.beta <= 45
    && isStringList(value.lessonClaimIds)
    && isSourceTier(value.sourceTier)
    && isStringList(value.sourceIds)
    && isConfidence(value.confidence)
    && isStatus(value.status)
    && isStringList(value.limitations)
    && typeof value.reviewBy === 'string';
}

function isRosterItem(value: unknown): value is RosterItem {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.unitId === 'string'
    && typeof value.pointIndex === 'number'
    && Number.isInteger(value.pointIndex)
    && value.pointIndex >= 0
    && isRecord(value.wargearSelections)
    && Object.values(value.wargearSelections).every((selection) => typeof selection === 'string')
    && (value.enhancement === undefined || (isRecord(value.enhancement)
      && typeof value.enhancement.detachmentId === 'string'
      && typeof value.enhancement.enhancementIndex === 'number'
      && Number.isInteger(value.enhancement.enhancementIndex)
      && value.enhancement.enhancementIndex >= 0));
}

function isOperationalStage(value: unknown): value is StrategyOperationalStage {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.objective === 'string'
    && isStringList(value.execution)
    && value.execution.length > 0
    && typeof value.decisionGate === 'string'
    && typeof value.abortCondition === 'string'
    && isStringList(value.ruleIds)
    && isStringList(value.synergyIds)
    && (value.ruleIds.length > 0 || value.synergyIds.length > 0);
}

function isDecisionBranch(value: unknown): value is StrategyDecisionBranch {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.signal === 'string'
    && typeof value.recommendation === 'string'
    && typeof value.fallback === 'string'
    && isStringList(value.guardrails)
    && value.guardrails.length > 0
    && isStringList(value.ruleIds)
    && isStringList(value.synergyIds)
    && (value.ruleIds.length > 0 || value.synergyIds.length > 0);
}

function isVictoryPlan(value: unknown): value is StrategyVictoryPlan {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.detachmentProfileId === 'string'
    && typeof value.scenarioId === 'string'
    && isStringList(value.ruleIds)
    && isStringList(value.synergyIds)
    && isStringList(value.priorityAxes)
    && typeof value.statement === 'string'
    && isStringList(value.preconditions)
    && isStringList(value.counterplay)
    && isStringList(value.tradeoffs)
    && Array.isArray(value.operationalStages)
    && value.operationalStages.length > 0
    && value.operationalStages.every(isOperationalStage)
    && Array.isArray(value.decisionBranches)
    && value.decisionBranches.length > 0
    && value.decisionBranches.every(isDecisionBranch)
    && isSourceTier(value.sourceTier)
    && isStringList(value.sourceIds)
    && isConfidence(value.confidence)
    && isStatus(value.status)
    && isStringList(value.limitations)
    && typeof value.reviewBy === 'string';
}

function isReferenceRosterDraft(value: unknown): value is StrategyReferenceRosterDraft {
  return isRecord(value)
    && typeof value.primaryFaction === 'string'
    && Number.isInteger(value.battleSizePoints)
    && typeof value.scenario === 'string'
    && typeof value.primaryMissionId === 'string'
    && isStringList(value.detachmentIds)
    && Array.isArray(value.items)
    && value.items.every(isRosterItem);
}

function isReferenceRoster(value: unknown): value is StrategyReferenceRoster {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.victoryPlanId === 'string'
    && typeof value.catalogDataVersion === 'string'
    && isReferenceRosterDraft(value.draft)
    && isSourceTier(value.sourceTier)
    && isStringList(value.sourceIds)
    && isConfidence(value.confidence)
    && isStatus(value.status)
    && isStringList(value.limitations)
    && typeof value.reviewBy === 'string';
}

function hasResolvedCatalogProvenance(
  sources: StrategySource[],
  catalogProvenanceSourceId: string,
  compatibility: StrategyCompatibility
): boolean {
  const manifests = sources.filter((source) => source.kind === 'catalog-manifest');
  return manifests.length === 1
    && manifests[0].id === catalogProvenanceSourceId
    && manifests[0].authority === 'local-verified'
    && manifests[0].catalogSchema === compatibility.catalogSchema
    && manifests[0].catalogDataVersion === compatibility.catalogDataVersion;
}

function hasResolvedUnitDetachmentContexts(
  unitProfiles: StrategyUnitProfile[],
  detachmentProfiles: StrategyDetachmentProfile[]
): boolean {
  const detachmentProfilesById = new Map(detachmentProfiles.map((profile) => [profile.id, profile]));
  return unitProfiles.every((unitProfile) => {
    const seenIds = new Set<string>();
    return unitProfile.detachmentProfileIds.every((detachmentProfileId) => {
      if (seenIds.has(detachmentProfileId)) return false;
      seenIds.add(detachmentProfileId);
      const detachmentProfile = detachmentProfilesById.get(detachmentProfileId);
      return detachmentProfile !== undefined
        && detachmentProfile.faction === unitProfile.faction
        && detachmentProfile.catalogDataVersion === unitProfile.catalogDataVersion
        && (unitProfile.status !== 'reviewed' || detachmentProfile.status === 'reviewed');
    });
  });
}

function hasResolvedRuleGraph(
  sources: StrategySource[],
  ruleNodes: StrategyRuleNode[],
  synergies: StrategySynergy[]
): boolean {
  const sourceIds = new Set(sources.map((source) => source.id));
  const ruleNodesById = new Map<string, StrategyRuleNode>();
  for (const ruleNode of ruleNodes) {
    if (ruleNodesById.has(ruleNode.id)
      || ruleNode.sourceIds.some((sourceId) => !sourceIds.has(sourceId))
      || ruleNode.sourceTier === 'hypothesis') return false;
    ruleNodesById.set(ruleNode.id, ruleNode);
  }
  return synergies.every((synergy) => {
    const seenRuleIds = new Set<string>();
    return synergy.ruleIds.every((ruleId) => {
      if (seenRuleIds.has(ruleId)) return false;
      seenRuleIds.add(ruleId);
      const ruleNode = ruleNodesById.get(ruleId);
      return ruleNode !== undefined && (synergy.status !== 'reviewed' || ruleNode.status === 'reviewed');
    });
  });
}

function hasResolvedVictoryPlans(
  sources: StrategySource[],
  scenarios: StrategyScenario[],
  ruleNodes: StrategyRuleNode[],
  detachmentProfiles: StrategyDetachmentProfile[],
  synergies: StrategySynergy[],
  victoryPlans: StrategyVictoryPlan[],
  referenceRosters: StrategyReferenceRoster[]
): boolean {
  const sourceIds = new Set(sources.map((source) => source.id));
  const scenarioIds = new Set(scenarios.map((scenario) => scenario.id));
  const ruleIds = new Set(ruleNodes.map((rule) => rule.id));
  const detachmentProfileIds = new Set(detachmentProfiles.map((profile) => profile.id));
  const synergyIds = new Set(synergies.map((synergy) => synergy.id));
  const planIds = new Set(victoryPlans.map((plan) => plan.id));
  return victoryPlans.every((plan) => detachmentProfileIds.has(plan.detachmentProfileId)
    && scenarioIds.has(plan.scenarioId)
    && plan.sourceIds.every((sourceId) => sourceIds.has(sourceId))
    && plan.ruleIds.every((ruleId) => ruleIds.has(ruleId))
    && plan.synergyIds.every((synergyId) => synergyIds.has(synergyId))
    && referenceRosters.every((roster) => planIds.has(roster.victoryPlanId)
      && roster.sourceIds.every((sourceId) => sourceIds.has(sourceId))));
}

function hasResolvedSecondaryMissionKnowledge(value: {
  sources: StrategySource[];
  scenarios: StrategyScenario[];
  tacticalClaims: StrategyTacticalClaim[];
  secondaryMissionFrameworks: StrategySecondaryMissionFramework[];
  secondaryMissionFamilies: StrategySecondaryMissionFamily[];
  secondaryMissionGuides: StrategySecondaryMissionGuide[];
  secondaryDecisionExamples: StrategySecondaryDecisionExample[];
}): boolean {
  const sourceIds = new Set(value.sources.map((source) => source.id));
  const secondaryScenarioIds = value.scenarios.filter((scenario) => scenario.kind === 'secondary-card').map((scenario) => scenario.id).sort();
  const claimById = new Map(value.tacticalClaims.map((claim) => [claim.id, claim]));
  const familyById = new Map(value.secondaryMissionFamilies.map((family) => [family.familyId, family]));
  const exampleById = new Map(value.secondaryDecisionExamples.map((example) => [example.id, example]));
  const requiredKinds = new Set<StrategyTacticalClaimKind>(['scoring-model', 'list-construction', 'advantage', 'pitfall', 'counterplay', 'play-pattern', 'tradeoff', 'decision-rule']);
  const partition = value.secondaryMissionFamilies.flatMap((family) => family.scenarioIds).sort();
  if (secondaryScenarioIds.length === 0
    && value.secondaryMissionFrameworks.length === 0
    && value.secondaryMissionFamilies.length === 0
    && value.secondaryMissionGuides.length === 0
    && value.secondaryDecisionExamples.length === 0) return true;
  if (value.secondaryMissionFrameworks.length !== 1
    || secondaryScenarioIds.length !== 18
    || partition.length !== 18
    || new Set(partition).size !== 18
    || partition.some((scenarioId, index) => scenarioId !== secondaryScenarioIds[index])) return false;
  if (!value.secondaryMissionFrameworks.every((framework) => framework.sourceIds.every((sourceId) => sourceIds.has(sourceId)))) return false;
  if (!value.secondaryMissionFamilies.every((family) => family.sourceIds.every((sourceId) => sourceIds.has(sourceId))
    && family.claimIds.every((claimId) => {
      const claim = claimById.get(claimId);
      return claim?.side === 'global' && family.scenarioIds.every((scenarioId) => claim.scenarioIds.includes(scenarioId));
    }))) return false;
  if (value.secondaryMissionGuides.length !== 18 || new Set(value.secondaryMissionGuides.map((guide) => guide.scenarioId)).size !== 18) return false;
  return value.secondaryMissionGuides.every((guide) => {
    const family = familyById.get(guide.familyId);
    const claims = guide.claimIds.map((claimId) => claimById.get(claimId));
    const kinds = new Set(claims.map((claim) => claim?.kind));
    return sourceIds.has(guide.sourceIds[0])
      && guide.sourceIds.every((sourceId) => sourceIds.has(sourceId))
      && family?.scenarioIds.includes(guide.scenarioId)
      && claims.every((claim) => claim?.side === 'global' && claim.scenarioIds.includes(guide.scenarioId))
      && [...requiredKinds].every((kind) => kinds.has(kind))
      && guide.decisionExampleIds.every((exampleId) => {
        const example = exampleById.get(exampleId);
        return example?.scenarioId === guide.scenarioId
          && example.sourceIds.every((sourceId) => sourceIds.has(sourceId))
          && example.lessonClaimIds.every((claimId) => claimById.get(claimId)?.scenarioIds.includes(guide.scenarioId))
          && example.branches.every((branch) => branch.claimIds.every((claimId) => claimById.get(claimId)?.scenarioIds.includes(guide.scenarioId)));
      });
  });
}

export function strategyKnowledge(value: unknown): StrategyKnowledge | null {
  if (!isRecord(value) || value.schemaVersion !== 'warforge-strategy-knowledge/v5' || typeof value.knowledgeVersion !== 'string' || typeof value.catalogProvenanceSourceId !== 'string') return null;
  if (!isCompatibility(value.compatibility) || !Array.isArray(value.sources) || !Array.isArray(value.scenarios) || !Array.isArray(value.forceDispositions) || !Array.isArray(value.layoutContexts) || !Array.isArray(value.ruleNodes) || !Array.isArray(value.unitProfiles) || !Array.isArray(value.detachmentProfiles) || !Array.isArray(value.synergies) || !Array.isArray(value.metaSnapshots) || !Array.isArray(value.recommendations) || !Array.isArray(value.victoryPlans) || !Array.isArray(value.referenceRosters) || !Array.isArray(value.tacticalClaims) || !Array.isArray(value.matchupGuides) || !Array.isArray(value.workedExamples) || !Array.isArray(value.secondaryMissionFrameworks) || !Array.isArray(value.secondaryMissionFamilies) || !Array.isArray(value.secondaryMissionGuides) || !Array.isArray(value.secondaryDecisionExamples)) return null;
  if (!value.sources.every(isStrategySource)) return null;
  if (!value.scenarios.every(isScenario) || !value.forceDispositions.every(isForceDisposition) || !value.layoutContexts.every(isLayoutContext) || !value.ruleNodes.every(isRuleNode) || !value.unitProfiles.every(isUnitProfile) || !value.detachmentProfiles.every(isDetachmentProfile) || !value.synergies.every(isSynergy) || !value.metaSnapshots.every(isMetaSnapshot) || !value.recommendations.every(isRecommendation) || !value.victoryPlans.every(isVictoryPlan) || !value.referenceRosters.every(isReferenceRoster)) return null;
  if (!value.tacticalClaims.every(isTacticalClaim) || !value.matchupGuides.every(isMatchupGuide) || !value.workedExamples.every(isWorkedExample)) return null;
  if (!value.secondaryMissionFrameworks.every(isSecondaryMissionFramework) || !value.secondaryMissionFamilies.every(isSecondaryMissionFamily) || !value.secondaryMissionGuides.every(isSecondaryMissionGuide) || !value.secondaryDecisionExamples.every(isSecondaryDecisionExample)) return null;
  if (!hasResolvedCatalogProvenance(value.sources, value.catalogProvenanceSourceId, value.compatibility)) return null;
  if (!hasResolvedUnitDetachmentContexts(value.unitProfiles, value.detachmentProfiles)) return null;
  if (!hasResolvedRuleGraph(value.sources, value.ruleNodes, value.synergies)) return null;
  if (!hasResolvedVictoryPlans(value.sources, value.scenarios, value.ruleNodes, value.detachmentProfiles, value.synergies, value.victoryPlans, value.referenceRosters)) return null;
  if (!hasResolvedSecondaryMissionKnowledge(value as unknown as StrategyKnowledge)) return null;
  return value as unknown as StrategyKnowledge;
}

export function secondaryMissionGuide(knowledge: StrategyKnowledge | null, scenarioId: string): StrategySecondaryMissionGuide | null {
  return knowledge?.secondaryMissionGuides.find((guide) => guide.scenarioId === scenarioId
    && (guide.status === 'reviewed' || guide.status === 'published')) ?? null;
}

export function secondaryMissionFamilies(knowledge: StrategyKnowledge | null): StrategySecondaryMissionFamily[] {
  return knowledge?.secondaryMissionFamilies.filter((family) => family.status === 'reviewed' || family.status === 'published') ?? [];
}

export function secondaryDecisionExamplesForGuide(knowledge: StrategyKnowledge | null, guideId: string): StrategySecondaryDecisionExample[] {
  if (!knowledge) return [];
  const guide = knowledge.secondaryMissionGuides.find((entry) => entry.id === guideId);
  if (!guide || (guide.status !== 'reviewed' && guide.status !== 'published')) return [];
  const ids = new Set(guide.decisionExampleIds);
  return knowledge.secondaryDecisionExamples.filter((example) => ids.has(example.id)
    && (example.status === 'reviewed' || example.status === 'published'));
}

export function secondaryMissionRequirements(knowledge: StrategyKnowledge | null, scenarioId: string): StrategyMissionCapabilityRequirement[] {
  return secondaryMissionGuide(knowledge, scenarioId)?.capabilityRequirements ?? [];
}

export function claimsForSecondaryMissionGuide(knowledge: StrategyKnowledge | null, guideId: string): StrategyTacticalClaim[] {
  if (!knowledge) return [];
  const guide = knowledge.secondaryMissionGuides.find((entry) => entry.id === guideId);
  if (!guide || (guide.status !== 'reviewed' && guide.status !== 'published')) return [];
  const ids = new Set(guide.claimIds);
  return knowledge.tacticalClaims.filter((claim) => ids.has(claim.id)
    && (claim.status === 'reviewed' || claim.status === 'published'));
}

let strategyKnowledgePromise: Promise<StrategyKnowledge | null> | undefined;

export function loadStrategyKnowledge(): Promise<StrategyKnowledge | null> {
  strategyKnowledgePromise ??= fetch(STRATEGY_KNOWLEDGE_URL)
    .then((response) => response.ok ? response.json() : null)
    .then(strategyKnowledge)
    .catch(() => null);
  return strategyKnowledgePromise;
}

export function missionBrief(knowledge: StrategyKnowledge | null, missionPackId: string, cardSourcePath: string): StrategyScenario | null {
  return knowledge?.scenarios.find((scenario) => scenario.status === 'reviewed'
    && scenario.missionPackId === missionPackId
    && scenario.cardSourcePath === cardSourcePath
    && (scenario.kind === 'primary-card' || scenario.kind === 'secondary-card')) ?? null;
}

export function forceDispositionBrief(knowledge: StrategyKnowledge | null, missionPackId: string, sourcePath: string): StrategyForceDisposition | null {
  return knowledge?.forceDispositions.find((disposition) => disposition.status === 'reviewed'
    && disposition.missionPackId === missionPackId
    && disposition.sourcePath === sourcePath) ?? null;
}

export function primaryMissionsForDisposition(knowledge: StrategyKnowledge | null, disposition: string): StrategyScenario[] {
  if (!knowledge) return [];
  const normalizedDeck = normalizeDeck(disposition);
  const forceDisposition = knowledge.forceDispositions.find((entry) => entry.status === 'reviewed' && normalizeDeck(entry.deck) === normalizedDeck);
  if (!forceDisposition) return [];
  return knowledge.scenarios.filter((scenario) => scenario.status === 'reviewed'
    && scenario.kind === 'primary-card'
    && scenario.forceDispositionId === forceDisposition.id);
}

export function primaryMissionBrief(knowledge: StrategyKnowledge | null, missionId: string | undefined): StrategyScenario | null {
  if (!missionId) return null;
  return knowledge?.scenarios.find((scenario) => scenario.id === missionId && scenario.status === 'reviewed' && scenario.kind === 'primary-card') ?? null;
}

export function layoutContextBrief(knowledge: StrategyKnowledge | null, missionPackId: string, sourcePath: string): StrategyLayoutContext | null {
  return knowledge?.layoutContexts.find((context) => context.status === 'reviewed'
    && context.missionPackId === missionPackId
    && context.sourcePath === sourcePath) ?? null;
}

export function detachmentBrief(knowledge: StrategyKnowledge | null, catalogDetachmentId: string): StrategyDetachmentProfile | null {
  return knowledge?.detachmentProfiles.find((profile) => profile.status === 'reviewed' && profile.catalogDetachmentId === catalogDetachmentId) ?? null;
}

export function unitBriefs(knowledge: StrategyKnowledge | null, catalogUnitId: string): StrategyUnitProfile[] {
  return knowledge?.unitProfiles.filter((profile) => profile.status === 'reviewed' && profile.catalogUnitId === catalogUnitId) ?? [];
}

export function unitBrief(knowledge: StrategyKnowledge | null, catalogUnitId: string, detachmentProfileId: string): StrategyUnitProfile | null {
  return unitBriefs(knowledge, catalogUnitId).find((profile) => profile.detachmentProfileIds.includes(detachmentProfileId)) ?? null;
}

export function detachmentSynergies(knowledge: StrategyKnowledge | null, catalogDetachmentId: string): StrategySynergy[] {
  return knowledge?.synergies.filter((synergy) => synergy.status === 'reviewed'
    && synergy.participants.some((participant) => participant.type === 'detachment' && participant.catalogId === catalogDetachmentId)) ?? [];
}

export function unitSynergies(knowledge: StrategyKnowledge | null, catalogUnitId: string): StrategySynergy[] {
  return knowledge?.synergies.filter((synergy) => synergy.status === 'reviewed'
    && synergy.participants.some((participant) => participant.type === 'unit' && participant.catalogId === catalogUnitId)) ?? [];
}

export function victoryPlansForContext(knowledge: StrategyKnowledge | null, catalogDetachmentId: string, missionId: string | undefined): StrategyVictoryPlan[] {
  if (!knowledge || !missionId) return [];
  const profileIds = new Set(knowledge.detachmentProfiles
    .filter((profile) => profile.status === 'reviewed' && profile.catalogDetachmentId === catalogDetachmentId)
    .map((profile) => profile.id));
  return knowledge.victoryPlans.filter((plan) => plan.status === 'reviewed'
    && plan.scenarioId === missionId
    && profileIds.has(plan.detachmentProfileId));
}

export function referenceRostersForVictoryPlan(knowledge: StrategyKnowledge | null, victoryPlanId: string): StrategyReferenceRoster[] {
  return knowledge?.referenceRosters.filter((roster) => roster.status === 'reviewed' && roster.victoryPlanId === victoryPlanId) ?? [];
}

export function matchupGuides(knowledge: StrategyKnowledge | null): StrategyMatchupGuide[] {
  return knowledge?.matchupGuides.filter((guide) => guide.status === 'reviewed' || guide.status === 'published') ?? [];
}

export function matchupGuideForDispositions(knowledge: StrategyKnowledge | null, leftDeck: string, rightDeck: string): StrategyMatchupGuide | null {
  if (!knowledge) return null;
  const decks = [normalizeDeck(leftDeck), normalizeDeck(rightDeck)].sort();
  return matchupGuides(knowledge).find((guide) => guide.sides
    .map((side) => normalizeDeck(knowledge.forceDispositions.find((entry) => entry.id === side.forceDispositionId)?.deck ?? ''))
    .sort()
    .every((deck, index) => deck === decks[index])) ?? null;
}

export function claimsForGuide(knowledge: StrategyKnowledge | null, guideId: string): StrategyTacticalClaim[] {
  if (!knowledge) return [];
  const guide = knowledge.matchupGuides.find((entry) => entry.id === guideId);
  if (!guide) return [];
  const ids = new Set([...guide.globalClaimIds, ...guide.sides.flatMap((side) => side.claimIds)]);
  return knowledge.tacticalClaims.filter((claim) => ids.has(claim.id) && (claim.status === 'reviewed' || claim.status === 'published'));
}

export function workedExampleForGuide(knowledge: StrategyKnowledge | null, guideId: string): StrategyWorkedExample | null {
  const guide = knowledge?.matchupGuides.find((entry) => entry.id === guideId);
  if (!guide) return null;
  return knowledge?.workedExamples.find((example) => example.id === guide.workedExampleId && (example.status === 'reviewed' || example.status === 'published')) ?? null;
}

function normalizeRuleTerm(value: string): string {
  return value.trim().toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function ruleTargetMatchesUnit(target: StrategyRuleTarget, unit: StrategyRuleGraphUnit): boolean {
  if (target.faction && normalizeRuleTerm(target.faction) !== normalizeRuleTerm(unit.factionName)) return false;
  if (target.unitIds?.length && !target.unitIds.includes(unit.id)) return false;
  if (target.excludeUnitIds?.includes(unit.id)) return false;
  const keywords = new Set([...(unit.Keywords ?? []), ...(unit.FactionKeywords ?? [])].map(normalizeRuleTerm));
  if (target.allKeywords?.some((keyword) => !keywords.has(normalizeRuleTerm(keyword)))) return false;
  if (target.anyKeywords?.length && !target.anyKeywords.some((keyword) => keywords.has(normalizeRuleTerm(keyword)))) return false;
  return true;
}

function isRuleConfigured(rule: StrategyRuleNode, context: StrategyRuleGraphContext): boolean {
  const ownerSelected = rule.owner.type === 'detachment'
    ? context.detachmentIds.includes(rule.owner.catalogId)
    : context.unitIds.includes(rule.owner.catalogId);
  if (!ownerSelected) return false;
  if (!(rule.requiresParticipants ?? []).every((participant) => participant.type === 'detachment'
    ? context.detachmentIds.includes(participant.catalogId)
    : context.unitIds.includes(participant.catalogId))) return false;
  if (rule.activation !== 'selected-enhancement') return true;
  return (context.selectedEnhancements ?? []).some((selection) => selection.detachmentId === rule.owner.catalogId
    && selection.name === rule.catalogEnhancementName);
}

function synergyParticipantsSelected(synergy: StrategySynergy, context: StrategyRuleGraphContext): boolean {
  return synergy.participants.every((participant) => (participant.type === 'detachment'
    ? context.detachmentIds.includes(participant.catalogId)
    : context.unitIds.includes(participant.catalogId)));
}

export function resolveRuleGraph(
  knowledge: StrategyKnowledge | null,
  context: StrategyRuleGraphContext
): StrategyRuleGraphResolution {
  if (!knowledge) return { activeRules: [], activeSynergies: [], pendingSynergies: [] };
  const selectedUnits = context.units.filter((unit) => context.unitIds.includes(unit.id));
  const activeRules = knowledge.ruleNodes
    .filter((rule) => rule.status === 'reviewed' && isRuleConfigured(rule, context))
    .map((rule) => ({
      rule,
      eligibleUnitIds: selectedUnits.filter((unit) => ruleTargetMatchesUnit(rule.target, unit)).map((unit) => unit.id)
    }))
    .filter((entry) => entry.eligibleUnitIds.length > 0);
  const activeRuleIds = new Set(activeRules.map((entry) => entry.rule.id));
  const activeSynergies = knowledge.synergies.filter((synergy) => synergy.status === 'reviewed'
    && synergyParticipantsSelected(synergy, context)
    && synergy.ruleIds.every((ruleId) => activeRuleIds.has(ruleId)));
  const pendingSynergies = knowledge.synergies.flatMap((synergy) => {
    if (synergy.status !== 'reviewed'
      || !synergy.participants.some((participant) => participant.type === 'detachment' && context.detachmentIds.includes(participant.catalogId))) return [];
    const missingUnitIds = synergy.participants
      .filter((participant) => participant.type === 'unit' && !context.unitIds.includes(participant.catalogId))
      .map((participant) => participant.catalogId);
    const blockedRuleIds = synergy.ruleIds.filter((ruleId) => !activeRuleIds.has(ruleId));
    return missingUnitIds.length > 0 || blockedRuleIds.length > 0 ? [{ synergy, missingUnitIds, blockedRuleIds }] : [];
  });
  return { activeRules, activeSynergies, pendingSynergies };
}

function normalizeDeck(value: string): string {
  return value.trim().toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function forceDispositionAxisFit(knowledge: StrategyKnowledge | null, catalogDetachmentId: string, disposition: string): StrategyForceDispositionFit | null {
  const profile = detachmentBrief(knowledge, catalogDetachmentId);
  if (!knowledge || !profile) return null;
  const normalizedDeck = normalizeDeck(disposition);
  const forceDisposition = knowledge.forceDispositions.find((entry) => entry.status === 'reviewed' && normalizeDeck(entry.deck) === normalizedDeck);
  if (!forceDisposition) return null;
  const scenarios = knowledge.scenarios.filter((scenario) => scenario.status === 'reviewed'
    && scenario.kind === 'primary-card'
    && scenario.forceDispositionId === forceDisposition.id);
  if (scenarios.length === 0) return null;
  const axisCounts = new Map<string, number>();
  const sourceIds = new Set(profile.sourceIds);
  scenarios.forEach((scenario) => {
    scenario.victoryAxes.forEach((axis) => axisCounts.set(axis, (axisCounts.get(axis) ?? 0) + 1));
    scenario.sourceIds.forEach((sourceId) => sourceIds.add(sourceId));
  });
  const ratings = new Map(profile.axisRatings.map((rating) => [rating.axis, rating]));
  const matches = [...axisCounts.entries()]
    .flatMap(([axis, scenarioCount]) => {
      const rating = ratings.get(axis);
      return rating && rating.score >= 2 ? [{ axis, detachmentScore: rating.score, scenarioCount }] : [];
    })
    .sort((left, right) => right.detachmentScore - left.detachmentScore || right.scenarioCount - left.scenarioCount || left.axis.localeCompare(right.axis));
  const cautions = [...axisCounts.keys()]
    .filter((axis) => (ratings.get(axis)?.score ?? 0) < 2)
    .sort();
  return {
    profile,
    deck: forceDisposition.deck,
    scenarioCount: scenarios.length,
    matches,
    cautions,
    sourceIds: [...sourceIds]
  };
}
