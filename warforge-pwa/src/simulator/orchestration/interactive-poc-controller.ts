import {
  CORE_POC_TECHNICAL_LIMITATION_IDS,
  executeGameCommand,
  missionScoringCheckpointIdV1,
  missionScoringCheckpointV1,
  validateGameCommand,
  type CommandExecution,
  type DecisionRequest,
  type GameCommand,
  type GameState,
  type RuleRejection,
  type UnitMovementTypeV1,
  type WorldPoint
} from '../domain';
import type { CorePocRuntimeV1 } from '../runtime/core-poc';
import { executeDeclareChargeCommand, executeResolveChargeCommand } from './battle-charge';
import {
  executeBasicMeleeAllocationDecisionCommand,
  executeBasicMeleeCommand,
  executeEmptyFightCommand,
  executeFightMovementCommand,
  executePassFightWindowCommand
} from './battle-fight';
import { executeCompleteGameMovementCommand } from './battle-movement';
import { executeDeploymentCommand } from './deployment';
import { executeMissionScoringCommand } from './mission-scoring';
import { executeObjectiveAwareAdvanceBattlePhaseCommand } from './objective-control';
import {
  executeBasicShootingCommand,
  executeDuplicateWeaponAbilityDecisionCommand,
  executeExtendedAllocationDecisionCommand,
  executeGenericRerollDecisionCommand,
  executeLethalHitsDecisionCommand,
  executeSplitFireCommand,
  executeSplitFireRetargetDecisionCommand
} from './shooting';

export const INTERACTIVE_POC_CONTROLLER_SCHEMA = 'warforge-interactive-poc-controller/v1' as const;

export type InteractivePocActionKindV1 =
  | 'deploy-unit'
  | 'determine-first-player'
  | 'start-battle'
  | 'resolve-command-stage'
  | 'resolve-battle-shock-test'
  | 'use-insane-bravery'
  | 'move-unit'
  | 'resolve-basic-shooting'
  | 'resolve-split-fire'
  | 'declare-charge'
  | 'resolve-charge'
  | 'use-counter-offensive'
  | 'pass-fight-window'
  | 'resolve-fight-movement'
  | 'resolve-basic-melee'
  | 'resolve-empty-fight'
  | 'resolve-decision'
  | 'resolve-mission-scoring'
  | 'advance-battle-phase';

export type InteractivePocInputV1 =
  | 'model-poses'
  | 'movement-type'
  | 'movement-paths'
  | 'weapon-profiles'
  | 'target-units'
  | 'decision-option'
  | 'charge-proceed';

/**
 * A candidate interaction, never a legality verdict. The authoritative
 * dispatcher validates the final GameCommand against state and geometry.
 */
export interface InteractivePocActionV1 {
  readonly id: string;
  readonly kind: InteractivePocActionKindV1;
  readonly label: string;
  readonly actorId: string;
  readonly unitId?: string;
  readonly decision?: DecisionRequest;
  readonly requiredInputs: readonly InteractivePocInputV1[];
  readonly candidateTargetUnitIds: readonly string[];
  readonly candidateWeaponProfileIds: readonly string[];
  readonly authority: 'engine-validation-required';
}

export interface InteractivePocModelViewV1 {
  readonly id: string;
  readonly position: WorldPoint;
  readonly orientationDegrees: number;
  readonly active: boolean;
  readonly wounds: number;
}

export interface InteractivePocUnitViewV1 {
  readonly id: string;
  readonly playerId: string;
  readonly deployed: boolean;
  readonly active: boolean;
  readonly movement: number;
  readonly selectedForMovement: boolean;
  readonly selectedForShooting: boolean;
  readonly weaponProfileIds: readonly string[];
  readonly models: readonly InteractivePocModelViewV1[];
}

export interface InteractivePocPlayerViewV1 {
  readonly id: string;
  readonly displayName: string;
  readonly commandPoints: number;
  readonly score: number;
}

