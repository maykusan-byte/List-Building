import { rollDice } from './prng';
import { canTransitionPhase, reduceGameEvent } from './reducer';
import { hasSupportedAttackVolumeAbilities } from '../rules/attack-volume';
import { hasSupportedWeaponKeywords } from '../rules/weapon-keywords';
import { parseRandomCharacteristicExpression } from '../rules/random-characteristics';
import { resolveCharacteristicModifierPlan, resolveDieRollModifierPlan } from '../rules/modifiers';
import type { CommandExecution, GameCommand, GameEvent, GameState, RuleRejection, SessionSetup, UnitSetup, WeaponProfileV1, WorldPoint } from './types';

const PHASE_RULE_ID = 'simulator.core.phase-sequence';
const SETUP_RULE_ID = 'simulator.core.session-setup';
const MOVEMENT_RULE_ID = 'simulator.core.movement';
const DICE_RULE_ID = 'simulator.core.dice';
const DECISION_RULE_ID = 'simulator.core.decision-window';
const SHOOTING_RULE_ID = 'core.basic-ranged-attack';
const UNIT_SELECTED_TO_SHOOT_RULE_ID = 'core.unit-selected-to-shoot';
const TRUSTED_SHOOTING_ENVIRONMENT_RULE_ID = 'simulator.core.trusted-shooting-environment';

function reject(command: GameCommand, code: string, message: string, sourceRuleIds: readonly string[], details?: Readonly<Record<string, string | number | boolean>>): RuleRejection {
  return { commandId: command.id, code, message, sourceRuleIds, ...(details ? { details } : {}) };
}

/** Compatibility bridge for the M3/M4 single-profile command shape. */
export function declaredShootingWeaponProfileIds(command: Extract<GameCommand, { readonly type: 'resolve-basic-shooting' }>): readonly string[] {
  return Array.isArray(command.weaponProfileIds)
    ? command.weaponProfileIds
    : typeof command.weaponProfileId === 'string' ? [command.weaponProfileId] : [];
}

function hasOnlyShootingCommandFields(command: Extract<GameCommand, { readonly type: 'resolve-basic-shooting' }>): boolean {
  const allowed = new Set(['id', 'actorId', 'type', 'attackerUnitId', 'targetUnitId', 'weaponProfileId', 'weaponProfileIds']);
  return Object.keys(command).every((key) => allowed.has(key));
}

function isIntegerPoint(point: WorldPoint): boolean {
  return Number.isInteger(point.x) && Number.isInteger(point.y);
}

function isFiniteAngle(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value < 360;
}

function hasValidSourceReferences(references: readonly { readonly sourceId: string; readonly version: string; readonly effectiveFrom: string }[]): boolean {
  return references.length > 0 && references.every((reference) => reference.sourceId.trim() && reference.version.trim() && !Number.isNaN(Date.parse(reference.effectiveFrom)));
}

function isValidWeaponProfile(weapon: WeaponProfileV1): boolean {
  const randomCharacteristicsValid = (weapon.randomAttacks === undefined || parseRandomCharacteristicExpression(weapon.randomAttacks).accepted)
    && (weapon.randomDamage === undefined || parseRandomCharacteristicExpression(weapon.randomDamage).accepted);
  const modifierPlan = weapon.modifierPlan;
  const modifiersValid = modifierPlan === undefined || (
    (modifierPlan.range === undefined || resolveCharacteristicModifierPlan({ characteristic: 'range', baseValue: weapon.range, ...modifierPlan.range }).accepted)
    && (modifierPlan.attacks === undefined || resolveCharacteristicModifierPlan({ characteristic: 'attacks', baseValue: weapon.attacks, ...modifierPlan.attacks }).accepted)
    && (modifierPlan.ballisticSkill === undefined || resolveCharacteristicModifierPlan({ characteristic: 'ballistic-skill', baseValue: weapon.ballisticSkill, ...modifierPlan.ballisticSkill }).accepted)
    && (modifierPlan.hitRoll === undefined || resolveDieRollModifierPlan({ rollKind: 'hit', unmodifiedRoll: 1, sides: 6, ...modifierPlan.hitRoll }).accepted)
  );
  return weapon.id.trim().length > 0
    && weapon.displayName.trim().length > 0
    && [weapon.range, weapon.attacks, weapon.ballisticSkill, weapon.strength, weapon.damage]
      .every((value) => Number.isInteger(value) && value >= 0)
    && weapon.range >= 0
    && weapon.attacks > 0
    && weapon.ballisticSkill >= 2 && weapon.ballisticSkill <= 6
    && weapon.strength > 0 && weapon.damage > 0
    && Number.isInteger(weapon.armourPenetration) && weapon.armourPenetration <= 0
    && hasSupportedAttackVolumeAbilities(weapon)
    && hasSupportedWeaponKeywords(weapon.weaponKeywords)
    && randomCharacteristicsValid
    && modifiersValid
    && hasValidSourceReferences(weapon.sourceRefs);
}

