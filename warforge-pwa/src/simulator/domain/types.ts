/**
 * Public, framework-free contracts for the tactical simulator.
 *
 * All distances use a signed integer amount of tenths of a millimetre.  One
 * inch is therefore exactly 254 world units.  Keeping this invariant in the
 * contracts makes the geometry layer deterministic across browsers.
 */

import type { CompatibilityReportV2 } from './full-game-compiler';

export const SIMULATOR_SCHEMA_VERSION = 'warforge-simulator/v1' as const;
export const SIMULATION_SAVE_SCHEMA_VERSION = 'warforge-simulation-save/v1' as const;
export const SIMULATION_SAVE_V2_SCHEMA_VERSION = 'warforge-simulation-save/v2' as const;
export const SIMULATION_SAVE_V3_SCHEMA_VERSION = 'warforge-simulation-save/v3' as const;
export const SIMULATION_SAVE_V4_SCHEMA_VERSION = 'warforge-simulation-save/v4' as const;
export const SIMULATION_SAVE_V5_SCHEMA_VERSION = 'warforge-simulation-save/v5' as const;
export const SIMULATION_SAVE_V6_SCHEMA_VERSION = 'warforge-simulation-save/v6' as const;
export const BATTLE_STATE_V1_SCHEMA_VERSION = 'warforge-battle-state/v1' as const;
export const MISSION_STATE_V1_SCHEMA_VERSION = 'warforge-mission-state/v1' as const;
export const RESOLUTION_QUEUE_V1_SCHEMA_VERSION = 'warforge-resolution-queue/v1' as const;
export const PENDING_CHARGE_V1_SCHEMA_VERSION = 'warforge-pending-charge/v1' as const;
export const FIGHT_PHASE_V1_SCHEMA_VERSION = 'warforge-fight-phase/v1' as const;
export const COMMAND_PHASE_V1_SCHEMA_VERSION = 'warforge-command-phase/v1' as const;
export const BATTLE_RESOURCES_V1_SCHEMA_VERSION = 'warforge-battle-resources/v1' as const;
export const TIMED_EFFECT_V1_SCHEMA_VERSION = 'warforge-timed-effect/v1' as const;
export const OBJECTIVE_MARKER_V1_SCHEMA_VERSION = 'warforge-objective-marker/v1' as const;
export const MISSION_SCORING_V1_SCHEMA_VERSION = 'warforge-mission-scoring/v1' as const;
export const COMPLETE_GAME_SESSION_V1_SCHEMA_VERSION = 'warforge-complete-game-session/v1' as const;
export const GAME_EVENT_STREAM_V1_SCHEMA_VERSION = 'warforge-game-event-stream/v1' as const;
export const SIMULATOR_VERSION = '0.1.0' as const;
export const WORLD_UNITS_PER_INCH = 254 as const;

export type WorldUnit = number;

export interface WorldPoint {
  readonly x: WorldUnit;
  readonly y: WorldUnit;
}

export interface SourceReferenceV1 {
  readonly sourceId: string;
  readonly version: string;
  /** Legacy transport field retained for save compatibility. See dateBasis. */
  readonly effectiveFrom: string;
  /** Distinguishes a true effective date from a dated local retrieval/archive. */
  readonly dateBasis?: 'effective' | 'retrieved';
  readonly retrievedAt?: string;
  readonly page?: number;
  /** Stable section reference when the source uses numbered rules. */
  readonly reference?: string;
}

export type ModifiedCharacteristicV1 =
  | 'movement' | 'toughness' | 'range' | 'attacks' | 'strength' | 'damage'
  | 'save' | 'invulnerable-save' | 'leadership' | 'objective-control'
  | 'weapon-skill' | 'ballistic-skill' | 'armour-penetration';

export type CharacteristicModifierOperationV1 = 'replace' | 'multiply' | 'add' | 'divide' | 'subtract';

/** A normalized, source-backed modifier. Natural-language parsing is deliberately excluded. */
export interface CharacteristicModifierV1 {
  readonly id: string;
  readonly operation: CharacteristicModifierOperationV1;
  readonly value: number;
  readonly source: SourceReferenceV1;
  readonly canBeIgnored?: boolean;
}

export interface CharacteristicModifierSetV1 {
  readonly modifiers: readonly CharacteristicModifierV1[];
  readonly ignoredModifierIds?: readonly string[];
}

export interface CharacteristicModifierPlanV1 extends CharacteristicModifierSetV1 {
  readonly characteristic: ModifiedCharacteristicV1;
  readonly baseValue: number;
}

export interface DieRollModifierV1 {
  readonly id: string;
  readonly value: number;
  readonly source: SourceReferenceV1;
  readonly canBeIgnored?: boolean;
}

export interface DieRollModifierSetV1 {
  readonly modifiers: readonly DieRollModifierV1[];
  readonly ignoredModifierIds?: readonly string[];
}

export interface DieRollModifierPlanV1 extends DieRollModifierSetV1 {
  readonly rollKind: 'hit' | 'wound' | 'other';
  /** Result after any reroll and before modifiers, per 02.02.01. */
  readonly unmodifiedRoll: number;
  readonly sides: number;
}

/**
 * Fixture-only M5 facts compiled into the trusted shooting environment. The
 * UI cannot construct or amend this plan during a game.
 */
export interface WeaponShootingModifierPlanV1 {
  readonly range?: CharacteristicModifierSetV1;
  readonly attacks?: CharacteristicModifierSetV1;
  readonly ballisticSkill?: CharacteristicModifierSetV1;
  readonly hitRoll?: DieRollModifierSetV1;
}

export interface SimulatorManifestV1 {
  readonly schemaVersion: typeof SIMULATOR_SCHEMA_VERSION;
  readonly simulatorVersion: string;
  readonly catalogFingerprint: string;
  readonly rulePackIds: readonly string[];
  readonly rulePackFingerprint: string;
  readonly scenarioId: string;
  readonly scenarioFingerprint: string;
  readonly coverageVersion: string;
}

export type BaseShapeV1 =
  | { readonly kind: 'circle'; readonly radius: WorldUnit }
  | { readonly kind: 'capsule'; readonly radius: WorldUnit; readonly length: WorldUnit }
  | { readonly kind: 'polygon'; readonly vertices: readonly WorldPoint[] };

export interface PhysicalModelProfileV1 {
  readonly schemaVersion: typeof SIMULATOR_SCHEMA_VERSION;
  readonly id: string;
  readonly displayName: string;
  readonly baseShape: BaseShapeV1;
  readonly height: WorldUnit;
  readonly visibilityPoints: readonly { readonly x: WorldUnit; readonly y: WorldUnit; readonly z: WorldUnit }[];
  readonly source: SourceReferenceV1;
  /** True only for an explicit Warforge convention rather than a source fact. */
  readonly isConvention?: boolean;
}

export interface TerrainVolumeV1 {
  readonly id: string;
  readonly footprint: readonly WorldPoint[];
  readonly height: WorldUnit;
  readonly elevation: WorldUnit;
  readonly occlusionBands: readonly { readonly minZ: WorldUnit; readonly maxZ: WorldUnit }[];
  readonly traits: readonly string[];
}

export interface TerrainLayoutV1 {
  readonly schemaVersion: typeof SIMULATOR_SCHEMA_VERSION;
  readonly id: string;
  readonly board: { readonly width: WorldUnit; readonly height: WorldUnit };
  readonly deploymentZones: readonly { readonly id: string; readonly polygon: readonly WorldPoint[] }[];
  readonly objectiveMarkers: readonly { readonly id: string; readonly position: WorldPoint; readonly radius: WorldUnit }[];
  readonly terrain: readonly TerrainVolumeV1[];
  readonly source: SourceReferenceV1;
}

export type RuleTrigger = 'command' | 'phase-start' | 'phase-end' | 'roll' | 'move' | 'attack';

export type RuleEffect =
  | { readonly kind: 'allow'; readonly action: string }
  | { readonly kind: 'deny'; readonly action: string; readonly reasonCode: string }
  | { readonly kind: 'modify-roll'; readonly modifier: number }
  | { readonly kind: 'request-decision'; readonly decisionKind: string };

/** A rule is executable data, not a natural-language instruction. */
export interface RuleDefinition {
  readonly id: string;
  readonly version: string;
  readonly source: SourceReferenceV1;
  readonly triggers: readonly RuleTrigger[];
  readonly guards: readonly { readonly field: string; readonly operator: 'equals' | 'includes' | 'exists'; readonly value?: string | number | boolean }[];
  readonly effects: readonly RuleEffect[];
}

export type CoverageStatus = 'covered' | 'partial' | 'unsupported';

export interface CoverageEntryV1 {
  readonly subjectType: 'rule' | 'unit' | 'fixture-unit' | 'weapon' | 'physical-profile' | 'terrain' | 'scenario';
  readonly subjectId: string;
  readonly status: CoverageStatus;
  readonly reason?: string;
  readonly source?: SourceReferenceV1;
}

export interface CoverageReportV1 {
  readonly schemaVersion: typeof SIMULATOR_SCHEMA_VERSION;
  readonly version: string;
  readonly entries: readonly CoverageEntryV1[];
}

/**
 * M3 sessions use synthetic fixture units while M4 compiles catalog units.
 * The explicit discriminator prevents real rosters from inheriting fixture
 * coverage merely because both use the shared UnitSetup transport.
 */
export interface UnitCoverageSubjectV1 {
  readonly subjectType: 'fixture-unit' | 'unit';
  readonly subjectId: string;
}

export interface RosterSimulationAdapter<TDraft = unknown> {
  readonly version: string;
  adapt(draft: TDraft): RosterSimulationAdaptation;
}

/** A deterministic, human-readable reason why a roster cannot be compiled. */
export interface RosterSimulationRefusal {
  readonly code: string;
  readonly subjectId: string;
  readonly reason: string;
  readonly expected?: string;
  readonly actual?: string;
}

export interface RosterSimulationAdaptation {
  readonly rosterId: string;
  readonly modelIds: readonly string[];
  readonly missingCoverage: readonly CoverageEntryV1[];
  /**
   * An adapter may validate roster identity without evaluating executable
   * simulator coverage. Consumers must not treat `missingCoverage: []` as a
   * coverage claim when this is `not-assessed`.
   */
  readonly coverageStatus?: 'not-assessed' | 'assessed';
  /**
   * Roster-identity failures are deliberately separate from rules coverage.
   * A structurally accepted roster still needs T03/T04 coverage before a
   * simulator session may start.
   */
  readonly refusals?: readonly RosterSimulationRefusal[];
}

