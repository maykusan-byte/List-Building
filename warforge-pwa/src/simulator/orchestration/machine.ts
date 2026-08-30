import { assign, createActor, setup, type ActorRefFrom } from 'xstate';
import { executeGameCommand, type CommandExecution, type GameCommand, type GameState, type RuleRejection, type SimulatorPhase } from '../domain';
import type { SimulationAutosaveController } from '../persistence';
import type { SimulationCompatibilityReport } from './compatibility';
import { isSessionCompatible } from './compatibility';
import { executeDeploymentCommand } from './deployment';
import { executeCompleteGameMovementCommand } from './battle-movement';
import { executeDeclareChargeCommand, executeResolveChargeCommand } from './battle-charge';
import { executeBasicMeleeAllocationDecisionCommand, executeBasicMeleeCommand, executeEmptyFightCommand, executeFightMovementCommand, executePassFightWindowCommand } from './battle-fight';
import { executeObjectiveAwareAdvanceBattlePhaseCommand } from './objective-control';
import { executeBasicShootingCommand, executeDuplicateWeaponAbilityDecisionCommand, executeExtendedAllocationDecisionCommand, executeGenericRerollDecisionCommand, executeLethalHitsDecisionCommand, executeOathOfMomentSelectionCommand, executeSplitFireCommand, executeSplitFireRetargetDecisionCommand, type ShootingEnvironment } from './shooting';

const COVERAGE_RULE_ID = 'simulator.core.coverage-compatibility';

export type SimulatorMachineEvent =
  | { readonly type: 'COMMAND'; readonly command: GameCommand }
  | { readonly type: 'CLEAR_REJECTION' };

/**
 * The statechart owns only orchestration metadata.  `gameState` is the exact
 * reducer result; phases, events and rules are never reimplemented here.
 */
export interface SimulatorMachineContext {
  readonly initialState: GameState;
  readonly gameState: GameState;
  readonly compatibility: SimulationCompatibilityReport | null;
  readonly lastRejection: RuleRejection | null;
}

export interface CreateSimulatorMachineInput {
  /** The event-free state from which the event log can be replayed. */
  readonly initialState: GameState;
  /** Use when restoring an already played save; defaults to `initialState`. */
  readonly gameState?: GameState;
  /** Required to start a new session; restored sessions preserve the original gate. */
  readonly compatibility?: SimulationCompatibilityReport | null;
  /** Immutable, trusted scenario/rulepack/geometry facts for shooting commands. */
  readonly shootingEnvironment?: ShootingEnvironment;
  /** Optional authoritative movement policy for a closed scenario such as M4. */
  readonly movementCommandResolver?: MovementCommandResolver;
}

export interface MovementCommandResolver {
  execute(state: GameState, command: Extract<GameCommand, { readonly type: 'move-model' }>): CommandExecution;
}

type PhaseMachineState = SimulatorPhase;

function rejectionForIncompleteCoverage(command: Extract<GameCommand, { readonly type: 'setup-session' }>): RuleRejection {
  return {
    commandId: command.id,
    code: 'incomplete-coverage',
    message: 'La partie ne peut pas démarrer tant que toutes ses dépendances ne sont pas couvertes.',
    sourceRuleIds: [COVERAGE_RULE_ID]
  };
}

