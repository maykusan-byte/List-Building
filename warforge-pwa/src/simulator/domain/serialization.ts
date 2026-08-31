import { assertPrngState } from './prng';
import { replayGameEvents } from './reducer';
import { sessionCompatibilityFingerprint } from './session-fingerprint';
import { completeGameSessionFingerprint } from './battle-state';
import {
  BATTLE_RESOURCES_V1_SCHEMA_VERSION,
  BATTLE_STATE_V1_SCHEMA_VERSION,
  COMMAND_PHASE_V1_SCHEMA_VERSION,
  GAME_EVENT_STREAM_V1_SCHEMA_VERSION,
  MISSION_STATE_V1_SCHEMA_VERSION,
  RESOLUTION_QUEUE_V1_SCHEMA_VERSION,
  SIMULATION_SAVE_SCHEMA_VERSION,
  SIMULATION_SAVE_V2_SCHEMA_VERSION,
  SIMULATION_SAVE_V3_SCHEMA_VERSION,
  SIMULATION_SAVE_V4_SCHEMA_VERSION,
  SIMULATION_SAVE_V5_SCHEMA_VERSION,
  SIMULATION_SAVE_V6_SCHEMA_VERSION,
  SIMULATOR_VERSION,
  TIMED_EFFECT_V1_SCHEMA_VERSION,
  type GameEvent,
  type GameState,
  type SaveParseResult,
  type SimulationSave,
  type SimulationSaveV1,
  type SimulationSaveV2,
  type SimulationSaveV3,
  type SimulationSaveV4,
  type SimulationSaveV5,
  type SimulationSaveV6
} from './types';

export type UnsafeSimulationReplayVerifier = (initialState: GameState, events: readonly GameEvent[]) => GameState;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCompatibleVersion(version: unknown): version is string {
  return typeof version === 'string' && version.split('.')[0] === SIMULATOR_VERSION.split('.')[0];
}

function isGameEvent(value: unknown): value is GameEvent {
  return isRecord(value) && typeof value.id === 'string' && typeof value.commandId === 'string'
    && typeof value.type === 'string'
    && ['session-setup', 'unit-deployed', 'first-player-determined', 'battle-started', 'objective-control-resolved', 'mission-scoring-resolved', 'battle-phase-advanced', 'command-stage-resolved', 'battle-shock-test-resolved', 'insane-bravery-used', 'counter-offensive-used', 'unit-movement-resolved', 'charge-declared', 'charge-resolved', 'fight-window-passed', 'fight-movement-resolved', 'basic-melee-stage-resolved', 'basic-melee-allocation-resolved', 'basic-melee-resolved', 'empty-fight-resolved', 'phase-transitioned', 'model-moved', 'dice-rolled', 'basic-shooting-resolved', 'split-fire-resolved', 'split-fire-stage-resolved', 'split-fire-retarget-choice-resolved', 'split-fire-completed', 'duplicate-weapon-ability-selection-requested', 'duplicate-weapon-ability-choice-resolved', 'basic-shooting-hit-stage-resolved', 'basic-shooting-lethal-choice-resolved', 'basic-shooting-completed', 'basic-shooting-reroll-stage-resolved', 'basic-shooting-reroll-choice-resolved', 'basic-shooting-reroll-completed', 'extended-shooting-one-shot-selected', 'extended-shooting-stage-resolved', 'extended-shooting-save-stage-resolved', 'extended-shooting-save-resolved', 'extended-shooting-allocation-choice-resolved', 'extended-shooting-packet-resolved', 'extended-shooting-packet-lost', 'extended-shooting-hazardous-resolved', 'extended-shooting-hazardous-packet-resolved', 'extended-shooting-hazardous-wounds-lost', 'extended-shooting-completed', 'oath-of-moment-selected', 'decision-requested', 'decision-resolved'].includes(value.type);
}

