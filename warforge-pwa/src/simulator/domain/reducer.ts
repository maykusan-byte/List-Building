import { prngStatesEqual, rollDice, rollDie } from './prng';
import { CORE_ATTACK_SEQUENCE_STEP_SOURCES, CORE_BASIC_RANGED_ATTACK_SOURCE, CORE_BENEFIT_OF_COVER_SOURCE, resolveBasicShooting } from '../rules/shooting';
import { CORE_UNIT_SELECTED_TO_SHOOT_SOURCE, hasSupportedAttackVolumeAbilities, resolveAttackVolume } from '../rules/attack-volume';
import { parseRandomCharacteristicExpression } from '../rules/random-characteristics';
import { resolveRandomCharacteristic } from '../rules/random-characteristics';
import { resolveCharacteristicModifierPlan, resolveDieRollModifierPlan } from '../rules/modifiers';
import { CORE_DUPLICATE_ABILITY_SOURCE, duplicateWeaponAbilityOccurrences, hasSupportedWeaponKeywords, weaponWithSelectedDuplicateAbility } from '../rules/weapon-keywords';
import { scheduleSplitFireRetarget } from './split-fire';
import { assertCompleteGameSessionSetupV1, createBattleStateV1, createMissionStateV1, createResolutionQueueV1 } from './battle-state';
import { nextBattleStepV1, nextDeploymentPlayerIdV1, resolveFirstPlayerRollOffV1 } from './battle-sequence';
import { applyTimedEffectExpirationsV1, commandPhaseBattleShockUnitIdsV1, createBattleResourcesV1, createCommandPhaseStateV1, dueTimedEffectIdsV1, expireTimedEffectsV1, resolveBattleShockTestV1, timedEffectExpirationsForPhaseTransitionV1 } from './battle-resources';
import { resolveDesperateEscapeRiskV1 } from './desperate-escape';
import { calculateMissionScoringV1, missionScoringCheckpointIdV1, missionScoringSourceRefsV1 } from './mission-scoring';
import { CORE_BATTLE_ROUND_SOURCE, CORE_CHARGE_MOVE_SOURCE, CORE_CHARGE_SEQUENCE_SOURCE, CORE_CONSOLIDATION_SEQUENCE_SOURCE, CORE_CONSOLIDATION_SOURCE, CORE_FIGHT_SEQUENCE_SOURCE, CORE_MELEE_ATTACK_SOURCE, CORE_NORMAL_FIGHT_SOURCE, CORE_PILE_IN_SEQUENCE_SOURCE, CORE_PILE_IN_SOURCE, CORE_UNIT_COHERENCY_SOURCE, EVENT_COMPANION_FIRST_TURN_SOURCE, EVENT_COMPANION_FIVE_ROUNDS_SOURCE, OFFICIAL_APP_SELECT_UNIT_WITHOUT_WEAPONS_SOURCE } from '../rules/m7-source-references';
import { CORE_BASE_COMMAND_POINTS_SOURCE, CORE_BATTLE_SHOCK_SOURCE, CORE_COMMAND_ABILITIES_SOURCE, CORE_COMMAND_PHASE_BATTLE_SHOCK_SOURCE, CORE_COMMAND_PHASE_END_SOURCE, CORE_COMMAND_PHASE_START_SOURCE, CORE_COMMAND_ROLL_SOURCE, CORE_COUNTER_OFFENSIVE_SOURCE, CORE_DESPERATE_ESCAPE_SOURCE, CORE_INSANE_BRAVERY_SOURCE, CORE_OBJECTIVE_CONTROL_SOURCE, CORE_TERRAIN_OBJECTIVE_SOURCE, CORE_USE_STRATAGEMS_SOURCE, OFFICIAL_APP_BATTLE_SHOCK_STEP_SOURCE, OFFICIAL_APP_INITIAL_STRENGTH_SOURCE, OFFICIAL_APP_MODIFY_CP_COST_SOURCE, OFFICIAL_APP_MULTIPLE_BATTLE_SHOCK_SOURCE, OFFICIAL_APP_OBJECTIVE_MARKER_SOURCE, OFFICIAL_APP_TERRAIN_OBJECTIVE_SOURCE, OFFICIAL_APP_USE_STRATAGEMS_SOURCE, UNIVERSAL_STRATAGEM_UPDATES_SOURCE } from '../rules/m8-source-references';
import { FIGHT_PHASE_V1_SCHEMA_VERSION, PENDING_CHARGE_V1_SCHEMA_VERSION } from './types';
import type { BasicShootingAttackGroup, BasicShootingResult, CommandPhaseStageV1, DecisionRequest, ExtendedAllocationChoiceV1, GameEvent, GameState, ModelState, OathOfMomentSelectionV1, PendingBasicMeleeResolutionV1, PendingDuplicateWeaponAbilitySelectionV1, PendingExtendedShootingResolutionV1, PendingRerollShootingResolutionV1, PendingSplitFireShootingResolutionV1, PlayerSetup, SessionSetup, SimulatorPhase, SourceReferenceV1, SplitFireResolutionV1, UnitSetup, UnitState, WorldPoint } from './types';

const PHASE_TRANSITIONS: Readonly<Record<SimulatorPhase, readonly SimulatorPhase[]>> = {
  setup: ['deployment'],
  deployment: ['command'],
  command: ['movement'],
  movement: ['shooting'],
  shooting: ['charge'],
  charge: ['fight'],
  fight: ['command', 'completed'],
  completed: []
};

export function canTransitionPhase(from: SimulatorPhase, to: SimulatorPhase): boolean {
  return PHASE_TRANSITIONS[from].includes(to);
}

function pointEquals(left: WorldPoint, right: WorldPoint): boolean {
  return left.x === right.x && left.y === right.y;
}

function isIntegerPoint(point: WorldPoint): boolean {
  return Number.isInteger(point.x) && Number.isInteger(point.y);
}

function isValidOrientation(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value < 360;
}

function assertSourceReferences(references: readonly SourceReferenceV1[], label: string): void {
  if (references.length === 0 || references.some((reference) => !reference.sourceId.trim() || !reference.version.trim() || Number.isNaN(Date.parse(reference.effectiveFrom)))) {
    throw new Error(`${label} must declare valid source references.`);
  }
}

function isValidFightPhaseState(fight: GameState['fightPhase'], state: GameState): boolean {
  if (fight === null || fight.schemaVersion !== FIGHT_PHASE_V1_SCHEMA_VERSION || fight.activePlayerId !== state.battle?.activePlayerId
    || !['pile-in', 'fight', 'consolidation', 'complete'].includes(fight.stage)
    || (fight.stage === 'complete' ? fight.currentPlayerId !== null : !state.battle?.playerIds.includes(fight.currentPlayerId ?? ''))
    || (fight.stage === 'fight' ? !['fights-first', 'remaining'].includes(fight.selectionBand ?? '') : fight.selectionBand !== null)
    || (fight.forcedNextFightUnitId !== undefined
      && (fight.stage !== 'fight' || typeof fight.forcedNextFightUnitId !== 'string' || !fight.forcedNextFightUnitId.trim()))) return false;
  return [fight.passedPlayerIds, fight.piledInUnitIds, fight.eligibleAtFightStartUnitIds, fight.foughtUnitIds, fight.consolidatedUnitIds]
    .every((ids) => new Set(ids).size === ids.length && ids.every((id) => typeof id === 'string' && id.trim().length > 0));
}

function basicMeleeAllocationModels(state: GameState, pending: PendingBasicMeleeResolutionV1): readonly UnitState['models'][number][] {
  const target = state.units[pending.targetUnitId];
  if (!target) return [];
  const active = target.models.filter((model) => model.active).sort((left, right) => left.id.localeCompare(right.id));
  const wounded = active.filter((model) => model.wounds < target.woundsPerModel);
  return wounded.length > 0 ? wounded : active;
}

function hasExactBasicMeleeDecisionShape(decision: DecisionRequest, pending: PendingBasicMeleeResolutionV1, state: GameState): boolean {
  const legal = basicMeleeAllocationModels(state, pending);
  return decision.id === `${pending.originCommandId}:melee:${pending.nextWoundIndex}:model`
    && decision.kind === 'basic-melee-allocation'
    && decision.playerId === pending.defenderPlayerId
    && sameJson(decision.sourceRuleIds.slice(0, 1), ['05.04'])
    && sameJson(decision.options.map((option) => option.id), legal.map((model) => model.id))
    && decision.options.every((option) => option.label === option.id);
}

function assertValidWeapon(weapon: UnitSetup['weaponProfiles'][number], unitId: string): void {
  const modifierPlan = weapon.modifierPlan;
  const modifiersValid = modifierPlan === undefined || (
    (modifierPlan.range === undefined || resolveCharacteristicModifierPlan({ characteristic: 'range', baseValue: weapon.range, ...modifierPlan.range }).accepted)
    && (modifierPlan.attacks === undefined || resolveCharacteristicModifierPlan({ characteristic: 'attacks', baseValue: weapon.attacks, ...modifierPlan.attacks }).accepted)
    && (modifierPlan.ballisticSkill === undefined || resolveCharacteristicModifierPlan({ characteristic: 'ballistic-skill', baseValue: weapon.ballisticSkill, ...modifierPlan.ballisticSkill }).accepted)
    && (modifierPlan.hitRoll === undefined || resolveDieRollModifierPlan({ rollKind: 'hit', unmodifiedRoll: 1, sides: 6, ...modifierPlan.hitRoll }).accepted)
  );
  if (!weapon.id.trim() || !weapon.displayName.trim()
    || (weapon.weaponType !== undefined && weapon.weaponType !== 'ranged' && weapon.weaponType !== 'melee')
    || (weapon.weaponType === 'melee' && weapon.range !== 0)
    || ![weapon.range, weapon.attacks, weapon.ballisticSkill, weapon.strength, weapon.damage].every((value) => Number.isInteger(value) && value >= 0)
    || weapon.attacks <= 0 || weapon.ballisticSkill < 2 || weapon.ballisticSkill > 6 || weapon.strength <= 0 || weapon.damage <= 0
    || !Number.isInteger(weapon.armourPenetration) || weapon.armourPenetration > 0
    || !hasSupportedAttackVolumeAbilities(weapon)
    || (weapon.randomAttacks !== undefined && !parseRandomCharacteristicExpression(weapon.randomAttacks).accepted)
    || (weapon.randomDamage !== undefined && !parseRandomCharacteristicExpression(weapon.randomDamage).accepted)
    || !hasSupportedWeaponKeywords(weapon.weaponKeywords)
    || !modifiersValid) {
    throw new Error(`Unit ${unitId} has an invalid weapon profile.`);
  }
  assertSourceReferences(weapon.sourceRefs, `Weapon ${weapon.id}`);
}

function replayWeaponCharacteristic(
  weapon: UnitSetup['weaponProfiles'][number],
  characteristic: 'range' | 'attacks' | 'ballisticSkill',
  baseValue: number
): { readonly value: number; readonly sourceRefs: readonly SourceReferenceV1[] } {
  const modifierSet = weapon.modifierPlan?.[characteristic];
  if (!modifierSet) return { value: baseValue, sourceRefs: [] };
  const mappedCharacteristic = characteristic === 'ballisticSkill' ? 'ballistic-skill' : characteristic;
  const resolution = resolveCharacteristicModifierPlan({ characteristic: mappedCharacteristic, baseValue, ...modifierSet });
  if (!resolution.accepted) throw new Error(`Weapon ${weapon.id} has an invalid modifier plan.`);
  return { value: resolution.value, sourceRefs: resolution.sourceRefs };
}

function replayHitRollModifiers(weapon: UnitSetup['weaponProfiles'][number]): { readonly plan?: NonNullable<UnitSetup['weaponProfiles'][number]['modifierPlan']>['hitRoll']; readonly sourceRefs: readonly SourceReferenceV1[] } {
  const plan = weapon.modifierPlan?.hitRoll;
  if (!plan) return { sourceRefs: [] };
  const validation = resolveDieRollModifierPlan({ rollKind: 'hit', unmodifiedRoll: 1, sides: 6, ...plan });
  if (!validation.accepted) throw new Error(`Weapon ${weapon.id} has an invalid hit roll modifier plan.`);
  return { plan, sourceRefs: validation.sourceRefs };
}

function hasValidCoverageSubject(value: UnitSetup['coverageSubject']): boolean {
  return value === undefined || (
    typeof value === 'object'
    && value !== null
    && (value.subjectType === 'fixture-unit' || value.subjectType === 'unit')
    && typeof value.subjectId === 'string'
    && value.subjectId.trim().length > 0
  );
}

function assertValidUnits(session: SessionSetup, playerIds: ReadonlySet<string>, modelIds: ReadonlySet<string>, modelOwners: Readonly<Record<string, string>>): void {
  const unitIds = new Set<string>();
  const allocatedModelIds = new Set<string>();
  for (const unit of session.units ?? []) {
    if (!unit.id.trim() || !unit.fixtureId.trim() || unitIds.has(unit.id) || !playerIds.has(unit.playerId)
      || !Number.isInteger(unit.toughness) || unit.toughness <= 0
      || !Number.isInteger(unit.save) || unit.save < 2 || unit.save > 7
      || !Number.isInteger(unit.woundsPerModel) || unit.woundsPerModel <= 0
      || (unit.leadership !== undefined && (!Number.isInteger(unit.leadership) || unit.leadership < 2 || unit.leadership > 12))
      || (unit.objectiveControl !== undefined && (!Number.isInteger(unit.objectiveControl) || unit.objectiveControl < 0))
      || (unit.movement !== undefined && (!Number.isInteger(unit.movement) || unit.movement <= 0))
      || unit.modelIds.length === 0 || new Set(unit.modelIds).size !== unit.modelIds.length
      || unit.modelIds.some((modelId) => !modelId.trim() || !modelIds.has(modelId) || modelOwners[modelId] !== unit.playerId || allocatedModelIds.has(modelId))
      || new Set(unit.keywords).size !== unit.keywords.length || unit.keywords.some((keyword) => !keyword.trim())
      || unit.weaponProfiles.length === 0 || new Set(unit.weaponProfiles.map((weapon) => weapon.id)).size !== unit.weaponProfiles.length) {
      throw new Error('Session unit setup is malformed.');
    }
    unitIds.add(unit.id);
    if (!hasValidCoverageSubject(unit.coverageSubject)) {
      throw new Error('Session unit coverage subject is malformed.');
    }
    unit.modelIds.forEach((modelId) => allocatedModelIds.add(modelId));
    assertSourceReferences(unit.sourceRefs, `Unit ${unit.id}`);
    unit.weaponProfiles.forEach((weapon) => assertValidWeapon(weapon, unit.id));
    const weaponIds = new Set(unit.weaponProfiles.map((weapon) => weapon.id));
    const assignmentKeys = new Set<string>();
    if ((unit.weaponAssignments ?? []).some((assignment) => {
      const key = `${assignment.modelId}:${assignment.weaponProfileId}`;
      const invalid = !unit.modelIds.includes(assignment.modelId)
        || !weaponIds.has(assignment.weaponProfileId)
        || !Number.isInteger(assignment.quantity)
        || assignment.quantity < 1
        || assignmentKeys.has(key);
      assignmentKeys.add(key);
      return invalid;
    })) throw new Error(`Unit ${unit.id} has invalid weapon assignments.`);
    if (unit.extendedDefence !== undefined) {
      if (unit.coverageSubject?.subjectType === 'unit'
        || Object.keys(unit.extendedDefence).some((modelId) => !unit.modelIds.includes(modelId)
          || ![undefined, 2, 3, 4, 5, 6].includes(unit.extendedDefence![modelId]?.invulnerableSave)
          || ![undefined, 2, 3, 4, 5, 6].includes(unit.extendedDefence![modelId]?.feelNoPain)
          || (unit.extendedDefence![modelId]?.isCharacter !== undefined && typeof unit.extendedDefence![modelId]?.isCharacter !== 'boolean')
          || !unit.extendedDefence![modelId]?.source?.sourceId?.trim()
          || !unit.extendedDefence![modelId]?.source?.version?.trim()
          || Number.isNaN(Date.parse(unit.extendedDefence![modelId]?.source?.effectiveFrom ?? ''))
          || (unit.extendedDefence![modelId]?.allocationGroupId !== undefined && !unit.extendedDefence![modelId]!.allocationGroupId!.trim()))) {
        throw new Error(`Unit ${unit.id} has invalid extended fixture defence.`);
      }
    }
  }
}

function assertValidSession(session: SessionSetup): void {
  if (session.manifest.schemaVersion !== 'warforge-simulator/v1' || session.players.length !== 2) throw new Error('Session setup is malformed.');
  const playerIds = new Set<string>();
  for (const player of session.players) {
    if (!player.id.trim() || playerIds.has(player.id)) throw new Error('Session players must have unique non-empty IDs.');
    playerIds.add(player.id);
  }
  const modelIds = new Set<string>();
  const modelOwners: Record<string, string> = {};
  for (const model of session.models) {
    if (!model.id.trim() || modelIds.has(model.id) || !playerIds.has(model.playerId) || !model.profileId.trim() || !isIntegerPoint(model.position) || !isValidOrientation(model.orientationDegrees)) {
      throw new Error('Session model setup is malformed.');
    }
    modelIds.add(model.id);
    modelOwners[model.id] = model.playerId;
  }
  assertValidUnits(session, playerIds, modelIds, modelOwners);
  if (session.completeGame !== undefined) assertCompleteGameSessionSetupV1(session.completeGame, session);
}

