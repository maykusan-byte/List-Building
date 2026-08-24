import { describe, expect, it } from 'vitest';
import {
  createInitialGameState,
  createPrngState,
  createSimulationSave,
  deserializeSimulationSave,
  executeGameCommand,
  nextUint32,
  replayGameEvents,
  rollDice,
  serializeSimulationSave,
  type GameCommand,
  type SessionSetup
} from './index';

function setupSession(): SessionSetup {
  return {
    manifest: {
      schemaVersion: 'warforge-simulator/v1',
      simulatorVersion: '0.1.0',
      catalogFingerprint: 'catalog-a',
      rulePackIds: ['core'],
      rulePackFingerprint: 'rules-a',
      scenarioId: 'test-scenario',
      scenarioFingerprint: 'scenario-a',
      coverageVersion: 'coverage-a'
    },
    players: [
      { id: 'p1', displayName: 'Player one', rosterId: 'roster-a' },
      { id: 'p2', displayName: 'Player two', rosterId: 'roster-b' }
    ],
    models: [
      { id: 'model-a', playerId: 'p1', profileId: 'profile-a', position: { x: 0, y: 0 }, orientationDegrees: 0 },
      { id: 'model-b', playerId: 'p2', profileId: 'profile-b', position: { x: 254, y: 0 }, orientationDegrees: 180 }
    ]
  };
}

function accept(state: ReturnType<typeof createInitialGameState>, command: GameCommand) {
  const result = executeGameCommand(state, command);
  expect(result.accepted).toBe(true);
  if (!result.accepted) throw new Error(result.rejection.message);
  return result.state;
}