function isInitialState(value: unknown): value is GameState {
  if (!isRecord(value) || value.schemaVersion !== 'warforge-simulator/v1' || typeof value.gameId !== 'string' || !value.gameId.trim()
    || !isCompatibleVersion(value.simulatorVersion) || value.phase !== 'setup' || value.round !== 0 || value.manifest !== null
    || (value.battle !== undefined && value.battle !== null)
    || (value.commandPhase !== undefined && value.commandPhase !== null)
    || (value.battleResources !== undefined && value.battleResources !== null)
    || (value.mission !== undefined && value.mission !== null)
    || (value.resolutionQueue !== undefined && (!isRecord(value.resolutionQueue)
      || value.resolutionQueue.schemaVersion !== RESOLUTION_QUEUE_V1_SCHEMA_VERSION
      || value.resolutionQueue.activeEntryId !== null
      || !Array.isArray(value.resolutionQueue.entries) || value.resolutionQueue.entries.length !== 0
      || !Array.isArray(value.resolutionQueue.resolvedEntryIds) || value.resolutionQueue.resolvedEntryIds.length !== 0))
    || (value.shootingEnvironmentFingerprint !== null && value.shootingEnvironmentFingerprint !== undefined)
    || !isRecord(value.players) || Object.keys(value.players).length !== 0 || !isRecord(value.models) || Object.keys(value.models).length !== 0
    || !isRecord(value.units) || Object.keys(value.units).length !== 0
    || (value.unitTurnStatuses !== undefined && (!isRecord(value.unitTurnStatuses) || Object.keys(value.unitTurnStatuses).length !== 0))
    // This field was added after V1. It is optional only on an event-free
    // legacy initial snapshot; the session setup event initializes it.
    || (value.movedModelIds !== undefined && (!Array.isArray(value.movedModelIds) || value.movedModelIds.length !== 0))
    // This field was added after V1. It is optional only on an event-free
    // legacy initial snapshot; the session setup event initializes it.
    || (value.firedWeaponKeys !== undefined && (!Array.isArray(value.firedWeaponKeys) || value.firedWeaponKeys.length !== 0))
    // This field was added after V1. It is optional only on an event-free
    // legacy initial snapshot; the session setup event initializes it.
    || (value.shootingSelectedUnitIds !== undefined && (!Array.isArray(value.shootingSelectedUnitIds) || value.shootingSelectedUnitIds.length !== 0))
    || (value.spentOneShotWeaponInstanceKeys !== undefined && (!Array.isArray(value.spentOneShotWeaponInstanceKeys) || value.spentOneShotWeaponInstanceKeys.length !== 0))
    // This field was added after V1. It is optional only on an event-free
    // legacy initial snapshot; the session setup event always materializes it.
    || (value.oathOfMomentSelections !== undefined && (!isRecord(value.oathOfMomentSelections) || Object.keys(value.oathOfMomentSelections).length !== 0))
    || !Array.isArray(value.pendingDecisions) || value.pendingDecisions.length !== 0
    || (value.pendingLethalShooting !== undefined && value.pendingLethalShooting !== null)
    || (value.pendingRerollShooting !== undefined && value.pendingRerollShooting !== null)
    || (value.pendingExtendedShooting !== undefined && value.pendingExtendedShooting !== null)
    || (value.pendingBasicMelee !== undefined && value.pendingBasicMelee !== null)
    || (value.pendingSplitFireShooting !== undefined && value.pendingSplitFireShooting !== null)
    || (value.pendingDuplicateWeaponAbilitySelection !== undefined && value.pendingDuplicateWeaponAbilitySelection !== null)
    || (value.pendingCharge !== undefined && value.pendingCharge !== null)
    || (value.fightPhase !== undefined && value.fightPhase !== null)
    || !isRecord(value.diceResults) || Object.keys(value.diceResults).length !== 0 || !Array.isArray(value.eventLog) || value.eventLog.length !== 0) return false;
  try {
    assertPrngState(value.prng as GameState['prng']);
    const prng = value.prng as GameState['prng'];
    return prng.draws === 0 && prng.value === prng.seed;
  } catch { return false; }
}

function hasInterruptedShootingEvents(events: readonly GameEvent[]): boolean {
  return events.some((event) => event.type === 'basic-shooting-hit-stage-resolved'
    || event.type === 'basic-shooting-lethal-choice-resolved'
    || event.type === 'basic-shooting-completed'
    || event.type === 'basic-shooting-reroll-stage-resolved'
    || event.type === 'basic-shooting-reroll-choice-resolved'
    || event.type === 'basic-shooting-reroll-completed');
}