export interface InteractivePocViewV1 {
  readonly schemaVersion: typeof INTERACTIVE_POC_CONTROLLER_SCHEMA;
  readonly gameId: string;
  readonly phase: GameState['phase'];
  readonly lifecycle: NonNullable<GameState['battle']>['lifecycle'];
  readonly battleRound: number;
  readonly turnNumber: number;
  readonly activePlayerId: string | null;
  readonly actionPlayerId: string | null;
  readonly players: readonly InteractivePocPlayerViewV1[];
  readonly units: readonly InteractivePocUnitViewV1[];
  readonly actions: readonly InteractivePocActionV1[];
  readonly pendingDecision: DecisionRequest | null;
  readonly eventCount: number;
  readonly prngDraws: number;
  readonly limitations: typeof CORE_POC_TECHNICAL_LIMITATION_IDS;
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, 'en');
}

function activeUnitIdsByPlayer(state: GameState, playerId: string): string[] {
  return Object.values(state.units)
    .filter((unit) => unit.playerId === playerId && unit.models.some((model) => model.active))
    .map((unit) => unit.id)
    .sort(compareText);
}

function enemyUnitIds(state: GameState, playerId: string): string[] {
  const deployed = new Set(state.battle?.deployedUnitIds ?? []);
  return Object.values(state.units)
    .filter((unit) => unit.playerId !== playerId && deployed.has(unit.id) && unit.models.some((model) => model.active))
    .map((unit) => unit.id)
    .sort(compareText);
}

function action(
  kind: InteractivePocActionKindV1,
  actorId: string,
  label: string,
  options: Partial<Pick<InteractivePocActionV1, 'unitId' | 'decision' | 'requiredInputs' | 'candidateTargetUnitIds' | 'candidateWeaponProfileIds'>> = {}
): InteractivePocActionV1 {
  const subject = options.unitId ?? options.decision?.id ?? 'game';
  return {
    id: `${kind}:${subject}`,
    kind,
    label,
    actorId,
    ...(options.unitId === undefined ? {} : { unitId: options.unitId }),
    ...(options.decision === undefined ? {} : { decision: options.decision }),
    requiredInputs: options.requiredInputs ?? [],
    candidateTargetUnitIds: options.candidateTargetUnitIds ?? [],
    candidateWeaponProfileIds: options.candidateWeaponProfileIds ?? [],
    authority: 'engine-validation-required'
  };
}

function scoringPending(state: GameState): boolean {
  try {
    const battle = state.battle!;
    const checkpoint = missionScoringCheckpointV1(state);
    return state.mission?.scoredCheckpointIds?.includes(
      missionScoringCheckpointIdV1(battle.battleRound, battle.turnNumber, checkpoint)
    ) !== true;
  } catch {
    return false;
  }
}

function progressionActions(state: GameState): InteractivePocActionV1[] {
  const battle = state.battle!;
  const actorId = battle.activePlayerId;
  if (!actorId) return [];
  return scoringPending(state)
    ? [action('resolve-mission-scoring', actorId, 'Résoudre le score de mission')]
    : [action('advance-battle-phase', actorId, 'Terminer la phase')];
}

