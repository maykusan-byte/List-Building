import { describe, expect, it } from 'vitest';
import {
  BATTLE_RESOURCES_V1_SCHEMA_VERSION,
  BATTLE_STATE_V1_SCHEMA_VERSION,
  COMMAND_PHASE_V1_SCHEMA_VERSION,
  GAME_EVENT_STREAM_V1_SCHEMA_VERSION,
  MISSION_STATE_V1_SCHEMA_VERSION,
  RESOLUTION_QUEUE_V1_SCHEMA_VERSION,
  TIMED_EFFECT_V1_SCHEMA_VERSION,
  assertCompleteGameSessionSetupV1,
  completeGameSessionFingerprint,
  completeGameExecutableSessionFingerprintV1,
  activateNextResolutionV1,
  createCompleteGameSessionSetupV1,
  createInitialGameState,
  createResolutionQueueV1,
  createSimulationSave,
  createSimulationSaveV2,
  createSimulationSaveV3,
  createSimulationSaveV4,
  createSimulationSaveV5,
  createSimulationSaveV6,
  deserializeSimulationSave,
  executeGameCommand,
  enqueueResolutionV1,
  replayGameEvents,
  resolveActiveResolutionV1,
  sessionCompatibilityFingerprint,
  serializeSimulationSave,
  validateSimulationSave,
  type GameState,
  type GameEvent,
  type ResolutionQueueEntryV1,
  type SessionSetup
} from './index';
import {
  createCompleteGameScoringSessionForTests,
  createCompleteGameSessionForTests,
  createCoveredClosedPilotReportForTests,
  createCurrentClosedPilotReportForTests
} from '../testing/closed-complete-game-fixture';

function session(options: { readonly complete?: boolean } = {}): SessionSetup {
  const complete = createCompleteGameSessionForTests('shooting-environment-a');
  if (options.complete) return complete;
  const { completeGame: _completeGame, ...legacy } = complete;
  return {
    ...legacy,
    manifest: { ...legacy.manifest, scenarioId: 'legacy-scenario', scenarioFingerprint: 'scenario-a', coverageVersion: 'coverage-legacy-a' }
  };
}

function setUp(sessionSetup: SessionSetup, gameId = 'complete-game-contract'): { readonly initial: GameState; readonly state: GameState } {
  const initial = createInitialGameState(gameId, 0x57465247);
  const result = executeGameCommand(initial, { id: 'setup', actorId: sessionSetup.players[0].id, type: 'setup-session', session: sessionSetup });
  if (!result.accepted) throw new Error(result.rejection.message);
  return { initial, state: result.state };
}

