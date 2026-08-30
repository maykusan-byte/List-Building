import { describe, expect, it } from 'vitest';
import { createPrngState, executeGameCommand, resolveDesperateEscapeRiskV1, sessionCompatibilityFingerprint, type FallBackModeV1, type GameEvent, type GameState, type UnitMovementTypeV1 } from '../domain';
import { exportSimulation, importSimulation } from '../persistence/autosave';
import {
  createCompleteGameDeploymentFixture,
  deployAllCompleteGameUnits,
  resolveCompleteGameCommandPhaseForTests
} from '../testing/complete-game-deployment-fixture';
import { executeCompleteGameMovementCommand } from './battle-movement';
import { executePassFightWindowCommand } from './battle-fight';
import { createSimulatorActor, dispatchGameCommand, getSimulatorGameState } from './machine';
import { executeObjectiveAwareAdvanceBattlePhaseCommand } from './objective-control';
import { replayGameEventsWithShootingEnvironment, type ShootingEnvironment } from './shooting';

function startBattle(gameId: string, seed = 0x57465247): {
  readonly initial: GameState;
  readonly state: GameState;
  readonly environment: ShootingEnvironment;
  readonly manifestFingerprint: string;
} {
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
  return {
    initial: fixture.initial,
    state: started.state,
    environment: fixture.environment,
    manifestFingerprint: sessionCompatibilityFingerprint(fixture.session)
  };
}

function advancePhase(state: GameState, environment: ShootingEnvironment, id: string): GameState {
  const ready = state.phase === 'command' ? resolveCompleteGameCommandPhaseForTests(state, `${id}-command`).state : state;
  const result = executeObjectiveAwareAdvanceBattlePhaseCommand(ready, {
    id,
    actorId: ready.battle!.activePlayerId!,
    type: 'advance-battle-phase'
  }, environment);
  if (!result.accepted) throw new Error(result.rejection.message);
  return result.state;
}

function movementPaths(state: GameState, unitId: string, dx = 0, dy = 0) {
  return state.units[unitId]!.models.filter((model) => model.active).map((member) => ({
    modelId: member.id,
    waypoints: dx === 0 && dy === 0 ? [] : [{
      x: state.models[member.id]!.position.x + dx,
      y: state.models[member.id]!.position.y + dy
    }]
  }));
}

function moveUnit(
  state: GameState,
  environment: ShootingEnvironment,
  unitId: string,
  movementType: UnitMovementTypeV1,
  id: string,
  dx = 0,
  dy = 0,
  fallBackMode?: FallBackModeV1
) {
  const desperateEscapeAllocationOrder = fallBackMode === 'desperate-escape'
    ? state.units[unitId]!.models.filter((model) => model.active).map((model) => model.id).reverse()
    : undefined;
  return executeCompleteGameMovementCommand(state, {
    id,
    actorId: state.battle!.activePlayerId!,
    type: 'move-unit',
    unitId,
    movementType,
    ...(fallBackMode === undefined ? {} : { fallBackMode }),
    ...(desperateEscapeAllocationOrder === undefined ? {} : { desperateEscapeAllocationOrder }),
    paths: movementPaths(state, unitId, dx, dy)
  }, environment);
}

function selectRemainingUnitsStationary(state: GameState, environment: ShootingEnvironment, prefix: string): GameState {
  let current = state;
  const activePlayerId = current.battle!.activePlayerId!;
  const unitIds = current.battle!.deployedUnitIds
    .filter((unitId) => current.units[unitId]!.playerId === activePlayerId && current.units[unitId]!.models.some((model) => model.active))
    .sort();
  for (const unitId of unitIds) {
    if (current.unitTurnStatuses[unitId]?.selectedForMovement) continue;
    const result = moveUnit(current, environment, unitId, 'remain-stationary', `${prefix}-${unitId}`);
    if (!result.accepted) throw new Error(result.rejection.message);
    current = result.state;
  }
  return current;
}

function passEmptyFightWindows(state: GameState, environment: ShootingEnvironment, prefix: string): GameState {
  let current = state;
  let index = 0;
  while (current.fightPhase !== null && current.fightPhase.stage !== 'complete') {
    const passed = executePassFightWindowCommand(current, {
      id: `${prefix}-${index++}`,
      actorId: current.fightPhase.currentPlayerId!,
      type: 'pass-fight-window'
    }, environment);
    if (!passed.accepted) throw new Error(passed.rejection.message);
    current = passed.state;
  }
  return current;
}

