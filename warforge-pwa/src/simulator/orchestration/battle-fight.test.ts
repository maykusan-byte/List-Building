import { describe, expect, it } from 'vitest';
import { executeGameCommand, reduceGameEvent, replayGameEvents, sessionCompatibilityFingerprint, type GameEvent, type GameState } from '../domain';
import { validateSimulationSave } from '../domain/serialization';
import { createSimulationAutosave, exportSimulation, importSimulation, validateSimulationAutosave } from '../persistence';
import { COMPLETE_GAME_TEST_MELEE_WEAPON } from '../testing/closed-complete-game-fixture';
import { createCompleteGameDeploymentFixture, deployAllCompleteGameUnits, resolveCompleteGameCommandPhaseForTests } from '../testing/complete-game-deployment-fixture';
import { executeCompleteGameMovementCommand } from './battle-movement';
import { executeDeclareChargeCommand, executeResolveChargeCommand } from './battle-charge';
import { executeBasicMeleeAllocationDecisionCommand, executeBasicMeleeCommand, executeEmptyFightCommand, executeFightMovementCommand, executePassFightWindowCommand } from './battle-fight';
import { createSimulatorActor, dispatchGameCommand, getSimulatorGameState } from './machine';
import { executeObjectiveAwareAdvanceBattlePhaseCommand } from './objective-control';
import { replayGameEventsWithShootingEnvironment } from './shooting';

function chargePaths(state: GameState, unitId: string, targetUnitId: string) {
  const attackers = state.units[unitId]!.models.filter((model) => model.active).map((member) => state.models[member.id]!);
  const targets = state.units[targetUnitId]!.models.filter((model) => model.active).map((member) => state.models[member.id]!);
  const closestPair = attackers.flatMap((attacker) => targets.map((target) => ({
    attacker,
    target,
    distance: Math.hypot(target.position.x - attacker.position.x, target.position.y - attacker.position.y)
  }))).sort((left, right) => left.distance - right.distance || left.attacker.id.localeCompare(right.attacker.id) || left.target.id.localeCompare(right.target.id))[0]!;
  const dx = closestPair.target.position.x - closestPair.attacker.position.x;
  const dy = closestPair.target.position.y - closestPair.attacker.position.y;
  const distance = Math.hypot(dx, dy);
  const edgeDistance = state.pendingCharge!.candidates.find((candidate) => candidate.unitId === targetUnitId)!.edgeToEdgeDistance;
  const translation = Math.max(0, edgeDistance - 200);
  return attackers.map((model) => ({
    modelId: model.id,
    waypoints: [{ x: Math.round(model.position.x + dx / distance * translation), y: Math.round(model.position.y + dy / distance * translation) }]
  }));
}

function startFightPhase(gameId: string, seed = 0x57465247) {
  const fixture = createCompleteGameDeploymentFixture(gameId, seed);
  const deployment = deployAllCompleteGameUnits(fixture.state, fixture.environment, `${gameId}-deploy`);
  const first = executeGameCommand(deployment.state, {
    id: `${gameId}-first`, actorId: deployment.state.battle!.defenderPlayerId, type: 'determine-first-player'
  });
  if (!first.accepted) throw new Error(first.rejection.message);
  const started = executeGameCommand(first.state, {
    id: `${gameId}-start`, actorId: first.state.battle!.firstPlayerId!, type: 'start-battle'
  });
  if (!started.accepted) throw new Error(started.rejection.message);
  const commandPhase = resolveCompleteGameCommandPhaseForTests(started.state, `${gameId}-command`);
  const movement = executeObjectiveAwareAdvanceBattlePhaseCommand(commandPhase.state, {
    id: `${gameId}-movement`, actorId: started.state.battle!.activePlayerId!, type: 'advance-battle-phase'
  }, fixture.environment);
  if (!movement.accepted) throw new Error(movement.rejection.message);
  let state = movement.state;
  for (const unitId of Object.keys(state.unitTurnStatuses).sort()) {
    const unit = state.units[unitId]!;
    const stationary = executeCompleteGameMovementCommand(state, {
      id: `${gameId}-stationary-${unitId}`, actorId: state.battle!.activePlayerId!, type: 'move-unit', unitId,
      movementType: 'remain-stationary', paths: unit.models.filter((model) => model.active).map((model) => ({ modelId: model.id, waypoints: [] }))
    }, fixture.environment);
    if (!stationary.accepted) throw new Error(stationary.rejection.message);
    state = stationary.state;
  }
  for (const phase of ['shooting', 'charge'] as const) {
    const advanced = executeObjectiveAwareAdvanceBattlePhaseCommand(state, {
      id: `${gameId}-to-${phase}`, actorId: state.battle!.activePlayerId!, type: 'advance-battle-phase'
    }, fixture.environment);
    if (!advanced.accepted) throw new Error(advanced.rejection.message);
    state = advanced.state;
  }
  const unitId = Object.keys(state.unitTurnStatuses).sort()[0]!;
  const declared = executeDeclareChargeCommand(state, {
    id: `${gameId}-declare`, actorId: state.battle!.activePlayerId!, type: 'declare-charge', unitId
  }, fixture.environment);
  if (!declared.accepted) throw new Error(declared.rejection.message);
  const target = declared.state.pendingCharge!.candidates
    .filter((candidate) => candidate.withinChargeRoll)
    .sort((left, right) => left.edgeToEdgeDistance - right.edgeToEdgeDistance || left.unitId.localeCompare(right.unitId))[0];
  if (!target) throw new Error('The fixed seed must expose one viable charge target.');
  const charged = executeResolveChargeCommand(declared.state, {
    id: `${gameId}-charge`, actorId: declared.state.battle!.activePlayerId!, type: 'resolve-charge', unitId,
    proceed: true, targetUnitIds: [target.unitId], paths: chargePaths(declared.state, unitId, target.unitId)
  }, fixture.environment);
  if (!charged.accepted) throw new Error(charged.rejection.message);
  const fight = executeObjectiveAwareAdvanceBattlePhaseCommand(charged.state, {
    id: `${gameId}-fight`, actorId: charged.state.battle!.activePlayerId!, type: 'advance-battle-phase'
  }, fixture.environment);
  if (!fight.accepted) throw new Error(fight.rejection.message);
  return { ...fixture, unitId, targetUnitId: target.unitId, state: fight.state };
}

