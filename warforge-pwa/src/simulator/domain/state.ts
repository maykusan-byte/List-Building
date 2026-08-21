import { SIMULATOR_SCHEMA_VERSION, SIMULATOR_VERSION, type GameState } from './types';
import { createPrngState } from './prng';

export function createInitialGameState(gameId: string, seed: number): GameState {
  if (!gameId.trim()) throw new RangeError('gameId must not be empty.');
  return {
    schemaVersion: SIMULATOR_SCHEMA_VERSION,
    simulatorVersion: SIMULATOR_VERSION,
    gameId,
    phase: 'setup',
    round: 0,
    manifest: null,
    shootingEnvironmentFingerprint: null,
    players: {},
    models: {},
    units: {},
    oathOfMomentSelections: {},
    pendingDecisions: [],
    diceResults: {},
    prng: createPrngState(seed),
    eventLog: []
  };
}