export type SimulatorPhase = 'setup' | 'deployment' | 'command' | 'movement' | 'shooting' | 'charge' | 'fight' | 'completed';

export interface WorldBoundsV1 {
  readonly minX: WorldUnit;
  readonly minY: WorldUnit;
  readonly maxX: WorldUnit;
  readonly maxY: WorldUnit;
}

export interface DeploymentZoneV1 {
  readonly id: string;
  readonly playerId: string;
  /** Broad phase and legacy sessions use the bounds. */
  readonly bounds: WorldBoundsV1;
  /** Exact convex mission polygon. Omitted only by legacy rectangular sessions. */
  readonly polygon?: readonly WorldPoint[];
}

export interface DeploymentModelPoseV1 {
  readonly modelId: string;
  readonly position: WorldPoint;
  readonly orientationDegrees: number;
}

export interface DeploymentContainmentEvidenceV1 {
  readonly modelId: string;
  readonly board: 'inside' | 'touching-boundary';
  readonly zone: 'inside' | 'touching-boundary';
}

export interface DeploymentContactEvidenceV1 {
  readonly leftModelId: string;
  readonly rightModelId: string;
  readonly classification: 'separated' | 'touching';
  readonly distance: WorldUnit;
}

export interface DeploymentGeometryEvidenceV1 {
  readonly zoneId: string;
  readonly containment: readonly DeploymentContainmentEvidenceV1[];
  readonly contacts: readonly DeploymentContactEvidenceV1[];
  readonly coherency: {
    readonly maximumLinkDistance: WorldUnit;
    readonly requiredNeighbours: number;
    readonly maximumPairDistance: WorldUnit;
    readonly incoherentModelIds: readonly string[];
    readonly distantPairs: readonly { readonly leftModelId: string; readonly rightModelId: string; readonly distance: WorldUnit }[];
  };
}

export type BattleLifecycleV1 = 'deployment' | 'awaiting-first-player' | 'ready-to-start' | 'in-progress' | 'completed';

/** Durable battle-loop state. M7 will advance it exclusively through events. */
export interface BattleStateV1 {
  readonly schemaVersion: typeof BATTLE_STATE_V1_SCHEMA_VERSION;
  readonly lifecycle: BattleLifecycleV1;
  readonly maxBattleRounds: number;
  readonly battleRound: number;
  readonly turnNumber: number;
  readonly playerIds: readonly string[];
  readonly boardBounds: WorldBoundsV1;
  readonly attackerPlayerId: string;
  readonly defenderPlayerId: string;
  readonly deploymentZones: readonly DeploymentZoneV1[];
  readonly nextDeploymentPlayerId: string | null;
  readonly deployedUnitIds: readonly string[];
  readonly deploymentOrder: readonly string[];
  readonly firstPlayerId: string | null;
  readonly activePlayerId: string | null;
  readonly phase: SimulatorPhase;
}

export type CommandPhaseStageV1 = 'start' | 'gain-base-cp' | 'battle-shock' | 'abilities' | 'end' | 'complete';

/** Serializable 08.01–08.05 progression; the queue preserves the 15.04 window. */
export interface CommandPhaseStateV1 {
  readonly schemaVersion: typeof COMMAND_PHASE_V1_SCHEMA_VERSION;
  readonly activePlayerId: string;
  readonly stage: CommandPhaseStageV1;
  readonly pendingBattleShockUnitIds: readonly string[];
  readonly testedBattleShockUnitIds: readonly string[];
}

export interface BattleMomentV1 {
  readonly battleRound: number;
  readonly turnNumber: number;
  readonly phase: SimulatorPhase;
  readonly boundary: 'start' | 'end';
}

export interface TimedEffectExpirationV1 {
  readonly moment: BattleMomentV1;
  readonly effectIds: readonly string[];
}

/** Source-backed modifier kept in state until its exact boundary is reached. */
export interface TimedEffectV1 {
  readonly schemaVersion: typeof TIMED_EFFECT_V1_SCHEMA_VERSION;
  readonly id: string;
  readonly targetUnitId: string;
  readonly modifier: Omit<CharacteristicModifierV1, 'source'> & {
    readonly characteristic: ModifiedCharacteristicV1;
    readonly source: SourceReferenceV1;
  };
  readonly appliedAt: BattleMomentV1;
  readonly expiresAt: BattleMomentV1 | null;
  readonly sourceRefs: readonly SourceReferenceV1[];
}

export type CoveredCoreStratagemIdV1 = 'insane-bravery' | 'counter-offensive';

/** Immutable proof of one accepted stratagem use and its paid CP cost. */
export interface StratagemUseV1 {
  readonly eventId: string;
  readonly stratagemId: CoveredCoreStratagemIdV1;
  readonly playerId: string;
  readonly targetUnitId: string;
  readonly cost: number;
  readonly battleRound: number;
  readonly turnNumber: number;
  readonly phase: SimulatorPhase;
}

/** Durable resources and statuses shared by every phase of a V6 battle. */
export interface BattleResourcesV1 {
  readonly schemaVersion: typeof BATTLE_RESOURCES_V1_SCHEMA_VERSION;
  readonly commandPointsByPlayerId: Readonly<Record<string, number>>;
  readonly battleShockedUnitIds: readonly string[];
  readonly timedEffects: readonly TimedEffectV1[];
  readonly stratagemUses: readonly StratagemUseV1[];
}

export interface BattleShockTestResultV1 {
  readonly unitId: string;
  readonly reason: 'command-phase' | 'desperate-escape';
  readonly roll: readonly [number, number];
  readonly total: number;
  readonly leadership: number;
  readonly passed: boolean;
  readonly wasBattleShocked: boolean;
  readonly atOrBelowHalfStrength: boolean;
}

/** Flat 40 mm marker used only when an objective is not a terrain zone. */
export interface ObjectiveMarkerV1 {
  readonly schemaVersion: typeof OBJECTIVE_MARKER_V1_SCHEMA_VERSION;
  readonly id: string;
  readonly kind: 'objective-marker';
  readonly center: WorldPoint;
  readonly elevation: WorldUnit;
  readonly diameter: 400;
  readonly horizontalRange: 762;
  readonly verticalRange: 1_270;
  readonly sourceRefs: readonly SourceReferenceV1[];
}

export interface ObjectiveModelControlEvidenceV1 {
  readonly modelId: string;
  readonly unitId: string;
  readonly playerId: string;
  readonly horizontalDistance: WorldUnit;
  readonly verticalDistance: WorldUnit;
  readonly withinRange: boolean;
  readonly baseObjectiveControl: number;
  readonly effectiveObjectiveControl: number;
  readonly battleShocked: boolean;
}

export interface ObjectiveControlResolutionV1 {
  readonly objectiveId: string;
  readonly checkpoint: {
    readonly battleRound: number;
    readonly turnNumber: number;
    readonly phase: SimulatorPhase;
    readonly boundary: 'phase-end' | 'turn-end';
  };
  readonly controlLevelByPlayerId: Readonly<Record<string, number>>;
  readonly controllerPlayerId: string | null;
  readonly tied: boolean;
  readonly controllingUnitIdsByPlayerId: Readonly<Record<string, readonly string[]>>;
  readonly modelEvidence: readonly ObjectiveModelControlEvidenceV1[];
}

export interface MissionStateV1 {
  readonly schemaVersion: typeof MISSION_STATE_V1_SCHEMA_VERSION;
  readonly missionId: string;
  readonly missionDefinitionFingerprint: string;
  readonly lifecycle: 'ready' | 'in-progress' | 'completed';
  readonly objectiveMarkerIds: readonly string[];
  /** Empty only when replaying a pre-M8 V6 journal. */
  readonly objectiveMarkers: readonly ObjectiveMarkerV1[];
  readonly objectiveControllers: Readonly<Record<string, string | null>>;
  readonly latestObjectiveControlById: Readonly<Record<string, ObjectiveControlResolutionV1 | null>>;
  readonly objectiveControlEventIds: readonly string[];
  readonly scoresByPlayerId: Readonly<Record<string, number>>;
  readonly scoreEventIds: readonly string[];
  /** Absent on journals created before M9 and explicit on executable scoring sessions. */
  readonly scoringProfileId?: 'closed-complete-game-disruption-v1';
  /** Canonical objective roles compiled into the session, never supplied by a score event. */
  readonly objectiveRoleById?: Readonly<Record<string, MissionObjectiveRoleV1>>;
  readonly scoreBreakdownByPlayerId?: Readonly<Record<string, MissionScoreBreakdownV1>>;
  readonly scoredCheckpointIds?: readonly string[];
  readonly scoredAssassinationModelIds?: readonly string[];
  readonly finalResult?: MissionFinalResultV1 | null;
}

export type MissionScoringCheckpointV1 = 'end-of-own-command-phase' | 'end-of-own-turn';
export type MissionObjectiveRoleV1 = 'attacker-home' | 'defender-home' | 'no-mans-land-1' | 'no-mans-land-2' | 'centre-1' | 'centre-2';
export type MissionTableQuarterV1 = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
export type MissionScoreCategoryV1 = 'primary' | 'secondary' | 'battle-ready';

export interface MissionScoreBreakdownV1 {
  readonly primaryVp: number;
  readonly secondaryVp: number;
  readonly battleReadyVp: number;
  readonly fixedSecondaryVpById: Readonly<Record<'assassination' | 'engage-on-all-fronts', number>>;
  readonly primaryVpByBattleRound: Readonly<Record<string, number>>;
  readonly secondaryVpByBattleRound: Readonly<Record<string, number>>;
  readonly totalVp: number;
}

