/**
 * Public, framework-free contracts for the tactical simulator.
 *
 * All distances use a signed integer amount of tenths of a millimetre.  One
 * inch is therefore exactly 254 world units.  Keeping this invariant in the
 * contracts makes the geometry layer deterministic across browsers.
 */

export const SIMULATOR_SCHEMA_VERSION = 'warforge-simulator/v1' as const;
export const SIMULATION_SAVE_SCHEMA_VERSION = 'warforge-simulation-save/v1' as const;
export const SIMULATION_SAVE_V2_SCHEMA_VERSION = 'warforge-simulation-save/v2' as const;
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
  readonly effectiveFrom: string;
  readonly page?: number;
  /** Stable section reference when the source uses numbered rules. */
  readonly reference?: string;
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
export interface WeaponProfileV1 {
  readonly id: string;
  readonly displayName: string;
  readonly range: WorldUnit;
  readonly attacks: number;
  readonly ballisticSkill: number;
  readonly strength: number;
  readonly armourPenetration: number;
  readonly damage: number;
  readonly sourceRefs: readonly SourceReferenceV1[];
}

export interface ModelWeaponAssignmentV1 {
  readonly modelId: string;
  readonly weaponProfileId: string;
  readonly quantity: number;
}

/** Immutable unit composition used only by the session-setup event. */
export interface UnitSetup {
  readonly id: string;
  /** Stable internal unit identity retained for existing M3 snapshots. */
  readonly fixtureId: string;
  /** Defaults to the legacy fixture-unit subject when omitted. */
  readonly coverageSubject?: UnitCoverageSubjectV1;
  readonly playerId: string;
  /** Actual model IDs, not a count or a profile-derived approximation. */
  readonly modelIds: readonly string[];
  readonly keywords: readonly string[];
  readonly toughness: number;
  readonly save: number;
  readonly woundsPerModel: number;
  readonly weaponProfiles: readonly WeaponProfileV1[];
  /** Optional for setup compatibility; omission means no model is authorized to fire it. */
  readonly weaponAssignments?: readonly ModelWeaponAssignmentV1[];
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

/**
 * Deterministic state for one unit.  The ordered list preserves actual model
 * identities; damage allocation never relies on an implicit model count.
 */
export interface UnitState {
  readonly id: string;
  readonly fixtureId: string;
  readonly playerId: string;
  readonly keywords: readonly string[];
  readonly toughness: number;
  readonly save: number;
  readonly woundsPerModel: number;
  readonly weaponProfiles: readonly WeaponProfileV1[];
  readonly weaponAssignments: readonly ModelWeaponAssignmentV1[];
  readonly sourceRefs: readonly SourceReferenceV1[];
  readonly models: readonly UnitModelState[];
}

export interface PrngStateV1 {
  readonly algorithm: 'mulberry32';
  readonly version: 1;
  readonly seed: number;
  readonly value: number;
  readonly draws: number;
}

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
  | (CommandBase & { readonly type: 'transition-phase'; readonly nextPhase: SimulatorPhase })
  | (CommandBase & { readonly type: 'move-model'; readonly modelId: string; readonly to: WorldPoint; readonly orientationDegrees?: number })
  | (CommandBase & { readonly type: 'roll-dice'; readonly rollId: string; readonly sides: number; readonly count: number; readonly reason: string })
  /** Spatial facts are never command input; the trusted orchestration resolver derives them. */
  | (CommandBase & { readonly type: 'resolve-basic-shooting'; readonly attackerUnitId: string; readonly targetUnitId: string; readonly weaponProfileId: string })
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
    readonly attacksPerWeapon: number;
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
  readonly woundRoll?: number;
  readonly wound?: boolean;
  readonly criticalWound?: boolean;
  readonly saveRoll?: number;
  readonly saved?: boolean;
  readonly damage?: number;
  readonly allocatedModelId?: string;
  readonly destroyedModelId?: string;
}

export interface BasicShootingHitRoll {
  readonly attackIndex: number;
  /** Original D6 result. */
  readonly roll: number;
  /** Present only when a covered rule rerolls a failed hit. */
  readonly rerollRoll?: number;
  readonly hit: boolean;
  readonly critical: boolean;
}

export interface BasicShootingWoundRoll {
  readonly attackIndex: number;
  readonly roll: number;
  readonly wound: boolean;
  readonly critical: boolean;
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
  readonly allocatedModelId?: string;
  readonly destroyedModelId?: string;
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
  readonly weaponCount: number;
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

export type GameEvent =
  | (EventBase & { readonly type: 'session-setup'; readonly session: SessionSetup })
  | (EventBase & { readonly type: 'phase-transitioned'; readonly from: SimulatorPhase; readonly to: SimulatorPhase })
  | (EventBase & { readonly type: 'model-moved'; readonly modelId: string; readonly from: WorldPoint; readonly to: WorldPoint; readonly orientationDegrees: number })
  | (EventBase & { readonly type: 'dice-rolled'; readonly rollId: string; readonly sides: number; readonly results: readonly number[]; readonly reason: string; readonly prngBefore: PrngStateV1; readonly prngAfter: PrngStateV1 })
  | (EventBase & {
    readonly type: 'basic-shooting-resolved';
    readonly attackerUnitId: string;
    readonly targetUnitId: string;
    readonly weaponProfileId: string;
    readonly evidence: BasicShootingEvidence;
    /** Ordered per-carrier attack groups; allocation and PRNG chain flow group to group. */
    readonly attackGroups: readonly BasicShootingAttackGroup[];
    /** Every individual hit/wound/save/damage decision in deterministic order. */
    readonly rolls: readonly BasicShootingDieStep[];
    readonly result: BasicShootingResult;
    /** Actual IDs destroyed by this event, in allocation order. */
    readonly casualtyModelIds: readonly string[];
    /** Exhaustive post-allocation wounds and active flags for the target’s actual models. */
    readonly targetModelsAfter: readonly UnitModelState[];
    readonly shootingEnvironmentFingerprint: string;
    readonly prngBefore: PrngStateV1;
    readonly prngAfter: PrngStateV1;
    readonly sourceRefs: readonly SourceReferenceV1[];
  })
  | (EventBase & { readonly type: 'oath-of-moment-selected'; readonly selection: OathOfMomentSelectionV1 })
  | (EventBase & { readonly type: 'decision-requested'; readonly decision: DecisionRequest })
  | (EventBase & { readonly type: 'decision-resolved'; readonly decisionId: string; readonly optionId: string; readonly playerId: string });

export interface GameState {
  readonly schemaVersion: typeof SIMULATOR_SCHEMA_VERSION;
  readonly simulatorVersion: string;
  readonly gameId: string;
  readonly phase: SimulatorPhase;
  readonly round: number;
  readonly manifest: SimulatorManifestV1 | null;
  readonly shootingEnvironmentFingerprint: string | null;
  readonly players: Readonly<Record<string, PlayerSetup>>;
  readonly models: Readonly<Record<string, ModelState>>;
  readonly units: Readonly<Record<string, UnitState>>;
  readonly oathOfMomentSelections: Readonly<Record<string, OathOfMomentSelectionV1>>;
  readonly pendingDecisions: readonly DecisionRequest[];
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

export type SimulationSave = SimulationSaveV1 | SimulationSaveV2;

export type CommandExecution =
  | { readonly accepted: true; readonly state: GameState; readonly events: readonly GameEvent[] }
  | { readonly accepted: false; readonly state: GameState; readonly rejection: RuleRejection };

export type SaveParseResult =
  | { readonly ok: true; readonly save: SimulationSave }
  | { readonly ok: false; readonly errors: readonly string[] };
