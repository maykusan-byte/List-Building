import { describe, expect, it } from 'vitest';
import {
  executeGameCommand,
  nextDeploymentPlayerIdV1,
  resolveFirstPlayerRollOffV1,
  type GameCommand,
  type GameEvent
} from '../domain';
import {
  createCompleteGameDeploymentFixture,
  deployAllCompleteGameUnits,
  deploymentPosesForUnit
} from '../testing/complete-game-deployment-fixture';
import { executeDeploymentCommand } from './deployment';
import { evaluateV11UnitCoherency } from '../rules/coherency';
import { replayGameEventsWithShootingEnvironment } from './shooting';

function nextUnit(state: ReturnType<typeof createCompleteGameDeploymentFixture>['state']) {
  const playerId = state.battle!.nextDeploymentPlayerId!;
  return Object.values(state.units)
    .filter((unit) => unit.playerId === playerId && !state.battle!.deployedUnitIds.includes(unit.id))
    .sort((left, right) => left.id.localeCompare(right.id))[0]!;
}

describe('M7 deterministic deployment and first-player roll-off', () => {
  it('keeps the remaining player active after the opponent has no unit left to deploy', () => {
    const units = {
      'p1-unit': { id: 'p1-unit', playerId: 'p1' },
      'p2-unit-a': { id: 'p2-unit-a', playerId: 'p2' },
      'p2-unit-b': { id: 'p2-unit-b', playerId: 'p2' }
    };
    expect(nextDeploymentPlayerIdV1(['p1', 'p2'], 'p1', ['p1-unit'], units)).toBe('p2');
    expect(nextDeploymentPlayerIdV1(['p1', 'p2'], 'p2', ['p1-unit', 'p2-unit-a'], units)).toBe('p2');
    expect(nextDeploymentPlayerIdV1(['p1', 'p2'], 'p2', Object.keys(units), units)).toBeNull();
  });

  it('applies V11 one-neighbour/9-inch coherency to every unit size and fails closed for TITANIC alternation', () => {
    const sevenModels = Array.from({ length: 7 }, (_, index) => ({
      id: `model-${index}`,
      footprint: { kind: 'circle' as const, center: { x: index * 500, y: 0 }, radius: 160 }
    }));
    const result7 = evaluateV11UnitCoherency(sevenModels);
    expect(result7.requiredNeighbours).toBe(1);
    expect(result7.maximumPairDistance).toBe(2_286);
    expect(result7.isCoherent).toBe(false);
    expect(result7.distantPairs.length).toBeGreaterThan(0);
    expect(evaluateV11UnitCoherency(sevenModels.slice(0, 6)).requiredNeighbours).toBe(1);
    expect(evaluateV11UnitCoherency(sevenModels.slice(0, 1)).requiredNeighbours).toBe(0);
    expect(() => evaluateV11UnitCoherency([])).toThrow('at least one model');

    const fixture = createCompleteGameDeploymentFixture('deployment-titanic', 456);
    const unit = nextUnit(fixture.state);
    const state = {
      ...fixture.state,
      units: { ...fixture.state.units, [unit.id]: { ...unit, keywords: [...unit.keywords, 'TITANIC'] } }
    };
    const result = executeDeploymentCommand(state, {
      id: 'deploy-titanic',
      actorId: unit.playerId,
      type: 'deploy-unit',
      unitId: unit.id,
      modelPoses: deploymentPosesForUnit(state, unit.id)
    }, fixture.environment);
    expect(result).toMatchObject({ accepted: false, state, rejection: { code: 'unsupported-titanic-deployment' } });
    expect(result.state.prng).toEqual(state.prng);
  });

  it('deploys whole coherent units in alternating order and replays every geometry proof', () => {
    const fixture = createCompleteGameDeploymentFixture();
    const deployment = deployAllCompleteGameUnits(fixture.state, fixture.environment);
    const battle = deployment.state.battle!;
    expect(battle.lifecycle).toBe('awaiting-first-player');
    expect(battle.nextDeploymentPlayerId).toBeNull();
    expect(battle.deployedUnitIds).toHaveLength(Object.keys(deployment.state.units).length);
    expect(battle.deploymentOrder.map((unitId) => deployment.state.units[unitId]!.playerId)).toEqual([
      battle.defenderPlayerId,
      battle.attackerPlayerId,
      battle.defenderPlayerId,
      battle.attackerPlayerId,
      battle.defenderPlayerId,
      battle.attackerPlayerId
    ]);
    for (const event of deployment.events) {
      if (event.type !== 'unit-deployed') throw new Error('Unexpected deployment fixture event.');
      expect(event.evidence.containment.every((entry) => ['inside', 'touching-boundary'].includes(entry.board)
        && ['inside', 'touching-boundary'].includes(entry.zone))).toBe(true);
      expect(event.evidence.coherency.incoherentModelIds).toEqual([]);
      expect(event.sourceRefs.map((source) => source.reference)).toEqual(['event-mission-sequence.8', '03.03']);
    }

    const firstPlayer = executeGameCommand(deployment.state, {
      id: 'first-player',
      actorId: battle.defenderPlayerId,
      type: 'determine-first-player'
    });
    expect(firstPlayer.accepted).toBe(true);
    if (!firstPlayer.accepted) return;
    expect(firstPlayer.state.battle).toMatchObject({ lifecycle: 'ready-to-start', firstPlayerId: firstPlayer.events[0]!.type === 'first-player-determined' ? firstPlayer.events[0].winnerPlayerId : undefined });
    expect(firstPlayer.state.prng.draws).toBeGreaterThan(fixture.initial.prng.draws);
    expect(replayGameEventsWithShootingEnvironment(fixture.initial, firstPlayer.state.eventLog, fixture.environment)).toEqual(firstPlayer.state);
  });

  it('rejects wrong turns, incomplete geometry, overlaps and incoherency without consuming entropy', () => {
    const fixture = createCompleteGameDeploymentFixture('deployment-refusals', 123);
    const unit = nextUnit(fixture.state);
    const poses = deploymentPosesForUnit(fixture.state, unit.id);
    const before = fixture.state.prng;

    const earlyRoll = executeGameCommand(fixture.state, { id: 'early-roll', actorId: unit.playerId, type: 'determine-first-player' });
    expect(earlyRoll).toMatchObject({ accepted: false, state: fixture.state, rejection: { code: 'wrong-first-player-window' } });

    const otherPlayerId = fixture.state.battle!.playerIds.find((playerId) => playerId !== unit.playerId)!;
    const wrongTurn = executeDeploymentCommand(fixture.state, { id: 'wrong-turn', actorId: otherPlayerId, type: 'deploy-unit', unitId: unit.id, modelPoses: poses }, fixture.environment);
    expect(wrongTurn).toMatchObject({ accepted: false, state: fixture.state, rejection: { code: 'wrong-deployment-player' } });

    const outside = executeDeploymentCommand(fixture.state, {
      id: 'outside', actorId: unit.playerId, type: 'deploy-unit', unitId: unit.id,
      modelPoses: [{ ...poses[0]!, position: { x: 100, y: 100 } }, ...poses.slice(1)]
    }, fixture.environment);
    expect(outside).toMatchObject({ accepted: false, state: fixture.state, rejection: { code: 'deployment-outside-board' } });

    if (poses.length > 1) {
      const overlapping = executeDeploymentCommand(fixture.state, {
        id: 'overlap', actorId: unit.playerId, type: 'deploy-unit', unitId: unit.id,
        modelPoses: [poses[0]!, { ...poses[1]!, position: poses[0]!.position }, ...poses.slice(2)]
      }, fixture.environment);
      expect(overlapping).toMatchObject({ accepted: false, state: fixture.state, rejection: { code: 'deployment-model-overlap' } });

      const incoherent = executeDeploymentCommand(fixture.state, {
        id: 'incoherent', actorId: unit.playerId, type: 'deploy-unit', unitId: unit.id,
        modelPoses: [{ ...poses[0]!, position: { x: poses[0]!.position.x + 4_000, y: poses[0]!.position.y } }, ...poses.slice(1)]
      }, fixture.environment);
      expect(incoherent).toMatchObject({ accepted: false, state: fixture.state, rejection: { code: 'deployment-unit-incoherent' } });

      const tooWide = executeDeploymentCommand(fixture.state, {
        id: 'too-wide', actorId: unit.playerId, type: 'deploy-unit', unitId: unit.id,
        modelPoses: poses.map((pose, index) => ({ ...pose, position: { x: 500 + index * 800, y: pose.position.y } }))
      }, fixture.environment);
      expect(tooWide).toMatchObject({ accepted: false, state: fixture.state, rejection: { code: 'deployment-unit-incoherent' } });
    }
    expect(fixture.state.prng).toEqual(before);
  });

  it('accepts a hitbox tangent to the board/zone edge and rejects forged spatial replay', () => {
    const fixture = createCompleteGameDeploymentFixture('deployment-tangent');
    const unit = nextUnit(fixture.state);
    const poses = deploymentPosesForUnit(fixture.state, unit.id);
    const tangent = poses.map((pose, index) => ({ ...pose, position: { x: 160 + index * 400, y: 160 } }));
    const result = executeDeploymentCommand(fixture.state, { id: 'tangent', actorId: unit.playerId, type: 'deploy-unit', unitId: unit.id, modelPoses: tangent }, fixture.environment);
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect((result.events[0] as Extract<GameEvent, { type: 'unit-deployed' }>).evidence.containment.some((entry) => entry.board === 'touching-boundary' || entry.zone === 'touching-boundary')).toBe(true);

    const forged = structuredClone(result.state.eventLog) as unknown as { modelPoses?: { position: { x: number; y: number } }[] }[];
    forged[1]!.modelPoses![0]!.position.x += 1;
    expect(() => replayGameEventsWithShootingEnvironment(fixture.initial, forged as unknown as GameEvent[], fixture.environment)).toThrow('trusted geometry verification');
  });

  it('journals tied roll-offs and refuses an UI-supplied outcome', () => {
    let tieSeed = 0;
    while (resolveFirstPlayerRollOffV1({ algorithm: 'mulberry32', version: 1, seed: tieSeed, value: tieSeed, draws: 0 }, ['a', 'b']).rollOffs.length === 1) tieSeed += 1;
    const fixture = createCompleteGameDeploymentFixture('deployment-tie', tieSeed);
    const deployment = deployAllCompleteGameUnits(fixture.state, fixture.environment);
    const injected = executeGameCommand(deployment.state, {
      id: 'injected-first-player',
      actorId: deployment.state.battle!.defenderPlayerId,
      type: 'determine-first-player',
      winnerPlayerId: deployment.state.battle!.defenderPlayerId
    } as unknown as GameCommand);
    expect(injected).toMatchObject({ accepted: false, state: deployment.state, rejection: { code: 'non-authoritative-first-player-input' } });
    expect(injected.state.prng).toEqual(deployment.state.prng);

    const result = executeGameCommand(deployment.state, { id: 'tie-roll', actorId: deployment.state.battle!.defenderPlayerId, type: 'determine-first-player' });
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    const event = result.events[0] as Extract<GameEvent, { type: 'first-player-determined' }>;
    expect(event.rollOffs.length).toBeGreaterThan(1);
    expect(event.rollOffs[0]!.rolls[0]!.result).toBe(event.rollOffs[0]!.rolls[1]!.result);
    expect(event.prngAfter.draws).toBe(event.rollOffs.length * 2);
  });
});