export interface MissionScoreEventV1 {
  readonly id: string;
  readonly playerId: string;
  readonly battleRound: number;
  readonly turnNumber: number;
  readonly checkpoint: MissionScoringCheckpointV1;
  readonly category: MissionScoreCategoryV1;
  readonly cardId: 'outmanoeuvre' | 'assassination' | 'engage-on-all-fronts' | 'battle-ready-army';
  readonly scoringWindowId: string;
  readonly rawVp: number;
  readonly appliedVp: number;
  readonly caps: {
    readonly categoryRemainingBefore: number;
    readonly battleRoundRemainingBefore: number | null;
    readonly fixedSecondaryRemainingBefore: number | null;
  };
  readonly evidence: {
    readonly controlledObjectiveIds?: readonly string[];
    readonly destroyedCharacterModelIds?: readonly string[];
    readonly eligibleUnitIdsByQuarter?: Readonly<Partial<Record<MissionTableQuarterV1, readonly string[]>>>;
    readonly battleReady?: boolean;
  };
  readonly sourceRefs: readonly SourceReferenceV1[];
}

/** Public generic name used by the event-sourced scoring contract. */
export type ScoreEventV1 = MissionScoreEventV1;

export interface MissionFinalResultV1 {
  readonly battleRound: 5;
  readonly scoresByPlayerId: Readonly<Record<string, number>>;
  readonly outcome: 'winner' | 'draw';
  readonly winnerPlayerId: string | null;
  readonly sourceRefs: readonly SourceReferenceV1[];
}

export interface MissionScoringEvidenceV1 {
  readonly schemaVersion: typeof MISSION_SCORING_V1_SCHEMA_VERSION;
  readonly objectiveRoleById: Readonly<Record<string, MissionObjectiveRoleV1>>;
  readonly engageQuarterByUnitId: Readonly<Record<string, MissionTableQuarterV1>>;
  readonly battleReadyByPlayerId: Readonly<Record<string, boolean>> | null;
}

/** Trusted app-owned inputs; no VP or scoring verdict can be supplied by the UI. */
export interface MissionScoringEnvironmentV1 {
  readonly fingerprint: string;
  readonly physicalProfiles: Readonly<Record<string, PhysicalModelProfileV1>>;
  readonly battleReadyByPlayerId?: Readonly<Record<string, boolean>>;
}

export type ResolutionWindowKindV1 = 'phase-start' | 'phase-end' | 'reaction' | 'decision' | 'attack' | 'damage' | 'score';

/** A queue entry is identity and timing only; executable effects remain typed events. */
export interface ResolutionQueueEntryV1 {
  readonly id: string;
  readonly kind: ResolutionWindowKindV1;
  readonly ownerPlayerId: string | null;
  readonly sourceRuleIds: readonly string[];
  readonly openedByEventId: string;
}

export interface ResolutionQueueV1 {
  readonly schemaVersion: typeof RESOLUTION_QUEUE_V1_SCHEMA_VERSION;
  readonly activeEntryId: string | null;
  readonly entries: readonly ResolutionQueueEntryV1[];
  readonly resolvedEntryIds: readonly string[];
}

/**
 * Trusted, compiled input for a complete-game session. A draft or incomplete
 * compatibility report cannot be represented as an executable setup.
 */
export interface CompleteGameSessionSetupV1 {
  readonly schemaVersion: typeof COMPLETE_GAME_SESSION_V1_SCHEMA_VERSION;
  readonly eventStreamSchemaVersion: typeof GAME_EVENT_STREAM_V1_SCHEMA_VERSION;
  readonly compatibility: {
    readonly status: 'compatible';
    readonly reportVersion: string;
    readonly reportFingerprint: string;
    readonly coverageScope: string;
    readonly coverageVersion: string;
    /** Complete canonical proof; metadata above are indexed copies, not authority. */
    readonly report: CompatibilityReportV2;
  };
  readonly battle: {
    readonly maxBattleRounds: number;
    readonly playerIds: readonly string[];
    readonly boardBounds: WorldBoundsV1;
    readonly attackerPlayerId: string;
    readonly defenderPlayerId: string;
    readonly deploymentZones: readonly DeploymentZoneV1[];
  };
  readonly mission: {
    readonly id: string;
    readonly definitionFingerprint: string;
    readonly objectiveMarkerIds: readonly string[];
    /** Additive M8 geometry; old V6 sessions may omit it. */
    readonly objectiveMarkers?: readonly ObjectiveMarkerV1[];
    /** Additive M9 opt-in; omission preserves pre-M9 V6 replay semantics. */
    readonly scoringProfileId?: 'closed-complete-game-disruption-v1';
    /** Required with scoringProfileId and bound into both executable fingerprints. */
    readonly objectiveRoleById?: Readonly<Record<string, MissionObjectiveRoleV1>>;
  };
}

export interface PlayerSetup {
  readonly id: string;
  readonly displayName: string;
  readonly rosterId: string;
}

export interface ModelSetup {
  readonly id: string;
  readonly playerId: string;
  readonly profileId: string;
  readonly position: WorldPoint;
  readonly orientationDegrees: number;
}

/**
 * A closed executable weapon profile.  It deliberately contains numbers only:
 * natural-language weapon abilities are outside the M3 shooting slice.
 */
/**
 * Closed, source-backed attack-volume abilities.  Natural-language keywords
 * are deliberately not interpreted by the engine.
 */
export type WeaponAttackVolumeAbilityV1 =
  | { readonly kind: 'rapid-fire'; readonly value: number; readonly source: SourceReferenceV1 }
  | { readonly kind: 'blast'; readonly value: number; readonly source: SourceReferenceV1 };

/**
 * Closed weapon-ability facts.  They are compiled from the approved fixture
 * vocabulary; the engine never interprets a catalogue label while resolving
 * an attack.  Each ability kind may occur at most once on a weapon profile.
 */
export type WeaponKeywordV1 =
  | { readonly kind: 'hazardous'; readonly source: SourceReferenceV1 }
  | { readonly kind: 'devastating-wounds'; readonly source: SourceReferenceV1 }
  | { readonly kind: 'melta'; readonly value: number; readonly source: SourceReferenceV1 }
  | { readonly kind: 'ignores-cover'; readonly source: SourceReferenceV1 }
  | { readonly kind: 'torrent'; readonly source: SourceReferenceV1 }
  | { readonly kind: 'pistol'; readonly source: SourceReferenceV1 }
  | { readonly kind: 'anti'; readonly targetKeyword: string; readonly criticalWound: 2 | 3 | 4 | 5 | 6; readonly source: SourceReferenceV1 }
  | { readonly kind: 'sustained-hits'; readonly value: number; readonly source: SourceReferenceV1 }
  | { readonly kind: 'lethal-hits'; readonly source: SourceReferenceV1 }
  /** [JUMELÉ] grants an optional reroll of each individual wound roll. */
  | { readonly kind: 'twin-linked'; readonly source: SourceReferenceV1 }
  | { readonly kind: 'one-shot'; readonly source: SourceReferenceV1 };

/**
 * M5 accepts this compact source notation only after the rule-layer parser
 * validates it. M3/M4 profiles continue to use plain numeric characteristics.
 */
export type RandomCharacteristicNotationV1 = string;

export interface WeaponProfileV1 {
  readonly id: string;
  readonly displayName: string;
  /** Legacy profiles are ranged; T04 marks melee profiles explicitly. */
  readonly weaponType?: 'ranged' | 'melee';
  readonly range: WorldUnit;
  readonly attacks: number;
  readonly ballisticSkill: number;
  readonly strength: number;
  readonly armourPenetration: number;
  readonly damage: number;
  /** M5 fixture extension; when present it supersedes the numeric A value at attack generation. */
  readonly randomAttacks?: RandomCharacteristicNotationV1;
  /** M5 fixture extension; when present it supersedes the numeric D value at allocation. */
  readonly randomDamage?: RandomCharacteristicNotationV1;
  readonly modifierPlan?: WeaponShootingModifierPlanV1;
  /** Optional only for legacy M3/M4 profiles with no covered volume ability. */
  readonly attackVolumeAbilities?: readonly WeaponAttackVolumeAbilityV1[];
  /** Optional only for legacy M3/M4 profiles with no covered triggered ability. */
  readonly weaponKeywords?: readonly WeaponKeywordV1[];
  readonly sourceRefs: readonly SourceReferenceV1[];
}

export interface ModelWeaponAssignmentV1 {
  readonly modelId: string;
  readonly weaponProfileId: string;
  readonly quantity: number;
}

/**
 * One physical ranged weapon selected during the closed T05.2 split-fire
 * declaration.  The index is local to the model/profile assignment and makes
 * two identical printed weapons separately addressable without interpreting
 * alternative weapon profiles.
 */
export interface SplitFireWeaponDeclarationV1 {
  readonly id: string;
  readonly firingModelId: string;
  readonly weaponProfileId: string;
  readonly weaponInstanceIndex: number;
  readonly targetUnitId: string;
}

/** Immutable unit composition used only by the session-setup event. */
export interface UnitSetup {
  readonly id: string;
  /** Stable internal unit identity retained for existing M3 snapshots. */
  readonly fixtureId: string;
  /** Defaults to the legacy fixture-unit subject when omitted. */
  readonly coverageSubject?: UnitCoverageSubjectV1;
  readonly playerId: string;
  /** Maximum normal movement in world units; mandatory for complete-game sessions. */
  readonly movement?: WorldUnit;
  /** Actual model IDs, not a count or a profile-derived approximation. */
  readonly modelIds: readonly string[];
  readonly keywords: readonly string[];
  readonly toughness: number;
  readonly save: number;
  readonly woundsPerModel: number;
  /** Optional only for pre-M8 sessions; mandatory for a complete-game session. */
  readonly leadership?: number;
  /** Optional only for pre-M8 sessions; M8-T02 consumes it for objective control. */
  readonly objectiveControl?: number;
  readonly weaponProfiles: readonly WeaponProfileV1[];
  /** Optional for setup compatibility; omission means no model is authorized to fire it. */
  readonly weaponAssignments?: readonly ModelWeaponAssignmentV1[];
  /** T04 fixture-only model defence facts; omitted from every M4 session. */
  readonly extendedDefence?: Readonly<Record<string, ExtendedDefenceFixtureV1>>;
  readonly sourceRefs: readonly SourceReferenceV1[];
}

export interface SessionSetup {
  readonly manifest: SimulatorManifestV1;
  readonly players: readonly PlayerSetup[];
  readonly models: readonly ModelSetup[];
  /** Optional so existing M1 sessions remain serializable and replayable. */
  readonly units?: readonly UnitSetup[];
  /** Binds shooting journals to the trusted compiled environment used at setup. */
  readonly shootingEnvironmentFingerprint?: string;
  /** Present only after CompatibilityReportV2 has accepted the full closed pilot. */
  readonly completeGame?: CompleteGameSessionSetupV1;
}

