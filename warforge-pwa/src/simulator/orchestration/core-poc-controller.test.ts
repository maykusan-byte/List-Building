import { describe, expect, it } from 'vitest';
import { sessionCompatibilityFingerprint } from '../domain';
import { exportSimulation, importSimulation } from '../persistence';
import {
  createCurrentCorePocTechnicalGameV1,
  executeCorePocTechnicalStepV1,
  runCorePocTechnicalGameToCompletionV1
} from './core-poc-controller';

describe('economic core POC technical runner', () => {
  it('executes five rounds through normal commands and replays the V6 journal exactly', () => {
    const game = createCurrentCorePocTechnicalGameV1('core-poc-five-round-test');
    const completed = runCorePocTechnicalGameToCompletionV1(game.state, game.runtime);

    expect(completed.commandCount).toBeGreaterThan(50);
    expect(completed.state.phase).toBe('completed');
    expect(completed.state.battle).toMatchObject({ lifecycle: 'completed', battleRound: 5, turnNumber: 2 });
    expect(completed.state.mission?.finalResult).not.toBeNull();
    expect(completed.state.eventLog.some((event) => event.type === 'mission-scoring-resolved')).toBe(true);
    expect(completed.state.eventLog.some((event) => event.type === 'insane-bravery-used' || event.type === 'counter-offensive-used')).toBe(false);

    const serialized = exportSimulation(game.initial, completed.state, '2026-08-31T15:30:00.000Z', game.runtime.environment);
    expect(JSON.parse(serialized)).toMatchObject({ schemaVersion: 'warforge-simulation-save/v6' });
    const imported = importSimulation(
      serialized,
      game.runtime.environment,
      sessionCompatibilityFingerprint(game.runtime.session)
    );
    expect(imported).toMatchObject({ ok: true, state: completed.state });
  });

  it('advances only one journalled command per technical step', () => {
    const game = createCurrentCorePocTechnicalGameV1('core-poc-one-step-test');
    const result = executeCorePocTechnicalStepV1(game.state, game.runtime, 'deploy-one');
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ type: 'unit-deployed' });
    expect(result.state.eventLog).toHaveLength(game.state.eventLog.length + 1);
  });
});