function emptyFightPaths(state: GameState, unitId: string) {
  return state.units[unitId]!.models.filter((model) => model.active).map((model) => ({ modelId: model.id, waypoints: [] }));
}

function pass(state: GameState, environment: ReturnType<typeof createCompleteGameDeploymentFixture>['environment'], id: string) {
  const result = executePassFightWindowCommand(state, {
    id, actorId: state.fightPhase!.currentPlayerId!, type: 'pass-fight-window'
  }, environment);
  if (!result.accepted) throw new Error(`${result.rejection.code}: ${result.rejection.message}`);
  return result.state;
}

function finishMeleeChoices(
  state: GameState,
  environment: ReturnType<typeof createCompleteGameDeploymentFixture>['environment'],
  prefix: string,
  choose: (options: readonly { readonly id: string }[]) => string = (options) => options[0]!.id
) {
  let current = state;
  const events: GameEvent[] = [];
  let index = 0;
  while (current.pendingBasicMelee !== null) {
    const decision = current.pendingDecisions[0];
    if (!decision || decision.kind !== 'basic-melee-allocation') throw new Error('The melee continuation must expose its defender decision.');
    const result = executeBasicMeleeAllocationDecisionCommand(current, {
      id: `${prefix}-${index++}`,
      actorId: decision.playerId,
      type: 'resolve-decision',
      decisionId: decision.id,
      optionId: choose(decision.options)
    }, environment);
    if (!result.accepted) throw new Error(`${result.rejection.code}: ${result.rejection.message}`);
    events.push(...result.events);
    current = result.state;
  }
  return { state: current, events };
}