export interface ModelState {
  readonly id: string;
  readonly playerId: string;
  readonly profileId: string;
  readonly position: WorldPoint;
  readonly orientationDegrees: number;
  readonly active: boolean;
}

/** Mutable battlefield condition for one actual model, owned by UnitState. */
export interface UnitModelState {
  readonly id: string;
  readonly wounds: number;
  readonly active: boolean;
}

/** Fixture-only T04 defence facts. They are deliberately absent from M4. */
export interface ExtendedDefenceFixtureV1 {
  readonly invulnerableSave?: 2 | 3 | 4 | 5 | 6;
  readonly feelNoPain?: 2 | 3 | 4 | 5 | 6;
  /** Characters never share an allocation group in the closed T04 fixture. */
  readonly isCharacter?: boolean;
  readonly allocationGroupId?: string;
  readonly source: SourceReferenceV1;
}

/**
 * Deterministic state for one unit.  The ordered list preserves actual model
 * identities; damage allocation never relies on an implicit model count.
 */
export interface UnitState {
  readonly id: string;
  readonly fixtureId: string;
  /** Retained from setup so fixture-only rules cannot silently reach M4 units. */
  readonly coverageSubject?: UnitCoverageSubjectV1;
  readonly playerId: string;
  readonly movement?: WorldUnit;
  readonly keywords: readonly string[];
  readonly toughness: number;
  readonly save: number;
  readonly woundsPerModel: number;
  readonly initialStrength: number;
  readonly leadership?: number;
  readonly objectiveControl?: number;
  readonly weaponProfiles: readonly WeaponProfileV1[];
  readonly weaponAssignments: readonly ModelWeaponAssignmentV1[];
  readonly sourceRefs: readonly SourceReferenceV1[];
  readonly models: readonly UnitModelState[];
  /** Keyed by model identity; only accepted for fixture-unit sessions in V4. */
  readonly extendedDefence?: Readonly<Record<string, ExtendedDefenceFixtureV1>>;
}

export interface PrngStateV1 {
  readonly algorithm: 'mulberry32';
  readonly version: 1;
  readonly seed: number;
  readonly value: number;
  readonly draws: number;
}

export type UnitMovementTypeV1 = 'remain-stationary' | 'normal' | 'advance' | 'fall-back';
export type FallBackModeV1 = 'good-order' | 'desperate-escape';

export interface UnitMovementPathV1 {
  readonly modelId: string;
  /** Polyline points after the model's current position; an empty path leaves it in place. */
  readonly waypoints: readonly WorldPoint[];
  readonly finalOrientationDegrees?: number;
}

export interface UnitTurnStatusV1 {
  readonly selectedForMovement: boolean;
  readonly movementType: UnitMovementTypeV1 | null;
  readonly advanced: boolean;
  readonly fellBack: boolean;
  readonly fallBackMode?: FallBackModeV1;
  /** M8 consumes this immediate rule consequence once Battle-shock is executable. */
  readonly battleShockTestRequired?: boolean;
  readonly chargeDeclared?: true;
  readonly chargeResolved?: true;
  readonly charged?: boolean;
  readonly chargeTargetUnitIds?: readonly string[];
  readonly fightsFirstFromCharge?: true;
}

export interface ChargeCandidateV1 {
  readonly unitId: string;
  readonly edgeToEdgeDistance: WorldUnit;
  readonly withinChargeRoll: boolean;
}

/** Serializable continuation opened after the authoritative 2D6 charge roll. */
export interface PendingChargeV1 {
  readonly schemaVersion: typeof PENDING_CHARGE_V1_SCHEMA_VERSION;
  readonly playerId: string;
  readonly unitId: string;
  readonly roll: readonly [number, number];
  readonly maximumDistance: WorldUnit;
  readonly candidates: readonly ChargeCandidateV1[];
  readonly environmentFingerprint: string;
  readonly prngBefore: PrngStateV1;
  readonly prngAfter: PrngStateV1;
  readonly sourceRefs: readonly SourceReferenceV1[];
}

export type FightStageV1 = 'pile-in' | 'fight' | 'consolidation' | 'complete';
export type FightSelectionBandV1 = 'fights-first' | 'remaining';

export interface FightPhaseStateV1 {
  readonly schemaVersion: typeof FIGHT_PHASE_V1_SCHEMA_VERSION;
  readonly stage: FightStageV1;
  readonly activePlayerId: string;
  readonly currentPlayerId: string | null;
  readonly passedPlayerIds: readonly string[];
  readonly piledInUnitIds: readonly string[];
  readonly eligibleAtFightStartUnitIds: readonly string[];
  readonly selectionBand: FightSelectionBandV1 | null;
  readonly foughtUnitIds: readonly string[];
  readonly consolidatedUnitIds: readonly string[];
  /** Present only after 15.12; the selected unit must fight next. */
  readonly forcedNextFightUnitId?: string;
}

export type FightMovementKindV1 = 'pile-in' | 'consolidation';

export interface DecisionRequest {
  readonly id: string;
  readonly kind: string;
  readonly playerId: string;
  readonly prompt: string;
  readonly options: readonly { readonly id: string; readonly label: string }[];
  readonly sourceRuleIds: readonly string[];
}

export interface RuleRejection {
  readonly code: string;
  readonly message: string;
  readonly commandId: string;
  readonly sourceRuleIds: readonly string[];
  readonly details?: Readonly<Record<string, string | number | boolean>>;
}

interface CommandBase {
  readonly id: string;
  readonly actorId: string;
}

export type GameCommand =
  | (CommandBase & { readonly type: 'setup-session'; readonly session: SessionSetup })
  | (CommandBase & { readonly type: 'deploy-unit'; readonly unitId: string; readonly modelPoses: readonly DeploymentModelPoseV1[] })
  | (CommandBase & { readonly type: 'determine-first-player' })
  | (CommandBase & { readonly type: 'start-battle' })
  | (CommandBase & { readonly type: 'advance-battle-phase' })
  | (CommandBase & { readonly type: 'resolve-mission-scoring' })
  | (CommandBase & { readonly type: 'resolve-command-stage' })
  | (CommandBase & { readonly type: 'resolve-battle-shock-test'; readonly unitId: string })
  | (CommandBase & { readonly type: 'use-insane-bravery'; readonly unitId: string })
  | (CommandBase & { readonly type: 'use-counter-offensive'; readonly unitId: string })
  | (CommandBase & {
    readonly type: 'move-unit';
    readonly unitId: string;
    readonly movementType: UnitMovementTypeV1;
    readonly fallBackMode?: FallBackModeV1;
    /** Player-declared priority for otherwise discretionary mortal-wound allocations. */
    readonly desperateEscapeAllocationOrder?: readonly string[];
    readonly paths: readonly UnitMovementPathV1[];
  })
  | (CommandBase & { readonly type: 'pass-fight-window' })
  | (CommandBase & {
    readonly type: 'resolve-fight-movement';
    readonly movementKind: FightMovementKindV1;
    readonly unitId: string;
    readonly targetUnitIds: readonly string[];
    readonly paths: readonly UnitMovementPathV1[];
  })
  | (CommandBase & {
    readonly type: 'resolve-basic-melee';
    readonly attackerUnitId: string;
    readonly targetUnitId: string;
    readonly weaponProfileId: string;
  })
  | (CommandBase & { readonly type: 'resolve-empty-fight'; readonly unitId: string })
  | (CommandBase & { readonly type: 'declare-charge'; readonly unitId: string })
  | (CommandBase & {
    readonly type: 'resolve-charge';
    readonly unitId: string;
    readonly proceed: false;
  })
  | (CommandBase & {
    readonly type: 'resolve-charge';
    readonly unitId: string;
    readonly proceed: true;
    readonly targetUnitIds: readonly string[];
    readonly paths: readonly UnitMovementPathV1[];
  })
  | (CommandBase & { readonly type: 'transition-phase'; readonly nextPhase: SimulatorPhase })
  | (CommandBase & { readonly type: 'move-model'; readonly modelId: string; readonly to: WorldPoint; readonly orientationDegrees?: number })
  | (CommandBase & { readonly type: 'roll-dice'; readonly rollId: string; readonly sides: number; readonly count: number; readonly reason: string })
  /**
   * Spatial and attack-volume facts are never command input; trusted
   * orchestration derives them from the state.  `weaponProfileId` is retained
   * for M3/M4 compatibility; a M5 declaration uses `weaponProfileIds`.
   */
  | (CommandBase & {
    readonly type: 'resolve-basic-shooting';
    readonly attackerUnitId: string;
    readonly targetUnitId: string;
    readonly weaponProfileId?: string;
    readonly weaponProfileIds?: readonly string[];
  })
  /**
   * Fixture-only T05.2 declaration.  The UI selects physical instances and
   * targets, but range, visibility, cover and every dice result remain
   * authoritative orchestration facts.
   */
  | (CommandBase & {
    readonly type: 'resolve-split-fire';
    readonly attackerUnitId: string;
    readonly assignments: readonly SplitFireWeaponDeclarationV1[];
    /** Ordered assignment IDs; all declared instances must occur exactly once. */
    readonly resolutionOrder: readonly string[];
  })
  /** Target only: the trusted M4 environment derives the selected Oath variant. */
  | (CommandBase & { readonly type: 'select-oath-of-moment-target'; readonly targetUnitId: string })
  | (CommandBase & { readonly type: 'request-decision'; readonly decision: DecisionRequest })
  | (CommandBase & { readonly type: 'resolve-decision'; readonly decisionId: string; readonly optionId: string });

interface EventBase {
  readonly id: string;
  readonly commandId: string;
}

export interface BasicShootingRangeEvidence {
  readonly edgeToEdgeDistance: WorldUnit;
  readonly weaponRange: WorldUnit;
  readonly attackerModelId: string;
  readonly targetModelId: string;
}

export interface BasicShootingLineOfSightEvidence {
  readonly visible: boolean;
  readonly reason: 'clear' | 'blocked' | 'degenerate';
  readonly attackerModelId?: string;
  readonly targetModelId?: string;
  readonly ray?: {
    readonly from: { readonly x: WorldUnit; readonly y: WorldUnit; readonly z: WorldUnit };
    readonly to: { readonly x: WorldUnit; readonly y: WorldUnit; readonly z: WorldUnit };
  };
  readonly blockerIds: readonly string[];
}