function hasT04State(events: readonly GameEvent[]): boolean {
  return events.some((event) => (event.type === 'session-setup' && event.session.units?.some((unit) => unit.extendedDefence !== undefined))
    || event.type === 'extended-shooting-one-shot-selected'
    || event.type === 'extended-shooting-stage-resolved'
    || event.type === 'extended-shooting-save-stage-resolved'
    || event.type === 'extended-shooting-save-resolved'
    || event.type === 'extended-shooting-allocation-choice-resolved'
    || event.type === 'extended-shooting-packet-resolved'
    || event.type === 'extended-shooting-packet-lost'
    || event.type === 'extended-shooting-hazardous-resolved'
    || event.type === 'extended-shooting-hazardous-packet-resolved'
    || event.type === 'extended-shooting-hazardous-wounds-lost'
    || event.type === 'extended-shooting-completed');
}

function hasSplitFireState(events: readonly GameEvent[]): boolean {
  return events.some((event) => event.type === 'split-fire-resolved'
    || event.type === 'split-fire-stage-resolved'
    || event.type === 'split-fire-retarget-choice-resolved'
    || event.type === 'split-fire-completed'
    || event.type === 'duplicate-weapon-ability-selection-requested'
    || event.type === 'duplicate-weapon-ability-choice-resolved');
}

function hasCompleteGameSession(events: readonly GameEvent[]): boolean {
  return events.some((event) => event.type === 'session-setup' && event.session.completeGame !== undefined);
}

function hasM8ResourceEvents(events: readonly GameEvent[]): boolean {
  return events.some((event) => event.type === 'command-stage-resolved'
    || event.type === 'battle-shock-test-resolved'
    || event.type === 'insane-bravery-used'
    || event.type === 'counter-offensive-used'
    || event.type === 'objective-control-resolved'
    || event.type === 'mission-scoring-resolved');
}

function assertNoCompleteGameSession(events: readonly GameEvent[], saveVersion: 'V1' | 'V2' | 'V3' | 'V4' | 'V5'): void {
  if (hasCompleteGameSession(events)) throw new RangeError(`Une sauvegarde ${saveVersion} ne peut pas contenir une session de partie complète ; utilisez V6.`);
}

function assertNoInterruptedShootingEvents(events: readonly GameEvent[], saveVersion: 'V1' | 'V2'): void {
  if (hasInterruptedShootingEvents(events)) {
    throw new RangeError(`Une sauvegarde ${saveVersion} ne peut pas contenir un journal de tir interrompu ; utilisez V3.`);
  }
}

function assertNoT04State(events: readonly GameEvent[], saveVersion: 'V1' | 'V2' | 'V3'): void {
  if (hasT04State(events)) throw new RangeError(`Une sauvegarde ${saveVersion} ne peut pas contenir un état T04 ; utilisez V4.`);
}

function assertNoSplitFireState(events: readonly GameEvent[], saveVersion: 'V1' | 'V2' | 'V3' | 'V4'): void {
  if (hasSplitFireState(events)) throw new RangeError(`Une sauvegarde ${saveVersion} ne peut pas contenir un journal de tir partagé ; utilisez V5.`);
}

function createSaveBase(initialState: GameState, events: readonly GameEvent[], createdAt: string, replayVerifier?: UnsafeSimulationReplayVerifier): SimulationSaveV1 {
  if (!isInitialState(initialState)) throw new RangeError('A save must begin with a compatible event-free initial state.');
  if (Number.isNaN(Date.parse(createdAt))) throw new RangeError('createdAt must be an ISO-compatible date string.');
  verifyReplay(initialState, events, replayVerifier);
  return { schemaVersion: SIMULATION_SAVE_SCHEMA_VERSION, simulatorVersion: SIMULATOR_VERSION, gameId: initialState.gameId, createdAt, initialState, events };
}

export function createSimulationSave(initialState: GameState, events: readonly GameEvent[], createdAt: string): SimulationSaveV1 {
  return unsafeCreateSimulationSaveWithVerifier(initialState, events, createdAt);
}

export function unsafeCreateSimulationSaveWithVerifier(initialState: GameState, events: readonly GameEvent[], createdAt: string, replayVerifier?: UnsafeSimulationReplayVerifier): SimulationSaveV1 {
  assertNoCompleteGameSession(events, 'V1');
  assertNoInterruptedShootingEvents(events, 'V1');
  assertNoT04State(events, 'V1');
  assertNoSplitFireState(events, 'V1');
  return createSaveBase(initialState, events, createdAt, replayVerifier);
}