describe('complete-game V6 contracts', () => {
  it('binds every scoring objective role into the executable session contract', () => {
    const valid = createCompleteGameScoringSessionForTests('shooting-environment-a');
    expect(valid.completeGame!.mission.objectiveRoleById).toBeDefined();
    const missingRoles = structuredClone(valid);
    delete (missingRoles.completeGame!.mission as { objectiveRoleById?: unknown }).objectiveRoleById;
    expect(() => assertCompleteGameSessionSetupV1(missingRoles.completeGame!, missingRoles))
      .toThrow('objective roles are malformed');

    const duplicateRole = structuredClone(valid);
    const roleIds = Object.keys(duplicateRole.completeGame!.mission.objectiveRoleById!);
    const mutableRoles = duplicateRole.completeGame!.mission.objectiveRoleById as unknown as Record<string, string>;
    mutableRoles[roleIds[0]!] = mutableRoles[roleIds[1]!]!;
    expect(() => assertCompleteGameSessionSetupV1(duplicateRole.completeGame!, duplicateRole))
      .toThrow('objective roles are malformed');
  });

  it('requires the Event Companion five-round duration as an executable invariant', () => {
    const valid = structuredClone(session({ complete: true }));
    const oneRound: SessionSetup = {
      ...valid,
      completeGame: {
        ...valid.completeGame!,
        battle: { ...valid.completeGame!.battle, maxBattleRounds: 1 }
      }
    };
    expect(() => assertCompleteGameSessionSetupV1(oneRound.completeGame!, oneRound)).toThrow('battle setup is malformed');
  });

  it('materializes the M7 deployment boundary while keeping later phases locked', () => {
    const setup = session({ complete: true });
    const { initial, state } = setUp(setup);
    expect(state.battle).toEqual({
      schemaVersion: BATTLE_STATE_V1_SCHEMA_VERSION,
      lifecycle: 'deployment',
      maxBattleRounds: 5,
      battleRound: 0,
      turnNumber: 0,
      playerIds: setup.players.map((player) => player.id),
      boardBounds: setup.completeGame!.battle.boardBounds,
      attackerPlayerId: setup.completeGame!.battle.attackerPlayerId,
      defenderPlayerId: setup.completeGame!.battle.defenderPlayerId,
      deploymentZones: setup.completeGame!.battle.deploymentZones,
      nextDeploymentPlayerId: setup.completeGame!.battle.defenderPlayerId,
      deployedUnitIds: [],
      deploymentOrder: [],
      firstPlayerId: null,
      activePlayerId: null,
      phase: 'deployment'
    });
    expect(state.mission).toMatchObject({
      schemaVersion: MISSION_STATE_V1_SCHEMA_VERSION,
      missionId: setup.completeGame!.mission.id,
      lifecycle: 'ready',
      objectiveMarkers: setup.completeGame!.mission.objectiveMarkers,
      objectiveControllers: { 'objective-centre': null },
      latestObjectiveControlById: { 'objective-centre': null },
      objectiveControlEventIds: [],
      scoresByPlayerId: Object.fromEntries(setup.players.map((player) => [player.id, 0]))
    });
    expect(state.resolutionQueue).toEqual({ schemaVersion: RESOLUTION_QUEUE_V1_SCHEMA_VERSION, activeEntryId: null, entries: [], resolvedEntryIds: [] });
    expect(JSON.parse(JSON.stringify({ battle: state.battle, mission: state.mission, queue: state.resolutionQueue }))).toEqual({ battle: state.battle, mission: state.mission, queue: state.resolutionQueue });

    const blocked = executeGameCommand(state, { id: 'legacy-command', actorId: 'p1', type: 'transition-phase', nextPhase: 'command' });
    expect(blocked).toMatchObject({ accepted: false, state, rejection: { code: 'complete-game-loop-not-covered' } });
    expect(blocked.state.prng).toEqual(initial.prng);
  });

  it('serializes and replays V6 with explicit contract and event-stream versions', () => {
    const setup = session({ complete: true });
    const { initial, state } = setUp(setup, 'complete-game-save');
    const save = createSimulationSaveV6(initial, state.eventLog, '2026-08-27T12:00:00.000Z');
    expect(save.environment).toMatchObject({
      eventStreamSchemaVersion: GAME_EVENT_STREAM_V1_SCHEMA_VERSION,
      battleStateSchemaVersion: BATTLE_STATE_V1_SCHEMA_VERSION,
      commandPhaseSchemaVersion: COMMAND_PHASE_V1_SCHEMA_VERSION,
      battleResourcesSchemaVersion: BATTLE_RESOURCES_V1_SCHEMA_VERSION,
      timedEffectSchemaVersion: TIMED_EFFECT_V1_SCHEMA_VERSION,
      missionStateSchemaVersion: MISSION_STATE_V1_SCHEMA_VERSION,
      resolutionQueueSchemaVersion: RESOLUTION_QUEUE_V1_SCHEMA_VERSION,
      completeGameSessionFingerprint: completeGameSessionFingerprint(setup.completeGame!),
      compatibilityReportFingerprint: setup.completeGame!.compatibility.report.canonicalFingerprint
    });
    const serialized = serializeSimulationSave(save);
    expect(deserializeSimulationSave(serialized)).toEqual({ ok: true, save });
    expect(replayGameEvents(initial, save.events)).toEqual(state);

    const forged = structuredClone(save) as unknown as { environment: { eventStreamSchemaVersion: string } };
    forged.environment.eventStreamSchemaVersion = 'warforge-game-event-stream/v99';
    expect(validateSimulationSave(forged)).toMatchObject({ ok: false, errors: ['La sauvegarde V6 ne correspond pas à son environnement de partie complète.'] });

    const preM8V6 = structuredClone(save) as unknown as { environment: Record<string, unknown>; events: GameEvent[]; initialState: GameState };
    delete preM8V6.environment.commandPhaseSchemaVersion;
    delete preM8V6.environment.battleResourcesSchemaVersion;
    delete preM8V6.environment.timedEffectSchemaVersion;
    const preM8SetupIndex = preM8V6.events.findIndex((event) => event.type === 'session-setup');
    const currentSetup = preM8V6.events[preM8SetupIndex] as Extract<GameEvent, { readonly type: 'session-setup' }>;
    const { completeGame: currentCompleteGame, ...preM8Base } = currentSetup.session;
    const { objectiveMarkers: _objectiveMarkers, ...preM8Mission } = currentCompleteGame!.mission;
    const preM8ExecutionFacts = { battle: currentCompleteGame!.battle, mission: preM8Mission };
    const preM8Report = createCoveredClosedPilotReportForTests(completeGameExecutableSessionFingerprintV1(preM8Base, preM8ExecutionFacts));
    const preM8Session: SessionSetup = {
      ...preM8Base,
      completeGame: createCompleteGameSessionSetupV1(preM8Report, preM8ExecutionFacts)
    };
    preM8V6.events[preM8SetupIndex] = { ...currentSetup, session: preM8Session };
    preM8V6.environment.completeGameSessionFingerprint = completeGameSessionFingerprint(preM8Session.completeGame!);
    preM8V6.environment.compatibilityReportFingerprint = preM8Session.completeGame!.compatibility.reportFingerprint;
    preM8V6.environment.manifestFingerprint = sessionCompatibilityFingerprint(preM8Session);
    const preM8Validation = validateSimulationSave(preM8V6);
    expect(preM8Validation.ok, preM8Validation.ok ? '' : preM8Validation.errors.join(' ')).toBe(true);
    expect(replayGameEvents(preM8V6.initialState, preM8V6.events).mission).toMatchObject({
      objectiveMarkers: [], objectiveControlEventIds: []
    });
  });

  it('keeps V1–V5 readable while refusing implicit promotion of a complete-game journal', () => {
    const legacy = setUp(session(), 'legacy-save');
    const creators = [createSimulationSave, createSimulationSaveV2, createSimulationSaveV3, createSimulationSaveV4, createSimulationSaveV5] as const;
    for (const create of creators) {
      const save = create(legacy.initial, legacy.state.eventLog, '2026-08-27T12:00:00.000Z');
      const serialized = serializeSimulationSave(save);
      expect(deserializeSimulationSave(serialized)).toEqual({ ok: true, save });
      const preV6 = JSON.parse(serialized) as { initialState: Record<string, unknown> };
      delete preV6.initialState.battle;
      delete preV6.initialState.mission;
      delete preV6.initialState.resolutionQueue;
      expect(deserializeSimulationSave(JSON.stringify(preV6))).toMatchObject({ ok: true, save: { schemaVersion: save.schemaVersion } });
    }

    const complete = setUp(session({ complete: true }), 'not-a-legacy-save');
    for (const create of creators) {
      expect(() => create(complete.initial, complete.state.eventLog, '2026-08-27T12:00:00.000Z')).toThrow('utilisez V6');
    }
  });

  it('rejects malformed compatibility metadata before consuming entropy', () => {
    const malformed = structuredClone(session({ complete: true })) as unknown as { completeGame: { compatibility: { reportFingerprint: string } } };
    malformed.completeGame.compatibility.reportFingerprint = '';
    const initial = createInitialGameState('malformed-complete-game', 123);
    const result = executeGameCommand(initial, { id: 'setup', actorId: 'p1', type: 'setup-session', session: malformed as unknown as SessionSetup });
    expect(result).toMatchObject({ accepted: false, state: initial, rejection: { code: 'invalid-complete-game-setup' } });
    expect(result.state.prng).toEqual(initial.prng);
  });

  it('rejects the real draft-blocked report and any incomplete compiled roster before mutation', () => {
    const currentReport = createCurrentClosedPilotReportForTests();
    expect(currentReport.compatible).toBe(false);
    const forgedBase = structuredClone(session({ complete: true }));
    const forged: SessionSetup = {
      ...forgedBase,
      models: [],
      units: [],
      completeGame: {
        ...forgedBase.completeGame!,
        compatibility: {
          status: 'compatible',
          reportVersion: currentReport.reportVersion,
          reportFingerprint: currentReport.canonicalFingerprint,
          coverageScope: currentReport.coverageScope,
          coverageVersion: currentReport.coverageVersion,
          report: currentReport
        }
      }
    };
    const currentInitial = createInitialGameState('current-incompatible-report', 456);
    const currentResult = executeGameCommand(currentInitial, { id: 'setup-current', actorId: forged.players[0].id, type: 'setup-session', session: forged });
    expect(currentResult).toMatchObject({ accepted: false, state: currentInitial, rejection: { code: 'invalid-complete-game-setup' } });
    expect(currentResult.state.prng).toEqual(currentInitial.prng);

    const incompleteBase = structuredClone(session({ complete: true }));
    const incomplete: SessionSetup = { ...incompleteBase, units: incompleteBase.units!.slice(1) };
    const incompleteInitial = createInitialGameState('incomplete-compatible-roster', 789);
    const incompleteResult = executeGameCommand(incompleteInitial, { id: 'setup-incomplete', actorId: incomplete.players[0].id, type: 'setup-session', session: incomplete });
    expect(incompleteResult).toMatchObject({ accepted: false, state: incompleteInitial, rejection: { code: 'invalid-complete-game-setup' } });
    expect(incompleteResult.state.prng).toEqual(incompleteInitial.prng);
  });

  it('binds all executable manifest, physical-profile, unit, weapon and source facts to the compatible report', () => {
    const mutations: Array<(candidate: SessionSetup) => SessionSetup> = [
      (candidate) => ({ ...candidate, manifest: { ...candidate.manifest, catalogFingerprint: 'invented-catalog' } }),
      (candidate) => ({ ...candidate, manifest: { ...candidate.manifest, rulePackFingerprint: 'invented-rules' } }),
      (candidate) => ({ ...candidate, shootingEnvironmentFingerprint: 'invented-environment' }),
      (candidate) => ({ ...candidate, models: [{ ...candidate.models[0], profileId: 'invented-profile' }, ...candidate.models.slice(1)] }),
      (candidate) => ({ ...candidate, units: [{ ...candidate.units![0], toughness: 99, save: 2, woundsPerModel: 99, keywords: ['INVENTED'] }, ...candidate.units!.slice(1)] }),
      (candidate) => ({ ...candidate, units: [{ ...candidate.units![0], weaponProfiles: [{ ...candidate.units![0].weaponProfiles[0], strength: 99, damage: 99 }] }, ...candidate.units!.slice(1)] }),
      (candidate) => ({ ...candidate, units: [{ ...candidate.units![0], sourceRefs: [{ sourceId: 'invented-source', version: '1', effectiveFrom: '2026-08-27' }] }, ...candidate.units!.slice(1)] }),
      (candidate) => ({ ...candidate, completeGame: { ...candidate.completeGame!, battle: { ...candidate.completeGame!.battle, maxBattleRounds: 99 } } }),
      (candidate) => ({ ...candidate, completeGame: { ...candidate.completeGame!, battle: { ...candidate.completeGame!.battle, playerIds: [...candidate.completeGame!.battle.playerIds].reverse() } } }),
      (candidate) => ({ ...candidate, completeGame: { ...candidate.completeGame!, battle: { ...candidate.completeGame!.battle, boardBounds: { ...candidate.completeGame!.battle.boardBounds, maxX: 99_999 } } } }),
      (candidate) => ({ ...candidate, completeGame: { ...candidate.completeGame!, battle: { ...candidate.completeGame!.battle, attackerPlayerId: candidate.completeGame!.battle.defenderPlayerId } } }),
      (candidate) => ({ ...candidate, completeGame: { ...candidate.completeGame!, battle: { ...candidate.completeGame!.battle, deploymentZones: candidate.completeGame!.battle.deploymentZones.map((zone, index) => index === 0 ? { ...zone, id: 'invented-zone' } : zone) } } }),
      (candidate) => ({ ...candidate, completeGame: { ...candidate.completeGame!, mission: { ...candidate.completeGame!.mission, objectiveMarkerIds: ['invented-objective'] } } }),
      (candidate) => ({ ...candidate, completeGame: { ...candidate.completeGame!, mission: { ...candidate.completeGame!.mission, objectiveMarkers: candidate.completeGame!.mission.objectiveMarkers!.map((marker) => ({ ...marker, diameter: 401 as 400 })) } } })
    ];
    for (const [index, mutate] of mutations.entries()) {
      const malformed = mutate(structuredClone(session({ complete: true })));
      const initial = createInitialGameState(`mismatched-executable-facts-${index}`, 1_000 + index);
      const result = executeGameCommand(initial, { id: `setup-${index}`, actorId: malformed.players[0].id, type: 'setup-session', session: malformed });
      expect(result).toMatchObject({ accepted: false, state: initial, rejection: { code: 'invalid-complete-game-setup' } });
      expect(result.state.prng).toEqual(initial.prng);
    }
  });

  it('binds V6 to the compiled mission and coverage version', () => {
    const mismatchedMission = session({ complete: true });
    const missionInitial = createInitialGameState('mismatched-mission', 1);
    expect(executeGameCommand(missionInitial, { id: 'setup', actorId: 'p1', type: 'setup-session', session: { ...mismatchedMission, manifest: { ...mismatchedMission.manifest, scenarioId: 'another-mission' } } })).toMatchObject({ accepted: false, state: missionInitial, rejection: { code: 'invalid-complete-game-setup' } });

    const mismatchedCoverage = session({ complete: true });
    const coverageInitial = createInitialGameState('mismatched-coverage', 2);
    expect(executeGameCommand(coverageInitial, { id: 'setup', actorId: 'p1', type: 'setup-session', session: { ...mismatchedCoverage, manifest: { ...mismatchedCoverage.manifest, coverageVersion: 'another-coverage' } } })).toMatchObject({ accepted: false, state: coverageInitial, rejection: { code: 'invalid-complete-game-setup' } });

    const mismatchedFingerprint = session({ complete: true });
    const fingerprintInitial = createInitialGameState('mismatched-fingerprint', 3);
    expect(executeGameCommand(fingerprintInitial, { id: 'setup', actorId: 'p1', type: 'setup-session', session: { ...mismatchedFingerprint, manifest: { ...mismatchedFingerprint.manifest, scenarioFingerprint: 'another-fingerprint' } } })).toMatchObject({ accepted: false, state: fingerprintInitial, rejection: { code: 'invalid-complete-game-setup' } });
  });

  it('keeps resolution windows immutable, FIFO and free of untyped effects', () => {
    const initial = createResolutionQueueV1();
    const first = { id: 'window-a', kind: 'phase-start' as const, ownerPlayerId: 'p1', sourceRuleIds: ['rule-a'], openedByEventId: 'event-a' };
    const second = { id: 'window-b', kind: 'reaction' as const, ownerPlayerId: 'p2', sourceRuleIds: ['rule-b'], openedByEventId: 'event-b' };
    const queued = enqueueResolutionV1(enqueueResolutionV1(initial, first), second);
    expect(initial.entries).toEqual([]);
    expect(queued.entries.map((entry) => entry.id)).toEqual(['window-a', 'window-b']);
    const active = activateNextResolutionV1(queued);
    expect(active.activeEntryId).toBe('window-a');
    expect(() => resolveActiveResolutionV1(active, 'window-b')).toThrow('not the active FIFO entry');
    const resolved = resolveActiveResolutionV1(active, 'window-a');
    expect(resolved).toMatchObject({ activeEntryId: null, resolvedEntryIds: ['window-a'], entries: [second] });
    expect(activateNextResolutionV1(resolved).activeEntryId).toBe('window-b');
    expect(() => enqueueResolutionV1(resolved, first)).toThrow('already exists');
    expect(() => activateNextResolutionV1({ ...queued, activeEntryId: 'window-b' })).toThrow('queue is malformed');
    const freeEffect = { ...first, effect: { kind: 'modify-score', amount: 99 } } as unknown as ResolutionQueueEntryV1;
    expect(() => enqueueResolutionV1(initial, freeEffect)).toThrow('entry is malformed');
    const unknownKind = { ...first, kind: 'free-effect' } as unknown as ResolutionQueueEntryV1;
    expect(() => enqueueResolutionV1(initial, unknownKind)).toThrow('entry is malformed');
  });
});
