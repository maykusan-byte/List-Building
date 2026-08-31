import {
  createInitialGameState,
  executeGameCommand,
  missionScoringCheckpointIdV1,
  missionScoringCheckpointV1,
  type CommandExecution,
  type GameCommand,
  type GameState,
  type RuleRejection
} from '../domain';
import {
  assembleCurrentCorePocRuntimeV1,
  type CorePocRuntimeV1
} from '../runtime/core-poc';
import { executeCompleteGameMovementCommand } from './battle-movement';
import { executePassFightWindowCommand } from './battle-fight';
import { executeDeploymentCommand } from './deployment';
import { executeObjectiveAwareAdvanceBattlePhaseCommand } from './objective-control';
import { executeMissionScoringCommand } from './mission-scoring';

export const CORE_POC_TECHNICAL_GAME_ID = 'closed-complete-game-core-poc-technical-v1';
export const CORE_POC_TECHNICAL_SEED = 0x57465247;

export interface CorePocTechnicalGameV1 {
  readonly runtime: CorePocRuntimeV1;
  readonly initial: GameState;
  readonly state: GameState;
}

function rejection(state: GameState, commandId: string, code: string, message: string): CommandExecution {
  const ruleRejection: RuleRejection = {
    commandId,
    code,
    message,
    sourceRuleIds: ['ADR-025']
  };
  return { accepted: false, state, rejection: ruleRejection };
}

function command<T extends GameCommand>(value: T): T {
  return value;
}

/** Creates the event-free origin and applies the authoritative V6 setup. */
export function createCorePocTechnicalGameV1(
  runtime: CorePocRuntimeV1,
  gameId = CORE_POC_TECHNICAL_GAME_ID,
  seed = CORE_POC_TECHNICAL_SEED
): CorePocTechnicalGameV1 {
  if (!runtime.readyForCompleteGame || runtime.blockers.length > 0 || runtime.session.completeGame === undefined) {
    throw new RangeError('Le runtime du POC technique n’est pas prêt pour une session V6.');
  }
  const initial = createInitialGameState(gameId, seed);
  const setup = executeGameCommand(initial, command({
    id: `${gameId}:setup`,
    actorId: runtime.session.players[0]!.id,
    type: 'setup-session',
    session: runtime.session
  }));
  if (!setup.accepted) throw new RangeError(`Setup POC refusé : ${setup.rejection.code} — ${setup.rejection.message}`);
  return { runtime, initial, state: setup.state };
}

export function createCurrentCorePocTechnicalGameV1(
  gameId = CORE_POC_TECHNICAL_GAME_ID,
  seed = CORE_POC_TECHNICAL_SEED
): CorePocTechnicalGameV1 {
  return createCorePocTechnicalGameV1(assembleCurrentCorePocRuntimeV1(), gameId, seed);
}

function deployNextUnit(state: GameState, runtime: CorePocRuntimeV1, commandId: string): CommandExecution {
  const battle = state.battle!;
  const playerId = battle.nextDeploymentPlayerId;
  if (!playerId) return rejection(state, commandId, 'deployment-order-complete', 'Toutes les unités sont déjà déployées.');
  const unit = Object.values(state.units)
    .filter((candidate) => candidate.playerId === playerId && !battle.deployedUnitIds.includes(candidate.id))
    .sort((left, right) => left.id.localeCompare(right.id))[0];
  if (!unit) return rejection(state, commandId, 'deployment-unit-missing', `Aucune unité à déployer pour ${playerId}.`);
  return executeDeploymentCommand(state, command({
    id: commandId,
    actorId: playerId,
    type: 'deploy-unit',
    unitId: unit.id,
    modelPoses: unit.models.filter((model) => model.active).map((member) => {
      const model = state.models[member.id]!;
      return { modelId: model.id, position: model.position, orientationDegrees: model.orientationDegrees };
    })
  }), runtime.environment);
}

function resolveCommandStage(state: GameState, commandId: string): CommandExecution {
  const commandPhase = state.commandPhase;
  if (!commandPhase) return rejection(state, commandId, 'command-stage-missing', 'La phase de Commandement technique est absente.');
  const unitId = commandPhase.pendingBattleShockUnitIds[0];
  return executeGameCommand(state, unitId === undefined
    ? command({ id: commandId, actorId: commandPhase.activePlayerId, type: 'resolve-command-stage' })
    : command({ id: commandId, actorId: state.units[unitId]!.playerId, type: 'resolve-battle-shock-test', unitId }));
}

