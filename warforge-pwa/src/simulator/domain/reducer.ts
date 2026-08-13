import { prngStatesEqual, rollDice } from './prng';
import { CORE_ATTACK_SEQUENCE_STEP_SOURCES, CORE_BASIC_RANGED_ATTACK_SOURCE, CORE_BENEFIT_OF_COVER_SOURCE, resolveBasicShooting } from '../rules/shooting';
import type { BasicShootingAttackGroup, BasicShootingResult, GameEvent, GameState, ModelState, PlayerSetup, SessionSetup, SimulatorPhase, SourceReferenceV1, UnitSetup, UnitState, WorldPoint } from './types';

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
  if (!weapon.id.trim() || !weapon.displayName.trim()
    || ![weapon.range, weapon.attacks, weapon.ballisticSkill, weapon.strength, weapon.damage].every((value) => Number.isInteger(value) && value >= 0)
    || weapon.attacks <= 0 || weapon.ballisticSkill < 2 || weapon.ballisticSkill > 6 || weapon.strength <= 0 || weapon.damage <= 0
    || !Number.isInteger(weapon.armourPenetration) || weapon.armourPenetration > 0) {
    throw new Error(`Unit ${unitId} has an invalid weapon profile.`);
  }
  assertSourceReferences(weapon.sourceRefs, `Weapon ${weapon.id}`);
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
      playerId: unit.playerId,
      keywords: [...unit.keywords],
      toughness: unit.toughness,
      save: unit.save,
      woundsPerModel: unit.woundsPerModel,
      weaponProfiles: [...unit.weaponProfiles],
      weaponAssignments,
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

