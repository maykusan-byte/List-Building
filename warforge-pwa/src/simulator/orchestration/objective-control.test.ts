import { describe, expect, it } from 'vitest';
import {
  executeGameCommand,
  reduceGameEvent,
  sessionCompatibilityFingerprint,
  type GameEvent,
  type GameState,
  type ObjectiveMarkerV1,
  type PhysicalModelProfileV1
} from '../domain';
import { FIGHT_PHASE_V1_SCHEMA_VERSION } from '../domain/types';
import { exportSimulation, importSimulation } from '../persistence/autosave';
import { createCompleteGameDeploymentFixture, deployAllCompleteGameUnits, resolveCompleteGameCommandPhaseForTests } from '../testing/complete-game-deployment-fixture';
import { OFFICIAL_APP_MODIFIERS_SOURCE } from '../rules/m5-source-references';
import { createShootingEnvironment, replayGameEventsWithShootingEnvironment } from './shooting';
import { evaluateObjectiveControlV1, executeObjectiveAwareAdvanceBattlePhaseCommand } from './objective-control';
import { createSimulatorActor, dispatchGameCommand, getSimulatorGameState } from './machine';

function startBattle(gameId: string) {
  const fixture = createCompleteGameDeploymentFixture(gameId);
  const deployment = deployAllCompleteGameUnits(fixture.state, fixture.environment, `${gameId}-deploy`);
  const firstPlayer = executeGameCommand(deployment.state, {
    id: `${gameId}-first`, actorId: deployment.state.battle!.defenderPlayerId, type: 'determine-first-player'
  });
  if (!firstPlayer.accepted) throw new Error(firstPlayer.rejection.message);
  const started = executeGameCommand(firstPlayer.state, {
    id: `${gameId}-start`, actorId: firstPlayer.state.battle!.firstPlayerId!, type: 'start-battle'
  });
  if (!started.accepted) throw new Error(started.rejection.message);
  return { ...fixture, state: started.state };
}

function checkpoint(state: GameState, boundary: 'phase-end' | 'turn-end' = 'phase-end') {
  return {
    battleRound: state.battle!.battleRound,
    turnNumber: state.battle!.turnNumber,
    phase: state.battle!.phase,
    boundary
  } as const;
}

function stateWithModelPositions(state: GameState, positions: Readonly<Record<string, { readonly x: number; readonly y: number }>>): GameState {
  return {
    ...state,
    models: Object.fromEntries(Object.entries(state.models).map(([modelId, model]) => [
      modelId,
      { ...model, position: positions[modelId] ?? { x: 500, y: 500 } }
    ]))
  };
}