function executeOrchestratedCommand(
  context: SimulatorMachineContext,
  command: GameCommand,
  shootingEnvironment?: ShootingEnvironment,
  movementCommandResolver?: MovementCommandResolver
): CommandExecution {
  if (command.type === 'setup-session' && (!context.compatibility || !isSessionCompatible(command.session, context.compatibility))) {
    return { accepted: false, state: context.gameState, rejection: rejectionForIncompleteCoverage(command) };
  }
  if (command.type === 'setup-session' && shootingEnvironment && command.session.shootingEnvironmentFingerprint !== shootingEnvironment.fingerprint) {
    return {
      accepted: false,
      state: context.gameState,
      rejection: {
        commandId: command.id,
        code: 'shooting-environment-mismatch',
        message: 'L’environnement de tir ne correspond pas à la session.',
        sourceRuleIds: ['simulator.core.trusted-shooting-environment']
      }
    };
  }
  if (command.type === 'advance-battle-phase' && (context.gameState.mission?.objectiveMarkers.length ?? 0) > 0) {
    if (!shootingEnvironment) return {
      accepted: false,
      state: context.gameState,
      rejection: {
        commandId: command.id,
        code: 'trusted-objective-environment-required',
        message: 'Le contrôle des objectifs doit être résolu par l’environnement physique autoritaire.',
        sourceRuleIds: ['14.01', '14.02', '14.01.01']
      }
    };
    return executeObjectiveAwareAdvanceBattlePhaseCommand(context.gameState, command, shootingEnvironment);
  }
  if (command.type === 'deploy-unit') {
    if (!shootingEnvironment) {
      return {
        accepted: false,
        state: context.gameState,
        rejection: {
          commandId: command.id,
          code: 'trusted-deployment-environment-required',
          message: 'Le déploiement doit être vérifié par l’environnement physique autoritaire.',
          sourceRuleIds: ['simulator.core.trusted-deployment-environment']
        }
      };
    }
    return executeDeploymentCommand(context.gameState, command, shootingEnvironment);
  }
  if (command.type === 'move-unit') {
    if (!shootingEnvironment) {
      return {
        accepted: false,
        state: context.gameState,
        rejection: {
          commandId: command.id,
          code: 'trusted-movement-environment-required',
          message: 'Le mouvement doit être vérifié par l’environnement physique autoritaire.',
          sourceRuleIds: ['simulator.core.trusted-deployment-environment']
        }
      };
    }
    return executeCompleteGameMovementCommand(context.gameState, command, shootingEnvironment);
  }
  if (command.type === 'declare-charge' || command.type === 'resolve-charge') {
    if (!shootingEnvironment) {
      return {
        accepted: false,
        state: context.gameState,
        rejection: {
          commandId: command.id,
          code: 'trusted-charge-environment-required',
          message: 'La charge doit être résolue par l’environnement physique autoritaire.',
          sourceRuleIds: ['simulator.core.trusted-charge-environment']
        }
      };
    }
    return command.type === 'declare-charge'
      ? executeDeclareChargeCommand(context.gameState, command, shootingEnvironment)
      : executeResolveChargeCommand(context.gameState, command, shootingEnvironment);
  }
  if (command.type === 'pass-fight-window' || command.type === 'resolve-fight-movement' || command.type === 'resolve-basic-melee' || command.type === 'resolve-empty-fight') {
    if (!shootingEnvironment) {
      return { accepted: false, state: context.gameState, rejection: {
        commandId: command.id, code: 'trusted-fight-environment-required', message: 'Le combat doit être résolu par l’environnement physique autoritaire.', sourceRuleIds: ['simulator.core.trusted-fight-environment']
      } };
    }
    if (command.type === 'pass-fight-window') return executePassFightWindowCommand(context.gameState, command, shootingEnvironment);
    if (command.type === 'resolve-fight-movement') return executeFightMovementCommand(context.gameState, command, shootingEnvironment);
    if (command.type === 'resolve-empty-fight') return executeEmptyFightCommand(context.gameState, command, shootingEnvironment);
    return executeBasicMeleeCommand(context.gameState, command, shootingEnvironment);
  }
  if (command.type === 'resolve-basic-shooting') {
    if (!shootingEnvironment) {
      return {
        accepted: false,
        state: context.gameState,
        rejection: {
          commandId: command.id,
          code: 'trusted-shooting-environment-required',
          message: 'Le tir doit être résolu par un environnement spatial autoritaire.',
          sourceRuleIds: ['simulator.core.trusted-shooting-environment']
        }
      };
    }
    return executeBasicShootingCommand(context.gameState, command, shootingEnvironment);
  }
  if (command.type === 'resolve-split-fire') {
    if (!shootingEnvironment) {
      return {
        accepted: false,
        state: context.gameState,
        rejection: {
          commandId: command.id,
          code: 'trusted-shooting-environment-required',
          message: 'Le tir partagé doit être résolu par un environnement spatial autoritaire.',
          sourceRuleIds: ['simulator.core.trusted-shooting-environment']
        }
      };
    }
    return executeSplitFireCommand(context.gameState, command, shootingEnvironment);
  }
  if (command.type === 'select-oath-of-moment-target') {
    if (!shootingEnvironment) {
      return {
        accepted: false,
        state: context.gameState,
        rejection: {
          commandId: command.id,
          code: 'trusted-shooting-environment-required',
          message: 'Oath of Moment exige un environnement autoritaire.',
          sourceRuleIds: ['simulator.core.trusted-shooting-environment']
        }
      };
    }
    return executeOathOfMomentSelectionCommand(context.gameState, command, shootingEnvironment);
  }
  if (command.type === 'resolve-decision' && context.gameState.pendingDecisions.some((decision) => decision.id === command.decisionId && decision.kind === 'lethal-hits-choice')) {
    if (!shootingEnvironment) {
      return {
        accepted: false,
        state: context.gameState,
        rejection: {
          commandId: command.id,
          code: 'trusted-shooting-environment-required',
          message: '[TOUCHES FATALES] exige un environnement autoritaire.',
          sourceRuleIds: ['simulator.core.trusted-shooting-environment']
        }
      };
    }
    return executeLethalHitsDecisionCommand(context.gameState, command, shootingEnvironment);
  }
  if (command.type === 'resolve-decision' && context.gameState.pendingDecisions.some((decision) => decision.id === command.decisionId && decision.kind === 'generic-reroll-choice')) {
    if (!shootingEnvironment) {
      return {
        accepted: false,
        state: context.gameState,
        rejection: { commandId: command.id, code: 'trusted-shooting-environment-required', message: 'Les relances génériques exigent un environnement de tir autoritaire.', sourceRuleIds: [COVERAGE_RULE_ID] }
      };
    }
    return executeGenericRerollDecisionCommand(context.gameState, command, shootingEnvironment);
  }
  if (command.type === 'resolve-decision' && context.gameState.pendingDecisions.some((decision) => decision.id === command.decisionId && decision.kind === 'duplicate-weapon-ability')) {
    if (!shootingEnvironment) return {
      accepted: false,
      state: context.gameState,
      rejection: { commandId: command.id, code: 'shooting-environment-required', message: 'Le choix d’aptitude dupliquée exige un environnement de tir autoritaire.', sourceRuleIds: ['simulator.core.trusted-shooting-environment'] }
    };
    return executeDuplicateWeaponAbilityDecisionCommand(context.gameState, command, shootingEnvironment);
  }
  if (command.type === 'resolve-decision' && context.gameState.pendingDecisions.some((decision) => decision.id === command.decisionId && decision.kind === 'split-fire-retarget')) {
    if (!shootingEnvironment) return {
      accepted: false,
      state: context.gameState,
      rejection: { commandId: command.id, code: 'trusted-shooting-environment-required', message: 'Le reciblage d’un tir partagé exige un environnement de tir autoritaire.', sourceRuleIds: ['simulator.core.trusted-shooting-environment'] }
    };
    return executeSplitFireRetargetDecisionCommand(context.gameState, command, shootingEnvironment);
  }
  if (command.type === 'resolve-decision' && context.gameState.pendingDecisions.some((decision) => decision.id === command.decisionId
    && (decision.kind === 'extended-allocation-group' || decision.kind === 'extended-allocation-model' || decision.kind === 'extended-hazardous-allocation'))) {
    if (!shootingEnvironment) return {
      accepted: false,
      state: context.gameState,
      rejection: { commandId: command.id, code: 'shooting-environment-required', message: 'Une décision de tir étendue exige un environnement de tir autoritaire.', sourceRuleIds: ['simulator.core.trusted-shooting-environment'] }
    };
    return executeExtendedAllocationDecisionCommand(context.gameState, command, shootingEnvironment);
  }
  if (command.type === 'resolve-decision' && context.gameState.pendingDecisions.some((decision) => decision.id === command.decisionId && decision.kind === 'basic-melee-allocation')) {
    if (!shootingEnvironment) return {
      accepted: false,
      state: context.gameState,
      rejection: { commandId: command.id, code: 'trusted-fight-environment-required', message: 'L’allocation de mêlée exige un environnement de Combat autoritaire.', sourceRuleIds: ['05.04'] }
    };
    return executeBasicMeleeAllocationDecisionCommand(context.gameState, command, shootingEnvironment);
  }
  if (command.type === 'move-model' && movementCommandResolver) {
    return movementCommandResolver.execute(context.gameState, command);
  }
  return executeGameCommand(context.gameState, command);
}