/** V2 is intentionally opt-in: old V1 sessions remain legacy and never gain M3 compatibility. */
export function createSimulationSaveV2(
  initialState: GameState,
  events: readonly GameEvent[],
  createdAt: string,
  replayVerifier?: UnsafeSimulationReplayVerifier
): SimulationSaveV2 {
  assertNoCompleteGameSession(events, 'V2');
  assertNoInterruptedShootingEvents(events, 'V2');
  assertNoT04State(events, 'V2');
  assertNoSplitFireState(events, 'V2');
  const setup = events.find((event): event is Extract<GameEvent, { readonly type: 'session-setup' }> => event.type === 'session-setup');
  if (!setup?.session.shootingEnvironmentFingerprint?.trim() || !setup.session.units?.length) {
    throw new RangeError('Une sauvegarde V2 exige une session fermée M3.');
  }
  const base = createSaveBase(initialState, events, createdAt, replayVerifier);
  return { ...base, schemaVersion: SIMULATION_SAVE_V2_SCHEMA_VERSION, environment: {
    shootingEnvironmentFingerprint: setup.session.shootingEnvironmentFingerprint,
    scenarioId: setup.session.manifest.scenarioId,
    manifestFingerprint: sessionCompatibilityFingerprint(setup.session)
  } };
}

/** V3 is opt-in and is the sole version that carries interrupted shooting journals. */
export function createSimulationSaveV3(
  initialState: GameState,
  events: readonly GameEvent[],
  createdAt: string,
  replayVerifier?: UnsafeSimulationReplayVerifier
): SimulationSaveV3 {
  assertNoCompleteGameSession(events, 'V3');
  assertNoT04State(events, 'V3');
  assertNoSplitFireState(events, 'V3');
  const setup = events.find((event): event is Extract<GameEvent, { readonly type: 'session-setup' }> => event.type === 'session-setup');
  if (!setup?.session.shootingEnvironmentFingerprint?.trim() || !setup.session.units?.length) {
    throw new RangeError('Une sauvegarde V3 exige une session fermée M3.');
  }
  const base = createSaveBase(initialState, events, createdAt, replayVerifier);
  return { ...base, schemaVersion: SIMULATION_SAVE_V3_SCHEMA_VERSION, environment: {
    shootingEnvironmentFingerprint: setup.session.shootingEnvironmentFingerprint,
    scenarioId: setup.session.manifest.scenarioId,
    manifestFingerprint: sessionCompatibilityFingerprint(setup.session)
  } };
}

export function createSimulationSaveV4(initialState: GameState, events: readonly GameEvent[], createdAt: string, replayVerifier?: UnsafeSimulationReplayVerifier): SimulationSaveV4 {
  assertNoCompleteGameSession(events, 'V4');
  assertNoSplitFireState(events, 'V4');
  const setup = events.find((event): event is Extract<GameEvent, { readonly type: 'session-setup' }> => event.type === 'session-setup');
  if (!setup?.session.shootingEnvironmentFingerprint?.trim() || !setup.session.units?.length) throw new RangeError('Une sauvegarde V4 exige une session fermée M3.');
  const base = createSaveBase(initialState, events, createdAt, replayVerifier);
  return { ...base, schemaVersion: SIMULATION_SAVE_V4_SCHEMA_VERSION, environment: {
    shootingEnvironmentFingerprint: setup.session.shootingEnvironmentFingerprint,
    scenarioId: setup.session.manifest.scenarioId,
    manifestFingerprint: sessionCompatibilityFingerprint(setup.session)
  } };
}

/** V5 carries T05.2 split-fire declarations and their durable retarget continuations. */
export function createSimulationSaveV5(initialState: GameState, events: readonly GameEvent[], createdAt: string, replayVerifier?: UnsafeSimulationReplayVerifier): SimulationSaveV5 {
  assertNoCompleteGameSession(events, 'V5');
  const setup = events.find((event): event is Extract<GameEvent, { readonly type: 'session-setup' }> => event.type === 'session-setup');
  if (!setup?.session.shootingEnvironmentFingerprint?.trim() || !setup.session.units?.length) throw new RangeError('Une sauvegarde V5 exige une session fermée M3.');
  const base = createSaveBase(initialState, events, createdAt, replayVerifier);
  return { ...base, schemaVersion: SIMULATION_SAVE_V5_SCHEMA_VERSION, environment: {
    shootingEnvironmentFingerprint: setup.session.shootingEnvironmentFingerprint,
    scenarioId: setup.session.manifest.scenarioId,
    manifestFingerprint: sessionCompatibilityFingerprint(setup.session)
  } };
}

