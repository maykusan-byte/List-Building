import { describe, expect, it } from 'vitest';
import {
  createInitialGameState,
  createSimulationSaveV2,
  createSimulationSaveV3,
  executeGameCommand,
  rollDice,
  sessionCompatibilityFingerprint,
  validateSimulationSave,
  type GameState,
  type GameCommand,
  type ExtendedDefenceFixtureV1,
  type SessionSetup,
  type WeaponProfileV1
} from '../domain';
import { CORE_BASIC_RANGED_ATTACK_SOURCE, CORE_BENEFIT_OF_COVER_SOURCE, CORE_CHARACTERISTIC_TESTS_SOURCE, CORE_HAZARDOUS_SOURCE, CORE_LETHAL_HITS_SOURCE, CORE_ONE_SHOT_SOURCE, CORE_TWIN_LINKED_SOURCE } from '../rules';
import { createShootingEnvironment, createShootingReplayVerifier, executeBasicShootingCommand, executeExtendedAllocationDecisionCommand, executeGenericRerollDecisionCommand, executeLethalHitsDecisionCommand, type ShootingTerrainZone } from '../orchestration/shooting';
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

function playedShootingGame(options: { readonly weapon?: WeaponProfileV1; readonly seed?: number; readonly extendedDefence?: Readonly<Record<string, ExtendedDefenceFixtureV1>>; readonly attackerExtendedDefence?: Readonly<Record<string, ExtendedDefenceFixtureV1>>; readonly attackerWounds?: Readonly<Record<string, number>>; readonly attackerKeywords?: readonly string[]; readonly terrainZones?: readonly ShootingTerrainZone[]; readonly extraAttackerModel?: boolean; readonly extraDefenderModel?: boolean } = {}) {
  const rifle: WeaponProfileV1 = options.weapon ?? { id: 'rifle', displayName: 'Rifle', range: 6_096, attacks: 2, ballisticSkill: 3, strength: 4, armourPenetration: -1, damage: 1, sourceRefs: [CORE_BASIC_RANGED_ATTACK_SOURCE] };
  const environment = createShootingEnvironment({
    physicalProfiles: {
      infantry: {
        schemaVersion: 'warforge-simulator/v1', id: 'infantry', displayName: 'Infantry', baseShape: { kind: 'circle', radius: 160 }, height: 400,
        visibilityPoints: [{ x: 0, y: 0, z: 320 }], source: { sourceId: 'geometry', version: '1', effectiveFrom: '2026-08-13' }
      }
    },
    weaponProfiles: { [rifle.id]: rifle },
    terrainZones: options.terrainZones ?? [],
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
      ...(options.extraAttackerModel ? [{ id: 'red-2', playerId: 'p1', profileId: 'infantry', position: { x: 0, y: 500 }, orientationDegrees: 0 }] : []),
      { id: 'blue-1', playerId: 'p2', profileId: 'infantry', position: { x: 4_000, y: 0 }, orientationDegrees: 180 },
      ...(options.extraDefenderModel ? [{ id: 'blue-2', playerId: 'p2', profileId: 'infantry', position: { x: 4_000, y: 500 }, orientationDegrees: 180 }] : [])
    ],
    units: [
      { id: 'red', fixtureId: 'fixture-red', playerId: 'p1', modelIds: ['red-1', ...(options.extraAttackerModel ? ['red-2'] : [])], keywords: options.attackerKeywords ?? ['INFANTRY'], toughness: 4, save: 3, woundsPerModel: 2, weaponProfiles: [rifle], weaponAssignments: [{ modelId: 'red-1', weaponProfileId: rifle.id, quantity: 1 }], ...(options.attackerExtendedDefence === undefined ? {} : { extendedDefence: options.attackerExtendedDefence }), sourceRefs: [CORE_BASIC_RANGED_ATTACK_SOURCE] },
      { id: 'blue', fixtureId: 'fixture-blue', playerId: 'p2', modelIds: ['blue-1', ...(options.extraDefenderModel ? ['blue-2'] : [])], keywords: ['INFANTRY'], toughness: 4, save: 3, woundsPerModel: 2, weaponProfiles: [rifle], weaponAssignments: [{ modelId: 'blue-1', weaponProfileId: rifle.id, quantity: 1 }], ...(options.extendedDefence === undefined ? {} : { extendedDefence: options.extendedDefence }), sourceRefs: [CORE_BASIC_RANGED_ATTACK_SOURCE] }
    ]
  };
  const initial = createInitialGameState('persisted-shooting-game', options.seed ?? 0x57465247);
  let state: GameState = accepted(initial, { id: 'setup-shoot', actorId: 'p1', type: 'setup-session', session: shootingSession });
  state = accepted(state, { id: 'phase-command', actorId: 'p1', type: 'transition-phase', nextPhase: 'command' });
  state = accepted(state, { id: 'phase-movement', actorId: 'p1', type: 'transition-phase', nextPhase: 'movement' });
  state = accepted(state, { id: 'phase-shooting', actorId: 'p1', type: 'transition-phase', nextPhase: 'shooting' });
  if (options.attackerWounds !== undefined) {
    const red = state.units.red;
    state = {
      ...state,
      units: {
        ...state.units,
        red: {
          ...red,
          models: red.models.map((model) => options.attackerWounds?.[model.id] === undefined ? model : { ...model, wounds: options.attackerWounds[model.id] })
        }
      }
    };
  }
  const shot = executeBasicShootingCommand(state, { id: 'shot', actorId: 'p1', type: 'resolve-basic-shooting', attackerUnitId: 'red', targetUnitId: 'blue', weaponProfileId: rifle.id }, environment);
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

  it('exports, imports and autosaves V3 while a lethal choice is pending and after completion', () => {
    const lethalWeapon: WeaponProfileV1 = {
      id: 'lethal-rifle', displayName: 'Lethal Rifle', range: 6_096, attacks: 3, ballisticSkill: 2, strength: 1, armourPenetration: -6, damage: 1,
      weaponKeywords: [{ kind: 'lethal-hits', source: CORE_LETHAL_HITS_SOURCE }], sourceRefs: [CORE_BASIC_RANGED_ATTACK_SOURCE]
    };
    const seed = (() => {
      for (let candidate = 0; candidate < 100_000; candidate += 1) {
        if (rollDice(createInitialGameState('persistence-lethal-seed', candidate).prng, 6, 3).results.filter((roll) => roll === 6).length === 2) return candidate;
      }
      throw new Error('No suitable lethal persistence seed.');
    })();
    const pending = playedShootingGame({ weapon: lethalWeapon, seed });
    expect(pending.state.pendingLethalShooting).not.toBeNull();
    const pendingExport = exportSimulation(pending.initial, pending.state, '2026-08-24T12:00:00.000Z', pending.environment);
    expect(JSON.parse(pendingExport).schemaVersion).toBe('warforge-simulation-save/v3');
    expect(importSimulation(pendingExport, pending.environment, pending.expectedManifestFingerprint)).toMatchObject({ ok: true, state: pending.state });
    const pendingAutosave = createSimulationAutosave(pending.initial, pending.state, '2026-08-24T12:00:00.000Z', pending.environment);
    expect(validateSimulationAutosave(pendingAutosave, pending.environment, pending.expectedManifestFingerprint)).toMatchObject({ ok: true, state: pending.state });
    expect(() => createSimulationSaveV2(pending.initial, pending.state.eventLog, '2026-08-24T12:00:00.000Z', createShootingReplayVerifier(pending.environment))).toThrow('utilisez V3');

    const firstDecision = pending.state.pendingDecisions[0];
    const first = executeLethalHitsDecisionCommand(pending.state, { id: 'choice-one', actorId: 'p1', type: 'resolve-decision', decisionId: firstDecision.id, optionId: 'auto-wound' }, pending.environment);
    if (!first.accepted) throw new Error(first.rejection.message);
    const secondDecision = first.state.pendingDecisions[0];
    const final = executeLethalHitsDecisionCommand(first.state, { id: 'choice-two', actorId: 'p1', type: 'resolve-decision', decisionId: secondDecision.id, optionId: 'roll-to-wound' }, pending.environment);
    if (!final.accepted) throw new Error(final.rejection.message);
    const finalExport = exportSimulation(pending.initial, final.state, '2026-08-24T12:00:00.000Z', pending.environment);
    expect(importSimulation(finalExport, pending.environment, pending.expectedManifestFingerprint)).toMatchObject({ ok: true, state: final.state });
    const v3 = JSON.parse(finalExport);
    const unversionedEvents = v3.events.filter((event: { readonly type: string }) => ![
      'basic-shooting-hit-stage-resolved',
      'basic-shooting-lethal-choice-resolved',
      'basic-shooting-completed'
    ].includes(event.type));
    for (const interruptedEvent of v3.events.filter((event: { readonly type: string }) => [
      'basic-shooting-hit-stage-resolved',
      'basic-shooting-lethal-choice-resolved',
      'basic-shooting-completed'
    ].includes(event.type))) {
      const forgedV2 = { ...v3, schemaVersion: 'warforge-simulation-save/v2', events: [...unversionedEvents, interruptedEvent] };
      expect(validateSimulationSave(forgedV2)).toMatchObject({ ok: false, errors: [expect.stringContaining('utilisez V3')] });
      expect(importSimulation(JSON.stringify(forgedV2), pending.environment, pending.expectedManifestFingerprint)).toMatchObject({ ok: false, errors: [expect.stringContaining('utilisez V3')] });
    }
  });

  it('exports, imports and autosaves V3 while a [JUMELÉ] reroll choice is pending', () => {
    const twinLinkedWeapon: WeaponProfileV1 = {
      id: 'twin-linked-rifle', displayName: 'Twin-linked Rifle', range: 6_096, attacks: 1, ballisticSkill: 2, strength: 1, armourPenetration: -6, damage: 1,
      weaponKeywords: [{ kind: 'twin-linked', source: CORE_TWIN_LINKED_SOURCE }], sourceRefs: [CORE_BASIC_RANGED_ATTACK_SOURCE]
    };
    const seed = (() => {
      for (let candidate = 0; candidate < 100_000; candidate += 1) {
        const dice = rollDice(createInitialGameState('persistence-reroll-seed', candidate).prng, 6, 2).results;
        if (dice[0] === 2 && dice[1] === 1) return candidate;
      }
      throw new Error('No suitable [JUMELÉ] persistence seed.');
    })();
    const pending = playedShootingGame({ weapon: twinLinkedWeapon, seed });
    expect(pending.state.pendingLethalShooting).toBeNull();
    expect(pending.state.pendingRerollShooting).toMatchObject({ stage: 'wound', choices: [] });
    const pendingExport = exportSimulation(pending.initial, pending.state, '2026-08-24T12:00:00.000Z', pending.environment);
    expect(JSON.parse(pendingExport).schemaVersion).toBe('warforge-simulation-save/v3');
    expect(importSimulation(pendingExport, pending.environment, pending.expectedManifestFingerprint)).toMatchObject({ ok: true, state: pending.state });
    const pendingAutosave = createSimulationAutosave(pending.initial, pending.state, '2026-08-24T12:00:00.000Z', pending.environment);
    expect(pendingAutosave.save.schemaVersion).toBe('warforge-simulation-save/v3');
    expect(validateSimulationAutosave(pendingAutosave, pending.environment, pending.expectedManifestFingerprint)).toMatchObject({ ok: true, state: pending.state });
    expect(() => createSimulationSaveV2(pending.initial, pending.state.eventLog, '2026-08-24T12:00:00.000Z', createShootingReplayVerifier(pending.environment))).toThrow('utilisez V3');

    const decision = pending.state.pendingDecisions[0];
    const completed = executeGenericRerollDecisionCommand(pending.state, { id: 'reroll-choice', actorId: 'p1', type: 'resolve-decision', decisionId: decision.id, optionId: 'reroll' }, pending.environment);
    if (!completed.accepted) throw new Error(completed.rejection.message);
    const finalExport = exportSimulation(pending.initial, completed.state, '2026-08-24T12:00:00.000Z', pending.environment);
    expect(JSON.parse(finalExport).schemaVersion).toBe('warforge-simulation-save/v3');
    expect(importSimulation(finalExport, pending.environment, pending.expectedManifestFingerprint)).toMatchObject({ ok: true, state: completed.state });
  });

  it('uses V4, with the same closed-environment checks, as soon as a fixture materializes extended defence', () => {
    const extendedDefence = {
      'blue-1': { invulnerableSave: 4 as const, feelNoPain: 5 as const, allocationGroupId: 'blue-group', source: CORE_CHARACTERISTIC_TESTS_SOURCE }
    };
    const { initial, state, environment, expectedManifestFingerprint } = playedShootingGame({ extendedDefence });
    const exported = exportSimulation(initial, state, '2026-08-24T12:00:00.000Z', environment);

    expect(JSON.parse(exported).schemaVersion).toBe('warforge-simulation-save/v4');
    expect(importSimulation(exported, environment, expectedManifestFingerprint)).toMatchObject({ ok: true, state });
    const autosave = createSimulationAutosave(initial, state, '2026-08-24T12:00:00.000Z', environment);
    expect(autosave.save.schemaVersion).toBe('warforge-simulation-save/v4');
    expect(validateSimulationAutosave(autosave, environment, expectedManifestFingerprint)).toMatchObject({ ok: true, state });
    expect(() => createSimulationSaveV3(initial, state.eventLog, '2026-08-24T12:00:00.000Z', createShootingReplayVerifier(environment))).toThrow('utilisez V4');
    const forgedDefence = JSON.parse(exported);
    const setup = forgedDefence.events.find((event: { readonly type: string }) => event.type === 'session-setup');
    setup.session.units[1].extendedDefence['blue-1'].invulnerableSave = 5;
    forgedDefence.environment.manifestFingerprint = sessionCompatibilityFingerprint(setup.session);
    expect(importSimulation(JSON.stringify(forgedDefence), environment, expectedManifestFingerprint)).toMatchObject({ ok: false, errors: [expect.stringContaining('manifeste de session fermée attendu')] });
  });

  it('marks [TIR UNIQUE] by physical instance before rolling, persists it in V4, and refuses reuse before PRNG', () => {
    const oneShot: WeaponProfileV1 = {
      id: 'one-shot-rifle', displayName: 'One Shot Rifle', range: 6_096, attacks: 1, ballisticSkill: 6, strength: 4, armourPenetration: 0, damage: 1,
      weaponKeywords: [{ kind: 'one-shot', source: CORE_ONE_SHOT_SOURCE }], sourceRefs: [CORE_BASIC_RANGED_ATTACK_SOURCE]
    };
    const extendedDefence = { 'blue-1': { allocationGroupId: 'blue-group', source: CORE_CHARACTERISTIC_TESTS_SOURCE } };
    const { initial, state: fired, environment, expectedManifestFingerprint } = playedShootingGame({ weapon: oneShot, seed: 0, extendedDefence });
    expect(fired.spentOneShotWeaponInstanceKeys).toEqual(['red:red-1:one-shot-rifle:0']);
    expect(fired.eventLog.map((event) => event.type)).toContain('extended-shooting-one-shot-selected');
    const exported = exportSimulation(initial, fired, '2026-08-24T12:00:00.000Z', environment);
    expect(importSimulation(exported, environment, expectedManifestFingerprint)).toMatchObject({ ok: true, state: fired });

    let nextShooting = fired;
    for (const [id, nextPhase] of [['charge', 'charge'], ['fight', 'fight'], ['command', 'command'], ['movement', 'movement'], ['shooting', 'shooting']] as const) {
      nextShooting = accepted(nextShooting, { id: `one-shot-${id}`, actorId: 'p1', type: 'transition-phase', nextPhase });
    }
    const retry = executeBasicShootingCommand(nextShooting, { id: 'one-shot-retry', actorId: 'p1', type: 'resolve-basic-shooting', attackerUnitId: 'red', targetUnitId: 'blue', weaponProfileId: oneShot.id }, environment);
    expect(retry).toMatchObject({ accepted: false, rejection: { code: 'one-shot-already-used' }, state: nextShooting });
    expect(retry.state.prng).toEqual(nextShooting.prng);
  });

  it('rolls all saves before the legal defender-model allocation and verifies the V4 continuation', () => {
    const seed = (() => {
      for (let candidate = 0; candidate < 10_000; candidate += 1) {
        const rolls = rollDice(createInitialGameState('extended-allocation-seed', candidate).prng, 6, 2).results;
        if (rolls[0] >= 2 && rolls[1] >= 4) return candidate;
      }
      throw new Error('No deterministic extended-allocation seed.');
    })();
    const extendedDefence = { 'blue-1': { allocationGroupId: 'blue-group', source: CORE_CHARACTERISTIC_TESTS_SOURCE } };
    const pending = playedShootingGame({ weapon: { id: 'allocation-rifle', displayName: 'Allocation Rifle', range: 6_096, attacks: 1, ballisticSkill: 2, strength: 4, armourPenetration: -4, damage: 1, sourceRefs: [CORE_BASIC_RANGED_ATTACK_SOURCE] }, seed, extendedDefence });
    expect(pending.state.pendingExtendedShooting).toMatchObject({ resolvedPacketCount: 0, packets: [{ kind: 'normal' }] });
    expect(pending.state.eventLog.map((event) => event.type)).toContain('extended-shooting-save-stage-resolved');
    const modelDecision = pending.state.pendingDecisions[0];
    const model = executeExtendedAllocationDecisionCommand(pending.state, { id: 'allocation-model', actorId: 'p2', type: 'resolve-decision', decisionId: modelDecision.id, optionId: 'blue-1' }, pending.environment);
    expect(model).toMatchObject({ accepted: true, events: expect.arrayContaining([expect.objectContaining({ type: 'extended-shooting-packet-resolved' }), expect.objectContaining({ type: 'extended-shooting-completed' })]) });
    if (!model.accepted) throw new Error(model.rejection.message);
    const exported = exportSimulation(pending.initial, model.state, '2026-08-24T12:00:00.000Z', pending.environment);
    expect(importSimulation(exported, pending.environment, pending.expectedManifestFingerprint)).toMatchObject({ ok: true, state: model.state });
    const forged = JSON.parse(exported);
    const packet = forged.events.find((event: { readonly type: string }) => event.type === 'extended-shooting-packet-resolved');
    packet.modelId = 'forged-model';
    expect(importSimulation(JSON.stringify(forged), pending.environment, pending.expectedManifestFingerprint)).toMatchObject({ ok: false, errors: [expect.stringContaining('trusted verification')] });
  });

  it('announces one legal group, rolls every save, then resolves failed saves in ascending-roll order', () => {
    const seed = (() => {
      for (let candidate = 0; candidate < 10_000; candidate += 1) {
        const rolls = rollDice(createInitialGameState('group-order-seed', candidate).prng, 6, 6).results;
        if (rolls[0] >= 2 && rolls[1] >= 2 && rolls[2] >= 4 && rolls[3] >= 4 && rolls[4] < 6 && rolls[5] < 6) return candidate;
      }
      throw new Error('No deterministic group-order seed.');
    })();
    const weapon: WeaponProfileV1 = {
      id: 'group-order-rifle', displayName: 'Group Order Rifle', range: 6_096, attacks: 2, ballisticSkill: 2, strength: 4, armourPenetration: -4, damage: 2,
      sourceRefs: [CORE_BASIC_RANGED_ATTACK_SOURCE]
    };
    const extendedDefence = {
      'blue-1': { allocationGroupId: 'blue-a', invulnerableSave: 6 as const, feelNoPain: 5 as const, source: CORE_CHARACTERISTIC_TESTS_SOURCE },
      'blue-2': { allocationGroupId: 'blue-b', source: CORE_CHARACTERISTIC_TESTS_SOURCE }
    };
    const pending = playedShootingGame({ weapon, seed, extendedDefence, extraDefenderModel: true });
    const groupDecision = pending.state.pendingDecisions[0];
    expect(groupDecision).toMatchObject({ kind: 'extended-allocation-group', playerId: 'p2' });
    expect(groupDecision.options.map((option) => option.id)).toEqual(['blue-a', 'blue-b']);

    const announced = executeExtendedAllocationDecisionCommand(pending.state, { id: 'announce-group', actorId: 'p2', type: 'resolve-decision', decisionId: groupDecision.id, optionId: 'blue-b' }, pending.environment);
    expect(announced).toMatchObject({ accepted: true, events: [expect.objectContaining({ type: 'extended-shooting-allocation-choice-resolved' }), expect.objectContaining({ type: 'decision-requested' })] });
    if (!announced.accepted) throw new Error(announced.rejection.message);
    const remainingGroup = announced.state.pendingDecisions[0];
    const ordered = executeExtendedAllocationDecisionCommand(announced.state, { id: 'announce-next-group', actorId: 'p2', type: 'resolve-decision', decisionId: remainingGroup.id, optionId: 'blue-a' }, pending.environment);
    expect(ordered).toMatchObject({ accepted: true });
    if (!ordered.accepted) throw new Error(ordered.rejection.message);
    const saveStage = ordered.events.find((event) => event.type === 'extended-shooting-save-stage-resolved');
    expect(saveStage).toBeDefined();
    if (!saveStage || saveStage.type !== 'extended-shooting-save-stage-resolved') throw new Error('Missing save stage.');
    expect(saveStage.saveRolls).toHaveLength(2);
    expect(saveStage.packetIndexOrder).toEqual([...saveStage.saveRolls]
      .sort((left, right) => left.roll - right.roll || left.packetIndex - right.packetIndex)
      .map((save) => save.packetIndex));
    expect(ordered.events.map((event) => event.type)).toEqual([
      'extended-shooting-allocation-choice-resolved',
      'extended-shooting-save-stage-resolved',
      'extended-shooting-save-resolved',
      'decision-requested'
    ]);
    expect(ordered.state.pendingExtendedShooting).toMatchObject({ selectedGroupId: 'blue-b', groupPlan: ['blue-b', 'blue-a'], stage: 'model-allocation', awaitingAllocationPacketIndex: expect.any(Number) });

    const firstModelDecision = ordered.state.pendingDecisions[0];
    const firstDamage = executeExtendedAllocationDecisionCommand(ordered.state, { id: 'destroy-first-group', actorId: 'p2', type: 'resolve-decision', decisionId: firstModelDecision.id, optionId: 'blue-2' }, pending.environment);
    expect(firstDamage).toMatchObject({ accepted: true });
    if (!firstDamage.accepted) throw new Error(firstDamage.rejection.message);
    expect(firstDamage.events.find((event) => event.type === 'extended-shooting-packet-resolved')).toMatchObject({ modelId: 'blue-2', modelAfter: { active: false } });
    expect(firstDamage.events.find((event) => event.type === 'extended-shooting-save-resolved')).toMatchObject({ groupId: 'blue-a' });
    expect(firstDamage.state.pendingDecisions[0]?.options.map((option) => option.id)).toEqual(['blue-1']);
    const secondDamage = executeExtendedAllocationDecisionCommand(firstDamage.state, { id: 'allocate-next-group', actorId: 'p2', type: 'resolve-decision', decisionId: firstDamage.state.pendingDecisions[0].id, optionId: 'blue-1' }, pending.environment);
    expect(secondDamage).toMatchObject({ accepted: true, events: expect.arrayContaining([expect.objectContaining({ type: 'extended-shooting-packet-resolved', modelId: 'blue-1' }), expect.objectContaining({ type: 'extended-shooting-completed' })]) });
    if (!secondDamage.accepted) throw new Error(secondDamage.rejection.message);
    const exported = exportSimulation(pending.initial, secondDamage.state, '2026-08-24T12:00:00.000Z', pending.environment);
    expect(importSimulation(exported, pending.environment, pending.expectedManifestFingerprint)).toMatchObject({ ok: true, state: secondDamage.state });
    const forged = JSON.parse(exported);
    const secondSave = forged.events.filter((event: { readonly type: string }) => event.type === 'extended-shooting-save-resolved')[1];
    secondSave.groupId = 'blue-b';
    expect(importSimulation(JSON.stringify(forged), pending.environment, pending.expectedManifestFingerprint)).toMatchObject({ ok: false, errors: [expect.stringContaining('trusted verification')] });
  });

  it('journals excess failed attacks as lost when the final target model is destroyed', () => {
    const seed = (() => {
      for (let candidate = 0; candidate < 10_000; candidate += 1) {
        const rolls = rollDice(createInitialGameState('lost-target-seed', candidate).prng, 6, 4).results;
        if (rolls[0] >= 2 && rolls[1] >= 2 && rolls[2] >= 4 && rolls[3] >= 4) return candidate;
      }
      throw new Error('No deterministic lost-target seed.');
    })();
    const weapon: WeaponProfileV1 = {
      id: 'lost-target-rifle', displayName: 'Lost Target Rifle', range: 6_096, attacks: 2, ballisticSkill: 2, strength: 4, armourPenetration: -4, damage: 2,
      sourceRefs: [CORE_BASIC_RANGED_ATTACK_SOURCE]
    };
    const pending = playedShootingGame({ weapon, seed, extendedDefence: { 'blue-1': { allocationGroupId: 'blue-group', source: CORE_CHARACTERISTIC_TESTS_SOURCE } } });
    expect(pending.state.pendingDecisions[0]).toMatchObject({ kind: 'extended-allocation-model' });
    const resolved = executeExtendedAllocationDecisionCommand(pending.state, { id: 'destroy-last-target', actorId: 'p2', type: 'resolve-decision', decisionId: pending.state.pendingDecisions[0].id, optionId: 'blue-1' }, pending.environment);
    expect(resolved).toMatchObject({ accepted: true });
    if (!resolved.accepted) throw new Error(resolved.rejection.message);
    expect(resolved.events.find((event) => event.type === 'extended-shooting-packet-resolved')).toMatchObject({ modelAfter: { active: false } });
    expect(resolved.events.find((event) => event.type === 'extended-shooting-packet-lost')).toMatchObject({ reason: 'no-active-target' });
    expect(resolved.events.at(-1)).toMatchObject({ type: 'extended-shooting-completed' });
    expect(resolved.state.units.blue.models).toMatchObject([{ id: 'blue-1', active: false, wounds: 0 }]);
    expect(resolved.state.prng).toEqual(pending.state.prng);
    const exported = exportSimulation(pending.initial, resolved.state, '2026-08-24T12:00:00.000Z', pending.environment);
    expect(importSimulation(exported, pending.environment, pending.expectedManifestFingerprint)).toMatchObject({ ok: true, state: resolved.state });
    const forged = JSON.parse(exported);
    const lost = forged.events.find((event: { readonly type: string }) => event.type === 'extended-shooting-packet-lost');
    lost.packetIndex = 1;
    expect(importSimulation(JSON.stringify(forged), pending.environment, pending.expectedManifestFingerprint)).toMatchObject({ ok: false, errors: [expect.stringContaining('trusted verification')] });
  });

  it('resolves [À RISQUE] only after the selected unit attacks, then journals its mortal packet', () => {
    const seed = (() => {
      for (let candidate = 0; candidate < 10_000; candidate += 1) {
        const rolls = rollDice(createInitialGameState('hazardous-seed', candidate).prng, 6, 2).results;
        if (rolls[0] !== 6 && rolls[1] <= 2) return candidate;
      }
      throw new Error('No deterministic hazardous seed.');
    })();
    const hazardous: WeaponProfileV1 = {
      id: 'hazardous-rifle', displayName: 'Hazardous Rifle', range: 6_096, attacks: 1, ballisticSkill: 6, strength: 4, armourPenetration: 0, damage: 1,
      weaponKeywords: [{ kind: 'hazardous', source: CORE_HAZARDOUS_SOURCE }], sourceRefs: [CORE_BASIC_RANGED_ATTACK_SOURCE]
    };
    const extendedDefence = { 'blue-1': { allocationGroupId: 'blue-group', source: CORE_CHARACTERISTIC_TESTS_SOURCE } };
    const result = playedShootingGame({ weapon: hazardous, seed, extendedDefence, extraAttackerModel: true });
    const types = result.state.eventLog.map((event) => event.type);
    expect(types.indexOf('extended-shooting-stage-resolved')).toBeLessThan(types.indexOf('extended-shooting-hazardous-resolved'));
    expect(result.state.eventLog.find((event) => event.type === 'extended-shooting-hazardous-resolved')).toMatchObject({ roll: expect.any(Number), mortalWounds: 1 });
    expect(result.state.eventLog.find((event) => event.type === 'extended-shooting-hazardous-resolved')?.sourceRefs.map((source) => source.reference)).not.toContain('24.10');
    const decision = result.state.pendingDecisions[0];
    const allocated = executeExtendedAllocationDecisionCommand(result.state, { id: 'hazardous-allocation', actorId: 'p1', type: 'resolve-decision', decisionId: decision.id, optionId: 'red-1' }, result.environment);
    expect(allocated).toMatchObject({ accepted: true, events: expect.arrayContaining([expect.objectContaining({ type: 'extended-shooting-hazardous-packet-resolved' }), expect.objectContaining({ type: 'extended-shooting-completed' })]) });
    expect(allocated.state.prng).toEqual(result.state.prng);
  });

  it('prioritizes a non-CHARACTER for [À RISQUE] over a wounded CHARACTER and auto-allocates one legal model', () => {
    const seed = (() => {
      for (let candidate = 0; candidate < 10_000; candidate += 1) {
        const rolls = rollDice(createInitialGameState('hazardous-priority-seed', candidate).prng, 6, 2).results;
        if (rolls[0] !== 6 && rolls[1] <= 2) return candidate;
      }
      throw new Error('No deterministic hazardous-priority seed.');
    })();
    const hazardous: WeaponProfileV1 = {
      id: 'hazardous-priority-rifle', displayName: 'Hazardous Priority Rifle', range: 6_096, attacks: 1, ballisticSkill: 6, strength: 4, armourPenetration: 0, damage: 1,
      weaponKeywords: [{ kind: 'hazardous', source: CORE_HAZARDOUS_SOURCE }], sourceRefs: [CORE_BASIC_RANGED_ATTACK_SOURCE]
    };
    const result = playedShootingGame({
      weapon: hazardous, seed, extraAttackerModel: true,
      extendedDefence: { 'blue-1': { allocationGroupId: 'blue-group', source: CORE_CHARACTERISTIC_TESTS_SOURCE } },
      attackerExtendedDefence: { 'red-1': { isCharacter: true, source: CORE_CHARACTERISTIC_TESTS_SOURCE } },
      attackerWounds: { 'red-1': 1 }
    });
    expect(result.state.pendingDecisions).toEqual([]);
    expect(result.state.eventLog.filter((event) => event.type === 'decision-requested' && event.decision.kind === 'extended-hazardous-allocation')).toEqual([]);
    expect(result.state.eventLog.find((event) => event.type === 'extended-shooting-hazardous-packet-resolved')).toMatchObject({ modelId: 'red-2' });
    expect(result.state.eventLog.at(-1)).toMatchObject({ type: 'extended-shooting-completed' });
  });

  it('does not reopen a hazardous decision when one model remains legal after each allocation', () => {
    const seed = (() => {
      for (let candidate = 0; candidate < 10_000; candidate += 1) {
        const rolls = rollDice(createInitialGameState('hazardous-monster-seed', candidate).prng, 6, 2).results;
        if (rolls[0] !== 6 && rolls[1] <= 2) return candidate;
      }
      throw new Error('No deterministic hazardous-monster seed.');
    })();
    const hazardous: WeaponProfileV1 = {
      id: 'hazardous-monster-rifle', displayName: 'Hazardous Monster Rifle', range: 6_096, attacks: 1, ballisticSkill: 6, strength: 4, armourPenetration: 0, damage: 1,
      weaponKeywords: [{ kind: 'hazardous', source: CORE_HAZARDOUS_SOURCE }], sourceRefs: [CORE_BASIC_RANGED_ATTACK_SOURCE]
    };
    const result = playedShootingGame({
      weapon: hazardous, seed, attackerKeywords: ['MONSTRE'],
      extendedDefence: { 'blue-1': { allocationGroupId: 'blue-group', source: CORE_CHARACTERISTIC_TESTS_SOURCE } }
    });
    expect(result.state.eventLog.find((event) => event.type === 'extended-shooting-hazardous-resolved')).toMatchObject({ mortalWounds: 3 });
    expect(result.state.eventLog.filter((event) => event.type === 'extended-shooting-hazardous-packet-resolved')).toHaveLength(2);
    expect(result.state.eventLog.filter((event) => event.type === 'decision-requested' && event.decision.kind === 'extended-hazardous-allocation')).toEqual([]);
    expect(result.state.eventLog.at(-1)).toMatchObject({ type: 'extended-shooting-completed' });
  });

  it('refuses a T04 weapon without extended fixture defence before it can fall through to the legacy pipeline', () => {
    const hazardous: WeaponProfileV1 = {
      id: 'legacy-hazardous', displayName: 'Legacy Hazardous', range: 6_096, attacks: 1, ballisticSkill: 3, strength: 4, armourPenetration: 0, damage: 1,
      weaponKeywords: [{ kind: 'hazardous', source: CORE_HAZARDOUS_SOURCE }], sourceRefs: [CORE_BASIC_RANGED_ATTACK_SOURCE]
    };
    expect(() => playedShootingGame({ weapon: hazardous })).toThrow('cible fixture avec défense étendue');
  });

  it('keeps a natural hit 6 when cover raises the final hit requirement to 7+', () => {
    const seed = (() => {
      for (let candidate = 0; candidate < 10_000; candidate += 1) {
        const rolls = rollDice(createInitialGameState('extended-natural-six', candidate).prng, 6, 2).results;
        if (rolls[0] === 6 && rolls[1] >= 4) return candidate;
      }
      throw new Error('No natural-six fixture seed.');
    })();
    const weapon: WeaponProfileV1 = { id: 'cover-six', displayName: 'Cover Six', range: 6_096, attacks: 1, ballisticSkill: 6, strength: 4, armourPenetration: -4, damage: 1, sourceRefs: [CORE_BASIC_RANGED_ATTACK_SOURCE] };
    const terrainZones: readonly ShootingTerrainZone[] = [{
      id: 'blue-cover', ruleIds: ['core.benefit-of-cover'],
      footprint: { polygons: [{ outer: [{ x: 3_500, y: -200 }, { x: 4_500, y: -200 }, { x: 4_500, y: 200 }, { x: 3_500, y: 200 }] }] }
    }];
    const extendedDefence = { 'blue-1': { allocationGroupId: 'blue-group', source: CORE_CHARACTERISTIC_TESTS_SOURCE } };
    const result = playedShootingGame({ weapon, seed, terrainZones, extendedDefence });
    expect(result.state.pendingExtendedShooting).toMatchObject({ attackRolls: [6], woundRolls: [{ wound: true }] });
  });
});
