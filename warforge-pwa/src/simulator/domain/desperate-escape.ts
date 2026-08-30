import { rollDie } from './prng';
import type { PrngStateV1, UnitModelState, UnitState } from './types';

export interface DesperateEscapeRiskResolutionV1 {
  readonly riskRolls: readonly { readonly modelId: string; readonly result: number }[];
  readonly mortalWounds: number;
  readonly mortalWoundAllocations: readonly string[];
  readonly unitModelsAfter: readonly UnitModelState[];
  readonly prngAfter: PrngStateV1;
}

function modelIsCharacter(unit: UnitState, modelId: string): boolean {
  return unit.extendedDefence?.[modelId]?.isCharacter
    ?? unit.keywords.some((keyword) => keyword.trim().toUpperCase() === 'CHARACTER' || keyword.trim().toUpperCase() === 'PERSONNAGE');
}

/**
 * Resolves simultaneous risk rolls, then applies §06.02. The player supplies
 * a complete priority order for every discretionary model choice; mandatory
 * wounded/non-CHARACTER priorities still override that order.
 */
export function resolveDesperateEscapeRiskV1(
  prng: PrngStateV1,
  unit: UnitState,
  playerAllocationOrder: readonly string[]
): DesperateEscapeRiskResolutionV1 {
  const activeModels = unit.models.filter((model) => model.active).sort((left, right) => left.id.localeCompare(right.id));
  const activeModelIds = activeModels.map((model) => model.id).sort();
  const orderedModelIds = [...playerAllocationOrder];
  if (orderedModelIds.length !== activeModelIds.length || new Set(orderedModelIds).size !== orderedModelIds.length
    || [...orderedModelIds].sort().some((modelId, index) => modelId !== activeModelIds[index])) {
    throw new Error('Desperate Escape requires a complete player-selected allocation order.');
  }
  let currentPrng = prng;
  const riskRolls: { modelId: string; result: number }[] = [];
  for (const model of activeModels) {
    const roll = rollDie(currentPrng, 6);
    currentPrng = roll.state;
    riskRolls.push({ modelId: model.id, result: roll.face });
  }
  const mortalWounds = riskRolls.filter((roll) => roll.result <= 2).length;
  let models = unit.models.map((model) => ({ ...model }));
  const mortalWoundAllocations: string[] = [];
  for (let wound = 0; wound < mortalWounds; wound += 1) {
    const prioritized = orderedModelIds
      .map((modelId) => models.find((model) => model.id === modelId))
      .filter((model): model is UnitModelState => model !== undefined && model.active);
    const candidate = prioritized.find((model) => !modelIsCharacter(unit, model.id) && model.wounds < unit.woundsPerModel)
      ?? prioritized.find((model) => !modelIsCharacter(unit, model.id))
      ?? prioritized.find((model) => model.wounds < unit.woundsPerModel)
      ?? prioritized[0];
    if (!candidate) break;
    mortalWoundAllocations.push(candidate.id);
    models = models.map((model) => model.id !== candidate.id ? model : {
      ...model,
      wounds: model.wounds - 1,
      active: model.wounds - 1 > 0
    });
  }
  return { riskRolls, mortalWounds, mortalWoundAllocations, unitModelsAfter: models, prngAfter: currentPrng };
}
