import { describe, expect, it } from 'vitest';
import {
  TIMED_EFFECT_V1_SCHEMA_VERSION,
  applyTimedEffectV1,
  createSimulationSaveV6,
  dueTimedEffectIdsV1,
  executeGameCommand,
  nextBattleStepV1,
  reduceGameEvent,
  replayGameEvents,
  timedEffectExpirationsForPhaseTransitionV1,
  unitIsAtOrBelowHalfStrengthV1,
  validateSimulationSave,
  validateGameCommand,
  type GameEvent,
  type GameState,
  type TimedEffectV1,
  type UnitState
} from '.';
import { executeObjectiveAwareAdvanceBattlePhaseCommand } from '../orchestration/objective-control';
import { replayGameEventsWithShootingEnvironment } from '../orchestration/shooting';
import { OFFICIAL_APP_PERSISTING_EFFECTS_SOURCE } from '../rules/m8-source-references';
import { CORE_BATTLE_ROUND_SOURCE, EVENT_COMPANION_FIVE_ROUNDS_SOURCE } from '../rules/m7-source-references';
import { OFFICIAL_APP_MODIFIERS_SOURCE } from '../rules/m5-source-references';
import {
  createCompleteGameDeploymentFixture,
  deployAllCompleteGameUnits,
  resolveCompleteGameCommandPhaseForTests
} from '../testing/complete-game-deployment-fixture';

function startBattle(gameId: string, seed = 0x57465247) {
  const fixture = createCompleteGameDeploymentFixture(gameId, seed);
  const deployment = deployAllCompleteGameUnits(fixture.state, fixture.environment, `${gameId}-deploy`);
  const firstPlayer = executeGameCommand(deployment.state, {
    id: `${gameId}-first-player`,
    actorId: deployment.state.battle!.defenderPlayerId,
    type: 'determine-first-player'
  });
  if (!firstPlayer.accepted) throw new Error(firstPlayer.rejection.message);
  const started = executeGameCommand(firstPlayer.state, {
    id: `${gameId}-start`,
    actorId: firstPlayer.state.battle!.firstPlayerId!,
    type: 'start-battle'
  });
  if (!started.accepted) throw new Error(started.rejection.message);
  return { ...fixture, state: started.state };
}

function executeAccepted(state: GameState, command: Parameters<typeof executeGameCommand>[1]) {
  const result = executeGameCommand(state, command);
  if (!result.accepted) throw new Error(`${result.rejection.code}: ${result.rejection.message}`);
  return result;
}

function activePlayerUnits(state: GameState): UnitState[] {
  return Object.values(state.units)
    .filter((unit) => unit.playerId === state.battle!.activePlayerId)
    .sort((left, right) => left.id.localeCompare(right.id));
}

function timedEffect(id: string, targetUnitId: string, phase: 'command' | 'movement', expiresPhase = phase): TimedEffectV1 {
  return {
    schemaVersion: TIMED_EFFECT_V1_SCHEMA_VERSION,
    id,
    targetUnitId,
    modifier: {
      id: `${id}-modifier`,
      characteristic: 'objective-control',
      operation: 'add',
      value: 1,
      source: OFFICIAL_APP_MODIFIERS_SOURCE
    },
    appliedAt: { battleRound: 1, turnNumber: 1, phase, boundary: 'start' },
    expiresAt: { battleRound: 1, turnNumber: 1, phase: expiresPhase, boundary: 'end' },
    sourceRefs: [OFFICIAL_APP_MODIFIERS_SOURCE, OFFICIAL_APP_PERSISTING_EFFECTS_SOURCE]
  };
}