function commandReachesPhase(context: SimulatorMachineContext, event: SimulatorMachineEvent, expected: PhaseMachineState, shootingEnvironment?: ShootingEnvironment, movementCommandResolver?: MovementCommandResolver): boolean {
  if (event.type !== 'COMMAND') return false;
  const execution = executeOrchestratedCommand(context, event.command, shootingEnvironment, movementCommandResolver);
  return execution.accepted && execution.state.phase === expected;
}

function commandOpensDecision(context: SimulatorMachineContext, event: SimulatorMachineEvent, shootingEnvironment?: ShootingEnvironment, movementCommandResolver?: MovementCommandResolver): boolean {
  if (event.type !== 'COMMAND') return false;
  const execution = executeOrchestratedCommand(context, event.command, shootingEnvironment, movementCommandResolver);
  return execution.accepted && context.gameState.pendingDecisions.length === 0 && context.gameState.pendingCharge === null
    && (execution.state.pendingDecisions.length > 0 || execution.state.pendingCharge !== null);
}

function commandClosesDecision(context: SimulatorMachineContext, event: SimulatorMachineEvent, shootingEnvironment?: ShootingEnvironment, movementCommandResolver?: MovementCommandResolver): boolean {
  if (event.type !== 'COMMAND') return false;
  const execution = executeOrchestratedCommand(context, event.command, shootingEnvironment, movementCommandResolver);
  return execution.accepted && (context.gameState.pendingDecisions.length > 0 || context.gameState.pendingCharge !== null)
    && execution.state.pendingDecisions.length === 0 && execution.state.pendingCharge === null;
}