/** V6 is opt-in and requires a compiled, compatible complete-game setup. */
export function createSimulationSaveV6(initialState: GameState, events: readonly GameEvent[], createdAt: string, replayVerifier?: UnsafeSimulationReplayVerifier): SimulationSaveV6 {
  const setup = events.find((event): event is Extract<GameEvent, { readonly type: 'session-setup' }> => event.type === 'session-setup');
  const completeGame = setup?.session.completeGame;
  if (!setup?.session.shootingEnvironmentFingerprint?.trim() || !setup.session.units?.length || completeGame === undefined
    || setup.session.manifest.scenarioId !== completeGame.mission.id
    || setup.session.manifest.scenarioFingerprint !== completeGame.mission.definitionFingerprint
    || setup.session.manifest.coverageVersion !== completeGame.compatibility.coverageVersion) {
    throw new RangeError('Une sauvegarde V6 exige une session de partie complète compilée et compatible.');
  }
  const base = createSaveBase(initialState, events, createdAt, replayVerifier);
  return {
    ...base,
    schemaVersion: SIMULATION_SAVE_V6_SCHEMA_VERSION,
    environment: {
      shootingEnvironmentFingerprint: setup.session.shootingEnvironmentFingerprint,
      scenarioId: setup.session.manifest.scenarioId,
      manifestFingerprint: sessionCompatibilityFingerprint(setup.session),
      eventStreamSchemaVersion: GAME_EVENT_STREAM_V1_SCHEMA_VERSION,
      battleStateSchemaVersion: BATTLE_STATE_V1_SCHEMA_VERSION,
      commandPhaseSchemaVersion: COMMAND_PHASE_V1_SCHEMA_VERSION,
      battleResourcesSchemaVersion: BATTLE_RESOURCES_V1_SCHEMA_VERSION,
      timedEffectSchemaVersion: TIMED_EFFECT_V1_SCHEMA_VERSION,
      missionStateSchemaVersion: MISSION_STATE_V1_SCHEMA_VERSION,
      resolutionQueueSchemaVersion: RESOLUTION_QUEUE_V1_SCHEMA_VERSION,
      completeGameSessionFingerprint: completeGameSessionFingerprint(completeGame),
      compatibilityReportFingerprint: completeGame.compatibility.reportFingerprint
    }
  };
}

export function serializeSimulationSave(save: SimulationSave): string { return unsafeSerializeSimulationSaveWithVerifier(save); }

export function unsafeSerializeSimulationSaveWithVerifier(save: SimulationSave, replayVerifier?: UnsafeSimulationReplayVerifier): string {
  const parsed = unsafeValidateSimulationSaveWithVerifier(save, replayVerifier);
  if (!parsed.ok) throw new RangeError(parsed.errors.join(' '));
  return JSON.stringify(save);
}

export function deserializeSimulationSave(serialized: string): SaveParseResult { return unsafeDeserializeSimulationSaveWithVerifier(serialized); }

export function unsafeDeserializeSimulationSaveWithVerifier(serialized: string, replayVerifier?: UnsafeSimulationReplayVerifier): SaveParseResult {
  try { return unsafeValidateSimulationSaveWithVerifier(JSON.parse(serialized), replayVerifier); }
  catch { return { ok: false, errors: ['La sauvegarde n’est pas du JSON valide.'] }; }
}

export function validateSimulationSave(value: unknown): SaveParseResult { return unsafeValidateSimulationSaveWithVerifier(value); }

