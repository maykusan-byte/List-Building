import { describe, expect, it } from 'vitest';
import type { GameCommand } from '../domain';
import { createCurrentCorePocTechnicalGameV1, executeCorePocTechnicalStepV1 } from './core-poc-controller';
import { deriveInteractivePocViewV1, executeInteractivePocCommandV1 } from './interactive-poc-controller';

function reachPhase(target: 'movement' | 'shooting' | 'charge', gameId: string) {
  const game = createCurrentCorePocTechnicalGameV1(gameId);
  let state = game.state;
  for (let index = 0; index < 64 && state.phase !== target; index += 1) {
    const result = executeCorePocTechnicalStepV1(state, game.runtime, `${gameId}:prepare:${index}`);
    if (!result.accepted) throw new Error(result.rejection.message);
    state = result.state;
  }
  if (state.phase !== target) throw new Error(`Phase ${target} non atteinte.`);
  return { ...game, state };
}

describe('interactive fixture-only POC controller', () => {
  it('derives deployment candidates without mutating state or consuming entropy', () => {
    const game = createCurrentCorePocTechnicalGameV1('interactive-view-deployment');
    const before = game.state;
    const view = deriveInteractivePocViewV1(before, game.runtime);

    expect(view).toMatchObject({
      schemaVersion: 'warforge-interactive-poc-controller/v1',
      phase: 'deployment',
      eventCount: 1,
      prngDraws: 0
    });
    expect(view.actions.length).toBeGreaterThan(0);
    expect(view.actions.every((candidate) => candidate.kind === 'deploy-unit'
      && candidate.actorId === before.battle?.nextDeploymentPlayerId
      && candidate.authority === 'engine-validation-required')).toBe(true);
    expect(view.limitations).toEqual([
      'core-stratagem.command-reroll',
      'core-stratagem.epic-challenge',
      'core-stratagem.overwatch',
      'core-stratagem.heroic-intervention'
    ]);
    expect(game.state).toBe(before);
    expect(game.state.prng.draws).toBe(0);
  });

  it('routes deployment through the trusted geometry environment', () => {
    const game = createCurrentCorePocTechnicalGameV1('interactive-deploy-command');
    const candidate = deriveInteractivePocViewV1(game.state, game.runtime).actions[0]!;
    const unit = game.state.units[candidate.unitId!]!;
    const result = executeInteractivePocCommandV1(game.state, {
      id: 'interactive-deploy-one',
      actorId: candidate.actorId,
      type: 'deploy-unit',
      unitId: unit.id,
      modelPoses: unit.models.map((member) => {
        const model = game.state.models[member.id]!;
        return { modelId: model.id, position: model.position, orientationDegrees: model.orientationDegrees };
      })
    }, game.runtime);

    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ type: 'unit-deployed', unitId: unit.id });
    expect(deriveInteractivePocViewV1(result.state, game.runtime).units.find((entry) => entry.id === unit.id)?.deployed).toBe(true);
  });

  it('exposes movement declarations then lets the engine accept an explicit stationary choice', () => {
    const game = reachPhase('movement', 'interactive-movement-command');
    const view = deriveInteractivePocViewV1(game.state, game.runtime);
    const candidate = view.actions.find((entry) => entry.kind === 'move-unit')!;
    const unit = game.state.units[candidate.unitId!]!;
    const result = executeInteractivePocCommandV1(game.state, {
      id: 'interactive-stationary',
      actorId: candidate.actorId,
      type: 'move-unit',
      unitId: unit.id,
      movementType: 'remain-stationary',
      paths: unit.models.filter((model) => model.active).map((model) => ({ modelId: model.id, waypoints: [] }))
    }, game.runtime);

    expect(candidate.requiredInputs).toEqual(['movement-type', 'movement-paths']);
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.events[0]).toMatchObject({ type: 'unit-movement-resolved', movementType: 'remain-stationary' });
  });

  it('derives shooting candidates while keeping spatial facts out of the command', () => {
    const game = reachPhase('shooting', 'interactive-shooting-view');
    const candidate = deriveInteractivePocViewV1(game.state, game.runtime).actions.find((entry) => entry.kind === 'resolve-basic-shooting');
    expect(candidate).toBeDefined();
    expect(candidate).toMatchObject({
      requiredInputs: ['weapon-profiles', 'target-units'],
      authority: 'engine-validation-required'
    });
    expect(candidate!.candidateTargetUnitIds.length).toBeGreaterThan(0);
    expect(candidate!.candidateWeaponProfileIds.length).toBeGreaterThan(0);
    expect(deriveInteractivePocViewV1(game.state, game.runtime).actions).toContainEqual(
      expect.objectContaining({ kind: 'advance-battle-phase', label: 'Terminer la phase' })
    );
  });

  it('allows the player to finish Charge without declaring an optional charge', () => {
    const game = reachPhase('charge', 'interactive-charge-skip');
    const actions = deriveInteractivePocViewV1(game.state, game.runtime).actions;
    expect(actions).toContainEqual(expect.objectContaining({ kind: 'advance-battle-phase' }));
  });

  it('prioritises pending decisions, charge continuations and immediate Battle-shock', () => {
    const game = reachPhase('charge', 'interactive-priorities');
    const playerId = game.state.battle!.activePlayerId!;
    const unitId = Object.values(game.state.units).find((unit) => unit.playerId === playerId)!.id;
    const targetUnitId = Object.values(game.state.units).find((unit) => unit.playerId !== playerId)!.id;
    const decision = { id: 'pending-choice', kind: 'test-choice', playerId, prompt: 'Choisir.', options: [{ id: 'yes', label: 'Oui' }], sourceRuleIds: ['test'] };
    const withDecision = { ...game.state, pendingDecisions: [decision] };
    expect(deriveInteractivePocViewV1(withDecision, game.runtime).actions).toEqual([
      expect.objectContaining({ kind: 'resolve-decision', decision })
    ]);

    const withCharge = {
      ...game.state,
      pendingCharge: {
        schemaVersion: 'warforge-pending-charge/v1' as const,
        playerId,
        unitId,
        roll: [3, 4] as const,
        maximumDistance: 1_778,
        candidates: [{ unitId: targetUnitId, edgeToEdgeDistance: 1_000, withinChargeRoll: true }],
        environmentFingerprint: game.runtime.environment.fingerprint,
        prngBefore: game.state.prng,
        prngAfter: game.state.prng,
        sourceRefs: [{ sourceId: 'test', version: '1', effectiveFrom: '2026-08-31' }]
      }
    };
    expect(deriveInteractivePocViewV1(withCharge, game.runtime).actions).toEqual([
      expect.objectContaining({ kind: 'resolve-charge', unitId })
    ]);

    const withImmediateShock = {
      ...game.state,
      unitTurnStatuses: { ...game.state.unitTurnStatuses, [unitId]: { ...game.state.unitTurnStatuses[unitId]!, battleShockTestRequired: true } }
    };
    expect(deriveInteractivePocViewV1(withImmediateShock, game.runtime).actions).toEqual([
      expect.objectContaining({ kind: 'resolve-battle-shock-test', unitId })
    ]);
  });

  it('routes known decision kinds to trusted continuations and rejects unknown kinds', () => {
    const game = createCurrentCorePocTechnicalGameV1('interactive-decision-routing');
    const actorId = Object.keys(game.state.players)[0]!;
    const knownKinds = [
      'basic-melee-allocation',
      'lethal-hits-choice',
      'generic-reroll-choice',
      'extended-allocation-group',
      'extended-allocation-model',
      'extended-hazardous-allocation',
      'duplicate-weapon-ability',
      'split-fire-retarget'
    ];
    for (const kind of knownKinds) {
      const decision = { id: `decision-${kind}`, kind, playerId: actorId, prompt: kind, options: [{ id: 'option', label: 'Option' }], sourceRuleIds: ['test'] };
      const state = { ...game.state, pendingDecisions: [decision] };
      const result = executeInteractivePocCommandV1(state, {
        id: `resolve-${kind}`, actorId, type: 'resolve-decision', decisionId: decision.id, optionId: 'option'
      }, game.runtime);
      expect(result.accepted || result.rejection.code !== 'interactive-decision-not-covered').toBe(true);
    }

    const unknown = { id: 'decision-unknown', kind: 'unknown', playerId: actorId, prompt: 'Unknown', options: [{ id: 'option', label: 'Option' }], sourceRuleIds: ['test'] };
    const result = executeInteractivePocCommandV1({ ...game.state, pendingDecisions: [unknown] }, {
      id: 'resolve-unknown', actorId, type: 'resolve-decision', decisionId: unknown.id, optionId: 'option'
    }, game.runtime);
    expect(result).toMatchObject({ accepted: false, rejection: { code: 'interactive-decision-not-covered' } });
  });

  it('rejects a state/runtime environment mismatch before deriving UI state', () => {
    const game = createCurrentCorePocTechnicalGameV1('interactive-runtime-mismatch');
    const mismatched = { ...game.runtime, environment: { ...game.runtime.environment, fingerprint: 'mismatch' } };
    expect(() => deriveInteractivePocViewV1(game.state, mismatched)).toThrow(/environnement/);
  });

  it('rejects commands outside the interactive coverage without changing state or PRNG', () => {
    const game = createCurrentCorePocTechnicalGameV1('interactive-reject-raw-dice');
    const unsupported: GameCommand = {
      id: 'raw-dice', actorId: Object.keys(game.state.players)[0]!, type: 'roll-dice', rollId: 'forged', sides: 6, count: 1, reason: 'UI shortcut'
    };
    const result = executeInteractivePocCommandV1(game.state, unsupported, game.runtime);
    expect(result).toMatchObject({ accepted: false, rejection: { code: 'interactive-command-not-covered' } });
    expect(result.state).toBe(game.state);
    expect(result.state.prng).toEqual(game.state.prng);
  });
});