function selectNextUnitStationary(state: GameState, runtime: CorePocRuntimeV1, commandId: string): CommandExecution {
  const activePlayerId = state.battle!.activePlayerId!;
  const unit = Object.values(state.units)
    .filter((candidate) => candidate.playerId === activePlayerId
      && candidate.models.some((model) => model.active)
      && !state.unitTurnStatuses[candidate.id]?.selectedForMovement)
    .sort((left, right) => left.id.localeCompare(right.id))[0];
  if (!unit) return rejection(state, commandId, 'movement-selection-complete', 'Toutes les unités actives ont déjà choisi leur mouvement.');
  return executeCompleteGameMovementCommand(state, command({
    id: commandId,
    actorId: activePlayerId,
    type: 'move-unit',
    unitId: unit.id,
    movementType: 'remain-stationary',
    paths: unit.models.filter((model) => model.active).map((model) => ({ modelId: model.id, waypoints: [] }))
  }), runtime.environment);
}

function missionScoringIsPending(state: GameState): boolean {
  try {
    const checkpoint = missionScoringCheckpointV1(state);
    const battle = state.battle!;
    return state.mission?.scoredCheckpointIds?.includes(
      missionScoringCheckpointIdV1(battle.battleRound, battle.turnNumber, checkpoint)
    ) !== true;
  } catch {
    return false;
  }
}

/**
 * Executes exactly one normal engine command. The technical runner makes no
 * tactical choice: it deploys the approved poses, remains stationary, skips
 * optional attacks/charges, and passes empty fight windows.
 */
export function executeCorePocTechnicalStepV1(
  state: GameState,
  runtime: CorePocRuntimeV1,
  commandId = `${state.gameId}:technical-step:${state.eventLog.length}`
): CommandExecution {
  const battle = state.battle;
  if (!battle || state.phase === 'setup') return rejection(state, commandId, 'technical-session-not-setup', 'La session V6 doit être initialisée.');
  if (state.phase === 'completed') return rejection(state, commandId, 'technical-session-completed', 'La partie technique est déjà terminée.');

  if (state.phase === 'deployment') {
    if (battle.lifecycle === 'deployment') return deployNextUnit(state, runtime, commandId);
    if (battle.firstPlayerId === null) return executeGameCommand(state, command({
      id: commandId,
      actorId: battle.defenderPlayerId,
      type: 'determine-first-player'
    }));
    return executeGameCommand(state, command({
      id: commandId,
      actorId: battle.firstPlayerId,
      type: 'start-battle'
    }));
  }
  if (state.phase === 'command' && state.commandPhase?.stage !== 'complete') return resolveCommandStage(state, commandId);
  if (state.phase === 'movement'
    && Object.values(state.units).some((unit) => unit.playerId === battle.activePlayerId
      && unit.models.some((model) => model.active)
      && !state.unitTurnStatuses[unit.id]?.selectedForMovement)) {
    return selectNextUnitStationary(state, runtime, commandId);
  }
  if (state.phase === 'fight' && state.fightPhase?.stage !== 'complete') {
    const actorId = state.fightPhase?.currentPlayerId;
    if (!actorId) return rejection(state, commandId, 'fight-window-player-missing', 'La fenêtre de Combat technique ne possède pas de joueur actif.');
    return executePassFightWindowCommand(state, command({ id: commandId, actorId, type: 'pass-fight-window' }), runtime.environment);
  }
  if (missionScoringIsPending(state)) {
    return executeMissionScoringCommand(state, command({
      id: commandId,
      actorId: battle.activePlayerId!,
      type: 'resolve-mission-scoring'
    }), {
      fingerprint: runtime.environment.fingerprint,
      physicalProfiles: runtime.environment.physicalProfiles,
      // Technical fixtures have no hobby model representation. The runner
      // fixes both external Battle Ready verdicts to true solely to exercise
      // the final score envelope deterministically.
      battleReadyByPlayerId: Object.fromEntries(battle.playerIds.map((playerId) => [playerId, true]))
    });
  }
  return executeObjectiveAwareAdvanceBattlePhaseCommand(state, command({
    id: commandId,
    actorId: battle.activePlayerId!,
    type: 'advance-battle-phase'
  }), runtime.environment);
}

export function runCorePocTechnicalGameToCompletionV1(
  initialState: GameState,
  runtime: CorePocRuntimeV1,
  maximumCommands = 512
): { readonly state: GameState; readonly commandCount: number } {
  let state = initialState;
  for (let commandCount = 0; commandCount < maximumCommands; commandCount += 1) {
    if (state.phase === 'completed') return { state, commandCount };
    const result = executeCorePocTechnicalStepV1(state, runtime, `${state.gameId}:technical-run:${commandCount}`);
    if (!result.accepted) throw new RangeError(`Parcours POC refusé : ${result.rejection.code} — ${result.rejection.message}`);
    state = result.state;
  }
  throw new RangeError(`Le parcours POC n’a pas terminé après ${maximumCommands} commandes.`);
}