export function unsafeValidateSimulationSaveWithVerifier(value: unknown, replayVerifier?: UnsafeSimulationReplayVerifier): SaveParseResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ['La sauvegarde doit être un objet JSON.'] };
  const isV1 = value.schemaVersion === SIMULATION_SAVE_SCHEMA_VERSION;
  const isV2 = value.schemaVersion === SIMULATION_SAVE_V2_SCHEMA_VERSION;
  const isV3 = value.schemaVersion === SIMULATION_SAVE_V3_SCHEMA_VERSION;
  const isV4 = value.schemaVersion === SIMULATION_SAVE_V4_SCHEMA_VERSION;
  const isV5 = value.schemaVersion === SIMULATION_SAVE_V5_SCHEMA_VERSION;
  const isV6 = value.schemaVersion === SIMULATION_SAVE_V6_SCHEMA_VERSION;
  if (!isV1 && !isV2 && !isV3 && !isV4 && !isV5 && !isV6) errors.push(`Schéma de sauvegarde non pris en charge : ${String(value.schemaVersion)}.`);
  if (!isCompatibleVersion(value.simulatorVersion)) errors.push(`Version de simulateur incompatible : ${String(value.simulatorVersion)}.`);
  if (typeof value.gameId !== 'string' || !value.gameId.trim()) errors.push('gameId est obligatoire.');
  if (typeof value.createdAt !== 'string' || Number.isNaN(Date.parse(value.createdAt))) errors.push('createdAt doit être une date valide.');
  if (!isInitialState(value.initialState)) errors.push('L’état initial est incompatible ou contient déjà des événements.');
  if (!Array.isArray(value.events) || !value.events.every(isGameEvent)) errors.push('Le journal contient un événement inconnu ou mal formé.');
  if ((isV1 || isV2) && Array.isArray(value.events) && hasInterruptedShootingEvents(value.events as GameEvent[])) {
    errors.push(`Une sauvegarde ${isV2 ? 'V2' : 'V1'} ne peut pas contenir un journal de tir interrompu ; utilisez V3.`);
  }
  if ((isV1 || isV2 || isV3) && Array.isArray(value.events) && hasT04State(value.events as GameEvent[])) {
    errors.push(`Une sauvegarde ${isV3 ? 'V3' : isV2 ? 'V2' : 'V1'} ne peut pas contenir un état T04 ; utilisez V4.`);
  }
  if ((isV1 || isV2 || isV3 || isV4) && Array.isArray(value.events) && hasSplitFireState(value.events as GameEvent[])) {
    errors.push(`Une sauvegarde ${isV4 ? 'V4' : isV3 ? 'V3' : isV2 ? 'V2' : 'V1'} ne peut pas contenir un journal de tir partagé ; utilisez V5.`);
  }
  if ((isV1 || isV2 || isV3 || isV4 || isV5) && Array.isArray(value.events) && hasCompleteGameSession(value.events as GameEvent[])) {
    errors.push(`Une sauvegarde ${isV5 ? 'V5' : isV4 ? 'V4' : isV3 ? 'V3' : isV2 ? 'V2' : 'V1'} ne peut pas contenir une session de partie complète ; utilisez V6.`);
  }
  if (errors.length > 0) return { ok: false, errors };
  const save = value as unknown as SimulationSave;
  if (save.gameId !== save.initialState.gameId) return { ok: false, errors: ['gameId ne correspond pas à l’état initial.'] };
  if (isV2 || isV3 || isV4 || isV5 || isV6) {
    const v2 = save as SimulationSaveV2 | SimulationSaveV3 | SimulationSaveV4 | SimulationSaveV5 | SimulationSaveV6;
    const setup = v2.events.find((event): event is Extract<GameEvent, { readonly type: 'session-setup' }> => event.type === 'session-setup');
    if (!isRecord(v2.environment) || typeof v2.environment.shootingEnvironmentFingerprint !== 'string' || !v2.environment.shootingEnvironmentFingerprint.trim()
      || typeof v2.environment.scenarioId !== 'string' || !v2.environment.scenarioId.trim()
      || typeof v2.environment.manifestFingerprint !== 'string' || !v2.environment.manifestFingerprint.trim()
      || !setup?.session.units?.length
      || setup.session.shootingEnvironmentFingerprint !== v2.environment.shootingEnvironmentFingerprint
      || setup.session.manifest.scenarioId !== v2.environment.scenarioId
      || sessionCompatibilityFingerprint(setup.session) !== v2.environment.manifestFingerprint) {
      return { ok: false, errors: [`La sauvegarde ${isV6 ? 'V6' : isV5 ? 'V5' : isV4 ? 'V4' : isV3 ? 'V3' : 'V2'} ne correspond pas à une session fermée M3.`] };
    }
    if (isV6) {
      const v6 = save as SimulationSaveV6;
      const completeGame = setup.session.completeGame;
      const requiresM8Schemas = hasM8ResourceEvents(v6.events);
      if (completeGame === undefined
        || setup.session.manifest.scenarioId !== completeGame.mission.id
        || setup.session.manifest.scenarioFingerprint !== completeGame.mission.definitionFingerprint
        || setup.session.manifest.coverageVersion !== completeGame.compatibility.coverageVersion
        || v6.environment.eventStreamSchemaVersion !== GAME_EVENT_STREAM_V1_SCHEMA_VERSION
        || v6.environment.battleStateSchemaVersion !== BATTLE_STATE_V1_SCHEMA_VERSION
        || (requiresM8Schemas && v6.environment.commandPhaseSchemaVersion !== COMMAND_PHASE_V1_SCHEMA_VERSION)
        || (requiresM8Schemas && v6.environment.battleResourcesSchemaVersion !== BATTLE_RESOURCES_V1_SCHEMA_VERSION)
        || (requiresM8Schemas && v6.environment.timedEffectSchemaVersion !== TIMED_EFFECT_V1_SCHEMA_VERSION)
        || (v6.environment.commandPhaseSchemaVersion !== undefined && v6.environment.commandPhaseSchemaVersion !== COMMAND_PHASE_V1_SCHEMA_VERSION)
        || (v6.environment.battleResourcesSchemaVersion !== undefined && v6.environment.battleResourcesSchemaVersion !== BATTLE_RESOURCES_V1_SCHEMA_VERSION)
        || (v6.environment.timedEffectSchemaVersion !== undefined && v6.environment.timedEffectSchemaVersion !== TIMED_EFFECT_V1_SCHEMA_VERSION)
        || v6.environment.missionStateSchemaVersion !== MISSION_STATE_V1_SCHEMA_VERSION
        || v6.environment.resolutionQueueSchemaVersion !== RESOLUTION_QUEUE_V1_SCHEMA_VERSION
        || v6.environment.completeGameSessionFingerprint !== completeGameSessionFingerprint(completeGame)
        || v6.environment.compatibilityReportFingerprint !== completeGame.compatibility.reportFingerprint) {
        return { ok: false, errors: ['La sauvegarde V6 ne correspond pas à son environnement de partie complète.'] };
      }
    }
  }
  try { verifyReplay(save.initialState, save.events, replayVerifier); }
  catch (error) { return { ok: false, errors: [`Le journal ne peut pas être rejoué : ${error instanceof Error ? error.message : 'erreur inconnue'}`] }; }
  return { ok: true, save };
}

