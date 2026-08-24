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
export const SIMULATION_SAVE_V3_SCHEMA_VERSION = 'warforge-simulation-save/v3' as const;
export const SIMULATION_SAVE_V4_SCHEMA_VERSION = 'warforge-simulation-save/v4' as const;
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
  readonly keywords: readonly string[];
  readonly toughness: number;
  readonly save: number;
  readonly woundsPerModel: number;
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

export type GameEvent =
  | (EventBase & { readonly type: 'session-setup'; readonly session: SessionSetup })
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
  readonly manifest: SimulatorManifestV1 | null;
  readonly shootingEnvironmentFingerprint: string | null;
  readonly players: Readonly<Record<string, PlayerSetup>>;
  readonly models: Readonly<Record<string, ModelState>>;
  readonly units: Readonly<Record<string, UnitState>>;
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

export type SimulationSave = SimulationSaveV1 | SimulationSaveV2 | SimulationSaveV3 | SimulationSaveV4;

export type CommandExecution =
  | { readonly accepted: true; readonly state: GameState; readonly events: readonly GameEvent[] }
  | { readonly accepted: false; readonly state: GameState; readonly rejection: RuleRejection };

export type SaveParseResult =
  | { readonly ok: true; readonly save: SimulationSave }
  | { readonly ok: false; readonly errors: readonly string[] };