function hasValidCoverageSubject(value: UnitSetup['coverageSubject']): boolean {
  return value === undefined || (
    typeof value === 'object'
    && value !== null
    && (value.subjectType === 'fixture-unit' || value.subjectType === 'unit')
    && typeof value.subjectId === 'string'
    && value.subjectId.trim().length > 0
  );
}

function validateUnits(session: SessionSetup, playerIds: ReadonlySet<string>, command: GameCommand): RuleRejection | null {
  const units = session.units ?? [];
  const knownModels = new Map(session.models.map((model) => [model.id, model]));
  const unitIds = new Set<string>();
  const allocatedModelIds = new Set<string>();
  for (const unit of units) {
    if (!unit.id.trim() || !unit.fixtureId?.trim() || unitIds.has(unit.id) || !playerIds.has(unit.playerId)) {
      return reject(command, 'invalid-unit', 'Les unités doivent avoir un identifiant unique et un propriétaire de session.', [SETUP_RULE_ID], { unitId: unit.id });
    }
    unitIds.add(unit.id);
    if (!hasValidCoverageSubject(unit.coverageSubject)) {
      return reject(command, 'invalid-unit-coverage-subject', 'Une unité doit déclarer un sujet de couverture fixture-unit ou unit non vide.', [SETUP_RULE_ID], { unitId: unit.id });
    }
    if (!Number.isInteger(unit.toughness) || unit.toughness <= 0 || !Number.isInteger(unit.save) || unit.save < 2 || unit.save > 7 || !Number.isInteger(unit.woundsPerModel) || unit.woundsPerModel <= 0 || unit.modelIds.length === 0 || new Set(unit.modelIds).size !== unit.modelIds.length || unit.modelIds.some((modelId) => !modelId.trim())) {
      return reject(command, 'invalid-unit-profile', 'Une unité doit avoir des caractéristiques fermées et des figurines réelles uniques.', [SETUP_RULE_ID], { unitId: unit.id });
    }
    if (!hasValidSourceReferences(unit.sourceRefs) || new Set(unit.keywords).size !== unit.keywords.length || unit.keywords.some((keyword) => !keyword.trim())) {
      return reject(command, 'invalid-unit-provenance', 'Une unité doit déclarer ses mots-clés et ses sources exécutables.', [SETUP_RULE_ID], { unitId: unit.id });
    }
    for (const modelId of unit.modelIds) {
      const model = knownModels.get(modelId);
      if (!model || model.playerId !== unit.playerId || allocatedModelIds.has(modelId)) {
        return reject(command, 'invalid-unit-model', 'Une figurine d’unité doit exister, appartenir au joueur et ne servir qu’à une unité.', [SETUP_RULE_ID], { unitId: unit.id, modelId });
      }
      allocatedModelIds.add(modelId);
    }
    const weaponIds = new Set<string>();
    if (unit.weaponProfiles.length === 0 || unit.weaponProfiles.some((weapon) => !isValidWeaponProfile(weapon) || weaponIds.has(weapon.id) || (weaponIds.add(weapon.id), false))) {
      return reject(command, 'invalid-weapon-profile', 'Les profils d’arme d’une unité doivent être uniques, fermés et sourcés.', [SETUP_RULE_ID], { unitId: unit.id });
    }
    const assignments = unit.weaponAssignments ?? [];
    const assignmentKeys = new Set<string>();
    if (assignments.some((assignment) => {
      const key = `${assignment.modelId}:${assignment.weaponProfileId}`;
      const invalid = !unit.modelIds.includes(assignment.modelId)
        || !weaponIds.has(assignment.weaponProfileId)
        || !Number.isInteger(assignment.quantity)
        || assignment.quantity < 1
        || assignmentKeys.has(key);
      assignmentKeys.add(key);
      return invalid;
    })) return reject(command, 'invalid-weapon-assignment', 'Chaque arme doit être assignée en quantité positive à une figurine réelle unique.', [SETUP_RULE_ID], { unitId: unit.id });
    if (unit.extendedDefence !== undefined && (unit.coverageSubject?.subjectType === 'unit'
      || Object.keys(unit.extendedDefence).some((modelId) => !unit.modelIds.includes(modelId)
        || ![undefined, 2, 3, 4, 5, 6].includes(unit.extendedDefence![modelId]?.invulnerableSave)
        || ![undefined, 2, 3, 4, 5, 6].includes(unit.extendedDefence![modelId]?.feelNoPain)
        || (unit.extendedDefence![modelId]?.isCharacter !== undefined && typeof unit.extendedDefence![modelId]?.isCharacter !== 'boolean')
        || !unit.extendedDefence![modelId]?.source?.sourceId?.trim()
        || !unit.extendedDefence![modelId]?.source?.version?.trim()
        || Number.isNaN(Date.parse(unit.extendedDefence![modelId]?.source?.effectiveFrom ?? ''))
        || (unit.extendedDefence![modelId]?.allocationGroupId !== undefined && !unit.extendedDefence![modelId]!.allocationGroupId!.trim())))) {
      return reject(command, 'invalid-extended-fixture-defence', 'Les défenses étendues ne sont autorisées que pour des fixtures avec des valeurs sourcées fermées.', [SETUP_RULE_ID], { unitId: unit.id });
    }
  }
  return null;
}