/** Derives a stable UI snapshot without mutating state or consuming PRNG. */
export function deriveInteractivePocViewV1(state: GameState, runtime: CorePocRuntimeV1): InteractivePocViewV1 {
  if (!runtime.readyForCompleteGame || runtime.session.completeGame === undefined || state.battle === null) {
    throw new RangeError('Le contrôleur interactif exige le runtime fixture-only V6 couvert.');
  }
  if (state.shootingEnvironmentFingerprint !== runtime.environment.fingerprint) {
    throw new RangeError('Le contrôleur interactif ne correspond pas à l’environnement de la session.');
  }

  const battle = state.battle;
  const pendingDecision = state.pendingDecisions[0] ?? null;
  const immediateBattleShockUnitId = Object.entries(state.unitTurnStatuses)
    .find(([, status]) => status.battleShockTestRequired === true)?.[0];
  let actions: InteractivePocActionV1[] = [];

  if (state.phase !== 'completed' && pendingDecision !== null) {
    actions = [action('resolve-decision', pendingDecision.playerId, pendingDecision.prompt, {
      decision: pendingDecision,
      requiredInputs: ['decision-option']
    })];
  } else if (state.phase !== 'completed' && state.pendingCharge !== null) {
    actions = [action('resolve-charge', state.pendingCharge.playerId, 'Résoudre le mouvement de charge', {
      unitId: state.pendingCharge.unitId,
      requiredInputs: ['charge-proceed', 'target-units', 'movement-paths'],
      candidateTargetUnitIds: state.pendingCharge.candidates.map((candidate) => candidate.unitId).sort(compareText)
    })];
  } else if (state.phase !== 'completed' && immediateBattleShockUnitId !== undefined) {
    const unit = state.units[immediateBattleShockUnitId]!;
    actions = [action('resolve-battle-shock-test', unit.playerId, `Tester immédiatement ${unit.id}`, { unitId: unit.id })];
  } else if (state.phase === 'deployment') {
    if (battle.lifecycle === 'deployment' && battle.nextDeploymentPlayerId !== null) {
      actions = Object.values(state.units)
        .filter((unit) => unit.playerId === battle.nextDeploymentPlayerId && !battle.deployedUnitIds.includes(unit.id))
        .sort((left, right) => compareText(left.id, right.id))
        .map((unit) => action('deploy-unit', unit.playerId, `Déployer ${unit.id}`, {
          unitId: unit.id,
          requiredInputs: ['model-poses']
        }));
    } else if (battle.firstPlayerId === null) {
      actions = [action('determine-first-player', battle.defenderPlayerId, 'Déterminer le premier joueur')];
    } else {
      actions = [action('start-battle', battle.firstPlayerId, 'Commencer la bataille')];
    }
  } else if (state.phase === 'command' && state.commandPhase?.stage !== 'complete') {
    const phase = state.commandPhase!;
    const pendingUnitId = phase.pendingBattleShockUnitIds[0];
    actions = pendingUnitId === undefined
      ? [action('resolve-command-stage', phase.activePlayerId, 'Résoudre l’étape de Commandement')]
      : [action('resolve-battle-shock-test', state.units[pendingUnitId]!.playerId, `Tester ${pendingUnitId}`, { unitId: pendingUnitId })];
    if (pendingUnitId !== undefined) {
      const actorId = state.units[pendingUnitId]!.playerId;
      const probe: Extract<GameCommand, { readonly type: 'use-insane-bravery' }> = {
        id: `${state.gameId}:interactive-probe:insane-bravery`, actorId, type: 'use-insane-bravery', unitId: pendingUnitId
      };
      if (validateGameCommand(state, probe) === null) actions.push(action('use-insane-bravery', actorId, `Utiliser Courage Insensé sur ${pendingUnitId}`, { unitId: pendingUnitId }));
    }
  } else if (state.phase === 'movement' && battle.activePlayerId !== null) {
    const playerId = battle.activePlayerId;
    actions = activeUnitIdsByPlayer(state, playerId)
      .filter((unitId) => !state.unitTurnStatuses[unitId]?.selectedForMovement)
      .map((unitId) => action('move-unit', playerId, `Déplacer ${unitId}`, {
        unitId,
        requiredInputs: ['movement-type', 'movement-paths']
      }));
    if (actions.length === 0) actions = progressionActions(state);
  } else if (state.phase === 'shooting' && battle.activePlayerId !== null) {
    const playerId = battle.activePlayerId;
    const targets = enemyUnitIds(state, playerId);
    actions = activeUnitIdsByPlayer(state, playerId)
      .filter((unitId) => !state.shootingSelectedUnitIds.includes(unitId))
      .flatMap((unitId) => {
        const profiles = state.units[unitId]!.weaponProfiles
          .filter((profile) => profile.weaponType !== 'melee')
          .map((profile) => profile.id)
          .sort(compareText);
        if (profiles.length === 0) return [];
        const options = {
          unitId,
          requiredInputs: ['weapon-profiles', 'target-units'] as const,
          candidateTargetUnitIds: targets,
          candidateWeaponProfileIds: profiles
        };
        return [
          action('resolve-basic-shooting', playerId, `Faire tirer ${unitId}`, options),
          action('resolve-split-fire', playerId, `Répartir les tirs de ${unitId}`, options)
        ];
      })
      .filter((candidate) => candidate.candidateWeaponProfileIds.length > 0);
    actions.push(...progressionActions(state));
  } else if (state.phase === 'charge' && battle.activePlayerId !== null) {
    const playerId = battle.activePlayerId;
    actions = activeUnitIdsByPlayer(state, playerId)
      .filter((unitId) => state.unitTurnStatuses[unitId]?.chargeDeclared !== true)
      .map((unitId) => action('declare-charge', playerId, `Déclarer une charge avec ${unitId}`, {
        unitId,
        candidateTargetUnitIds: enemyUnitIds(state, playerId)
      }))
      .filter((candidate) => candidate.candidateTargetUnitIds.length > 0);
    actions.push(...progressionActions(state));
  } else if (state.phase === 'fight' && state.fightPhase?.stage !== 'complete' && state.fightPhase?.currentPlayerId !== null) {
    const playerId = state.fightPhase!.currentPlayerId!;
    const targets = enemyUnitIds(state, playerId);
    actions = activeUnitIdsByPlayer(state, playerId).flatMap((unitId) => [
      action('resolve-fight-movement', playerId, `Déplacer ${unitId} au Combat`, { unitId, requiredInputs: ['movement-paths', 'target-units'], candidateTargetUnitIds: targets }),
      action('resolve-basic-melee', playerId, `Combattre avec ${unitId}`, {
        unitId,
        requiredInputs: ['weapon-profiles', 'target-units'],
        candidateTargetUnitIds: targets,
        candidateWeaponProfileIds: state.units[unitId]!.weaponProfiles.filter((profile) => profile.weaponType === 'melee').map((profile) => profile.id).sort(compareText)
      }),
      action('resolve-empty-fight', playerId, `Résoudre ${unitId} sans attaque`, { unitId })
    ]);
    for (const unit of Object.values(state.units).sort((left, right) => compareText(left.id, right.id))) {
      const probe: Extract<GameCommand, { readonly type: 'use-counter-offensive' }> = {
        id: `${state.gameId}:interactive-probe:counter-offensive:${unit.id}`,
        actorId: unit.playerId,
        type: 'use-counter-offensive',
        unitId: unit.id
      };
      if (validateGameCommand(state, probe) === null) {
        actions.push(action('use-counter-offensive', unit.playerId, `Utiliser Contre-offensive sur ${unit.id}`, { unitId: unit.id }));
      }
    }
    actions.push(action('pass-fight-window', playerId, 'Passer la fenêtre de Combat'));
  } else if (state.phase !== 'completed') {
    actions = progressionActions(state);
  }

  const deployed = new Set(battle.deployedUnitIds);
  const players = Object.values(state.players).sort((left, right) => compareText(left.id, right.id)).map((player) => ({
    id: player.id,
    displayName: player.displayName,
    commandPoints: state.battleResources?.commandPointsByPlayerId[player.id] ?? 0,
    score: state.mission?.scoresByPlayerId[player.id] ?? 0
  }));
  const units = Object.values(state.units).sort((left, right) => compareText(left.id, right.id)).map((unit): InteractivePocUnitViewV1 => ({
    id: unit.id,
    playerId: unit.playerId,
    deployed: deployed.has(unit.id),
    active: unit.models.some((model) => model.active),
    movement: unit.movement ?? 0,
    selectedForMovement: state.unitTurnStatuses[unit.id]?.selectedForMovement ?? false,
    selectedForShooting: state.shootingSelectedUnitIds.includes(unit.id),
    weaponProfileIds: unit.weaponProfiles.map((profile) => profile.id).sort(compareText),
    models: unit.models.map((member) => {
      const model = state.models[member.id]!;
      return {
        id: member.id,
        position: model.position,
        orientationDegrees: model.orientationDegrees,
        active: member.active,
        wounds: member.wounds
      };
    }).sort((left, right) => compareText(left.id, right.id))
  }));

  return {
    schemaVersion: INTERACTIVE_POC_CONTROLLER_SCHEMA,
    gameId: state.gameId,
    phase: state.phase,
    lifecycle: battle.lifecycle,
    battleRound: battle.battleRound,
    turnNumber: battle.turnNumber,
    activePlayerId: battle.activePlayerId,
    actionPlayerId: actions[0]?.actorId ?? null,
    players,
    units,
    actions,
    pendingDecision,
    eventCount: state.eventLog.length,
    prngDraws: state.prng.draws,
    limitations: CORE_POC_TECHNICAL_LIMITATION_IDS
  };
}