function phaseIs(context: SimulatorMachineContext, expected: PhaseMachineState): boolean {
  return context.gameState.phase === expected;
}

function hasPendingDecision(context: SimulatorMachineContext): boolean {
  return context.gameState.pendingDecisions.length > 0 || context.gameState.pendingCharge !== null;
}

function applyCommand(context: SimulatorMachineContext, event: SimulatorMachineEvent, shootingEnvironment?: ShootingEnvironment, movementCommandResolver?: MovementCommandResolver): SimulatorMachineContext {
  if (event.type !== 'COMMAND') return context;
  const execution = executeOrchestratedCommand(context, event.command, shootingEnvironment, movementCommandResolver);
  return execution.accepted
    ? { ...context, gameState: execution.state, lastRejection: null }
    : { ...context, lastRejection: execution.rejection };
}

/**
 * Creates the XState v5 orchestration chart.  It is intentionally recreated
 * for each session so that no state leaks between concurrent local games.
 */
export function createSimulatorMachine(input: CreateSimulatorMachineInput) {
  const initialContext: SimulatorMachineContext = {
    initialState: input.initialState,
    gameState: input.gameState ?? input.initialState,
    compatibility: input.compatibility ?? null,
    lastRejection: null
  };

  return setup({
    types: {
      context: {} as SimulatorMachineContext,
      events: {} as SimulatorMachineEvent
    },
    actions: {
      applyCommand: assign(({ context, event }) => applyCommand(context, event, input.shootingEnvironment, input.movementCommandResolver)),
      clearRejection: assign(({ context }) => ({ ...context, lastRejection: null }))
    },
    guards: {
      commandReachesPhase: ({ context, event }, parameters: { readonly phase: PhaseMachineState }) => commandReachesPhase(context, event, parameters.phase, input.shootingEnvironment, input.movementCommandResolver),
      commandOpensDecision: ({ context, event }) => commandOpensDecision(context, event, input.shootingEnvironment, input.movementCommandResolver),
      commandClosesDecision: ({ context, event }) => commandClosesDecision(context, event, input.shootingEnvironment, input.movementCommandResolver),
      hasPendingDecision: ({ context }) => hasPendingDecision(context),
      phaseIs: ({ context }, parameters: { readonly phase: PhaseMachineState }) => phaseIs(context, parameters.phase)
    }
  }).createMachine({
    id: 'warforge-simulator',
    initial: 'active',
    context: initialContext,
    states: {
      active: {
        initial: 'synchronizing',
        on: {
          CLEAR_REJECTION: { actions: 'clearRejection' }
        },
        states: {
          synchronizing: {
            always: [
              { guard: 'hasPendingDecision', target: 'decision' },
              ...(['setup', 'deployment', 'command', 'movement', 'shooting', 'charge', 'fight', 'completed'] as const).map((phase) => ({
                guard: { type: 'phaseIs' as const, params: { phase } },
                target: phase
              }))
            ]
          },
          setup: {
            on: {
              COMMAND: [
                { guard: 'commandOpensDecision', actions: 'applyCommand', target: 'decision' },
                { guard: { type: 'commandReachesPhase', params: { phase: 'deployment' } }, actions: 'applyCommand', target: 'deployment' },
                { actions: 'applyCommand' }
              ]
            }
          },
          deployment: {
            on: {
              COMMAND: [
                { guard: 'commandOpensDecision', actions: 'applyCommand', target: 'decision' },
                { guard: { type: 'commandReachesPhase', params: { phase: 'command' } }, actions: 'applyCommand', target: 'command' },
                { actions: 'applyCommand' }
              ]
            }
          },
          command: {
            on: {
              COMMAND: [
                { guard: 'commandOpensDecision', actions: 'applyCommand', target: 'decision' },
                { guard: { type: 'commandReachesPhase', params: { phase: 'movement' } }, actions: 'applyCommand', target: 'movement' },
                { actions: 'applyCommand' }
              ]
            }
          },
          movement: {
            on: {
              COMMAND: [
                { guard: 'commandOpensDecision', actions: 'applyCommand', target: 'decision' },
                { guard: { type: 'commandReachesPhase', params: { phase: 'shooting' } }, actions: 'applyCommand', target: 'shooting' },
                { actions: 'applyCommand' }
              ]
            }
          },
          shooting: {
            on: {
              COMMAND: [
                { guard: 'commandOpensDecision', actions: 'applyCommand', target: 'decision' },
                { guard: { type: 'commandReachesPhase', params: { phase: 'charge' } }, actions: 'applyCommand', target: 'charge' },
                { actions: 'applyCommand' }
              ]
            }
          },
          charge: {
            on: {
              COMMAND: [
                { guard: 'commandOpensDecision', actions: 'applyCommand', target: 'decision' },
                { guard: { type: 'commandReachesPhase', params: { phase: 'fight' } }, actions: 'applyCommand', target: 'fight' },
                { actions: 'applyCommand' }
              ]
            }
          },
          fight: {
            on: {
              COMMAND: [
                { guard: 'commandOpensDecision', actions: 'applyCommand', target: 'decision' },
                { guard: { type: 'commandReachesPhase', params: { phase: 'completed' } }, actions: 'applyCommand', target: 'completed' },
                { guard: { type: 'commandReachesPhase', params: { phase: 'command' } }, actions: 'applyCommand', target: 'command' },
                { actions: 'applyCommand' }
              ]
            }
          },
          completed: {
            on: { COMMAND: { actions: 'applyCommand' } }
          },
          decision: {
            on: {
              COMMAND: [
                { guard: 'commandClosesDecision', actions: 'applyCommand', target: 'synchronizing' },
                { actions: 'applyCommand' }
              ]
            }
          }
        }
      }
    }
  });
}