function validateSession(session: SessionSetup, command: GameCommand): RuleRejection | null {
  if (session.manifest.schemaVersion !== 'warforge-simulator/v1') return reject(command, 'unsupported-manifest', 'Le manifeste du simulateur n’est pas compatible.', [SETUP_RULE_ID]);
  if (session.players.length !== 2) return reject(command, 'player-count', 'Une session nécessite exactement deux joueurs.', [SETUP_RULE_ID]);
  const playerIds = new Set(session.players.map((player) => player.id));
  if (playerIds.size !== session.players.length || [...playerIds].some((id) => !id.trim())) return reject(command, 'invalid-players', 'Les identifiants de joueur doivent être uniques et non vides.', [SETUP_RULE_ID]);
  const modelIds = new Set<string>();
  for (const model of session.models) {
    if (!model.id.trim() || modelIds.has(model.id)) return reject(command, 'invalid-model-id', 'Les identifiants de figurine doivent être uniques et non vides.', [SETUP_RULE_ID]);
    modelIds.add(model.id);
    if (!playerIds.has(model.playerId)) return reject(command, 'unknown-model-owner', 'Chaque figurine doit appartenir à un joueur de la session.', [SETUP_RULE_ID], { modelId: model.id });
    if (!model.profileId.trim() || !isIntegerPoint(model.position) || !isFiniteAngle(model.orientationDegrees)) return reject(command, 'invalid-model-position', 'Une figurine doit avoir un profil, une position entière et une orientation valide.', [SETUP_RULE_ID], { modelId: model.id });
  }
  return validateUnits(session, playerIds, command);
}

