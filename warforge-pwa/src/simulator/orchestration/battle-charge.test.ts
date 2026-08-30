import { describe, expect, it } from 'vitest';
import { executeGameCommand, sessionCompatibilityFingerprint, type GameEvent, type GameState } from '../domain';
import { exportSimulation, importSimulation } from '../persistence';
import { validateSimulationSave } from '../domain/serialization';
import { createCompleteGameDeploymentFixture, deployAllCompleteGameUnits, resolveCompleteGameCommandPhaseForTests } from '../testing/complete-game-deployment-fixture';
import { executeCompleteGameMovementCommand } from './battle-movement';
import { endsCloserToAtLeastOneChargeTarget, executeDeclareChargeCommand, executeResolveChargeCommand } from './battle-charge';
import { createSimulatorActor, dispatchGameCommand, getSimulatorGameState } from './machine';
import { executeObjectiveAwareAdvanceBattlePhaseCommand } from './objective-control';
import { replayGameEventsWithShootingEnvironment } from './shooting';

function startChargePhase(gameId: string, seed = 0x57465247) {
  const fixture = createCompleteGameDeploymentFixture(gameId, seed);
  const deployment = deployAllCompleteGameUnits(fixture.state, fixture.environment, `${gameId}-deploy`);
  const first = executeGameCommand(deployment.state, {
    id: `${gameId}-first`, actorId: deployment.state.battle!.defenderPlayerId, type: 'determine-first-player'
  });
  if (!first.accepted) throw new Error(first.rejection.message);
  const started = executeGameCommand(first.state, {
    id: `${gameId}-start`, actorId: first.state.battle!.firstPlayerId!, type: 'start-battle'
  });
  if (!started.accepted) throw new Error(started.rejection.message);
  const commandPhase = resolveCompleteGameCommandPhaseForTests(started.state, `${gameId}-command`);
  const movement = executeObjectiveAwareAdvanceBattlePhaseCommand(commandPhase.state, {
    id: `${gameId}-movement`, actorId: started.state.battle!.activePlayerId!, type: 'advance-battle-phase'
  }, fixture.environment);
  if (!movement.accepted) throw new Error(movement.rejection.message);
  let state = movement.state;
  for (const unitId of Object.keys(state.unitTurnStatuses).sort()) {
    const unit = state.units[unitId]!;
    const stationary = executeCompleteGameMovementCommand(state, {
      id: `${gameId}-stationary-${unitId}`, actorId: state.battle!.activePlayerId!, type: 'move-unit', unitId,
      movementType: 'remain-stationary', paths: unit.models.filter((model) => model.active).map((model) => ({ modelId: model.id, waypoints: [] }))
    }, fixture.environment);
    if (!stationary.accepted) throw new Error(stationary.rejection.message);
    state = stationary.state;
  }
  for (const phase of ['shooting', 'charge'] as const) {
    const advanced = executeObjectiveAwareAdvanceBattlePhaseCommand(state, {
      id: `${gameId}-to-${phase}`, actorId: state.battle!.activePlayerId!, type: 'advance-battle-phase'
    }, fixture.environment);
    if (!advanced.accepted) throw new Error(advanced.rejection.message);
    state = advanced.state;
  }
  return { ...fixture, state };
}

function declareClosest(fixture: ReturnType<typeof startChargePhase>, id: string) {
  const unitId = Object.keys(fixture.state.unitTurnStatuses).sort()[0]!;
  const declared = executeDeclareChargeCommand(fixture.state, {
    id, actorId: fixture.state.battle!.activePlayerId!, type: 'declare-charge', unitId
  }, fixture.environment);
  return { unitId, declared };
}

function chargePaths(state: GameState, unitId: string, targetUnitId: string, travel?: number) {
  const attackers = state.units[unitId]!.models.filter((model) => model.active).map((member) => state.models[member.id]!);
  const targets = state.units[targetUnitId]!.models.filter((model) => model.active).map((member) => state.models[member.id]!);
  const closestPair = attackers.flatMap((attacker) => targets.map((target) => ({
    attacker,
    target,
    distance: Math.hypot(target.position.x - attacker.position.x, target.position.y - attacker.position.y)
  }))).sort((left, right) => left.distance - right.distance || left.attacker.id.localeCompare(right.attacker.id) || left.target.id.localeCompare(right.target.id))[0]!;
  const dx = closestPair.target.position.x - closestPair.attacker.position.x;
  const dy = closestPair.target.position.y - closestPair.attacker.position.y;
  const distance = Math.hypot(dx, dy);
  const edgeDistance = state.pendingCharge!.candidates.find((candidate) => candidate.unitId === targetUnitId)!.edgeToEdgeDistance;
  const translation = travel ?? Math.max(0, edgeDistance - 200);
  return attackers.map((model) => {
    return {
      modelId: model.id,
      waypoints: [{ x: Math.round(model.position.x + dx / distance * translation), y: Math.round(model.position.y + dy / distance * translation) }]
    };
  });
}

