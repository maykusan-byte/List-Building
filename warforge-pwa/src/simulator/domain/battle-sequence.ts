import { rollDie } from './prng';
import type { BattleStateV1, PrngStateV1, SimulatorPhase } from './types';

export interface FirstPlayerRollOffV1 {
  readonly rolls: readonly { readonly playerId: string; readonly result: number }[];
}

export function nextDeploymentPlayerIdV1(
  playerIds: readonly string[],
  currentPlayerId: string,
  deployedUnitIds: readonly string[],
  units: Readonly<Record<string, { readonly id: string; readonly playerId: string }>>
): string | null {
  const remainingByPlayer = new Map(playerIds.map((playerId) => [
    playerId,
    Object.values(units).some((unit) => unit.playerId === playerId && !deployedUnitIds.includes(unit.id))
  ]));
  if (![...remainingByPlayer.values()].some(Boolean)) return null;
  const otherPlayerId = playerIds.find((playerId) => playerId !== currentPlayerId);
  if (otherPlayerId !== undefined && remainingByPlayer.get(otherPlayerId)) return otherPlayerId;
  return remainingByPlayer.get(currentPlayerId) ? currentPlayerId : null;
}

/** Deterministic roll-off; tied rounds are retained and rerolled in full. */
export function resolveFirstPlayerRollOffV1(
  prng: PrngStateV1,
  playerIds: readonly string[]
): {
  readonly winnerPlayerId: string;
  readonly rollOffs: readonly FirstPlayerRollOffV1[];
  readonly prngAfter: PrngStateV1;
} {
  if (playerIds.length !== 2 || new Set(playerIds).size !== 2 || playerIds.some((id) => !id.trim())) {
    throw new RangeError('A first-player roll-off requires exactly two distinct players.');
  }
  let current = prng;
  const rollOffs: FirstPlayerRollOffV1[] = [];
  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    const rolls: { playerId: string; result: number }[] = [];
    for (const playerId of playerIds) {
      const outcome = rollDie(current, 6);
      current = outcome.state;
      rolls.push({ playerId, result: outcome.face });
    }
    rollOffs.push({ rolls });
    if (rolls[0]!.result !== rolls[1]!.result) {
      return {
        winnerPlayerId: rolls[0]!.result > rolls[1]!.result ? rolls[0]!.playerId : rolls[1]!.playerId,
        rollOffs,
        prngAfter: current
      };
    }
  }
  throw new Error('First-player roll-off exceeded its deterministic safety limit.');
}

export interface NextBattleStepV1 {
  readonly from: SimulatorPhase;
  readonly to: SimulatorPhase;
  readonly battleRound: number;
  readonly turnNumber: number;
  readonly activePlayerId: string | null;
  readonly battleCompleted: boolean;
}

export function nextBattleStepV1(battle: BattleStateV1): NextBattleStepV1 {
  if (battle.lifecycle !== 'in-progress' || battle.activePlayerId === null || battle.battleRound < 1 || ![1, 2].includes(battle.turnNumber)) {
    throw new RangeError('Battle phases can advance only during an active player turn.');
  }
  const nextPhase: Partial<Record<SimulatorPhase, SimulatorPhase>> = {
    command: 'movement', movement: 'shooting', shooting: 'charge', charge: 'fight'
  };
  const phase = nextPhase[battle.phase];
  if (phase !== undefined) return {
    from: battle.phase, to: phase, battleRound: battle.battleRound, turnNumber: battle.turnNumber,
    activePlayerId: battle.activePlayerId, battleCompleted: false
  };
  if (battle.phase !== 'fight') throw new RangeError(`Unsupported complete-game phase ${battle.phase}.`);
  if (battle.turnNumber === 1) {
    const secondPlayerId = battle.playerIds.find((playerId) => playerId !== battle.firstPlayerId);
    if (!secondPlayerId) throw new RangeError('The second player is missing from battle state.');
    return { from: 'fight', to: 'command', battleRound: battle.battleRound, turnNumber: 2, activePlayerId: secondPlayerId, battleCompleted: false };
  }
  if (battle.battleRound >= battle.maxBattleRounds) {
    return { from: 'fight', to: 'completed', battleRound: battle.battleRound, turnNumber: 2, activePlayerId: null, battleCompleted: true };
  }
  return { from: 'fight', to: 'command', battleRound: battle.battleRound + 1, turnNumber: 1, activePlayerId: battle.firstPlayerId, battleCompleted: false };
}