/** Applies an already validated event. It never mutates the prior state. */
export function unsafeReduceGameEvent(state: GameState, event: GameEvent): GameState {
  if (state.eventLog.some((previous) => previous.id === event.id)) throw new Error(`Event ${event.id} has already been applied.`);
  if (state.eventLog.some((previous) => previous.commandId === event.commandId)) throw new Error(`Command ${event.commandId} has already produced an event.`);
  if (state.phase === 'completed') throw new Error(`Event ${event.id} cannot be applied after game completion.`);
  if (state.pendingDecisions.length > 0 && event.type !== 'decision-resolved') throw new Error(`Event ${event.id} cannot bypass a pending decision.`);
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
        players: records.players,
        models: records.models,
        units: records.units,
        phase: 'deployment'
      };
      break;
    }
    case 'phase-transitioned': {
      if (state.phase !== event.from || !canTransitionPhase(event.from, event.to)) throw new Error(`Illegal phase transition ${event.from} -> ${event.to}.`);
      next = { ...state, phase: event.to, round: event.from === 'fight' && event.to === 'command' ? state.round + 1 : state.round };
      break;
    }
    case 'model-moved': {
      const model = state.models[event.modelId];
      if (state.phase !== 'movement' || !model || !pointEquals(model.position, event.from) || !isIntegerPoint(event.to) || !isValidOrientation(event.orientationDegrees)) throw new Error(`Model move ${event.id} does not match current state.`);
      next = {
        ...state,
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
    case 'basic-shooting-resolved': {
      const attacker = state.units[event.attackerUnitId];
      const target = state.units[event.targetUnitId];
      const weapon = attacker?.weaponProfiles.find((profile) => profile.id === event.weaponProfileId);
      if (state.phase !== 'shooting' || !attacker || !target || !weapon || attacker.playerId === target.playerId
        || !prngStatesEqual(state.prng, event.prngBefore)
        || event.shootingEnvironmentFingerprint !== state.shootingEnvironmentFingerprint
        || !event.shootingEnvironmentFingerprint.trim()) {
        throw new Error(`Basic shooting event ${event.id} does not match the current state.`);
      }
      const { range, lineOfSight, cover } = event.evidence;
      const groupIds = event.attackGroups.map((group) => group.firingModelId);
      const groupAssignments = groupIds.map((modelId) => attacker.weaponAssignments.find((assignment) => assignment.modelId === modelId && assignment.weaponProfileId === weapon.id));
      const expectedWeaponCount = groupAssignments.reduce((total, assignment) => total + (assignment?.quantity ?? 0), 0);
      if (!Number.isFinite(range.edgeToEdgeDistance) || range.edgeToEdgeDistance < 0 || range.weaponRange !== weapon.range || !range.attackerModelId.trim() || !range.targetModelId.trim()
        || !attacker.models.some((model) => model.id === range.attackerModelId && model.active)
        || !groupIds.includes(range.attackerModelId)
        || !target.models.some((model) => model.id === range.targetModelId && model.active)
        || !lineOfSight.visible || lineOfSight.reason !== 'clear'
        || lineOfSight.attackerModelId !== range.attackerModelId
        || lineOfSight.targetModelId !== range.targetModelId
        || !lineOfSight.ray
        || new Set(lineOfSight.blockerIds).size !== lineOfSight.blockerIds.length
        || !sameJson(lineOfSight.blockerIds, [...lineOfSight.blockerIds].sort())
        || !sameJson(event.evidence.weapon, {
          firingModelIds: groupIds,
          weaponCount: expectedWeaponCount,
          attacksPerWeapon: weapon.attacks,
          totalAttacks: expectedWeaponCount * weapon.attacks
        })
        || event.attackGroups.length === 0
        || new Set(groupIds).size !== groupIds.length
        || !sameJson(groupIds, [...groupIds].sort())
        || groupAssignments.some((assignment, index) => !assignment || assignment.quantity !== event.attackGroups[index].weaponCount || !attacker.models.some((model) => model.id === groupIds[index] && model.active))) {
        throw new Error(`Basic shooting event ${event.id} has malformed authoritative evidence.`);
      }
      let expectedPrng = state.prng;
      let expectedTargetModels = target.models;
      const expectedGroups: BasicShootingAttackGroup[] = [];
      for (const group of event.attackGroups) {
        const validCover = [0, 1].includes(group.cover.ballisticSkillPenalty)
          && group.cover.applies === (group.cover.ballisticSkillPenalty === 1)
          && sameJson(group.cover.sourceRefs, group.cover.applies ? [CORE_BENEFIT_OF_COVER_SOURCE] : [])
          && sameJson(group.cover.sourceRuleIds, group.cover.applies ? ['core.benefit-of-cover'] : [])
          && (group.cover.applies
            ? group.cover.terrainZoneIds.length > 0 && group.cover.terrainZoneIds.every((id) => id.trim()) && new Set(group.cover.terrainZoneIds).size === group.cover.terrainZoneIds.length && sameJson(group.cover.terrainZoneIds, [...group.cover.terrainZoneIds].sort())
            : group.cover.terrainZoneIds.length === 0);
        if (!validCover || group.range.attackerModelId !== group.firingModelId || group.lineOfSight.attackerModelId !== group.firingModelId
          || group.lineOfSight.targetModelId !== group.range.targetModelId || !group.lineOfSight.visible || group.lineOfSight.reason !== 'clear' || !group.lineOfSight.ray
          || !prngStatesEqual(group.prngBefore, expectedPrng)) throw new Error(`Basic shooting event ${event.id} has malformed attack groups.`);
        const resolution = resolveBasicShooting({
          attackerId: attacker.id,
          targetId: target.id,
          weapon: { ...weapon, attacks: weapon.attacks * group.weaponCount },
          target: { toughness: target.toughness, save: target.save, woundsPerModel: target.woundsPerModel, models: expectedTargetModels, coverBallisticSkillPenalty: group.cover.ballisticSkillPenalty },
          distance: group.range.edgeToEdgeDistance,
          visible: true
        }, expectedPrng);
        if (!resolution.accepted
          || !sameJson(resolution.hitRolls, group.hitRolls)
          || !sameJson(resolution.woundRolls, group.woundRolls)
          || !sameJson(resolution.saveRolls, group.saveRolls)
          || !sameJson(resolution.allocations, group.allocations)
          || !sameJson(resolution.steps, group.rolls)
          || !sameJson(resultFromShootingResolution(resolution), group.result)
          || !prngStatesEqual(resolution.prngAfter, group.prngAfter)) {
          throw new Error(`Basic shooting event ${event.id} fails deterministic group replay invariants.`);
        }
        expectedGroups.push(group);
        expectedPrng = resolution.prngAfter;
        expectedTargetModels = resolution.targetModelsAfter;
      }
      const expectedRolls = expectedGroups.flatMap((group, index) => {
        const offset = expectedGroups.slice(0, index).reduce((total, previous) => total + previous.rolls.length, 0);
        return group.rolls.map((roll) => ({ ...roll, attackIndex: roll.attackIndex + offset }));
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
        ...weapon.sourceRefs,
        ...event.attackGroups.flatMap((group) => group.cover.applies ? [CORE_BENEFIT_OF_COVER_SOURCE] : [])
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
        models: nextModels,
        units: {
          ...state.units,
          [target.id]: { ...target, models: event.targetModelsAfter }
        }
      };
      break;
    }
    case 'decision-requested': {
      const decision = event.decision;
      const optionIds = new Set(decision.options.map((option) => option.id));
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
  if (event.type === 'basic-shooting-resolved') throw new Error('Basic shooting events require a trusted shooting environment verifier.');
  return unsafeReduceGameEvent(state, event);
}

/** Public replay for legacy journals that contain no spatial shooting events. */
export function replayGameEvents(initialState: GameState, events: readonly GameEvent[]): GameState {
  if (events.some((event) => event.type === 'basic-shooting-resolved')) throw new Error('Basic shooting journals require a trusted shooting environment verifier.');
  return unsafeReplayGameEvents(initialState, events);
}