export type SimulatorActor = ActorRefFrom<ReturnType<typeof createSimulatorMachine>>;

export function createSimulatorActor(input: CreateSimulatorMachineInput): SimulatorActor {
  return createActor(createSimulatorMachine(input));
}

/** Stable command boundary for UI/adapters; callers never send reducer events directly. */
export function dispatchGameCommand(actor: SimulatorActor, command: GameCommand): void {
  actor.send({ type: 'COMMAND', command });
}

export function clearSimulatorRejection(actor: SimulatorActor): void {
  actor.send({ type: 'CLEAR_REJECTION' });
}

export function getSimulatorGameState(actor: SimulatorActor): GameState {
  return actor.getSnapshot().context.gameState;
}

export function getSimulatorInitialState(actor: SimulatorActor): GameState {
  return actor.getSnapshot().context.initialState;
}

export interface SimulatorAutosaveSubscription {
  /** Resolves once every accepted command observed so far has been persisted. */
  flush(): Promise<void>;
  unsubscribe(): void;
}

/**
 * Persists only reducer-produced event-log changes.  Rejections and visual
 * statechart transitions do not create durable records, preserving a compact
 * replay log.
 */
export function attachSimulatorAutosave(actor: SimulatorActor, controller: SimulationAutosaveController): SimulatorAutosaveSubscription {
  let lastEventCount = actor.getSnapshot().context.gameState.eventLog.length;
  let queue: Promise<void> = Promise.resolve();
  let recoveredWriteError: unknown = null;
  let hasRecoveredWriteError = false;
  const subscription = actor.subscribe({
    next(snapshot) {
      const { initialState, gameState } = snapshot.context;
      if (gameState.eventLog.length === lastEventCount) return;
      lastEventCount = gameState.eventLog.length;
      // A failed write must not prevent a later accepted command from trying
      // again. Keep the failure for `flush()` rather than silently dropping it.
      queue = queue.catch((error: unknown) => {
        recoveredWriteError = error;
        hasRecoveredWriteError = true;
      }).then(() => controller.autosave(initialState, gameState).then(() => undefined));
    }
  });
  return {
    flush: async () => {
      await queue;
      if (hasRecoveredWriteError) {
        const error = recoveredWriteError;
        recoveredWriteError = null;
        hasRecoveredWriteError = false;
        throw error;
      }
    },
    unsubscribe: () => subscription.unsubscribe()
  };
}