function closestViableTarget(state: GameState): string {
  const candidate = state.pendingCharge!.candidates
    .filter((entry) => entry.withinChargeRoll)
    .sort((left, right) => left.edgeToEdgeDistance - right.edgeToEdgeDistance || left.unitId.localeCompare(right.unitId))[0];
  if (!candidate) throw new Error('The deterministic test seed produced no viable charge target.');
  return candidate.unitId;
}

function acceptedCharge(gameId: string) {
  const fixture = startChargePhase(gameId);
  const { unitId, declared } = declareClosest(fixture, `${gameId}-declare`);
  if (!declared.accepted) throw new Error(declared.rejection.message);
  const targetUnitId = closestViableTarget(declared.state);
  const resolved = executeResolveChargeCommand(declared.state, {
    id: `${gameId}-resolve`, actorId: declared.state.battle!.activePlayerId!, type: 'resolve-charge', unitId,
    proceed: true, targetUnitIds: [targetUnitId], paths: chargePaths(declared.state, unitId, targetUnitId)
  }, fixture.environment);
  if (!resolved.accepted) throw new Error(resolved.rejection.message);
  return { ...fixture, unitId, targetUnitId, declared, resolved };
}

describe('M7 charge declaration, after-roll choice and movement', () => {
  it('rolls authoritative 2D6, opens one durable continuation and blocks phase advance', () => {
    const fixture = startChargePhase('charge-declaration');
    const { unitId, declared } = declareClosest(fixture, 'declare');
    expect(declared.accepted).toBe(true);
    if (!declared.accepted) return;
    expect(declared.events[0]).toMatchObject({
      type: 'charge-declared',
      pending: { unitId, roll: [expect.any(Number), expect.any(Number)], sourceRefs: [{ reference: '11.02', page: 36 }] }
    });
    expect(declared.state.prng.draws).toBe(fixture.state.prng.draws + 2);
    expect(declared.state.pendingCharge?.maximumDistance).toBe(declared.state.pendingCharge!.roll.reduce((sum, die) => sum + die, 0) * 254);
    expect(declared.state.pendingCharge?.candidates.length).toBeGreaterThan(0);
    expect(declared.state.unitTurnStatuses[unitId]).toMatchObject({ chargeDeclared: true });

    const advance = executeGameCommand(declared.state, {
      id: 'skip-pending-charge', actorId: declared.state.battle!.activePlayerId!, type: 'advance-battle-phase'
    });
    expect(advance).toMatchObject({ accepted: false, state: declared.state, rejection: { code: 'charge-resolution-pending' } });
    expect(advance.state.prng).toEqual(declared.state.prng);
  });

  it('journals the player reaction to decline after the roll without moving or consuming entropy', () => {
    const fixture = startChargePhase('charge-decline');
    const { unitId, declared } = declareClosest(fixture, 'decline-declare');
    if (!declared.accepted) throw new Error(declared.rejection.message);
    const beforePositions = declared.state.units[unitId]!.models.map((model) => declared.state.models[model.id]!.position);
    const declined = executeResolveChargeCommand(declared.state, {
      id: 'decline-resolution', actorId: declared.state.battle!.activePlayerId!, type: 'resolve-charge', unitId, proceed: false
    }, fixture.environment);
    expect(declined.accepted).toBe(true);
    if (!declined.accepted) return;
    expect(declined.events[0]).toMatchObject({ type: 'charge-resolved', outcome: 'declined', targetUnitIds: [], paths: [], finalPoses: [] });
    expect(declined.state.pendingCharge).toBeNull();
    expect(declined.state.prng).toEqual(declared.state.prng);
    expect(declined.state.units[unitId]!.models.map((model) => declined.state.models[model.id]!.position)).toEqual(beforePositions);
    expect(declined.state.unitTurnStatuses[unitId]).toMatchObject({ chargeDeclared: true, chargeResolved: true, charged: false, chargeTargetUnitIds: [] });
  });

  it('moves into Engagement Range, persists targets/Fights First and round-trips through V6', () => {
    const result = acceptedCharge('charge-success');
    const event = result.resolved.events[0] as Extract<GameEvent, { readonly type: 'charge-resolved' }>;
    expect(event).toMatchObject({
      outcome: 'moved', targetUnitIds: [result.targetUnitId],
      evidence: { engagedTargetUnitIds: [result.targetUnitId], engagedNonTargetUnitIds: [] },
      sourceRefs: [{ reference: '11.02', page: 36 }, { reference: '11.04', page: 37 }, { reference: '03.03', page: 14 }]
    });
    expect(event.evidence.paths.every((path) => path.pathLength <= result.declared.state.pendingCharge!.maximumDistance && path.finalTargetDistance <= 254)).toBe(true);
    expect(result.resolved.state.unitTurnStatuses[result.unitId]).toMatchObject({
      chargeDeclared: true, chargeResolved: true, charged: true, chargeTargetUnitIds: [result.targetUnitId], fightsFirstFromCharge: true
    });
    expect(replayGameEventsWithShootingEnvironment(result.initial, result.resolved.state.eventLog, result.environment)).toEqual(result.resolved.state);

    const exported = exportSimulation(result.initial, result.resolved.state, '2026-08-28T16:00:00.000Z', result.environment);
    expect(JSON.parse(exported).schemaVersion).toBe('warforge-simulation-save/v6');
    expect(validateSimulationSave(JSON.parse(exported))).toMatchObject({ ok: false, errors: [expect.stringContaining('vérificateur spatial')] });
    expect(importSimulation(exported, result.environment, sessionCompatibilityFingerprint(result.session))).toMatchObject({ ok: true, state: result.resolved.state });
  });

  it('allows swept transit through a friendly model while still checking final overlap', () => {
    const fixture = startChargePhase('charge-friendly-screen');
    const unitId = Object.keys(fixture.state.unitTurnStatuses).sort()[0]!;
    const unit = fixture.state.units[unitId]!;
    const enemies = Object.values(fixture.state.units).filter((candidate) => candidate.playerId !== unit.playerId);
    const target = enemies.map((candidate) => ({
      candidate,
      distance: Math.min(...unit.models.filter((model) => model.active).flatMap((attacker) => candidate.models.filter((model) => model.active).map((defender) => {
        const left = fixture.state.models[attacker.id]!.position;
        const right = fixture.state.models[defender.id]!.position;
        return Math.hypot(right.x - left.x, right.y - left.y);
      })))
    })).sort((left, right) => left.distance - right.distance || left.candidate.id.localeCompare(right.candidate.id))[0]!.candidate;
    const pair = unit.models.filter((model) => model.active).flatMap((attacker) => target.models.filter((model) => model.active).map((defender) => ({
      attacker: fixture.state.models[attacker.id]!, defender: fixture.state.models[defender.id]!,
      distance: Math.hypot(fixture.state.models[defender.id]!.position.x - fixture.state.models[attacker.id]!.position.x, fixture.state.models[defender.id]!.position.y - fixture.state.models[attacker.id]!.position.y)
    }))).sort((left, right) => left.distance - right.distance)[0]!;
    const friendly = Object.values(fixture.state.units).find((candidate) => candidate.playerId === unit.playerId && candidate.id !== unitId)!;
    const screenId = friendly.models.find((model) => model.active)!.id;
    const dx = pair.defender.position.x - pair.attacker.position.x;
    const dy = pair.defender.position.y - pair.attacker.position.y;
    const screenedState: GameState = {
      ...fixture.state,
      models: { ...fixture.state.models, [screenId]: { ...fixture.state.models[screenId]!, position: {
        x: Math.round(pair.attacker.position.x + dx * 0.3 - 300),
        y: Math.round(pair.attacker.position.y + dy * 0.3)
      } } }
    };
    const declared = executeDeclareChargeCommand(screenedState, {
      id: 'friendly-screen-declare', actorId: screenedState.battle!.activePlayerId!, type: 'declare-charge', unitId
    }, fixture.environment);
    if (!declared.accepted) throw new Error(declared.rejection.message);
    const targetUnitId = closestViableTarget(declared.state);
    const resolved = executeResolveChargeCommand(declared.state, {
      id: 'friendly-screen-resolve', actorId: declared.state.battle!.activePlayerId!, type: 'resolve-charge', unitId,
      proceed: true, targetUnitIds: [targetUnitId], paths: chargePaths(declared.state, unitId, targetUnitId)
    }, fixture.environment);
    if (!resolved.accepted) throw new Error(`${resolved.rejection.code}: ${resolved.rejection.message}`);
    expect(resolved.accepted).toBe(true);
  });

  it('compares distance per target unit instead of comparing the global minimum', () => {
    const initial = { kind: 'circle', center: { x: 0, y: 0 }, radius: 160 } as const;
    const final = { ...initial, center: { x: 200, y: 0 } };
    const targetUnits = [
      [{ id: 'target-a', footprint: { kind: 'circle', center: { x: -500, y: 0 }, radius: 160 } as const }],
      [{ id: 'target-b', footprint: { kind: 'circle', center: { x: 1_000, y: 0 }, radius: 160 } as const }]
    ];
    expect(endsCloserToAtLeastOneChargeTarget(initial, final, targetUnits)).toBe(true);
  });

  it('keeps a rejected target/path attempt pending without consuming more PRNG', () => {
    const fixture = startChargePhase('charge-refusals');
    const { unitId, declared } = declareClosest(fixture, 'refusal-declare');
    if (!declared.accepted) throw new Error(declared.rejection.message);
    const viable = closestViableTarget(declared.state);
    const wrongTarget = Object.values(declared.state.units).find((unit) => unit.playerId === declared.state.units[unitId]!.playerId && unit.id !== unitId)!.id;
    const illegalTarget = executeResolveChargeCommand(declared.state, {
      id: 'friendly-target', actorId: declared.state.battle!.activePlayerId!, type: 'resolve-charge', unitId,
      proceed: true, targetUnitIds: [wrongTarget], paths: chargePaths(declared.state, unitId, viable)
    }, fixture.environment);
    expect(illegalTarget).toMatchObject({ accepted: false, state: declared.state, rejection: { code: 'charge-target-ineligible' } });

    const tooFar = executeResolveChargeCommand(declared.state, {
      id: 'too-far-path', actorId: declared.state.battle!.activePlayerId!, type: 'resolve-charge', unitId,
      proceed: true, targetUnitIds: [viable], paths: chargePaths(declared.state, unitId, viable, 4_000)
    }, fixture.environment);
    expect(tooFar).toMatchObject({ accepted: false, state: declared.state, rejection: { code: expect.stringMatching(/^charge-/) } });
    expect(tooFar.state.pendingCharge).toEqual(declared.state.pendingCharge);
    expect(tooFar.state.prng).toEqual(declared.state.prng);
  });

  it('enforces the 1-inch priority when that endpoint is reachable', () => {
    const fixture = startChargePhase('charge-one-inch');
    const { unitId, declared } = declareClosest(fixture, 'one-inch-declare');
    if (!declared.accepted) throw new Error(declared.rejection.message);
    const targetUnitId = closestViableTarget(declared.state);
    const rejected = executeResolveChargeCommand(declared.state, {
      id: 'one-inch-reject', actorId: declared.state.battle!.activePlayerId!, type: 'resolve-charge', unitId,
      proceed: true, targetUnitIds: [targetUnitId], paths: chargePaths(declared.state, unitId, targetUnitId, 300)
    }, fixture.environment);
    expect(rejected).toMatchObject({ accepted: false, state: declared.state, rejection: { code: 'charge-model-must-end-within-one' } });
  });

  it('rejects ineligible units before rolling and rejects forged replay evidence', () => {
    const fixture = startChargePhase('charge-eligibility');
    const unitId = Object.keys(fixture.state.unitTurnStatuses).sort()[0]!;
    const ineligible: GameState = {
      ...fixture.state,
      unitTurnStatuses: { ...fixture.state.unitTurnStatuses, [unitId]: { ...fixture.state.unitTurnStatuses[unitId]!, advanced: true } }
    };
    const rejected = executeDeclareChargeCommand(ineligible, {
      id: 'advanced-charge', actorId: ineligible.battle!.activePlayerId!, type: 'declare-charge', unitId
    }, fixture.environment);
    expect(rejected).toMatchObject({ accepted: false, state: ineligible, rejection: { code: 'charge-ineligible-after-movement' } });
    expect(rejected.state.prng).toEqual(ineligible.prng);

    const success = acceptedCharge('charge-forgery');
    const forged = structuredClone(success.resolved.state.eventLog) as GameEvent[];
    const event = forged.find((candidate): candidate is Extract<GameEvent, { readonly type: 'charge-resolved' }> => candidate.type === 'charge-resolved')!;
    (event.evidence.paths as { modelId: string; pathLength: number; initialTargetDistance: number; finalTargetDistance: number }[])[0]!.finalTargetDistance += 1;
    expect(() => replayGameEventsWithShootingEnvironment(success.initial, forged, success.environment)).toThrow('trusted geometry verification');
  });

  it('routes the after-roll continuation through the XState decision node', () => {
    const fixture = startChargePhase('charge-machine');
    const actor = createSimulatorActor({ initialState: fixture.initial, gameState: fixture.state, shootingEnvironment: fixture.environment });
    actor.start();
    const unitId = Object.keys(fixture.state.unitTurnStatuses).sort()[0]!;
    dispatchGameCommand(actor, { id: 'machine-declare', actorId: fixture.state.battle!.activePlayerId!, type: 'declare-charge', unitId });
    expect(actor.getSnapshot().value).toEqual({ active: 'decision' });
    expect(getSimulatorGameState(actor).pendingCharge?.unitId).toBe(unitId);
    dispatchGameCommand(actor, { id: 'machine-decline', actorId: fixture.state.battle!.activePlayerId!, type: 'resolve-charge', unitId, proceed: false });
    expect(actor.getSnapshot().value).toEqual({ active: 'charge' });
    expect(getSimulatorGameState(actor).pendingCharge).toBeNull();
    actor.stop();
  });
});