describe('M7 battle rounds, turns and complete movement choices', () => {
  it('plays, saves, resumes and replays all five phases of ten player turns', () => {
    const fixture = startBattle('five-round-loop');
    let state = fixture.state;
    const firstPlayerId = state.battle!.firstPlayerId!;
    const battleStart = state.eventLog.find((event): event is Extract<GameEvent, { type: 'battle-started' }> => event.type === 'battle-started')!;
    expect(battleStart.sourceRefs[0]).toMatchObject({ reference: '07', page: 28 });
    const turnStarts: { round: number; turn: number; playerId: string }[] = [{ round: 1, turn: 1, playerId: firstPlayerId }];
    const visitedPhases: string[] = [];
    let commandIndex = 0;
    let resumed = false;

    while (state.phase !== 'completed') {
      visitedPhases.push(`${state.battle!.battleRound}.${state.battle!.turnNumber}.${state.phase}`);
      if (state.phase === 'movement') {
        state = selectRemainingUnitsStationary(state, fixture.environment, `loop-${commandIndex++}`);
      }
      if (state.phase === 'fight') {
        state = passEmptyFightWindows(state, fixture.environment, `loop-fight-${commandIndex++}`);
      }
      const before = state.battle!;
      state = advancePhase(state, fixture.environment, `advance-${commandIndex++}`);
      if (state.phase === 'command' && (state.battle!.turnNumber !== before.turnNumber || state.battle!.battleRound !== before.battleRound)) {
        turnStarts.push({ round: state.battle!.battleRound, turn: state.battle!.turnNumber, playerId: state.battle!.activePlayerId! });
        if (!resumed) {
          const exported = exportSimulation(fixture.initial, state, '2026-08-29T00:00:00.000Z', fixture.environment);
          const imported = importSimulation(exported, fixture.environment, fixture.manifestFingerprint);
          expect(imported).toMatchObject({ ok: true, state });
          if (!imported.ok) throw new Error(imported.errors.join('\n'));
          state = imported.state;
          resumed = true;
        }
      }
    }

    expect(state.battle).toMatchObject({ lifecycle: 'completed', battleRound: 5, turnNumber: 2, activePlayerId: null, phase: 'completed' });
    expect(state.mission?.lifecycle).toBe('completed');
    expect(state.battleResources?.commandPointsByPlayerId).toEqual(Object.fromEntries(
      state.battle!.playerIds.map((playerId) => [playerId, 10])
    ));
    expect(state.eventLog.filter((event) => event.type === 'command-stage-resolved' && event.from === 'gain-base-cp')).toHaveLength(10);
    expect(turnStarts).toHaveLength(10);
    expect(turnStarts.filter((turn) => turn.turn === 1).every((turn) => turn.playerId === firstPlayerId)).toBe(true);
    expect(turnStarts.map((turn) => `${turn.round}.${turn.turn}`)).toEqual([
      '1.1', '1.2', '2.1', '2.2', '3.1', '3.2', '4.1', '4.2', '5.1', '5.2'
    ]);
    expect(resumed).toBe(true);
    expect(visitedPhases).toEqual(turnStarts.flatMap((turn) => [
      `${turn.round}.${turn.turn}.command`,
      `${turn.round}.${turn.turn}.movement`,
      `${turn.round}.${turn.turn}.shooting`,
      `${turn.round}.${turn.turn}.charge`,
      `${turn.round}.${turn.turn}.fight`
    ]));
    expect(replayGameEventsWithShootingEnvironment(fixture.initial, state.eventLog, fixture.environment)).toEqual(state);
  });

  it('requires every active unit to be selected and records Remain Stationary without moving or rolling', () => {
    const fixture = startBattle('stationary-selection');
    const movement = advancePhase(fixture.state, fixture.environment, 'to-movement');
    const rejected = executeGameCommand(movement, {
      id: 'skip-movement', actorId: movement.battle!.activePlayerId!, type: 'advance-battle-phase'
    });
    expect(rejected).toMatchObject({ accepted: false, state: movement, rejection: { code: 'movement-selection-incomplete' } });
    expect(rejected.state.prng).toEqual(movement.prng);

    const unitId = Object.keys(movement.unitTurnStatuses).sort()[0]!;
    const positions = movement.units[unitId]!.models.map((model) => movement.models[model.id]!.position);
    const result = moveUnit(movement, fixture.environment, unitId, 'remain-stationary', 'remain');
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.state.prng).toEqual(movement.prng);
    expect(result.state.units[unitId]!.models.map((model) => result.state.models[model.id]!.position)).toEqual(positions);
    expect(result.state.unitTurnStatuses[unitId]).toEqual({ selectedForMovement: true, movementType: 'remain-stationary', advanced: false, fellBack: false });
    expect((result.events[0] as Extract<GameEvent, { type: 'unit-movement-resolved' }>).sourceRefs.map((source) => source.reference)).toEqual(['09.02', '09.04', '03.03']);
  });

  it('validates Normal Move geometry and rejects excessive distance without changing state', () => {
    const fixture = startBattle('normal-move');
    const movement = advancePhase(fixture.state, fixture.environment, 'normal-to-movement');
    const unitId = Object.keys(movement.unitTurnStatuses).sort()[0]!;
    const accepted = moveUnit(movement, fixture.environment, unitId, 'normal', 'normal-accepted', 254, 0);
    expect(accepted.accepted).toBe(true);
    if (!accepted.accepted) return;
    const event = accepted.events[0] as Extract<GameEvent, { type: 'unit-movement-resolved' }>;
    expect(event.maximumDistance).toBe(1_524);
    expect(event.evidence.paths.every((path) => path.pathLength === 254)).toBe(true);
    expect(accepted.state.unitTurnStatuses[unitId]).toEqual({ selectedForMovement: true, movementType: 'normal', advanced: false, fellBack: false });

    const tooFarFixture = startBattle('normal-too-far');
    const fresh = advancePhase(tooFarFixture.state, tooFarFixture.environment, 'normal-far-to-movement');
    const freshUnitId = Object.keys(fresh.unitTurnStatuses).sort()[0]!;
    const rejected = moveUnit(fresh, fixture.environment, freshUnitId, 'normal', 'normal-rejected', 4_000, 0);
    expect(rejected).toMatchObject({ accepted: false, state: fresh, rejection: { code: 'movement-too-far' } });
    expect(rejected.state.prng).toEqual(fresh.prng);
  });

  it('rolls Advance only for an accepted command and persists the movement consequence', () => {
    const fixture = startBattle('advance-move');
    const movement = advancePhase(fixture.state, fixture.environment, 'advance-to-movement');
    const unitId = Object.keys(movement.unitTurnStatuses).sort()[0]!;
    const accepted = moveUnit(movement, fixture.environment, unitId, 'advance', 'advance-accepted', 254, 0);
    expect(accepted.accepted).toBe(true);
    if (!accepted.accepted) return;
    const event = accepted.events[0] as Extract<GameEvent, { type: 'unit-movement-resolved' }>;
    expect(event.advanceRoll).toBeGreaterThanOrEqual(1);
    expect(event.advanceRoll).toBeLessThanOrEqual(6);
    expect(event.maximumDistance).toBe(1_524 + event.advanceRoll! * 254);
    expect(accepted.state.prng.draws).toBe(movement.prng.draws + 1);
    expect(accepted.state.unitTurnStatuses[unitId]).toEqual({ selectedForMovement: true, movementType: 'advance', advanced: true, fellBack: false });

    const other = startBattle('advance-refusal');
    const otherMovement = advancePhase(other.state, other.environment, 'advance-refusal-to-movement');
    const otherUnitId = Object.keys(otherMovement.unitTurnStatuses).sort()[0]!;
    const rejected = moveUnit(otherMovement, other.environment, otherUnitId, 'advance', 'advance-rejected', 4_000, 0);
    expect(rejected).toMatchObject({ accepted: false, state: otherMovement, rejection: { code: 'movement-too-far' } });
    expect(rejected.state.prng).toEqual(otherMovement.prng);
  });

  it('allows only an engaged unit to Fall Back and keeps that status until its next turn', () => {
    const fixture = startBattle('fall-back');
    const movement = advancePhase(fixture.state, fixture.environment, 'fall-back-to-movement');
    const activeUnitId = Object.keys(movement.unitTurnStatuses).sort()[0]!;
    const activeUnit = movement.units[activeUnitId]!;
    const activeModel = movement.models[activeUnit.models[0]!.id]!;
    const enemyUnit = Object.values(movement.units).find((unit) => unit.playerId !== activeUnit.playerId)!;
    const enemyModelId = enemyUnit.models[0]!.id;
    const engaged: GameState = {
      ...movement,
      models: {
        ...movement.models,
        [enemyModelId]: { ...movement.models[enemyModelId]!, position: { x: activeModel.position.x, y: activeModel.position.y + 700 } }
      }
    };

    const normal = moveUnit(engaged, fixture.environment, activeUnitId, 'normal', 'engaged-normal', 1_000, 0);
    expect(normal).toMatchObject({ accepted: false, state: engaged, rejection: { code: 'movement-type-ineligible' } });
    const missingMode = moveUnit(engaged, fixture.environment, activeUnitId, 'fall-back', 'fall-back-missing-mode', 1_000, 0);
    expect(missingMode).toMatchObject({ accepted: false, state: engaged, rejection: { code: 'fall-back-mode-required' } });
    const fallenBack = moveUnit(engaged, fixture.environment, activeUnitId, 'fall-back', 'fall-back-accepted', 1_000, 0, 'good-order');
    expect(fallenBack.accepted).toBe(true);
    if (!fallenBack.accepted) return;
    expect(fallenBack.state.unitTurnStatuses[activeUnitId]).toEqual({ selectedForMovement: true, movementType: 'fall-back', advanced: false, fellBack: true, fallBackMode: 'good-order' });
    expect((fallenBack.events[0] as Extract<GameEvent, { type: 'unit-movement-resolved' }>).evidence).toMatchObject({ startedEngaged: true, endedEngaged: false });

    const unengaged = startBattle('fall-back-refusal');
    const unengagedMovement = advancePhase(unengaged.state, unengaged.environment, 'fall-back-refusal-to-movement');
    const unengagedUnitId = Object.keys(unengagedMovement.unitTurnStatuses).sort()[0]!;
    const rejected = moveUnit(unengagedMovement, unengaged.environment, unengagedUnitId, 'fall-back', 'fall-back-rejected', 254, 0, 'good-order');
    expect(rejected).toMatchObject({ accepted: false, state: unengagedMovement, rejection: { code: 'movement-type-ineligible' } });
    expect(rejected.state.prng).toEqual(unengagedMovement.prng);
  });

  it('persists voluntary Desperate Escape risk rolls, casualties and enemy traversal', () => {
    const fixture = startBattle('desperate-escape');
    const movement = advancePhase(fixture.state, fixture.environment, 'desperate-to-movement');
    const activeUnitId = Object.keys(movement.unitTurnStatuses).sort()[0]!;
    const activeUnit = movement.units[activeUnitId]!;
    const allocationOrder = activeUnit.models.filter((model) => model.active).map((model) => model.id).reverse();
    const risk = resolveDesperateEscapeRiskV1(movement.prng, activeUnit, allocationOrder);
    expect(risk.mortalWounds).toBeGreaterThan(0);
    expect(risk.mortalWoundAllocations[0]).toBe(allocationOrder[0]);
    const traversingModel = risk.unitModelsAfter.find((model) => model.active)!;
    const traversingPose = movement.models[traversingModel.id]!;
    const enemyUnit = Object.values(movement.units).find((unit) => unit.playerId !== activeUnit.playerId)!;
    const enemyModelId = enemyUnit.models[0]!.id;
    const enemyPose = movement.models[enemyModelId]!;
    const escapeDirection = traversingPose.position.y < enemyPose.position.y ? -1 : 1;
    const escapeDy = 1_524 * escapeDirection;
    const engaged: GameState = {
      ...movement,
      models: {
        ...movement.models,
        [enemyModelId]: {
          ...movement.models[enemyModelId]!,
          position: { x: traversingPose.position.x, y: traversingPose.position.y + 500 * escapeDirection }
        }
      }
    };

    const goodOrder = moveUnit(engaged, fixture.environment, activeUnitId, 'fall-back', 'blocked-good-order', 0, escapeDy, 'good-order');
    expect(goodOrder).toMatchObject({ accepted: false, state: engaged, rejection: { code: 'movement-collision' } });
    const missingAllocation = executeCompleteGameMovementCommand(engaged, {
      id: 'desperate-no-allocation', actorId: engaged.battle!.activePlayerId!, type: 'move-unit', unitId: activeUnitId,
      movementType: 'fall-back', fallBackMode: 'desperate-escape', paths: movementPaths(engaged, activeUnitId, 0, escapeDy)
    }, fixture.environment);
    expect(missingAllocation).toMatchObject({ accepted: false, state: engaged, rejection: { code: 'desperate-escape-allocation-required' } });
    const rejectedDesperate = moveUnit(engaged, fixture.environment, activeUnitId, 'fall-back', 'desperate-too-far', 0, 4_000, 'desperate-escape');
    expect(rejectedDesperate).toMatchObject({ accepted: false, state: engaged, rejection: { code: 'movement-too-far' } });
    expect(rejectedDesperate.state.prng).toEqual(engaged.prng);
    const escaped = moveUnit(engaged, fixture.environment, activeUnitId, 'fall-back', 'desperate-accepted', 0, escapeDy, 'desperate-escape');
    expect(escaped.accepted).toBe(true);
    if (!escaped.accepted) return;
    const event = escaped.events[0] as Extract<GameEvent, { type: 'unit-movement-resolved' }>;
    expect(event.fallBackMode).toBe('desperate-escape');
    expect(event.desperateEscape).toMatchObject({
      riskRolls: risk.riskRolls,
      mortalWounds: risk.mortalWounds,
      unitModelsAfter: risk.unitModelsAfter,
      playerAllocationOrder: allocationOrder,
      mortalWoundAllocations: risk.mortalWoundAllocations,
      allocationPolicy: 'mandatory-wounded-then-player-order',
      battleShockTestRequired: true
    });
    expect(event.sourceRefs.map((source) => source.reference)).toEqual(['09.02', '09.07', '03.03', '06.03', '06.02']);
    expect(escaped.state.prng).toEqual(risk.prngAfter);
    expect(escaped.state.units[activeUnitId]!.models).toEqual(risk.unitModelsAfter);
    expect(escaped.state.unitTurnStatuses[activeUnitId]).toEqual({
      selectedForMovement: true,
      movementType: 'fall-back',
      advanced: false,
      fellBack: true,
      fallBackMode: 'desperate-escape',
      battleShockTestRequired: true
    });
    const replayStart = { ...engaged, eventLog: [] };
    expect(replayGameEventsWithShootingEnvironment(replayStart, escaped.events, fixture.environment)).toEqual({
      ...escaped.state,
      eventLog: escaped.events
    });

    const monsterState: GameState = {
      ...engaged,
      units: { ...engaged.units, [activeUnitId]: { ...activeUnit, keywords: [...activeUnit.keywords, 'MONSTER'] } }
    };
    const monster = moveUnit(monsterState, fixture.environment, activeUnitId, 'fall-back', 'desperate-monster', 0, 1_524, 'desperate-escape');
    expect(monster).toMatchObject({ accepted: false, state: monsterState, rejection: { code: 'desperate-escape-monster-vehicle-not-covered' } });
    expect(monster.state.prng).toEqual(monsterState.prng);
  });

  it('does not create an impossible Battle-shock continuation when Desperate Escape destroys the unit', () => {
    const fixture = startBattle('desperate-escape-destroyed');
    const movement = advancePhase(fixture.state, fixture.environment, 'desperate-destroyed-to-movement');
    const activeUnitId = Object.keys(movement.unitTurnStatuses).sort()[0]!;
    const activeUnit = movement.units[activeUnitId]!;
    const lastModel = activeUnit.models[0]!;
    const oneWoundUnit = {
      ...activeUnit,
      models: activeUnit.models.map((model) => model.id === lastModel.id
        ? { ...model, active: true, wounds: 1 }
        : { ...model, active: false, wounds: 0 })
    };
    const lastPose = movement.models[lastModel.id]!;
    const enemyUnit = Object.values(movement.units).find((unit) => unit.playerId !== activeUnit.playerId)!;
    const enemyModelId = enemyUnit.models.find((model) => model.active)!.id;
    const escapeDirection = lastPose.position.y < movement.models[enemyModelId]!.position.y ? -1 : 1;
    const prepared: GameState = {
      ...movement,
      prng: createPrngState(264),
      units: { ...movement.units, [activeUnitId]: oneWoundUnit },
      models: {
        ...movement.models,
        [enemyModelId]: {
          ...movement.models[enemyModelId]!,
          position: { x: lastPose.position.x, y: lastPose.position.y + 500 * escapeDirection }
        }
      }
    };
    const risk = resolveDesperateEscapeRiskV1(prepared.prng, oneWoundUnit, [lastModel.id]);
    expect(risk.riskRolls).toEqual([{ modelId: lastModel.id, result: 1 }]);
    expect(risk.unitModelsAfter.some((model) => model.active)).toBe(false);

    const escaped = moveUnit(
      prepared,
      fixture.environment,
      activeUnitId,
      'fall-back',
      'desperate-destroyed-resolved',
      0,
      1_524 * escapeDirection,
      'desperate-escape'
    );
    expect(escaped.accepted).toBe(true);
    if (!escaped.accepted) return;
    const event = escaped.events[0] as Extract<GameEvent, { type: 'unit-movement-resolved' }>;
    expect(event.desperateEscape?.battleShockTestRequired).toBeUndefined();
    expect(escaped.state.unitTurnStatuses[activeUnitId]?.battleShockTestRequired).toBeUndefined();

    const ready: GameState = {
      ...escaped.state,
      unitTurnStatuses: Object.fromEntries(Object.entries(escaped.state.unitTurnStatuses).map(([unitId, status]) => [
        unitId,
        unitId === activeUnitId ? status : { ...status, selectedForMovement: true, movementType: 'remain-stationary' as const }
      ]))
    };
    const advanced = executeObjectiveAwareAdvanceBattlePhaseCommand(ready, {
      id: 'desperate-destroyed-advance', actorId: ready.battle!.activePlayerId!, type: 'advance-battle-phase'
    }, fixture.environment);
    expect(advanced.accepted).toBe(true);
  });

  it('rejects a forged movement proof during trusted replay', () => {
    const fixture = startBattle('movement-replay');
    const movement = advancePhase(fixture.state, fixture.environment, 'replay-to-movement');
    const unitId = Object.keys(movement.unitTurnStatuses).sort()[0]!;
    const moved = moveUnit(movement, fixture.environment, unitId, 'normal', 'replay-normal', 254, 0);
    expect(moved.accepted).toBe(true);
    if (!moved.accepted) return;
    const forged = structuredClone(moved.state.eventLog) as GameEvent[];
    const event = forged.find((candidate): candidate is Extract<GameEvent, { type: 'unit-movement-resolved' }> => candidate.type === 'unit-movement-resolved')!;
    (event.evidence.paths as { modelId: string; pathLength: number }[])[0]!.pathLength += 1;
    expect(() => replayGameEventsWithShootingEnvironment(fixture.initial, forged, fixture.environment)).toThrow('trusted geometry verification');
  });

  it('routes complete-game movement through the statechart trusted environment', () => {
    const fixture = startBattle('movement-machine');
    const movement = advancePhase(fixture.state, fixture.environment, 'machine-to-movement');
    const unitId = Object.keys(movement.unitTurnStatuses).sort()[0]!;
    const actor = createSimulatorActor({
      initialState: fixture.initial,
      gameState: movement,
      shootingEnvironment: fixture.environment
    });
    actor.start();
    dispatchGameCommand(actor, {
      id: 'machine-normal',
      actorId: movement.battle!.activePlayerId!,
      type: 'move-unit',
      unitId,
      movementType: 'normal',
      paths: movementPaths(movement, unitId, 254, 0)
    });
    expect(actor.getSnapshot().value).toEqual({ active: 'movement' });
    expect(getSimulatorGameState(actor).unitTurnStatuses[unitId]?.movementType).toBe('normal');
    expect(actor.getSnapshot().context.lastRejection).toBeNull();
    actor.stop();
  });
});
