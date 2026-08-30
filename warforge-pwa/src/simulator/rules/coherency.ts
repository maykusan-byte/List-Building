import { checkUnitCoherency, footprintDistance, type IdentifiedFootprint } from '../geometry';

export const V11_COHERENCY_LINK_DISTANCE = 508;
export const V11_COHERENCY_MAXIMUM_SPAN = 2_286;

export interface V11UnitCoherencyResult {
  readonly isCoherent: boolean;
  readonly maximumLinkDistance: number;
  readonly requiredNeighbours: 0 | 1;
  readonly maximumPairDistance: number;
  readonly incoherentModelIds: readonly string[];
  readonly distantPairs: readonly { readonly leftModelId: string; readonly rightModelId: string; readonly distance: number }[];
}

/** Core 03.03: one neighbour within 2", and every pair within 9". */
export function evaluateV11UnitCoherency(members: readonly IdentifiedFootprint[]): V11UnitCoherencyResult {
  if (members.length === 0) throw new RangeError('Unit coherency requires at least one model.');
  const local = checkUnitCoherency(members, V11_COHERENCY_LINK_DISTANCE, 1);
  const distantPairs = members.flatMap((left, leftIndex) => members.slice(leftIndex + 1).flatMap((right) => {
    const distance = footprintDistance(left.footprint, right.footprint);
    return distance <= V11_COHERENCY_MAXIMUM_SPAN ? [] : [{
      leftModelId: left.id.localeCompare(right.id) <= 0 ? left.id : right.id,
      rightModelId: left.id.localeCompare(right.id) <= 0 ? right.id : left.id,
      distance
    }];
  })).sort((left, right) => left.leftModelId.localeCompare(right.leftModelId) || left.rightModelId.localeCompare(right.rightModelId));
  const incoherentModelIds = [...new Set([
    ...local.incoherentMemberIds,
    ...distantPairs.flatMap((pair) => [pair.leftModelId, pair.rightModelId])
  ])].sort();
  return {
    isCoherent: incoherentModelIds.length === 0,
    maximumLinkDistance: V11_COHERENCY_LINK_DISTANCE,
    requiredNeighbours: members.length === 1 ? 0 : 1,
    maximumPairDistance: V11_COHERENCY_MAXIMUM_SPAN,
    incoherentModelIds,
    distantPairs
  };
}