describe('M8 command resources and durable statuses', () => {
  it('resolves the five command stages, grants each player exactly one base CP and blocks an early phase change', () => {
    const fixture = startBattle('m8-command-sequence');
    const initialPrng = fixture.state.prng;
    const early = executeGameCommand(fixture.state, {
      id: 'm8-command-early-advance', actorId: fixture.state.battle!.activePlayerId!, type: 'advance-battle-phase'
    });
    expect(early).toMatchObject({ accepted: false, state: fixture.state, rejection: { code: 'command-phase-incomplete' } });
    expect(early.state.prng).toEqual(initialPrng);

    let state = fixture.state;
    const transitions: string[] = [];
    for (let index = 0; state.commandPhase?.stage !== 'complete'; index += 1) {
      const result = executeAccepted(state, {
        id: `m8-command-stage-${index}`, actorId: state.battle!.activePlayerId!, type: 'resolve-command-stage'
      });
      const event = result.events[0] as Extract<GameEvent, { type: 'command-stage-resolved' }>;
      transitions.push(`${event.from}->${event.to}`);
      state = result.state;
    }

    expect(transitions).toEqual([
      'start->gain-base-cp',
      'gain-base-cp->battle-shock',
      'battle-shock->abilities',
      'abilities->end',
      'end->complete'
    ]);
    expect(state.battleResources!.commandPointsByPlayerId).toEqual(Object.fromEntries(
      state.battle!.playerIds.map((playerId) => [playerId, 1])
    ));
    expect(state.prng).toEqual(initialPrng);
    const duplicate = executeGameCommand(state, {
      id: 'm8-command-extra-stage', actorId: state.battle!.activePlayerId!, type: 'resolve-command-stage'
    });
    expect(duplicate).toMatchObject({ accepted: false, state, rejection: { code: 'wrong-command-stage-window' } });

    const replayed = replayGameEventsWithShootingEnvironment(fixture.initial, state.eventLog, fixture.environment);
    expect(replayed).toEqual(state);

    const save = createSimulationSaveV6(
      fixture.initial,
      state.eventLog,
      '2026-08-29T10:00:00.000Z',
      (initial, events) => replayGameEventsWithShootingEnvironment(initial, events, fixture.environment)
    );
    const missingM8Version = structuredClone(save) as unknown as { environment: Record<string, unknown> };
    delete missingM8Version.environment.commandPhaseSchemaVersion;
    expect(validateSimulationSave(missingM8Version)).toMatchObject({
      ok: false,
      errors: ['La sauvegarde V6 ne correspond pas à son environnement de partie complète.']
    });
  });

  it('keeps the pre-M8 additive event shape only for sessions without objective geometry', () => {
    const fixture = startBattle('m8-legacy-v6');
    const step = nextBattleStepV1(fixture.state.battle!);
    const legacyEvent: Extract<GameEvent, { type: 'battle-phase-advanced' }> = {
      id: 'm8-legacy-v6:0',
      commandId: 'm8-legacy-v6',
      type: 'battle-phase-advanced',
      ...step,
      sourceRefs: [CORE_BATTLE_ROUND_SOURCE, EVENT_COMPANION_FIVE_ROUNDS_SOURCE]
    };
    expect(() => reduceGameEvent(fixture.state, legacyEvent)).toThrow('mandatory objective-control checkpoint');
    const preM8State: GameState = {
      ...fixture.state,
      mission: { ...fixture.state.mission!, objectiveMarkers: [] }
    };
    const legacyState = reduceGameEvent(preM8State, legacyEvent);
    expect(legacyState.phase).toBe('movement');

    const m8Progressed = executeAccepted(preM8State, {
      id: 'm8-legacy-v6-current-stage', actorId: preM8State.battle!.activePlayerId!, type: 'resolve-command-stage'
    });
    expect(() => reduceGameEvent(m8Progressed.state, legacyEvent)).toThrow('bypasses an incomplete command phase');
  });

  it('uses V11 half-strength thresholds and resolves one sorted Battle-shock test per eligible unit', () => {
    const fixture = startBattle('m8-battle-shock');
    const units = activePlayerUnits(fixture.state);
    const weakened = units.find((unit) => unit.initialStrength > 1 && units.some((candidate) => candidate.id.localeCompare(unit.id) > 0))!;
    const recovering = units.find((unit) => unit.id.localeCompare(weakened.id) > 0)!;
    const weakenedModels = weakened.models.map((model, index) => index < Math.floor(weakened.initialStrength / 2)
      ? model
      : { ...model, active: false, wounds: 0 });
    const prepared: GameState = {
      ...fixture.state,
      units: { ...fixture.state.units, [weakened.id]: { ...weakened, models: weakenedModels } },
      battleResources: { ...fixture.state.battleResources!, battleShockedUnitIds: [recovering.id] }
    };
    expect(unitIsAtOrBelowHalfStrengthV1(prepared.units[weakened.id]!)).toBe(true);

    const start = executeAccepted(prepared, { id: 'm8-bs-start', actorId: prepared.battle!.activePlayerId!, type: 'resolve-command-stage' });
    const cp = executeAccepted(start.state, { id: 'm8-bs-cp', actorId: start.state.battle!.activePlayerId!, type: 'resolve-command-stage' });
    const queued = executeAccepted(cp.state, { id: 'm8-bs-queue', actorId: cp.state.battle!.activePlayerId!, type: 'resolve-command-stage' });
    const expectedOrder = [weakened.id, recovering.id];
    expect(queued.state.commandPhase).toMatchObject({ stage: 'battle-shock', pendingBattleShockUnitIds: expectedOrder });
    expect(queued.state.prng).toEqual(prepared.prng);

    const wrong = executeGameCommand(queued.state, {
      id: 'm8-bs-wrong-order', actorId: queued.state.units[expectedOrder[1]!]!.playerId,
      type: 'resolve-battle-shock-test', unitId: expectedOrder[1]!
    });
    expect(wrong).toMatchObject({ accepted: false, state: queued.state, rejection: { code: 'battle-shock-test-pending' } });
    expect(wrong.state.prng).toEqual(queued.state.prng);

    const first = executeAccepted(queued.state, {
      id: 'm8-bs-first', actorId: queued.state.units[expectedOrder[0]!]!.playerId,
      type: 'resolve-battle-shock-test', unitId: expectedOrder[0]!
    });
    const firstEvent = first.events[0] as Extract<GameEvent, { type: 'battle-shock-test-resolved' }>;
    expect(firstEvent.result).toMatchObject({ roll: [1, 3], total: 4, leadership: 6, passed: false, wasBattleShocked: false, atOrBelowHalfStrength: true });
    expect(first.state.prng.draws).toBe(queued.state.prng.draws + 2);

    const second = executeAccepted(first.state, {
      id: 'm8-bs-second', actorId: first.state.units[expectedOrder[1]!]!.playerId,
      type: 'resolve-battle-shock-test', unitId: expectedOrder[1]!
    });
    const secondEvent = second.events[0] as Extract<GameEvent, { type: 'battle-shock-test-resolved' }>;
    expect(secondEvent.result).toMatchObject({ roll: [1, 6], total: 7, leadership: 6, passed: true, wasBattleShocked: true, atOrBelowHalfStrength: false });
    expect(second.state.commandPhase).toMatchObject({ stage: 'abilities', pendingBattleShockUnitIds: [], testedBattleShockUnitIds: expectedOrder });
    expect(second.state.battleResources!.battleShockedUnitIds.includes(expectedOrder[0]!)).toBe(true);
    expect(second.state.battleResources!.battleShockedUnitIds.includes(expectedOrder[1]!)).toBe(false);

    const replayStart = { ...queued.state, eventLog: [] };
    expect(replayGameEvents(replayStart, [...first.events, ...second.events])).toEqual({
      ...second.state,
      eventLog: [...first.events, ...second.events]
    });

    const forged = structuredClone(firstEvent) as Extract<GameEvent, { type: 'battle-shock-test-resolved' }>;
    (forged.result as { total: number }).total = 12;
    expect(() => reduceGameEvent(replayStart, forged)).toThrow('forged dice or status');
  });

  it('uses Insane Bravery for 1 CP immediately before one queued test without drawing entropy', () => {
    const fixture = startBattle('m8-insane-bravery');
    const weakened = activePlayerUnits(fixture.state).find((unit) => unit.initialStrength > 1)!;
    const weakenedModels = weakened.models.map((model, index) => index < Math.floor(weakened.initialStrength / 2)
      ? model
      : { ...model, active: false, wounds: 0 });
    const prepared: GameState = {
      ...fixture.state,
      units: { ...fixture.state.units, [weakened.id]: { ...weakened, models: weakenedModels } }
    };
    const start = executeAccepted(prepared, { id: 'm8-ib-start', actorId: weakened.playerId, type: 'resolve-command-stage' });
    const cp = executeAccepted(start.state, { id: 'm8-ib-cp', actorId: weakened.playerId, type: 'resolve-command-stage' });
    const queued = executeAccepted(cp.state, { id: 'm8-ib-queue', actorId: weakened.playerId, type: 'resolve-command-stage' });
    expect(queued.state.commandPhase).toMatchObject({ stage: 'battle-shock', pendingBattleShockUnitIds: [weakened.id] });
    expect(queued.state.battleResources!.commandPointsByPlayerId[weakened.playerId]).toBe(1);

    const noPoints: GameState = {
      ...queued.state,
      battleResources: {
        ...queued.state.battleResources!,
        commandPointsByPlayerId: { ...queued.state.battleResources!.commandPointsByPlayerId, [weakened.playerId]: 0 }
      }
    };
    expect(executeGameCommand(noPoints, {
      id: 'm8-ib-no-points', actorId: weakened.playerId, type: 'use-insane-bravery', unitId: weakened.id
    })).toMatchObject({ accepted: false, state: noPoints, rejection: { code: 'insufficient-command-points' } });
    const shocked: GameState = {
      ...queued.state,
      battleResources: { ...queued.state.battleResources!, battleShockedUnitIds: [weakened.id] }
    };
    expect(executeGameCommand(shocked, {
      id: 'm8-ib-shocked', actorId: weakened.playerId, type: 'use-insane-bravery', unitId: weakened.id
    })).toMatchObject({ accepted: false, state: shocked, rejection: { code: 'battle-shocked-stratagem-target' } });

    const beforePrng = queued.state.prng;
    const used = executeAccepted(queued.state, {
      id: 'm8-ib-use', actorId: weakened.playerId, type: 'use-insane-bravery', unitId: weakened.id
    });
    const event = used.events[0] as Extract<GameEvent, { type: 'insane-bravery-used' }>;
    expect(event).toMatchObject({
      type: 'insane-bravery-used', targetUnitId: weakened.id, cost: 1,
      use: { eventId: 'm8-ib-use:0', stratagemId: 'insane-bravery', phase: 'command' },
      sourceRefs: [
        { reference: '15.01', page: 54 }, { reference: '15.04', page: 56 },
        { sourceId: 'warforge-universal-rules-updates-en-2026-07', reference: 'stratagem-updates' },
        { reference: '15.01' }, { reference: '15.01.01' }
      ]
    });
    expect(used.state.prng).toEqual(beforePrng);
    expect(used.state.commandPhase).toMatchObject({
      stage: 'abilities', pendingBattleShockUnitIds: [], testedBattleShockUnitIds: [weakened.id]
    });
    expect(used.state.battleResources).toMatchObject({
      commandPointsByPlayerId: { [weakened.playerId]: 0 },
      battleShockedUnitIds: [],
      stratagemUses: [{ eventId: event.id, stratagemId: 'insane-bravery', targetUnitId: weakened.id, cost: 1 }]
    });
    const replayStart = { ...queued.state, eventLog: [] };
    expect(replayGameEvents(replayStart, used.events)).toEqual({ ...used.state, eventLog: [...used.events] });

    const forged = structuredClone(event) as Extract<GameEvent, { type: 'insane-bravery-used' }>;
    (forged.use as { targetUnitId: string }).targetUnitId = 'forged-target';
    expect(() => reduceGameEvent(queued.state, forged)).toThrow('does not match its pending Battle-shock test');
  });

  it('evaluates single-model half strength by wounds', () => {
    const fixture = startBattle('m8-single-model-threshold');
    const single = activePlayerUnits(fixture.state).find((unit) => unit.initialStrength === 1)!;
    const withWounds = (wounds: number): UnitState => ({
      ...single,
      woundsPerModel: 4,
      models: [{ ...single.models[0]!, active: true, wounds }]
    });
    expect(unitIsAtOrBelowHalfStrengthV1(withWounds(3))).toBe(false);
    expect(unitIsAtOrBelowHalfStrengthV1(withWounds(2))).toBe(true);
    expect(unitIsAtOrBelowHalfStrengthV1(withWounds(1))).toBe(true);
  });

  it('forces an immediate Desperate Escape test and forbids good-order Fall Back while Battle-shocked', () => {
    const fixture = startBattle('m8-immediate-battle-shock');
    const command = resolveCompleteGameCommandPhaseForTests(fixture.state, 'm8-immediate-command');
    const movement = executeObjectiveAwareAdvanceBattlePhaseCommand(command.state, {
      id: 'm8-immediate-to-movement', actorId: command.state.battle!.activePlayerId!, type: 'advance-battle-phase'
    }, fixture.environment);
    if (!movement.accepted) throw new Error(movement.rejection.message);
    const unit = activePlayerUnits(movement.state)[0]!;
    const pending: GameState = {
      ...movement.state,
      unitTurnStatuses: {
        ...movement.state.unitTurnStatuses,
        [unit.id]: { ...movement.state.unitTurnStatuses[unit.id]!, battleShockTestRequired: true }
      }
    };
    const blocked = executeGameCommand(pending, {
      id: 'm8-immediate-blocked', actorId: pending.battle!.activePlayerId!, type: 'advance-battle-phase'
    });
    expect(blocked).toMatchObject({ accepted: false, state: pending, rejection: { code: 'battle-shock-test-pending' } });
    expect(blocked.state.prng).toEqual(pending.prng);

    const resolved = executeAccepted(pending, {
      id: 'm8-immediate-resolve', actorId: unit.playerId, type: 'resolve-battle-shock-test', unitId: unit.id
    });
    const event = resolved.events[0] as Extract<GameEvent, { type: 'battle-shock-test-resolved' }>;
    expect(event.result).toMatchObject({ reason: 'desperate-escape', roll: [1, 3], total: 4, passed: false });
    expect(resolved.state.unitTurnStatuses[unit.id]!.battleShockTestRequired).toBeUndefined();
    expect(resolved.state.battleResources!.battleShockedUnitIds).toContain(unit.id);

    const rejection = validateGameCommand(resolved.state, {
      id: 'm8-good-order-refused', actorId: unit.playerId, type: 'move-unit', unitId: unit.id,
      movementType: 'fall-back', fallBackMode: 'good-order',
      paths: unit.models.filter((model) => model.active).map((model) => ({ modelId: model.id, waypoints: [] }))
    });
    expect(rejection).toMatchObject({ code: 'good-order-forbidden-while-battle-shocked' });
  });

  it('validates, orders and expires pre-authorized persistent effects at exact phase boundaries', () => {
    const fixture = startBattle('m8-timed-effects');
    const unit = activePlayerUnits(fixture.state)[0]!;
    const effectZ = timedEffect('effect-z', unit.id, 'command');
    const effectA = timedEffect('effect-a', unit.id, 'command');
    const state: GameState = {
      ...fixture.state,
      battleResources: applyTimedEffectV1(applyTimedEffectV1(fixture.state.battleResources!, effectZ), effectA)
    };
    expect(state.battleResources!.timedEffects.map((effect) => effect.id)).toEqual(['effect-a', 'effect-z']);
    expect(dueTimedEffectIdsV1(state.battleResources!, {
      battleRound: 1, turnNumber: 1, phase: 'command', boundary: 'start'
    })).toEqual([]);

    const stages = resolveCompleteGameCommandPhaseForTests(state, 'm8-effect-command');
    const expirationEvent = stages.events.find(
      (event): event is Extract<GameEvent, { type: 'command-stage-resolved' }> => (
        event.type === 'command-stage-resolved' && event.expiredEffectIds.length > 0
      )
    );
    expect(expirationEvent).toMatchObject({ from: 'end', to: 'complete', expiredEffectIds: ['effect-a', 'effect-z'] });
    expect(stages.state.battleResources!.timedEffects).toEqual([]);
    const replayStart = { ...state, eventLog: [] };
    expect(replayGameEvents(replayStart, stages.events)).toEqual({ ...stages.state, eventLog: [...stages.events] });

    const movement = executeObjectiveAwareAdvanceBattlePhaseCommand(stages.state, {
      id: 'm8-effect-to-movement', actorId: stages.state.battle!.activePlayerId!, type: 'advance-battle-phase'
    }, fixture.environment);
    if (!movement.accepted) throw new Error(movement.rejection.message);
    const movementEffect = timedEffect('effect-movement', unit.id, 'movement');
    const movementWithEffect: GameState = {
      ...movement.state,
      battleResources: applyTimedEffectV1(movement.state.battleResources!, movementEffect)
    };
    const selectable: GameState = {
      ...movementWithEffect,
      unitTurnStatuses: Object.fromEntries(Object.entries(movementWithEffect.unitTurnStatuses).map(([unitId, status]) => [
        unitId, { ...status, selectedForMovement: true, movementType: 'remain-stationary' as const }
      ]))
    };
    const shooting = executeObjectiveAwareAdvanceBattlePhaseCommand(selectable, {
      id: 'm8-effect-to-shooting', actorId: selectable.battle!.activePlayerId!, type: 'advance-battle-phase'
    }, fixture.environment);
    if (!shooting.accepted) throw new Error(shooting.rejection.message);
    const phaseEvent = shooting.events.find((event): event is Extract<GameEvent, { type: 'battle-phase-advanced' }> => event.type === 'battle-phase-advanced')!;
    expect(phaseEvent.timedEffectExpirations).toEqual([{
      moment: { battleRound: 1, turnNumber: 1, phase: 'movement', boundary: 'end' },
      effectIds: ['effect-movement']
    }]);
    expect(shooting.state.battleResources!.timedEffects).toEqual([]);

    const transitionEvidence = timedEffectExpirationsForPhaseTransitionV1(
      applyTimedEffectV1(movement.state.battleResources!, movementEffect),
      { battleRound: 1, turnNumber: 1, phase: 'movement' },
      { battleRound: 1, turnNumber: 1, phase: 'shooting' }
    );
    expect(transitionEvidence).toEqual(phaseEvent.timedEffectExpirations);

    const malformed = { ...effectA, sourceRefs: [OFFICIAL_APP_PERSISTING_EFFECTS_SOURCE] };
    expect(() => applyTimedEffectV1(fixture.state.battleResources!, malformed)).toThrow('Timed effect is malformed');
    expect(OFFICIAL_APP_PERSISTING_EFFECTS_SOURCE).toMatchObject({
      dateBasis: 'retrieved', retrievedAt: '2026-08-28'
    });
    for (const [id, modifier] of [
      ['divide-by-zero', { ...effectA.modifier, operation: 'divide', value: 0 }],
      ['multiply-by-zero', { ...effectA.modifier, operation: 'multiply', value: 0 }],
      ['unknown-operation', { ...effectA.modifier, operation: 'power' }],
      ['unknown-characteristic', { ...effectA.modifier, characteristic: 'initiative' }]
    ] as const) {
      const invalidEffect = { ...effectA, id, modifier } as unknown as TimedEffectV1;
      expect(() => applyTimedEffectV1(fixture.state.battleResources!, invalidEffect)).toThrow('Timed effect is malformed');
    }
    expect(() => applyTimedEffectV1(
      applyTimedEffectV1(fixture.state.battleResources!, effectA), effectA
    )).toThrow('already exists');
  });

  it('rejects a forged command-stage consequence without consuming entropy', () => {
    const fixture = startBattle('m8-forged-command-stage');
    const resolved = executeAccepted(fixture.state, {
      id: 'm8-forged-command', actorId: fixture.state.battle!.activePlayerId!, type: 'resolve-command-stage'
    });
    const event = structuredClone(resolved.events[0]) as Extract<GameEvent, { type: 'command-stage-resolved' }>;
    (event as { to: string }).to = 'abilities';
    expect(() => reduceGameEvent(fixture.state, event)).toThrow('forged consequences');
    expect(fixture.state.prng).toEqual(resolved.state.prng);
  });
});