function verifyReplay(initialState: GameState, events: readonly GameEvent[], replayVerifier?: UnsafeSimulationReplayVerifier): GameState {
  if (events.some((event) => event.type === 'unit-deployed'
    || event.type === 'objective-control-resolved'
    || event.type === 'mission-scoring-resolved'
    || event.type === 'unit-movement-resolved'
    || event.type === 'charge-declared'
    || event.type === 'charge-resolved'
    || event.type === 'fight-window-passed'
    || event.type === 'fight-movement-resolved'
    || event.type === 'basic-melee-stage-resolved'
    || event.type === 'basic-melee-allocation-resolved'
    || event.type === 'basic-melee-resolved'
    || event.type === 'empty-fight-resolved'
    || event.type === 'basic-shooting-resolved'
    || event.type === 'split-fire-resolved'
    || event.type === 'split-fire-stage-resolved'
    || event.type === 'split-fire-retarget-choice-resolved'
    || event.type === 'split-fire-completed'
    || event.type === 'basic-shooting-hit-stage-resolved'
    || event.type === 'basic-shooting-lethal-choice-resolved'
    || event.type === 'basic-shooting-completed'
    || event.type === 'basic-shooting-reroll-stage-resolved'
    || event.type === 'basic-shooting-reroll-choice-resolved'
    || event.type === 'basic-shooting-reroll-completed'
    || event.type === 'extended-shooting-one-shot-selected'
    || event.type === 'extended-shooting-stage-resolved'
    || event.type === 'extended-shooting-save-stage-resolved'
    || event.type === 'extended-shooting-save-resolved'
    || event.type === 'extended-shooting-allocation-choice-resolved'
    || event.type === 'extended-shooting-packet-resolved'
    || event.type === 'extended-shooting-packet-lost'
    || event.type === 'extended-shooting-hazardous-resolved'
    || event.type === 'extended-shooting-hazardous-packet-resolved'
    || event.type === 'extended-shooting-hazardous-wounds-lost'
    || event.type === 'extended-shooting-completed'
    || event.type === 'oath-of-moment-selected') && !replayVerifier) throw new Error('Un journal spatial de tir ou de charge exige un vérificateur spatial autoritaire.');
  return (replayVerifier ?? replayGameEvents)(initialState, events);
}