describe('simulator domain foundations', () => {
  it('uses a versioned deterministic PRNG and records rejected sampling draws', () => {
    const seed = createPrngState(123456);
    const first = nextUint32(seed);
    const second = nextUint32(createPrngState(123456));
    expect(first).toEqual(second);
    expect(rollDice(seed, 6, 4)).toEqual(rollDice(createPrngState(123456), 6, 4));
    expect(() => createPrngState(-1)).toThrow(RangeError);
  });

  it('replays accepted commands into the exact deterministic state', () => {
    const initial = createInitialGameState('game-1', 7);
    let state = accept(initial, { id: 'setup', actorId: 'p1', type: 'setup-session', session: setupSession() });
    state = accept(state, { id: 'deploy-end', actorId: 'p1', type: 'transition-phase', nextPhase: 'command' });
    state = accept(state, { id: 'command-end', actorId: 'p1', type: 'transition-phase', nextPhase: 'movement' });
    state = accept(state, { id: 'move-a', actorId: 'p1', type: 'move-model', modelId: 'model-a', to: { x: 254, y: 508 }, orientationDegrees: 90 });
    state = accept(state, { id: 'dice-a', actorId: 'p1', type: 'roll-dice', rollId: 'advance-a', sides: 6, count: 2, reason: 'Advance roll' });

    expect(replayGameEvents(initial, state.eventLog)).toEqual(state);
    expect(state.models['model-a'].position).toEqual({ x: 254, y: 508 });
    expect(state.diceResults['advance-a']).toHaveLength(2);
  });

  it('rejects commands that are illegal for the current phase or actor without changing state', () => {
    const initial = createInitialGameState('game-2', 8);
    const earlyMove = executeGameCommand(initial, { id: 'early-move', actorId: 'p1', type: 'move-model', modelId: 'model-a', to: { x: 1, y: 1 } });
    expect(earlyMove).toMatchObject({ accepted: false, rejection: { code: 'wrong-phase' } });
    expect(earlyMove.state).toBe(initial);

    let state = accept(initial, { id: 'setup', actorId: 'p1', type: 'setup-session', session: setupSession() });
    state = accept(state, { id: 'deploy-end', actorId: 'p1', type: 'transition-phase', nextPhase: 'command' });
    state = accept(state, { id: 'command-end', actorId: 'p1', type: 'transition-phase', nextPhase: 'movement' });
    const stolenMove = executeGameCommand(state, { id: 'stolen-move', actorId: 'p2', type: 'move-model', modelId: 'model-a', to: { x: 2, y: 2 } });
    expect(stolenMove).toMatchObject({ accepted: false, rejection: { code: 'not-model-owner' } });
    expect(stolenMove.state).toBe(state);
  });

  it('allows each model one normal move per movement phase and replays the usage exactly', () => {
    const initial = createInitialGameState('game-movement-usage', 18);
    let state = accept(initial, { id: 'setup', actorId: 'p1', type: 'setup-session', session: setupSession() });
    state = accept(state, { id: 'command', actorId: 'p1', type: 'transition-phase', nextPhase: 'command' });
    state = accept(state, { id: 'movement', actorId: 'p1', type: 'transition-phase', nextPhase: 'movement' });
    state = accept(state, { id: 'move-once', actorId: 'p1', type: 'move-model', modelId: 'model-a', to: { x: 10, y: 0 } });
    expect(state.movedModelIds).toEqual(['model-a']);
    const repeated = executeGameCommand(state, { id: 'move-twice', actorId: 'p1', type: 'move-model', modelId: 'model-a', to: { x: 20, y: 0 } });
    expect(repeated).toMatchObject({ accepted: false, rejection: { code: 'movement-already-used' }, state });
    expect(replayGameEvents(initial, state.eventLog)).toEqual(state);

    for (const [id, nextPhase] of [['shooting', 'shooting'], ['charge', 'charge'], ['fight', 'fight'], ['next-command', 'command'], ['next-movement', 'movement']] as const) {
      state = accept(state, { id, actorId: 'p1', type: 'transition-phase', nextPhase });
    }
    expect(state.movedModelIds).toEqual([]);
    state = accept(state, { id: 'move-next-round', actorId: 'p1', type: 'move-model', modelId: 'model-a', to: { x: 20, y: 0 } });
    expect(state.movedModelIds).toEqual(['model-a']);
  });

  it('resets authoritative weapon usage for each shooting phase', () => {
    const initial = createInitialGameState('game-weapon-usage', 19);
    let state = accept(initial, { id: 'setup', actorId: 'p1', type: 'setup-session', session: setupSession() });
    state = accept(state, { id: 'command', actorId: 'p1', type: 'transition-phase', nextPhase: 'command' });
    state = accept(state, { id: 'movement', actorId: 'p1', type: 'transition-phase', nextPhase: 'movement' });
    state = accept(state, { id: 'shooting', actorId: 'p1', type: 'transition-phase', nextPhase: 'shooting' });
    expect(state.firedWeaponKeys).toEqual([]);
    state = accept(state, { id: 'charge', actorId: 'p1', type: 'transition-phase', nextPhase: 'charge' });
    state = accept(state, { id: 'fight', actorId: 'p1', type: 'transition-phase', nextPhase: 'fight' });
    state = accept(state, { id: 'next-command', actorId: 'p1', type: 'transition-phase', nextPhase: 'command' });
    state = accept(state, { id: 'next-movement', actorId: 'p1', type: 'transition-phase', nextPhase: 'movement' });
    state = accept(state, { id: 'next-shooting', actorId: 'p1', type: 'transition-phase', nextPhase: 'shooting' });
    expect(state.firedWeaponKeys).toEqual([]);
  });

  it('guards saved games by schema, major simulator version and replay validity', () => {
    const initial = createInitialGameState('game-3', 9);
    const setup = executeGameCommand(initial, { id: 'setup', actorId: 'p1', type: 'setup-session', session: setupSession() });
    if (!setup.accepted) throw new Error(setup.rejection.message);
    const rolled = executeGameCommand(setup.state, { id: 'roll', actorId: 'p1', type: 'roll-dice', rollId: 'save-roll', sides: 6, count: 1, reason: 'Save guard fixture' });
    if (!rolled.accepted) throw new Error(rolled.rejection.message);
    const save = createSimulationSave(initial, rolled.state.eventLog, '2026-08-13T12:00:00.000Z');
    const serialized = serializeSimulationSave(save);
    expect(deserializeSimulationSave(serialized)).toEqual({ ok: true, save });
    const legacySnapshot = JSON.parse(serialized) as { initialState: { oathOfMomentSelections?: unknown } };
    delete legacySnapshot.initialState.oathOfMomentSelections;
    expect(deserializeSimulationSave(JSON.stringify(legacySnapshot))).toMatchObject({ ok: true, save: { schemaVersion: 'warforge-simulation-save/v1' } });
    expect(deserializeSimulationSave(serialized.replace('warforge-simulation-save/v1', 'warforge-simulation-save/v99')).ok).toBe(false);
    expect(deserializeSimulationSave(serialized.replace('"0.1.0"', '"1.0.0"')).ok).toBe(false);
    expect(deserializeSimulationSave(serialized.replace('"results":[', '"results":[99,')).ok).toBe(false);
    expect(deserializeSimulationSave('{not-json}')).toMatchObject({ ok: false });
    const malformedInitial = {
      ...initial,
      phase: 'completed',
      round: -5,
      pendingDecisions: [{ nonsense: true }]
    };
    expect(() => createSimulationSave(malformedInitial as unknown as typeof initial, [], '2026-08-13T12:00:00.000Z')).toThrow('compatible event-free initial state');
    expect(() => createSimulationSave({ ...initial, prng: { ...initial.prng, value: 123, draws: 99 } }, [], '2026-08-13T12:00:00.000Z')).toThrow('compatible event-free initial state');
  });

  it('opens an exclusive decision window and records its deterministic resolution', () => {
    const initial = createInitialGameState('game-decision', 10);
    let state = accept(initial, { id: 'setup', actorId: 'p1', type: 'setup-session', session: setupSession() });
    state = accept(state, {
      id: 'choose', actorId: 'system', type: 'request-decision', decision: {
        id: 'decision-1', kind: 'test-choice', playerId: 'p1', prompt: 'Choose.',
        options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }], sourceRuleIds: ['test-rule']
      }
    });
    expect(state.pendingDecisions).toHaveLength(1);
    expect(executeGameCommand(state, { id: 'blocked-phase', actorId: 'p1', type: 'transition-phase', nextPhase: 'command' })).toMatchObject({ accepted: false, rejection: { code: 'decision-pending' } });
    expect(executeGameCommand(state, { id: 'wrong-player', actorId: 'p2', type: 'resolve-decision', decisionId: 'decision-1', optionId: 'yes' })).toMatchObject({ accepted: false, rejection: { code: 'not-decision-owner' } });
    state = accept(state, { id: 'resolve', actorId: 'p1', type: 'resolve-decision', decisionId: 'decision-1', optionId: 'yes' });
    expect(state.pendingDecisions).toEqual([]);
    expect(replayGameEvents(initial, state.eventLog)).toEqual(state);
  });

  it('rejects forged replay events that bypass a decision or occur after completion', () => {
    const initial = createInitialGameState('game-replay-guards', 11);
    let state = accept(initial, { id: 'setup', actorId: 'p1', type: 'setup-session', session: setupSession() });
    state = accept(state, {
      id: 'choose', actorId: 'system', type: 'request-decision', decision: {
        id: 'decision-1', kind: 'test-choice', playerId: 'p1', prompt: 'Choose.', options: [{ id: 'yes', label: 'Yes' }], sourceRuleIds: ['test-rule']
      }
    });
    expect(() => replayGameEvents(initial, [...state.eventLog, { id: 'forged-phase', commandId: 'forged', type: 'phase-transitioned', from: 'deployment', to: 'command' }])).toThrow('pending decision');

    let completed = accept(createInitialGameState('game-completed-guards', 12), { id: 'setup-complete', actorId: 'p1', type: 'setup-session', session: setupSession() });
    for (const [id, nextPhase] of [['command', 'command'], ['movement', 'movement'], ['shooting', 'shooting'], ['charge', 'charge'], ['fight', 'fight'], ['completed', 'completed']] as const) {
      completed = accept(completed, { id: `complete-${id}`, actorId: 'p1', type: 'transition-phase', nextPhase });
    }
    expect(executeGameCommand(completed, { id: 'late-roll', actorId: 'p1', type: 'roll-dice', rollId: 'late', sides: 6, count: 1, reason: 'Too late' })).toMatchObject({ accepted: false, rejection: { code: 'game-completed' } });
    expect(() => replayGameEvents(createInitialGameState('game-completed-guards', 12), [...completed.eventLog, {
      id: 'late-decision', commandId: 'late', type: 'decision-requested', decision: { id: 'late', kind: 'test', playerId: 'p1', prompt: 'Late.', options: [{ id: 'yes', label: 'Yes' }], sourceRuleIds: ['test'] }
    }])).toThrow('after game completion');
  });

  it('rejects a second event produced from the same command ID during replay', () => {
    const initial = createInitialGameState('duplicate-command-event', 13);
    const setup = executeGameCommand(initial, { id: 'setup-once', actorId: 'p1', type: 'setup-session', session: setupSession() });
    if (!setup.accepted) throw new Error(setup.rejection.message);
    expect(() => replayGameEvents(initial, [...setup.events, {
      id: 'forged-second-event',
      commandId: 'setup-once',
      type: 'phase-transitioned',
      from: 'deployment',
      to: 'command'
    }])).toThrow('already produced an event');
  });
});
