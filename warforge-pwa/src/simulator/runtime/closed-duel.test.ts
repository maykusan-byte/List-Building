import { describe, expect, it } from 'vitest';
import manifest from '../../../data/simulator/manifest.json';
import physicalProfiles from '../../../data/simulator/physical-profiles.json';
import rulepacks from '../../../data/simulator/rulepacks.json';
import scenarios from '../../../data/simulator/scenarios.json';
import coverage from '../../../data/simulator/coverage.json';
import { createInitialGameState, createSimulationSave, deserializeSimulationSave, executeGameCommand } from '../domain';
import { createSessionCompatibilityReport, createSimulatorActor, dispatchGameCommand, executeClosedDuelMove, executeBasicShootingCommand, getSimulatorGameState } from '../orchestration';
import { exportSimulation, importSimulation } from '../persistence';
import { assembleClosedDuel } from './closed-duel';

const runtime = () => assembleClosedDuel({ manifest, physicalProfiles, rulepacks, scenarios, coverage });
const casualties = (result: ReturnType<typeof executeBasicShootingCommand>) => result.accepted && result.events[0]?.type === 'basic-shooting-resolved'
  ? result.events[0].casualtyModelIds
  : [];

function start(seed = 1) {
  const closed = runtime();
  const initial = createInitialGameState('closed-duel-test', seed);
  const setup = executeGameCommand(initial, { id: 'setup', actorId: 'red', type: 'setup-session', session: closed.session });
  if (!setup.accepted) throw new Error(setup.rejection.message);
  const command = executeGameCommand(setup.state, { id: 'command', actorId: 'red', type: 'transition-phase', nextPhase: 'command' });
  if (!command.accepted) throw new Error(command.rejection.message);
  const movement = executeGameCommand(command.state, { id: 'movement', actorId: 'red', type: 'transition-phase', nextPhase: 'movement' });
  if (!movement.accepted) throw new Error(movement.rejection.message);
  return { closed, initial, state: movement.state };
}

describe('closed M3 duel runtime', () => {
  it('assembles exactly two five-model fixture units and a covered environment', () => {
    const closed = runtime();
    expect(closed.session.models).toHaveLength(10);
    expect(closed.session.units?.map((unit) => unit.modelIds.length)).toEqual([5, 5]);
    expect(closed.session.units?.flatMap((unit) => unit.weaponAssignments ?? []).every((assignment) => assignment.weaponProfileId === 'closed-core-training-rifle-v1')).toBe(true);
    expect(closed.compatibility.isCompatible).toBe(true);
  });

  it('fails closed when fixture identity or weapon coverage differs', () => {
    expect(() => assembleClosedDuel({ manifest, physicalProfiles, rulepacks, scenarios: {
      ...scenarios,
      fixtureUnits: [{ ...scenarios.fixtureUnits[0], id: 'forged-red' }, scenarios.fixtureUnits[1]]
    }, coverage })).toThrow('identifiants de fixture');
    expect(() => assembleClosedDuel({ manifest, physicalProfiles, rulepacks, scenarios, coverage: {
      ...coverage,
      supportedWeaponIds: []
    } })).toThrow('couverture exacte du fusil');
  });

  it('cannot set up or shoot when weapon coverage is missing', () => {
    const closed = runtime();
    const incompleteCoverage = { ...closed.coverage, entries: closed.coverage.entries.filter((entry) => entry.subjectType !== 'weapon') };
    const report = createSessionCompatibilityReport(closed.session, incompleteCoverage);
    expect(report.isCompatible).toBe(false);
    const actor = createSimulatorActor({ initialState: createInitialGameState('missing-weapon', 3), compatibility: report, shootingEnvironment: closed.environment });
    actor.start();
    dispatchGameCommand(actor, { id: 'setup-missing', actorId: 'red', type: 'setup-session', session: closed.session });
    expect(actor.getSnapshot().context.lastRejection?.code).toBe('incomplete-coverage');
    const state = getSimulatorGameState(actor);
    expect(state.manifest).toBeNull();
    expect(executeBasicShootingCommand(state, { id: 'shot-missing', actorId: 'red', type: 'resolve-basic-shooting', attackerUnitId: 'red-unit', targetUnitId: 'blue-unit', weaponProfileId: 'closed-core-training-rifle-v1' }, closed.environment)).toMatchObject({ accepted: false, rejection: { code: 'session-not-setup' } });
    actor.stop();
  });

  it('accepts legal movement and explicitly rejects a move beyond six inches', () => {
    const { closed, state } = start();
    const legal = executeClosedDuelMove(state, { id: 'legal', actorId: 'red', type: 'move-model', modelId: 'red-1', to: { x: 2_800, y: 3_500 } }, closed);
    expect(legal.accepted).toBe(true);
    const illegal = executeClosedDuelMove(state, { id: 'far', actorId: 'red', type: 'move-model', modelId: 'red-1', to: { x: 1_000, y: 3_500 } }, closed);
    expect(illegal).toMatchObject({ accepted: false, rejection: { code: 'movement-too-far' } });
  });

  it('keeps V1 readable for old no-shoot journals while M3 export is V2 and replays exactly', () => {
    let playable: ReturnType<typeof start> | null = null;
    let shot: ReturnType<typeof executeBasicShootingCommand> | null = null;
    for (let candidateSeed = 1; candidateSeed < 100 && !playable; candidateSeed += 1) {
      const candidate = start(candidateSeed);
      const toShooting = executeGameCommand(candidate.state, { id: 'shooting', actorId: 'red', type: 'transition-phase', nextPhase: 'shooting' });
      if (!toShooting.accepted) throw new Error(toShooting.rejection.message);
      const candidateShot = executeBasicShootingCommand(toShooting.state, { id: 'shot', actorId: 'red', type: 'resolve-basic-shooting', attackerUnitId: 'red-unit', targetUnitId: 'blue-unit', weaponProfileId: 'closed-core-training-rifle-v1' }, candidate.closed.environment);
      if (candidateShot.accepted && casualties(candidateShot).length > 0) { playable = candidate; shot = candidateShot; }
    }
    if (!playable || !shot || !shot.accepted) throw new Error('No deterministic casualty seed found.');
    const { closed, initial, state } = playable;
    const legacy = createSimulationSave(initial, state.eventLog, '2026-08-13T12:00:00.000Z');
    expect(deserializeSimulationSave(JSON.stringify(legacy))).toMatchObject({ ok: true, save: { schemaVersion: 'warforge-simulation-save/v1' } });
    expect(importSimulation(JSON.stringify(legacy), closed.environment, closed.compatibility.manifestFingerprint ?? undefined)).toMatchObject({ ok: false, errors: [expect.stringContaining('V1')] });
    const serialized = exportSimulation(initial, shot.state, '2026-08-13T12:01:00.000Z', closed.environment);
    expect(JSON.parse(serialized).schemaVersion).toBe('warforge-simulation-save/v2');
    expect(importSimulation(serialized, closed.environment, closed.compatibility.manifestFingerprint ?? undefined)).toMatchObject({ ok: true, state: shot.state });
    expect(casualties(shot).length).toBeGreaterThan(0);
  });
});
