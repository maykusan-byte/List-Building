import { rollDice } from './prng';
import { canTransitionPhase, reduceGameEvent } from './reducer';
import { hasSupportedAttackVolumeAbilities } from '../rules/attack-volume';
import { hasSupportedWeaponKeywords } from '../rules/weapon-keywords';
import { parseRandomCharacteristicExpression } from '../rules/random-characteristics';
import { resolveCharacteristicModifierPlan, resolveDieRollModifierPlan } from '../rules/modifiers';
import { assertCompleteGameSessionSetupV1 } from './battle-state';
import { nextBattleStepV1, resolveFirstPlayerRollOffV1 } from './battle-sequence';
import { commandPhaseBattleShockUnitIdsV1, dueTimedEffectIdsV1, resolveBattleShockTestV1, timedEffectExpirationsForPhaseTransitionV1 } from './battle-resources';
import { CORE_BATTLE_ROUND_SOURCE, EVENT_COMPANION_FIRST_TURN_SOURCE, EVENT_COMPANION_FIVE_ROUNDS_SOURCE } from '../rules/m7-source-references';
import { CORE_BASE_COMMAND_POINTS_SOURCE, CORE_BATTLE_SHOCK_SOURCE, CORE_COMMAND_ABILITIES_SOURCE, CORE_COMMAND_PHASE_BATTLE_SHOCK_SOURCE, CORE_COMMAND_PHASE_END_SOURCE, CORE_COMMAND_PHASE_START_SOURCE, CORE_COMMAND_ROLL_SOURCE, CORE_COUNTER_OFFENSIVE_SOURCE, CORE_DESPERATE_ESCAPE_SOURCE, CORE_INSANE_BRAVERY_SOURCE, CORE_USE_STRATAGEMS_SOURCE, OFFICIAL_APP_BATTLE_SHOCK_STEP_SOURCE, OFFICIAL_APP_INITIAL_STRENGTH_SOURCE, OFFICIAL_APP_MODIFY_CP_COST_SOURCE, OFFICIAL_APP_MULTIPLE_BATTLE_SHOCK_SOURCE, OFFICIAL_APP_USE_STRATAGEMS_SOURCE, UNIVERSAL_STRATAGEM_UPDATES_SOURCE } from '../rules/m8-source-references';
import type { CommandExecution, GameCommand, GameEvent, GameState, RuleRejection, SessionSetup, UnitSetup, WeaponProfileV1, WorldPoint } from './types';

const PHASE_RULE_ID = 'simulator.core.phase-sequence';
const SETUP_RULE_ID = 'simulator.core.session-setup';
const MOVEMENT_RULE_ID = 'simulator.core.movement';
const DICE_RULE_ID = 'simulator.core.dice';
const DECISION_RULE_ID = 'simulator.core.decision-window';
const SHOOTING_RULE_ID = 'core.basic-ranged-attack';
const UNIT_SELECTED_TO_SHOOT_RULE_ID = 'core.unit-selected-to-shoot';
const TRUSTED_SHOOTING_ENVIRONMENT_RULE_ID = 'simulator.core.trusted-shooting-environment';
const DEPLOYMENT_RULE_ID = 'event-mission-sequence.8';
const FIRST_PLAYER_RULE_ID = 'event-mission-sequence.10';
const TRUSTED_DEPLOYMENT_ENVIRONMENT_RULE_ID = 'simulator.core.trusted-deployment-environment';
const BATTLE_ROUND_RULE_ID = '07';
const MOVEMENT_SEQUENCE_RULE_ID = '09.02';
const CHARGE_SEQUENCE_RULE_ID = '11.02';
const INSANE_BRAVERY_COST = 1;
const COUNTER_OFFENSIVE_COST = 2;
const INSANE_BRAVERY_SOURCES = [
  CORE_USE_STRATAGEMS_SOURCE,
  CORE_INSANE_BRAVERY_SOURCE,
  UNIVERSAL_STRATAGEM_UPDATES_SOURCE,
  OFFICIAL_APP_USE_STRATAGEMS_SOURCE,
  OFFICIAL_APP_MODIFY_CP_COST_SOURCE
] as const;
const COUNTER_OFFENSIVE_SOURCES = [
  CORE_USE_STRATAGEMS_SOURCE,
  CORE_COUNTER_OFFENSIVE_SOURCE,
  UNIVERSAL_STRATAGEM_UPDATES_SOURCE,
  OFFICIAL_APP_USE_STRATAGEMS_SOURCE,
  OFFICIAL_APP_MODIFY_CP_COST_SOURCE
] as const;

function reject(command: GameCommand, code: string, message: string, sourceRuleIds: readonly string[], details?: Readonly<Record<string, string | number | boolean>>): RuleRejection {
  return { commandId: command.id, code, message, sourceRuleIds, ...(details ? { details } : {}) };
}