function reject(state: GameState, command: GameCommand, code: string, message: string): CommandExecution {
  const rejection: RuleRejection = { commandId: command.id, code, message, sourceRuleIds: ['ADR-026'] };
  return { accepted: false, state, rejection };
}

function executeDecision(state: GameState, command: Extract<GameCommand, { readonly type: 'resolve-decision' }>, runtime: CorePocRuntimeV1): CommandExecution {
  const kind = state.pendingDecisions.find((decision) => decision.id === command.decisionId)?.kind;
  if (kind === 'basic-melee-allocation') return executeBasicMeleeAllocationDecisionCommand(state, command, runtime.environment);
  if (kind === 'lethal-hits-choice') return executeLethalHitsDecisionCommand(state, command, runtime.environment);
  if (kind === 'generic-reroll-choice') return executeGenericRerollDecisionCommand(state, command, runtime.environment);
  if (kind === 'extended-allocation-group' || kind === 'extended-allocation-model' || kind === 'extended-hazardous-allocation') {
    return executeExtendedAllocationDecisionCommand(state, command, runtime.environment);
  }
  if (kind === 'duplicate-weapon-ability') return executeDuplicateWeaponAbilityDecisionCommand(state, command, runtime.environment);
  if (kind === 'split-fire-retarget') return executeSplitFireRetargetDecisionCommand(state, command, runtime.environment);
  return reject(state, command, 'interactive-decision-not-covered', 'Cette décision ne fait pas partie du POC interactif couvert.');
}

