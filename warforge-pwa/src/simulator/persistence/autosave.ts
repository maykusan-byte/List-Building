import { createSimulationSaveV2, replayGameEvents, type GameState, type SimulationSave } from '../domain';
import {
  unsafeCreateSimulationSaveWithVerifier,
  unsafeDeserializeSimulationSaveWithVerifier,
  unsafeSerializeSimulationSaveWithVerifier,
  unsafeValidateSimulationSaveWithVerifier
} from '../domain/serialization';
import { createShootingReplayVerifier, replayGameEventsWithShootingEnvironment, type ShootingEnvironment } from '../orchestration/shooting';
import {
  SIMULATION_AUTOSAVE_SCHEMA_VERSION,
  type AutosaveParseResult,
  type ImportSimulationResult,
  type SimulationAutosaveV1,
  type SimulationStorageAdapter
} from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function stateEquals(left: GameState, right: GameState): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function verifierFor(environment?: ShootingEnvironment) {
  return environment ? createShootingReplayVerifier(environment) : undefined;
}

function replay(initialState: GameState, events: SimulationSave['events'], environment?: ShootingEnvironment): GameState {
  return environment ? replayGameEventsWithShootingEnvironment(initialState, events, environment) : replayGameEvents(initialState, events);
}

/** Exports exactly the data that can be replayed by the deterministic domain. */
export function exportSimulation(initialState: GameState, state: GameState, createdAt: string, environment?: ShootingEnvironment): string {
  const verifier = verifierFor(environment);
  const save = environment && state.manifest && state.shootingEnvironmentFingerprint === environment.fingerprint
    ? createSimulationSaveV2(initialState, state.eventLog, createdAt, verifier)
    : unsafeCreateSimulationSaveWithVerifier(initialState, state.eventLog, createdAt, verifier);
  return unsafeSerializeSimulationSaveWithVerifier(save, verifier);
}

/** Parses, validates and replays untrusted JSON before exposing a restored game. */
export function importSimulation(serialized: string, environment?: ShootingEnvironment, expectedManifestFingerprint?: string): ImportSimulationResult {
  const parsed = unsafeDeserializeSimulationSaveWithVerifier(serialized, verifierFor(environment));
  if (!parsed.ok) return parsed;
  if (environment && parsed.save.schemaVersion === 'warforge-simulation-save/v1') {
    return { ok: false, errors: ['Une sauvegarde V1 n’est pas automatiquement compatible avec une session de tir fermée.'] };
  }
  if (environment && parsed.save.schemaVersion === 'warforge-simulation-save/v2') {
    if (!expectedManifestFingerprint) return { ok: false, errors: ['Le manifeste de session fermée attendu est obligatoire pour importer une sauvegarde de tir.'] };
    if (parsed.save.environment.manifestFingerprint !== expectedManifestFingerprint) return { ok: false, errors: ['La sauvegarde ne correspond pas au manifeste de session fermée attendu.'] };
  }
  try {
    return { ok: true, save: parsed.save, state: replay(parsed.save.initialState, parsed.save.events, environment) };
  } catch (error) {
    return { ok: false, errors: [`Le journal ne peut pas être rejoué : ${error instanceof Error ? error.message : 'erreur inconnue'}`] };
  }
}

/**
 * Builds a validated autosave record.  The current snapshot is not trusted on
 * restore; it is checked against a fresh replay below.
 */
export function createSimulationAutosave(initialState: GameState, state: GameState, savedAt: string, environment?: ShootingEnvironment): SimulationAutosaveV1 {
  const verifier = verifierFor(environment);
  const save = environment && state.manifest && state.shootingEnvironmentFingerprint === environment.fingerprint
    ? createSimulationSaveV2(initialState, state.eventLog, savedAt, verifier)
    : unsafeCreateSimulationSaveWithVerifier(initialState, state.eventLog, savedAt, verifier);
  const replayed = replay(save.initialState, save.events, environment);
  if (!stateEquals(replayed, state)) throw new RangeError('Le snapshot ne correspond pas au journal déterministe.');
  return {
    schemaVersion: SIMULATION_AUTOSAVE_SCHEMA_VERSION,
    gameId: state.gameId,
    savedAt,
    save,
    snapshot: state
  };
}