function validateCoveredStratagemUse(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'use-insane-bravery' | 'use-counter-offensive' }>,
  stratagemId: 'insane-bravery' | 'counter-offensive',
  cost: number,
  oncePerBattle = false
): RuleRejection | null {
  const battle = state.battle;
  const resources = state.battleResources;
  const unit = state.units[command.unitId];
  if (!battle || battle.lifecycle !== 'in-progress' || !resources || !unit || unit.playerId !== command.actorId
    || !battle.deployedUnitIds.includes(unit.id) || !unit.models.some((model) => model.active)) {
    return reject(command, 'invalid-stratagem-target', 'Le stratagème doit cibler une unité amie active et déployée.', ['15.01']);
  }
  if (resources.battleShockedUnitIds.includes(unit.id)) {
    return reject(command, 'battle-shocked-stratagem-target', 'Une unité ébranlée ne peut pas être ciblée par un stratagème.', ['01.07', '15.01'], { unitId: unit.id });
  }
  if ((resources.commandPointsByPlayerId[command.actorId] ?? 0) < cost) {
    return reject(command, 'insufficient-command-points', 'Le joueur ne possède pas assez de PC pour utiliser ce stratagème.', ['15.01', '15.01.01'], { cost });
  }
  const phaseUses = (resources.stratagemUses ?? []).filter((use) => use.playerId === command.actorId
    && use.battleRound === battle.battleRound && use.turnNumber === battle.turnNumber && use.phase === battle.phase);
  if (phaseUses.some((use) => use.stratagemId === stratagemId)) {
    return reject(command, 'stratagem-already-used-this-phase', 'Un joueur ne peut pas utiliser deux fois le même stratagème à la même phase.', ['15.01']);
  }
  if (phaseUses.some((use) => use.targetUnitId === unit.id)) {
    return reject(command, 'unit-already-targeted-by-stratagem-this-phase', 'Cette unité a déjà été ciblée par un stratagème de ce joueur à cette phase.', ['15.01'], { unitId: unit.id });
  }
  if (oncePerBattle && (resources.stratagemUses ?? []).some((use) => use.playerId === command.actorId && use.stratagemId === stratagemId)) {
    return reject(command, 'stratagem-already-used-this-battle', 'Ce stratagème ne peut être utilisé qu’une fois par bataille.', ['15.04']);
  }
  return null;
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

function hasOnlySplitFireCommandFields(command: Extract<GameCommand, { readonly type: 'resolve-split-fire' }>): boolean {
  const allowed = new Set(['id', 'actorId', 'type', 'attackerUnitId', 'assignments', 'resolutionOrder']);
  return Object.keys(command).every((key) => allowed.has(key));
}

function hasOnlyDeploymentCommandFields(command: Extract<GameCommand, { readonly type: 'deploy-unit' }>): boolean {
  const allowed = new Set(['id', 'actorId', 'type', 'unitId', 'modelPoses']);
  return Object.keys(command).every((key) => allowed.has(key));
}

function hasExactSplitFireAssignmentShape(value: unknown): value is Extract<GameCommand, { readonly type: 'resolve-split-fire' }>['assignments'][number] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  const allowed = new Set(['id', 'firingModelId', 'weaponProfileId', 'weaponInstanceIndex', 'targetUnitId']);
  return Object.keys(entry).every((key) => allowed.has(key))
    && typeof entry.id === 'string' && entry.id.trim().length > 0
    && typeof entry.firingModelId === 'string' && entry.firingModelId.trim().length > 0
    && typeof entry.weaponProfileId === 'string' && entry.weaponProfileId.trim().length > 0
    && Number.isInteger(entry.weaponInstanceIndex) && (entry.weaponInstanceIndex as number) >= 0
    && typeof entry.targetUnitId === 'string' && entry.targetUnitId.trim().length > 0;
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
    && (weapon.weaponType === undefined || weapon.weaponType === 'ranged' || weapon.weaponType === 'melee')
    && (weapon.weaponType !== 'melee' || weapon.range === 0)
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
    if ((unit.leadership !== undefined && (!Number.isInteger(unit.leadership) || unit.leadership < 2 || unit.leadership > 12))
      || (unit.objectiveControl !== undefined && (!Number.isInteger(unit.objectiveControl) || unit.objectiveControl < 0))) {
      return reject(command, 'invalid-unit-command-characteristics', 'Les caractéristiques de Commandement et de CO doivent être des entiers exécutables.', [SETUP_RULE_ID], { unitId: unit.id });
    }
    if (unit.movement !== undefined && (!Number.isInteger(unit.movement) || unit.movement <= 0)) {
      return reject(command, 'invalid-unit-movement', 'La caractéristique de Mouvement doit être un nombre entier strictement positif.', [SETUP_RULE_ID], { unitId: unit.id });
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
  if (session.completeGame !== undefined) {
    try { assertCompleteGameSessionSetupV1(session.completeGame, session); }
    catch { return reject(command, 'invalid-complete-game-setup', 'Le contrat de partie complète ou son rapport de compatibilité est invalide.', [SETUP_RULE_ID]); }
  }
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
  if (state.pendingCharge !== null && state.pendingCharge !== undefined && command.type !== 'resolve-charge') {
    return reject(command, 'charge-resolution-pending', 'La décision de charge après le jet doit être résolue avant toute autre action.', [CHARGE_SEQUENCE_RULE_ID], { unitId: state.pendingCharge.unitId });
  }
  const immediateBattleShockUnitId = Object.entries(state.unitTurnStatuses)
    .find(([, status]) => status.battleShockTestRequired === true)?.[0];
  if (immediateBattleShockUnitId !== undefined
    && !(command.type === 'resolve-battle-shock-test' && command.unitId === immediateBattleShockUnitId)) {
    return reject(command, 'battle-shock-test-pending', 'Le jet d’ébranlement immédiat doit être résolu avant toute autre action.', ['01.07', '09.07'], { unitId: immediateBattleShockUnitId });
  }
  const queuedBattleShockUnitId = state.commandPhase?.pendingBattleShockUnitIds[0];
  if (queuedBattleShockUnitId !== undefined
    && !(command.type === 'resolve-battle-shock-test' && command.unitId === queuedBattleShockUnitId)
    && !(command.type === 'use-insane-bravery' && command.unitId === queuedBattleShockUnitId)) {
    return reject(command, 'battle-shock-test-pending', 'Le prochain jet d’ébranlement de la phase de Commandement doit être résolu.', ['01.07', '08.03'], { unitId: queuedBattleShockUnitId });
  }
  if (state.battle !== null && state.battle !== undefined
    && !['deploy-unit', 'determine-first-player', 'start-battle', 'advance-battle-phase', 'resolve-command-stage', 'resolve-battle-shock-test', 'use-insane-bravery', 'use-counter-offensive', 'move-unit', 'declare-charge', 'resolve-charge', 'pass-fight-window', 'resolve-fight-movement', 'resolve-basic-melee', 'resolve-empty-fight', 'resolve-basic-shooting', 'resolve-split-fire', 'select-oath-of-moment-target', 'resolve-decision'].includes(command.type)) {
    return reject(command, 'complete-game-loop-not-covered', 'Cette commande n’appartient pas à la boucle de partie complète couverte.', [SETUP_RULE_ID]);
  }
  switch (command.type) {
    case 'setup-session':
      if (state.phase !== 'setup') return reject(command, 'session-already-setup', 'La session est déjà initialisée.', [SETUP_RULE_ID]);
      return validateSession(command.session, command);
    case 'deploy-unit': {
      if (!hasOnlyDeploymentCommandFields(command) || !Array.isArray(command.modelPoses)) {
        return reject(command, 'invalid-deployment-command', 'Le déploiement accepte uniquement une unité et une pose explicite par figurine.', [DEPLOYMENT_RULE_ID]);
      }
      const battle = state.battle;
      if (battle === null || battle.lifecycle !== 'deployment' || state.phase !== 'deployment') {
        return reject(command, 'wrong-deployment-window', 'Une unité ne peut être placée que pendant le déploiement de la partie complète.', [DEPLOYMENT_RULE_ID]);
      }
      if (battle.nextDeploymentPlayerId !== command.actorId) {
        return reject(command, 'wrong-deployment-player', 'Les joueurs doivent déployer leurs unités en alternance, en commençant par le Défenseur.', [DEPLOYMENT_RULE_ID], { expectedPlayerId: battle.nextDeploymentPlayerId ?? '' });
      }
      const unit = state.units[command.unitId];
      if (!unit || unit.playerId !== command.actorId) {
        return reject(command, 'invalid-deployment-unit', 'Le joueur doit choisir une de ses unités non déployées.', [DEPLOYMENT_RULE_ID], { unitId: command.unitId });
      }
      if (battle.deployedUnitIds.includes(unit.id)) {
        return reject(command, 'unit-already-deployed', 'Cette unité a déjà été déployée.', [DEPLOYMENT_RULE_ID], { unitId: unit.id });
      }
      if (unit.keywords.includes('TITANIC')) {
        return reject(command, 'unsupported-titanic-deployment', 'L’alternance spéciale des unités TITANIC reste hors du périmètre M7-T01.', [DEPLOYMENT_RULE_ID], { unitId: unit.id });
      }
      const expectedModelIds = [...unit.models.map((model) => model.id)].sort();
      const actualModelIds = command.modelPoses.map((pose) => pose.modelId).sort();
      if (command.modelPoses.length !== expectedModelIds.length || new Set(actualModelIds).size !== actualModelIds.length
        || expectedModelIds.some((modelId, index) => modelId !== actualModelIds[index])
        || command.modelPoses.some((pose) => !isIntegerPoint(pose.position) || !isFiniteAngle(pose.orientationDegrees))) {
        return reject(command, 'invalid-deployment-poses', 'Chaque figurine réelle de l’unité doit recevoir exactement une position entière et une orientation valide.', [DEPLOYMENT_RULE_ID], { unitId: unit.id });
      }
      return null;
    }
    case 'determine-first-player': {
      if (Object.keys(command).some((key) => !['id', 'actorId', 'type'].includes(key))) {
        return reject(command, 'non-authoritative-first-player-input', 'L’issue du roll-off est calculée par le moteur et ne peut pas être fournie par l’interface.', [FIRST_PLAYER_RULE_ID]);
      }
      const battle = state.battle;
      if (battle === null || battle.lifecycle !== 'awaiting-first-player' || battle.nextDeploymentPlayerId !== null) {
        return reject(command, 'wrong-first-player-window', 'Le premier joueur est déterminé uniquement après le déploiement complet.', [FIRST_PLAYER_RULE_ID]);
      }
      if (!battle.playerIds.includes(command.actorId)) {
        return reject(command, 'unknown-player', 'Seul un joueur de la partie peut déclencher le roll-off.', [FIRST_PLAYER_RULE_ID]);
      }
      return null;
    }
    case 'start-battle': {
      if (Object.keys(command).some((key) => !['id', 'actorId', 'type'].includes(key))) return reject(command, 'invalid-battle-start', 'Le démarrage de bataille ne reçoit aucun état calculé par l’interface.', [BATTLE_ROUND_RULE_ID]);
      const battle = state.battle;
      if (battle === null || battle.lifecycle !== 'ready-to-start' || battle.firstPlayerId === null) return reject(command, 'wrong-battle-start-window', 'La bataille commence après le déploiement et le roll-off du premier joueur.', [BATTLE_ROUND_RULE_ID]);
      if (!battle.playerIds.includes(command.actorId)) return reject(command, 'unknown-player', 'Seul un joueur de la partie peut démarrer la bataille.', [BATTLE_ROUND_RULE_ID]);
      return null;
    }
    case 'advance-battle-phase': {
      if (Object.keys(command).some((key) => !['id', 'actorId', 'type'].includes(key))) return reject(command, 'non-authoritative-phase-input', 'La prochaine phase est dérivée de la boucle de bataille.', [BATTLE_ROUND_RULE_ID]);
      const battle = state.battle;
      if (battle === null || battle.lifecycle !== 'in-progress' || battle.activePlayerId !== command.actorId) return reject(command, 'not-active-player', 'Seul le joueur actif peut faire avancer la boucle de bataille.', [BATTLE_ROUND_RULE_ID]);
      if (battle.phase === 'command' && state.commandPhase?.stage !== 'complete') {
        return reject(command, 'command-phase-incomplete', 'Les cinq étapes de la phase de Commandement doivent être résolues.', ['08'], { stage: state.commandPhase?.stage ?? 'missing' });
      }
      if (battle.phase === 'movement') {
        const remaining = battle.deployedUnitIds.filter((unitId) => {
          const unit = state.units[unitId];
          return unit?.playerId === battle.activePlayerId && unit.models.some((model) => model.active) && !state.unitTurnStatuses[unitId]?.selectedForMovement;
        });
        if (remaining.length > 0) return reject(command, 'movement-selection-incomplete', 'Chaque unité active doit être choisie pour un mouvement, y compris Rester immobile.', [MOVEMENT_SEQUENCE_RULE_ID], { remainingUnitIds: remaining.sort().join(',') });
      }
      if (battle.phase === 'charge' && state.pendingCharge !== null) {
        return reject(command, 'charge-resolution-pending', 'Le jet de charge en attente doit être résolu avant la fin de la phase.', [CHARGE_SEQUENCE_RULE_ID], { unitId: state.pendingCharge.unitId });
      }
      if (battle.phase === 'fight' && state.fightPhase?.stage !== 'complete') {
        return reject(command, 'fight-phase-incomplete', 'Les fenêtres d’insertion, de combat et de consolidation doivent être résolues avant de terminer la phase.', ['12'], { stage: state.fightPhase?.stage ?? 'missing' });
      }
      try { nextBattleStepV1(battle); }
      catch { return reject(command, 'unsupported-battle-step', 'Cette étape de bataille n’est pas encore couverte.', [BATTLE_ROUND_RULE_ID]); }
      return null;
    }
    case 'resolve-command-stage': {
      if (Object.keys(command).some((key) => !['id', 'actorId', 'type'].includes(key))) return reject(command, 'invalid-command-stage-input', 'L’étape de Commandement est entièrement dérivée de l’état.', ['08']);
      const phase = state.commandPhase;
      if (state.phase !== 'command' || state.battle?.phase !== 'command' || state.battleResources === null || phase === null || phase.stage === 'complete') {
        return reject(command, 'wrong-command-stage-window', 'Aucune étape de Commandement non résolue n’est disponible.', ['08']);
      }
      if (phase.activePlayerId !== command.actorId || state.battle.activePlayerId !== command.actorId) return reject(command, 'not-active-player', 'Seul le joueur actif résout sa phase de Commandement.', ['08']);
      if (phase.pendingBattleShockUnitIds.length > 0) return reject(command, 'battle-shock-test-pending', 'Résolvez les jets d’ébranlement annoncés avant de poursuivre.', ['08.03']);
      return null;
    }
    case 'resolve-battle-shock-test': {
      if (Object.keys(command).some((key) => !['id', 'actorId', 'type', 'unitId'].includes(key)) || !command.unitId.trim()) return reject(command, 'invalid-battle-shock-input', 'Le jet d’ébranlement choisit uniquement l’unité annoncée.', ['01.07']);
      const unit = state.units[command.unitId];
      const immediate = state.unitTurnStatuses[command.unitId]?.battleShockTestRequired === true;
      const queued = state.commandPhase?.pendingBattleShockUnitIds[0] === command.unitId;
      if (state.battleResources === null || !unit || unit.playerId !== command.actorId || !unit.models.some((model) => model.active)) return reject(command, 'invalid-battle-shock-unit', 'Le propriétaire doit résoudre le jet d’une unité active compilée.', ['01.07']);
      if (!Number.isInteger(unit.leadership)) return reject(command, 'leadership-characteristic-missing', 'La caractéristique de Commandement doit être compilée.', ['01.06']);
      if (!immediate && !queued) return reject(command, 'no-battle-shock-test-pending', 'Aucun jet d’ébranlement n’est annoncé pour cette unité.', ['01.07']);
      return null;
    }
    case 'use-insane-bravery': {
      if (Object.keys(command).some((key) => !['id', 'actorId', 'type', 'unitId'].includes(key)) || !command.unitId.trim()) {
        return reject(command, 'invalid-stratagem-command', 'Courage Insensé choisit uniquement l’unité ciblée.', ['15.01', '15.04']);
      }
      const common = validateCoveredStratagemUse(state, command, 'insane-bravery', INSANE_BRAVERY_COST, true);
      if (common) return common;
      if (state.phase !== 'command' || state.battle?.phase !== 'command' || state.commandPhase?.stage !== 'battle-shock'
        || state.commandPhase.activePlayerId !== command.actorId || state.commandPhase.pendingBattleShockUnitIds[0] !== command.unitId) {
        return reject(command, 'wrong-insane-bravery-window', 'Courage Insensé s’utilise juste avant le jet d’ébranlement annoncé de cette unité.', ['08.03', '15.04']);
      }
      return null;
    }
    case 'use-counter-offensive': {
      if (Object.keys(command).some((key) => !['id', 'actorId', 'type', 'unitId'].includes(key)) || !command.unitId.trim()) {
        return reject(command, 'invalid-stratagem-command', 'Contre-offensive choisit uniquement l’unité ciblée.', ['15.01', '15.12']);
      }
      const common = validateCoveredStratagemUse(state, command, 'counter-offensive', COUNTER_OFFENSIVE_COST);
      if (common) return common;
      const battle = state.battle;
      const fight = state.fightPhase;
      const unit = state.units[command.unitId]!;
      const previous = state.eventLog.at(-1);
      const eligible = fight?.eligibleAtFightStartUnitIds.includes(unit.id) === true || state.unitTurnStatuses[unit.id]?.charged === true;
      if (state.phase !== 'fight' || battle?.phase !== 'fight' || fight?.stage !== 'fight'
        || fight.currentPlayerId !== command.actorId || fight.activePlayerId === command.actorId
        || fight.forcedNextFightUnitId !== undefined || fight.foughtUnitIds.includes(unit.id) || !eligible
        || previous?.type !== 'basic-melee-resolved' || previous.playerId !== fight.activePlayerId) {
        return reject(command, 'wrong-counter-offensive-window', 'Contre-offensive s’utilise en phase de Combat adverse, juste après les attaques d’une unité ennemie, sur une unité amie éligible qui n’a pas combattu.', ['12.04', '15.12']);
      }
      return null;
    }
    case 'declare-charge': {
      if (Object.keys(command).some((key) => !['id', 'actorId', 'type', 'unitId'].includes(key))) {
        return reject(command, 'invalid-charge-declaration', 'La déclaration de charge choisit uniquement l’unité qui charge.', [CHARGE_SEQUENCE_RULE_ID]);
      }
      const battle = state.battle;
      const unit = state.units[command.unitId];
      const status = unit === undefined ? undefined : state.unitTurnStatuses[unit.id];
      if (battle === null || battle.lifecycle !== 'in-progress' || battle.phase !== 'charge' || state.phase !== 'charge') {
        return reject(command, 'wrong-phase', 'Une charge se déclare uniquement pendant la phase de Charge.', [CHARGE_SEQUENCE_RULE_ID]);
      }
      if (battle.activePlayerId !== command.actorId || !unit || unit.playerId !== command.actorId || !battle.deployedUnitIds.includes(unit.id) || !unit.models.some((model) => model.active)) {
        return reject(command, 'not-active-unit-owner', 'Le joueur actif doit choisir une de ses unités actives sur le champ de bataille.', [CHARGE_SEQUENCE_RULE_ID]);
      }
      if (status?.chargeDeclared) return reject(command, 'charge-already-declared', 'Cette unité a déjà déclaré une charge à cette phase.', [CHARGE_SEQUENCE_RULE_ID], { unitId: unit.id });
      if (status?.advanced || status?.fellBack) return reject(command, 'charge-ineligible-after-movement', 'Une unité qui a Avancé ou Battu en Retraite à ce tour ne peut pas déclarer de charge.', [CHARGE_SEQUENCE_RULE_ID], { unitId: unit.id });
      return null;
    }
    case 'resolve-charge': {
      const pending = state.pendingCharge;
      if (pending === null || pending === undefined || pending.unitId !== command.unitId) {
        return reject(command, 'unknown-pending-charge', 'Aucun jet de charge en attente ne correspond à cette unité.', [CHARGE_SEQUENCE_RULE_ID]);
      }
      if (pending.playerId !== command.actorId) return reject(command, 'not-charge-owner', 'Seul le joueur qui a déclaré la charge peut la résoudre.', [CHARGE_SEQUENCE_RULE_ID]);
      if (state.phase !== 'charge' || state.battle?.phase !== 'charge') return reject(command, 'wrong-phase', 'La continuation de charge doit rester dans la phase de Charge.', [CHARGE_SEQUENCE_RULE_ID]);
      if (!command.proceed) {
        if (Object.keys(command).some((key) => !['id', 'actorId', 'type', 'unitId', 'proceed'].includes(key))) {
          return reject(command, 'invalid-charge-decline', 'Renoncer au mouvement de charge ne fournit ni cible ni trajectoire.', [CHARGE_SEQUENCE_RULE_ID]);
        }
        return null;
      }
      if (Object.keys(command).some((key) => !['id', 'actorId', 'type', 'unitId', 'proceed', 'targetUnitIds', 'paths'].includes(key))
        || !Array.isArray(command.targetUnitIds) || command.targetUnitIds.length === 0
        || new Set(command.targetUnitIds).size !== command.targetUnitIds.length
        || command.targetUnitIds.some((unitId) => typeof unitId !== 'string' || !unitId.trim())
        || !Array.isArray(command.paths)) {
        return reject(command, 'invalid-charge-resolution', 'Tenter la charge exige des cibles uniques et les trajectoires de chaque figurine active.', [CHARGE_SEQUENCE_RULE_ID]);
      }
      const unit = state.units[command.unitId];
      const activeModelIds = unit?.models.filter((model) => model.active).map((model) => model.id).sort() ?? [];
      const pathModelIds = command.paths.map((path) => path.modelId).sort();
      if (command.paths.length !== activeModelIds.length || new Set(pathModelIds).size !== pathModelIds.length
        || activeModelIds.some((modelId, index) => modelId !== pathModelIds[index])
        || command.paths.some((path) => !Array.isArray(path.waypoints) || path.waypoints.some((point: WorldPoint) => !isIntegerPoint(point))
          || (path.finalOrientationDegrees !== undefined && !isFiniteAngle(path.finalOrientationDegrees)))) {
        return reject(command, 'invalid-charge-paths', 'Chaque figurine active doit avoir une trajectoire de charge entière.', [CHARGE_SEQUENCE_RULE_ID]);
      }
      return null;
    }
    case 'pass-fight-window': {
      if (Object.keys(command).some((key) => !['id', 'actorId', 'type'].includes(key))) return reject(command, 'invalid-fight-pass', 'Passer une fenêtre de combat ne fournit aucun état calculé.', ['12']);
      if (state.phase !== 'fight' || state.battle?.phase !== 'fight' || state.fightPhase === null || state.fightPhase.stage === 'complete') return reject(command, 'wrong-fight-window', 'Aucune fenêtre de combat active ne peut être passée.', ['12']);
      if (state.fightPhase.currentPlayerId !== command.actorId) return reject(command, 'not-current-fight-player', 'Seul le joueur courant peut agir dans cette fenêtre de combat.', ['12']);
      if (state.fightPhase.forcedNextFightUnitId !== undefined) return reject(command, 'counter-offensive-fight-required', 'L’unité choisie par Contre-offensive doit être la prochaine à combattre.', ['15.12'], { unitId: state.fightPhase.forcedNextFightUnitId });
      return null;
    }
    case 'resolve-fight-movement': {
      const allowed = new Set(['id', 'actorId', 'type', 'movementKind', 'unitId', 'targetUnitIds', 'paths']);
      if (Object.keys(command).some((key) => !allowed.has(key)) || !['pile-in', 'consolidation'].includes(command.movementKind)
        || !Array.isArray(command.targetUnitIds) || command.targetUnitIds.length === 0
        || command.targetUnitIds.some((unitId) => typeof unitId !== 'string' || unitId.trim().length === 0)
        || new Set(command.targetUnitIds).size !== command.targetUnitIds.length
        || !Array.isArray(command.paths)) return reject(command, 'invalid-fight-movement', 'Le mouvement de mêlée exige des cibles uniques et une trajectoire par figurine active.', ['12']);
      const fight = state.fightPhase;
      const expectedStage = command.movementKind === 'pile-in' ? 'pile-in' : 'consolidation';
      const unit = state.units[command.unitId];
      if (state.phase !== 'fight' || state.battle?.phase !== 'fight' || fight?.stage !== expectedStage) return reject(command, 'wrong-fight-window', 'Ce type de mouvement ne correspond pas à l’étape de combat actuelle.', [command.movementKind === 'pile-in' ? '12.03' : '12.08']);
      if (fight.currentPlayerId !== command.actorId || !unit || unit.playerId !== command.actorId || !state.battle.deployedUnitIds.includes(unit.id) || !unit.models.some((model) => model.active)) return reject(command, 'not-current-fight-unit-owner', 'Le joueur courant doit choisir une de ses unités actives.', ['12']);
      if (command.movementKind === 'pile-in' && fight.piledInUnitIds.includes(unit.id)) return reject(command, 'pile-in-already-resolved', 'Cette unité a déjà résolu son mouvement d’insertion.', ['12.03']);
      if (command.movementKind === 'consolidation' && fight.consolidatedUnitIds.includes(unit.id)) return reject(command, 'consolidation-already-resolved', 'Cette unité a déjà résolu son mouvement de consolidation.', ['12.08']);
      if (command.movementKind === 'consolidation' && !fight.eligibleAtFightStartUnitIds.includes(unit.id) && !fight.foughtUnitIds.includes(unit.id)) {
        return reject(command, 'unit-not-eligible-to-consolidate', 'Seule une unité éligible pour combattre à cette phase peut consolider.', ['12.08']);
      }
      const activeModelIds = unit.models.filter((model) => model.active).map((model) => model.id).sort();
      const pathModelIds = command.paths.map((path) => path.modelId).sort();
      if (command.paths.length !== activeModelIds.length || new Set(pathModelIds).size !== pathModelIds.length || activeModelIds.some((modelId, index) => modelId !== pathModelIds[index])
        || command.paths.some((path) => !Array.isArray(path.waypoints) || path.waypoints.some((point: WorldPoint) => !isIntegerPoint(point)) || (path.finalOrientationDegrees !== undefined && !isFiniteAngle(path.finalOrientationDegrees)))) {
        return reject(command, 'invalid-fight-movement-paths', 'Chaque figurine active doit recevoir exactement une trajectoire entière.', ['12']);
      }
      return null;
    }
    case 'resolve-basic-melee': {
      if (Object.keys(command).some((key) => !['id', 'actorId', 'type', 'attackerUnitId', 'targetUnitId', 'weaponProfileId'].includes(key)) || !command.weaponProfileId.trim()) return reject(command, 'invalid-melee-command', 'Le combat choisit une unité, une cible et un profil de mêlée.', ['04', '12.04']);
      const fight = state.fightPhase;
      const attacker = state.units[command.attackerUnitId];
      const target = state.units[command.targetUnitId];
      if (state.phase !== 'fight' || state.battle?.phase !== 'fight' || fight?.stage !== 'fight') return reject(command, 'wrong-fight-window', 'Les attaques de mêlée se résolvent à l’étape Combattre.', ['12.04']);
      if (fight.currentPlayerId !== command.actorId || !attacker || attacker.playerId !== command.actorId || !attacker.models.some((model) => model.active)) return reject(command, 'not-current-fight-unit-owner', 'Le joueur courant doit choisir une unité amie active.', ['12.04']);
      if (fight.forcedNextFightUnitId !== undefined && fight.forcedNextFightUnitId !== attacker.id) return reject(command, 'counter-offensive-fight-required', 'L’unité choisie par Contre-offensive doit être la prochaine à combattre.', ['15.12'], { unitId: fight.forcedNextFightUnitId });
      if (!target || target.playerId === command.actorId || !target.models.some((model) => model.active)) return reject(command, 'invalid-melee-target', 'La cible doit être une unité ennemie active.', ['04.02']);
      if (fight.foughtUnitIds.includes(attacker.id)) return reject(command, 'unit-already-fought', 'Cette unité a déjà été choisie pour combattre.', ['12.04']);
      return null;
    }
    case 'resolve-empty-fight': {
      if (Object.keys(command).some((key) => !['id', 'actorId', 'type', 'unitId'].includes(key)) || !command.unitId.trim()) return reject(command, 'invalid-empty-fight-command', 'Le combat sans arme choisit uniquement une unité amie.', ['04', '12.04']);
      const fight = state.fightPhase;
      const unit = state.units[command.unitId];
      if (state.phase !== 'fight' || state.battle?.phase !== 'fight' || fight?.stage !== 'fight') return reject(command, 'wrong-fight-window', 'Une unité sans arme combat à l’étape Combattre.', ['12.04']);
      if (fight.currentPlayerId !== command.actorId || !unit || unit.playerId !== command.actorId || !unit.models.some((model) => model.active)) return reject(command, 'not-current-fight-unit-owner', 'Le joueur courant doit choisir une unité amie active.', ['12.04']);
      if (fight.forcedNextFightUnitId !== undefined && fight.forcedNextFightUnitId !== unit.id) return reject(command, 'counter-offensive-fight-required', 'L’unité choisie par Contre-offensive doit être la prochaine à combattre.', ['15.12'], { unitId: fight.forcedNextFightUnitId });
      if (fight.foughtUnitIds.includes(unit.id)) return reject(command, 'unit-already-fought', 'Cette unité a déjà été choisie pour combattre.', ['12.04']);
      return null;
    }
    case 'move-unit': {
      const allowed = new Set(['id', 'actorId', 'type', 'unitId', 'movementType', 'fallBackMode', 'desperateEscapeAllocationOrder', 'paths']);
      if (Object.keys(command).some((key) => !allowed.has(key)) || !Array.isArray(command.paths)
        || !['remain-stationary', 'normal', 'advance', 'fall-back'].includes(command.movementType)) {
        return reject(command, 'invalid-unit-movement-command', 'La commande doit déclarer uniquement le type de mouvement et les trajectoires des figurines.', [MOVEMENT_SEQUENCE_RULE_ID]);
      }
      const battle = state.battle;
      const unit = state.units[command.unitId];
      if (battle === null || battle.lifecycle !== 'in-progress' || state.phase !== 'movement' || battle.phase !== 'movement') return reject(command, 'wrong-phase', 'Les unités se déplacent uniquement pendant la phase de Mouvement.', [MOVEMENT_SEQUENCE_RULE_ID]);
      if (battle.activePlayerId !== command.actorId || !unit || unit.playerId !== command.actorId || !battle.deployedUnitIds.includes(command.unitId)) return reject(command, 'not-active-unit-owner', 'Le joueur actif doit choisir une de ses unités déployées.', [MOVEMENT_SEQUENCE_RULE_ID]);
      if (state.unitTurnStatuses[unit.id]?.selectedForMovement) return reject(command, 'unit-already-selected-for-movement', 'Cette unité a déjà été choisie pendant cette phase de Mouvement.', [MOVEMENT_SEQUENCE_RULE_ID]);
      if (!Number.isInteger(unit.movement) || unit.movement! <= 0) return reject(command, 'movement-characteristic-missing', 'La caractéristique de Mouvement de l’unité n’est pas compilée.', [MOVEMENT_SEQUENCE_RULE_ID]);
      const activeModelIds = unit.models.filter((model) => model.active).map((model) => model.id).sort();
      const pathModelIds = command.paths.map((path) => path.modelId).sort();
      if (command.paths.length !== activeModelIds.length || new Set(pathModelIds).size !== pathModelIds.length
        || activeModelIds.some((modelId, index) => modelId !== pathModelIds[index])
        || command.paths.some((path) => !Array.isArray(path.waypoints) || path.waypoints.some((point: WorldPoint) => !isIntegerPoint(point))
          || (path.finalOrientationDegrees !== undefined && !isFiniteAngle(path.finalOrientationDegrees)))) {
        return reject(command, 'invalid-unit-movement-paths', 'Chaque figurine active doit avoir une trajectoire entière, éventuellement vide.', [MOVEMENT_SEQUENCE_RULE_ID]);
      }
      if (command.movementType === 'remain-stationary' && command.paths.some((path) => path.waypoints.length > 0 || path.finalOrientationDegrees !== undefined)) {
        return reject(command, 'remain-stationary-moved', 'Rester immobile interdit toute translation et tout pivot.', ['09.04']);
      }
      if (command.movementType === 'fall-back') {
        if (command.fallBackMode !== 'good-order' && command.fallBackMode !== 'desperate-escape') {
          return reject(command, 'fall-back-mode-required', 'Un mouvement de Retraite doit choisir Retraite en Bon Ordre ou Fuite Désespérée.', ['09.07']);
        }
        if (command.fallBackMode === 'good-order' && state.battleResources?.battleShockedUnitIds.includes(unit.id)) {
          return reject(command, 'good-order-forbidden-while-battle-shocked', 'Une unité ébranlée doit choisir la Fuite Désespérée.', ['09.07'], { unitId: unit.id });
        }
        if (command.fallBackMode === 'desperate-escape') {
          const allocationOrder = command.desperateEscapeAllocationOrder;
          if (!Array.isArray(allocationOrder) || allocationOrder.length !== activeModelIds.length
            || new Set(allocationOrder).size !== allocationOrder.length
            || [...allocationOrder].sort().some((modelId, index) => modelId !== activeModelIds[index])) {
            return reject(command, 'desperate-escape-allocation-required', 'Le joueur doit ordonner explicitement toutes les figurines pour les choix d’allocation de blessures mortelles.', ['06.02', '09.07']);
          }
        } else if (command.desperateEscapeAllocationOrder !== undefined) {
          return reject(command, 'unexpected-desperate-escape-allocation', 'L’ordre d’allocation est réservé à la Fuite Désespérée.', ['06.02', '09.07']);
        }
      } else if (command.fallBackMode !== undefined) {
        return reject(command, 'unexpected-fall-back-mode', 'Le mode de retraite est réservé au Mouvement de Retraite.', ['09.07']);
      } else if (command.desperateEscapeAllocationOrder !== undefined) {
        return reject(command, 'unexpected-desperate-escape-allocation', 'L’ordre d’allocation est réservé à la Fuite Désespérée.', ['06.02', '09.07']);
      }
      return null;
    }
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
      if (weaponProfileIds.some((weaponProfileId) => attacker.weaponProfiles.some((weapon) => weapon.id === weaponProfileId && weapon.weaponType === 'melee'))) {
        return reject(command, 'melee-weapon-cannot-shoot', 'Une arme de mêlée ne peut pas être déclarée pour une attaque de tir.', [SHOOTING_RULE_ID]);
      }
      if (weaponProfileIds.some((weaponProfileId) => !attacker.weaponAssignments.some((assignment) => assignment.weaponProfileId === weaponProfileId
        && attacker.models.some((model) => model.id === assignment.modelId && model.active)))) {
        return reject(command, 'no-active-weapon-carriers', 'Aucune figurine active ne porte ce profil d’arme.', [SHOOTING_RULE_ID]);
      }
      if (!target.models.some((model) => model.active)) return reject(command, 'no-active-target-models', 'La cible ne possède plus de figurine active.', [SHOOTING_RULE_ID]);
      return null;
    }
    case 'resolve-split-fire': {
      if (!hasOnlySplitFireCommandFields(command)) {
        return reject(command, 'non-authoritative-split-fire-input', 'La déclaration de tir partagé ne peut fournir ni mesures, ni visibilité, ni résultats de dés.', [SHOOTING_RULE_ID]);
      }
      if (!Array.isArray(command.assignments) || !Array.isArray(command.resolutionOrder)
        || command.assignments.length === 0 || command.resolutionOrder.length !== command.assignments.length
        || !command.assignments.every(hasExactSplitFireAssignmentShape)
        || command.resolutionOrder.some((id) => typeof id !== 'string' || !id.trim())) {
        return reject(command, 'invalid-split-fire-declaration', 'Le tir partagé exige des instances physiques et un ordre de résolution complets.', [SHOOTING_RULE_ID]);
      }
      const assignmentIds = command.assignments.map((assignment) => assignment.id);
      if (new Set(assignmentIds).size !== assignmentIds.length || new Set(command.resolutionOrder).size !== command.resolutionOrder.length
        || !command.resolutionOrder.every((id) => assignmentIds.includes(id))) {
        return reject(command, 'invalid-split-fire-order', 'Chaque arme déclarée doit apparaître exactement une fois dans l’ordre de résolution.', [SHOOTING_RULE_ID]);
      }
      const assignmentById = new Map(command.assignments.map((assignment) => [assignment.id, assignment]));
      const closedTargetIds = new Set<string>();
      let currentTargetId: string | undefined;
      for (const assignmentId of command.resolutionOrder) {
        const targetUnitId = assignmentById.get(assignmentId)?.targetUnitId;
        if (!targetUnitId) return reject(command, 'invalid-split-fire-order', 'L’ordre de tir partagé référence une arme non déclarée.', [SHOOTING_RULE_ID]);
        if (targetUnitId !== currentTargetId) {
          if (closedTargetIds.has(targetUnitId)) {
            return reject(command, 'non-contiguous-split-fire-target-group', 'Toutes les armes ciblant une même unité doivent être résolues dans un groupe contigu avant de passer à une autre cible.', [SHOOTING_RULE_ID], { targetUnitId });
          }
          if (currentTargetId !== undefined) closedTargetIds.add(currentTargetId);
          currentTargetId = targetUnitId;
        }
      }
      if (state.manifest === null) return reject(command, 'session-not-setup', 'La session doit être initialisée avant de tirer.', [SETUP_RULE_ID]);
      if (state.phase !== 'shooting') return reject(command, 'wrong-phase', 'Les tirs ne sont autorisés que pendant la phase de tir.', [SHOOTING_RULE_ID]);
      const attacker = state.units[command.attackerUnitId];
      if (!attacker) return reject(command, 'unknown-unit', 'L’unité attaquante est introuvable.', [SHOOTING_RULE_ID]);
      if (attacker.playerId !== command.actorId) return reject(command, 'not-unit-owner', 'Seul le propriétaire de l’unité peut déclarer son tir.', [SHOOTING_RULE_ID]);
      if (state.shootingSelectedUnitIds.includes(attacker.id)) return reject(command, 'unit-already-selected-to-shoot', 'Cette unité a déjà été choisie pour tirer pendant cette phase de tir.', [UNIT_SELECTED_TO_SHOOT_RULE_ID]);
      if (attacker.coverageSubject?.subjectType === 'unit' || attacker.extendedDefence !== undefined) {
        return reject(command, 'unsupported-split-fire-fixture-scope', 'Le tir partagé est limité aux unités de fixture simples et n’active aucun roster M4.', [SHOOTING_RULE_ID]);
      }
      const physicalKeys = new Set<string>();
      for (const assignment of command.assignments) {
        const target = state.units[assignment.targetUnitId];
        const weapon = attacker.weaponProfiles.find((profile) => profile.id === assignment.weaponProfileId);
        const carrier = attacker.models.find((model) => model.id === assignment.firingModelId && model.active);
        const weaponAssignment = attacker.weaponAssignments.find((entry) => entry.modelId === assignment.firingModelId && entry.weaponProfileId === assignment.weaponProfileId);
        const key = `${assignment.firingModelId}:${assignment.weaponProfileId}:${assignment.weaponInstanceIndex}`;
        if (physicalKeys.has(key)) return reject(command, 'duplicate-weapon-instance', 'Une instance d’arme ne peut être déclarée qu’une seule fois.', [SHOOTING_RULE_ID], { instanceKey: key });
        physicalKeys.add(key);
        if (!weapon || !carrier || !weaponAssignment || assignment.weaponInstanceIndex >= weaponAssignment.quantity) {
          return reject(command, 'invalid-split-fire-weapon-instance', 'L’instance d’arme doit appartenir à une figurine active de l’unité attaquante.', [SHOOTING_RULE_ID], { instanceKey: key });
        }
        if (weapon.randomAttacks !== undefined || weapon.randomDamage !== undefined || weapon.modifierPlan !== undefined
          || (weapon.attackVolumeAbilities?.length ?? 0) !== 0 || (weapon.weaponKeywords?.length ?? 0) !== 0) {
          return reject(command, 'unsupported-split-fire-weapon', 'Le tir partagé T05.2 ne couvre pour l’instant que des armes de fixture à caractéristiques fixes, sans mot-clé ni profil alternatif.', [SHOOTING_RULE_ID], { weaponProfileId: weapon.id });
        }
        if (!target || target.id === attacker.id || target.playerId === attacker.playerId || !target.models.some((model) => model.active)) {
          return reject(command, 'invalid-target-unit', 'Chaque instance doit cibler une unité ennemie active distincte.', [SHOOTING_RULE_ID], { targetUnitId: assignment.targetUnitId });
        }
        if (target.coverageSubject?.subjectType === 'unit' || target.extendedDefence !== undefined) {
          return reject(command, 'unsupported-split-fire-fixture-scope', 'Le tir partagé est limité aux cibles de fixture simples et n’active aucun roster M4.', [SHOOTING_RULE_ID], { targetUnitId: target.id });
        }
      }
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
  if (command.type === 'advance-battle-phase' && (state.mission?.objectiveMarkers.length ?? 0) > 0) {
    return {
      accepted: false,
      state,
      rejection: reject(command, 'trusted-objective-environment-required', 'Le changement de phase doit d’abord résoudre le contrôle des objectifs avec l’environnement physique autoritaire.', ['14.01', '14.02', '14.01.01'])
    };
  }
  if (command.type === 'resolve-basic-shooting' || command.type === 'resolve-split-fire' || command.type === 'select-oath-of-moment-target') {
    return {
      accepted: false,
      state,
      rejection: reject(command, 'trusted-shooting-environment-required', 'Cette règle doit être résolue par un environnement de simulation autoritaire.', [TRUSTED_SHOOTING_ENVIRONMENT_RULE_ID])
    };
  }
  if (command.type === 'deploy-unit') {
    return {
      accepted: false,
      state,
      rejection: reject(command, 'trusted-deployment-environment-required', 'Le placement doit être vérifié par la géométrie autoritaire.', [TRUSTED_DEPLOYMENT_ENVIRONMENT_RULE_ID])
    };
  }
  if (command.type === 'move-unit') {
    return { accepted: false, state, rejection: reject(command, 'trusted-movement-environment-required', 'Le mouvement doit être vérifié par la géométrie autoritaire.', ['simulator.core.trusted-movement-environment']) };
  }
  if (command.type === 'declare-charge' || command.type === 'resolve-charge') {
    return { accepted: false, state, rejection: reject(command, 'trusted-charge-environment-required', 'La charge doit être résolue par la géométrie autoritaire.', ['simulator.core.trusted-charge-environment']) };
  }
  if (command.type === 'pass-fight-window' || command.type === 'resolve-fight-movement' || command.type === 'resolve-basic-melee' || command.type === 'resolve-empty-fight') {
    return { accepted: false, state, rejection: reject(command, 'trusted-fight-environment-required', 'La phase de Combat doit être résolue par la géométrie autoritaire.', ['simulator.core.trusted-fight-environment']) };
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
  if (command.type === 'resolve-decision' && state.pendingDecisions.some((decision) => decision.id === command.decisionId && decision.kind === 'split-fire-retarget')) {
    return {
      accepted: false,
      state,
      rejection: reject(command, 'trusted-shooting-environment-required', 'Le reciblage du tir partagé doit être résolu par l’orchestration de tir autoritaire.', [TRUSTED_SHOOTING_ENVIRONMENT_RULE_ID])
    };
  }
  if (command.type === 'resolve-decision' && state.pendingDecisions.some((decision) => decision.id === command.decisionId && decision.kind === 'duplicate-weapon-ability')) {
    return {
      accepted: false,
      state,
      rejection: reject(command, 'trusted-shooting-environment-required', 'Le choix d’aptitude dupliquée doit être résolu par l’orchestration de tir autoritaire.', [TRUSTED_SHOOTING_ENVIRONMENT_RULE_ID])
    };
  }
  if (command.type === 'resolve-decision' && state.pendingDecisions.some((decision) => decision.id === command.decisionId && decision.kind === 'basic-melee-allocation')) {
    return {
      accepted: false,
      state,
      rejection: reject(command, 'trusted-fight-environment-required', 'L’allocation de mêlée doit être résolue par l’orchestration de Combat autoritaire.', ['05.04'])
    };
  }
  const events = createEventsForCommand(state, command);
  return { accepted: true, state: events.reduce(reduceGameEvent, state), events };
}

/**
 * Prepares the deterministic phase event after domain validation. The caller
 * must prepend the authoritative objective checkpoints before reducing it.
 */
export function prepareObjectiveAwareBattlePhaseAdvance(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'advance-battle-phase' }>
):
  | { readonly accepted: false; readonly state: GameState; readonly rejection: RuleRejection }
  | { readonly accepted: true; readonly event: Extract<GameEvent, { readonly type: 'battle-phase-advanced' }> } {
  const rejection = validateGameCommand(state, command);
  if (rejection) return { accepted: false, state, rejection };
  const event = createEventsForCommand(state, command)[0];
  if (event?.type !== 'battle-phase-advanced') throw new Error('The validated phase command did not produce its deterministic event.');
  return { accepted: true, event };
}

function createEventsForCommand(state: GameState, command: GameCommand): readonly GameEvent[] {
  const id = `${command.id}:0`;
  switch (command.type) {
    case 'setup-session':
      return [{ id, commandId: command.id, type: 'session-setup', session: command.session }];
    case 'deploy-unit':
      throw new Error('Deployment requires a trusted geometry environment.');
    case 'determine-first-player': {
      const outcome = resolveFirstPlayerRollOffV1(state.prng, state.battle!.playerIds);
      return [{
        id,
        commandId: command.id,
        type: 'first-player-determined',
        winnerPlayerId: outcome.winnerPlayerId,
        rollOffs: outcome.rollOffs,
        prngBefore: state.prng,
        prngAfter: outcome.prngAfter,
        sourceRefs: [EVENT_COMPANION_FIRST_TURN_SOURCE]
      }];
    }
    case 'start-battle':
      return [{ id, commandId: command.id, type: 'battle-started', battleRound: 1, turnNumber: 1, activePlayerId: state.battle!.firstPlayerId!, sourceRefs: [CORE_BATTLE_ROUND_SOURCE, EVENT_COMPANION_FIVE_ROUNDS_SOURCE] }];
    case 'advance-battle-phase': {
      const step = nextBattleStepV1(state.battle!);
      const timedEffectExpirations = timedEffectExpirationsForPhaseTransitionV1(
        state.battleResources!,
        { battleRound: state.battle!.battleRound, turnNumber: state.battle!.turnNumber, phase: step.from },
        { battleRound: step.battleRound, turnNumber: step.turnNumber, phase: step.to }
      );
      return [{ id, commandId: command.id, type: 'battle-phase-advanced', ...step, timedEffectExpirations, sourceRefs: [CORE_BATTLE_ROUND_SOURCE, EVENT_COMPANION_FIVE_ROUNDS_SOURCE] }];
    }
    case 'resolve-command-stage': {
      const phase = state.commandPhase!;
      const resources = state.battleResources!;
      let to: typeof phase.stage;
      let commandPhaseAfter = phase;
      let gains: Readonly<Record<string, number>> = {};
      let sourceRefs;
      switch (phase.stage) {
        case 'start':
          to = 'gain-base-cp';
          sourceRefs = [CORE_COMMAND_PHASE_START_SOURCE];
          break;
        case 'gain-base-cp':
          to = 'battle-shock';
          gains = Object.fromEntries(state.battle!.playerIds.map((playerId) => [playerId, 1]));
          sourceRefs = [CORE_BASE_COMMAND_POINTS_SOURCE];
          break;
        case 'battle-shock': {
          const pending = commandPhaseBattleShockUnitIdsV1(state);
          to = pending.length === 0 ? 'abilities' : 'battle-shock';
          commandPhaseAfter = { ...phase, stage: to, pendingBattleShockUnitIds: pending };
          sourceRefs = [CORE_COMMAND_PHASE_BATTLE_SHOCK_SOURCE, OFFICIAL_APP_BATTLE_SHOCK_STEP_SOURCE, OFFICIAL_APP_MULTIPLE_BATTLE_SHOCK_SOURCE, OFFICIAL_APP_INITIAL_STRENGTH_SOURCE];
          break;
        }
        case 'abilities':
          to = 'end';
          sourceRefs = [CORE_COMMAND_ABILITIES_SOURCE];
          break;
        case 'end':
          to = 'complete';
          sourceRefs = [CORE_COMMAND_PHASE_END_SOURCE];
          break;
        case 'complete': throw new Error('Validated command phase is already complete.');
      }
      if (phase.stage !== 'battle-shock') commandPhaseAfter = { ...phase, stage: to };
      const moment = { battleRound: state.battle!.battleRound, turnNumber: state.battle!.turnNumber, phase: 'command' as const, boundary: phase.stage === 'start' ? 'start' as const : 'end' as const };
      const expiredEffectIds = phase.stage === 'start' || phase.stage === 'end' ? dueTimedEffectIdsV1(resources, moment) : [];
      return [{
        id, commandId: command.id, type: 'command-stage-resolved', playerId: command.actorId,
        from: phase.stage, to, commandPointsGainedByPlayerId: gains, commandPhaseAfter,
        expiredEffectIds, prngBefore: state.prng, prngAfter: state.prng, sourceRefs
      }];
    }
    case 'resolve-battle-shock-test': {
      const unit = state.units[command.unitId]!;
      const immediate = state.unitTurnStatuses[unit.id]?.battleShockTestRequired === true;
      const outcome = resolveBattleShockTestV1(state.prng, unit, state.battleResources!, immediate ? 'desperate-escape' : 'command-phase');
      const commandPhaseAfter = immediate ? state.commandPhase : {
        ...state.commandPhase!,
        pendingBattleShockUnitIds: state.commandPhase!.pendingBattleShockUnitIds.slice(1),
        testedBattleShockUnitIds: [...state.commandPhase!.testedBattleShockUnitIds, unit.id],
        stage: state.commandPhase!.pendingBattleShockUnitIds.length === 1 ? 'abilities' as const : 'battle-shock' as const
      };
      return [{
        id, commandId: command.id, type: 'battle-shock-test-resolved', playerId: command.actorId,
        result: outcome.result, commandPhaseAfter, battleShockedUnitIdsAfter: outcome.battleShockedUnitIdsAfter,
        prngBefore: state.prng, prngAfter: outcome.prngAfter,
        sourceRefs: immediate
          ? [CORE_DESPERATE_ESCAPE_SOURCE, CORE_COMMAND_ROLL_SOURCE, CORE_BATTLE_SHOCK_SOURCE]
          : [CORE_COMMAND_PHASE_BATTLE_SHOCK_SOURCE, CORE_COMMAND_ROLL_SOURCE, CORE_BATTLE_SHOCK_SOURCE, OFFICIAL_APP_MULTIPLE_BATTLE_SHOCK_SOURCE]
      }];
    }
    case 'use-insane-bravery': {
      const phase = state.commandPhase!;
      const battle = state.battle!;
      const commandPhaseAfter = {
        ...phase,
        pendingBattleShockUnitIds: phase.pendingBattleShockUnitIds.slice(1),
        testedBattleShockUnitIds: [...phase.testedBattleShockUnitIds, command.unitId],
        stage: phase.pendingBattleShockUnitIds.length === 1 ? 'abilities' as const : 'battle-shock' as const
      };
      const use = {
        eventId: id,
        stratagemId: 'insane-bravery' as const,
        playerId: command.actorId,
        targetUnitId: command.unitId,
        cost: INSANE_BRAVERY_COST,
        battleRound: battle.battleRound,
        turnNumber: battle.turnNumber,
        phase: battle.phase
      };
      return [{
        id, commandId: command.id, type: 'insane-bravery-used', playerId: command.actorId,
        targetUnitId: command.unitId, cost: INSANE_BRAVERY_COST, commandPhaseAfter, use,
        prngBefore: state.prng, prngAfter: state.prng, sourceRefs: INSANE_BRAVERY_SOURCES
      }];
    }
    case 'use-counter-offensive': {
      const battle = state.battle!;
      const fightPhaseAfter = { ...state.fightPhase!, forcedNextFightUnitId: command.unitId };
      const use = {
        eventId: id,
        stratagemId: 'counter-offensive' as const,
        playerId: command.actorId,
        targetUnitId: command.unitId,
        cost: COUNTER_OFFENSIVE_COST,
        battleRound: battle.battleRound,
        turnNumber: battle.turnNumber,
        phase: battle.phase
      };
      return [{
        id, commandId: command.id, type: 'counter-offensive-used', playerId: command.actorId,
        targetUnitId: command.unitId, cost: COUNTER_OFFENSIVE_COST, fightPhaseAfter, use,
        prngBefore: state.prng, prngAfter: state.prng, sourceRefs: COUNTER_OFFENSIVE_SOURCES
      }];
    }
    case 'move-unit':
      throw new Error('Unit movement requires a trusted geometry environment.');
    case 'declare-charge':
    case 'resolve-charge':
      throw new Error('Charge requires a trusted geometry environment.');
    case 'pass-fight-window':
    case 'resolve-fight-movement':
    case 'resolve-basic-melee':
    case 'resolve-empty-fight':
      throw new Error('Fight phase requires a trusted geometry environment.');
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
    case 'resolve-split-fire':
      throw new Error('Split fire requires a trusted shooting environment.');
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
