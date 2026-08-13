import { describe, expect, it } from 'vitest';
import {
  createInitialGameState,
  executeGameCommand,
  sessionCompatibilityFingerprint,
  type GameState,
  type GameCommand,
  type SessionSetup
} from '../domain';
import { CORE_BASIC_RANGED_ATTACK_SOURCE, CORE_BENEFIT_OF_COVER_SOURCE } from '../rules';
import { createShootingEnvironment, executeBasicShootingCommand } from '../orchestration/shooting';
import {
  InMemorySimulationStorageAdapter,
  SimulationAutosaveController,
  createSimulationAutosave,
  exportSimulation,
  importSimulation,
  validateSimulationAutosave
} from './index';

function session(): SessionSetup {
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

function accepted(state: ReturnType<typeof createInitialGameState>, command: GameCommand) {
  const result = executeGameCommand(state, command);
  if (!result.accepted) throw new Error(result.rejection.message);
  return result.state;
}

function playedGame() {
  const initial = createInitialGameState('persisted-game', 99);
  let state = accepted(initial, { id: 'setup', actorId: 'p1', type: 'setup-session', session: session() });
  state = accepted(state, { id: 'roll', actorId: 'p1', type: 'roll-dice', rollId: 'advance', sides: 6, count: 2, reason: 'Advance' });
  return { initial, state };
}

function playedShootingGame() {
  const rifle = { id: 'rifle', displayName: 'Rifle', range: 6_096, attacks: 2, ballisticSkill: 3, strength: 4, armourPenetration: -1, damage: 1, sourceRefs: [CORE_BASIC_RANGED_ATTACK_SOURCE] } as const;
  const environment = createShootingEnvironment({
    physicalProfiles: {
      infantry: {
        schemaVersion: 'warforge-simulator/v1', id: 'infantry', displayName: 'Infantry', baseShape: { kind: 'circle', radius: 160 }, height: 400,
        visibilityPoints: [{ x: 0, y: 0, z: 320 }], source: { sourceId: 'geometry', version: '1', effectiveFrom: '2026-08-13' }
      }
    },
    weaponProfiles: { rifle },
    terrainZones: [],
    coverRules: [{
      id: 'core.benefit-of-cover', source: CORE_BENEFIT_OF_COVER_SOURCE, ballisticSkillPenalty: 1,
      branches: [{ kind: 'inside-terrain-zone', qualifyingKeywords: ['INFANTRY', 'BEAST', 'SWARM'] }, { kind: 'not-entirely-visible-due-to-terrain' }]
    }]
  });
  const shootingSession: SessionSetup = {
    ...session(),
    shootingEnvironmentFingerprint: environment.fingerprint,
    models: [
      { id: 'red-1', playerId: 'p1', profileId: 'infantry', position: { x: 0, y: 0 }, orientationDegrees: 0 },
      { id: 'blue-1', playerId: 'p2', profileId: 'infantry', position: { x: 4_000, y: 0 }, orientationDegrees: 180 }
    ],
    units: [
      { id: 'red', fixtureId: 'fixture-red', playerId: 'p1', modelIds: ['red-1'], keywords: ['INFANTRY'], toughness: 4, save: 3, woundsPerModel: 2, weaponProfiles: [rifle], weaponAssignments: [{ modelId: 'red-1', weaponProfileId: 'rifle', quantity: 1 }], sourceRefs: [CORE_BASIC_RANGED_ATTACK_SOURCE] },
      { id: 'blue', fixtureId: 'fixture-blue', playerId: 'p2', modelIds: ['blue-1'], keywords: ['INFANTRY'], toughness: 4, save: 3, woundsPerModel: 2, weaponProfiles: [rifle], weaponAssignments: [{ modelId: 'blue-1', weaponProfileId: 'rifle', quantity: 1 }], sourceRefs: [CORE_BASIC_RANGED_ATTACK_SOURCE] }
    ]
  };
  const initial = createInitialGameState('persisted-shooting-game', 0x57465247);
  let state: GameState = accepted(initial, { id: 'setup-shoot', actorId: 'p1', type: 'setup-session', session: shootingSession });
  state = accepted(state, { id: 'phase-command', actorId: 'p1', type: 'transition-phase', nextPhase: 'command' });
  state = accepted(state, { id: 'phase-movement', actorId: 'p1', type: 'transition-phase', nextPhase: 'movement' });
  state = accepted(state, { id: 'phase-shooting', actorId: 'p1', type: 'transition-phase', nextPhase: 'shooting' });
  const shot = executeBasicShootingCommand(state, { id: 'shot', actorId: 'p1', type: 'resolve-basic-shooting', attackerUnitId: 'red', targetUnitId: 'blue', weaponProfileId: 'rifle' }, environment);
  if (!shot.accepted) throw new Error(shot.rejection.message);
  return { initial, state: shot.state, environment, expectedManifestFingerprint: sessionCompatibilityFingerprint(shootingSession) };
}

describe('simulator persistence', () => {
  it('autosaves an independently validated snapshot and event log through an injectable adapter', async () => {
    const { initial, state } = playedGame();
    const storage = new InMemorySimulationStorageAdapter();
    const controller = new SimulationAutosaveController(storage, () => '2026-08-13T12:30:00.000Z');

    const autosave = await controller.autosave(initial, state);
    expect(autosave.savedAt).toBe('2026-08-13T12:30:00.000Z');
    expect(autosave.save.events).toEqual(state.eventLog);
    expect(autosave.snapshot).toEqual(state);

    const restored = await controller.restore(state.gameId);
    expect(restored).toMatchObject({ ok: true, state });

    await controller.remove(state.gameId);
    expect(await controller.restore(state.gameId)).toBeNull();
  });

  it('rejects an autosave whose stored snapshot does not match a deterministic replay', () => {
    const { initial, state } = playedGame();
    const autosave = createSimulationAutosave(initial, state, '2026-08-13T12:30:00.000Z');
    const corrupted = { ...structuredClone(autosave), snapshot: { ...autosave.snapshot, round: 123 } };

    expect(validateSimulationAutosave(corrupted)).toMatchObject({ ok: false, errors: ['Le snapshot ne correspond pas au replay du journal.'] });
  });

  it('exports, imports and restores a replay-only save through serialization guards', () => {
    const { initial, state } = playedGame();
    const exported = exportSimulation(initial, state, '2026-08-13T12:30:00.000Z');
    const imported = importSimulation(exported);

    expect(imported).toMatchObject({ ok: true, state });
    expect(importSimulation('{invalid json}')).toMatchObject({ ok: false });
    expect(importSimulation(exported.replace('warforge-simulation-save/v1', 'warforge-simulation-save/v99'))).toMatchObject({ ok: false });
  });

  it('requires the trusted environment for shooting export/import/autosave and rejects forged geometry', async () => {
    const { initial, state, environment, expectedManifestFingerprint } = playedShootingGame();
    expect(() => exportSimulation(initial, state, '2026-08-13T12:30:00.000Z')).toThrow('vérificateur spatial');
    const exported = exportSimulation(initial, state, '2026-08-13T12:30:00.000Z', environment);
    const parsedExport = JSON.parse(exported);
    expect(parsedExport.environment.scenarioId).toBe('test-scenario');
    const forgedScenario = structuredClone(parsedExport);
    forgedScenario.environment.scenarioId = 'forged-scenario';
    expect(importSimulation(JSON.stringify(forgedScenario), environment, expectedManifestFingerprint)).toMatchObject({ ok: false, errors: [expect.stringContaining('session ferm') ] });
    const forgedManifest = structuredClone(parsedExport);
    forgedManifest.environment.manifestFingerprint = 'arbitrary-nonempty';
    expect(importSimulation(JSON.stringify(forgedManifest), environment, expectedManifestFingerprint)).toMatchObject({ ok: false, errors: [expect.stringContaining('session ferm') ] });
    const selfConsistentButWrongSession = structuredClone(parsedExport);
    const setupEvent = selfConsistentButWrongSession.events.find((event: { type: string }) => event.type === 'session-setup');
    setupEvent.session.units[0].fixtureId = 'arbitrary-catalog-unit';
    selfConsistentButWrongSession.environment.manifestFingerprint = sessionCompatibilityFingerprint(setupEvent.session);
    expect(importSimulation(JSON.stringify(selfConsistentButWrongSession), environment, expectedManifestFingerprint)).toMatchObject({ ok: false, errors: [expect.stringContaining('manifeste de session fermée attendu')] });
    expect(importSimulation(exported)).toMatchObject({ ok: false, errors: [expect.stringContaining('vérificateur spatial')] });
    expect(importSimulation(exported, environment, expectedManifestFingerprint)).toMatchObject({ ok: true, state });
    const forged = exported.replace('"edgeToEdgeDistance":3680', '"edgeToEdgeDistance":3681');
    expect(importSimulation(forged, environment, expectedManifestFingerprint)).toMatchObject({ ok: false, errors: [expect.stringContaining('spatial verification')] });

    const storage = new InMemorySimulationStorageAdapter();
    const controller = new SimulationAutosaveController(storage, () => '2026-08-13T12:30:00.000Z', environment, expectedManifestFingerprint);
    const autosave = await controller.autosave(initial, state);
    expect(await controller.restore(state.gameId)).toMatchObject({ ok: true, state });
    await storage.write({ ...structuredClone(autosave), save: forgedManifest });
    expect(await controller.restore(state.gameId)).toMatchObject({ ok: false, errors: [expect.stringContaining('session ferm')] });
    await storage.write({ ...structuredClone(autosave), save: forgedScenario });
    expect(await controller.restore(state.gameId)).toMatchObject({ ok: false, errors: [expect.stringContaining('session ferm')] });
    await storage.write({ ...structuredClone(autosave), save: selfConsistentButWrongSession });
    expect(await controller.restore(state.gameId)).toMatchObject({ ok: false, errors: [expect.stringContaining('session fermée attendue')] });
    await storage.write(autosave);
    const untrustedController = new SimulationAutosaveController(storage, () => '2026-08-13T12:30:00.000Z');
    expect(await untrustedController.restore(state.gameId)).toMatchObject({ ok: false, errors: [expect.stringContaining('vérificateur spatial')] });
  });
});