export interface BasicShootingCoverEvidence {
  readonly applies: boolean;
  readonly ballisticSkillPenalty: number;
  readonly sourceRuleIds: readonly string[];
  readonly terrainZoneIds: readonly string[];
  readonly sourceRefs: readonly SourceReferenceV1[];
}

export interface BasicShootingEvidence {
  readonly range: BasicShootingRangeEvidence;
  readonly lineOfSight: BasicShootingLineOfSightEvidence;
  readonly cover: BasicShootingCoverEvidence;
  /** Modifiers derived by trusted orchestration; never supplied by the UI. */
  readonly attackModifiers: {
    readonly rerollFailedHits: boolean;
    readonly woundRollModifier: 0 | 1;
    readonly sourceRuleIds: readonly string[];
    readonly sourceRefs: readonly SourceReferenceV1[];
  };
  readonly weapon: {
    readonly firingModelIds: readonly string[];
    readonly weaponCount: number;
    /** Null when independently generated random A values differ by weapon. */
    readonly attacksPerWeapon: number | null;
    readonly totalAttacks: number;
  };
}

export interface BasicShootingDieStep {
  readonly attackIndex: number;
  readonly outcome: 'missed' | 'failed-to-wound' | 'saved' | 'damaged' | 'destroyed' | 'lost-no-target';
  readonly hitRoll?: number;
  /** Original failed hit when `hitRoll` is the covered reroll result. */
  readonly initialHitRoll?: number;
  readonly hit: boolean;
  readonly criticalHit: boolean;
  /** The original critical hit that created this additional sustained hit. */
  readonly generatedByCriticalHitOfAttackIndex?: number;
  readonly woundRoll?: number;
  /** Original wound D6 when `woundRoll` is the journaled reroll result. */
  readonly initialWoundRoll?: number;
  readonly wound?: boolean;
  readonly criticalWound?: boolean;
  readonly saveRoll?: number;
  readonly saved?: boolean;
  readonly damage?: number;
  /** Present only when this attack resolved a variable D characteristic. */
  readonly randomDamage?: BasicShootingRandomCharacteristicEvidence;
  readonly allocatedModelId?: string;
  readonly destroyedModelId?: string;
}

export interface BasicShootingHitRoll {
  readonly attackIndex: number;
  /** Original D6 result. */
  readonly roll: number;
  /** Present only when a covered rule rerolls a failed hit. */
  readonly rerollRoll?: number;
  /** Final die after the covered post-reroll modifier plan, when one applies. */
  readonly modifiedRoll?: number;
  readonly hit: boolean;
  readonly critical: boolean;
  /** Additional non-critical hits created by this critical hit. */
  readonly sustainedHitsGenerated?: number;
}

export interface BasicShootingWoundRoll {
  readonly attackIndex: number;
  /** Omitted when [LETHAL HITS] chose to wound automatically. */
  readonly roll?: number;
  /** Replacement D6 after the one permitted, journaled wound reroll. */
  readonly rerollRoll?: number;
  readonly wound: boolean;
  readonly critical: boolean;
  /** Automatic wounds are explicitly non-critical (24.23 design note). */
  readonly automatic?: boolean;
  readonly generatedByCriticalHitOfAttackIndex?: number;
}

export interface BasicShootingSaveRoll {
  readonly attackIndex: number;
  readonly roll: number;
  readonly saved: boolean;
}

export interface BasicShootingAllocationRecord {
  readonly attackIndex: number;
  readonly saveRoll: number;
  readonly outcome: 'saved' | 'damaged' | 'destroyed' | 'lost-no-target';
  readonly damage?: number;
  /** Present only when this allocation resolved a variable D characteristic. */
  readonly randomDamage?: BasicShootingRandomCharacteristicEvidence;
  readonly allocatedModelId?: string;
  readonly destroyedModelId?: string;
}

/** Event-ready result of one covered random A or D characteristic. */
export interface BasicShootingRandomCharacteristicEvidence {
  readonly expression: RandomCharacteristicNotationV1;
  readonly dice: readonly number[];
  readonly value: number;
  readonly sourceRefs: readonly SourceReferenceV1[];
}

export interface BasicShootingResult {
  readonly hitRequired: number;
  readonly woundRequired: number;
  readonly saveRequired: number;
  readonly hits: number;
  readonly wounds: number;
  readonly failedSaves: number;
  readonly damageInflicted: number;
  readonly modelsDestroyed: number;
  readonly remainingModels: number;
  readonly remainingWoundsOnDamagedModel: number | null;
}

/** Serializable continuation after the 05.03 saves and during 05.04 allocation. */
export interface PendingBasicMeleeResolutionV1 {
  readonly originCommandId: string;
  readonly attackerUnitId: string;
  readonly targetUnitId: string;
  readonly weaponProfileId: string;
  readonly attackingModelIds: readonly string[];
  readonly defenderPlayerId: string;
  readonly hitRequired: number;
  readonly woundRequired: number;
  readonly saveRequired: number;
  readonly damage: number;
  readonly hitRolls: readonly BasicShootingHitRoll[];
  readonly woundRolls: readonly BasicShootingWoundRoll[];
  readonly successfulWoundAttackIndexes: readonly number[];
  /** 05.03 results ordered from lowest to highest, then by attack index. */
  readonly saveRolls: readonly BasicShootingSaveRoll[];
  /** Index of the next ordered 05.03 result to allocate under 05.04. */
  readonly nextWoundIndex: number;
  readonly allocations: readonly BasicShootingAllocationRecord[];
  readonly fightPhaseAfter: FightPhaseStateV1;
  readonly environmentFingerprint: string;
  readonly prngBefore: PrngStateV1;
  readonly prngAfter: PrngStateV1;
  readonly sourceRefs: readonly SourceReferenceV1[];
}

/** Current M4 Oath of Moment selection for one player and command round. */
export interface OathOfMomentSelectionV1 {
  readonly ruleId: 'adeptus-astartes.oath-of-moment';
  readonly playerId: string;
  readonly targetUnitId: string;
  readonly round: number;
  readonly rerollFailedHits: true;
  readonly woundRollModifier: 0 | 1;
  readonly sourceRefs: readonly SourceReferenceV1[];
}

export interface BasicShootingAttackGroup {
  readonly firingModelId: string;
  /** Profile declared by the unit for this group of attacks. */
  readonly weaponProfileId: string;
  /** Zero-based physical weapon instance for independently generated random A. */
  readonly weaponInstanceIndex?: number;
  readonly weaponCount: number;
  /** T05.4 occurrence chosen before this weapon was resolved. */
  readonly duplicateAbilitySelection?: {
    readonly weaponProfileId: string;
    readonly kind: 'sustained-hits';
    readonly selectedOccurrenceIndex: number;
  };
  /** Present only when this group generated a variable A characteristic. */
  readonly randomAttacks?: BasicShootingRandomCharacteristicEvidence;
  /** Present only when a source-backed M5 modifier fact affected this group. */
  readonly modifierSourceRefs?: readonly SourceReferenceV1[];
  /** Authoritative M5-T02.3 calculation from the state and spatial plan. */
  readonly attackVolume: {
    readonly targetModelCount: number;
    readonly baseAttacksPerWeapon: number;
    readonly rapidFireBonus: number;
    readonly blastBonus: number;
    readonly attacksPerWeapon: number;
    readonly atHalfRange: boolean;
    readonly sourceRefs: readonly SourceReferenceV1[];
  };
  readonly range: BasicShootingRangeEvidence;
  readonly lineOfSight: BasicShootingLineOfSightEvidence;
  readonly cover: BasicShootingCoverEvidence;
  /** Canonical 05.01 -> 05.03 dice stages, in actual PRNG draw order. */
  readonly hitRolls: readonly BasicShootingHitRoll[];
  readonly woundRolls: readonly BasicShootingWoundRoll[];
  readonly saveRolls: readonly BasicShootingSaveRoll[];
  /** Canonical 05.04 resolution, ordered by save roll then attack index. */
  readonly allocations: readonly BasicShootingAllocationRecord[];
  readonly rolls: readonly BasicShootingDieStep[];
  readonly result: BasicShootingResult;
  readonly prngBefore: PrngStateV1;
  readonly prngAfter: PrngStateV1;
}

/** The trusted 05.01 checkpoint before [LETHAL HITS] decisions and wounds. */
export interface BasicShootingHitStageGroup {
  readonly firingModelId: string;
  readonly weaponProfileId: string;
  readonly weaponCount: number;
  readonly attackVolume: BasicShootingAttackGroup['attackVolume'];
  readonly range: BasicShootingRangeEvidence;
  readonly lineOfSight: BasicShootingLineOfSightEvidence;
  readonly cover: BasicShootingCoverEvidence;
  readonly hitRolls: readonly BasicShootingHitRoll[];
  readonly hitRequired: number;
  readonly woundRequired: number;
  readonly saveRequired: number;
  readonly prngBefore: PrngStateV1;
  readonly prngAfter: PrngStateV1;
}

export interface LethalHitsCriticalKeyV1 {
  readonly groupIndex: number;
  readonly attackIndex: number;
}

export interface LethalHitsChoiceV1 extends LethalHitsCriticalKeyV1 {
  readonly optionId: 'auto-wound' | 'roll-to-wound';
}

/** A stable, attack-local identity for an optional individual D6 reroll. */
export interface RerollDieKeyV1 {
  readonly groupIndex: number;
  readonly attackIndex: number;
}

export type RerollRollKindV1 = 'hit' | 'wound';

/** The player must explicitly keep or replace every eligible die in order. */
export interface RerollChoiceV1 extends RerollDieKeyV1 {
  readonly rollKind: RerollRollKindV1;
  readonly optionId: 'keep' | 'reroll';
}

/**
 * Serializable V3 continuation for the bounded generic reroll fixture.
 * The first stage holds original hit rolls; the second holds final hit rolls
 * and the original wound rolls.  The trusted orchestration recomputes both.
 */
