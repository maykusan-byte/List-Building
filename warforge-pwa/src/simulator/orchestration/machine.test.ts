import { describe, expect, it } from 'vitest';
import { createInitialGameState, type CoverageReportV1, type SessionSetup } from '../domain';
import { InMemorySimulationStorageAdapter, SimulationAutosaveController } from '../persistence';
import {
  attachSimulatorAutosave,
  createSessionCompatibilityReport,
  createSimulatorActor,
  dispatchGameCommand,
  getSimulatorGameState
} from './index';

function session(): SessionSetup {
  return {
    manifest: {
      schemaVersion: 'warforge-simulator/v1',
      simulatorVersion: '0.1.0',
      catalogFingerprint: 'catalog-a',
      rulePackIds: ['core-rule'],
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

function coverage(): CoverageReportV1 {
  return {
    schemaVersion: 'warforge-simulator/v1',
    version: 'coverage-a',
    entries: [
      { subjectType: 'physical-profile', subjectId: 'profile-a', status: 'covered' },
      { subjectType: 'physical-profile', subjectId: 'profile-b', status: 'covered' },
      { subjectType: 'rule', subjectId: 'core-rule', status: 'covered' },
      { subjectType: 'scenario', subjectId: 'test-scenario', status: 'covered' }
    ]
  };
}

function report() {
  return createSessionCompatibilityReport(session(), coverage());
}

describe('simulator orchestration statechart', () => {
  it('blocks session start until an explicit complete compatibility report is supplied', () => {
    const actor = createSimulatorActor({ initialState: createInitialGameState('machine-coverage', 1) });
    actor.start();

    dispatchGameCommand(actor, { id: 'setup', actorId: 'p1', type: 'setup-session', session: session() });

    expect(actor.getSnapshot().value).toEqual({ active: 'setup' });
    expect(actor.getSnapshot().context.lastRejection).toMatchObject({ code: 'incomplete-coverage' });
    expect(getSimulatorGameState(actor).eventLog).toHaveLength(0);
  });

  it('keeps the XState phase window aligned with the reducer and rejects illegal phase jumps', () => {
    const actor = createSimulatorActor({
      initialState: createInitialGameState('machine-phases', 2),
      compatibility: report()
    });
    actor.start();

    dispatchGameCommand(actor, { id: 'setup', actorId: 'p1', type: 'setup-session', session: session() });
    expect(actor.getSnapshot().value).toEqual({ active: 'deployment' });
    expect(getSimulatorGameState(actor).phase).toBe('deployment');

    dispatchGameCommand(actor, { id: 'illegal-jump', actorId: 'p1', type: 'transition-phase', nextPhase: 'shooting' });
    expect(actor.getSnapshot().value).toEqual({ active: 'deployment' });
    expect(actor.getSnapshot().context.lastRejection).toMatchObject({ code: 'illegal-phase-transition' });
    expect(getSimulatorGameState(actor).phase).toBe('deployment');

    dispatchGameCommand(actor, { id: 'command', actorId: 'p1', type: 'transition-phase', nextPhase: 'command' });
    dispatchGameCommand(actor, { id: 'movement', actorId: 'p1', type: 'transition-phase', nextPhase: 'movement' });
    expect(actor.getSnapshot().value).toEqual({ active: 'movement' });
    expect(getSimulatorGameState(actor).phase).toBe('movement');
  });

  it('reports partial declared coverage and refuses the affected session', () => {
    const incompleteCoverage: CoverageReportV1 = {
      ...coverage(),
      entries: coverage().entries.map((entry) => entry.subjectId === 'profile-b' ? { ...entry, status: 'partial' as const } : entry)
    };
    const incompleteReport = createSessionCompatibilityReport(session(), incompleteCoverage);
    expect(incompleteReport).toMatchObject({ isCompatible: false, failures: [{ requirement: { subjectId: 'profile-b' }, code: 'partial-coverage' }] });

    const actor = createSimulatorActor({ initialState: createInitialGameState('machine-partial', 3), compatibility: incompleteReport });
    actor.start();
    dispatchGameCommand(actor, { id: 'setup', actorId: 'p1', type: 'setup-session', session: session() });
    expect(actor.getSnapshot().context.lastRejection).toMatchObject({ code: 'incomplete-coverage' });
  });

  it('derives incompatibility from report failures instead of trusting the display boolean', () => {
    const incompleteCoverage: CoverageReportV1 = {
      ...coverage(),
      entries: coverage().entries.map((entry) => entry.subjectId === 'profile-b' ? { ...entry, status: 'partial' as const } : entry)
    };
    const incompleteReport = createSessionCompatibilityReport(session(), incompleteCoverage);
    const inconsistentReport = { ...incompleteReport, isCompatible: true };
    const actor = createSimulatorActor({ initialState: createInitialGameState('machine-inconsistent-report', 4), compatibility: inconsistentReport });
    actor.start();

    dispatchGameCommand(actor, { id: 'setup', actorId: 'p1', type: 'setup-session', session: session() });

    expect(actor.getSnapshot().context.lastRejection).toMatchObject({ code: 'incomplete-coverage' });
    expect(getSimulatorGameState(actor).manifest).toBeNull();
  });

  it('binds a compatibility report to the concrete session profiles', () => {
    const coveredReport = report();
    const changedSession = {
      ...session(),
      models: session().models.map((model, index) => index === 0 ? { ...model, profileId: 'unsupported-profile' } : model)
    };
    const actor = createSimulatorActor({ initialState: createInitialGameState('machine-fingerprint', 5), compatibility: coveredReport });
    actor.start();
    dispatchGameCommand(actor, { id: 'setup', actorId: 'p1', type: 'setup-session', session: changedSession });

    expect(actor.getSnapshot().context.lastRejection).toMatchObject({ code: 'incomplete-coverage' });
    expect(getSimulatorGameState(actor).phase).toBe('setup');
  });

  it('enters an explicit decision window, locks other commands, and resumes the phase', () => {
    const actor = createSimulatorActor({ initialState: createInitialGameState('machine-decision', 6), compatibility: report() });
    actor.start();
    dispatchGameCommand(actor, { id: 'setup', actorId: 'p1', type: 'setup-session', session: session() });
    dispatchGameCommand(actor, {
      id: 'request', actorId: 'system', type: 'request-decision', decision: {
        id: 'decision-1', kind: 'test', playerId: 'p1', prompt: 'Choose.', options: [{ id: 'yes', label: 'Yes' }], sourceRuleIds: ['test-rule']
      }
    });
    expect(actor.getSnapshot().value).toEqual({ active: 'decision' });
    dispatchGameCommand(actor, { id: 'blocked', actorId: 'p1', type: 'transition-phase', nextPhase: 'command' });
    expect(actor.getSnapshot().context.lastRejection).toMatchObject({ code: 'decision-pending' });
    dispatchGameCommand(actor, { id: 'resolve', actorId: 'p1', type: 'resolve-decision', decisionId: 'decision-1', optionId: 'yes' });
    expect(actor.getSnapshot().value).toEqual({ active: 'deployment' });
    expect(getSimulatorGameState(actor).pendingDecisions).toEqual([]);
  });

  it('can reach the terminal completed phase through the legal sequence', () => {
    const actor = createSimulatorActor({ initialState: createInitialGameState('machine-complete', 7), compatibility: report() });
    actor.start();
    dispatchGameCommand(actor, { id: 'setup', actorId: 'p1', type: 'setup-session', session: session() });
    for (const [id, nextPhase] of [['command', 'command'], ['movement', 'movement'], ['shooting', 'shooting'], ['charge', 'charge'], ['fight', 'fight'], ['complete', 'completed']] as const) {
      dispatchGameCommand(actor, { id, actorId: 'p1', type: 'transition-phase', nextPhase });
    }
    expect(actor.getSnapshot().value).toEqual({ active: 'completed' });
    expect(getSimulatorGameState(actor).phase).toBe('completed');
  });

  it('autosaves accepted event log changes without persisting rejected statechart events', async () => {
    const actor = createSimulatorActor({ initialState: createInitialGameState('machine-autosave', 4), compatibility: report() });
    const storage = new InMemorySimulationStorageAdapter();
    const autosave = attachSimulatorAutosave(actor, new SimulationAutosaveController(storage, () => '2026-08-13T13:00:00.000Z'));
    actor.start();

    dispatchGameCommand(actor, { id: 'setup', actorId: 'p1', type: 'setup-session', session: session() });
    dispatchGameCommand(actor, { id: 'illegal-jump', actorId: 'p1', type: 'transition-phase', nextPhase: 'shooting' });
    await autosave.flush();

    const stored = await storage.read('machine-autosave');
    expect(stored).toMatchObject({ save: { events: [{ commandId: 'setup' }] } });
    autosave.unsubscribe();
  });
});
