import { describe, expect, it } from 'vitest';
import {
  calculateMissionScoringV1,
  createInitialGameState,
  createSimulationSaveV6,
  executeGameCommand,
  missionScoringSourceRefsV1,
  prepareObjectiveAwareBattlePhaseAdvance,
  type GameEvent,
  type GameState,
  type MissionScoringCheckpointV1,
  type MissionScoringEvidenceV1,
  type MissionTableQuarterV1
} from '../domain';
import { unsafeReduceGameEvent } from '../domain/reducer';
import { unsafeValidateSimulationSaveWithVerifier } from '../domain/serialization';
import { createShootingReplayVerifier } from './shooting';
import { executeMissionScoringCommand } from './mission-scoring';
import { executeObjectiveAwareAdvanceBattlePhaseCommand } from './objective-control';
import {
  createCompleteGameScoringDeploymentFixture,
  deployAllCompleteGameUnits,
  resolveCompleteGameCommandPhaseForTests
} from '../testing/complete-game-deployment-fixture';
import {
  COMPLETE_GAME_SCORING_OBJECTIVE_ROLE_BY_ID,
  createCompleteGameScoringSessionForTests
} from '../testing/closed-complete-game-fixture';

const CHECKPOINT_BOUNDARY = {
  'end-of-own-command-phase': 'phase-end',
  'end-of-own-turn': 'turn-end'
} as const;

function setupState(gameId = 'mission-scoring-domain'): GameState {
  const session = createCompleteGameScoringSessionForTests('mission-scoring-environment');
  const initial = createInitialGameState(gameId, 0x57465247);
  const setup = executeGameCommand(initial, { id: `${gameId}:setup`, actorId: session.players[0]!.id, type: 'setup-session', session });
  if (!setup.accepted) throw new Error(setup.rejection.message);
  return setup.state;
}

function atCheckpoint(
  source: GameState,
  battleRound: number,
  turnNumber: number,
  checkpoint: MissionScoringCheckpointV1,
  activePlayerId = source.battle!.playerIds[0]!,
  controlledObjectiveIds: readonly string[] = []
): GameState {
  const phase: 'command' | 'fight' = checkpoint === 'end-of-own-command-phase' ? 'command' : 'fight';
  const objectiveControllers = Object.fromEntries(source.mission!.objectiveMarkerIds.map((objectiveId) => [
    objectiveId,
    controlledObjectiveIds.includes(objectiveId) ? activePlayerId : null
  ]));
  const latestObjectiveControlById = Object.fromEntries(source.mission!.objectiveMarkerIds.map((objectiveId) => [objectiveId, {
    objectiveId,
    checkpoint: { battleRound, turnNumber, phase, boundary: CHECKPOINT_BOUNDARY[checkpoint] },
    controlLevelByPlayerId: Object.fromEntries(source.battle!.playerIds.map((playerId) => [playerId, playerId === objectiveControllers[objectiveId] ? 1 : 0])),
    controllerPlayerId: objectiveControllers[objectiveId],
    tied: objectiveControllers[objectiveId] === null,
    controllingUnitIdsByPlayerId: Object.fromEntries(source.battle!.playerIds.map((playerId) => [playerId, []])),
    modelEvidence: []
  }]));
  return {
    ...source,
    phase,
    round: battleRound,
    battle: {
      ...source.battle!, lifecycle: 'in-progress', battleRound, turnNumber, activePlayerId, phase,
      firstPlayerId: source.battle!.firstPlayerId ?? source.battle!.playerIds[0]!,
      deployedUnitIds: Object.keys(source.units).sort((left, right) => left.localeCompare(right))
    },
    commandPhase: phase === 'command' ? {
      schemaVersion: 'warforge-command-phase/v1', activePlayerId, stage: 'complete', pendingBattleShockUnitIds: [], testedBattleShockUnitIds: []
    } : null,
    fightPhase: phase === 'fight' ? {
      schemaVersion: 'warforge-fight-phase/v1', stage: 'complete', activePlayerId, currentPlayerId: null,
      passedPlayerIds: [], piledInUnitIds: [], eligibleAtFightStartUnitIds: [], selectionBand: null,
      foughtUnitIds: [], consolidatedUnitIds: []
    } : null,
    mission: {
      ...source.mission!, lifecycle: 'in-progress', objectiveControllers, latestObjectiveControlById
    }
  };
}

