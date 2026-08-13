import { executeGameCommand, type CommandExecution, type GameCommand, type GameState, type ModelState, type RuleRejection } from '../domain';
import { checkUnitCoherency, evaluateMovement, type CircleFootprint } from '../geometry';
import type { ClosedDuelRuntime } from '../runtime/closed-duel';

function rejection(command: GameCommand, code: string, message: string): CommandExecution {
  const rule: RuleRejection = { commandId: command.id, code, message, sourceRuleIds: ['simulator.closed-duel.movement'] };
  return { accepted: false, state: null as unknown as GameState, rejection: rule };
}

function footprint(model: ModelState, runtime: ClosedDuelRuntime): CircleFootprint {
  const profile = runtime.environment.physicalProfiles[model.profileId];
  if (!profile || profile.baseShape.kind !== 'circle') throw new RangeError('Profil fermé de mouvement absent.');
  return { kind: 'circle', center: model.position, radius: profile.baseShape.radius };
}

/** Authoritative movement gate: range, swept collision, board and post-move coherency. */
export function executeClosedDuelMove(state: GameState, command: Extract<GameCommand, { readonly type: 'move-model' }>, runtime: ClosedDuelRuntime): CommandExecution {
  const basic = executeGameCommand(state, command);
  if (!basic.accepted) return basic;
  const model = state.models[command.modelId];
  if (!model) return rejection(command, 'unknown-model', 'Figurine inconnue.');
  const moving = footprint(model, runtime);
  const verdict = evaluateMovement(moving, [{ position: model.position }, { position: command.to }],
    Object.values(state.models).filter((candidate) => candidate.id !== model.id && candidate.active).map((candidate) => ({ id: candidate.id, footprint: footprint(candidate, runtime) })),
    { board: { minX: 0, minY: 0, maxX: runtime.board.width, maxY: runtime.board.height } });
  if (!verdict.allowed) return { accepted: false, state, rejection: { commandId: command.id, code: `movement-${verdict.reason}`, message: `Déplacement refusé : ${verdict.reason}.`, sourceRuleIds: ['simulator.closed-duel.movement'] } };
  if (verdict.pathLength > runtime.moveDistance) return { accepted: false, state, rejection: { commandId: command.id, code: 'movement-too-far', message: 'Déplacement refusé : la limite de 6 pouces est dépassée.', sourceRuleIds: ['simulator.closed-duel.movement'], details: { pathLength: verdict.pathLength, maximum: runtime.moveDistance } } };
  const ownerUnit = Object.values(state.units).find((unit) => unit.models.some((entry) => entry.id === model.id));
  if (!ownerUnit) return { accepted: false, state, rejection: { commandId: command.id, code: 'movement-unit-missing', message: 'Déplacement refusé : unité fermée absente.', sourceRuleIds: ['simulator.closed-duel.movement'] } };
  const coherence = checkUnitCoherency(ownerUnit.models.filter((entry) => entry.active).map((entry) => {
    const member = state.models[entry.id];
    return { id: member.id, footprint: footprint(member.id === model.id ? { ...member, position: command.to } : member, runtime) };
  }), runtime.coherencyDistance);
  if (!coherence.isCoherent) return { accepted: false, state, rejection: { commandId: command.id, code: 'movement-breaks-coherency', message: `Déplacement refusé : cohérence perdue (${coherence.incoherentMemberIds.join(', ')}).`, sourceRuleIds: ['simulator.closed-duel.movement'] } };
  return basic;
}
