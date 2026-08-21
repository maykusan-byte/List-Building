import { executeGameCommand, type CommandExecution, type GameCommand, type GameState, type ModelState, type RuleRejection } from '../domain';
import { evaluateMovement, footprintDistance, type CircleFootprint } from '../geometry';
import type { M4RealRosterSessionPlan } from '../runtime/m4-real-roster-session';

const M4_MOVEMENT_RULE_IDS = ['weapon.pistol', 'simulator.m4.real-roster-movement'];

function reject(state: GameState, command: GameCommand, code: string, message: string, details?: RuleRejection['details']): CommandExecution {
  return {
    accepted: false,
    state,
    rejection: { commandId: command.id, code, message, sourceRuleIds: M4_MOVEMENT_RULE_IDS, ...(details ? { details } : {}) }
  };
}

function footprint(model: ModelState, runtime: M4RealRosterSessionPlan): CircleFootprint {
  const profile = runtime.environment.physicalProfiles[model.profileId];
  if (!profile || profile.baseShape.kind !== 'circle') throw new RangeError(`Profil M4 circulaire absent pour ${model.id}.`);
  return { kind: 'circle', center: model.position, radius: profile.baseShape.radius };
}

/**
 * Trusted normal-move gate for the real-roster pilot. It deliberately rejects
 * an Engagement Range position instead of silently invoking the [PISTOL]
 * exception, which is outside this shooting-only scenario.
 */
export function executeM4RealRosterMove(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'move-model' }>,
  runtime: M4RealRosterSessionPlan
): CommandExecution {
  const basic = executeGameCommand(state, command);
  if (!basic.accepted) return basic;
  const model = state.models[command.modelId];
  if (!model) return reject(state, command, 'unknown-model', 'Figurine M4 inconnue.');
  const moving = footprint(model, runtime);
  const verdict = evaluateMovement(
    moving,
    [{ position: model.position }, { position: command.to }],
    Object.values(state.models)
      .filter((candidate) => candidate.id !== model.id && candidate.active)
      .map((candidate) => ({ id: candidate.id, footprint: footprint(candidate, runtime) })),
    { board: { minX: 0, minY: 0, maxX: runtime.movement.board.width, maxY: runtime.movement.board.height } }
  );
  if (!verdict.allowed) {
    return reject(state, command, `movement-${verdict.reason}`, `Déplacement M4 refusé : ${verdict.reason}.`);
  }
  const maximum = runtime.movement.normalMoveByModelId[model.id];
  if (maximum === undefined) return reject(state, command, 'movement-profile-missing', 'Aucune limite de mouvement M4 n’est définie pour cette figurine.');
  if (verdict.pathLength > maximum) {
    return reject(state, command, 'movement-too-far', 'Déplacement M4 refusé : la distance de mouvement normal est dépassée.', { pathLength: verdict.pathLength, maximum });
  }
  const landing = { ...model, position: command.to };
  const entersEngagement = Object.values(state.models).some((candidate) => candidate.active
    && candidate.playerId !== model.playerId
    && footprintDistance(footprint(landing, runtime), footprint(candidate, runtime)) <= runtime.movement.engagementRange);
  if (entersEngagement) {
    return reject(state, command, 'movement-enters-engagement-range', 'Déplacement M4 refusé : finir en Engagement Range exigerait une règle [PISTOL] hors périmètre.');
  }
  return basic;
}
