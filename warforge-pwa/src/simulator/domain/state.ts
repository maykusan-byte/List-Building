import { SIMULATOR_SCHEMA_VERSION, SIMULATOR_VERSION, type GameState } from './types';
import { createResolutionQueueV1 } from './battle-state';
import { createPrngState } from './prng';

export function createInitialGameState(gameId: string, seed: number): GameState {
  if (!gameId.trim()) throw new RangeError('gameId must not be empty.');
  return {
    schemaVersion: SIMULATOR_SCHEMA_VERSION,
    simulatorVersion: SIMULATOR_VERSION,
    gameId,
    phase: 'setup',
    round: 0,
    battle: null,
    commandPhase: null,
    battleResources: null,
    mission: null,
    resolutionQueue: createResolutionQueueV1(),
    manifest: null,
    shootingEnvironmentFingerprint: null,
    players: {},
    models: {},
    units: {},
    unitTurnStatuses: {},
    movedModelIds: [],
    firedWeaponKeys: [],
    shootingSelectedUnitIds: [],
    spentOneShotWeaponInstanceKeys: [],
    oathOfMomentSelections: {},
    pendingDecisions: [],
    pendingLethalShooting: null,
    pendingRerollShooting: null,
    pendingExtendedShooting: null,
    pendingBasicMelee: null,
    pendingSplitFireShooting: null,
    pendingDuplicateWeaponAbilitySelection: null,
    pendingCharge: null,
    fightPhase: null,
    diceResults: {},
    prng: createPrngState(seed),
    eventLog: []
  };
}