export interface PendingRerollShootingResolutionV1 {
  readonly originCommandId: string;
  readonly attackerUnitId: string;
  readonly targetUnitId: string;
  readonly weaponProfileId: string;
  readonly stage: RerollRollKindV1;
  readonly attackGroup: BasicShootingHitStageGroup;
  /** Present only once the hit stage has been completed. */
  readonly woundRolls?: readonly BasicShootingWoundRoll[];
  readonly eligibleKeys: readonly RerollDieKeyV1[];
  readonly choices: readonly RerollChoiceV1[];
  /** Frozen hit choices while the wound window is pending. */
  readonly hitChoices?: readonly RerollChoiceV1[];
  readonly permissions: {
    readonly hit: boolean;
    readonly wound: boolean;
    readonly sourceRefs: readonly SourceReferenceV1[];
  };
  readonly shootingEnvironmentFingerprint: string;
  readonly prngBefore: PrngStateV1;
  readonly prngAfterHits: PrngStateV1;
  /** Present only after original wound dice and chosen hit rerolls. */
  readonly prngAfterWounds?: PrngStateV1;
  readonly sourceRefs: readonly SourceReferenceV1[];
}

/**
 * Serializable authoritative continuation data. It is derived only from the
 * hit-stage event and is always replayed against the trusted environment.
 */
export interface PendingLethalShootingResolutionV1 {
  readonly originCommandId: string;
  readonly attackerUnitId: string;
  readonly targetUnitId: string;
  readonly weaponProfileId: string;
  readonly attackGroups: readonly BasicShootingHitStageGroup[];
  readonly criticalHitKeys: readonly LethalHitsCriticalKeyV1[];
  readonly choices: readonly LethalHitsChoiceV1[];
  readonly shootingEnvironmentFingerprint: string;
  readonly prngBefore: PrngStateV1;
  readonly prngAfterHits: PrngStateV1;
  readonly sourceRefs: readonly SourceReferenceV1[];
}

/** One unsaved wound waiting for its defender-selected T04 allocation. */
export interface ExtendedShootingDamagePacketV1 {
  readonly packetIndex: number;
  readonly kind: 'normal' | 'mortal';
  readonly damage: number;
  readonly randomDamage?: RandomCharacteristicNotationV1;
  readonly fusionBonus?: number;
  readonly atHalfRange: boolean;
  readonly sourceAttackIndex: number;
}

export interface ExtendedAllocationGroupV1 {
  readonly id: string;
  readonly modelIds: readonly string[];
}

export type ExtendedAllocationChoiceV1 =
  | { readonly packetIndex: number; readonly kind: 'group'; readonly groupId: string }
  | { readonly packetIndex: number; readonly kind: 'model'; readonly modelId: string }
  | { readonly packetIndex: -1; readonly kind: 'hazardous-model'; readonly modelId: string };

export interface ExtendedDamageEvidenceV1 {
  readonly save?: { readonly roll: number; readonly path: 'invulnerable' | 'armour' | 'failed'; readonly saved: boolean };
  readonly damageBeforeFeelNoPain: number;
  readonly damageLost: number;
  readonly randomDamage?: BasicShootingRandomCharacteristicEvidence;
  readonly feelNoPain?: { readonly threshold: number; readonly rolls: readonly number[]; readonly prevented: number };
  readonly mortalWounds: boolean;
  readonly sourceRefs: readonly SourceReferenceV1[];
}

/** Serializable V4 allocation continuation.  It is valid only for fixtures. */
export interface PendingExtendedShootingResolutionV1 {
  readonly originCommandId: string;
  readonly attackerUnitId: string;
  readonly targetUnitId: string;
  readonly weaponProfileId: string;
  readonly firingModelId: string;
  readonly weaponInstanceIndex: number;
  readonly packets: readonly ExtendedShootingDamagePacketV1[];
  readonly allocationGroups: readonly ExtendedAllocationGroupV1[];
  /** Complete defender group order announced before any saving throw. */
  readonly groupPlan: readonly string[];
  readonly stage: 'group-planning' | 'model-allocation' | 'hazardous-allocation';
  /** Raw normal-save dice, all rolled before their group-dependent resolution. */
  readonly saveRolls?: readonly { readonly packetIndex: number; readonly roll: number }[];
  /** Normal saves, ascending die then source attack; mortals follow. */
  readonly allocationOrder?: readonly number[];
  /** A failed normal save waiting for the defender-model decision. */
  readonly awaitingAllocationPacketIndex?: number;
  readonly choices: readonly ExtendedAllocationChoiceV1[];
  readonly resolvedPacketCount: number;
  /** Current announced allocation group; it persists until no model remains. */
  readonly selectedGroupId?: string;
  readonly attackRolls: readonly number[];
  readonly woundRolls: readonly { readonly attackIndex: number; readonly roll: number; readonly wound: boolean; readonly critical: boolean }[];
  readonly hazardous: boolean;
  readonly hazardousWoundsRemaining?: number;
  readonly oneShotInstanceKey?: string;
  readonly shootingEnvironmentFingerprint: string;
  readonly prngBefore: PrngStateV1;
  readonly prngAfterAttacks: PrngStateV1;
  readonly sourceRefs: readonly SourceReferenceV1[];
}

interface BasicShootingCompletionPayload {
  readonly attackerUnitId: string;
  readonly targetUnitId: string;
  readonly weaponProfileId: string;
  readonly evidence: BasicShootingEvidence;
  readonly attackGroups: readonly BasicShootingAttackGroup[];
  readonly rolls: readonly BasicShootingDieStep[];
  readonly result: BasicShootingResult;
  readonly casualtyModelIds: readonly string[];
  readonly targetModelsAfter: readonly UnitModelState[];
  readonly shootingEnvironmentFingerprint: string;
  readonly prngBefore: PrngStateV1;
  readonly prngAfter: PrngStateV1;
  readonly sourceRefs: readonly SourceReferenceV1[];
}

/** One target-wise result of a fully validated, atomic T05.2 declaration. */
export interface SplitFireResolutionV1 {
  readonly declaration: SplitFireWeaponDeclarationV1;
  /** A later weapon can have no remaining model after an earlier legal target-wise resolution. */
  readonly outcome: 'resolved' | 'target-no-longer-active';
  readonly attackGroup?: BasicShootingAttackGroup;
  readonly casualtyModelIds: readonly string[];
  readonly targetModelsAfter: readonly UnitModelState[];
}

export interface SplitFireRetargetChoiceV1 {
  readonly assignmentId: string;
  /** `abandon` records an explicit choice to leave this selected instance unused. */
  readonly targetUnitId: string;
}

/** Serializable V5 continuation, opened only when a previously selected target has no model left. */
export interface PendingSplitFireShootingResolutionV1 {
  readonly originCommandId: string;
  readonly attackerUnitId: string;
  /** Effective legal schedule. Its unresolved suffix can be rebuilt only by a journalled retarget decision. */
  readonly declarations: readonly SplitFireWeaponDeclarationV1[];
  /** First declaration that has not yet received a target-wise result. */
  readonly nextResolutionIndex: number;
  readonly resolutions: readonly SplitFireResolutionV1[];
  /** Recorded player choices, one for each unresolved instance whose target disappeared. */
  readonly choices: readonly SplitFireRetargetChoiceV1[];
  /** The authoritative, currently legal options for the pending declaration. */
  readonly retargetOptionTargetUnitIds: readonly string[];
  readonly shootingEnvironmentFingerprint: string;
  readonly prngBefore: PrngStateV1;
  readonly prngAfter: PrngStateV1;
  readonly sourceRefs: readonly SourceReferenceV1[];
}

/** A V5 choice opened before any attack roll for one repeated weapon ability. */
export interface PendingDuplicateWeaponAbilitySelectionV1 {
  readonly originCommand: Extract<GameCommand, { readonly type: 'resolve-basic-shooting' }>;
  readonly attackerUnitId: string;
  readonly weaponProfileId: string;
  readonly kind: 'sustained-hits';
  readonly occurrenceIndexes: readonly number[];
  readonly shootingEnvironmentFingerprint: string;
  readonly sourceRefs: readonly SourceReferenceV1[];
  readonly selection?: {
    readonly weaponProfileId: string;
    readonly kind: 'sustained-hits';
    readonly selectedOccurrenceIndex: number;
  };
}

