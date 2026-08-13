import type { GameState, SimulationSave } from '../domain';

export const SIMULATION_AUTOSAVE_SCHEMA_VERSION = 'warforge-simulation-autosave/v1' as const;

/**
 * A durable entry contains both a replay-first save and its derived snapshot.
 * The snapshot makes resume fast; it is validated against the event log before
 * any state is returned to the application.
 */
export interface SimulationAutosaveV1 {
  readonly schemaVersion: typeof SIMULATION_AUTOSAVE_SCHEMA_VERSION;
  readonly gameId: string;
  readonly savedAt: string;
  readonly save: SimulationSave;
  readonly snapshot: GameState;
}

/** Storage is injectable so the domain stays browser-independent and tests do not need IndexedDB. */
export interface SimulationStorageAdapter {
  read(gameId: string): Promise<unknown | null>;
  write(autosave: SimulationAutosaveV1): Promise<void>;
  remove(gameId: string): Promise<void>;
}

export type ImportSimulationResult =
  | { readonly ok: true; readonly save: SimulationSave; readonly state: GameState }
  | { readonly ok: false; readonly errors: readonly string[] };

export type AutosaveParseResult =
  | { readonly ok: true; readonly autosave: SimulationAutosaveV1; readonly state: GameState }
  | { readonly ok: false; readonly errors: readonly string[] };