function evidence(
  state: GameState,
  engageQuarterByUnitId: Readonly<Record<string, MissionTableQuarterV1>> = {},
  battleReadyByPlayerId: Readonly<Record<string, boolean>> | null = null
): MissionScoringEvidenceV1 {
  return {
    schemaVersion: 'warforge-mission-scoring/v1',
    objectiveRoleById: COMPLETE_GAME_SCORING_OBJECTIVE_ROLE_BY_ID,
    engageQuarterByUnitId,
    battleReadyByPlayerId: battleReadyByPlayerId === null ? null : Object.fromEntries(state.battle!.playerIds.map((playerId) => [playerId, battleReadyByPlayerId[playerId]]))
  };
}

function applyCalculatedScore(state: GameState, commandId: string, scoreEvidence: MissionScoringEvidenceV1): GameState {
  const calculation = calculateMissionScoringV1(state, scoreEvidence);
  const event: Extract<GameEvent, { readonly type: 'mission-scoring-resolved' }> = {
    id: `${commandId}:score`, commandId, type: 'mission-scoring-resolved',
    checkpointId: calculation.checkpointId, checkpoint: calculation.checkpoint,
    battleRound: state.battle!.battleRound, turnNumber: state.battle!.turnNumber,
    activePlayerId: state.battle!.activePlayerId!, evidence: scoreEvidence,
    scoreEvents: calculation.scoreEvents, finalResult: calculation.finalResult,
    environmentFingerprint: state.shootingEnvironmentFingerprint!,
    prngBefore: state.prng, prngAfter: state.prng,
    sourceRefs: missionScoringSourceRefsV1()
  };
  return unsafeReduceGameEvent(state, event);
}

function geometricEngageScore(
  gameId: string,
  mutate?: (state: GameState, activeUnitIds: readonly string[]) => GameState
): Extract<GameEvent, { readonly type: 'mission-scoring-resolved' }> {
  const base = createCompleteGameScoringDeploymentFixture(gameId);
  const activePlayerId = base.state.battle!.playerIds[0]!;
  const ownUnits = Object.values(base.state.units).filter((unit) => unit.playerId === activePlayerId);
  const syntheticUnitId = `${gameId}:fourth-unit`;
  const syntheticModelId = `${gameId}:fourth-model`;
  const syntheticUnit = {
    ...ownUnits[0]!, id: syntheticUnitId, fixtureId: syntheticUnitId,
    models: [{ id: syntheticModelId, wounds: ownUnits[0]!.woundsPerModel, active: true }]
  };
  const activeUnitIds = [...ownUnits.map((unit) => unit.id), syntheticUnitId];
  const quarterCentres = [
    { x: 1_400, y: 1_400 },
    { x: 9_776, y: 1_400 },
    { x: 1_400, y: 13_840 },
    { x: 9_776, y: 13_840 }
  ] as const;
  let state: GameState = {
    ...base.state,
    units: { ...base.state.units, [syntheticUnitId]: syntheticUnit },
    models: {
      ...base.state.models,
      [syntheticModelId]: {
        id: syntheticModelId, playerId: activePlayerId, profileId: 'infantry',
        position: quarterCentres[3], orientationDegrees: 0, active: true
      }
    }
  };
  const positionedModels = { ...state.models };
  activeUnitIds.forEach((unitId, unitIndex) => {
    const unit = state.units[unitId]!;
    const centre = quarterCentres[unitIndex]!;
    unit.models.filter((model) => model.active).forEach((model, modelIndex) => {
      positionedModels[model.id] = {
        ...positionedModels[model.id]!,
        position: {
          x: centre.x + (modelIndex % 3 - 1) * 400,
          y: centre.y + (Math.floor(modelIndex / 3) - 1) * 400
        }
      };
    });
  });
  state = atCheckpoint({ ...state, models: positionedModels }, 1, 1, 'end-of-own-turn', activePlayerId);
  state = mutate?.(state, activeUnitIds) ?? state;
  const result = executeMissionScoringCommand(state, {
    id: `${gameId}:score`, actorId: activePlayerId, type: 'resolve-mission-scoring'
  }, base.environment);
  if (!result.accepted) throw new Error(`${result.rejection.code}: ${result.rejection.message}`);
  return result.events.find((event): event is Extract<GameEvent, { readonly type: 'mission-scoring-resolved' }> => event.type === 'mission-scoring-resolved')!;
}