export type GameEvent =
  | (EventBase & { readonly type: 'session-setup'; readonly session: SessionSetup })
  | (EventBase & {
    readonly type: 'unit-deployed';
    readonly playerId: string;
    readonly unitId: string;
    readonly modelPoses: readonly DeploymentModelPoseV1[];
    readonly evidence: DeploymentGeometryEvidenceV1;
    readonly environmentFingerprint: string;
    readonly nextPlayerId: string | null;
    readonly deploymentComplete: boolean;
    readonly sourceRefs: readonly SourceReferenceV1[];
  })
  | (EventBase & {
    readonly type: 'fight-window-passed';
    readonly playerId: string;
    readonly fightPhaseAfter: FightPhaseStateV1;
    readonly sourceRefs: readonly SourceReferenceV1[];
  })
  | (EventBase & {
    readonly type: 'fight-movement-resolved';
    readonly playerId: string;
    readonly movementKind: FightMovementKindV1;
    readonly unitId: string;
    readonly targetUnitIds: readonly string[];
    readonly paths: readonly UnitMovementPathV1[];
    readonly finalPoses: readonly DeploymentModelPoseV1[];
    readonly evidence: {
      readonly paths: readonly { readonly modelId: string; readonly pathLength: number; readonly initialTargetDistance: number; readonly finalTargetDistance: number }[];
      readonly coherency: DeploymentGeometryEvidenceV1['coherency'];
    };
    readonly fightPhaseAfter: FightPhaseStateV1;
    readonly environmentFingerprint: string;
    readonly prngBefore: PrngStateV1;
    readonly prngAfter: PrngStateV1;
    readonly sourceRefs: readonly SourceReferenceV1[];
  })
  | (EventBase & {
    readonly type: 'basic-melee-stage-resolved';
    readonly playerId: string;
    readonly resolution: PendingBasicMeleeResolutionV1;
  })
  | (EventBase & {
    readonly type: 'basic-melee-allocation-resolved';
    readonly decisionId: string | null;
    readonly playerId: string;
    readonly packetIndex: number;
    readonly attackIndex: number;
    readonly modelId: string;
    readonly saveRoll: number;
    readonly saved: boolean;
    readonly damage: number;
    readonly modelAfter: UnitModelState;
    /** No entropy is drawn here: the save was already rolled in 05.03. */
    readonly prngBefore: PrngStateV1;
    readonly prngAfter: PrngStateV1;
    readonly sourceRefs: readonly SourceReferenceV1[];
  })
  | (EventBase & {
    readonly type: 'basic-melee-resolved';
    readonly playerId: string;
    readonly attackerUnitId: string;
    readonly targetUnitId: string;
    readonly weaponProfileId: string;
    readonly attackingModelIds: readonly string[];
    readonly rolls: readonly BasicShootingDieStep[];
    readonly result: BasicShootingResult;
    readonly targetModelsAfter: readonly UnitModelState[];
    readonly fightPhaseAfter: FightPhaseStateV1;
    readonly environmentFingerprint: string;
    readonly prngBefore: PrngStateV1;
    readonly prngAfter: PrngStateV1;
    readonly sourceRefs: readonly SourceReferenceV1[];
  })
  | (EventBase & {
    readonly type: 'empty-fight-resolved';
    readonly playerId: string;
    readonly unitId: string;
    readonly fightPhaseAfter: FightPhaseStateV1;
    readonly environmentFingerprint: string;
    readonly prngBefore: PrngStateV1;
    readonly prngAfter: PrngStateV1;
    readonly sourceRefs: readonly SourceReferenceV1[];
  })
  | (EventBase & {
    readonly type: 'charge-declared';
    readonly pending: PendingChargeV1;
  })
  | (EventBase & {
    readonly type: 'charge-resolved';
    readonly playerId: string;
    readonly unitId: string;
    readonly outcome: 'declined' | 'moved';
    readonly targetUnitIds: readonly string[];
    readonly paths: readonly UnitMovementPathV1[];
    readonly finalPoses: readonly DeploymentModelPoseV1[];
    readonly evidence: {
      readonly paths: readonly { readonly modelId: string; readonly pathLength: number; readonly initialTargetDistance: WorldUnit; readonly finalTargetDistance: WorldUnit }[];
      readonly engagedTargetUnitIds: readonly string[];
      readonly engagedNonTargetUnitIds: readonly string[];
      readonly coherency: DeploymentGeometryEvidenceV1['coherency'];
    };
    readonly environmentFingerprint: string;
    readonly prngBefore: PrngStateV1;
    readonly prngAfter: PrngStateV1;
    readonly sourceRefs: readonly SourceReferenceV1[];
  })
  | (EventBase & {
    readonly type: 'battle-started';
    readonly battleRound: 1;
    readonly turnNumber: 1;
    readonly activePlayerId: string;
    readonly sourceRefs: readonly SourceReferenceV1[];
  })
  | (EventBase & {
    readonly type: 'objective-control-resolved';
    readonly checkpoint: ObjectiveControlResolutionV1['checkpoint'];
    readonly resolutions: readonly ObjectiveControlResolutionV1[];
    readonly environmentFingerprint: string;
    readonly sourceRefs: readonly SourceReferenceV1[];
  })
  | (EventBase & {
    readonly type: 'mission-scoring-resolved';
    readonly checkpointId: string;
    readonly checkpoint: MissionScoringCheckpointV1;
    readonly battleRound: number;
    readonly turnNumber: number;
    readonly activePlayerId: string;
    readonly evidence: MissionScoringEvidenceV1;
    readonly scoreEvents: readonly MissionScoreEventV1[];
    readonly finalResult: MissionFinalResultV1 | null;
    readonly environmentFingerprint: string;
    readonly prngBefore: PrngStateV1;
    readonly prngAfter: PrngStateV1;
    readonly sourceRefs: readonly SourceReferenceV1[];
  })
  | (EventBase & {
    readonly type: 'battle-phase-advanced';
    readonly from: SimulatorPhase;
    readonly to: SimulatorPhase;
    readonly battleRound: number;
    readonly turnNumber: number;
    readonly activePlayerId: string | null;
    readonly battleCompleted: boolean;
    /** Additive M8 evidence; old V6 journals may omit it when no effect was due. */
    readonly timedEffectExpirations?: readonly TimedEffectExpirationV1[];
    readonly sourceRefs: readonly SourceReferenceV1[];
  })
  | (EventBase & {
    readonly type: 'command-stage-resolved';
    readonly playerId: string;
    readonly from: CommandPhaseStageV1;
    readonly to: CommandPhaseStageV1;
    readonly commandPointsGainedByPlayerId: Readonly<Record<string, number>>;
    readonly commandPhaseAfter: CommandPhaseStateV1;
    readonly expiredEffectIds: readonly string[];
    readonly prngBefore: PrngStateV1;
    readonly prngAfter: PrngStateV1;
    readonly sourceRefs: readonly SourceReferenceV1[];
  })
  | (EventBase & {
    readonly type: 'battle-shock-test-resolved';
    readonly playerId: string;
    readonly result: BattleShockTestResultV1;
    readonly commandPhaseAfter: CommandPhaseStateV1 | null;
    readonly battleShockedUnitIdsAfter: readonly string[];
    readonly prngBefore: PrngStateV1;
    readonly prngAfter: PrngStateV1;
    readonly sourceRefs: readonly SourceReferenceV1[];
  })
  | (EventBase & {
    readonly type: 'insane-bravery-used';
    readonly playerId: string;
    readonly targetUnitId: string;
    readonly cost: 1;
    readonly commandPhaseAfter: CommandPhaseStateV1;
    readonly use: StratagemUseV1;
    readonly prngBefore: PrngStateV1;
    readonly prngAfter: PrngStateV1;
    readonly sourceRefs: readonly SourceReferenceV1[];
  })
  | (EventBase & {
    readonly type: 'counter-offensive-used';
    readonly playerId: string;
    readonly targetUnitId: string;
    readonly cost: 2;
    readonly fightPhaseAfter: FightPhaseStateV1;
    readonly use: StratagemUseV1;
    readonly prngBefore: PrngStateV1;
    readonly prngAfter: PrngStateV1;
    readonly sourceRefs: readonly SourceReferenceV1[];
  })
  | (EventBase & {
    readonly type: 'unit-movement-resolved';
    readonly playerId: string;
    readonly unitId: string;
    readonly movementType: UnitMovementTypeV1;
    readonly fallBackMode?: FallBackModeV1;
    readonly paths: readonly UnitMovementPathV1[];
    readonly finalPoses: readonly DeploymentModelPoseV1[];
    readonly maximumDistance: WorldUnit;
    readonly advanceRoll?: number;
    readonly desperateEscape?: {
      readonly riskRolls: readonly { readonly modelId: string; readonly result: number }[];
      readonly mortalWounds: number;
      readonly unitModelsAfter: readonly UnitModelState[];
      readonly playerAllocationOrder: readonly string[];
      readonly mortalWoundAllocations: readonly string[];
      readonly allocationPolicy: 'mandatory-wounded-then-player-order';
      /** Present only when at least one model survived and an immediate test is due. */
      readonly battleShockTestRequired?: true;
    };
    readonly evidence: {
      readonly startedEngaged: boolean;
      readonly endedEngaged: boolean;
      readonly paths: readonly { readonly modelId: string; readonly pathLength: number }[];
      readonly coherency: DeploymentGeometryEvidenceV1['coherency'];
    };
    readonly environmentFingerprint: string;
    readonly prngBefore: PrngStateV1;
    readonly prngAfter: PrngStateV1;
    readonly sourceRefs: readonly SourceReferenceV1[];
  })
  | (EventBase & {
    readonly type: 'first-player-determined';
    readonly winnerPlayerId: string;
    readonly rollOffs: readonly {
      readonly rolls: readonly { readonly playerId: string; readonly result: number }[];
    }[];
    readonly prngBefore: PrngStateV1;
    readonly prngAfter: PrngStateV1;
    readonly sourceRefs: readonly SourceReferenceV1[];
  })
  | (EventBase & { readonly type: 'phase-transitioned'; readonly from: SimulatorPhase; readonly to: SimulatorPhase })
  | (EventBase & { readonly type: 'model-moved'; readonly modelId: string; readonly from: WorldPoint; readonly to: WorldPoint; readonly orientationDegrees: number })
  | (EventBase & { readonly type: 'dice-rolled'; readonly rollId: string; readonly sides: number; readonly results: readonly number[]; readonly reason: string; readonly prngBefore: PrngStateV1; readonly prngAfter: PrngStateV1 })
  | (EventBase & BasicShootingCompletionPayload & {
    readonly type: 'basic-shooting-resolved';
    /** All weapon profiles declared when the unit was selected to shoot. */
    readonly weaponProfileIds?: readonly string[];
    /** Legacy first/only profile retained to replay pre-M5 journals. */
  })
  | (EventBase & {
    readonly type: 'basic-shooting-hit-stage-resolved';
    readonly resolution: PendingLethalShootingResolutionV1;
  })
  | (EventBase & {
    readonly type: 'basic-shooting-lethal-choice-resolved';
    readonly decisionId: string;
    readonly playerId: string;
    readonly choice: LethalHitsChoiceV1;
  })
  | (EventBase & {
    readonly type: 'basic-shooting-reroll-stage-resolved';
    readonly resolution: PendingRerollShootingResolutionV1;
  })
  | (EventBase & {
    readonly type: 'basic-shooting-reroll-choice-resolved';
    readonly decisionId: string;
    readonly playerId: string;
    readonly choice: RerollChoiceV1;
  })
  /** Trusted continuation after every critical-hit choice has been journaled. */
  | (EventBase & BasicShootingCompletionPayload & { readonly type: 'basic-shooting-completed' })
  | (EventBase & BasicShootingCompletionPayload & { readonly type: 'basic-shooting-reroll-completed' })
  | (EventBase & {
    readonly type: 'split-fire-resolved';
    readonly attackerUnitId: string;
    /** Kept in the player-selected resolution order for trusted replay. */
    readonly resolutions: readonly SplitFireResolutionV1[];
    readonly shootingEnvironmentFingerprint: string;
    readonly prngBefore: PrngStateV1;
    readonly prngAfter: PrngStateV1;
    readonly sourceRefs: readonly SourceReferenceV1[];
  })
  | (EventBase & { readonly type: 'split-fire-stage-resolved'; readonly resolution: PendingSplitFireShootingResolutionV1 })
  | (EventBase & { readonly type: 'split-fire-retarget-choice-resolved'; readonly decisionId: string; readonly playerId: string; readonly choice: SplitFireRetargetChoiceV1 })
  | (EventBase & { readonly type: 'split-fire-completed'; readonly resolution: PendingSplitFireShootingResolutionV1 })
  | (EventBase & { readonly type: 'duplicate-weapon-ability-selection-requested'; readonly selection: PendingDuplicateWeaponAbilitySelectionV1 })
  | (EventBase & { readonly type: 'duplicate-weapon-ability-choice-resolved'; readonly decisionId: string; readonly playerId: string; readonly selection: NonNullable<PendingDuplicateWeaponAbilitySelectionV1['selection']> })
  | (EventBase & { readonly type: 'extended-shooting-one-shot-selected'; readonly instanceKey: string; readonly attackerUnitId: string; readonly weaponProfileId: string; readonly firingModelId: string; readonly weaponInstanceIndex: number; readonly sourceRefs: readonly SourceReferenceV1[] })
  | (EventBase & { readonly type: 'extended-shooting-stage-resolved'; readonly resolution: PendingExtendedShootingResolutionV1 })
  | (EventBase & { readonly type: 'extended-shooting-save-stage-resolved'; readonly packetIndexOrder: readonly number[]; readonly saveRolls: NonNullable<PendingExtendedShootingResolutionV1['saveRolls']>; readonly prngBefore: PrngStateV1; readonly prngAfter: PrngStateV1 })
  /** Trusted resolution of one raw save against the current, still-living group. */
  | (EventBase & { readonly type: 'extended-shooting-save-resolved'; readonly packetIndex: number; readonly groupId: string; readonly evidence: NonNullable<ExtendedDamageEvidenceV1['save']>; readonly prngBefore: PrngStateV1; readonly prngAfter: PrngStateV1 })
  | (EventBase & { readonly type: 'extended-shooting-allocation-choice-resolved'; readonly decisionId: string; readonly playerId: string; readonly choice: ExtendedAllocationChoiceV1 })
  | (EventBase & { readonly type: 'extended-shooting-packet-resolved'; readonly packetIndex: number; readonly modelId: string; readonly evidence: ExtendedDamageEvidenceV1; readonly modelAfter: UnitModelState; readonly prngBefore: PrngStateV1; readonly prngAfter: PrngStateV1 })
  /** An excess attack has no active defender and is explicitly lost. */
  | (EventBase & { readonly type: 'extended-shooting-packet-lost'; readonly packetIndex: number; readonly reason: 'no-active-target'; readonly prngBefore: PrngStateV1; readonly prngAfter: PrngStateV1; readonly sourceRefs: readonly SourceReferenceV1[] })
  | (EventBase & { readonly type: 'extended-shooting-hazardous-resolved'; readonly roll: number; readonly mortalWounds: number; readonly prngBefore: PrngStateV1; readonly prngAfter: PrngStateV1; readonly sourceRefs: readonly SourceReferenceV1[] })
  | (EventBase & { readonly type: 'extended-shooting-hazardous-packet-resolved'; readonly modelId: string; readonly evidence: ExtendedDamageEvidenceV1; readonly modelAfter: UnitModelState; readonly prngBefore: PrngStateV1; readonly prngAfter: PrngStateV1 })
  /** Mortal wounds with no remaining active model are explicitly lost. */
  | (EventBase & { readonly type: 'extended-shooting-hazardous-wounds-lost'; readonly count: number; readonly sourceRefs: readonly SourceReferenceV1[] })
  | (EventBase & { readonly type: 'extended-shooting-completed'; readonly attackerUnitId: string; readonly targetUnitId: string; readonly weaponProfileId: string; readonly shootingEnvironmentFingerprint: string; readonly prngBefore: PrngStateV1; readonly prngAfter: PrngStateV1; readonly sourceRefs: readonly SourceReferenceV1[] })
  | (EventBase & { readonly type: 'oath-of-moment-selected'; readonly selection: OathOfMomentSelectionV1 })
  | (EventBase & { readonly type: 'decision-requested'; readonly decision: DecisionRequest })
  | (EventBase & { readonly type: 'decision-resolved'; readonly decisionId: string; readonly optionId: string; readonly playerId: string });