export function validateGameCommand(state: GameState, command: GameCommand): RuleRejection | null {
  if (!command.id.trim()) return reject(command, 'invalid-command-id', 'L’identifiant de commande est obligatoire.', []);
  if (state.eventLog.some((event) => event.commandId === command.id)) return reject(command, 'duplicate-command', 'Cette commande a déjà été appliquée.', []);
  if (state.phase === 'completed') return reject(command, 'game-completed', 'Une partie terminée n’accepte plus aucune commande.', [PHASE_RULE_ID]);
  if (state.pendingDecisions.length > 0 && command.type !== 'resolve-decision') {
    return reject(command, 'decision-pending', 'La décision en attente doit être résolue avant toute autre action.', [DECISION_RULE_ID], { decisionId: state.pendingDecisions[0].id });
  }
  switch (command.type) {
    case 'setup-session':
      if (state.phase !== 'setup') return reject(command, 'session-already-setup', 'La session est déjà initialisée.', [SETUP_RULE_ID]);
      return validateSession(command.session, command);
    case 'transition-phase':
      if (state.manifest === null) return reject(command, 'session-not-setup', 'La session doit être initialisée avant de changer de phase.', [SETUP_RULE_ID]);
      if (!canTransitionPhase(state.phase, command.nextPhase)) return reject(command, 'illegal-phase-transition', `La transition ${state.phase} vers ${command.nextPhase} n’est pas autorisée.`, [PHASE_RULE_ID]);
      return null;
    case 'move-model': {
      if (state.phase !== 'movement') return reject(command, 'wrong-phase', 'Les déplacements ne sont autorisés que pendant la phase de mouvement.', [MOVEMENT_RULE_ID]);
      const model = state.models[command.modelId];
      if (!model || !model.active) return reject(command, 'unknown-model', 'La figurine à déplacer est introuvable ou inactive.', [MOVEMENT_RULE_ID]);
      if (model.playerId !== command.actorId) return reject(command, 'not-model-owner', 'Seul le propriétaire peut déplacer cette figurine.', [MOVEMENT_RULE_ID]);
      if (state.movedModelIds.includes(model.id)) return reject(command, 'movement-already-used', 'Cette figurine a déjà effectué son mouvement normal pendant cette phase.', [MOVEMENT_RULE_ID]);
      if (!isIntegerPoint(command.to)) return reject(command, 'non-integer-position', 'Les coordonnées de déplacement doivent être des unités mondiales entières.', [MOVEMENT_RULE_ID]);
      if (command.orientationDegrees !== undefined && !isFiniteAngle(command.orientationDegrees)) return reject(command, 'invalid-orientation', 'L’orientation doit être dans l’intervalle [0, 360[.', [MOVEMENT_RULE_ID]);
      return null;
    }
    case 'roll-dice':
      if (state.manifest === null) return reject(command, 'session-not-setup', 'La session doit être initialisée avant de lancer des dés.', [SETUP_RULE_ID]);
      if (!command.rollId.trim() || state.diceResults[command.rollId]) return reject(command, 'duplicate-roll-id', 'L’identifiant de jet doit être unique et non vide.', [DICE_RULE_ID]);
      if (!Number.isInteger(command.sides) || command.sides < 2 || command.sides > 1_000_000) return reject(command, 'invalid-die', 'Un dé doit avoir entre 2 et 1 000 000 faces.', [DICE_RULE_ID]);
      if (!Number.isInteger(command.count) || command.count < 1 || command.count > 100) return reject(command, 'invalid-dice-count', 'Le nombre de dés doit être entre 1 et 100.', [DICE_RULE_ID]);
      if (!command.reason.trim()) return reject(command, 'missing-roll-reason', 'Chaque jet doit indiquer sa raison.', [DICE_RULE_ID]);
      return null;
    case 'resolve-basic-shooting': {
      if (!hasOnlyShootingCommandFields(command)) {
        return reject(command, 'non-authoritative-shooting-input', 'La commande de tir ne peut fournir ni mesures, ni visibilité, ni nombre de figurines : le moteur les dérive de l’état.', [SHOOTING_RULE_ID]);
      }
      if ((command.weaponProfileId !== undefined && command.weaponProfileIds !== undefined)
        || (command.weaponProfileIds !== undefined && !Array.isArray(command.weaponProfileIds))) {
        return reject(command, 'invalid-weapon-declaration', 'Déclarez soit un profil historique, soit une liste non ambiguë de profils.', [SHOOTING_RULE_ID]);
      }
      const weaponProfileIds = declaredShootingWeaponProfileIds(command);
      if (weaponProfileIds.length === 0 || new Set(weaponProfileIds).size !== weaponProfileIds.length || weaponProfileIds.some((id) => typeof id !== 'string' || !id.trim())) {
        return reject(command, 'invalid-weapon-declaration', 'La déclaration de tir doit contenir des profils d’arme uniques et non vides.', [SHOOTING_RULE_ID]);
      }
      if (state.manifest === null) return reject(command, 'session-not-setup', 'La session doit être initialisée avant de tirer.', [SETUP_RULE_ID]);
      if (state.phase !== 'shooting') return reject(command, 'wrong-phase', 'Les tirs ne sont autorisés que pendant la phase de tir.', [SHOOTING_RULE_ID]);
      const attacker = state.units[command.attackerUnitId];
      const target = state.units[command.targetUnitId];
      if (!attacker || !target) return reject(command, 'unknown-unit', 'L’unité attaquante ou ciblée est introuvable.', [SHOOTING_RULE_ID]);
      if (attacker.playerId !== command.actorId) return reject(command, 'not-unit-owner', 'Seul le propriétaire de l’unité peut déclarer son tir.', [SHOOTING_RULE_ID]);
      if (attacker.id === target.id || attacker.playerId === target.playerId) return reject(command, 'invalid-target-unit', 'Une unité doit cibler une unité ennemie distincte.', [SHOOTING_RULE_ID]);
      if (state.shootingSelectedUnitIds.includes(attacker.id)) return reject(command, 'unit-already-selected-to-shoot', 'Cette unité a déjà été choisie pour tirer pendant cette phase de tir.', [UNIT_SELECTED_TO_SHOOT_RULE_ID]);
      if (weaponProfileIds.some((weaponProfileId) => !attacker.weaponProfiles.some((weapon) => weapon.id === weaponProfileId))) return reject(command, 'unknown-weapon-profile', 'Un profil d’arme déclaré n’appartient pas à l’unité attaquante.', [SHOOTING_RULE_ID]);
      if (weaponProfileIds.some((weaponProfileId) => !attacker.weaponAssignments.some((assignment) => assignment.weaponProfileId === weaponProfileId
        && attacker.models.some((model) => model.id === assignment.modelId && model.active)))) {
        return reject(command, 'no-active-weapon-carriers', 'Aucune figurine active ne porte ce profil d’arme.', [SHOOTING_RULE_ID]);
      }
      if (!target.models.some((model) => model.active)) return reject(command, 'no-active-target-models', 'La cible ne possède plus de figurine active.', [SHOOTING_RULE_ID]);
      return null;
    }
    case 'select-oath-of-moment-target': {
      if (state.manifest === null) return reject(command, 'session-not-setup', 'La session doit être initialisée avant de sélectionner Oath of Moment.', [SETUP_RULE_ID]);
      if (state.phase !== 'command') return reject(command, 'wrong-phase', 'Oath of Moment doit être sélectionné pendant la phase de Commandement.', ['adeptus-astartes.oath-of-moment']);
      const target = state.units[command.targetUnitId];
      if (!target || !target.models.some((model) => model.active)) return reject(command, 'unknown-unit', 'La cible Oath doit être une unité ennemie active.', ['adeptus-astartes.oath-of-moment']);
      if (target.playerId === command.actorId) return reject(command, 'invalid-target-unit', 'Oath of Moment doit cibler une unité ennemie.', ['adeptus-astartes.oath-of-moment']);
      if (state.oathOfMomentSelections[command.actorId]) return reject(command, 'oath-already-selected', 'Une cible Oath of Moment est déjà sélectionnée pour ce joueur.', ['adeptus-astartes.oath-of-moment']);
      return null;
    }
    case 'request-decision': {
      const { decision } = command;
      if (state.manifest === null) return reject(command, 'session-not-setup', 'La session doit être initialisée avant d’ouvrir une décision.', [SETUP_RULE_ID]);
      if (!decision.id.trim() || state.pendingDecisions.some((entry) => entry.id === decision.id)) return reject(command, 'invalid-decision-id', 'L’identifiant de décision doit être unique et non vide.', [DECISION_RULE_ID]);
      if (!state.players[decision.playerId]) return reject(command, 'unknown-decision-player', 'Le joueur appelé à décider est inconnu.', [DECISION_RULE_ID]);
      const optionIds = new Set(decision.options.map((option) => option.id));
      if (!decision.kind.trim() || !decision.prompt.trim() || decision.options.length === 0 || optionIds.size !== decision.options.length || decision.options.some((option) => !option.id.trim() || !option.label.trim())) {
        return reject(command, 'invalid-decision', 'Une décision doit avoir un type, un texte et des options uniques non vides.', [DECISION_RULE_ID]);
      }
      return null;
    }
    case 'resolve-decision': {
      const decision = state.pendingDecisions.find((entry) => entry.id === command.decisionId);
      if (!decision) return reject(command, 'unknown-decision', 'La décision à résoudre est introuvable.', [DECISION_RULE_ID]);
      if (decision.playerId !== command.actorId) return reject(command, 'not-decision-owner', 'Seul le joueur désigné peut résoudre cette décision.', [DECISION_RULE_ID]);
      if (!decision.options.some((option) => option.id === command.optionId)) return reject(command, 'invalid-decision-option', 'Cette option ne fait pas partie de la décision.', [DECISION_RULE_ID]);
      return null;
    }
  }
}

