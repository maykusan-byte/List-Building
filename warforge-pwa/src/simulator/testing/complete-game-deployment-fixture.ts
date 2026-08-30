import { createInitialGameState, executeGameCommand, type GameEvent, type GameState } from '../domain';
import { executeDeploymentCommand } from '../orchestration/deployment';
import { createShootingEnvironment, type ShootingEnvironment } from '../orchestration/shooting';
import { CORE_BENEFIT_OF_COVER_SOURCE } from '../rules';
import {
  COMPLETE_GAME_TEST_SOURCE,
  COMPLETE_GAME_TEST_MELEE_WEAPON,
  COMPLETE_GAME_TEST_WEAPON,
  createCompleteGameSessionForTests
} from './closed-complete-game-fixture';

export function createCompleteGameTestEnvironment(): ShootingEnvironment {
  return createShootingEnvironment({
    physicalProfiles: {
      infantry: {
        schemaVersion: 'warforge-simulator/v1',
        id: 'infantry',
        displayName: 'Infantry',
        baseShape: { kind: 'circle', radius: 160 },
        height: 400,
        visibilityPoints: [{ x: 0, y: 0, z: 320 }],
        source: COMPLETE_GAME_TEST_SOURCE
      }
    },
    weaponProfiles: {
      [COMPLETE_GAME_TEST_WEAPON.id]: COMPLETE_GAME_TEST_WEAPON,
      [COMPLETE_GAME_TEST_MELEE_WEAPON.id]: COMPLETE_GAME_TEST_MELEE_WEAPON
    },
    terrainZones: [],
    coverRules: [{
      id: 'core.benefit-of-cover',
      source: CORE_BENEFIT_OF_COVER_SOURCE,
      ballisticSkillPenalty: 1,
      branches: [
        { kind: 'inside-terrain-zone', qualifyingKeywords: ['INFANTRY', 'BEAST', 'SWARM'] },
        { kind: 'not-entirely-visible-due-to-terrain' }
      ]
    }]
  });
}

export function createCompleteGameDeploymentFixture(gameId = 'complete-game-deployment', seed = 0x57465247) {
  const environment = createCompleteGameTestEnvironment();
  const session = createCompleteGameSessionForTests(environment.fingerprint);
  const initial = createInitialGameState(gameId, seed);
  const setup = executeGameCommand(initial, { id: 'setup', actorId: session.players[0]!.id, type: 'setup-session', session });
  if (!setup.accepted) throw new Error(setup.rejection.message);
  return { environment, session, initial, state: setup.state };
}

export function deploymentPosesForUnit(state: GameState, unitId: string) {
  const unit = state.units[unitId];
  const battle = state.battle;
  if (!unit || !battle) throw new Error('Deployment fixture requires a complete-game unit.');
  const zone = battle.deploymentZones.find((candidate) => candidate.playerId === unit.playerId);
  if (!zone) throw new Error(`No deployment zone for ${unit.playerId}.`);
  const ownerUnitIds = Object.values(state.units).filter((candidate) => candidate.playerId === unit.playerId).map((candidate) => candidate.id).sort();
  const row = ownerUnitIds.indexOf(unit.id);
  const rowY = unit.playerId === battle.defenderPlayerId
    ? zone.bounds.maxY - 500 - row * 1_000
    : zone.bounds.minY + 500 + row * 1_000;
  return [...unit.models].sort((left, right) => left.id.localeCompare(right.id)).map((model, index) => ({
    modelId: model.id,
    position: { x: zone.bounds.minX + 500 + index * 400, y: rowY },
    orientationDegrees: 0
  }));
}

export function deployAllCompleteGameUnits(
  initialState: GameState,
  environment: ShootingEnvironment,
  commandPrefix = 'deploy'
): { readonly state: GameState; readonly events: readonly GameEvent[] } {
  let state = initialState;
  const events: GameEvent[] = [];
  while (state.battle?.lifecycle === 'deployment') {
    const playerId = state.battle.nextDeploymentPlayerId;
    if (!playerId) throw new Error('Deployment fixture lost its next player.');
    const unit = Object.values(state.units)
      .filter((candidate) => candidate.playerId === playerId && !state.battle!.deployedUnitIds.includes(candidate.id))
      .sort((left, right) => left.id.localeCompare(right.id))[0];
    if (!unit) throw new Error(`Deployment fixture cannot find a remaining unit for ${playerId}.`);
    const result = executeDeploymentCommand(state, {
      id: `${commandPrefix}-${events.length}`,
      actorId: playerId,
      type: 'deploy-unit',
      unitId: unit.id,
      modelPoses: deploymentPosesForUnit(state, unit.id)
    }, environment);
    if (!result.accepted) throw new Error(result.rejection.message);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

/** Resolves the explicit M8 command sequence for fixtures not testing its windows. */
export function resolveCompleteGameCommandPhaseForTests(
  initialState: GameState,
  commandPrefix = 'command-phase'
): { readonly state: GameState; readonly events: readonly GameEvent[] } {
  let state = initialState;
  const events: GameEvent[] = [];
  let commandIndex = 0;
  while (state.commandPhase !== null && state.commandPhase.stage !== 'complete') {
    const unitId = state.commandPhase.pendingBattleShockUnitIds[0];
    const result = executeGameCommand(state, unitId === undefined ? {
      id: `${commandPrefix}-${commandIndex++}`,
      actorId: state.commandPhase.activePlayerId,
      type: 'resolve-command-stage'
    } : {
      id: `${commandPrefix}-${commandIndex++}`,
      actorId: state.units[unitId]!.playerId,
      type: 'resolve-battle-shock-test',
      unitId
    });
    if (!result.accepted) throw new Error(`${result.rejection.code}: ${result.rejection.message}`);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}