describe('closed M9 mission scoring', () => {
  it('keeps scoring inputs authoritative and gates phase advancement without consuming PRNG', () => {
    const state = atCheckpoint(setupState(), 1, 1, 'end-of-own-command-phase');
    const command = { id: 'score-command', actorId: state.battle!.activePlayerId!, type: 'resolve-mission-scoring' as const };
    expect(executeGameCommand(state, command)).toMatchObject({ accepted: false, rejection: { code: 'trusted-mission-scoring-environment-required' } });
    expect(executeGameCommand(state, { id: 'advance-before-score', actorId: command.actorId, type: 'advance-battle-phase' }))
      .toMatchObject({ accepted: false, rejection: { code: 'mission-scoring-checkpoint-pending' } });
    const before = state.prng;
    const scored = applyCalculatedScore(state, command.id, evidence(state));
    expect(scored.prng).toEqual(before);
    expect(scored.mission!.scoredCheckpointIds).toEqual(['round-1:turn-1:end-of-own-command-phase']);
  });

  it('applies the exact Outmanoeuvre windows and both primary caps', () => {
    let state = setupState('outmanoeuvre-caps');
    const allObjectives = state.mission!.objectiveMarkerIds;
    state = applyCalculatedScore(atCheckpoint(state, 1, 1, 'end-of-own-turn', undefined, allObjectives), 'round-1', evidence(state));
    const playerId = state.battle!.activePlayerId!;
    expect(state.mission!.scoreBreakdownByPlayerId![playerId]).toMatchObject({ primaryVp: 15, primaryVpByBattleRound: { 1: 15 } });

    state = atCheckpoint(state, 2, 1, 'end-of-own-command-phase', playerId, allObjectives);
    state = applyCalculatedScore(state, 'round-2', evidence(state));
    state = atCheckpoint(state, 3, 1, 'end-of-own-command-phase', playerId, allObjectives);
    state = applyCalculatedScore(state, 'round-3', evidence(state));
    state = atCheckpoint(state, 4, 1, 'end-of-own-turn', playerId, allObjectives);
    const roundFour = calculateMissionScoringV1(state, evidence(state));
    expect(roundFour.scoreEvents.filter((event) => event.category === 'primary')).toEqual(expect.arrayContaining([
      expect.objectContaining({ scoringWindowId: 'control-opponent-home', rawVp: 10, appliedVp: 0 }),
      expect.objectContaining({ scoringWindowId: 'rounds-4-5-non-home-objectives', rawVp: 30, appliedVp: 0 })
    ]));
    expect(state.mission!.scoreBreakdownByPlayerId![playerId]).toMatchObject({ primaryVp: 45, primaryVpByBattleRound: { 1: 15, 2: 15, 3: 15 } });
  });

  it('scores Assassination cumulatively once and Engage as mutually exclusive 2/4 VP tiers', () => {
    let state = atCheckpoint(setupState('fixed-secondaries'), 1, 1, 'end-of-own-turn');
    const scorer = state.battle!.activePlayerId!;
    const enemyCharacter = Object.values(state.units).find((unit) => unit.playerId !== scorer && unit.keywords.includes('CHARACTER'))!;
    const casualtyId = enemyCharacter.models[0]!.id;
    const ownUnits = Object.values(state.units).filter((unit) => unit.playerId === scorer);
    const fourthUnit = { ...ownUnits[0]!, id: 'synthetic-fourth-quarter-unit', fixtureId: 'synthetic-fourth-quarter-unit', models: [{ id: 'synthetic-fourth-quarter-model', wounds: 2, active: true }] };
    state = {
      ...state,
      units: {
        ...state.units,
        [enemyCharacter.id]: { ...enemyCharacter, woundsPerModel: 4, models: enemyCharacter.models.map((model) => model.id === casualtyId ? { ...model, wounds: 0, active: false } : model) },
        [fourthUnit.id]: fourthUnit
      },
      models: { ...state.models, [casualtyId]: { ...state.models[casualtyId]!, active: false }, 'synthetic-fourth-quarter-model': { id: 'synthetic-fourth-quarter-model', playerId: scorer, profileId: 'infantry', position: { x: 500, y: 500 }, orientationDegrees: 0, active: true } },
      battle: { ...state.battle!, deployedUnitIds: [...state.battle!.deployedUnitIds, fourthUnit.id].sort() }
    };
    const fourQuarters = Object.fromEntries([...ownUnits, fourthUnit].map((unit, index) => [unit.id, ['bottom-left', 'bottom-right', 'top-left', 'top-right'][index]!])) as Readonly<Record<string, MissionTableQuarterV1>>;
    const calculation = calculateMissionScoringV1(state, evidence(state, fourQuarters));
    expect(calculation.scoreEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ cardId: 'assassination', rawVp: 4, appliedVp: 4, evidence: { destroyedCharacterModelIds: [casualtyId] } }),
      expect.objectContaining({ cardId: 'engage-on-all-fronts', rawVp: 4, appliedVp: 4 })
    ]));
    state = applyCalculatedScore(state, 'fixed-first', evidence(state, fourQuarters));
    expect(state.mission!.scoreBreakdownByPlayerId![scorer]).toMatchObject({ secondaryVp: 8, fixedSecondaryVpById: { assassination: 4, 'engage-on-all-fronts': 4 } });

    const otherPlayer = state.battle!.playerIds.find((playerId) => playerId !== scorer)!;
    state = atCheckpoint(state, 2, 2, 'end-of-own-turn', otherPlayer);
    const repeated = calculateMissionScoringV1(state, evidence(state));
    expect(repeated.scoreEvents.some((event) => event.cardId === 'assassination' && event.evidence.destroyedCharacterModelIds?.includes(casualtyId))).toBe(false);

    const threeQuarters = Object.fromEntries(ownUnits.map((unit, index) => [unit.id, ['bottom-left', 'bottom-right', 'top-left'][index]!])) as Readonly<Record<string, MissionTableQuarterV1>>;
    const activeAgain = atCheckpoint(state, 3, 1, 'end-of-own-turn', scorer);
    expect(calculateMissionScoringV1(activeAgain, evidence(activeAgain, threeQuarters)).scoreEvents)
      .toEqual(expect.arrayContaining([expect.objectContaining({ cardId: 'engage-on-all-fronts', rawVp: 2 })]));
  });

  it('derives Engage quarters from whole-unit geometry and excludes every ineligible branch', () => {
    const engage = (event: Extract<GameEvent, { readonly type: 'mission-scoring-resolved' }>) =>
      event.scoreEvents.find((candidate) => candidate.cardId === 'engage-on-all-fronts')!;
    const baseline = engage(geometricEngageScore('engage-geometry-baseline'));
    expect(baseline).toMatchObject({ rawVp: 4, appliedVp: 4 });
    expect(Object.keys(baseline.evidence.eligibleUnitIdsByQuarter!)).toHaveLength(4);

    const crossingBoundary = engage(geometricEngageScore('engage-geometry-boundary', (state, unitIds) => {
      const unit = state.units[unitIds[0]!]!;
      const modelId = unit.models[0]!.id;
      return {
        ...state,
        models: { ...state.models, [modelId]: { ...state.models[modelId]!, position: { x: 5_588, y: 1_400 } } }
      };
    }));
    expect(crossingBoundary.rawVp).toBe(2);

    const withinSixInches = engage(geometricEngageScore('engage-geometry-centre', (state, unitIds) => {
      const unit = state.units[unitIds[3]!]!;
      const modelId = unit.models[0]!.id;
      return {
        ...state,
        models: { ...state.models, [modelId]: { ...state.models[modelId]!, position: { x: 6_588, y: 8_620 } } }
      };
    }));
    expect(withinSixInches.rawVp).toBe(2);

    const aircraft = engage(geometricEngageScore('engage-geometry-aircraft', (state, unitIds) => ({
      ...state,
      units: {
        ...state.units,
        [unitIds[3]!]: { ...state.units[unitIds[3]!]!, keywords: [...state.units[unitIds[3]!]!.keywords, 'AIRCRAFT'] }
      }
    })));
    expect(aircraft.rawVp).toBe(2);

    const battleShocked = engage(geometricEngageScore('engage-geometry-battle-shock', (state, unitIds) => ({
      ...state,
      battleResources: {
        ...state.battleResources!,
        battleShockedUnitIds: [...state.battleResources!.battleShockedUnitIds, unitIds[3]!]
      }
    })));
    expect(battleShocked.rawVp).toBe(2);
  });

  it('enforces the 15 VP secondary round cap and 20 VP fixed-card cap', () => {
    let state = atCheckpoint(setupState('secondary-caps'), 1, 1, 'end-of-own-turn');
    const scorer = state.battle!.activePlayerId!;
    const enemy = state.battle!.playerIds.find((playerId) => playerId !== scorer)!;
    const template = Object.values(state.units).find((unit) => unit.playerId === enemy && unit.keywords.includes('CHARACTER'))!;
    const firstCasualties = Array.from({ length: 6 }, (_, index) => ({ id: `round-one-character-${index}`, wounds: 0, active: false }));
    state = {
      ...state,
      units: { ...state.units, [template.id]: { ...template, woundsPerModel: 4, models: firstCasualties } },
      models: {
        ...state.models,
        ...Object.fromEntries(firstCasualties.map((model) => [model.id, { id: model.id, playerId: enemy, profileId: 'infantry', position: { x: 500, y: 500 }, orientationDegrees: 0, active: false }]))
      }
    };
    state = applyCalculatedScore(state, 'secondary-cap-round-one', evidence(state));
    expect(state.mission!.scoreBreakdownByPlayerId![scorer]).toMatchObject({ secondaryVp: 15, fixedSecondaryVpById: { assassination: 15 } });

    state = atCheckpoint(state, 2, 1, 'end-of-own-turn', scorer);
    const secondCasualties = Array.from({ length: 2 }, (_, index) => ({ id: `round-two-character-${index}`, wounds: 0, active: false }));
    const secondUnit = { ...template, id: 'second-character-unit', fixtureId: 'second-character-unit', woundsPerModel: 4, models: secondCasualties };
    state = {
      ...state,
      units: { ...state.units, [secondUnit.id]: secondUnit },
      models: {
        ...state.models,
        ...Object.fromEntries(secondCasualties.map((model) => [model.id, { id: model.id, playerId: enemy, profileId: 'infantry', position: { x: 500, y: 500 }, orientationDegrees: 0, active: false }]))
      },
      battle: { ...state.battle!, deployedUnitIds: [...state.battle!.deployedUnitIds, secondUnit.id].sort() }
    };
    const second = calculateMissionScoringV1(state, evidence(state));
    expect(second.scoreEvents.filter((event) => event.cardId === 'assassination').map((event) => event.appliedVp)).toEqual([4, 1]);
    state = applyCalculatedScore(state, 'secondary-cap-round-two', evidence(state));
    expect(state.mission!.scoreBreakdownByPlayerId![scorer]).toMatchObject({ secondaryVp: 20, fixedSecondaryVpById: { assassination: 20 } });
  });

  it('creates a sourced draw or winner only at the final turn of round five', () => {
    let drawState = atCheckpoint(setupState('final-draw'), 5, 2, 'end-of-own-turn');
    expect(executeGameCommand(drawState, { id: 'premature-final-advance', actorId: drawState.battle!.activePlayerId!, type: 'advance-battle-phase' }))
      .toMatchObject({ accepted: false, rejection: { code: 'mission-scoring-checkpoint-pending' } });
    const ready = Object.fromEntries(drawState.battle!.playerIds.map((playerId) => [playerId, true]));
    const draw = calculateMissionScoringV1(drawState, evidence(drawState, {}, ready));
    expect(draw.finalResult).toMatchObject({ battleRound: 5, outcome: 'draw', winnerPlayerId: null });
    expect(Object.values(draw.scoresByPlayerId)).toEqual([10, 10]);

    const [winnerId, loserId] = drawState.battle!.playerIds;
    const winner = calculateMissionScoringV1(drawState, evidence(drawState, {}, { [winnerId!]: true, [loserId!]: false }));
    expect(winner.finalResult).toMatchObject({ outcome: 'winner', winnerPlayerId: winnerId });

    drawState = applyCalculatedScore(drawState, 'final-score', evidence(drawState, {}, ready));
    const prepared = prepareObjectiveAwareBattlePhaseAdvance(drawState, {
      id: 'final-advance', actorId: drawState.battle!.activePlayerId!, type: 'advance-battle-phase'
    });
    if (!prepared.accepted) throw new Error(prepared.rejection.message);
    const completed = unsafeReduceGameEvent(drawState, prepared.event);
    expect(completed).toMatchObject({ phase: 'completed', battle: { lifecycle: 'completed' }, mission: { lifecycle: 'completed', finalResult: { outcome: 'draw' } } });
  });

  it('replays a trusted score exactly in V6 and rejects altered VP evidence', () => {
    const base = createCompleteGameScoringDeploymentFixture('mission-score-replay');
    const deployed = deployAllCompleteGameUnits(base.state, base.environment, 'score-replay-deploy');
    const first = executeGameCommand(deployed.state, { id: 'score-replay-first', actorId: deployed.state.battle!.defenderPlayerId, type: 'determine-first-player' });
    if (!first.accepted) throw new Error(first.rejection.message);
    const started = executeGameCommand(first.state, { id: 'score-replay-start', actorId: first.state.battle!.firstPlayerId!, type: 'start-battle' });
    if (!started.accepted) throw new Error(started.rejection.message);
    const commandPhase = resolveCompleteGameCommandPhaseForTests(started.state, 'score-replay-command');
    const scored = executeMissionScoringCommand(commandPhase.state, {
      id: 'score-replay-checkpoint', actorId: commandPhase.state.battle!.activePlayerId!, type: 'resolve-mission-scoring'
    }, base.environment);
    if (!scored.accepted) throw new Error(`${scored.rejection.code}: ${scored.rejection.message}`);
    expect(scored.events.map((event) => event.type)).toEqual(['objective-control-resolved', 'mission-scoring-resolved']);
    expect(scored.state.prng).toEqual(commandPhase.state.prng);
    const advanced = executeObjectiveAwareAdvanceBattlePhaseCommand(scored.state, {
      id: 'score-replay-advance', actorId: scored.state.battle!.activePlayerId!, type: 'advance-battle-phase'
    }, base.environment);
    expect(advanced.accepted && advanced.events.map((event) => event.type)).toEqual(['battle-phase-advanced']);

    const verifier = createShootingReplayVerifier(base.environment);
    const save = createSimulationSaveV6(base.initial, scored.state.eventLog, '2026-08-30T20:00:00.000Z', verifier);
    expect(unsafeValidateSimulationSaveWithVerifier(save, verifier)).toMatchObject({ ok: true });
    const forged = structuredClone(save) as typeof save;
    const scoreEvent = forged.events.find((event): event is Extract<GameEvent, { readonly type: 'mission-scoring-resolved' }> => event.type === 'mission-scoring-resolved')!;
    (scoreEvent.scoreEvents as unknown as Array<Record<string, unknown>>).push({ id: 'forged-vp', rawVp: 1, appliedVp: 1 });
    expect(unsafeValidateSimulationSaveWithVerifier(forged, verifier)).toMatchObject({ ok: false, errors: [expect.stringContaining('trusted geometry verification')] });

    const forgedRoles = structuredClone(save) as typeof save;
    const forgedRoleEvent = forgedRoles.events.find((event): event is Extract<GameEvent, { readonly type: 'mission-scoring-resolved' }> => event.type === 'mission-scoring-resolved')!;
    const attackerHomeId = Object.entries(forgedRoleEvent.evidence.objectiveRoleById).find(([, role]) => role === 'attacker-home')![0];
    const defenderHomeId = Object.entries(forgedRoleEvent.evidence.objectiveRoleById).find(([, role]) => role === 'defender-home')![0];
    const mutableRoles = forgedRoleEvent.evidence.objectiveRoleById as unknown as Record<string, string>;
    mutableRoles[attackerHomeId] = 'defender-home';
    mutableRoles[defenderHomeId] = 'attacker-home';
    expect(unsafeValidateSimulationSaveWithVerifier(forgedRoles, verifier)).toMatchObject({
      ok: false, errors: [expect.stringContaining('trusted geometry verification')]
    });
  });
});