export function executeGameCommand(state: GameState, command: GameCommand): CommandExecution {
  const rejection = validateGameCommand(state, command);
  if (rejection) return { accepted: false, state, rejection };
  if (command.type === 'resolve-basic-shooting' || command.type === 'select-oath-of-moment-target') {
    return {
      accepted: false,
      state,
      rejection: reject(command, 'trusted-shooting-environment-required', 'Cette règle doit être résolue par un environnement de simulation autoritaire.', [TRUSTED_SHOOTING_ENVIRONMENT_RULE_ID])
    };
  }
  if (command.type === 'resolve-decision' && state.pendingDecisions.some((decision) => decision.id === command.decisionId && decision.kind === 'lethal-hits-choice')) {
    return {
      accepted: false,
      state,
      rejection: reject(command, 'trusted-shooting-environment-required', '[TOUCHES FATALES] doit être résolu par l’orchestration de tir autoritaire.', [TRUSTED_SHOOTING_ENVIRONMENT_RULE_ID])
    };
  }
  if (command.type === 'resolve-decision' && state.pendingDecisions.some((decision) => decision.id === command.decisionId && decision.kind === 'generic-reroll-choice')) {
    return {
      accepted: false,
      state,
      rejection: reject(command, 'trusted-shooting-environment-required', 'Les relances génériques doivent être résolues par l’orchestration de tir autoritaire.', [TRUSTED_SHOOTING_ENVIRONMENT_RULE_ID])
    };
  }
  if (command.type === 'resolve-decision' && state.pendingDecisions.some((decision) => decision.id === command.decisionId
    && (decision.kind === 'extended-allocation-group' || decision.kind === 'extended-allocation-model' || decision.kind === 'extended-hazardous-allocation'))) {
    return {
      accepted: false,
      state,
      rejection: reject(command, 'trusted-shooting-environment-required', 'Les allocations T04 doivent être résolues par l’orchestration de tir autoritaire.', [TRUSTED_SHOOTING_ENVIRONMENT_RULE_ID])
    };
  }
  const events = createEventsForCommand(state, command);
  return { accepted: true, state: events.reduce(reduceGameEvent, state), events };
}

