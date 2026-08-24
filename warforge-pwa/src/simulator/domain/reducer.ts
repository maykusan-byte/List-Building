import { prngStatesEqual, rollDice } from './prng';
import { CORE_ATTACK_SEQUENCE_STEP_SOURCES, CORE_BASIC_RANGED_ATTACK_SOURCE, CORE_BENEFIT_OF_COVER_SOURCE, resolveBasicShooting } from '../rules/shooting';
import { CORE_UNIT_SELECTED_TO_SHOOT_SOURCE, hasSupportedAttackVolumeAbilities, resolveAttackVolume } from '../rules/attack-volume';
import { parseRandomCharacteristicExpression } from '../rules/random-characteristics';
import { resolveRandomCharacteristic } from '../rules/random-characteristics';
import { resolveCharacteristicModifierPlan, resolveDieRollModifierPlan } from '../rules/modifiers';
import { hasSupportedWeaponKeywords } from '../rules/weapon-keywords';
import type { BasicShootingAttackGroup, BasicShootingResult, DecisionRequest, ExtendedAllocationChoiceV1, GameEvent, GameState, ModelState, OathOfMomentSelectionV1, PendingExtendedShootingResolutionV1, PendingRerollShootingResolutionV1, PlayerSetup, SessionSetup, SimulatorPhase, SourceReferenceV1, UnitSetup, UnitState, WorldPoint } from './types';

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