describe('M8 objective control', () => {
  it('uses exact base-to-marker geometry, includes tangency and excludes one-unit excess', () => {
    const fixture = startBattle('m8-objective-boundary');
    const marker = fixture.state.mission!.objectiveMarkers[0]!;
    const playerUnits = Object.values(fixture.state.units)
      .filter((unit) => unit.playerId === fixture.state.battle!.playerIds[0])
      .sort((left, right) => left.id.localeCompare(right.id));
    const enemyUnit = Object.values(fixture.state.units).find((unit) => unit.playerId === fixture.state.battle!.playerIds[1])!;
    const touchingModel = playerUnits[0]!.models[0]!;
    const outsideModel = enemyUnit.models[0]!;
    const state = stateWithModelPositions(fixture.state, {
      [touchingModel.id]: { x: marker.center.x + 1_122, y: marker.center.y },
      [outsideModel.id]: { x: marker.center.x + 1_123, y: marker.center.y }
    });
    const result = evaluateObjectiveControlV1(state, marker, checkpoint(state), fixture.environment);
    const touching = result.modelEvidence.find((model) => model.modelId === touchingModel.id)!;
    const outside = result.modelEvidence.find((model) => model.modelId === outsideModel.id)!;
    expect(touching).toMatchObject({ horizontalDistance: 762, verticalDistance: 0, withinRange: true, effectiveObjectiveControl: 2 });
    expect(outside).toMatchObject({ horizontalDistance: 763, verticalDistance: 0, withinRange: false });
    expect(result.controlLevelByPlayerId).toMatchObject({ [playerUnits[0]!.playerId]: 2, [enemyUnit.playerId]: 0 });
    expect(result.controllerPlayerId).toBe(playerUnits[0]!.playerId);
    expect(result.controllingUnitIdsByPlayerId[playerUnits[0]!.playerId]).toEqual([playerUnits[0]!.id]);
  });

  it('applies the exact vertical boundary and supports every model footprint shape', () => {
    const fixture = startBattle('m8-objective-shapes');
    const unit = Object.values(fixture.state.units)[0]!;
    const modelId = unit.models[0]!.id;
    const shapes: PhysicalModelProfileV1[] = [
      fixture.environment.physicalProfiles.infantry!,
      { ...fixture.environment.physicalProfiles.infantry!, id: 'capsule', baseShape: { kind: 'capsule', radius: 100, length: 400 } },
      { ...fixture.environment.physicalProfiles.infantry!, id: 'polygon', baseShape: { kind: 'polygon', vertices: [{ x: -150, y: -100 }, { x: 150, y: -100 }, { x: 150, y: 100 }, { x: -150, y: 100 }] } }
    ];
    for (const profile of shapes) {
      const environment = createShootingEnvironment({
        physicalProfiles: { ...fixture.environment.physicalProfiles, [profile.id]: profile },
        weaponProfiles: fixture.environment.weaponProfiles,
        terrainZones: fixture.environment.terrainZones,
        coverRules: fixture.environment.coverRules
      });
      const marker: ObjectiveMarkerV1 = { ...fixture.state.mission!.objectiveMarkers[0]!, elevation: profile.height + 1_270 };
      const state: GameState = stateWithModelPositions({
        ...fixture.state,
        shootingEnvironmentFingerprint: environment.fingerprint,
        models: { ...fixture.state.models, [modelId]: { ...fixture.state.models[modelId]!, profileId: profile.id } }
      }, { [modelId]: marker.center });
      const atLimit = evaluateObjectiveControlV1(state, marker, checkpoint(state), environment)
        .modelEvidence.find((model) => model.modelId === modelId)!;
      expect(atLimit).toMatchObject({ horizontalDistance: 0, verticalDistance: 1_270, withinRange: true });
      const beyond = evaluateObjectiveControlV1(state, { ...marker, elevation: marker.elevation + 1 }, checkpoint(state), environment)
        .modelEvidence.find((model) => model.modelId === modelId)!;
      expect(beyond).toMatchObject({ verticalDistance: 1_271, withinRange: false });
    }
  });

  it('measures the nearest oriented edge of capsule and polygon hitboxes', () => {
    const fixture = startBattle('m8-objective-oriented-shapes');
    const marker = fixture.state.mission!.objectiveMarkers[0]!;
    const unit = Object.values(fixture.state.units)[0]!;
    const modelId = unit.models[0]!.id;
    const cases = [
      {
        profile: { ...fixture.environment.physicalProfiles.infantry!, id: 'objective-capsule', baseShape: { kind: 'capsule' as const, radius: 100, length: 400 } },
        centerDistance: 1_262,
        boundaryOrientation: 0,
        rotatedOrientation: 90,
        rotatedDistance: 962
      },
      {
        profile: { ...fixture.environment.physicalProfiles.infantry!, id: 'objective-polygon', baseShape: { kind: 'polygon' as const, vertices: [{ x: -150, y: -100 }, { x: 150, y: -100 }, { x: 150, y: 100 }, { x: -150, y: 100 }] } },
        centerDistance: 1_112,
        boundaryOrientation: 0,
        rotatedOrientation: 90,
        rotatedDistance: 812
      }
    ] satisfies readonly { readonly profile: PhysicalModelProfileV1; readonly centerDistance: number; readonly boundaryOrientation: number; readonly rotatedOrientation: number; readonly rotatedDistance: number }[];

    for (const testCase of cases) {
      const environment = createShootingEnvironment({
        physicalProfiles: { ...fixture.environment.physicalProfiles, [testCase.profile.id]: testCase.profile },
        weaponProfiles: fixture.environment.weaponProfiles,
        terrainZones: fixture.environment.terrainZones,
        coverRules: fixture.environment.coverRules
      });
      const withOrientation = (orientationDegrees: number): GameState => ({
        ...stateWithModelPositions(fixture.state, { [modelId]: { x: marker.center.x + testCase.centerDistance, y: marker.center.y } }),
        shootingEnvironmentFingerprint: environment.fingerprint,
        models: {
          ...fixture.state.models,
          [modelId]: {
            ...fixture.state.models[modelId]!,
            position: { x: marker.center.x + testCase.centerDistance, y: marker.center.y },
            profileId: testCase.profile.id,
            orientationDegrees
          }
        }
      });
      const atBoundary = evaluateObjectiveControlV1(withOrientation(testCase.boundaryOrientation), marker, checkpoint(fixture.state), environment)
        .modelEvidence.find((model) => model.modelId === modelId)!;
      const rotated = evaluateObjectiveControlV1(withOrientation(testCase.rotatedOrientation), marker, checkpoint(fixture.state), environment)
        .modelEvidence.find((model) => model.modelId === modelId)!;
      expect(atBoundary.horizontalDistance).toBeCloseTo(762, 8);
      expect(atBoundary.withinRange).toBe(true);
      expect(rotated.horizontalDistance).toBeCloseTo(testCase.rotatedDistance, 8);
      expect(rotated.withinRange).toBe(false);
    }
  });

  it('sums OC per active model, treats Battle-shocked OC as zero and resolves ties as uncontrolled', () => {
    const fixture = startBattle('m8-objective-oc');
    const marker = fixture.state.mission!.objectiveMarkers[0]!;
    const [firstPlayerId, secondPlayerId] = fixture.state.battle!.playerIds;
    const firstUnit = Object.values(fixture.state.units).find((unit) => unit.playerId === firstPlayerId)!;
    const secondUnit = Object.values(fixture.state.units).find((unit) => unit.playerId === secondPlayerId)!;
    const firstModels = firstUnit.models.slice(0, 2);
    const secondModels = secondUnit.models.slice(0, 2);
    const positions = Object.fromEntries([...firstModels, ...secondModels].map((model) => [model.id, marker.center]));
    const onlyFourActive: GameState = {
      ...stateWithModelPositions(fixture.state, positions),
      units: Object.fromEntries(Object.entries(fixture.state.units).map(([unitId, unit]) => [
        unitId,
        { ...unit, models: unit.models.map((model) => ({ ...model, active: positions[model.id] !== undefined, wounds: positions[model.id] !== undefined ? model.wounds : 0 })) }
      ]))
    };
    const tie = evaluateObjectiveControlV1(onlyFourActive, marker, checkpoint(onlyFourActive), fixture.environment);
    expect(tie.controlLevelByPlayerId).toEqual({ [firstPlayerId!]: 4, [secondPlayerId!]: 4 });
    expect(tie).toMatchObject({ tied: true, controllerPlayerId: null });
    expect(tie.controllingUnitIdsByPlayerId).toEqual({ [firstPlayerId!]: [], [secondPlayerId!]: [] });

    const shocked: GameState = {
      ...onlyFourActive,
      battleResources: { ...onlyFourActive.battleResources!, battleShockedUnitIds: [secondUnit.id] }
    };
    const controlled = evaluateObjectiveControlV1(shocked, marker, checkpoint(shocked), fixture.environment);
    expect(controlled.controlLevelByPlayerId).toEqual({ [firstPlayerId!]: 4, [secondPlayerId!]: 0 });
    expect(controlled.controllerPlayerId).toBe(firstPlayerId);
    expect(controlled.modelEvidence.filter((model) => model.unitId === secondUnit.id)
      .every((model) => model.battleShocked && model.effectiveObjectiveControl === 0)).toBe(true);
  });

  it('applies active source-backed OC modifiers before summing each model contribution', () => {
    const fixture = startBattle('m8-objective-modifier');
    const marker = fixture.state.mission!.objectiveMarkers[0]!;
    const unit = Object.values(fixture.state.units)[0]!;
    const model = unit.models[0]!;
    const state: GameState = {
      ...stateWithModelPositions(fixture.state, { [model.id]: marker.center }),
      units: Object.fromEntries(Object.entries(fixture.state.units).map(([unitId, candidate]) => [
        unitId,
        { ...candidate, models: candidate.models.map((member) => ({ ...member, active: member.id === model.id, wounds: member.id === model.id ? member.wounds : 0 })) }
      ])),
      battleResources: {
        ...fixture.state.battleResources!,
        timedEffects: [{
          schemaVersion: 'warforge-timed-effect/v1',
          id: 'objective-control-plus-one',
          targetUnitId: unit.id,
          modifier: {
            id: 'objective-control-plus-one-modifier', characteristic: 'objective-control',
            operation: 'add', value: 1, source: OFFICIAL_APP_MODIFIERS_SOURCE
          },
          appliedAt: { battleRound: 1, turnNumber: 1, phase: 'command', boundary: 'start' },
          expiresAt: null,
          sourceRefs: [OFFICIAL_APP_MODIFIERS_SOURCE]
        }]
      }
    };
    const result = evaluateObjectiveControlV1(state, marker, checkpoint(state), fixture.environment);
    expect(result.modelEvidence.find((evidence) => evidence.modelId === model.id)).toMatchObject({
      baseObjectiveControl: 2, effectiveObjectiveControl: 3, withinRange: true
    });
    expect(result.controlLevelByPlayerId[unit.playerId]).toBe(3);
  });

  it('journals phase and turn checkpoints, replays them exactly and rejects forged geometry evidence', () => {
    const fixture = startBattle('m8-objective-replay');
    const command = resolveCompleteGameCommandPhaseForTests(fixture.state, 'm8-objective-command');
    const direct = executeGameCommand(command.state, {
      id: 'm8-objective-direct-advance', actorId: command.state.battle!.activePlayerId!, type: 'advance-battle-phase'
    });
    expect(direct).toMatchObject({ accepted: false, state: command.state, rejection: { code: 'trusted-objective-environment-required' } });
    expect(direct.state.prng).toEqual(command.state.prng);
    const advanced = executeObjectiveAwareAdvanceBattlePhaseCommand(command.state, {
      id: 'm8-objective-advance', actorId: command.state.battle!.activePlayerId!, type: 'advance-battle-phase'
    }, fixture.environment);
    expect(advanced.accepted).toBe(true);
    if (!advanced.accepted) return;
    expect(advanced.events.map((event) => event.type)).toEqual(['objective-control-resolved', 'battle-phase-advanced']);
    expect(advanced.state.mission!.objectiveControlEventIds).toEqual(['m8-objective-advance:objective:phase-end']);
    expect(replayGameEventsWithShootingEnvironment(fixture.initial, advanced.state.eventLog, fixture.environment)).toEqual(advanced.state);
    const exported = exportSimulation(fixture.initial, advanced.state, '2026-08-29T18:00:00.000Z', fixture.environment);
    expect(importSimulation(exported, fixture.environment, sessionCompatibilityFingerprint(fixture.session)))
      .toMatchObject({ ok: true, state: advanced.state });
    const omittedCheckpoint = JSON.parse(exported) as { events: GameEvent[] };
    omittedCheckpoint.events = omittedCheckpoint.events.filter((event) => event.type !== 'objective-control-resolved');
    expect(importSimulation(JSON.stringify(omittedCheckpoint), fixture.environment, sessionCompatibilityFingerprint(fixture.session)))
      .toMatchObject({ ok: false, errors: [expect.stringContaining('mandatory objective-control checkpoint')] });

    const actor = createSimulatorActor({ initialState: fixture.initial, gameState: command.state, shootingEnvironment: fixture.environment });
    actor.start();
    dispatchGameCommand(actor, {
      id: 'm8-objective-actor-advance', actorId: command.state.battle!.activePlayerId!, type: 'advance-battle-phase'
    });
    expect(getSimulatorGameState(actor)).toMatchObject({
      phase: 'movement',
      mission: { objectiveControlEventIds: ['m8-objective-actor-advance:objective:phase-end'] }
    });
    actor.stop();

    const forged = structuredClone(advanced.state.eventLog) as GameEvent[];
    const objectiveEvent = forged.find((event): event is Extract<GameEvent, { type: 'objective-control-resolved' }> => event.type === 'objective-control-resolved')!;
    const evidence = objectiveEvent.resolutions[0]!.modelEvidence[0] as { horizontalDistance: number };
    evidence.horizontalDistance += 1;
    expect(() => replayGameEventsWithShootingEnvironment(fixture.initial, forged, fixture.environment)).toThrow('trusted geometry verification');

    const fightState: GameState = {
      ...command.state,
      phase: 'fight',
      commandPhase: null,
      battle: { ...command.state.battle!, phase: 'fight' },
      fightPhase: {
        schemaVersion: FIGHT_PHASE_V1_SCHEMA_VERSION,
        stage: 'complete',
        activePlayerId: command.state.battle!.activePlayerId!,
        currentPlayerId: command.state.battle!.activePlayerId!,
        passedPlayerIds: [], piledInUnitIds: [], eligibleAtFightStartUnitIds: [], selectionBand: null,
        foughtUnitIds: [], consolidatedUnitIds: []
      }
    };
    const turnEnd = executeObjectiveAwareAdvanceBattlePhaseCommand(fightState, {
      id: 'm8-objective-turn-end', actorId: fightState.battle!.activePlayerId!, type: 'advance-battle-phase'
    }, fixture.environment);
    expect(turnEnd.accepted).toBe(true);
    if (!turnEnd.accepted) return;
    expect(turnEnd.events.map((event) => event.type)).toEqual([
      'objective-control-resolved', 'objective-control-resolved', 'battle-phase-advanced'
    ]);
    expect(turnEnd.events.slice(0, 2).map((event) => (event as Extract<GameEvent, { type: 'objective-control-resolved' }>).checkpoint.boundary))
      .toEqual(['phase-end', 'turn-end']);
    expect(() => turnEnd.events.slice(1).reduce(reduceGameEvent, fightState))
      .toThrow('outside its deterministic checkpoint');
  });
});