function sessionRecords(session: SessionSetup): { readonly players: Readonly<Record<string, PlayerSetup>>; readonly models: Readonly<Record<string, ModelState>>; readonly units: Readonly<Record<string, UnitState>> } {
  const players: Record<string, PlayerSetup> = {};
  const models: Record<string, ModelState> = {};
  const units: Record<string, UnitState> = {};
  for (const player of session.players) players[player.id] = player;
  for (const model of session.models) {
    models[model.id] = {
      id: model.id,
      playerId: model.playerId,
      profileId: model.profileId,
      position: model.position,
      orientationDegrees: model.orientationDegrees,
      active: true
    };
  }
  for (const unit of session.units ?? []) {
    const sortedModelIds = [...unit.modelIds].sort((left, right) => left.localeCompare(right));
    const weaponAssignments = [...(unit.weaponAssignments ?? [])]
      .sort((left, right) => left.modelId.localeCompare(right.modelId) || left.weaponProfileId.localeCompare(right.weaponProfileId));
    units[unit.id] = {
      id: unit.id,
      fixtureId: unit.fixtureId,
      ...(unit.coverageSubject === undefined ? {} : { coverageSubject: unit.coverageSubject }),
      playerId: unit.playerId,
      ...(unit.movement === undefined ? {} : { movement: unit.movement }),
      keywords: [...unit.keywords],
      toughness: unit.toughness,
      save: unit.save,
      woundsPerModel: unit.woundsPerModel,
      initialStrength: sortedModelIds.length,
      ...(unit.leadership === undefined ? {} : { leadership: unit.leadership }),
      ...(unit.objectiveControl === undefined ? {} : { objectiveControl: unit.objectiveControl }),
      weaponProfiles: [...unit.weaponProfiles],
      weaponAssignments,
      ...(unit.extendedDefence === undefined ? {} : { extendedDefence: structuredClone(unit.extendedDefence) }),
      sourceRefs: [...unit.sourceRefs],
      models: sortedModelIds.map((id) => ({ id, wounds: unit.woundsPerModel, active: true }))
    };
  }
  return { players, models, units };
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sourceReferenceKey(reference: SourceReferenceV1): string {
  return JSON.stringify({ sourceId: reference.sourceId, version: reference.version, effectiveFrom: reference.effectiveFrom, page: reference.page, reference: reference.reference });
}

function unitTurnStatusesFor(state: GameState, playerId: string): GameState['unitTurnStatuses'] {
  return Object.fromEntries(Object.values(state.units)
    .filter((unit) => unit.playerId === playerId && state.battle?.deployedUnitIds.includes(unit.id) && unit.models.some((model) => model.active))
    .map((unit) => [unit.id, { selectedForMovement: false, movementType: null, advanced: false, fellBack: false }]));
}

function uniqueSourceReferences(references: readonly SourceReferenceV1[]): readonly SourceReferenceV1[] {
  return [...new Map(references.map((reference) => [sourceReferenceKey(reference), reference])).values()];
}

function journalContainsM8Event(state: GameState): boolean {
  return state.eventLog.some((event) => event.type === 'objective-control-resolved'
    || event.type === 'command-stage-resolved'
    || event.type === 'battle-shock-test-resolved'
    || event.type === 'insane-bravery-used'
    || event.type === 'counter-offensive-used'
    || (event.type === 'battle-phase-advanced' && event.timedEffectExpirations !== undefined));
}

const COVERED_DECISION_KINDS = new Set([
  'lethal-hits-choice',
  'generic-reroll-choice',
  'extended-allocation-group',
  'extended-allocation-model',
  'extended-hazardous-allocation',
  'basic-melee-allocation',
  'split-fire-retarget',
  'duplicate-weapon-ability'
]);

function attackModifiersFor(state: GameState, attacker: UnitState, target: UnitState): {
  readonly rerollFailedHits: boolean;
  readonly woundRollModifier: 0 | 1;
  readonly sourceRuleIds: readonly string[];
  readonly sourceRefs: readonly SourceReferenceV1[];
} {
  const selection = state.oathOfMomentSelections[attacker.playerId];
  if (!selection || selection.targetUnitId !== target.id || selection.round !== state.round) {
    return { rerollFailedHits: false, woundRollModifier: 0, sourceRuleIds: [], sourceRefs: [] };
  }
  return {
    rerollFailedHits: selection.rerollFailedHits,
    woundRollModifier: selection.woundRollModifier,
    sourceRuleIds: [selection.ruleId],
    sourceRefs: selection.sourceRefs
  };
}

function isValidOathSelection(selection: OathOfMomentSelectionV1, state: GameState): boolean {
  return selection.ruleId === 'adeptus-astartes.oath-of-moment'
    && !!state.players[selection.playerId]
    && !!state.units[selection.targetUnitId]
    && state.units[selection.targetUnitId].playerId !== selection.playerId
    && selection.round === state.round
    && selection.rerollFailedHits === true
    && (selection.woundRollModifier === 0 || selection.woundRollModifier === 1)
    && selection.sourceRefs.length > 0;
}

function resultFromShootingResolution(resolution: Extract<ReturnType<typeof resolveBasicShooting>, { readonly accepted: true }>): BasicShootingResult {
  return {
    hitRequired: resolution.hitRequired,
    woundRequired: resolution.woundRequired,
    saveRequired: resolution.saveRequired,
    hits: resolution.hits,
    wounds: resolution.wounds,
    failedSaves: resolution.failedSaves,
    damageInflicted: resolution.damageInflicted,
    modelsDestroyed: resolution.modelsDestroyed,
    remainingModels: resolution.remainingModels,
    remainingWoundsOnDamagedModel: resolution.remainingWoundsOnDamagedModel
  };
}

function expectedLethalDecisionId(resolution: NonNullable<GameState['pendingLethalShooting']>, key: { readonly groupIndex: number; readonly attackIndex: number }): string {
  return `${resolution.originCommandId}:lethal:${key.groupIndex}:${key.attackIndex}`;
}

function hasExactLethalDecisionShape(
  decision: DecisionRequest,
  resolution: NonNullable<GameState['pendingLethalShooting']>,
  playerId: string
): boolean {
  const key = resolution.criticalHitKeys[resolution.choices.length];
  return key !== undefined
    && decision.id === expectedLethalDecisionId(resolution, key)
    && decision.kind === 'lethal-hits-choice'
    && decision.playerId === playerId
    && decision.prompt === '[TOUCHES FATALES] : choisir la résolution de cette touche critique.'
    && sameJson(decision.options, [
      { id: 'auto-wound', label: 'Blesser automatiquement' },
      { id: 'roll-to-wound', label: 'Faire le jet de blessure' }
    ])
    && sameJson(decision.sourceRuleIds, ['core.weapon-ability.lethal-hits']);
}

function expectedRerollDecisionId(resolution: PendingRerollShootingResolutionV1, key: { readonly groupIndex: number; readonly attackIndex: number }): string {
  return `${resolution.originCommandId}:reroll:${resolution.stage}:${key.groupIndex}:${key.attackIndex}`;
}

function hasExactRerollDecisionShape(decision: DecisionRequest, resolution: PendingRerollShootingResolutionV1, playerId: string): boolean {
  const key = resolution.eligibleKeys[resolution.choices.length];
  const label = resolution.stage === 'hit' ? 'touche' : 'blessure';
  return key !== undefined
    && decision.id === expectedRerollDecisionId(resolution, key)
    && decision.kind === 'generic-reroll-choice'
    && decision.playerId === playerId
    && decision.prompt === `Relance : choisir de conserver ou relancer ce jet de ${label}.`
    && sameJson(decision.options, [{ id: 'keep', label: 'Conserver le dé' }, { id: 'reroll', label: 'Relancer le dé' }])
    && sameJson(decision.sourceRuleIds, ['simulator.fixture-generic-rerolls-v1']);
}

function currentExtendedAllocationGroup(resolution: PendingExtendedShootingResolutionV1, target: UnitState | undefined) {
  if (!target) return undefined;
  return resolution.groupPlan
    .map((groupId) => resolution.allocationGroups.find((group) => group.id === groupId))
    .find((group) => group !== undefined && group.modelIds.some((modelId) => target.models.some((model) => model.id === modelId && model.active)));
}

function currentExtendedPacketIndex(resolution: PendingExtendedShootingResolutionV1): number | undefined {
  return resolution.awaitingAllocationPacketIndex ?? resolution.allocationOrder?.[resolution.resolvedPacketCount];
}

function prioritizedExtendedModels(unit: UnitState): readonly UnitState['models'][number][] {
  const active = unit.models.filter((model) => model.active);
  const rank = (model: UnitState['models'][number]) => {
    const character = unit.extendedDefence?.[model.id]?.isCharacter === true;
    const wounded = model.wounds < unit.woundsPerModel;
    return character ? (wounded ? 2 : 3) : (wounded ? 0 : 1);
  };
  const best = Math.min(...active.map(rank));
  return active.filter((model) => rank(model) === best);
}

function expectedExtendedDecisionId(resolution: PendingExtendedShootingResolutionV1): string {
  if (resolution.stage === 'group-planning') return `${resolution.originCommandId}:extended:group:${resolution.groupPlan.length}`;
  const packetIndex = currentExtendedPacketIndex(resolution);
  const packet = packetIndex === undefined ? undefined : resolution.packets[packetIndex];
  if (!packet) throw new Error('An extended allocation decision requires an unresolved packet.');
  return `${resolution.originCommandId}:extended:${packet.packetIndex}:model`;
}

function hasExactExtendedDecisionShape(decision: DecisionRequest, resolution: PendingExtendedShootingResolutionV1, playerId: string): boolean {
  if (resolution.stage === 'hazardous-allocation') {
    return decision.id === `${resolution.originCommandId}:hazardous:${resolution.hazardousWoundsRemaining}`
      && decision.kind === 'extended-hazardous-allocation' && decision.playerId === playerId
      && sameJson(decision.sourceRuleIds, ['core.mortal-wounds-allocation']) && decision.options.length > 0;
  }
  const packetIndex = resolution.stage === 'group-planning' ? undefined : currentExtendedPacketIndex(resolution);
  const packet = packetIndex === undefined ? undefined : resolution.packets[packetIndex];
  if ((resolution.stage !== 'group-planning' && !packet) || decision.id !== expectedExtendedDecisionId(resolution) || decision.playerId !== playerId
    || decision.kind !== (resolution.stage === 'group-planning' ? 'extended-allocation-group' : 'extended-allocation-model')
    || decision.sourceRuleIds.length !== 1 || decision.sourceRuleIds[0] !== 'core.allocate-attack') return false;
  return decision.options.length > 0 && new Set(decision.options.map((option) => option.id)).size === decision.options.length
    && decision.options.every((option) => option.id.trim() && option.label.trim());
}

function splitFireRetargetDecision(resolution: PendingSplitFireShootingResolutionV1, playerId: string): DecisionRequest {
  const declaration = resolution.declarations[resolution.nextResolutionIndex];
  if (!declaration) throw new Error('A split-fire retarget decision requires an unresolved declaration.');
  return {
    id: `${resolution.originCommandId}:split-fire:retarget:${resolution.nextResolutionIndex}`,
    kind: 'split-fire-retarget',
    playerId,
    prompt: 'La cible choisie n’a plus de figurine active : choisissez une nouvelle cible légale ou abandonnez cette instance.',
    options: [
      { id: 'abandon', label: 'Abandonner cette instance' },
      ...resolution.retargetOptionTargetUnitIds.map((targetUnitId) => ({ id: targetUnitId, label: targetUnitId }))
    ],
    sourceRuleIds: ['core.attack-target-no-longer-eligible']
  };
}

function hasExactSplitFireRetargetDecisionShape(decision: DecisionRequest, resolution: PendingSplitFireShootingResolutionV1, playerId: string): boolean {
  const expected = splitFireRetargetDecision(resolution, playerId);
  return sameJson(decision, expected);
}

function duplicateAbilityDecision(selection: PendingDuplicateWeaponAbilitySelectionV1, playerId: string): DecisionRequest {
  return {
    id: `${selection.originCommand.id}:duplicate-ability:${selection.weaponProfileId}:${selection.kind}`,
    kind: 'duplicate-weapon-ability',
    playerId,
    prompt: '[TOUCHES SOUTENUES] est présente plusieurs fois : choisissez une seule occurrence applicable.',
    options: selection.occurrenceIndexes.map((index) => ({ id: String(index), label: `Occurrence ${index + 1}` })),
    sourceRuleIds: ['core.duplicate-abilities']
  };
}

function hasExactDuplicateAbilityDecisionShape(decision: DecisionRequest, selection: PendingDuplicateWeaponAbilitySelectionV1, playerId: string): boolean {
  return sameJson(decision, duplicateAbilityDecision(selection, playerId));
}

function applySplitFireResolutions(
  state: GameState,
  attacker: UnitState,
  resolutions: readonly SplitFireResolutionV1[],
  knownCasualtyIds: ReadonlySet<string> = new Set()
): { readonly units: Readonly<Record<string, UnitState>>; readonly models: Readonly<Record<string, ModelState>>; readonly weaponProfileIds: ReadonlySet<string> } {
  const nextUnits: Record<string, UnitState> = { ...state.units };
  const nextModels: Record<string, ModelState> = { ...state.models };
  const weaponProfileIds = new Set<string>();
  const casualties = new Set(knownCasualtyIds);
  for (const resolution of resolutions) {
    const declaration = resolution.declaration;
    const target = nextUnits[declaration.targetUnitId];
    const weapon = attacker.weaponProfiles.find((profile) => profile.id === declaration.weaponProfileId);
    const carrier = attacker.models.find((model) => model.id === declaration.firingModelId && model.active);
    const assignment = attacker.weaponAssignments.find((entry) => entry.modelId === declaration.firingModelId && entry.weaponProfileId === declaration.weaponProfileId);
    const instanceValid = assignment !== undefined && declaration.weaponInstanceIndex >= 0 && declaration.weaponInstanceIndex < assignment.quantity;
    if (!target || target.playerId === attacker.playerId || target.coverageSubject?.subjectType === 'unit' || target.extendedDefence !== undefined
      || !weapon || !carrier || !instanceValid || !declaration.id.trim() || !declaration.targetUnitId.trim()
      || weapon.randomAttacks !== undefined || weapon.randomDamage !== undefined || weapon.modifierPlan !== undefined
      || (weapon.attackVolumeAbilities?.length ?? 0) !== 0 || (weapon.weaponKeywords?.length ?? 0) !== 0) {
      throw new Error('Split fire has an invalid fixture declaration.');
    }
    const targetIds = target.models.map((model) => model.id).sort();
    if (resolution.outcome === 'target-no-longer-active') {
      if (target.models.some((model) => model.active) || resolution.attackGroup !== undefined || resolution.casualtyModelIds.length !== 0
        || !sameJson(resolution.targetModelsAfter, target.models)) throw new Error('Split fire incorrectly skips an active target.');
      weaponProfileIds.add(weapon.id);
      continue;
    }
    const group = resolution.attackGroup;
    if (!group || !target.models.some((model) => model.active)
      || group.firingModelId !== declaration.firingModelId || group.weaponProfileId !== declaration.weaponProfileId
      || group.weaponInstanceIndex !== declaration.weaponInstanceIndex || group.weaponCount !== 1
      || !sameJson(resolution.targetModelsAfter.map((model) => model.id).sort(), targetIds)
      || resolution.casualtyModelIds.some((id) => !target.models.some((model) => model.id === id && model.active) || casualties.has(id))) {
      throw new Error('Split fire has an invalid target-wise result.');
    }
    for (const casualtyModelId of resolution.casualtyModelIds) {
      const model = nextModels[casualtyModelId];
      if (!model || !model.active) throw new Error('Split fire has an invalid casualty model.');
      casualties.add(casualtyModelId);
      nextModels[casualtyModelId] = { ...model, active: false };
    }
    nextUnits[target.id] = { ...target, models: resolution.targetModelsAfter };
    weaponProfileIds.add(weapon.id);
  }
  return { units: nextUnits, models: nextModels, weaponProfileIds };
}

/** Applies an already validated event. It never mutates the prior state. */
export function unsafeReduceGameEvent(state: GameState, event: GameEvent): GameState {
  if (state.eventLog.some((previous) => previous.id === event.id)) throw new Error(`Event ${event.id} has already been applied.`);
  const previousSameCommand = [...state.eventLog].reverse().find((previous) => previous.commandId === event.commandId);
  const repeatedCommandIsObjectiveCheckpoint = (event.type === 'objective-control-resolved'
      && event.checkpoint.boundary === 'turn-end'
      && previousSameCommand?.type === 'objective-control-resolved'
      && previousSameCommand.checkpoint.boundary === 'phase-end')
    || (event.type === 'battle-phase-advanced' && previousSameCommand?.type === 'objective-control-resolved')
    || (event.type === 'mission-scoring-resolved' && previousSameCommand?.type === 'objective-control-resolved');
  const repeatedCommandIsShootingContinuation = (event.type === 'decision-requested' && (event.decision.kind === 'lethal-hits-choice' || event.decision.kind === 'generic-reroll-choice' || event.decision.kind === 'extended-allocation-group' || event.decision.kind === 'extended-allocation-model' || event.decision.kind === 'extended-hazardous-allocation' || event.decision.kind === 'split-fire-retarget' || event.decision.kind === 'duplicate-weapon-ability' || event.decision.kind === 'basic-melee-allocation'))
    || event.type === 'basic-melee-allocation-resolved'
    || event.type === 'basic-melee-resolved'
    || event.type === 'split-fire-stage-resolved'
    || event.type === 'split-fire-completed'
    || event.type === 'basic-shooting-completed'
    || event.type === 'basic-shooting-reroll-stage-resolved'
    || event.type === 'basic-shooting-reroll-completed'
    || event.type === 'extended-shooting-stage-resolved'
    || event.type === 'extended-shooting-save-stage-resolved'
    || event.type === 'extended-shooting-save-resolved'
    || event.type === 'extended-shooting-allocation-choice-resolved'
    || event.type === 'extended-shooting-packet-resolved'
    || event.type === 'extended-shooting-packet-lost'
    || event.type === 'extended-shooting-hazardous-resolved'
    || event.type === 'extended-shooting-hazardous-packet-resolved'
    || event.type === 'extended-shooting-hazardous-wounds-lost'
    || event.type === 'extended-shooting-completed'
    || (event.type === 'basic-shooting-resolved' && state.pendingDuplicateWeaponAbilitySelection?.selection !== undefined);
  if (previousSameCommand && !repeatedCommandIsShootingContinuation && !repeatedCommandIsObjectiveCheckpoint) throw new Error(`Command ${event.commandId} has already produced an event.`);
  if (state.phase === 'completed') throw new Error(`Event ${event.id} cannot be applied after game completion.`);
  if (state.battle !== null && state.battle !== undefined
    && ![
      'unit-deployed', 'first-player-determined', 'battle-started', 'objective-control-resolved', 'mission-scoring-resolved', 'battle-phase-advanced',
      'command-stage-resolved', 'battle-shock-test-resolved', 'insane-bravery-used', 'counter-offensive-used',
      'unit-movement-resolved', 'charge-declared', 'charge-resolved', 'fight-window-passed', 'fight-movement-resolved',
      'basic-melee-stage-resolved', 'basic-melee-allocation-resolved', 'basic-melee-resolved', 'empty-fight-resolved',
      'basic-shooting-resolved', 'basic-shooting-hit-stage-resolved', 'basic-shooting-lethal-choice-resolved',
      'basic-shooting-completed', 'basic-shooting-reroll-stage-resolved', 'basic-shooting-reroll-choice-resolved',
      'basic-shooting-reroll-completed', 'split-fire-resolved', 'split-fire-stage-resolved',
      'split-fire-retarget-choice-resolved', 'split-fire-completed', 'duplicate-weapon-ability-selection-requested',
      'duplicate-weapon-ability-choice-resolved', 'extended-shooting-one-shot-selected',
      'extended-shooting-stage-resolved', 'extended-shooting-save-stage-resolved', 'extended-shooting-save-resolved',
      'extended-shooting-allocation-choice-resolved', 'extended-shooting-packet-resolved',
      'extended-shooting-packet-lost', 'extended-shooting-hazardous-resolved',
      'extended-shooting-hazardous-packet-resolved', 'extended-shooting-hazardous-wounds-lost',
      'extended-shooting-completed', 'oath-of-moment-selected', 'decision-requested'
    ].includes(event.type)) {
    throw new Error(`Event ${event.id} does not belong to the covered V6 complete-game stream.`);
  }
  if (state.pendingDecisions.length > 0 && event.type !== 'decision-resolved' && event.type !== 'basic-shooting-lethal-choice-resolved' && event.type !== 'basic-shooting-reroll-choice-resolved' && event.type !== 'extended-shooting-allocation-choice-resolved' && event.type !== 'split-fire-retarget-choice-resolved' && event.type !== 'duplicate-weapon-ability-choice-resolved' && event.type !== 'basic-melee-allocation-resolved') throw new Error(`Event ${event.id} cannot bypass a pending decision.`);
  if (state.pendingCharge !== null && state.pendingCharge !== undefined && event.type !== 'charge-resolved') throw new Error(`Event ${event.id} cannot bypass a pending charge resolution.`);
  let next: GameState;
  switch (event.type) {
    case 'session-setup': {
      if (state.phase !== 'setup' || state.manifest !== null) throw new Error('A session can only be set up once.');
      assertValidSession(event.session);
      const records = sessionRecords(event.session);
      const completeGame = event.session.completeGame;
      next = {
        ...state,
        manifest: event.session.manifest,
        shootingEnvironmentFingerprint: event.session.shootingEnvironmentFingerprint ?? null,
        movedModelIds: [],
        firedWeaponKeys: [],
        shootingSelectedUnitIds: [],
        spentOneShotWeaponInstanceKeys: [],
        oathOfMomentSelections: {},
        pendingLethalShooting: null,
        pendingRerollShooting: null,
        pendingExtendedShooting: null,
        pendingBasicMelee: null,
        pendingSplitFireShooting: null,
        pendingDuplicateWeaponAbilitySelection: null,
        pendingCharge: null,
        fightPhase: null,
        players: records.players,
        models: records.models,
        units: records.units,
        unitTurnStatuses: {},
        battle: completeGame === undefined ? null : createBattleStateV1(completeGame),
        commandPhase: null,
        battleResources: completeGame === undefined ? null : createBattleResourcesV1(completeGame.battle.playerIds),
        mission: completeGame === undefined ? null : createMissionStateV1(completeGame),
        resolutionQueue: createResolutionQueueV1(),
        phase: 'deployment'
      };
      break;
    }
    case 'unit-deployed': {
      const battle = state.battle;
      const unit = state.units[event.unitId];
      const expectedModelIds = unit === undefined ? [] : [...unit.models.map((model) => model.id)].sort();
      const actualModelIds = event.modelPoses.map((pose) => pose.modelId).sort();
      const zone = battle?.deploymentZones.find((candidate) => candidate.playerId === event.playerId);
      const deployedUnitIds = battle === null ? [] : [...battle.deployedUnitIds, event.unitId];
      const expectedNextPlayerId = battle === null ? null : nextDeploymentPlayerIdV1(battle.playerIds, event.playerId, deployedUnitIds, state.units);
      if (battle === null || battle.lifecycle !== 'deployment' || state.phase !== 'deployment'
        || battle.nextDeploymentPlayerId !== event.playerId || !unit || unit.playerId !== event.playerId
        || battle.deployedUnitIds.includes(unit.id) || unit.keywords.includes('TITANIC')
        || event.environmentFingerprint !== state.shootingEnvironmentFingerprint
        || event.modelPoses.length !== expectedModelIds.length || new Set(actualModelIds).size !== actualModelIds.length
        || expectedModelIds.some((modelId, index) => modelId !== actualModelIds[index])
        || event.modelPoses.some((pose) => !isIntegerPoint(pose.position) || !isValidOrientation(pose.orientationDegrees))
        || zone?.id !== event.evidence.zoneId
        || event.evidence.containment.length !== expectedModelIds.length
        || [...event.evidence.containment.map((entry) => entry.modelId)].sort().some((modelId, index) => modelId !== expectedModelIds[index])
        || event.evidence.coherency.incoherentModelIds.length !== 0 || event.evidence.coherency.distantPairs.length !== 0
        || event.nextPlayerId !== expectedNextPlayerId
        || event.deploymentComplete !== (expectedNextPlayerId === null)) {
        throw new Error(`Deployment event ${event.id} does not match the current battle state.`);
      }
      assertSourceReferences(event.sourceRefs, `Deployment event ${event.id}`);
      const models = { ...state.models };
      for (const pose of event.modelPoses) {
        const model = models[pose.modelId];
        if (!model) throw new Error(`Deployment event ${event.id} references an unknown model.`);
        models[pose.modelId] = { ...model, position: pose.position, orientationDegrees: pose.orientationDegrees };
      }
      next = {
        ...state,
        models,
        battle: {
          ...battle,
          lifecycle: expectedNextPlayerId === null ? 'awaiting-first-player' : 'deployment',
          nextDeploymentPlayerId: expectedNextPlayerId,
          deployedUnitIds,
          deploymentOrder: [...battle.deploymentOrder, unit.id]
        }
      };
      break;
    }
    case 'first-player-determined': {
      const battle = state.battle;
      if (battle === null || battle.lifecycle !== 'awaiting-first-player' || battle.nextDeploymentPlayerId !== null
        || !prngStatesEqual(state.prng, event.prngBefore)) {
        throw new Error(`First-player event ${event.id} is outside its roll-off window.`);
      }
      const expected = resolveFirstPlayerRollOffV1(state.prng, battle.playerIds);
      if (expected.winnerPlayerId !== event.winnerPlayerId || !sameJson(expected.rollOffs, event.rollOffs)
        || !prngStatesEqual(expected.prngAfter, event.prngAfter)
        || !sameJson(event.sourceRefs, [EVENT_COMPANION_FIRST_TURN_SOURCE])) {
        throw new Error(`First-player event ${event.id} does not match the deterministic roll-off.`);
      }
      next = {
        ...state,
        prng: event.prngAfter,
        battle: {
          ...battle,
          lifecycle: 'ready-to-start',
          firstPlayerId: event.winnerPlayerId,
          activePlayerId: event.winnerPlayerId
        }
      };
      break;
    }
    case 'battle-started': {
      const battle = state.battle;
      if (battle === null || battle.lifecycle !== 'ready-to-start' || battle.firstPlayerId === null
        || event.battleRound !== 1 || event.turnNumber !== 1 || event.activePlayerId !== battle.firstPlayerId
        || !sameJson(event.sourceRefs, [CORE_BATTLE_ROUND_SOURCE, EVENT_COMPANION_FIVE_ROUNDS_SOURCE])) {
        throw new Error(`Battle start event ${event.id} does not match the ready battle state.`);
      }
      next = {
        ...state,
        phase: 'command',
        round: 1,
        unitTurnStatuses: unitTurnStatusesFor(state, event.activePlayerId),
        commandPhase: createCommandPhaseStateV1(event.activePlayerId),
        battle: { ...battle, lifecycle: 'in-progress', battleRound: 1, turnNumber: 1, activePlayerId: event.activePlayerId, phase: 'command' },
        mission: state.mission === null ? null : { ...state.mission, lifecycle: 'in-progress' }
      };
      break;
    }
    case 'objective-control-resolved': {
      const battle = state.battle;
      const mission = state.mission;
      const expectedSources = [CORE_TERRAIN_OBJECTIVE_SOURCE, CORE_OBJECTIVE_CONTROL_SOURCE, OFFICIAL_APP_TERRAIN_OBJECTIVE_SOURCE, OFFICIAL_APP_OBJECTIVE_MARKER_SOURCE];
      const expectedCheckpoint = battle === null ? null : {
        battleRound: battle.battleRound,
        turnNumber: battle.turnNumber,
        phase: battle.phase,
        boundary: event.checkpoint.boundary
      };
      const expectedObjectiveIds = [...(mission?.objectiveMarkers.map((marker) => marker.id) ?? [])].sort();
      const actualObjectiveIds = event.resolutions.map((resolution) => resolution.objectiveId);
      if (!battle || battle.lifecycle !== 'in-progress' || !mission || mission.lifecycle !== 'in-progress'
        || !['phase-end', 'turn-end'].includes(event.checkpoint.boundary)
        || (event.checkpoint.boundary === 'turn-end' && battle.phase !== 'fight')
        || (event.checkpoint.boundary === 'turn-end'
          && (previousSameCommand?.type !== 'objective-control-resolved' || previousSameCommand.checkpoint.boundary !== 'phase-end'))
        || event.environmentFingerprint !== state.shootingEnvironmentFingerprint
        || !sameJson(event.checkpoint, expectedCheckpoint)
        || !sameJson(event.sourceRefs, expectedSources)
        || !sameJson(actualObjectiveIds, expectedObjectiveIds)
        || mission.objectiveControlEventIds.includes(event.id)) {
        throw new Error(`Objective-control event ${event.id} is outside its deterministic checkpoint.`);
      }
      const playerIds = [...battle.playerIds];
      for (const resolution of event.resolutions) {
        const evidenceIds = resolution.modelEvidence.map((model) => model.modelId);
        if (!sameJson(resolution.checkpoint, event.checkpoint)
          || new Set(evidenceIds).size !== evidenceIds.length
          || !sameJson(evidenceIds, [...evidenceIds].sort((left, right) => left.localeCompare(right)))
          || !sameJson(Object.keys(resolution.controlLevelByPlayerId), playerIds)
          || !sameJson(Object.keys(resolution.controllingUnitIdsByPlayerId), playerIds)) {
          throw new Error(`Objective-control event ${event.id} has malformed deterministic evidence.`);
        }
        for (const evidence of resolution.modelEvidence) {
          const unit = state.units[evidence.unitId];
          const model = unit?.models.find((candidate) => candidate.id === evidence.modelId);
          if (!unit || unit.playerId !== evidence.playerId || !battle.deployedUnitIds.includes(unit.id) || !model?.active
            || !Number.isFinite(evidence.horizontalDistance) || evidence.horizontalDistance < 0
            || !Number.isFinite(evidence.verticalDistance) || evidence.verticalDistance < 0
            || !Number.isSafeInteger(evidence.baseObjectiveControl) || evidence.baseObjectiveControl < 0
            || !Number.isSafeInteger(evidence.effectiveObjectiveControl) || evidence.effectiveObjectiveControl < 0
            || evidence.battleShocked !== (state.battleResources?.battleShockedUnitIds.includes(unit.id) === true)
            || (evidence.battleShocked && evidence.effectiveObjectiveControl !== 0)) {
            throw new Error(`Objective-control event ${event.id} references invalid model evidence.`);
          }
        }
        const expectedLevels = Object.fromEntries(playerIds.map((playerId) => [playerId, resolution.modelEvidence
          .filter((model) => model.playerId === playerId && model.withinRange)
          .reduce((total, model) => total + model.effectiveObjectiveControl, 0)]));
        const [firstPlayerId, secondPlayerId] = playerIds;
        const firstLevel = expectedLevels[firstPlayerId] ?? 0;
        const secondLevel = expectedLevels[secondPlayerId] ?? 0;
        const expectedTied = firstLevel === secondLevel;
        const expectedController = expectedTied ? null : firstLevel > secondLevel ? firstPlayerId : secondPlayerId;
        const expectedControllingUnits = Object.fromEntries(playerIds.map((playerId) => [playerId,
          expectedController !== playerId ? [] : [...new Set(resolution.modelEvidence
            .filter((model) => model.playerId === playerId && model.withinRange && model.effectiveObjectiveControl >= 1)
            .map((model) => model.unitId))].sort((left, right) => left.localeCompare(right))]));
        if (!sameJson(resolution.controlLevelByPlayerId, expectedLevels)
          || resolution.tied !== expectedTied || resolution.controllerPlayerId !== expectedController
          || !sameJson(resolution.controllingUnitIdsByPlayerId, expectedControllingUnits)) {
          throw new Error(`Objective-control event ${event.id} has forged control totals.`);
        }
      }
      next = {
        ...state,
        mission: {
          ...mission,
          objectiveControllers: Object.fromEntries(event.resolutions.map((resolution) => [resolution.objectiveId, resolution.controllerPlayerId])),
          latestObjectiveControlById: Object.fromEntries(event.resolutions.map((resolution) => [resolution.objectiveId, resolution])),
          objectiveControlEventIds: [...mission.objectiveControlEventIds, event.id]
        }
      };
      break;
    }
    case 'mission-scoring-resolved': {
      const battle = state.battle;
      const mission = state.mission;
      if (!battle || battle.lifecycle !== 'in-progress' || battle.activePlayerId === null
        || !mission || mission.scoringProfileId === undefined
        || event.environmentFingerprint !== state.shootingEnvironmentFingerprint
        || event.battleRound !== battle.battleRound || event.turnNumber !== battle.turnNumber
        || event.activePlayerId !== battle.activePlayerId
        || !prngStatesEqual(event.prngBefore, state.prng) || !prngStatesEqual(event.prngAfter, state.prng)
        || !sameJson(event.sourceRefs, missionScoringSourceRefsV1())) {
        throw new Error(`Mission-scoring event ${event.id} is outside its deterministic checkpoint.`);
      }
      const calculation = calculateMissionScoringV1(state, event.evidence);
      if (event.checkpointId !== calculation.checkpointId || event.checkpoint !== calculation.checkpoint
        || !sameJson(event.scoreEvents, calculation.scoreEvents)
        || !sameJson(event.finalResult, calculation.finalResult)) {
        throw new Error(`Mission-scoring event ${event.id} contains forged score totals or evidence.`);
      }
      next = {
        ...state,
        mission: {
          ...mission,
          scoresByPlayerId: calculation.scoresByPlayerId,
          scoreEventIds: [...mission.scoreEventIds, ...event.scoreEvents.map((scoreEvent) => scoreEvent.id)],
          scoreBreakdownByPlayerId: calculation.scoreBreakdownByPlayerId,
          scoredCheckpointIds: [...(mission.scoredCheckpointIds ?? []), calculation.checkpointId],
          scoredAssassinationModelIds: calculation.scoredAssassinationModelIds,
          finalResult: calculation.finalResult
        }
      };
      break;
    }
    case 'battle-phase-advanced': {
      const battle = state.battle;
      if (battle === null) throw new Error(`Battle phase event ${event.id} has no battle state.`);
      if (state.pendingCharge !== null) throw new Error(`Battle phase event ${event.id} bypasses a pending charge.`);
      const objectiveMarkersAreActive = (state.mission?.objectiveMarkers.length ?? 0) > 0;
      const expectedObjectiveBoundary = event.from === 'fight' ? 'turn-end' : 'phase-end';
      const objectiveCheckpointAlreadyResolved = state.mission?.objectiveMarkerIds.every((objectiveId) => {
        const checkpoint = state.mission?.latestObjectiveControlById[objectiveId]?.checkpoint;
        return checkpoint?.battleRound === battle.battleRound && checkpoint.turnNumber === battle.turnNumber
          && checkpoint.phase === event.from && checkpoint.boundary === expectedObjectiveBoundary;
      }) === true;
      if (objectiveMarkersAreActive
        && !objectiveCheckpointAlreadyResolved
        && (previousSameCommand?.type !== 'objective-control-resolved' || previousSameCommand.checkpoint.boundary !== expectedObjectiveBoundary)) {
        throw new Error(`Battle phase event ${event.id} bypasses its mandatory objective-control checkpoint.`);
      }
      // V6 predates M8. Its phase events omitted this additive field and moved
      // directly from Command to Movement. This tolerance closes permanently
      // as soon as the journal contains any M8 event, so an M8 continuation
      // cannot masquerade as a legacy transition.
      const isLegacyPreM8PhaseEvent = event.timedEffectExpirations === undefined && !journalContainsM8Event(state);
      if (event.from === 'command' && state.commandPhase?.stage !== 'complete' && !isLegacyPreM8PhaseEvent) throw new Error(`Battle phase event ${event.id} bypasses an incomplete command phase.`);
      if (event.from === 'fight' && state.fightPhase?.stage !== 'complete') throw new Error(`Battle phase event ${event.id} bypasses an incomplete fight phase.`);
      if (state.mission?.scoringProfileId !== undefined && (event.from === 'command' || event.from === 'fight')) {
        const scoringCheckpoint = event.from === 'command' ? 'end-of-own-command-phase' : 'end-of-own-turn';
        const checkpointId = missionScoringCheckpointIdV1(battle.battleRound, battle.turnNumber, scoringCheckpoint);
        if (!state.mission.scoredCheckpointIds?.includes(checkpointId)) throw new Error(`Battle phase event ${event.id} bypasses mission scoring ${checkpointId}.`);
        if (event.battleCompleted && state.mission.finalResult === null) throw new Error(`Battle phase event ${event.id} bypasses the final mission result.`);
      }
      const expected = nextBattleStepV1(battle);
      const resources = state.battleResources;
      if (resources === null) throw new Error(`Battle phase event ${event.id} has no battle resources.`);
      const expectedExpirations = timedEffectExpirationsForPhaseTransitionV1(
        resources,
        { battleRound: battle.battleRound, turnNumber: battle.turnNumber, phase: event.from },
        { battleRound: event.battleRound, turnNumber: event.turnNumber, phase: event.to }
      );
      if (!sameJson(expected, { from: event.from, to: event.to, battleRound: event.battleRound, turnNumber: event.turnNumber, activePlayerId: event.activePlayerId, battleCompleted: event.battleCompleted })
        || !sameJson(event.timedEffectExpirations ?? [], expectedExpirations)
        || !sameJson(event.sourceRefs, [CORE_BATTLE_ROUND_SOURCE, EVENT_COMPANION_FIVE_ROUNDS_SOURCE])) {
        throw new Error(`Battle phase event ${event.id} does not match the deterministic loop.`);
      }
      if (event.from === 'movement') {
        const remaining = battle.deployedUnitIds.filter((unitId) => {
          const unit = state.units[unitId];
          return unit?.playerId === battle.activePlayerId && unit.models.some((model) => model.active) && !state.unitTurnStatuses[unitId]?.selectedForMovement;
        });
        if (remaining.length > 0) throw new Error(`Battle phase event ${event.id} bypasses unselected movement units.`);
      }
      const startsNewTurn = event.to === 'command' && (event.turnNumber !== battle.turnNumber || event.battleRound !== battle.battleRound);
      next = {
        ...state,
        phase: event.to,
        round: event.battleRound,
        firedWeaponKeys: event.to === 'shooting' ? [] : state.firedWeaponKeys,
        shootingSelectedUnitIds: event.to === 'shooting' ? [] : state.shootingSelectedUnitIds,
        ...(event.to === 'command' ? { oathOfMomentSelections: {} } : {}),
        ...(startsNewTurn && event.activePlayerId !== null ? { unitTurnStatuses: unitTurnStatusesFor(state, event.activePlayerId) } : {}),
        battle: {
          ...battle,
          lifecycle: event.battleCompleted ? 'completed' : 'in-progress',
          battleRound: event.battleRound,
          turnNumber: event.turnNumber,
          activePlayerId: event.activePlayerId,
          phase: event.to
        },
        commandPhase: event.to === 'command' && event.activePlayerId !== null ? createCommandPhaseStateV1(event.activePlayerId) : null,
        battleResources: applyTimedEffectExpirationsV1(resources, expectedExpirations),
        fightPhase: event.to === 'fight' && event.activePlayerId !== null ? {
          schemaVersion: FIGHT_PHASE_V1_SCHEMA_VERSION,
          stage: 'pile-in', activePlayerId: event.activePlayerId, currentPlayerId: event.activePlayerId,
          passedPlayerIds: [], piledInUnitIds: [], eligibleAtFightStartUnitIds: [], selectionBand: null, foughtUnitIds: [], consolidatedUnitIds: []
        } : null,
        ...(event.battleCompleted && state.mission !== null ? { mission: { ...state.mission, lifecycle: 'completed' } } : {})
      };
      break;
    }
    case 'command-stage-resolved': {
      const phase = state.commandPhase;
      const resources = state.battleResources;
      const battle = state.battle;
      if (!phase || !resources || !battle || state.phase !== 'command' || battle.phase !== 'command'
        || phase.activePlayerId !== event.playerId || battle.activePlayerId !== event.playerId
        || phase.stage !== event.from || phase.stage === 'complete' || phase.pendingBattleShockUnitIds.length > 0
        || !prngStatesEqual(event.prngBefore, state.prng) || !prngStatesEqual(event.prngAfter, state.prng)) {
        throw new Error(`Command stage event ${event.id} is outside its deterministic window.`);
      }
      let expectedTo: CommandPhaseStageV1;
      let expectedAfter = phase;
      let expectedGains: Readonly<Record<string, number>> = {};
      let expectedSources: readonly SourceReferenceV1[];
      switch (phase.stage) {
        case 'start':
          expectedTo = 'gain-base-cp'; expectedSources = [CORE_COMMAND_PHASE_START_SOURCE]; break;
        case 'gain-base-cp':
          expectedTo = 'battle-shock';
          expectedGains = Object.fromEntries(battle.playerIds.map((playerId) => [playerId, 1]));
          expectedSources = [CORE_BASE_COMMAND_POINTS_SOURCE];
          break;
        case 'battle-shock': {
          const pending = commandPhaseBattleShockUnitIdsV1(state);
          expectedTo = pending.length === 0 ? 'abilities' : 'battle-shock';
          expectedAfter = { ...phase, stage: expectedTo, pendingBattleShockUnitIds: pending };
          expectedSources = [CORE_COMMAND_PHASE_BATTLE_SHOCK_SOURCE, OFFICIAL_APP_BATTLE_SHOCK_STEP_SOURCE, OFFICIAL_APP_MULTIPLE_BATTLE_SHOCK_SOURCE, OFFICIAL_APP_INITIAL_STRENGTH_SOURCE];
          break;
        }
        case 'abilities': expectedTo = 'end'; expectedSources = [CORE_COMMAND_ABILITIES_SOURCE]; break;
        case 'end': expectedTo = 'complete'; expectedSources = [CORE_COMMAND_PHASE_END_SOURCE]; break;
      }
      if (phase.stage !== 'battle-shock') expectedAfter = { ...phase, stage: expectedTo };
      const moment = { battleRound: battle.battleRound, turnNumber: battle.turnNumber, phase: 'command' as const, boundary: phase.stage === 'start' ? 'start' as const : 'end' as const };
      const expectedExpired = phase.stage === 'start' || phase.stage === 'end' ? dueTimedEffectIdsV1(resources, moment) : [];
      if (event.to !== expectedTo || !sameJson(event.commandPointsGainedByPlayerId, expectedGains)
        || !sameJson(event.commandPhaseAfter, expectedAfter) || !sameJson(event.expiredEffectIds, expectedExpired)
        || !sameJson(event.sourceRefs, expectedSources)) throw new Error(`Command stage event ${event.id} has forged consequences.`);
      const commandPointsByPlayerId = { ...resources.commandPointsByPlayerId };
      for (const [playerId, amount] of Object.entries(expectedGains)) commandPointsByPlayerId[playerId] = (commandPointsByPlayerId[playerId] ?? 0) + amount;
      const withPoints = { ...resources, commandPointsByPlayerId };
      next = {
        ...state,
        commandPhase: event.commandPhaseAfter,
        battleResources: expectedExpired.length === 0 ? withPoints : expireTimedEffectsV1(withPoints, expectedExpired)
      };
      break;
    }
    case 'battle-shock-test-resolved': {
      const resources = state.battleResources;
      const unit = state.units[event.result.unitId];
      const immediate = state.unitTurnStatuses[event.result.unitId]?.battleShockTestRequired === true;
      const queued = state.commandPhase?.pendingBattleShockUnitIds[0] === event.result.unitId;
      if (!resources || !unit || unit.playerId !== event.playerId || (!immediate && !queued)
        || (immediate && event.result.reason !== 'desperate-escape') || (queued && !immediate && event.result.reason !== 'command-phase')
        || !prngStatesEqual(event.prngBefore, state.prng)) throw new Error(`Battle-shock event ${event.id} is outside its pending test.`);
      const expected = resolveBattleShockTestV1(state.prng, unit, resources, immediate ? 'desperate-escape' : 'command-phase');
      const expectedCommandPhase = immediate ? state.commandPhase : {
        ...state.commandPhase!,
        pendingBattleShockUnitIds: state.commandPhase!.pendingBattleShockUnitIds.slice(1),
        testedBattleShockUnitIds: [...state.commandPhase!.testedBattleShockUnitIds, unit.id],
        stage: state.commandPhase!.pendingBattleShockUnitIds.length === 1 ? 'abilities' as const : 'battle-shock' as const
      };
      const expectedSources = immediate
        ? [CORE_DESPERATE_ESCAPE_SOURCE, CORE_COMMAND_ROLL_SOURCE, CORE_BATTLE_SHOCK_SOURCE]
        : [CORE_COMMAND_PHASE_BATTLE_SHOCK_SOURCE, CORE_COMMAND_ROLL_SOURCE, CORE_BATTLE_SHOCK_SOURCE, OFFICIAL_APP_MULTIPLE_BATTLE_SHOCK_SOURCE];
      if (!sameJson(event.result, expected.result) || !sameJson(event.commandPhaseAfter, expectedCommandPhase)
        || !sameJson(event.battleShockedUnitIdsAfter, expected.battleShockedUnitIdsAfter)
        || !prngStatesEqual(event.prngAfter, expected.prngAfter) || !sameJson(event.sourceRefs, expectedSources)) {
        throw new Error(`Battle-shock event ${event.id} has forged dice or status.`);
      }
      const status = state.unitTurnStatuses[unit.id];
      const statusAfter = status === undefined ? undefined : {
        selectedForMovement: status.selectedForMovement,
        movementType: status.movementType,
        advanced: status.advanced,
        fellBack: status.fellBack,
        ...(status.fallBackMode === undefined ? {} : { fallBackMode: status.fallBackMode }),
        ...(status.chargeDeclared === undefined ? {} : { chargeDeclared: status.chargeDeclared }),
        ...(status.chargeResolved === undefined ? {} : { chargeResolved: status.chargeResolved }),
        ...(status.charged === undefined ? {} : { charged: status.charged }),
        ...(status.chargeTargetUnitIds === undefined ? {} : { chargeTargetUnitIds: status.chargeTargetUnitIds }),
        ...(status.fightsFirstFromCharge === undefined ? {} : { fightsFirstFromCharge: status.fightsFirstFromCharge })
      };
      next = {
        ...state,
        prng: event.prngAfter,
        commandPhase: event.commandPhaseAfter,
        battleResources: { ...resources, battleShockedUnitIds: event.battleShockedUnitIdsAfter },
        ...(immediate && statusAfter !== undefined ? { unitTurnStatuses: { ...state.unitTurnStatuses, [unit.id]: statusAfter } } : {})
      };
      break;
    }
    case 'insane-bravery-used': {
      const resources = state.battleResources;
      const battle = state.battle;
      const phase = state.commandPhase;
      const unit = state.units[event.targetUnitId];
      const uses = resources?.stratagemUses ?? [];
      const phaseUses = battle === null || battle === undefined ? [] : uses.filter((use) => use.playerId === event.playerId
        && use.battleRound === battle.battleRound && use.turnNumber === battle.turnNumber && use.phase === battle.phase);
      const expectedAfter = phase === null || phase === undefined ? null : {
        ...phase,
        pendingBattleShockUnitIds: phase.pendingBattleShockUnitIds.slice(1),
        testedBattleShockUnitIds: [...phase.testedBattleShockUnitIds, event.targetUnitId],
        stage: phase.pendingBattleShockUnitIds.length === 1 ? 'abilities' as const : 'battle-shock' as const
      };
      const expectedUse = battle === null || battle === undefined ? null : {
        eventId: event.id,
        stratagemId: 'insane-bravery' as const,
        playerId: event.playerId,
        targetUnitId: event.targetUnitId,
        cost: 1,
        battleRound: battle.battleRound,
        turnNumber: battle.turnNumber,
        phase: battle.phase
      };
      const expectedSources = [CORE_USE_STRATAGEMS_SOURCE, CORE_INSANE_BRAVERY_SOURCE, UNIVERSAL_STRATAGEM_UPDATES_SOURCE, OFFICIAL_APP_USE_STRATAGEMS_SOURCE, OFFICIAL_APP_MODIFY_CP_COST_SOURCE];
      if (!resources || !battle || !phase || state.phase !== 'command' || battle.phase !== 'command' || phase.stage !== 'battle-shock'
        || phase.activePlayerId !== event.playerId || battle.activePlayerId !== event.playerId
        || phase.pendingBattleShockUnitIds[0] !== event.targetUnitId || !unit || unit.playerId !== event.playerId
        || !battle.deployedUnitIds.includes(unit.id) || !unit.models.some((model) => model.active)
        || resources.battleShockedUnitIds.includes(unit.id) || (resources.commandPointsByPlayerId[event.playerId] ?? 0) < 1
        || phaseUses.some((use) => use.stratagemId === 'insane-bravery' || use.targetUnitId === unit.id)
        || uses.some((use) => use.playerId === event.playerId && use.stratagemId === 'insane-bravery')
        || event.cost !== 1 || !sameJson(event.commandPhaseAfter, expectedAfter) || !sameJson(event.use, expectedUse)
        || !prngStatesEqual(event.prngBefore, state.prng) || !prngStatesEqual(event.prngAfter, state.prng)
        || !sameJson(event.sourceRefs, expectedSources)) {
        throw new Error(`Insane Bravery event ${event.id} does not match its pending Battle-shock test.`);
      }
      assertSourceReferences(event.sourceRefs, `Insane Bravery event ${event.id}`);
      next = {
        ...state,
        commandPhase: event.commandPhaseAfter,
        battleResources: {
          ...resources,
          commandPointsByPlayerId: { ...resources.commandPointsByPlayerId, [event.playerId]: resources.commandPointsByPlayerId[event.playerId]! - 1 },
          stratagemUses: [...uses, event.use]
        }
      };
      break;
    }
    case 'counter-offensive-used': {
      const resources = state.battleResources;
      const battle = state.battle;
      const fight = state.fightPhase;
      const unit = state.units[event.targetUnitId];
      const previous = state.eventLog.at(-1);
      const uses = resources?.stratagemUses ?? [];
      const phaseUses = battle === null || battle === undefined ? [] : uses.filter((use) => use.playerId === event.playerId
        && use.battleRound === battle.battleRound && use.turnNumber === battle.turnNumber && use.phase === battle.phase);
      const eligible = fight?.eligibleAtFightStartUnitIds.includes(event.targetUnitId) === true || state.unitTurnStatuses[event.targetUnitId]?.charged === true;
      const expectedAfter = fight === null ? null : { ...fight, forcedNextFightUnitId: event.targetUnitId };
      const expectedUse = battle === null || battle === undefined ? null : {
        eventId: event.id,
        stratagemId: 'counter-offensive' as const,
        playerId: event.playerId,
        targetUnitId: event.targetUnitId,
        cost: 2,
        battleRound: battle.battleRound,
        turnNumber: battle.turnNumber,
        phase: battle.phase
      };
      const expectedSources = [CORE_USE_STRATAGEMS_SOURCE, CORE_COUNTER_OFFENSIVE_SOURCE, UNIVERSAL_STRATAGEM_UPDATES_SOURCE, OFFICIAL_APP_USE_STRATAGEMS_SOURCE, OFFICIAL_APP_MODIFY_CP_COST_SOURCE];
      if (!resources || !battle || !fight || state.phase !== 'fight' || battle.phase !== 'fight' || fight.stage !== 'fight'
        || fight.currentPlayerId !== event.playerId || fight.activePlayerId === event.playerId || fight.forcedNextFightUnitId !== undefined
        || !unit || unit.playerId !== event.playerId || !battle.deployedUnitIds.includes(unit.id) || !unit.models.some((model) => model.active)
        || fight.foughtUnitIds.includes(unit.id) || !eligible || previous?.type !== 'basic-melee-resolved' || previous.playerId !== fight.activePlayerId
        || resources.battleShockedUnitIds.includes(unit.id) || (resources.commandPointsByPlayerId[event.playerId] ?? 0) < 2
        || phaseUses.some((use) => use.stratagemId === 'counter-offensive' || use.targetUnitId === unit.id)
        || event.cost !== 2 || !sameJson(event.fightPhaseAfter, expectedAfter) || !isValidFightPhaseState(event.fightPhaseAfter, state)
        || !sameJson(event.use, expectedUse) || !prngStatesEqual(event.prngBefore, state.prng) || !prngStatesEqual(event.prngAfter, state.prng)
        || !sameJson(event.sourceRefs, expectedSources)) {
        throw new Error(`Counter-offensive event ${event.id} does not match the immediate enemy attack window.`);
      }
      assertSourceReferences(event.sourceRefs, `Counter-offensive event ${event.id}`);
      next = {
        ...state,
        fightPhase: event.fightPhaseAfter,
        battleResources: {
          ...resources,
          commandPointsByPlayerId: { ...resources.commandPointsByPlayerId, [event.playerId]: resources.commandPointsByPlayerId[event.playerId]! - 2 },
          stratagemUses: [...uses, event.use]
        }
      };
      break;
    }
    case 'fight-window-passed': {
      const expectedSource = state.fightPhase?.stage === 'pile-in'
        ? CORE_PILE_IN_SEQUENCE_SOURCE
        : state.fightPhase?.stage === 'consolidation' ? CORE_CONSOLIDATION_SEQUENCE_SOURCE : CORE_FIGHT_SEQUENCE_SOURCE;
      if (state.phase !== 'fight' || state.battle?.phase !== 'fight' || state.fightPhase === null
        || state.fightPhase.currentPlayerId !== event.playerId || state.fightPhase.forcedNextFightUnitId !== undefined
        || !isValidFightPhaseState(event.fightPhaseAfter, state)
        || !sameJson(event.sourceRefs, [expectedSource])) {
        throw new Error(`Fight pass event ${event.id} does not match the current window.`);
      }
      next = { ...state, fightPhase: event.fightPhaseAfter };
      break;
    }
    case 'fight-movement-resolved': {
      const fight = state.fightPhase;
      const unit = state.units[event.unitId];
      const activeIds = unit?.models.filter((model) => model.active).map((model) => model.id).sort() ?? [];
      const poseIds = event.finalPoses.map((pose) => pose.modelId).sort();
      const expectedSource = event.movementKind === 'pile-in' ? CORE_PILE_IN_SOURCE : CORE_CONSOLIDATION_SOURCE;
      if (state.phase !== 'fight' || state.battle?.phase !== 'fight' || fight === null || fight.currentPlayerId !== event.playerId
        || !unit || unit.playerId !== event.playerId || event.environmentFingerprint !== state.shootingEnvironmentFingerprint
        || !prngStatesEqual(event.prngBefore, state.prng) || !prngStatesEqual(event.prngAfter, state.prng)
        || event.finalPoses.length !== activeIds.length || activeIds.some((id, index) => id !== poseIds[index])
        || event.paths.length !== activeIds.length || event.evidence.paths.length !== activeIds.length
        || event.finalPoses.some((pose) => !isIntegerPoint(pose.position) || !isValidOrientation(pose.orientationDegrees))
        || !isValidFightPhaseState(event.fightPhaseAfter, state)
        || !sameJson(event.sourceRefs, [expectedSource, CORE_UNIT_COHERENCY_SOURCE])) throw new Error(`Fight movement event ${event.id} does not match the current state.`);
      assertSourceReferences(event.sourceRefs, `Fight movement event ${event.id}`);
      const models = { ...state.models };
      for (const pose of event.finalPoses) models[pose.modelId] = { ...models[pose.modelId]!, position: pose.position, orientationDegrees: pose.orientationDegrees };
      next = { ...state, models, fightPhase: event.fightPhaseAfter };
      break;
    }
    case 'basic-melee-stage-resolved': {
      const resolution = event.resolution;
      const fight = state.fightPhase;
      const attacker = state.units[resolution.attackerUnitId];
      const target = state.units[resolution.targetUnitId];
      const successfulWounds = resolution.woundRolls.filter((roll) => roll.wound).map((roll) => roll.attackIndex);
      const orderedSaveRolls = [...resolution.saveRolls].sort((left, right) => left.roll - right.roll || left.attackIndex - right.attackIndex);
      if (state.phase !== 'fight' || state.battle?.phase !== 'fight' || fight?.stage !== 'fight'
        || state.pendingBasicMelee !== null || state.pendingDecisions.length !== 0
        || fight.currentPlayerId !== event.playerId || !attacker || attacker.playerId !== event.playerId
        || (fight.forcedNextFightUnitId !== undefined && fight.forcedNextFightUnitId !== attacker.id)
        || !target || target.playerId !== resolution.defenderPlayerId || target.playerId === event.playerId
        || resolution.originCommandId !== event.commandId || resolution.nextWoundIndex !== 0 || resolution.allocations.length !== 0
        || resolution.attackingModelIds.length === 0 || new Set(resolution.attackingModelIds).size !== resolution.attackingModelIds.length
        || resolution.attackingModelIds.some((id) => !attacker.models.some((model) => model.id === id && model.active))
        || !attacker.weaponProfiles.some((weapon) => weapon.id === resolution.weaponProfileId && weapon.weaponType === 'melee' && weapon.damage === resolution.damage)
        || resolution.hitRolls.length === 0 || resolution.woundRolls.some((roll) => !resolution.hitRolls.some((hit) => hit.attackIndex === roll.attackIndex && hit.hit))
        || !sameJson(resolution.successfulWoundAttackIndexes, successfulWounds)
        || resolution.saveRolls.length !== successfulWounds.length
        || resolution.saveRolls.some((save) => !successfulWounds.includes(save.attackIndex)
          || !Number.isInteger(save.roll) || save.roll < 1 || save.roll > 6
          || save.saved !== (resolution.saveRequired <= 6 && save.roll >= resolution.saveRequired))
        || !sameJson(resolution.saveRolls, orderedSaveRolls)
        || !prngStatesEqual(resolution.prngBefore, state.prng) || resolution.environmentFingerprint !== state.shootingEnvironmentFingerprint
        || !isValidFightPhaseState(resolution.fightPhaseAfter, state) || resolution.fightPhaseAfter.forcedNextFightUnitId !== undefined
        || resolution.sourceRefs.length < 3) {
        throw new Error(`Basic melee stage ${event.id} does not match the current state.`);
      }
      assertSourceReferences(resolution.sourceRefs, `Basic melee stage ${event.id}`);
      next = { ...state, prng: resolution.prngAfter, pendingBasicMelee: resolution };
      break;
    }
    case 'basic-melee-allocation-resolved': {
      const pending = state.pendingBasicMelee;
      const target = pending ? state.units[pending.targetUnitId] : undefined;
      const model = target?.models.find((entry) => entry.id === event.modelId && entry.active);
      const legalModels = pending ? basicMeleeAllocationModels(state, pending) : [];
      const decision = event.decisionId === null ? undefined : state.pendingDecisions.find((entry) => entry.id === event.decisionId);
      const save = pending?.saveRolls[pending.nextWoundIndex];
      const expectedAttackIndex = save?.attackIndex;
      const expectedSaved = save?.saved ?? false;
      const expectedDamage = !model || expectedSaved || !pending ? 0 : Math.min(pending.damage, model.wounds);
      const expectedAfter = model ? { ...model, wounds: model.wounds - expectedDamage, active: model.wounds - expectedDamage > 0 } : undefined;
      const decisionValid = event.decisionId === null
        ? state.pendingDecisions.length === 0 && legalModels.length === 1
        : decision !== undefined && state.pendingDecisions.length === 1 && hasExactBasicMeleeDecisionShape(decision, pending!, state)
          && decision.playerId === event.playerId && decision.options.some((option) => option.id === event.modelId);
      if (!pending || !target || !model || expectedAttackIndex === undefined || event.playerId !== pending.defenderPlayerId
        || event.packetIndex !== pending.nextWoundIndex || event.attackIndex !== expectedAttackIndex
        || !legalModels.some((entry) => entry.id === model.id) || !decisionValid
        || event.saveRoll !== save?.roll || event.saved !== expectedSaved || event.damage !== expectedDamage
        || !sameJson(event.modelAfter, expectedAfter) || !prngStatesEqual(event.prngBefore, state.prng)
        || !prngStatesEqual(event.prngAfter, state.prng) || event.sourceRefs.length === 0) {
        throw new Error(`Basic melee allocation ${event.id} does not match the pending 05.04 choice.`);
      }
      assertSourceReferences(event.sourceRefs, `Basic melee allocation ${event.id}`);
      const outcome = event.saved ? 'saved' as const : event.modelAfter.active ? 'damaged' as const : 'destroyed' as const;
      const allocation = {
        attackIndex: event.attackIndex,
        saveRoll: event.saveRoll,
        outcome,
        ...(event.saved ? {} : { damage: event.damage }),
        allocatedModelId: event.modelId,
        ...(event.modelAfter.active ? {} : { destroyedModelId: event.modelId })
      };
      next = {
        ...state,
        prng: event.prngAfter,
        pendingDecisions: event.decisionId === null ? state.pendingDecisions : [],
        models: { ...state.models, [model.id]: { ...state.models[model.id]!, active: event.modelAfter.active } },
        units: { ...state.units, [target.id]: { ...target, models: target.models.map((entry) => entry.id === model.id ? event.modelAfter : entry) } },
        pendingBasicMelee: {
          ...pending,
          nextWoundIndex: pending.nextWoundIndex + 1,
          allocations: [...pending.allocations, allocation],
          prngAfter: event.prngAfter
        }
      };
      break;
    }
    case 'basic-melee-resolved': {
      const pending = state.pendingBasicMelee;
      const fight = state.fightPhase;
      const attacker = state.units[event.attackerUnitId];
      const target = state.units[event.targetUnitId];
      const targetIds = target?.models.map((model) => model.id).sort() ?? [];
      const afterIds = event.targetModelsAfter.map((model) => model.id).sort();
      if (state.phase !== 'fight' || state.battle?.phase !== 'fight' || fight?.stage !== 'fight' || fight.currentPlayerId !== event.playerId
        || !pending || state.pendingDecisions.length !== 0 || !attacker || attacker.playerId !== event.playerId || !target || target.playerId === event.playerId
        || pending.attackerUnitId !== event.attackerUnitId || pending.targetUnitId !== event.targetUnitId
        || pending.weaponProfileId !== event.weaponProfileId || !sameJson(pending.attackingModelIds, event.attackingModelIds)
        || (pending.nextWoundIndex < pending.saveRolls.length && target.models.some((model) => model.active))
        || !attacker.weaponProfiles.some((weapon) => weapon.id === event.weaponProfileId && weapon.weaponType === 'melee')
        || !sameJson(targetIds, afterIds) || !sameJson(event.targetModelsAfter, target.models)
        || !prngStatesEqual(event.prngBefore, state.prng) || !prngStatesEqual(event.prngAfter, state.prng)
        || event.environmentFingerprint !== state.shootingEnvironmentFingerprint || !isValidFightPhaseState(event.fightPhaseAfter, state)
        || event.sourceRefs.length < 3 || !sameJson(event.sourceRefs.slice(0, 3), [CORE_FIGHT_SEQUENCE_SOURCE, CORE_NORMAL_FIGHT_SOURCE, CORE_MELEE_ATTACK_SOURCE])) {
        throw new Error(`Basic melee event ${event.id} does not match the current state.`);
      }
      assertSourceReferences(event.sourceRefs, `Basic melee event ${event.id}`);
      next = { ...state, fightPhase: event.fightPhaseAfter, pendingBasicMelee: null };
      break;
    }
    case 'empty-fight-resolved': {
      const fight = state.fightPhase;
      const unit = state.units[event.unitId];
      if (state.phase !== 'fight' || state.battle?.phase !== 'fight' || fight?.stage !== 'fight' || fight.currentPlayerId !== event.playerId
        || !unit || unit.playerId !== event.playerId || !unit.models.some((model) => model.active) || fight.foughtUnitIds.includes(unit.id)
        || (fight.forcedNextFightUnitId !== undefined && fight.forcedNextFightUnitId !== unit.id)
        || event.environmentFingerprint !== state.shootingEnvironmentFingerprint
        || !prngStatesEqual(event.prngBefore, state.prng) || !prngStatesEqual(event.prngAfter, state.prng)
        || !isValidFightPhaseState(event.fightPhaseAfter, state) || event.fightPhaseAfter.forcedNextFightUnitId !== undefined
        || !sameJson(event.sourceRefs, [CORE_FIGHT_SEQUENCE_SOURCE, CORE_NORMAL_FIGHT_SOURCE, OFFICIAL_APP_SELECT_UNIT_WITHOUT_WEAPONS_SOURCE])) {
        throw new Error(`Empty fight event ${event.id} does not match the current state.`);
      }
      assertSourceReferences(event.sourceRefs, `Empty fight event ${event.id}`);
      next = { ...state, fightPhase: event.fightPhaseAfter };
      break;
    }
    case 'unit-movement-resolved': {
      const battle = state.battle;
      const unit = state.units[event.unitId];
      const activeModelIds = unit?.models.filter((model) => model.active).map((model) => model.id).sort() ?? [];
      const poseIds = event.finalPoses.map((pose) => pose.modelId).sort();
      let expectedPoseIds = activeModelIds;
      let expectedPrngAfter = state.prng;
      let expectedMaximum = event.movementType === 'remain-stationary' ? 0 : unit?.movement ?? 0;
      if (event.movementType === 'advance') {
        const advance = rollDie(state.prng, 6);
        expectedPrngAfter = advance.state;
        expectedMaximum += advance.face * 254;
        if (event.advanceRoll !== advance.face) throw new Error(`Movement event ${event.id} has a forged Advance roll.`);
      } else if (event.advanceRoll !== undefined) throw new Error(`Movement event ${event.id} has an unexpected Advance roll.`);
      if (event.fallBackMode === 'desperate-escape' && unit) {
        const expected = resolveDesperateEscapeRiskV1(state.prng, unit, event.desperateEscape?.playerAllocationOrder ?? []);
        expectedPrngAfter = expected.prngAfter;
        expectedPoseIds = expected.unitModelsAfter.filter((model) => model.active).map((model) => model.id).sort();
        const battleShockTestRequired = expected.unitModelsAfter.some((model) => model.active)
          && state.battleResources?.battleShockedUnitIds.includes(unit.id) !== true;
        if (!sameJson(event.desperateEscape, {
          riskRolls: expected.riskRolls,
          mortalWounds: expected.mortalWounds,
          unitModelsAfter: expected.unitModelsAfter,
          playerAllocationOrder: event.desperateEscape?.playerAllocationOrder,
          mortalWoundAllocations: expected.mortalWoundAllocations,
          allocationPolicy: 'mandatory-wounded-then-player-order',
          ...(battleShockTestRequired ? { battleShockTestRequired: true } : {})
        })) throw new Error(`Movement event ${event.id} has a forged Desperate Escape resolution.`);
      } else if (event.desperateEscape !== undefined) throw new Error(`Movement event ${event.id} has an unexpected Desperate Escape resolution.`);
      if (battle === null || battle.lifecycle !== 'in-progress' || battle.phase !== 'movement' || state.phase !== 'movement'
        || battle.activePlayerId !== event.playerId || !unit || unit.playerId !== event.playerId
        || (event.movementType === 'fall-back' ? event.fallBackMode !== 'good-order' && event.fallBackMode !== 'desperate-escape' : event.fallBackMode !== undefined)
        || state.unitTurnStatuses[unit.id]?.selectedForMovement || event.environmentFingerprint !== state.shootingEnvironmentFingerprint
        || !prngStatesEqual(event.prngBefore, state.prng) || !prngStatesEqual(event.prngAfter, expectedPrngAfter)
        || event.maximumDistance !== expectedMaximum || event.finalPoses.length !== expectedPoseIds.length
        || expectedPoseIds.some((modelId, index) => modelId !== poseIds[index])
        || event.finalPoses.some((pose) => !isIntegerPoint(pose.position) || !isValidOrientation(pose.orientationDegrees))
        || (event.movementType !== 'remain-stationary' && event.evidence.endedEngaged !== false)
        || event.evidence.coherency.incoherentModelIds.length !== 0 || event.evidence.coherency.distantPairs.length !== 0) {
        throw new Error(`Movement event ${event.id} does not match the current battle state.`);
      }
      assertSourceReferences(event.sourceRefs, `Movement event ${event.id}`);
      const models = { ...state.models };
      let units = state.units;
      if (event.desperateEscape !== undefined) {
        for (const modelAfter of event.desperateEscape.unitModelsAfter) {
          models[modelAfter.id] = { ...models[modelAfter.id]!, active: modelAfter.active };
        }
        units = { ...units, [unit.id]: { ...unit, models: event.desperateEscape.unitModelsAfter } };
      }
      for (const pose of event.finalPoses) models[pose.modelId] = { ...models[pose.modelId]!, position: pose.position, orientationDegrees: pose.orientationDegrees };
      next = {
        ...state,
        models,
        units,
        prng: event.prngAfter,
        unitTurnStatuses: {
          ...state.unitTurnStatuses,
          [unit.id]: {
            selectedForMovement: true,
            movementType: event.movementType,
            advanced: event.movementType === 'advance',
            fellBack: event.movementType === 'fall-back',
            ...(event.fallBackMode === undefined ? {} : { fallBackMode: event.fallBackMode }),
            ...(event.desperateEscape?.battleShockTestRequired === true ? { battleShockTestRequired: true } : {})
          }
        }
      };
      break;
    }
    case 'charge-declared': {
      const battle = state.battle;
      const unit = state.units[event.pending.unitId];
      const status = unit === undefined ? undefined : state.unitTurnStatuses[unit.id];
      const expectedRoll = rollDice(state.prng, 6, 2);
      const expectedMaximum = (expectedRoll.results[0]! + expectedRoll.results[1]!) * 254;
      const candidateIds = event.pending.candidates.map((candidate) => candidate.unitId);
      if (battle === null || battle.lifecycle !== 'in-progress' || battle.phase !== 'charge' || state.phase !== 'charge'
        || state.pendingCharge !== null || event.pending.schemaVersion !== PENDING_CHARGE_V1_SCHEMA_VERSION
        || battle.activePlayerId !== event.pending.playerId || !unit || unit.playerId !== event.pending.playerId
        || !unit.models.some((model) => model.active) || status?.chargeDeclared || status?.advanced || status?.fellBack
        || event.pending.environmentFingerprint !== state.shootingEnvironmentFingerprint
        || !prngStatesEqual(event.pending.prngBefore, state.prng) || !prngStatesEqual(event.pending.prngAfter, expectedRoll.state)
        || !sameJson(event.pending.roll, expectedRoll.results) || event.pending.maximumDistance !== expectedMaximum
        || event.pending.candidates.length === 0 || new Set(candidateIds).size !== candidateIds.length
        || event.pending.candidates.some((candidate) => !Number.isFinite(candidate.edgeToEdgeDistance) || candidate.edgeToEdgeDistance < 0
          || candidate.withinChargeRoll !== (candidate.edgeToEdgeDistance <= expectedMaximum)
          || state.units[candidate.unitId]?.playerId === unit.playerId || !state.units[candidate.unitId]?.models.some((model) => model.active))
        || !sameJson(event.pending.sourceRefs, [CORE_CHARGE_SEQUENCE_SOURCE])) {
        throw new Error(`Charge declaration ${event.id} does not match the current battle state.`);
      }
      next = {
        ...state,
        prng: event.pending.prngAfter,
        pendingCharge: event.pending,
        unitTurnStatuses: {
          ...state.unitTurnStatuses,
          [unit.id]: { ...status!, chargeDeclared: true }
        }
      };
      break;
    }
    case 'charge-resolved': {
      const pending = state.pendingCharge;
      const unit = state.units[event.unitId];
      const status = unit === undefined ? undefined : state.unitTurnStatuses[unit.id];
      const activeModelIds = unit?.models.filter((model) => model.active).map((model) => model.id).sort() ?? [];
      const poseIds = event.finalPoses.map((pose) => pose.modelId).sort();
      const declined = event.outcome === 'declined';
      const expectedSources = declined
        ? [CORE_CHARGE_SEQUENCE_SOURCE]
        : [CORE_CHARGE_SEQUENCE_SOURCE, CORE_CHARGE_MOVE_SOURCE, CORE_UNIT_COHERENCY_SOURCE];
      if (pending === null || state.phase !== 'charge' || state.battle?.phase !== 'charge'
        || pending.unitId !== event.unitId || pending.playerId !== event.playerId || !unit || unit.playerId !== event.playerId
        || !status?.chargeDeclared || status.chargeResolved || event.environmentFingerprint !== pending.environmentFingerprint
        || !prngStatesEqual(event.prngBefore, pending.prngAfter) || !prngStatesEqual(event.prngAfter, pending.prngAfter)
        || !sameJson(event.sourceRefs, expectedSources)
        || (declined && (event.targetUnitIds.length !== 0 || event.paths.length !== 0 || event.finalPoses.length !== 0
          || event.evidence.paths.length !== 0 || event.evidence.engagedTargetUnitIds.length !== 0 || event.evidence.engagedNonTargetUnitIds.length !== 0))
        || (!declined && (event.targetUnitIds.length === 0 || new Set(event.targetUnitIds).size !== event.targetUnitIds.length
          || event.finalPoses.length !== activeModelIds.length || activeModelIds.some((modelId, index) => modelId !== poseIds[index])
          || event.paths.length !== activeModelIds.length || event.evidence.paths.length !== activeModelIds.length
          || !sameJson([...event.targetUnitIds].sort(), event.evidence.engagedTargetUnitIds)
          || event.evidence.engagedNonTargetUnitIds.length !== 0
          || event.evidence.coherency.incoherentModelIds.length !== 0 || event.evidence.coherency.distantPairs.length !== 0))
        || event.finalPoses.some((pose) => !isIntegerPoint(pose.position) || !isValidOrientation(pose.orientationDegrees))) {
        throw new Error(`Charge resolution ${event.id} does not match its pending declaration.`);
      }
      assertSourceReferences(event.sourceRefs, `Charge resolution ${event.id}`);
      const models = { ...state.models };
      for (const pose of event.finalPoses) models[pose.modelId] = { ...models[pose.modelId]!, position: pose.position, orientationDegrees: pose.orientationDegrees };
      next = {
        ...state,
        models,
        pendingCharge: null,
        unitTurnStatuses: {
          ...state.unitTurnStatuses,
          [unit.id]: {
            ...status,
            chargeResolved: true,
            charged: !declined,
            chargeTargetUnitIds: event.targetUnitIds,
            ...(!declined ? { fightsFirstFromCharge: true as const } : {})
          }
        }
      };
      break;
    }
    case 'phase-transitioned': {
      if (state.phase !== event.from || !canTransitionPhase(event.from, event.to)) throw new Error(`Illegal phase transition ${event.from} -> ${event.to}.`);
      next = {
        ...state,
        phase: event.to,
        round: event.from === 'fight' && event.to === 'command' ? state.round + 1 : state.round,
        ...(event.to === 'movement' ? { movedModelIds: [] } : {}),
        ...(event.to === 'shooting' ? { firedWeaponKeys: [], shootingSelectedUnitIds: [] } : {}),
        ...(event.to === 'command' ? { oathOfMomentSelections: {} } : {})
      };
      break;
    }
    case 'model-moved': {
      const model = state.models[event.modelId];
      if (state.phase !== 'movement' || !model || state.movedModelIds.includes(event.modelId) || !pointEquals(model.position, event.from) || !isIntegerPoint(event.to) || !isValidOrientation(event.orientationDegrees)) throw new Error(`Model move ${event.id} does not match current state.`);
      next = {
        ...state,
        movedModelIds: [...state.movedModelIds, model.id].sort(),
        models: {
          ...state.models,
          [model.id]: { ...model, position: event.to, orientationDegrees: event.orientationDegrees }
        }
      };
      break;
    }
    case 'dice-rolled': {
      if (state.manifest === null || !prngStatesEqual(state.prng, event.prngBefore)) throw new Error(`Dice event ${event.id} has an unexpected PRNG state.`);
      const expected = rollDice(state.prng, event.sides, event.results.length);
      if (!prngStatesEqual(expected.state, event.prngAfter) || expected.results.length !== event.results.length || expected.results.some((result, index) => result !== event.results[index])) {
        throw new Error(`Dice event ${event.id} does not match the PRNG output.`);
      }
      next = {
        ...state,
        prng: event.prngAfter,
        diceResults: { ...state.diceResults, [event.rollId]: event.results }
      };
      break;
    }
    case 'split-fire-resolved': {
      const attacker = state.units[event.attackerUnitId];
      const declarationIds = event.resolutions.map((resolution) => resolution.declaration.id);
      const instanceKeys = event.resolutions.map((resolution) => {
        const declaration = resolution.declaration;
        return `${declaration.firingModelId}:${declaration.weaponProfileId}:${declaration.weaponInstanceIndex}`;
      });
      if (state.phase !== 'shooting' || state.pendingLethalShooting !== null || state.pendingRerollShooting !== null || state.pendingExtendedShooting !== null
        || !attacker || attacker.coverageSubject?.subjectType === 'unit' || attacker.extendedDefence !== undefined
        || state.shootingSelectedUnitIds.includes(attacker.id) || event.resolutions.length === 0
        || new Set(declarationIds).size !== declarationIds.length || new Set(instanceKeys).size !== instanceKeys.length
        || !prngStatesEqual(state.prng, event.prngBefore) || !event.shootingEnvironmentFingerprint.trim()
        || event.shootingEnvironmentFingerprint !== state.shootingEnvironmentFingerprint || event.sourceRefs.length === 0) {
        throw new Error(`Split fire event ${event.id} does not match the current state.`);
      }
      const nextUnits: Record<string, UnitState> = { ...state.units };
      const nextModels: Record<string, ModelState> = { ...state.models };
      const weaponProfileIds = new Set<string>();
      const casualties = new Set<string>();
      for (const resolution of event.resolutions) {
        const declaration = resolution.declaration;
        const target = nextUnits[declaration.targetUnitId];
        const weapon = attacker.weaponProfiles.find((profile) => profile.id === declaration.weaponProfileId);
        const carrier = attacker.models.find((model) => model.id === declaration.firingModelId && model.active);
        const assignment = attacker.weaponAssignments.find((entry) => entry.modelId === declaration.firingModelId && entry.weaponProfileId === declaration.weaponProfileId);
        const instanceValid = assignment !== undefined && declaration.weaponInstanceIndex >= 0 && declaration.weaponInstanceIndex < assignment.quantity;
        if (!target || target.playerId === attacker.playerId || target.coverageSubject?.subjectType === 'unit' || target.extendedDefence !== undefined
          || !weapon || !carrier || !instanceValid || !declaration.id.trim() || !declaration.targetUnitId.trim()
          || weapon.randomAttacks !== undefined || weapon.randomDamage !== undefined || weapon.modifierPlan !== undefined
          || (weapon.attackVolumeAbilities?.length ?? 0) !== 0 || (weapon.weaponKeywords?.length ?? 0) !== 0) {
          throw new Error(`Split fire event ${event.id} has an invalid fixture declaration.`);
        }
        const targetIds = target.models.map((model) => model.id).sort();
        if (resolution.outcome === 'target-no-longer-active') {
          if (target.models.some((model) => model.active) || resolution.attackGroup !== undefined || resolution.casualtyModelIds.length !== 0
            || !sameJson(resolution.targetModelsAfter, target.models)) throw new Error(`Split fire event ${event.id} incorrectly skips an active target.`);
          weaponProfileIds.add(weapon.id);
          continue;
        }
        const group = resolution.attackGroup;
        if (!group || !target.models.some((model) => model.active)
          || group.firingModelId !== declaration.firingModelId || group.weaponProfileId !== declaration.weaponProfileId
          || group.weaponInstanceIndex !== declaration.weaponInstanceIndex || group.weaponCount !== 1
          || !sameJson(resolution.targetModelsAfter.map((model) => model.id).sort(), targetIds)
          || resolution.casualtyModelIds.some((id) => !target.models.some((model) => model.id === id && model.active) || casualties.has(id))) {
          throw new Error(`Split fire event ${event.id} has an invalid target-wise result.`);
        }
        for (const casualtyModelId of resolution.casualtyModelIds) {
          const model = nextModels[casualtyModelId];
          if (!model || !model.active) throw new Error(`Split fire event ${event.id} has an invalid casualty model.`);
          casualties.add(casualtyModelId);
          nextModels[casualtyModelId] = { ...model, active: false };
        }
        nextUnits[target.id] = { ...target, models: resolution.targetModelsAfter };
        weaponProfileIds.add(weapon.id);
      }
      next = {
        ...state,
        prng: event.prngAfter,
        firedWeaponKeys: [...new Set([...state.firedWeaponKeys, ...[...weaponProfileIds].map((weaponProfileId) => `${attacker.id}:${weaponProfileId}`)])].sort(),
        shootingSelectedUnitIds: [...new Set([...state.shootingSelectedUnitIds, attacker.id])].sort(),
        models: nextModels,
        units: nextUnits
      };
      break;
    }
    case 'split-fire-stage-resolved': {
      const resolution = event.resolution;
      const attacker = state.units[resolution.attackerUnitId];
      const previous = state.pendingSplitFireShooting;
      const prefixLength = previous?.resolutions.length ?? 0;
      const isInitial = previous === null;
      if (state.phase !== 'shooting' || !attacker || attacker.coverageSubject?.subjectType === 'unit' || attacker.extendedDefence !== undefined
        || state.shootingSelectedUnitIds.includes(attacker.id) || resolution.attackerUnitId !== event.resolution.attackerUnitId
        || resolution.nextResolutionIndex < 0 || resolution.nextResolutionIndex >= resolution.declarations.length
        || resolution.resolutions.length !== resolution.nextResolutionIndex || resolution.resolutions.length <= prefixLength
        || resolution.resolutions.some((entry, index) => entry.declaration.id !== resolution.declarations[index]?.id)
        || new Set(resolution.declarations.map((entry) => entry.id)).size !== resolution.declarations.length
        || new Set(resolution.declarations.map((entry) => `${entry.firingModelId}:${entry.weaponProfileId}:${entry.weaponInstanceIndex}`)).size !== resolution.declarations.length
        || new Set(resolution.retargetOptionTargetUnitIds).size !== resolution.retargetOptionTargetUnitIds.length
        || resolution.retargetOptionTargetUnitIds.some((id) => !id.trim())
        || !resolution.shootingEnvironmentFingerprint.trim() || resolution.shootingEnvironmentFingerprint !== state.shootingEnvironmentFingerprint
        || resolution.sourceRefs.length === 0
        || (isInitial
          ? (resolution.originCommandId !== event.commandId || resolution.choices.length !== 0 || !prngStatesEqual(state.prng, resolution.prngBefore))
          : (!sameJson(previous?.declarations, resolution.declarations) || !sameJson(previous?.resolutions, resolution.resolutions.slice(0, prefixLength))
            || !sameJson(previous?.choices, resolution.choices) || !prngStatesEqual(state.prng, previous!.prngAfter) || !prngStatesEqual(previous!.prngBefore, resolution.prngBefore)))) {
        throw new Error(`Split fire stage ${event.id} is invalid.`);
      }
      const applied = applySplitFireResolutions(state, attacker, resolution.resolutions.slice(prefixLength));
      const pendingTarget = state.units[resolution.declarations[resolution.nextResolutionIndex].targetUnitId];
      const appliedPendingTarget = applied.units[resolution.declarations[resolution.nextResolutionIndex].targetUnitId];
      if (!pendingTarget || !appliedPendingTarget || appliedPendingTarget.models.some((model) => model.active)) {
        throw new Error(`Split fire stage ${event.id} does not wait for a destroyed target.`);
      }
      next = { ...state, prng: resolution.prngAfter, models: applied.models, units: applied.units, pendingSplitFireShooting: resolution };
      break;
    }
    case 'split-fire-retarget-choice-resolved': {
      const resolution = state.pendingSplitFireShooting;
      const decision = state.pendingDecisions.find((entry) => entry.id === event.decisionId);
      const declaration = resolution?.declarations[resolution.nextResolutionIndex];
      if (!resolution || !decision || !declaration || decision.playerId !== event.playerId
        || !hasExactSplitFireRetargetDecisionShape(decision, resolution, state.units[resolution.attackerUnitId]?.playerId ?? '')
        || event.choice.assignmentId !== declaration.id || event.choice.targetUnitId !== event.choice.targetUnitId.trim()
        || (event.choice.targetUnitId !== 'abandon' && !resolution.retargetOptionTargetUnitIds.includes(event.choice.targetUnitId))) {
        throw new Error(`Split fire retarget choice ${event.id} is invalid.`);
      }
      next = {
        ...state,
        pendingDecisions: state.pendingDecisions.filter((entry) => entry.id !== event.decisionId),
        pendingSplitFireShooting: {
          ...resolution,
          declarations: scheduleSplitFireRetarget(resolution.declarations, resolution.nextResolutionIndex, event.choice.targetUnitId),
          choices: [...resolution.choices, event.choice]
        }
      };
      break;
    }
    case 'split-fire-completed': {
      const resolution = event.resolution;
      const previous = state.pendingSplitFireShooting;
      const attacker = previous ? state.units[previous.attackerUnitId] : undefined;
      if (!previous || !attacker || state.pendingDecisions.length !== 0 || resolution.nextResolutionIndex !== resolution.declarations.length
        || resolution.resolutions.length !== resolution.declarations.length || !sameJson(previous.declarations, resolution.declarations)
        || !sameJson(previous.resolutions, resolution.resolutions.slice(0, previous.resolutions.length))
        || !sameJson(previous.choices, resolution.choices) || !prngStatesEqual(state.prng, previous.prngAfter)
        || !prngStatesEqual(previous.prngBefore, resolution.prngBefore) || resolution.shootingEnvironmentFingerprint !== previous.shootingEnvironmentFingerprint
        || resolution.shootingEnvironmentFingerprint !== state.shootingEnvironmentFingerprint || resolution.sourceRefs.length === 0) {
        throw new Error(`Split fire completion ${event.id} is invalid.`);
      }
      const applied = applySplitFireResolutions(state, attacker, resolution.resolutions.slice(previous.resolutions.length));
      const weaponProfileIds = new Set(resolution.declarations.map((entry) => entry.weaponProfileId));
      next = {
        ...state,
        prng: resolution.prngAfter,
        models: applied.models,
        units: applied.units,
        pendingSplitFireShooting: null,
        firedWeaponKeys: [...new Set([...state.firedWeaponKeys, ...[...weaponProfileIds].map((weaponProfileId) => `${attacker.id}:${weaponProfileId}`)])].sort(),
        shootingSelectedUnitIds: [...new Set([...state.shootingSelectedUnitIds, attacker.id])].sort()
      };
      break;
    }
    case 'duplicate-weapon-ability-selection-requested': {
      const selection = event.selection;
      const attacker = state.units[selection.attackerUnitId];
      const weapon = attacker?.weaponProfiles.find((profile) => profile.id === selection.weaponProfileId);
      const duplicates = weapon ? duplicateWeaponAbilityOccurrences(weapon) : [];
      if (state.phase !== 'shooting' || state.pendingDuplicateWeaponAbilitySelection !== null || state.pendingDecisions.length !== 0
        || !attacker || !weapon || attacker.playerId !== selection.originCommand.actorId
        || selection.originCommand.type !== 'resolve-basic-shooting' || selection.originCommand.id !== event.commandId
        || selection.originCommand.attackerUnitId !== attacker.id || selection.originCommand.weaponProfileId !== weapon.id
        || selection.kind !== 'sustained-hits' || duplicates.length !== 1 || duplicates[0]?.kind !== selection.kind
        || !sameJson(selection.occurrenceIndexes, duplicates[0].occurrenceIndexes)
        || selection.shootingEnvironmentFingerprint !== state.shootingEnvironmentFingerprint
        || !sameJson(selection.sourceRefs, [CORE_DUPLICATE_ABILITY_SOURCE])) {
        throw new Error(`Duplicate weapon ability selection ${event.id} is invalid.`);
      }
      next = { ...state, pendingDuplicateWeaponAbilitySelection: selection };
      break;
    }
    case 'duplicate-weapon-ability-choice-resolved': {
      const pending = state.pendingDuplicateWeaponAbilitySelection;
      const decision = state.pendingDecisions.find((entry) => entry.id === event.decisionId);
      if (!pending || !decision || pending.selection !== undefined || decision.playerId !== event.playerId
        || !hasExactDuplicateAbilityDecisionShape(decision, pending, state.units[pending.attackerUnitId]?.playerId ?? '')
        || !sameJson(event.selection, {
          weaponProfileId: pending.weaponProfileId,
          kind: pending.kind,
          selectedOccurrenceIndex: event.selection.selectedOccurrenceIndex
        }) || !pending.occurrenceIndexes.includes(event.selection.selectedOccurrenceIndex)) {
        throw new Error(`Duplicate weapon ability choice ${event.id} is invalid.`);
      }
      next = {
        ...state,
        pendingDecisions: state.pendingDecisions.filter((entry) => entry.id !== event.decisionId),
        pendingDuplicateWeaponAbilitySelection: { ...pending, selection: event.selection }
      };
      break;
    }
    case 'basic-shooting-hit-stage-resolved': {
      const resolution = event.resolution;
      const attacker = state.units[resolution.attackerUnitId];
      const target = state.units[resolution.targetUnitId];
      const stageGroup = resolution.attackGroups[0];
      const criticalKeys = stageGroup?.hitRolls
        .filter((hit) => hit.hit && hit.critical)
        .map((hit) => ({ groupIndex: 0, attackIndex: hit.attackIndex })) ?? [];
      if (state.phase !== 'shooting' || state.pendingLethalShooting !== null || state.pendingRerollShooting !== null || !attacker || !target
        || attacker.playerId === target.playerId || state.shootingSelectedUnitIds.includes(attacker.id)
        || resolution.originCommandId !== event.commandId || !resolution.weaponProfileId.trim()
        || resolution.attackGroups.length !== 1 || stageGroup.weaponProfileId !== resolution.weaponProfileId
        || !attacker.weaponProfiles.some((weapon) => weapon.id === resolution.weaponProfileId && weapon.weaponKeywords?.some((keyword) => keyword.kind === 'lethal-hits'))
        || !prngStatesEqual(state.prng, resolution.prngBefore) || !prngStatesEqual(resolution.prngAfterHits, stageGroup.prngAfter)
        || !prngStatesEqual(resolution.prngBefore, stageGroup.prngBefore)
        || resolution.shootingEnvironmentFingerprint !== state.shootingEnvironmentFingerprint
        || !resolution.shootingEnvironmentFingerprint.trim() || !sameJson(resolution.criticalHitKeys, criticalKeys)
        || resolution.choices.length !== 0 || resolution.sourceRefs.length === 0) {
        throw new Error(`Lethal hit-stage event ${event.id} does not match the current state.`);
      }
      next = { ...state, prng: resolution.prngAfterHits, pendingLethalShooting: resolution };
      break;
    }
    case 'basic-shooting-lethal-choice-resolved': {
      const resolution = state.pendingLethalShooting;
      const decision = state.pendingDecisions.find((entry) => entry.id === event.decisionId);
      const expected = resolution?.criticalHitKeys[resolution.choices.length];
      if (!resolution || !decision || decision.playerId !== event.playerId
        || !hasExactLethalDecisionShape(decision, resolution, state.units[resolution.attackerUnitId]?.playerId ?? '')
        || !expected || !sameJson(event.choice, { ...expected, optionId: event.choice.optionId })
        || !['auto-wound', 'roll-to-wound'].includes(event.choice.optionId)
        || event.decisionId !== expectedLethalDecisionId(resolution, expected)) {
        throw new Error(`Lethal choice event ${event.id} does not match the pending decision.`);
      }
      next = {
        ...state,
        pendingDecisions: state.pendingDecisions.filter((entry) => entry.id !== event.decisionId),
        pendingLethalShooting: { ...resolution, choices: [...resolution.choices, event.choice] }
      };
      break;
    }
    case 'basic-shooting-completed': {
      const resolution = state.pendingLethalShooting;
      const attacker = resolution ? state.units[resolution.attackerUnitId] : undefined;
      const target = resolution ? state.units[resolution.targetUnitId] : undefined;
      if (!resolution || !attacker || !target || state.pendingDecisions.length !== 0
        || resolution.choices.length !== resolution.criticalHitKeys.length
        || event.attackerUnitId !== resolution.attackerUnitId || event.targetUnitId !== resolution.targetUnitId
        || event.weaponProfileId !== resolution.weaponProfileId || event.attackGroups.length !== 1
        || !sameJson(event.attackGroups[0].hitRolls, resolution.attackGroups[0]?.hitRolls)
        || !prngStatesEqual(state.prng, resolution.prngAfterHits) || !prngStatesEqual(event.prngBefore, resolution.prngAfterHits)
        || event.shootingEnvironmentFingerprint !== resolution.shootingEnvironmentFingerprint
        || event.shootingEnvironmentFingerprint !== state.shootingEnvironmentFingerprint
        || !prngStatesEqual(event.attackGroups[0]?.prngBefore, resolution.prngBefore)
        || !sameJson(event.targetModelsAfter.map((model) => model.id).sort(), target.models.map((model) => model.id).sort())
        || event.casualtyModelIds.some((id) => !state.models[id]?.active)) {
        throw new Error(`Lethal shooting completion ${event.id} does not match the pending continuation.`);
      }
      const nextModels: Record<string, ModelState> = { ...state.models };
      for (const casualtyModelId of event.casualtyModelIds) nextModels[casualtyModelId] = { ...nextModels[casualtyModelId], active: false };
      next = {
        ...state,
        prng: event.prngAfter,
        pendingLethalShooting: null,
        firedWeaponKeys: [...new Set([...state.firedWeaponKeys, `${attacker.id}:${event.weaponProfileId}`])].sort(),
        shootingSelectedUnitIds: [...new Set([...state.shootingSelectedUnitIds, attacker.id])].sort(),
        models: nextModels,
        units: { ...state.units, [target.id]: { ...target, models: event.targetModelsAfter } }
      };
      break;
    }
    case 'basic-shooting-reroll-stage-resolved': {
      const resolution = event.resolution;
      const attacker = state.units[resolution.attackerUnitId];
      const target = state.units[resolution.targetUnitId];
      const group = resolution.attackGroup;
      const hitKeys = group.hitRolls.map((roll) => ({ groupIndex: 0, attackIndex: roll.attackIndex }));
      if (resolution.stage === 'hit') {
        if (state.phase !== 'shooting' || state.pendingLethalShooting !== null || state.pendingRerollShooting !== null || !attacker || !target
          || attacker.playerId === target.playerId || state.shootingSelectedUnitIds.includes(attacker.id)
          || resolution.originCommandId !== event.commandId || !resolution.weaponProfileId.trim()
          || group.weaponProfileId !== resolution.weaponProfileId || group.weaponCount !== 1
          || !prngStatesEqual(state.prng, resolution.prngBefore) || !prngStatesEqual(resolution.prngAfterHits, group.prngAfter)
          || !prngStatesEqual(resolution.prngBefore, group.prngBefore)
          || resolution.prngAfterWounds !== undefined || resolution.woundRolls !== undefined || resolution.hitChoices !== undefined
          || resolution.choices.length !== 0 || resolution.sourceRefs.length === 0 || !resolution.shootingEnvironmentFingerprint.trim()
          || resolution.shootingEnvironmentFingerprint !== state.shootingEnvironmentFingerprint
          || !sameJson(resolution.eligibleKeys, resolution.permissions.hit ? hitKeys : [])
          || !group.hitRolls.every((roll, index) => roll.attackIndex === index && Number.isInteger(roll.roll) && roll.roll >= 1 && roll.roll <= 6 && roll.rerollRoll === undefined && roll.modifiedRoll === undefined)) {
          throw new Error(`Generic reroll hit-stage event ${event.id} does not match the current state.`);
        }
        next = { ...state, prng: resolution.prngAfterHits, pendingRerollShooting: resolution };
        break;
      }
      const previous = state.pendingRerollShooting;
      const woundKeys = resolution.woundRolls?.map((roll) => ({ groupIndex: 0, attackIndex: roll.attackIndex })) ?? [];
      const expectedHitChoices = previous?.permissions.hit
        ? previous.choices
        : previous?.attackGroup.hitRolls.map((roll) => ({ groupIndex: 0, attackIndex: roll.attackIndex, rollKind: 'hit' as const, optionId: 'keep' as const }));
      if (state.phase !== 'shooting' || state.pendingLethalShooting !== null || !previous || previous.stage !== 'hit'
        || state.pendingDecisions.length !== 0 || previous.choices.length !== previous.eligibleKeys.length
        || !attacker || !target || resolution.originCommandId !== previous.originCommandId
        || resolution.attackerUnitId !== previous.attackerUnitId || resolution.targetUnitId !== previous.targetUnitId
        || resolution.weaponProfileId !== previous.weaponProfileId || resolution.shootingEnvironmentFingerprint !== previous.shootingEnvironmentFingerprint
        || resolution.shootingEnvironmentFingerprint !== state.shootingEnvironmentFingerprint
        || !prngStatesEqual(state.prng, previous.prngAfterHits) || !prngStatesEqual(resolution.prngBefore, previous.prngBefore)
        || !prngStatesEqual(resolution.prngAfterHits, previous.prngAfterHits) || !resolution.prngAfterWounds
        || !prngStatesEqual(resolution.prngAfterWounds, group.prngAfter) || !sameJson(resolution.hitChoices, expectedHitChoices)
        || resolution.choices.length !== 0 || resolution.woundRolls === undefined || resolution.sourceRefs.length === 0
        || !sameJson(resolution.eligibleKeys, resolution.permissions.wound ? woundKeys : [])) {
        throw new Error(`Generic reroll wound-stage event ${event.id} does not match the pending continuation.`);
      }
      next = { ...state, prng: resolution.prngAfterWounds, pendingRerollShooting: resolution };
      break;
    }
    case 'basic-shooting-reroll-choice-resolved': {
      const resolution = state.pendingRerollShooting;
      const decision = state.pendingDecisions.find((entry) => entry.id === event.decisionId);
      const expected = resolution?.eligibleKeys[resolution.choices.length];
      if (!resolution || !decision || !expected || decision.playerId !== event.playerId
        || !hasExactRerollDecisionShape(decision, resolution, state.units[resolution.attackerUnitId]?.playerId ?? '')
        || event.choice.groupIndex !== expected.groupIndex || event.choice.attackIndex !== expected.attackIndex
        || event.choice.rollKind !== resolution.stage || !['keep', 'reroll'].includes(event.choice.optionId)
        || event.decisionId !== expectedRerollDecisionId(resolution, expected)) {
        throw new Error(`Generic reroll choice event ${event.id} does not match the pending decision.`);
      }
      next = {
        ...state,
        pendingDecisions: state.pendingDecisions.filter((entry) => entry.id !== event.decisionId),
        pendingRerollShooting: { ...resolution, choices: [...resolution.choices, event.choice] }
      };
      break;
    }
    case 'basic-shooting-reroll-completed': {
      const resolution = state.pendingRerollShooting;
      const attacker = resolution ? state.units[resolution.attackerUnitId] : undefined;
      const target = resolution ? state.units[resolution.targetUnitId] : undefined;
      if (!resolution || resolution.stage !== 'wound' || !attacker || !target || state.pendingDecisions.length !== 0
        || resolution.choices.length !== resolution.eligibleKeys.length || !resolution.prngAfterWounds
        || event.attackerUnitId !== resolution.attackerUnitId || event.targetUnitId !== resolution.targetUnitId
        || event.weaponProfileId !== resolution.weaponProfileId || event.attackGroups.length !== 1
        || !sameJson(event.attackGroups[0].hitRolls, resolution.attackGroup.hitRolls)
        || !prngStatesEqual(state.prng, resolution.prngAfterWounds) || !prngStatesEqual(event.prngBefore, resolution.prngAfterWounds)
        || event.shootingEnvironmentFingerprint !== resolution.shootingEnvironmentFingerprint
        || event.shootingEnvironmentFingerprint !== state.shootingEnvironmentFingerprint
        || !prngStatesEqual(event.attackGroups[0]?.prngBefore, resolution.prngBefore)
        || !sameJson(event.targetModelsAfter.map((model) => model.id).sort(), target.models.map((model) => model.id).sort())
        || event.casualtyModelIds.some((id) => !state.models[id]?.active)) {
        throw new Error(`Generic reroll completion ${event.id} does not match the pending continuation.`);
      }
      const nextModels: Record<string, ModelState> = { ...state.models };
      for (const casualtyModelId of event.casualtyModelIds) nextModels[casualtyModelId] = { ...nextModels[casualtyModelId], active: false };
      next = {
        ...state,
        prng: event.prngAfter,
        pendingRerollShooting: null,
        firedWeaponKeys: [...new Set([...state.firedWeaponKeys, `${attacker.id}:${event.weaponProfileId}`])].sort(),
        shootingSelectedUnitIds: [...new Set([...state.shootingSelectedUnitIds, attacker.id])].sort(),
        models: nextModels,
        units: { ...state.units, [target.id]: { ...target, models: event.targetModelsAfter } }
      };
      break;
    }
    case 'basic-shooting-resolved': {
      const attacker = state.units[event.attackerUnitId];
      const target = state.units[event.targetUnitId];
      const weaponProfileIds = event.weaponProfileIds ?? [event.weaponProfileId];
      const legacyEvent = event.weaponProfileIds === undefined;
      const weapons = weaponProfileIds.map((weaponProfileId) => attacker?.weaponProfiles.find((profile) => profile.id === weaponProfileId));
      const selectedUnitIds = state.shootingSelectedUnitIds ?? [];
      const duplicateAbilityPending = state.pendingDuplicateWeaponAbilitySelection;
      if (state.phase !== 'shooting' || state.pendingLethalShooting !== null || state.pendingRerollShooting !== null || !attacker || !target || weaponProfileIds.length === 0
        || event.weaponProfileId !== weaponProfileIds[0] || new Set(weaponProfileIds).size !== weaponProfileIds.length
        || weapons.some((weapon) => !weapon) || selectedUnitIds.includes(attacker.id) || attacker.playerId === target.playerId
        || !prngStatesEqual(state.prng, event.prngBefore)
        || event.shootingEnvironmentFingerprint !== state.shootingEnvironmentFingerprint
        || !event.shootingEnvironmentFingerprint.trim()) {
        throw new Error(`Basic shooting event ${event.id} does not match the current state.`);
      }
      if (duplicateAbilityPending !== null && (
        duplicateAbilityPending.selection === undefined
        || duplicateAbilityPending.originCommand.id !== event.commandId
        || duplicateAbilityPending.originCommand.attackerUnitId !== event.attackerUnitId
        || duplicateAbilityPending.originCommand.targetUnitId !== event.targetUnitId
        || duplicateAbilityPending.shootingEnvironmentFingerprint !== event.shootingEnvironmentFingerprint
      )) throw new Error(`Basic shooting event ${event.id} does not match its duplicate ability decision.`);
      const { range, lineOfSight, cover, attackModifiers } = event.evidence;
      if (event.attackGroups.length === 0 || !sameJson(attackModifiers, attackModifiersFor(state, attacker, target))) {
        throw new Error(`Basic shooting event ${event.id} has malformed authoritative evidence.`);
      }
      const targetModelCount = target.models.filter((model) => model.active).length;
      const groupKeys = event.attackGroups.map((group) => `${group.firingModelId}:${group.weaponProfileId ?? event.weaponProfileId}:${group.weaponInstanceIndex ?? 'combined'}`);
      if (new Set(groupKeys).size !== groupKeys.length) throw new Error(`Basic shooting event ${event.id} repeats a declared weapon carrier.`);
      let expectedPrng = state.prng;
      const preparedGroups = event.attackGroups.map((group) => {
        const groupWeaponProfileId = group.weaponProfileId ?? event.weaponProfileId;
        const originalWeapon = attacker.weaponProfiles.find((profile) => profile.id === groupWeaponProfileId);
        const weapon = group.duplicateAbilitySelection === undefined
          ? originalWeapon
          : originalWeapon === undefined ? undefined : weaponWithSelectedDuplicateAbility(originalWeapon, group.duplicateAbilitySelection) ?? undefined;
        const assignment = attacker.weaponAssignments.find((candidate) => candidate.modelId === group.firingModelId && candidate.weaponProfileId === groupWeaponProfileId);
        const randomAttackGroup = weapon?.randomAttacks !== undefined;
        const validWeaponInstance = randomAttackGroup
          ? Number.isInteger(group.weaponInstanceIndex) && (group.weaponInstanceIndex ?? -1) >= 0 && (group.weaponInstanceIndex ?? -1) < (assignment?.quantity ?? 0)
          : group.weaponInstanceIndex === undefined;
        let attacks = weapon?.attacks;
        let expectedRandomAttacks: BasicShootingAttackGroup['randomAttacks'];
        if (weapon?.randomAttacks !== undefined) {
          const randomResolution = resolveRandomCharacteristic(weapon.randomAttacks, { characteristic: 'attacks', timing: 'generate-attacks' }, expectedPrng);
          if (!randomResolution.accepted) throw new Error(`Basic shooting event ${event.id} has an invalid random attack characteristic.`);
          expectedPrng = randomResolution.prngAfter;
          attacks = randomResolution.value;
          expectedRandomAttacks = {
            expression: weapon.randomAttacks,
            dice: randomResolution.dice,
            value: randomResolution.value,
            sourceRefs: randomResolution.sourceRefs
          };
        }
        const attackModifiersForWeapon = weapon ? replayWeaponCharacteristic(weapon, 'attacks', attacks ?? 0) : null;
        const ballisticSkill = weapon ? replayWeaponCharacteristic(weapon, 'ballisticSkill', weapon.ballisticSkill) : null;
        const range = weapon ? replayWeaponCharacteristic(weapon, 'range', weapon.range) : null;
        const hitRollModifiers = weapon ? replayHitRollModifiers(weapon) : null;
        const modifierSourceRefs = attackModifiersForWeapon && ballisticSkill && range && hitRollModifiers
          ? uniqueSourceReferences([...range.sourceRefs, ...attackModifiersForWeapon.sourceRefs, ...ballisticSkill.sourceRefs, ...hitRollModifiers.sourceRefs])
          : [];
        const volume = weapon && resolveAttackVolume({ ...weapon, attacks: attackModifiersForWeapon?.value ?? 0 }, group.range.edgeToEdgeDistance, targetModelCount);
        return { group, groupWeaponProfileId, originalWeapon, weapon, assignment, validWeaponInstance, expectedRandomAttacks, ballisticSkill, range, hitRollModifiers, modifierSourceRefs, volume };
      });
      let expectedTargetModels = target.models;
      const expectedGroups: BasicShootingAttackGroup[] = [];
      for (const prepared of preparedGroups) {
        const { group, groupWeaponProfileId, originalWeapon, weapon, assignment, validWeaponInstance, expectedRandomAttacks, ballisticSkill, range, hitRollModifiers, modifierSourceRefs, volume } = prepared;
        const groupPrngBefore = expectedPrng;
        const validCover = [0, 1].includes(group.cover.ballisticSkillPenalty)
          && group.cover.applies === (group.cover.ballisticSkillPenalty === 1)
          && sameJson(group.cover.sourceRefs, group.cover.applies ? [CORE_BENEFIT_OF_COVER_SOURCE] : [])
          && sameJson(group.cover.sourceRuleIds, group.cover.applies ? ['core.benefit-of-cover'] : [])
          && (group.cover.applies
            ? group.cover.terrainZoneIds.length > 0 && group.cover.terrainZoneIds.every((id) => id.trim()) && new Set(group.cover.terrainZoneIds).size === group.cover.terrainZoneIds.length && sameJson(group.cover.terrainZoneIds, [...group.cover.terrainZoneIds].sort())
            : group.cover.terrainZoneIds.length === 0);
        const groupVolume = (group as BasicShootingAttackGroup & { readonly attackVolume?: BasicShootingAttackGroup['attackVolume'] }).attackVolume ?? (volume && volume.accepted ? volume.breakdown : undefined);
        if (!weapon || !assignment || !validWeaponInstance || !weaponProfileIds.includes(groupWeaponProfileId) || !volume || !volume.accepted || !sameJson(groupVolume, volume.breakdown)
          || (duplicateAbilityPending === null
            ? group.duplicateAbilitySelection !== undefined
            : !sameJson(group.duplicateAbilitySelection, duplicateAbilityPending.selection))
          || (group.duplicateAbilitySelection !== undefined && originalWeapon === weapon)
          || !validCover || group.range.attackerModelId !== group.firingModelId || group.range.weaponRange !== range?.value || group.lineOfSight.attackerModelId !== group.firingModelId
          || group.lineOfSight.targetModelId !== group.range.targetModelId || !group.lineOfSight.visible || group.lineOfSight.reason !== 'clear' || !group.lineOfSight.ray
          || (weapon.randomAttacks === undefined ? assignment.quantity !== group.weaponCount : group.weaponCount !== 1) || !sameJson(group.randomAttacks, expectedRandomAttacks)
          || !sameJson(group.modifierSourceRefs, modifierSourceRefs.length === 0 ? undefined : modifierSourceRefs) || !attacker.models.some((model) => model.id === group.firingModelId && model.active)
          || !target.models.some((model) => model.id === group.range.targetModelId && model.active)
          || !prngStatesEqual(group.prngBefore, groupPrngBefore)) throw new Error(`Basic shooting event ${event.id} has malformed attack groups.`);
        const weaponForResolution = weapon?.weaponKeywords?.some((keyword) => keyword.kind === 'lethal-hits')
          ? { ...weapon, weaponKeywords: weapon.weaponKeywords.filter((keyword) => keyword.kind !== 'lethal-hits') }
          : weapon;
        const resolution = resolveBasicShooting({
          attackerId: attacker.id,
          targetId: target.id,
          weapon: {
            ...weaponForResolution,
            range: range?.value ?? 0,
            attacks: volume.breakdown.attacksPerWeapon * group.weaponCount,
            ballisticSkill: ballisticSkill?.value ?? 0
          },
          target: { toughness: target.toughness, save: target.save, woundsPerModel: target.woundsPerModel, models: expectedTargetModels, keywords: target.keywords, coverBallisticSkillPenalty: group.cover.ballisticSkillPenalty },
          attackModifiers: {
            ...attackModifiers,
            sourceRefs: uniqueSourceReferences([...attackModifiers.sourceRefs, ...modifierSourceRefs]),
            ...(hitRollModifiers?.plan === undefined ? {} : { hitRollModifiers: hitRollModifiers.plan })
          },
          distance: group.range.edgeToEdgeDistance,
          visible: true
        }, expectedPrng);
        if (!resolution.accepted
          || (weapon?.weaponKeywords?.some((keyword) => keyword.kind === 'lethal-hits') && group.hitRolls.some((hit) => hit.hit && hit.critical))
          || !sameJson(resolution.hitRolls, group.hitRolls)
          || !sameJson(resolution.woundRolls, group.woundRolls)
          || !sameJson(resolution.saveRolls, group.saveRolls)
          || !sameJson(resolution.allocations, group.allocations)
          || !sameJson(resolution.steps, group.rolls)
          || !sameJson(resultFromShootingResolution(resolution), group.result)
          || !prngStatesEqual(resolution.prngAfter, group.prngAfter)) {
          throw new Error(`Basic shooting event ${event.id} fails deterministic group replay invariants.`);
        }
        expectedGroups.push({ ...group, weaponProfileId: groupWeaponProfileId, attackVolume: volume.breakdown });
        expectedPrng = resolution.prngAfter;
        expectedTargetModels = resolution.targetModelsAfter;
      }
      const expectedGroupOrder = [...expectedGroups].sort((left, right) => weaponProfileIds.indexOf(left.weaponProfileId) - weaponProfileIds.indexOf(right.weaponProfileId)
        || left.firingModelId.localeCompare(right.firingModelId)
        || (left.weaponInstanceIndex ?? -1) - (right.weaponInstanceIndex ?? -1));
      if (!sameJson(expectedGroups.map((group) => `${group.weaponProfileId}:${group.firingModelId}:${group.weaponInstanceIndex ?? 'combined'}`), expectedGroupOrder.map((group) => `${group.weaponProfileId}:${group.firingModelId}:${group.weaponInstanceIndex ?? 'combined'}`))) {
        throw new Error(`Basic shooting event ${event.id} has an unstable weapon declaration order.`);
      }
      const primaryWeaponGroups = expectedGroups.filter((group) => group.weaponProfileId === weaponProfileIds[0]);
      const primaryWeapon = weapons[0];
      const expectedWeaponCount = primaryWeaponGroups.reduce((total, group) => total + group.weaponCount, 0);
      const primaryGroupIds = [...new Set(primaryWeaponGroups.map((group) => group.firingModelId))];
      const primaryAttacksPerWeapon = new Set(primaryWeaponGroups.map((group) => group.attackVolume.attacksPerWeapon)).size === 1
        ? primaryWeaponGroups[0].attackVolume.attacksPerWeapon
        : null;
      if (!primaryWeapon || !Number.isFinite(range.edgeToEdgeDistance) || range.edgeToEdgeDistance < 0 || range.weaponRange !== primaryWeaponGroups[0].range.weaponRange || !range.attackerModelId.trim() || !range.targetModelId.trim()
        || !primaryGroupIds.includes(range.attackerModelId) || !attacker.models.some((model) => model.id === range.attackerModelId && model.active)
        || !target.models.some((model) => model.id === range.targetModelId && model.active)
        || !lineOfSight.visible || lineOfSight.reason !== 'clear' || lineOfSight.attackerModelId !== range.attackerModelId || lineOfSight.targetModelId !== range.targetModelId || !lineOfSight.ray
        || new Set(lineOfSight.blockerIds).size !== lineOfSight.blockerIds.length || !sameJson(lineOfSight.blockerIds, [...lineOfSight.blockerIds].sort())
        || !sameJson(event.evidence.weapon, {
          firingModelIds: primaryGroupIds,
          weaponCount: expectedWeaponCount,
          attacksPerWeapon: primaryAttacksPerWeapon,
          totalAttacks: primaryWeaponGroups.reduce((total, group) => total + group.weaponCount * group.attackVolume.attacksPerWeapon, 0)
        })) throw new Error(`Basic shooting event ${event.id} has malformed authoritative evidence.`);
      const expectedRolls = expectedGroups.flatMap((group, index) => {
        const offset = expectedGroups.slice(0, index).reduce((total, previous) => total + previous.rolls.length, 0);
        return group.rolls.map((roll) => ({
          ...roll,
          attackIndex: roll.attackIndex + offset,
          ...(roll.generatedByCriticalHitOfAttackIndex === undefined
            ? {}
            : { generatedByCriticalHitOfAttackIndex: roll.generatedByCriticalHitOfAttackIndex + offset })
        }));
      });
      const expectedCasualties = expectedGroups.flatMap((group) => group.allocations.flatMap((allocation) => allocation.destroyedModelId ? [allocation.destroyedModelId] : []));
      const lastResult = expectedGroups.at(-1)?.result;
      const expectedResult = lastResult ? {
        ...lastResult,
        hitRequired: expectedGroups[0].result.hitRequired,
        hits: expectedGroups.reduce((total, group) => total + group.result.hits, 0),
        wounds: expectedGroups.reduce((total, group) => total + group.result.wounds, 0),
        failedSaves: expectedGroups.reduce((total, group) => total + group.result.failedSaves, 0),
        damageInflicted: expectedGroups.reduce((total, group) => total + group.result.damageInflicted, 0),
        modelsDestroyed: expectedCasualties.length
      } : null;
      if (!prngStatesEqual(expectedPrng, event.prngAfter) || !sameJson(expectedRolls, event.rolls) || !sameJson(expectedResult, event.result)
        || !sameJson(expectedCasualties, event.casualtyModelIds) || !sameJson(expectedTargetModels, event.targetModelsAfter)) {
        throw new Error(`Basic shooting event ${event.id} fails deterministic replay invariants.`);
      }
      const expectedSources = uniqueSourceReferences([
        CORE_BASIC_RANGED_ATTACK_SOURCE,
        ...CORE_ATTACK_SEQUENCE_STEP_SOURCES,
        ...(legacyEvent ? [] : [CORE_UNIT_SELECTED_TO_SHOOT_SOURCE]),
        ...weapons.flatMap((weapon) => weapon?.sourceRefs ?? []),
        ...weapons.flatMap((weapon) => weapon?.weaponKeywords?.map((keyword) => keyword.source) ?? []),
        ...(duplicateAbilityPending === null ? [] : [CORE_DUPLICATE_ABILITY_SOURCE]),
        ...expectedGroups.flatMap((group) => group.attackVolume.sourceRefs),
        ...event.attackGroups.flatMap((group) => group.cover.applies ? [CORE_BENEFIT_OF_COVER_SOURCE] : []),
        ...expectedGroups.flatMap((group) => group.randomAttacks?.sourceRefs ?? []),
        ...expectedGroups.flatMap((group) => group.modifierSourceRefs ?? []),
        ...expectedGroups.flatMap((group) => group.allocations.flatMap((allocation) => allocation.randomDamage?.sourceRefs ?? [])),
        ...attackModifiers.sourceRefs
      ]);
      if (!sameJson(event.sourceRefs, expectedSources)
        || !sameJson(cover, event.attackGroups[0].cover)) {
        throw new Error(`Basic shooting event ${event.id} has inconsistent source provenance.`);
      }
      const nextModels: Record<string, ModelState> = { ...state.models };
      for (const casualtyModelId of event.casualtyModelIds) {
        const model = nextModels[casualtyModelId];
        if (!model || !model.active) throw new Error(`Basic shooting event ${event.id} has an invalid casualty model.`);
        nextModels[casualtyModelId] = { ...model, active: false };
      }
      next = {
        ...state,
        prng: event.prngAfter,
        pendingDuplicateWeaponAbilitySelection: null,
        firedWeaponKeys: [...new Set([...state.firedWeaponKeys, ...weaponProfileIds.map((weaponProfileId) => `${attacker.id}:${weaponProfileId}`)])].sort(),
        shootingSelectedUnitIds: [...new Set([...selectedUnitIds, attacker.id])].sort(),
        models: nextModels,
        units: {
          ...state.units,
          [target.id]: { ...target, models: event.targetModelsAfter }
        }
      };
      break;
    }
    case 'extended-shooting-one-shot-selected': {
      const attacker = state.units[event.attackerUnitId];
      if (state.phase !== 'shooting' || !attacker || state.shootingSelectedUnitIds.includes(attacker.id)
        || state.spentOneShotWeaponInstanceKeys.includes(event.instanceKey)
        || !event.instanceKey.trim() || event.instanceKey !== `${event.attackerUnitId}:${event.firingModelId}:${event.weaponProfileId}:${event.weaponInstanceIndex}`
        || !attacker.models.some((model) => model.id === event.firingModelId && model.active)
        || !attacker.weaponProfiles.some((weapon) => weapon.id === event.weaponProfileId && weapon.weaponKeywords?.some((keyword) => keyword.kind === 'one-shot'))
        || event.sourceRefs.length === 0) throw new Error(`One Shot selection ${event.id} is invalid.`);
      next = { ...state, spentOneShotWeaponInstanceKeys: [...state.spentOneShotWeaponInstanceKeys, event.instanceKey].sort() };
      break;
    }
    case 'extended-shooting-stage-resolved': {
      const resolution = event.resolution;
      const attacker = state.units[resolution.attackerUnitId];
      const target = state.units[resolution.targetUnitId];
      if (state.phase !== 'shooting' || state.pendingLethalShooting !== null || state.pendingRerollShooting !== null || state.pendingExtendedShooting !== null
        || !attacker || !target || attacker.playerId === target.playerId || state.shootingSelectedUnitIds.includes(attacker.id)
        || resolution.originCommandId !== event.commandId || !resolution.weaponProfileId.trim()
        || !attacker.models.some((model) => model.id === resolution.firingModelId && model.active)
        || !attacker.weaponProfiles.some((weapon) => weapon.id === resolution.weaponProfileId)
        || !prngStatesEqual(state.prng, resolution.prngBefore) || resolution.resolvedPacketCount !== 0 || resolution.choices.length !== 0
        || resolution.stage !== 'group-planning' || resolution.saveRolls !== undefined || resolution.allocationOrder !== undefined || resolution.sourceRefs.length === 0 || resolution.allocationGroups.length === 0
        || resolution.awaitingAllocationPacketIndex !== undefined
        || (resolution.selectedGroupId !== undefined && !resolution.allocationGroups.some((group) => group.id === resolution.selectedGroupId))
        || new Set(resolution.groupPlan).size !== resolution.groupPlan.length || resolution.groupPlan.some((groupId) => !resolution.allocationGroups.some((group) => group.id === groupId))
        || (resolution.groupPlan.length > 0 && (resolution.groupPlan.length !== 1 || resolution.allocationGroups.length !== 1 || resolution.selectedGroupId !== resolution.groupPlan[0]))
        || !resolution.shootingEnvironmentFingerprint.trim() || resolution.shootingEnvironmentFingerprint !== state.shootingEnvironmentFingerprint) {
        throw new Error(`Extended shooting stage ${event.id} does not match the current state.`);
      }
      next = { ...state, prng: resolution.prngAfterAttacks, pendingExtendedShooting: resolution };
      break;
    }
    case 'extended-shooting-allocation-choice-resolved': {
      const resolution = state.pendingExtendedShooting;
      const decision = state.pendingDecisions.find((entry) => entry.id === event.decisionId);
      const choice = event.choice;
      if (resolution?.stage === 'hazardous-allocation') {
        const attacker = state.units[resolution.attackerUnitId];
        const allocationModels = attacker ? prioritizedExtendedModels(attacker) : [];
        const automatic = decision === undefined
          && event.decisionId === `${resolution.originCommandId}:hazardous:auto:${resolution.hazardousWoundsRemaining}`
          && choice.kind === 'hazardous-model' && allocationModels.length === 1 && allocationModels[0].id === choice.modelId
          && event.playerId === attacker?.playerId;
        if (choice.kind !== 'hazardous-model' || choice.packetIndex !== -1 || (!automatic && (!decision || decision.playerId !== event.playerId
          || !hasExactExtendedDecisionShape(decision, resolution, attacker?.playerId ?? '')
          || !decision.options.some((option) => option.id === choice.modelId)))) throw new Error(`Hazardous allocation choice ${event.id} is invalid.`);
        next = { ...state, pendingDecisions: state.pendingDecisions.filter((entry) => entry.id !== event.decisionId), pendingExtendedShooting: { ...resolution, choices: [...resolution.choices, choice] } };
        break;
      }
      const packetIndex = resolution?.stage === 'group-planning' ? resolution.groupPlan.length : resolution ? currentExtendedPacketIndex(resolution) : undefined;
      const packet = packetIndex === undefined ? undefined : resolution?.packets[packetIndex];
      if (!resolution || !decision || decision.playerId !== event.playerId
        || !hasExactExtendedDecisionShape(decision, resolution, state.units[resolution.targetUnitId]?.playerId ?? '')
        || event.decisionId !== expectedExtendedDecisionId(resolution) || choice.packetIndex !== packetIndex
        || (resolution.stage !== 'group-planning' && !packet)) {
        throw new Error(`Extended allocation choice ${event.id} does not match the pending decision.`);
      }
      if (choice.kind === 'group') {
        if (resolution.stage !== 'group-planning' || resolution.groupPlan.includes(choice.groupId) || !resolution.allocationGroups.some((group) => group.id === choice.groupId)
          || !decision.options.some((option) => option.id === choice.groupId)) throw new Error(`Extended allocation group ${event.id} is invalid.`);
        next = {
          ...state,
          pendingDecisions: state.pendingDecisions.filter((entry) => entry.id !== event.decisionId),
          pendingExtendedShooting: {
            ...resolution,
            groupPlan: [...resolution.groupPlan, choice.groupId],
            selectedGroupId: resolution.selectedGroupId ?? choice.groupId,
            choices: [...resolution.choices, choice]
          }
        };
        break;
      }
      if (resolution.stage !== 'model-allocation' || !decision.options.some((option) => option.id === choice.modelId)) throw new Error(`Extended allocation model ${event.id} is invalid.`);
      next = {
        ...state,
        pendingDecisions: state.pendingDecisions.filter((entry) => entry.id !== event.decisionId),
        pendingExtendedShooting: { ...resolution, choices: [...resolution.choices, choice] }
      };
      break;
    }
    case 'extended-shooting-save-stage-resolved': {
      const resolution = state.pendingExtendedShooting;
      if (!resolution || resolution.stage !== 'group-planning' || state.pendingDecisions.length !== 0 || resolution.groupPlan.length !== resolution.allocationGroups.length
        || resolution.selectedGroupId === undefined || !resolution.allocationGroups.some((group) => group.id === resolution.selectedGroupId)
        || !prngStatesEqual(state.prng, event.prngBefore) || event.saveRolls.some((save) => !resolution.packets[save.packetIndex] || resolution.packets[save.packetIndex].kind !== 'normal'
          || !Number.isInteger(save.roll) || save.roll < 1 || save.roll > 6)
        || event.saveRolls.length !== resolution.packets.filter((packet) => packet.kind === 'normal').length
        || new Set(event.saveRolls.map((save) => save.packetIndex)).size !== event.saveRolls.length
        || event.packetIndexOrder.length !== resolution.packets.length || new Set(event.packetIndexOrder).size !== event.packetIndexOrder.length
        || event.packetIndexOrder.some((packetIndex) => !resolution.packets[packetIndex]) || !prngStatesEqual(event.prngAfter, event.saveRolls.length === 0 ? state.prng : rollDice(state.prng, 6, event.saveRolls.length).state)) {
        throw new Error(`Extended save stage ${event.id} is invalid.`);
      }
      next = { ...state, prng: event.prngAfter, pendingExtendedShooting: { ...resolution, stage: 'model-allocation', saveRolls: event.saveRolls, allocationOrder: event.packetIndexOrder } };
      break;
    }
    case 'extended-shooting-save-resolved': {
      const resolution = state.pendingExtendedShooting;
      const target = resolution ? state.units[resolution.targetUnitId] : undefined;
      const packetIndex = resolution?.allocationOrder?.[resolution.resolvedPacketCount];
      const packet = packetIndex === undefined ? undefined : resolution?.packets[packetIndex];
      const group = resolution ? currentExtendedAllocationGroup(resolution, target) : undefined;
      const roll = resolution?.saveRolls?.find((entry) => entry.packetIndex === packetIndex)?.roll;
      if (!resolution || resolution.stage !== 'model-allocation' || state.pendingDecisions.length !== 0 || resolution.awaitingAllocationPacketIndex !== undefined
        || !target || !packet || packet.kind !== 'normal' || !group || event.packetIndex !== packet.packetIndex || event.groupId !== group.id
        || roll === undefined || event.evidence.roll !== roll || !prngStatesEqual(state.prng, event.prngBefore) || !prngStatesEqual(event.prngBefore, event.prngAfter)) {
        throw new Error(`Extended save resolution ${event.id} is invalid.`);
      }
      next = {
        ...state,
        pendingExtendedShooting: event.evidence.saved
          ? { ...resolution, resolvedPacketCount: resolution.resolvedPacketCount + 1, selectedGroupId: group.id }
          : { ...resolution, awaitingAllocationPacketIndex: packet.packetIndex, selectedGroupId: group.id }
      };
      break;
    }
    case 'extended-shooting-packet-resolved': {
      const resolution = state.pendingExtendedShooting;
      const target = resolution ? state.units[resolution.targetUnitId] : undefined;
      const packetIndex = resolution ? currentExtendedPacketIndex(resolution) : undefined;
      const packet = packetIndex === undefined ? undefined : resolution?.packets[packetIndex];
      const choice = resolution?.choices.at(-1);
      const model = target?.models.find((entry) => entry.id === event.modelId);
      const group = resolution ? currentExtendedAllocationGroup(resolution, target) : undefined;
      if (!resolution || !target || !packet || !choice || choice.kind !== 'model' || choice.modelId !== event.modelId
        || packet.packetIndex !== event.packetIndex || !model || !model.active || !prngStatesEqual(state.prng, event.prngBefore)
        || !group || !group.modelIds.includes(model.id) || (packet.kind === 'normal' && resolution.awaitingAllocationPacketIndex !== packet.packetIndex)
        || event.modelAfter.id !== model.id || event.modelAfter.wounds < 0 || event.modelAfter.wounds > model.wounds
        || event.modelAfter.active !== (event.modelAfter.wounds > 0)) throw new Error(`Extended shooting packet ${event.id} is invalid.`);
      const nextModels: Record<string, ModelState> = { ...state.models, [event.modelId]: { ...state.models[event.modelId], active: event.modelAfter.active } };
      next = {
        ...state,
        prng: event.prngAfter,
        models: nextModels,
        units: { ...state.units, [target.id]: { ...target, models: target.models.map((entry) => entry.id === event.modelId ? event.modelAfter : entry) } },
        pendingExtendedShooting: {
          ...resolution,
          resolvedPacketCount: resolution.resolvedPacketCount + 1,
          awaitingAllocationPacketIndex: undefined,
          selectedGroupId: currentExtendedAllocationGroup(resolution, { ...target, models: target.models.map((entry) => entry.id === event.modelId ? event.modelAfter : entry) })?.id
        }
      };
      break;
    }
    case 'extended-shooting-packet-lost': {
      const resolution = state.pendingExtendedShooting;
      const target = resolution ? state.units[resolution.targetUnitId] : undefined;
      const packetIndex = resolution?.allocationOrder?.[resolution.resolvedPacketCount];
      const packet = packetIndex === undefined ? undefined : resolution?.packets[packetIndex];
      if (!resolution || resolution.stage !== 'model-allocation' || state.pendingDecisions.length !== 0 || resolution.awaitingAllocationPacketIndex !== undefined
        || !target || target.models.some((model) => model.active) || !packet || event.packetIndex !== packet.packetIndex || event.reason !== 'no-active-target'
        || !prngStatesEqual(state.prng, event.prngBefore) || !prngStatesEqual(event.prngBefore, event.prngAfter) || event.sourceRefs.length === 0) {
        throw new Error(`Lost extended packet ${event.id} is invalid.`);
      }
      next = { ...state, pendingExtendedShooting: { ...resolution, resolvedPacketCount: resolution.resolvedPacketCount + 1, selectedGroupId: undefined } };
      break;
    }
    case 'extended-shooting-hazardous-resolved': {
      const resolution = state.pendingExtendedShooting;
      const attacker = resolution ? state.units[resolution.attackerUnitId] : undefined;
      if (!resolution || !resolution.hazardous || !attacker || resolution.resolvedPacketCount !== (resolution.allocationOrder?.length ?? 0)
        || !prngStatesEqual(state.prng, event.prngBefore) || !Number.isInteger(event.roll) || event.roll < 1 || event.roll > 6 || event.sourceRefs.length === 0
        || event.mortalWounds !== (event.roll <= 2 ? (attacker.keywords.some((keyword) => ['MONSTRE', 'VEHICULE', 'VÉHICULE'].includes(keyword.trim().toUpperCase())) ? 3 : 1) : 0)) {
        throw new Error(`Hazardous event ${event.id} is invalid.`);
      }
      next = { ...state, prng: event.prngAfter, pendingExtendedShooting: { ...resolution, stage: 'hazardous-allocation', hazardousWoundsRemaining: event.mortalWounds } };
      break;
    }
    case 'extended-shooting-hazardous-packet-resolved': {
      const resolution = state.pendingExtendedShooting;
      const attacker = resolution ? state.units[resolution.attackerUnitId] : undefined;
      const choice = resolution?.choices.at(-1);
      const model = attacker?.models.find((entry) => entry.id === event.modelId);
      const legalModels = attacker ? prioritizedExtendedModels(attacker) : [];
      if (!resolution || resolution.stage !== 'hazardous-allocation' || !resolution.hazardousWoundsRemaining || !attacker || !model || !model.active
        || choice?.kind !== 'hazardous-model' || choice.modelId !== event.modelId || !prngStatesEqual(state.prng, event.prngBefore)
        || !legalModels.some((entry) => entry.id === model.id)
        || event.modelAfter.id !== model.id || event.modelAfter.wounds < 0 || event.modelAfter.wounds > model.wounds || event.evidence.sourceRefs.some((source) => source.reference === '24.10')) {
        throw new Error(`Hazardous packet ${event.id} is invalid.`);
      }
      next = {
        ...state,
        prng: event.prngAfter,
        models: { ...state.models, [model.id]: { ...state.models[model.id], active: event.modelAfter.active } },
        units: { ...state.units, [attacker.id]: { ...attacker, models: attacker.models.map((entry) => entry.id === model.id ? event.modelAfter : entry) } },
        pendingExtendedShooting: { ...resolution, hazardousWoundsRemaining: resolution.hazardousWoundsRemaining - 1 }
      };
      break;
    }
    case 'extended-shooting-hazardous-wounds-lost': {
      const resolution = state.pendingExtendedShooting;
      const attacker = resolution ? state.units[resolution.attackerUnitId] : undefined;
      if (!resolution || resolution.stage !== 'hazardous-allocation' || !attacker || attacker.models.some((model) => model.active)
        || !resolution.hazardousWoundsRemaining || event.count !== resolution.hazardousWoundsRemaining || event.sourceRefs.length === 0) {
        throw new Error(`Lost hazardous wounds ${event.id} are invalid.`);
      }
      next = { ...state, pendingExtendedShooting: { ...resolution, hazardousWoundsRemaining: 0 } };
      break;
    }
    case 'extended-shooting-completed': {
      const resolution = state.pendingExtendedShooting;
      if (!resolution || state.pendingDecisions.length !== 0 || resolution.resolvedPacketCount !== (resolution.allocationOrder?.length ?? 0)
        || (resolution.hazardousWoundsRemaining !== undefined && resolution.hazardousWoundsRemaining !== 0)
        || event.attackerUnitId !== resolution.attackerUnitId || event.targetUnitId !== resolution.targetUnitId || event.weaponProfileId !== resolution.weaponProfileId
        || event.shootingEnvironmentFingerprint !== resolution.shootingEnvironmentFingerprint || event.shootingEnvironmentFingerprint !== state.shootingEnvironmentFingerprint
        || !prngStatesEqual(state.prng, event.prngBefore) || !prngStatesEqual(event.prngBefore, event.prngAfter) || event.sourceRefs.length === 0) {
        throw new Error(`Extended shooting completion ${event.id} is invalid.`);
      }
      next = {
        ...state,
        pendingExtendedShooting: null,
        firedWeaponKeys: [...new Set([...state.firedWeaponKeys, `${event.attackerUnitId}:${event.weaponProfileId}`])].sort(),
        shootingSelectedUnitIds: [...new Set([...state.shootingSelectedUnitIds, event.attackerUnitId])].sort()
      };
      break;
    }
    case 'oath-of-moment-selected': {
      if (state.phase !== 'command' || state.oathOfMomentSelections[event.selection.playerId] || !isValidOathSelection(event.selection, state)) {
        throw new Error(`Oath of Moment event ${event.id} is invalid for the current command phase.`);
      }
      next = { ...state, oathOfMomentSelections: { ...state.oathOfMomentSelections, [event.selection.playerId]: event.selection } };
      break;
    }
    case 'decision-requested': {
      const decision = event.decision;
      if (state.battle !== null && !COVERED_DECISION_KINDS.has(decision.kind)) {
        throw new Error(`Decision request ${event.id} has no covered complete-game producer.`);
      }
      const optionIds = new Set(decision.options.map((option) => option.id));
      const lethalResolution = state.pendingLethalShooting;
      const rerollResolution = state.pendingRerollShooting;
      const extendedResolution = state.pendingExtendedShooting;
      const meleeResolution = state.pendingBasicMelee;
      const splitFireResolution = state.pendingSplitFireShooting;
      const duplicateAbilitySelection = state.pendingDuplicateWeaponAbilitySelection;
      if (decision.kind === 'lethal-hits-choice' && (!lethalResolution || !hasExactLethalDecisionShape(decision, lethalResolution, state.units[lethalResolution.attackerUnitId]?.playerId ?? ''))) {
        throw new Error(`Decision request ${event.id} does not match the lethal continuation.`);
      }
      if (decision.kind === 'generic-reroll-choice' && (!rerollResolution || !hasExactRerollDecisionShape(decision, rerollResolution, state.units[rerollResolution.attackerUnitId]?.playerId ?? ''))) {
        throw new Error(`Decision request ${event.id} does not match the generic reroll continuation.`);
      }
      if ((decision.kind === 'extended-allocation-group' || decision.kind === 'extended-allocation-model' || decision.kind === 'extended-hazardous-allocation')
        && (!extendedResolution || !hasExactExtendedDecisionShape(decision, extendedResolution, state.units[extendedResolution.stage === 'hazardous-allocation' ? extendedResolution.attackerUnitId : extendedResolution.targetUnitId]?.playerId ?? ''))) {
        throw new Error(`Decision request ${event.id} does not match the extended allocation continuation.`);
      }
      if (decision.kind === 'basic-melee-allocation' && (!meleeResolution || !hasExactBasicMeleeDecisionShape(decision, meleeResolution, state))) {
        throw new Error(`Decision request ${event.id} does not match the melee allocation continuation.`);
      }
      if (decision.kind === 'split-fire-retarget' && (!splitFireResolution || !hasExactSplitFireRetargetDecisionShape(decision, splitFireResolution, state.units[splitFireResolution.attackerUnitId]?.playerId ?? ''))) {
        throw new Error(`Decision request ${event.id} does not match the split fire continuation.`);
      }
      if (decision.kind === 'duplicate-weapon-ability' && (!duplicateAbilitySelection || duplicateAbilitySelection.selection !== undefined
        || !hasExactDuplicateAbilityDecisionShape(decision, duplicateAbilitySelection, state.units[duplicateAbilitySelection.attackerUnitId]?.playerId ?? ''))) {
        throw new Error(`Decision request ${event.id} does not match the duplicate ability continuation.`);
      }
      if (
        state.manifest === null
        || state.pendingDecisions.length > 0
        || !decision.id.trim()
        || !decision.kind.trim()
        || !decision.prompt.trim()
        || !state.players[decision.playerId]
        || decision.options.length === 0
        || optionIds.size !== decision.options.length
        || decision.options.some((option) => !option.id.trim() || !option.label.trim())
      ) throw new Error(`Decision request ${event.id} is malformed or outside an available window.`);
      next = { ...state, pendingDecisions: [...state.pendingDecisions, decision] };
      break;
    }
    case 'decision-resolved': {
      if (state.pendingLethalShooting !== null || state.pendingRerollShooting !== null || state.pendingExtendedShooting !== null || state.pendingBasicMelee !== null || state.pendingSplitFireShooting !== null || state.pendingDuplicateWeaponAbilitySelection !== null) {
        throw new Error('Les décisions de tir interrompu doivent être résolues par la continuation de tir autoritaire.');
      }
      const decision = state.pendingDecisions.find((entry) => entry.id === event.decisionId);
      if (!decision || decision.playerId !== event.playerId || !decision.options.some((option) => option.id === event.optionId)) throw new Error(`Decision resolution ${event.id} does not match a pending decision.`);
      next = { ...state, pendingDecisions: state.pendingDecisions.filter((entry) => entry.id !== event.decisionId) };
      break;
    }
  }
  return { ...next, eventLog: [...state.eventLog, event] };
}

export function unsafeReplayGameEvents(initialState: GameState, events: readonly GameEvent[]): GameState {
  if (initialState.eventLog.length > 0) throw new Error('A replay must start from an event-free initial state.');
  return events.reduce(unsafeReduceGameEvent, initialState);
}

/** Public reducer for non-spatial M1 events. Shooting requires orchestration verification. */
export function reduceGameEvent(state: GameState, event: GameEvent): GameState {
  if (event.type === 'unit-deployed' || event.type === 'unit-movement-resolved' || event.type === 'charge-declared' || event.type === 'charge-resolved'
    || event.type === 'fight-window-passed' || event.type === 'fight-movement-resolved' || event.type === 'basic-melee-stage-resolved' || event.type === 'basic-melee-allocation-resolved' || event.type === 'basic-melee-resolved' || event.type === 'empty-fight-resolved'
    || event.type === 'basic-shooting-resolved' || event.type === 'split-fire-resolved' || event.type === 'split-fire-stage-resolved' || event.type === 'split-fire-retarget-choice-resolved' || event.type === 'split-fire-completed' || event.type === 'duplicate-weapon-ability-selection-requested' || event.type === 'duplicate-weapon-ability-choice-resolved' || event.type === 'basic-shooting-hit-stage-resolved'
    || event.type === 'basic-shooting-lethal-choice-resolved' || event.type === 'basic-shooting-completed'
    || event.type === 'basic-shooting-reroll-stage-resolved' || event.type === 'basic-shooting-reroll-choice-resolved' || event.type === 'basic-shooting-reroll-completed'
    || event.type === 'extended-shooting-one-shot-selected' || event.type === 'extended-shooting-stage-resolved' || event.type === 'extended-shooting-save-stage-resolved' || event.type === 'extended-shooting-save-resolved' || event.type === 'extended-shooting-allocation-choice-resolved' || event.type === 'extended-shooting-packet-resolved' || event.type === 'extended-shooting-packet-lost' || event.type === 'extended-shooting-hazardous-resolved' || event.type === 'extended-shooting-hazardous-packet-resolved' || event.type === 'extended-shooting-hazardous-wounds-lost' || event.type === 'extended-shooting-completed'
    || event.type === 'oath-of-moment-selected') throw new Error('Spatial battle events require a trusted shooting environment verifier.');
  if ((state.pendingLethalShooting !== null || state.pendingRerollShooting !== null || state.pendingExtendedShooting !== null || state.pendingBasicMelee !== null || state.pendingSplitFireShooting !== null || state.pendingDuplicateWeaponAbilitySelection !== null) && event.type === 'decision-resolved') {
    throw new Error('Les décisions de tir interrompu exigent un trusted shooting environment verifier.');
  }
  return unsafeReduceGameEvent(state, event);
}

/** Public replay for legacy journals that contain no spatial shooting events. */
export function replayGameEvents(initialState: GameState, events: readonly GameEvent[]): GameState {
  if (events.some((event) => event.type === 'unit-deployed' || event.type === 'unit-movement-resolved' || event.type === 'charge-declared' || event.type === 'charge-resolved'
    || event.type === 'fight-window-passed' || event.type === 'fight-movement-resolved' || event.type === 'basic-melee-stage-resolved' || event.type === 'basic-melee-allocation-resolved' || event.type === 'basic-melee-resolved' || event.type === 'empty-fight-resolved'
    || event.type === 'basic-shooting-resolved' || event.type === 'split-fire-resolved' || event.type === 'split-fire-stage-resolved' || event.type === 'split-fire-retarget-choice-resolved' || event.type === 'split-fire-completed' || event.type === 'duplicate-weapon-ability-selection-requested' || event.type === 'duplicate-weapon-ability-choice-resolved' || event.type === 'basic-shooting-hit-stage-resolved'
    || event.type === 'basic-shooting-lethal-choice-resolved' || event.type === 'basic-shooting-completed'
    || event.type === 'basic-shooting-reroll-stage-resolved' || event.type === 'basic-shooting-reroll-choice-resolved' || event.type === 'basic-shooting-reroll-completed'
    || event.type === 'extended-shooting-one-shot-selected' || event.type === 'extended-shooting-stage-resolved' || event.type === 'extended-shooting-save-stage-resolved' || event.type === 'extended-shooting-save-resolved' || event.type === 'extended-shooting-allocation-choice-resolved' || event.type === 'extended-shooting-packet-resolved' || event.type === 'extended-shooting-packet-lost' || event.type === 'extended-shooting-hazardous-resolved' || event.type === 'extended-shooting-hazardous-packet-resolved' || event.type === 'extended-shooting-hazardous-wounds-lost' || event.type === 'extended-shooting-completed'
    || event.type === 'oath-of-moment-selected')) throw new Error('Spatial battle journals require a trusted shooting environment verifier.');
  return unsafeReplayGameEvents(initialState, events);
}
