import { assertPrngState } from './prng';
import { replayGameEvents } from './reducer';
import { sessionCompatibilityFingerprint } from './session-fingerprint';
import {
  SIMULATION_SAVE_SCHEMA_VERSION,
  SIMULATION_SAVE_V2_SCHEMA_VERSION,
  SIMULATOR_VERSION,
  type GameEvent,
  type GameState,
  type SaveParseResult,
  type SimulationSave,
  type SimulationSaveV1,
  type SimulationSaveV2
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
    && ['session-setup', 'phase-transitioned', 'model-moved', 'dice-rolled', 'basic-shooting-resolved', 'decision-requested', 'decision-resolved'].includes(value.type);
}

function isInitialState(value: unknown): value is GameState {
  if (!isRecord(value) || value.schemaVersion !== 'warforge-simulator/v1' || typeof value.gameId !== 'string' || !value.gameId.trim()
    || !isCompatibleVersion(value.simulatorVersion) || value.phase !== 'setup' || value.round !== 0 || value.manifest !== null
    || (value.shootingEnvironmentFingerprint !== null && value.shootingEnvironmentFingerprint !== undefined)
    || !isRecord(value.players) || Object.keys(value.players).length !== 0 || !isRecord(value.models) || Object.keys(value.models).length !== 0
    || !isRecord(value.units) || Object.keys(value.units).length !== 0 || !Array.isArray(value.pendingDecisions) || value.pendingDecisions.length !== 0
    || !isRecord(value.diceResults) || Object.keys(value.diceResults).length !== 0 || !Array.isArray(value.eventLog) || value.eventLog.length !== 0) return false;
  try {
    assertPrngState(value.prng as GameState['prng']);
    const prng = value.prng as GameState['prng'];
    return prng.draws === 0 && prng.value === prng.seed;
  } catch { return false; }
}

export function createSimulationSave(initialState: GameState, events: readonly GameEvent[], createdAt: string): SimulationSaveV1 {
  return unsafeCreateSimulationSaveWithVerifier(initialState, events, createdAt);
}

export function unsafeCreateSimulationSaveWithVerifier(initialState: GameState, events: readonly GameEvent[], createdAt: string, replayVerifier?: UnsafeSimulationReplayVerifier): SimulationSaveV1 {
  if (!isInitialState(initialState)) throw new RangeError('A save must begin with a compatible event-free initial state.');
  if (Number.isNaN(Date.parse(createdAt))) throw new RangeError('createdAt must be an ISO-compatible date string.');
  verifyReplay(initialState, events, replayVerifier);
  return { schemaVersion: SIMULATION_SAVE_SCHEMA_VERSION, simulatorVersion: SIMULATOR_VERSION, gameId: initialState.gameId, createdAt, initialState, events };
}

/** V2 is intentionally opt-in: old V1 sessions remain legacy and never gain M3 compatibility. */
export function createSimulationSaveV2(
  initialState: GameState,
  events: readonly GameEvent[],
  createdAt: string,
  replayVerifier?: UnsafeSimulationReplayVerifier
): SimulationSaveV2 {
  const setup = events.find((event): event is Extract<GameEvent, { readonly type: 'session-setup' }> => event.type === 'session-setup');
  if (!setup?.session.shootingEnvironmentFingerprint?.trim() || !setup.session.units?.length) {
    throw new RangeError('Une sauvegarde V2 exige une session fermée M3.');
  }
  const base = unsafeCreateSimulationSaveWithVerifier(initialState, events, createdAt, replayVerifier);
  return { ...base, schemaVersion: SIMULATION_SAVE_V2_SCHEMA_VERSION, environment: {
    shootingEnvironmentFingerprint: setup.session.shootingEnvironmentFingerprint,
    scenarioId: setup.session.manifest.scenarioId,
    manifestFingerprint: sessionCompatibilityFingerprint(setup.session)
  } };
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
  if (!isV1 && !isV2) errors.push(`Schéma de sauvegarde non pris en charge : ${String(value.schemaVersion)}.`);
  if (!isCompatibleVersion(value.simulatorVersion)) errors.push(`Version de simulateur incompatible : ${String(value.simulatorVersion)}.`);
  if (typeof value.gameId !== 'string' || !value.gameId.trim()) errors.push('gameId est obligatoire.');
  if (typeof value.createdAt !== 'string' || Number.isNaN(Date.parse(value.createdAt))) errors.push('createdAt doit être une date valide.');
  if (!isInitialState(value.initialState)) errors.push('L’état initial est incompatible ou contient déjà des événements.');
  if (!Array.isArray(value.events) || !value.events.every(isGameEvent)) errors.push('Le journal contient un événement inconnu ou mal formé.');
  if (errors.length > 0) return { ok: false, errors };
  const save = value as unknown as SimulationSave;
  if (save.gameId !== save.initialState.gameId) return { ok: false, errors: ['gameId ne correspond pas à l’état initial.'] };
  if (isV2) {
    const v2 = save as SimulationSaveV2;
    const setup = v2.events.find((event): event is Extract<GameEvent, { readonly type: 'session-setup' }> => event.type === 'session-setup');
    if (!isRecord(v2.environment) || typeof v2.environment.shootingEnvironmentFingerprint !== 'string' || !v2.environment.shootingEnvironmentFingerprint.trim()
      || typeof v2.environment.scenarioId !== 'string' || !v2.environment.scenarioId.trim()
      || typeof v2.environment.manifestFingerprint !== 'string' || !v2.environment.manifestFingerprint.trim()
      || !setup?.session.units?.length
      || setup.session.shootingEnvironmentFingerprint !== v2.environment.shootingEnvironmentFingerprint
      || setup.session.manifest.scenarioId !== v2.environment.scenarioId
      || sessionCompatibilityFingerprint(setup.session) !== v2.environment.manifestFingerprint) {
      return { ok: false, errors: ['La sauvegarde V2 ne correspond pas à une session fermée M3.'] };
    }
  }
  try { verifyReplay(save.initialState, save.events, replayVerifier); }
  catch (error) { return { ok: false, errors: [`Le journal ne peut pas être rejoué : ${error instanceof Error ? error.message : 'erreur inconnue'}`] }; }
  return { ok: true, save };
}

function verifyReplay(initialState: GameState, events: readonly GameEvent[], replayVerifier?: UnsafeSimulationReplayVerifier): GameState {
  if (events.some((event) => event.type === 'basic-shooting-resolved') && !replayVerifier) throw new Error('Un journal de tir exige un vérificateur spatial autoritaire.');
  return (replayVerifier ?? replayGameEvents)(initialState, events);
}