export interface GameState {
  readonly schemaVersion: typeof SIMULATOR_SCHEMA_VERSION;
  readonly simulatorVersion: string;
  readonly gameId: string;
  readonly phase: SimulatorPhase;
  readonly round: number;
  /** Additive V6 state; legacy V1–V5 sessions keep these neutral. */
  readonly battle: BattleStateV1 | null;
  readonly commandPhase: CommandPhaseStateV1 | null;
  readonly battleResources: BattleResourcesV1 | null;
  readonly mission: MissionStateV1 | null;
  readonly resolutionQueue: ResolutionQueueV1;
  readonly manifest: SimulatorManifestV1 | null;
  readonly shootingEnvironmentFingerprint: string | null;
  readonly players: Readonly<Record<string, PlayerSetup>>;
  readonly models: Readonly<Record<string, ModelState>>;
  readonly units: Readonly<Record<string, UnitState>>;
  /** Per-active-turn consequences; reset whenever a new player turn begins. */
  readonly unitTurnStatuses: Readonly<Record<string, UnitTurnStatusV1>>;
  /** Actual model IDs that have already completed their normal move this movement phase. */
  readonly movedModelIds: readonly string[];
  /** Canonical `unitId:weaponProfileId` keys already fired during this shooting phase. */
  readonly firedWeaponKeys: readonly string[];
  /** Unit IDs selected to shoot in the current shooting phase (10.02). */
  readonly shootingSelectedUnitIds: readonly string[];
  /** V4 durable physical instances already used with [TIR UNIQUE]. */
  readonly spentOneShotWeaponInstanceKeys: readonly string[];
  readonly oathOfMomentSelections: Readonly<Record<string, OathOfMomentSelectionV1>>;
  readonly pendingDecisions: readonly DecisionRequest[];
  readonly pendingLethalShooting: PendingLethalShootingResolutionV1 | null;
  readonly pendingRerollShooting: PendingRerollShootingResolutionV1 | null;
  readonly pendingExtendedShooting: PendingExtendedShootingResolutionV1 | null;
  readonly pendingBasicMelee: PendingBasicMeleeResolutionV1 | null;
  readonly pendingSplitFireShooting: PendingSplitFireShootingResolutionV1 | null;
  readonly pendingDuplicateWeaponAbilitySelection: PendingDuplicateWeaponAbilitySelectionV1 | null;
  readonly pendingCharge: PendingChargeV1 | null;
  readonly fightPhase: FightPhaseStateV1 | null;
  readonly diceResults: Readonly<Record<string, readonly number[]>>;
  readonly prng: PrngStateV1;
  readonly eventLog: readonly GameEvent[];
}

export interface SimulationSaveV1 {
  readonly schemaVersion: typeof SIMULATION_SAVE_SCHEMA_VERSION;
  readonly simulatorVersion: string;
  readonly gameId: string;
  readonly createdAt: string;
  readonly initialState: GameState;
  readonly events: readonly GameEvent[];
}

/**
 * The M3 save binds a replay journal to the closed, compiled shooting
 * environment. Units remain in the session-setup event so their actual model
 * ids, assignments and wounds are replayed instead of being a lossy snapshot.
 */
export interface SimulationSaveV2 {
  readonly schemaVersion: typeof SIMULATION_SAVE_V2_SCHEMA_VERSION;
  readonly simulatorVersion: string;
  readonly gameId: string;
  readonly createdAt: string;
  readonly initialState: GameState;
  readonly events: readonly GameEvent[];
  readonly environment: {
    readonly shootingEnvironmentFingerprint: string;
    readonly scenarioId: string;
    readonly manifestFingerprint: string;
  };
}

/** V3 recognises the interrupted [LETHAL HITS] journal; V1/V2 are never migrated. */
export interface SimulationSaveV3 extends Omit<SimulationSaveV2, 'schemaVersion'> {
  readonly schemaVersion: typeof SIMULATION_SAVE_V3_SCHEMA_VERSION;
}

/** V4 is reserved for the extended defence/damage journal and durable one-shot state. */
export interface SimulationSaveV4 extends Omit<SimulationSaveV2, 'schemaVersion'> {
  readonly schemaVersion: typeof SIMULATION_SAVE_V4_SCHEMA_VERSION;
}

/** V5 records the atomic, target-wise T05.2 split-fire declaration. */
export interface SimulationSaveV5 extends Omit<SimulationSaveV2, 'schemaVersion'> {
  readonly schemaVersion: typeof SIMULATION_SAVE_V5_SCHEMA_VERSION;
}

/** V6 is the sole complete-game envelope; older saves remain in their original scope. */
export interface SimulationSaveV6 extends Omit<SimulationSaveV2, 'schemaVersion' | 'environment'> {
  readonly schemaVersion: typeof SIMULATION_SAVE_V6_SCHEMA_VERSION;
  readonly environment: SimulationSaveV2['environment'] & {
    readonly eventStreamSchemaVersion: typeof GAME_EVENT_STREAM_V1_SCHEMA_VERSION;
    readonly battleStateSchemaVersion: typeof BATTLE_STATE_V1_SCHEMA_VERSION;
    /** Required as soon as the journal contains an M8 command/resource event. */
    readonly commandPhaseSchemaVersion?: typeof COMMAND_PHASE_V1_SCHEMA_VERSION;
    readonly battleResourcesSchemaVersion?: typeof BATTLE_RESOURCES_V1_SCHEMA_VERSION;
    readonly timedEffectSchemaVersion?: typeof TIMED_EFFECT_V1_SCHEMA_VERSION;
    readonly missionStateSchemaVersion: typeof MISSION_STATE_V1_SCHEMA_VERSION;
    readonly resolutionQueueSchemaVersion: typeof RESOLUTION_QUEUE_V1_SCHEMA_VERSION;
    readonly completeGameSessionFingerprint: string;
    readonly compatibilityReportFingerprint: string;
  };
}

export type SimulationSave = SimulationSaveV1 | SimulationSaveV2 | SimulationSaveV3 | SimulationSaveV4 | SimulationSaveV5 | SimulationSaveV6;

export type CommandExecution =
  | { readonly accepted: true; readonly state: GameState; readonly events: readonly GameEvent[] }
  | { readonly accepted: false; readonly state: GameState; readonly rejection: RuleRejection };

export type SaveParseResult =
  | { readonly ok: true; readonly save: SimulationSave }
  | { readonly ok: false; readonly errors: readonly string[] };