describe('M7 fight sequencing, melee movement and attacks', () => {
  it('resolves pile-in, mandatory alternating fights, consolidation and V6 replay', () => {
    const fixture = startFightPhase('fight-complete');
    let state = fixture.state;
    expect(state.fightPhase).toMatchObject({ stage: 'pile-in', currentPlayerId: state.battle!.activePlayerId, selectionBand: null });
    const blocked = executeGameCommand(state, {
      id: 'fight-skip', actorId: state.battle!.activePlayerId!, type: 'advance-battle-phase'
    });
    expect(blocked).toMatchObject({ accepted: false, state, rejection: { code: 'fight-phase-incomplete' } });

    const attackerPile = executeFightMovementCommand(state, {
      id: 'attacker-pile', actorId: state.fightPhase!.currentPlayerId!, type: 'resolve-fight-movement', movementKind: 'pile-in',
      unitId: fixture.unitId, targetUnitIds: [fixture.targetUnitId], paths: emptyFightPaths(state, fixture.unitId)
    }, fixture.environment);
    if (!attackerPile.accepted) throw new Error(`${attackerPile.rejection.code}: ${attackerPile.rejection.message}`);
    expect(attackerPile.events[0]).toMatchObject({
      type: 'fight-movement-resolved', movementKind: 'pile-in', unitId: fixture.unitId,
      sourceRefs: [{ reference: '12.03', page: 38 }, { reference: '03.03', page: 14 }]
    });
    state = attackerPile.state;
    state = pass(state, fixture.environment, 'attacker-pile-pass');

    const defenderPile = executeFightMovementCommand(state, {
      id: 'defender-pile', actorId: state.fightPhase!.currentPlayerId!, type: 'resolve-fight-movement', movementKind: 'pile-in',
      unitId: fixture.targetUnitId, targetUnitIds: [fixture.unitId], paths: emptyFightPaths(state, fixture.targetUnitId)
    }, fixture.environment);
    if (!defenderPile.accepted) throw new Error(`${defenderPile.rejection.code}: ${defenderPile.rejection.message}`);
    state = pass(defenderPile.state, fixture.environment, 'defender-pile-pass');
    expect(state.fightPhase).toMatchObject({ stage: 'fight', selectionBand: 'fights-first', currentPlayerId: state.battle!.activePlayerId });

    const activeFight = executeBasicMeleeCommand(state, {
      id: 'active-melee', actorId: state.fightPhase!.currentPlayerId!, type: 'resolve-basic-melee',
      attackerUnitId: fixture.unitId, targetUnitId: fixture.targetUnitId, weaponProfileId: COMPLETE_GAME_TEST_MELEE_WEAPON.id
    }, fixture.environment);
    if (!activeFight.accepted) throw new Error(`${activeFight.rejection.code}: ${activeFight.rejection.message}`);
    expect(activeFight.events[0]).toMatchObject({ type: 'basic-melee-stage-resolved' });
    const firstDecision = activeFight.state.pendingDecisions[0]!;
    expect(firstDecision).toMatchObject({ kind: 'basic-melee-allocation', playerId: state.units[fixture.targetUnitId]!.playerId });
    expect(firstDecision.options.length).toBeGreaterThan(1);
    const interruptedExport = exportSimulation(
      fixture.initial,
      activeFight.state,
      '2026-08-29T00:00:00.000Z',
      fixture.environment
    );
    expect(importSimulation(
      interruptedExport,
      fixture.environment,
      sessionCompatibilityFingerprint(fixture.session)
    )).toMatchObject({ ok: true, state: activeFight.state });
    const firstChoiceId = firstDecision.options.at(-1)!.id;
    expect(activeFight.state.pendingBasicMelee!.saveRolls).toEqual(
      [...activeFight.state.pendingBasicMelee!.saveRolls].sort((left, right) => left.roll - right.roll || left.attackIndex - right.attackIndex)
    );
    const prngAfterAllSaves = activeFight.state.prng;
    const activeFinished = finishMeleeChoices(activeFight.state, fixture.environment, 'active-allocation', (options) => options.at(-1)!.id);
    const activeEvents = [...activeFight.events, ...activeFinished.events];
    const allocationEvents = activeEvents.filter((event): event is Extract<GameEvent, { readonly type: 'basic-melee-allocation-resolved' }> => event.type === 'basic-melee-allocation-resolved');
    expect(allocationEvents.map((event) => ({ attackIndex: event.attackIndex, roll: event.saveRoll, saved: event.saved }))).toEqual(
      activeFight.state.pendingBasicMelee!.saveRolls.slice(0, allocationEvents.length)
    );
    expect(allocationEvents.every((event) => JSON.stringify(event.prngBefore) === JSON.stringify(prngAfterAllSaves)
      && JSON.stringify(event.prngAfter) === JSON.stringify(prngAfterAllSaves))).toBe(true);
    const firstAllocation = activeEvents.find((event): event is Extract<GameEvent, { readonly type: 'basic-melee-allocation-resolved' }> => event.type === 'basic-melee-allocation-resolved' && event.decisionId !== null)!;
    expect(firstAllocation).toMatchObject({
      playerId: firstDecision.playerId,
      modelId: firstChoiceId,
      saveRoll: activeFight.state.pendingBasicMelee!.saveRolls[0]!.roll,
      prngBefore: prngAfterAllSaves,
      prngAfter: prngAfterAllSaves
    });
    const activeEvent = activeEvents.find((event): event is Extract<GameEvent, { readonly type: 'basic-melee-resolved' }> => event.type === 'basic-melee-resolved')!;
    expect(activeEvent).toMatchObject({
      type: 'basic-melee-resolved', attackerUnitId: fixture.unitId, targetUnitId: fixture.targetUnitId,
      weaponProfileId: COMPLETE_GAME_TEST_MELEE_WEAPON.id,
      result: { hitRequired: 3, woundRequired: 4, saveRequired: 3 }
    });
    expect(activeEvent.sourceRefs.slice(0, 3)).toMatchObject([
      { reference: '12.04', page: 40 }, { reference: '12.05', page: 40 }, { reference: '04', page: 16 }
    ]);
    expect(activeEvent.rolls).toHaveLength(activeEvent.attackingModelIds.length * COMPLETE_GAME_TEST_MELEE_WEAPON.attacks);
    expect(activeEvent.rolls.every((step) => Number.isInteger(step.hitRoll))).toBe(true);
    expect(activeEvent.rolls.find((step) => step.allocatedModelId)?.allocatedModelId).toBe(firstChoiceId);
    expect(activeFinished.state.units[fixture.targetUnitId]!.models).toEqual(activeEvent.targetModelsAfter);
    state = activeFinished.state;

    state = pass(state, fixture.environment, 'defender-first-pass');
    expect(state.fightPhase).toMatchObject({ stage: 'fight', selectionBand: 'remaining', currentPlayerId: state.units[fixture.targetUnitId]!.playerId });

    const defenderFight = executeBasicMeleeCommand(state, {
      id: 'defender-melee', actorId: state.fightPhase!.currentPlayerId!, type: 'resolve-basic-melee',
      attackerUnitId: fixture.targetUnitId, targetUnitId: fixture.unitId, weaponProfileId: COMPLETE_GAME_TEST_MELEE_WEAPON.id
    }, fixture.environment);
    if (!defenderFight.accepted) throw new Error(`${defenderFight.rejection.code}: ${defenderFight.rejection.message}`);
    state = finishMeleeChoices(defenderFight.state, fixture.environment, 'defender-allocation').state;
    state = pass(state, fixture.environment, 'attacker-fight-pass');
    expect(state.fightPhase).toMatchObject({ stage: 'consolidation', currentPlayerId: state.battle!.activePlayerId });

    const activeConsolidation = executeFightMovementCommand(state, {
      id: 'attacker-consolidates', actorId: state.fightPhase!.currentPlayerId!, type: 'resolve-fight-movement', movementKind: 'consolidation',
      unitId: fixture.unitId, targetUnitIds: [fixture.targetUnitId], paths: emptyFightPaths(state, fixture.unitId)
    }, fixture.environment);
    if (!activeConsolidation.accepted) throw new Error(`${activeConsolidation.rejection.code}: ${activeConsolidation.rejection.message}`);
    state = pass(activeConsolidation.state, fixture.environment, 'attacker-consolidation-pass');
    const defenderConsolidation = executeFightMovementCommand(state, {
      id: 'defender-consolidates', actorId: state.fightPhase!.currentPlayerId!, type: 'resolve-fight-movement', movementKind: 'consolidation',
      unitId: fixture.targetUnitId, targetUnitIds: [fixture.unitId], paths: emptyFightPaths(state, fixture.targetUnitId)
    }, fixture.environment);
    if (!defenderConsolidation.accepted) throw new Error(`${defenderConsolidation.rejection.code}: ${defenderConsolidation.rejection.message}`);
    state = pass(defenderConsolidation.state, fixture.environment, 'defender-consolidation-pass');
    expect(state.fightPhase).toMatchObject({ stage: 'complete', currentPlayerId: null });

    const advanced = executeObjectiveAwareAdvanceBattlePhaseCommand(state, {
      id: 'fight-complete-advance', actorId: state.battle!.activePlayerId!, type: 'advance-battle-phase'
    }, fixture.environment);
    if (!advanced.accepted) throw new Error(advanced.rejection.message);
    expect(advanced.state).toMatchObject({ phase: 'command', battle: { turnNumber: 2, phase: 'command' }, fightPhase: null });
    expect(replayGameEventsWithShootingEnvironment(fixture.initial, advanced.state.eventLog, fixture.environment)).toEqual(advanced.state);

    const exported = exportSimulation(fixture.initial, advanced.state, '2026-08-29T00:00:00.000Z', fixture.environment);
    expect(JSON.parse(exported).schemaVersion).toBe('warforge-simulation-save/v6');
    expect(validateSimulationSave(JSON.parse(exported))).toMatchObject({ ok: false, errors: [expect.stringContaining('vérificateur spatial')] });
    expect(importSimulation(exported, fixture.environment, sessionCompatibilityFingerprint(fixture.session))).toMatchObject({ ok: true, state: advanced.state });
  });

  it('rejects a model that moves away from its pile-in target without consuming PRNG', () => {
    const fixture = startFightPhase('fight-away');
    const unit = fixture.state.units[fixture.unitId]!;
    const targetModels = fixture.state.units[fixture.targetUnitId]!.models.filter((model) => model.active).map((model) => fixture.state.models[model.id]!);
    const moving = unit.models.filter((model) => model.active).map((model) => fixture.state.models[model.id]!)
      .sort((left, right) => left.id.localeCompare(right.id))[0]!;
    const nearest = [...targetModels].sort((left, right) => Math.hypot(left.position.x - moving.position.x, left.position.y - moving.position.y)
      - Math.hypot(right.position.x - moving.position.x, right.position.y - moving.position.y))[0]!;
    const dx = moving.position.x - nearest.position.x;
    const dy = moving.position.y - nearest.position.y;
    const length = Math.hypot(dx, dy);
    const paths = emptyFightPaths(fixture.state, fixture.unitId).map((path) => path.modelId === moving.id ? {
      ...path,
      waypoints: [{ x: Math.round(moving.position.x + dx / length * 50), y: Math.round(moving.position.y + dy / length * 50) }]
    } : path);
    const rejected = executeFightMovementCommand(fixture.state, {
      id: 'pile-away', actorId: fixture.state.fightPhase!.currentPlayerId!, type: 'resolve-fight-movement', movementKind: 'pile-in',
      unitId: fixture.unitId, targetUnitIds: [fixture.targetUnitId], paths
    }, fixture.environment);
    expect(rejected).toMatchObject({ accepted: false, state: fixture.state, rejection: { code: 'fight-model-not-closer' } });
    expect(rejected.state.prng).toEqual(fixture.state.prng);
  });

  it('allows terminal base contact, then keeps the contacted enemy model immobile', () => {
    const fixture = startFightPhase('fight-base-contact');
    const attackers = fixture.state.units[fixture.unitId]!.models.filter((model) => model.active).map((model) => fixture.state.models[model.id]!);
    const defenders = fixture.state.units[fixture.targetUnitId]!.models.filter((model) => model.active).map((model) => fixture.state.models[model.id]!);
    const pair = attackers.flatMap((attacker) => defenders.map((defender) => ({
      attacker, defender, distance: Math.hypot(defender.position.x - attacker.position.x, defender.position.y - attacker.position.y)
    }))).sort((left, right) => left.distance - right.distance || left.attacker.id.localeCompare(right.attacker.id))[0]!;
    const dx = pair.defender.position.x - pair.attacker.position.x;
    const dy = pair.defender.position.y - pair.attacker.position.y;
    const travel = pair.distance - 320;
    const paths = emptyFightPaths(fixture.state, fixture.unitId).map((path) => path.modelId === pair.attacker.id ? {
      ...path,
      waypoints: [{ x: Math.round(pair.attacker.position.x + dx / pair.distance * travel), y: Math.round(pair.attacker.position.y + dy / pair.distance * travel) }]
    } : path);
    const contacted = executeFightMovementCommand(fixture.state, {
      id: 'create-base-contact', actorId: fixture.state.fightPhase!.currentPlayerId!, type: 'resolve-fight-movement', movementKind: 'pile-in',
      unitId: fixture.unitId, targetUnitIds: [fixture.targetUnitId], paths
    }, fixture.environment);
    if (!contacted.accepted) throw new Error(`${contacted.rejection.code}: ${contacted.rejection.message}`);
    expect(contacted.events[0]).toMatchObject({ type: 'fight-movement-resolved', evidence: { paths: expect.arrayContaining([expect.objectContaining({ modelId: pair.attacker.id, finalTargetDistance: 0 })]) } });
    const defenderTurn = pass(contacted.state, fixture.environment, 'contact-active-pass');
    const defenderPaths = emptyFightPaths(defenderTurn, fixture.targetUnitId).map((path) => path.modelId === pair.defender.id ? {
      ...path,
      waypoints: [{ x: pair.defender.position.x, y: pair.defender.position.y + 1 }]
    } : path);
    const movedContact = executeFightMovementCommand(defenderTurn, {
      id: 'move-base-contact', actorId: defenderTurn.fightPhase!.currentPlayerId!, type: 'resolve-fight-movement', movementKind: 'pile-in',
      unitId: fixture.targetUnitId, targetUnitIds: [fixture.unitId], paths: defenderPaths
    }, fixture.environment);
    expect(movedContact).toMatchObject({ accepted: false, state: defenderTurn, rejection: { code: 'fight-base-contact-model-moved' } });
  });

  it('rejects forged melee outcomes during trusted replay', () => {
    const fixture = startFightPhase('fight-forgery');
    let state = pass(fixture.state, fixture.environment, 'forgery-pile-active');
    state = pass(state, fixture.environment, 'forgery-pile-defender');
    const melee = executeBasicMeleeCommand(state, {
      id: 'forgery-melee', actorId: state.fightPhase!.currentPlayerId!, type: 'resolve-basic-melee',
      attackerUnitId: fixture.unitId, targetUnitId: fixture.targetUnitId, weaponProfileId: COMPLETE_GAME_TEST_MELEE_WEAPON.id
    }, fixture.environment);
    if (!melee.accepted) throw new Error(melee.rejection.message);
    const finished = finishMeleeChoices(melee.state, fixture.environment, 'forgery-allocation');
    const forged = structuredClone(finished.state.eventLog) as GameEvent[];
    const event = forged.find((candidate): candidate is Extract<GameEvent, { readonly type: 'basic-melee-resolved' }> => candidate.type === 'basic-melee-resolved')!;
    (event.result as { hits: number }).hits += 1;
    expect(() => replayGameEvents(fixture.initial, finished.state.eventLog)).toThrow('trusted shooting environment verifier');
    expect(() => replayGameEventsWithShootingEnvironment(fixture.initial, forged, fixture.environment)).toThrow('trusted verification');
  });

  it('uses Counter-offensive for 2 CP immediately after the active player attacks and forces that unit to fight next', () => {
    const fixture = startFightPhase('fight-counter-offensive');
    let state = pass(fixture.state, fixture.environment, 'counter-pile-active');
    state = pass(state, fixture.environment, 'counter-pile-defender');
    const active = executeBasicMeleeCommand(state, {
      id: 'counter-active-melee', actorId: state.fightPhase!.currentPlayerId!, type: 'resolve-basic-melee',
      attackerUnitId: fixture.unitId, targetUnitId: fixture.targetUnitId, weaponProfileId: COMPLETE_GAME_TEST_MELEE_WEAPON.id
    }, fixture.environment);
    if (!active.accepted) throw new Error(`${active.rejection.code}: ${active.rejection.message}`);
    state = finishMeleeChoices(active.state, fixture.environment, 'counter-active-allocation').state;
    const defenderId = state.units[fixture.targetUnitId]!.playerId;
    expect(state.eventLog.at(-1)).toMatchObject({ type: 'basic-melee-resolved', playerId: state.battle!.activePlayerId });
    expect(state.fightPhase).toMatchObject({ stage: 'fight', currentPlayerId: defenderId, selectionBand: 'fights-first' });

    const insufficient = executeGameCommand(state, {
      id: 'counter-no-points', actorId: defenderId, type: 'use-counter-offensive', unitId: fixture.targetUnitId
    });
    expect(insufficient).toMatchObject({ accepted: false, state, rejection: { code: 'insufficient-command-points' } });
    const withTwoCp: GameState = {
      ...state,
      battleResources: {
        ...state.battleResources!,
        commandPointsByPlayerId: { ...state.battleResources!.commandPointsByPlayerId, [defenderId]: 2 }
      }
    };
    const beforePrng = withTwoCp.prng;
    const used = executeGameCommand(withTwoCp, {
      id: 'counter-use', actorId: defenderId, type: 'use-counter-offensive', unitId: fixture.targetUnitId
    });
    if (!used.accepted) throw new Error(`${used.rejection.code}: ${used.rejection.message}`);
    const event = used.events[0] as Extract<GameEvent, { type: 'counter-offensive-used' }>;
    expect(event).toMatchObject({
      type: 'counter-offensive-used', targetUnitId: fixture.targetUnitId, cost: 2,
      fightPhaseAfter: { forcedNextFightUnitId: fixture.targetUnitId },
      use: { eventId: 'counter-use:0', stratagemId: 'counter-offensive', phase: 'fight' },
      sourceRefs: [
        { reference: '15.01', page: 54 }, { reference: '15.12', page: 57 },
        { sourceId: 'warforge-universal-rules-updates-en-2026-07', reference: 'stratagem-updates' },
        { reference: '15.01' }, { reference: '15.01.01' }
      ]
    });
    expect(used.state.prng).toEqual(beforePrng);
    expect(used.state.battleResources!.commandPointsByPlayerId[defenderId]).toBe(0);
    expect(used.state.battleResources!.stratagemUses).toContainEqual(event.use);

    expect(executeGameCommand(used.state, {
      id: 'counter-pass-refused', actorId: defenderId, type: 'pass-fight-window'
    })).toMatchObject({ accepted: false, state: used.state, rejection: { code: 'counter-offensive-fight-required' } });
    const otherDefender = Object.values(used.state.units).find((unit) => unit.playerId === defenderId && unit.id !== fixture.targetUnitId)!;
    expect(executeBasicMeleeCommand(used.state, {
      id: 'counter-other-refused', actorId: defenderId, type: 'resolve-basic-melee',
      attackerUnitId: otherDefender.id, targetUnitId: fixture.unitId, weaponProfileId: COMPLETE_GAME_TEST_MELEE_WEAPON.id
    }, fixture.environment)).toMatchObject({ accepted: false, state: used.state, rejection: { code: 'counter-offensive-fight-required' } });

    const defenderFight = executeBasicMeleeCommand(used.state, {
      id: 'counter-defender-melee', actorId: defenderId, type: 'resolve-basic-melee',
      attackerUnitId: fixture.targetUnitId, targetUnitId: fixture.unitId, weaponProfileId: COMPLETE_GAME_TEST_MELEE_WEAPON.id
    }, fixture.environment);
    if (!defenderFight.accepted) throw new Error(`${defenderFight.rejection.code}: ${defenderFight.rejection.message}`);
    const finished = finishMeleeChoices(defenderFight.state, fixture.environment, 'counter-defender-allocation');
    expect(finished.state.fightPhase?.forcedNextFightUnitId).toBeUndefined();
    expect(finished.state.fightPhase?.foughtUnitIds).toContain(fixture.targetUnitId);

    const forged = structuredClone(event) as Extract<GameEvent, { type: 'counter-offensive-used' }>;
    (forged.fightPhaseAfter as { forcedNextFightUnitId: string }).forcedNextFightUnitId = otherDefender.id;
    const battleShocked: GameState = {
      ...withTwoCp,
      battleResources: { ...withTwoCp.battleResources!, battleShockedUnitIds: [fixture.targetUnitId] }
    };
    expect(executeGameCommand(battleShocked, {
      id: 'counter-battle-shocked', actorId: defenderId, type: 'use-counter-offensive', unitId: fixture.targetUnitId
    })).toMatchObject({ accepted: false, state: battleShocked, rejection: { code: 'battle-shocked-stratagem-target' } });
    expect(() => reduceGameEvent(withTwoCp, forged)).toThrow('Counter-offensive event');
  });

  it('exports, imports and autosaves a legal turn-two Counter-offensive window exactly', () => {
    const fixture = startFightPhase('fight-counter-persistence');
    let state = pass(fixture.state, fixture.environment, 'counter-persist-pile-active');
    state = pass(state, fixture.environment, 'counter-persist-pile-defender');

    const firstFight = executeBasicMeleeCommand(state, {
      id: 'counter-persist-first-melee', actorId: state.fightPhase!.currentPlayerId!, type: 'resolve-basic-melee',
      attackerUnitId: fixture.unitId, targetUnitId: fixture.targetUnitId, weaponProfileId: COMPLETE_GAME_TEST_MELEE_WEAPON.id
    }, fixture.environment);
    if (!firstFight.accepted) throw new Error(`${firstFight.rejection.code}: ${firstFight.rejection.message}`);
    state = finishMeleeChoices(firstFight.state, fixture.environment, 'counter-persist-first-allocation').state;
    state = pass(state, fixture.environment, 'counter-persist-to-remaining');

    const returnFight = executeBasicMeleeCommand(state, {
      id: 'counter-persist-return-melee', actorId: state.fightPhase!.currentPlayerId!, type: 'resolve-basic-melee',
      attackerUnitId: fixture.targetUnitId, targetUnitId: fixture.unitId, weaponProfileId: COMPLETE_GAME_TEST_MELEE_WEAPON.id
    }, fixture.environment);
    if (!returnFight.accepted) throw new Error(`${returnFight.rejection.code}: ${returnFight.rejection.message}`);
    state = finishMeleeChoices(returnFight.state, fixture.environment, 'counter-persist-return-allocation').state;
    state = pass(state, fixture.environment, 'counter-persist-fight-complete');
    state = pass(state, fixture.environment, 'counter-persist-consolidation-active');
    state = pass(state, fixture.environment, 'counter-persist-consolidation-defender');
    expect(state.fightPhase).toMatchObject({ stage: 'complete' });

    const secondTurn = executeObjectiveAwareAdvanceBattlePhaseCommand(state, {
      id: 'counter-persist-second-turn', actorId: state.battle!.activePlayerId!, type: 'advance-battle-phase'
    }, fixture.environment);
    if (!secondTurn.accepted) throw new Error(secondTurn.rejection.message);
    const commandPhase = resolveCompleteGameCommandPhaseForTests(secondTurn.state, 'counter-persist-command');
    expect(commandPhase.state.battleResources!.commandPointsByPlayerId).toEqual(Object.fromEntries(
      commandPhase.state.battle!.playerIds.map((playerId) => [playerId, 2])
    ));
    const movement = executeObjectiveAwareAdvanceBattlePhaseCommand(commandPhase.state, {
      id: 'counter-persist-movement', actorId: commandPhase.state.battle!.activePlayerId!, type: 'advance-battle-phase'
    }, fixture.environment);
    if (!movement.accepted) throw new Error(movement.rejection.message);
    state = movement.state;
    for (const unitId of Object.keys(state.unitTurnStatuses).sort()) {
      const unit = state.units[unitId]!;
      const stationary = executeCompleteGameMovementCommand(state, {
        id: `counter-persist-stationary-${unitId}`, actorId: state.battle!.activePlayerId!, type: 'move-unit',
        unitId, movementType: 'remain-stationary', paths: emptyFightPaths(state, unitId)
      }, fixture.environment);
      if (!stationary.accepted) throw new Error(`${stationary.rejection.code}: ${stationary.rejection.message}`);
      state = stationary.state;
    }
    for (const phase of ['shooting', 'charge', 'fight'] as const) {
      const advanced = executeObjectiveAwareAdvanceBattlePhaseCommand(state, {
        id: `counter-persist-to-${phase}`, actorId: state.battle!.activePlayerId!, type: 'advance-battle-phase'
      }, fixture.environment);
      if (!advanced.accepted) throw new Error(advanced.rejection.message);
      state = advanced.state;
    }
    state = pass(state, fixture.environment, 'counter-persist-second-pile-active');
    state = pass(state, fixture.environment, 'counter-persist-second-pile-defender');
    state = pass(state, fixture.environment, 'counter-persist-second-to-remaining');
    expect(state.fightPhase).toMatchObject({ stage: 'fight', selectionBand: 'remaining', currentPlayerId: state.battle!.activePlayerId });

    const secondActiveFight = executeBasicMeleeCommand(state, {
      id: 'counter-persist-second-active-melee', actorId: state.fightPhase!.currentPlayerId!, type: 'resolve-basic-melee',
      attackerUnitId: fixture.targetUnitId, targetUnitId: fixture.unitId, weaponProfileId: COMPLETE_GAME_TEST_MELEE_WEAPON.id
    }, fixture.environment);
    if (!secondActiveFight.accepted) throw new Error(`${secondActiveFight.rejection.code}: ${secondActiveFight.rejection.message}`);
    state = finishMeleeChoices(secondActiveFight.state, fixture.environment, 'counter-persist-second-allocation').state;
    const counterPlayerId = state.units[fixture.unitId]!.playerId;
    const counter = executeGameCommand(state, {
      id: 'counter-persist-use', actorId: counterPlayerId, type: 'use-counter-offensive', unitId: fixture.unitId
    });
    if (!counter.accepted) throw new Error(`${counter.rejection.code}: ${counter.rejection.message}`);
    expect(counter.state).toMatchObject({
      fightPhase: { forcedNextFightUnitId: fixture.unitId },
      battleResources: { commandPointsByPlayerId: { [counterPlayerId]: 0 }, stratagemUses: [{ stratagemId: 'counter-offensive' }] }
    });

    const manifestFingerprint = sessionCompatibilityFingerprint(fixture.session);
    const exported = exportSimulation(fixture.initial, counter.state, '2026-08-30T00:00:00.000Z', fixture.environment);
    expect(importSimulation(exported, fixture.environment, manifestFingerprint)).toMatchObject({ ok: true, state: counter.state });
    const autosave = createSimulationAutosave(fixture.initial, counter.state, '2026-08-30T00:01:00.000Z', fixture.environment);
    expect(validateSimulationAutosave(autosave, fixture.environment, manifestFingerprint)).toMatchObject({ ok: true, state: counter.state });
  });

  it('chooses one melee weapon per model even when several identical instances are equipped', () => {
    const fixture = startFightPhase('fight-one-weapon');
    let state = pass(fixture.state, fixture.environment, 'one-weapon-pile-active');
    state = pass(state, fixture.environment, 'one-weapon-pile-defender');
    const attacker = state.units[fixture.unitId]!;
    const doubledAssignments = attacker.weaponAssignments.map((assignment) => assignment.weaponProfileId === COMPLETE_GAME_TEST_MELEE_WEAPON.id
      ? { ...assignment, quantity: 2 }
      : assignment);
    const doubled: GameState = { ...state, units: { ...state.units, [attacker.id]: { ...attacker, weaponAssignments: doubledAssignments } } };
    const melee = executeBasicMeleeCommand(doubled, {
      id: 'one-melee-weapon', actorId: doubled.fightPhase!.currentPlayerId!, type: 'resolve-basic-melee',
      attackerUnitId: fixture.unitId, targetUnitId: fixture.targetUnitId, weaponProfileId: COMPLETE_GAME_TEST_MELEE_WEAPON.id
    }, fixture.environment);
    if (!melee.accepted) throw new Error(melee.rejection.message);
    const finished = finishMeleeChoices(melee.state, fixture.environment, 'one-weapon-allocation');
    const event = [...melee.events, ...finished.events].find((candidate): candidate is Extract<GameEvent, { readonly type: 'basic-melee-resolved' }> => candidate.type === 'basic-melee-resolved')!;
    expect(event.rolls).toHaveLength(event.attackingModelIds.length * COMPLETE_GAME_TEST_MELEE_WEAPON.attacks);
  });

  it('marks an eligible unit without melee weapons as fought without drawing entropy', () => {
    const fixture = startFightPhase('fight-no-weapons');
    let state = pass(fixture.state, fixture.environment, 'no-weapons-pile-active');
    state = pass(state, fixture.environment, 'no-weapons-pile-defender');
    const attacker = state.units[fixture.unitId]!;
    const withoutMelee: GameState = {
      ...state,
      units: {
        ...state.units,
        [attacker.id]: {
          ...attacker,
          weaponProfiles: attacker.weaponProfiles.filter((profile) => profile.weaponType !== 'melee'),
          weaponAssignments: attacker.weaponAssignments.filter((assignment) => assignment.weaponProfileId !== COMPLETE_GAME_TEST_MELEE_WEAPON.id)
        }
      }
    };
    const result = executeEmptyFightCommand(withoutMelee, {
      id: 'empty-fight', actorId: withoutMelee.fightPhase!.currentPlayerId!, type: 'resolve-empty-fight', unitId: fixture.unitId
    }, fixture.environment);
    if (!result.accepted) throw new Error(`${result.rejection.code}: ${result.rejection.message}`);
    expect(result.events[0]).toMatchObject({
      type: 'empty-fight-resolved', unitId: fixture.unitId,
      sourceRefs: [{ reference: '12.04' }, { reference: '12.05' }, { reference: 'faq.select-unit-without-weapons' }]
    });
    expect(result.state.prng).toEqual(withoutMelee.prng);
    expect(result.state.fightPhase?.foughtUnitIds).toContain(fixture.unitId);
    const armed = executeEmptyFightCommand(state, {
      id: 'armed-empty-fight', actorId: state.fightPhase!.currentPlayerId!, type: 'resolve-empty-fight', unitId: fixture.unitId
    }, fixture.environment);
    expect(armed).toMatchObject({ accepted: false, state, rejection: { code: 'melee-weapon-selection-required' } });
  });

  it('fails closed before a consolidation that would engage a new enemy unit', () => {
    const fixture = startFightPhase('fight-new-consolidation');
    const activePlayerId = fixture.state.battle!.activePlayerId!;
    const shiftedModels = { ...fixture.state.models };
    for (const member of fixture.state.units[fixture.targetUnitId]!.models.filter((model) => model.active)) {
      shiftedModels[member.id] = { ...shiftedModels[member.id]!, position: { x: shiftedModels[member.id]!.position.x, y: shiftedModels[member.id]!.position.y + 400 } };
    }
    const consolidation: GameState = {
      ...fixture.state,
      models: shiftedModels,
      fightPhase: {
        ...fixture.state.fightPhase!, stage: 'consolidation', selectionBand: null, currentPlayerId: activePlayerId,
        eligibleAtFightStartUnitIds: [fixture.unitId], passedPlayerIds: []
      }
    };
    const rejected = executeFightMovementCommand(consolidation, {
      id: 'new-engagement-consolidation', actorId: activePlayerId, type: 'resolve-fight-movement', movementKind: 'consolidation',
      unitId: fixture.unitId, targetUnitIds: [fixture.targetUnitId], paths: emptyFightPaths(consolidation, fixture.unitId)
    }, fixture.environment);
    expect(rejected).toMatchObject({ accepted: false, state: consolidation, rejection: { code: 'consolidation-engagement-not-covered' } });
    expect(rejected.state.prng).toEqual(consolidation.prng);
  });

  it('routes fight passes through the XState trusted environment', () => {
    const fixture = startFightPhase('fight-machine');
    const actor = createSimulatorActor({ initialState: fixture.initial, gameState: fixture.state, shootingEnvironment: fixture.environment });
    actor.start();
    dispatchGameCommand(actor, {
      id: 'machine-fight-pass', actorId: fixture.state.fightPhase!.currentPlayerId!, type: 'pass-fight-window'
    });
    expect(getSimulatorGameState(actor).fightPhase).toMatchObject({ stage: 'pile-in', currentPlayerId: expect.not.stringMatching(fixture.state.fightPhase!.currentPlayerId!) });
    expect(actor.getSnapshot().value).toEqual({ active: 'fight' });
    actor.stop();
  });

  it('routes a defender melee allocation through the XState trusted environment', () => {
    const fixture = startFightPhase('fight-machine-allocation');
    let state = pass(fixture.state, fixture.environment, 'machine-allocation-pile-active');
    state = pass(state, fixture.environment, 'machine-allocation-pile-defender');
    const melee = executeBasicMeleeCommand(state, {
      id: 'machine-allocation-melee',
      actorId: state.fightPhase!.currentPlayerId!,
      type: 'resolve-basic-melee',
      attackerUnitId: fixture.unitId,
      targetUnitId: fixture.targetUnitId,
      weaponProfileId: COMPLETE_GAME_TEST_MELEE_WEAPON.id
    }, fixture.environment);
    if (!melee.accepted) throw new Error(`${melee.rejection.code}: ${melee.rejection.message}`);
    const decision = melee.state.pendingDecisions[0]!;
    const command = {
      id: 'machine-allocation-choice',
      actorId: decision.playerId,
      type: 'resolve-decision' as const,
      decisionId: decision.id,
      optionId: decision.options.at(-1)!.id
    };
    const expected = executeBasicMeleeAllocationDecisionCommand(melee.state, command, fixture.environment);
    if (!expected.accepted) throw new Error(`${expected.rejection.code}: ${expected.rejection.message}`);

    const actor = createSimulatorActor({ initialState: fixture.initial, gameState: melee.state, shootingEnvironment: fixture.environment });
    actor.start();
    dispatchGameCommand(actor, command);
    expect(getSimulatorGameState(actor)).toEqual(expected.state);
    actor.stop();
  });
});