/** Validates the storage boundary and reconstructs state from the event log. */
export function validateSimulationAutosave(value: unknown, environment?: ShootingEnvironment, expectedManifestFingerprint?: string): AutosaveParseResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ['L’autosauvegarde doit être un objet JSON.'] };
  if (value.schemaVersion !== SIMULATION_AUTOSAVE_SCHEMA_VERSION) errors.push(`Schéma d’autosauvegarde non pris en charge : ${String(value.schemaVersion)}.`);
  if (typeof value.gameId !== 'string' || !value.gameId.trim()) errors.push('gameId est obligatoire.');
  if (!isIsoDate(value.savedAt)) errors.push('savedAt doit être une date valide.');
  const validatedSave = unsafeValidateSimulationSaveWithVerifier(value.save, verifierFor(environment));
  if (!validatedSave.ok) errors.push(...validatedSave.errors.map((error) => `Sauvegarde : ${error}`));
  if (environment && validatedSave.ok && validatedSave.save.schemaVersion === 'warforge-simulation-save/v1') {
    errors.push('Sauvegarde : une V1 ne peut pas restaurer automatiquement une session de tir fermée.');
  }
  if (environment && validatedSave.ok && validatedSave.save.schemaVersion === 'warforge-simulation-save/v2') {
    if (!expectedManifestFingerprint) errors.push('Sauvegarde : le manifeste de session fermée attendu est obligatoire.');
    else if (validatedSave.save.environment.manifestFingerprint !== expectedManifestFingerprint) errors.push('Sauvegarde : le manifeste ne correspond pas à la session fermée attendue.');
  }
  if (!isRecord(value.snapshot)) errors.push('Le snapshot est obligatoire.');
  if (errors.length > 0 || !validatedSave.ok) return { ok: false, errors };

  const autosave = value as unknown as SimulationAutosaveV1;
  if (autosave.gameId !== validatedSave.save.gameId || autosave.gameId !== validatedSave.save.initialState.gameId) {
    return { ok: false, errors: ['gameId ne correspond pas à la sauvegarde.'] };
  }

  try {
    const state = replay(validatedSave.save.initialState, validatedSave.save.events, environment);
    if (!stateEquals(state, autosave.snapshot)) return { ok: false, errors: ['Le snapshot ne correspond pas au replay du journal.'] };
    return { ok: true, autosave, state };
  } catch (error) {
    return { ok: false, errors: [`Le journal ne peut pas être rejoué : ${error instanceof Error ? error.message : 'erreur inconnue'}`] };
  }
}

/** Coordinates a storage adapter with the deterministic serialization guards. */
export class SimulationAutosaveController {
  public constructor(
    private readonly storage: SimulationStorageAdapter,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly shootingEnvironment?: ShootingEnvironment,
    private readonly expectedManifestFingerprint?: string
  ) {}

  public async autosave(initialState: GameState, state: GameState): Promise<SimulationAutosaveV1> {
    const autosave = createSimulationAutosave(initialState, state, this.now(), this.shootingEnvironment);
    await this.storage.write(autosave);
    return autosave;
  }

  public async restore(gameId: string): Promise<AutosaveParseResult | null> {
    const stored = await this.storage.read(gameId);
    return stored === null ? null : validateSimulationAutosave(stored, this.shootingEnvironment, this.expectedManifestFingerprint);
  }

  public remove(gameId: string): Promise<void> {
    return this.storage.remove(gameId);
  }
}

/** Useful when an import should be persisted without trusting its raw text. */
export function createAutosaveFromImport(serialized: string, savedAt: string, environment?: ShootingEnvironment, expectedManifestFingerprint?: string): AutosaveParseResult {
  const imported = importSimulation(serialized, environment, expectedManifestFingerprint);
  if (!imported.ok) return imported;
  try {
    const autosave = createSimulationAutosave(imported.save.initialState, imported.state, savedAt, environment);
    return { ok: true, autosave, state: imported.state };
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : 'Impossible de créer l’autosauvegarde.'] };
  }
}

/** Exported for consumers that want the concrete validated save without JSON. */
export function createReplaySave(initialState: GameState, state: GameState, createdAt: string, environment?: ShootingEnvironment): SimulationSave {
  if (environment && state.manifest && state.shootingEnvironmentFingerprint === environment.fingerprint) {
    return createSimulationSaveV2(initialState, state.eventLog, createdAt, verifierFor(environment));
  }
  return unsafeCreateSimulationSaveWithVerifier(initialState, state.eventLog, createdAt, verifierFor(environment));
}