function createEventsForCommand(state: GameState, command: GameCommand): readonly GameEvent[] {
  const id = `${command.id}:0`;
  switch (command.type) {
    case 'setup-session':
      return [{ id, commandId: command.id, type: 'session-setup', session: command.session }];
    case 'transition-phase':
      return [{ id, commandId: command.id, type: 'phase-transitioned', from: state.phase, to: command.nextPhase }];
    case 'move-model': {
      const model = state.models[command.modelId];
      if (!model) throw new Error('Validated model is missing.');
      return [{ id, commandId: command.id, type: 'model-moved', modelId: model.id, from: model.position, to: command.to, orientationDegrees: command.orientationDegrees ?? model.orientationDegrees }];
    }
    case 'roll-dice': {
      const outcome = rollDice(state.prng, command.sides, command.count);
      return [{ id, commandId: command.id, type: 'dice-rolled', rollId: command.rollId, sides: command.sides, results: outcome.results, reason: command.reason, prngBefore: state.prng, prngAfter: outcome.state }];
    }
    case 'resolve-basic-shooting':
      throw new Error('Basic shooting requires a trusted shooting environment.');
    case 'select-oath-of-moment-target':
      throw new Error('Oath of Moment requires a trusted shooting environment.');
    case 'request-decision':
      return [{ id, commandId: command.id, type: 'decision-requested', decision: command.decision }];
    case 'resolve-decision': {
      const decision = state.pendingDecisions.find((entry) => entry.id === command.decisionId);
      if (!decision) throw new Error('Validated decision is missing.');
      return [{ id, commandId: command.id, type: 'decision-resolved', decisionId: decision.id, optionId: command.optionId, playerId: decision.playerId }];
    }
  }
}