/**
 * Single authoritative gateway for every M10 UI command. React and Pixi may
 * construct declarations, but cannot bypass geometry, rules or the event log.
 */
export function executeInteractivePocCommandV1(state: GameState, command: GameCommand, runtime: CorePocRuntimeV1): CommandExecution {
  switch (command.type) {
    case 'deploy-unit': return executeDeploymentCommand(state, command, runtime.environment);
    case 'move-unit': return executeCompleteGameMovementCommand(state, command, runtime.environment);
    case 'resolve-basic-shooting': return executeBasicShootingCommand(state, command, runtime.environment);
    case 'resolve-split-fire': return executeSplitFireCommand(state, command, runtime.environment);
    case 'declare-charge': return executeDeclareChargeCommand(state, command, runtime.environment);
    case 'resolve-charge': return executeResolveChargeCommand(state, command, runtime.environment);
    case 'pass-fight-window': return executePassFightWindowCommand(state, command, runtime.environment);
    case 'resolve-fight-movement': return executeFightMovementCommand(state, command, runtime.environment);
    case 'resolve-basic-melee': return executeBasicMeleeCommand(state, command, runtime.environment);
    case 'resolve-empty-fight': return executeEmptyFightCommand(state, command, runtime.environment);
    case 'resolve-decision': return executeDecision(state, command, runtime);
    case 'resolve-mission-scoring':
      return executeMissionScoringCommand(state, command, {
        fingerprint: runtime.environment.fingerprint,
        physicalProfiles: runtime.environment.physicalProfiles,
        battleReadyByPlayerId: Object.fromEntries((state.battle?.playerIds ?? []).map((playerId) => [playerId, true]))
      });
    case 'advance-battle-phase': return executeObjectiveAwareAdvanceBattlePhaseCommand(state, command, runtime.environment);
    case 'determine-first-player':
    case 'start-battle':
    case 'resolve-command-stage':
    case 'resolve-battle-shock-test':
    case 'use-insane-bravery':
    case 'use-counter-offensive':
      return executeGameCommand(state, command);
    default:
      return reject(state, command, 'interactive-command-not-covered', `La commande ${command.type} n’est pas exposée par le POC interactif.`);
  }
}

export const INTERACTIVE_POC_MOVEMENT_TYPES: readonly UnitMovementTypeV1[] = [
  'remain-stationary',
  'normal',
  'advance',
  'fall-back'
];