function assertValidWeapon(weapon: UnitSetup['weaponProfiles'][number], unitId: string): void {
  const modifierPlan = weapon.modifierPlan;
  const modifiersValid = modifierPlan === undefined || (
    (modifierPlan.range === undefined || resolveCharacteristicModifierPlan({ characteristic: 'range', baseValue: weapon.range, ...modifierPlan.range }).accepted)
    && (modifierPlan.attacks === undefined || resolveCharacteristicModifierPlan({ characteristic: 'attacks', baseValue: weapon.attacks, ...modifierPlan.attacks }).accepted)
    && (modifierPlan.ballisticSkill === undefined || resolveCharacteristicModifierPlan({ characteristic: 'ballistic-skill', baseValue: weapon.ballisticSkill, ...modifierPlan.ballisticSkill }).accepted)
    && (modifierPlan.hitRoll === undefined || resolveDieRollModifierPlan({ rollKind: 'hit', unmodifiedRoll: 1, sides: 6, ...modifierPlan.hitRoll }).accepted)
  );
  if (!weapon.id.trim() || !weapon.displayName.trim()
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
      keywords: [...unit.keywords],
      toughness: unit.toughness,
      save: unit.save,
      woundsPerModel: unit.woundsPerModel,
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

function uniqueSourceReferences(references: readonly SourceReferenceV1[]): readonly SourceReferenceV1[] {
  return [...new Map(references.map((reference) => [sourceReferenceKey(reference), reference])).values()];
}

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

/** Applies an already validated event. It never mutates the prior state. */
export function unsafeReduceGameEvent(state: GameState, event: GameEvent): GameState {
  if (state.eventLog.some((previous) => previous.id === event.id)) throw new Error(`Event ${event.id} has already been applied.`);
  const repeatedCommandIsShootingContinuation = (event.type === 'decision-requested' && (event.decision.kind === 'lethal-hits-choice' || event.decision.kind === 'generic-reroll-choice' || event.decision.kind === 'extended-allocation-group' || event.decision.kind === 'extended-allocation-model' || event.decision.kind === 'extended-hazardous-allocation'))
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
    || event.type === 'extended-shooting-completed';
  if (state.eventLog.some((previous) => previous.commandId === event.commandId) && !repeatedCommandIsShootingContinuation) throw new Error(`Command ${event.commandId} has already produced an event.`);
  if (state.phase === 'completed') throw new Error(`Event ${event.id} cannot be applied after game completion.`);
  if (state.pendingDecisions.length > 0 && event.type !== 'decision-resolved' && event.type !== 'basic-shooting-lethal-choice-resolved' && event.type !== 'basic-shooting-reroll-choice-resolved' && event.type !== 'extended-shooting-allocation-choice-resolved') throw new Error(`Event ${event.id} cannot bypass a pending decision.`);
  let next: GameState;
  switch (event.type) {
    case 'session-setup': {
      if (state.phase !== 'setup' || state.manifest !== null) throw new Error('A session can only be set up once.');
      assertValidSession(event.session);
      const records = sessionRecords(event.session);
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
        players: records.players,
        models: records.models,
        units: records.units,
        phase: 'deployment'
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
      if (state.phase !== 'shooting' || state.pendingLethalShooting !== null || state.pendingRerollShooting !== null || !attacker || !target || weaponProfileIds.length === 0
        || event.weaponProfileId !== weaponProfileIds[0] || new Set(weaponProfileIds).size !== weaponProfileIds.length
        || weapons.some((weapon) => !weapon) || selectedUnitIds.includes(attacker.id) || attacker.playerId === target.playerId
        || !prngStatesEqual(state.prng, event.prngBefore)
        || event.shootingEnvironmentFingerprint !== state.shootingEnvironmentFingerprint
        || !event.shootingEnvironmentFingerprint.trim()) {
        throw new Error(`Basic shooting event ${event.id} does not match the current state.`);
      }
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
        const weapon = attacker.weaponProfiles.find((profile) => profile.id === groupWeaponProfileId);
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
        return { group, groupWeaponProfileId, weapon, assignment, validWeaponInstance, expectedRandomAttacks, ballisticSkill, range, hitRollModifiers, modifierSourceRefs, volume };
      });
      let expectedTargetModels = target.models;
      const expectedGroups: BasicShootingAttackGroup[] = [];
      for (const prepared of preparedGroups) {
        const { group, groupWeaponProfileId, weapon, assignment, validWeaponInstance, expectedRandomAttacks, ballisticSkill, range, hitRollModifiers, modifierSourceRefs, volume } = prepared;
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
      const optionIds = new Set(decision.options.map((option) => option.id));
      const lethalResolution = state.pendingLethalShooting;
      const rerollResolution = state.pendingRerollShooting;
      const extendedResolution = state.pendingExtendedShooting;
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
      if (state.pendingLethalShooting !== null || state.pendingRerollShooting !== null || state.pendingExtendedShooting !== null) {
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
  if (event.type === 'basic-shooting-resolved' || event.type === 'basic-shooting-hit-stage-resolved'
    || event.type === 'basic-shooting-lethal-choice-resolved' || event.type === 'basic-shooting-completed'
    || event.type === 'basic-shooting-reroll-stage-resolved' || event.type === 'basic-shooting-reroll-choice-resolved' || event.type === 'basic-shooting-reroll-completed'
    || event.type === 'extended-shooting-one-shot-selected' || event.type === 'extended-shooting-stage-resolved' || event.type === 'extended-shooting-save-stage-resolved' || event.type === 'extended-shooting-save-resolved' || event.type === 'extended-shooting-allocation-choice-resolved' || event.type === 'extended-shooting-packet-resolved' || event.type === 'extended-shooting-packet-lost' || event.type === 'extended-shooting-hazardous-resolved' || event.type === 'extended-shooting-hazardous-packet-resolved' || event.type === 'extended-shooting-hazardous-wounds-lost' || event.type === 'extended-shooting-completed'
    || event.type === 'oath-of-moment-selected') throw new Error('M4 shooting-rule events require a trusted shooting environment verifier.');
  if ((state.pendingLethalShooting !== null || state.pendingRerollShooting !== null || state.pendingExtendedShooting !== null) && event.type === 'decision-resolved') {
    throw new Error('Les décisions de tir interrompu exigent un trusted shooting environment verifier.');
  }
  return unsafeReduceGameEvent(state, event);
}

/** Public replay for legacy journals that contain no spatial shooting events. */
export function replayGameEvents(initialState: GameState, events: readonly GameEvent[]): GameState {
  if (events.some((event) => event.type === 'basic-shooting-resolved' || event.type === 'basic-shooting-hit-stage-resolved'
    || event.type === 'basic-shooting-lethal-choice-resolved' || event.type === 'basic-shooting-completed'
    || event.type === 'basic-shooting-reroll-stage-resolved' || event.type === 'basic-shooting-reroll-choice-resolved' || event.type === 'basic-shooting-reroll-completed'
    || event.type === 'extended-shooting-one-shot-selected' || event.type === 'extended-shooting-stage-resolved' || event.type === 'extended-shooting-save-stage-resolved' || event.type === 'extended-shooting-save-resolved' || event.type === 'extended-shooting-allocation-choice-resolved' || event.type === 'extended-shooting-packet-resolved' || event.type === 'extended-shooting-packet-lost' || event.type === 'extended-shooting-hazardous-resolved' || event.type === 'extended-shooting-hazardous-packet-resolved' || event.type === 'extended-shooting-hazardous-wounds-lost' || event.type === 'extended-shooting-completed'
    || event.type === 'oath-of-moment-selected')) throw new Error('M4 shooting-rule journals require a trusted shooting environment verifier.');
  return unsafeReplayGameEvents(initialState, events);
}
