import { footprintDistance, validateFootprint, validateInteger } from './primitives';
import type { IdentifiedFootprint } from './types';

export interface CoherencyMemberResult {
  readonly id: string;
  readonly neighbourIds: readonly string[];
  readonly isCoherent: boolean;
}

export interface UnitCoherencyResult {
  readonly isCoherent: boolean;
  readonly maximumLinkDistance: number;
  readonly requiredNeighbours: number;
  readonly members: readonly CoherencyMemberResult[];
  readonly incoherentMemberIds: readonly string[];
}

/**
 * Checks model-to-model coherence from footprint edge distances. The caller supplies
 * the applicable rule threshold; this module intentionally contains no game-rule policy.
 */
export function checkUnitCoherency(
  members: readonly IdentifiedFootprint[],
  maximumLinkDistance: number,
  requiredNeighbours = 1
): UnitCoherencyResult {
  validateInteger(maximumLinkDistance, 'maximumLinkDistance');
  if (maximumLinkDistance < 0) throw new Error('maximumLinkDistance must be non-negative.');
  if (!Number.isInteger(requiredNeighbours) || requiredNeighbours < 0) throw new Error('requiredNeighbours must be a non-negative integer.');
  if (new Set(members.map((member) => member.id)).size !== members.length) throw new Error('Coherency member ids must be unique.');
  members.forEach((member) => validateFootprint(member.footprint));
  const applicableRequirement = members.length <= 1 ? 0 : requiredNeighbours;
  const results = members.map((member) => {
    const neighbourIds = members
      .filter((candidate) => candidate.id !== member.id && footprintDistance(member.footprint, candidate.footprint) <= maximumLinkDistance)
      .map((candidate) => candidate.id)
      .sort();
    return { id: member.id, neighbourIds, isCoherent: neighbourIds.length >= applicableRequirement };
  });
  const incoherentMemberIds = results.filter((member) => !member.isCoherent).map((member) => member.id);
  return { isCoherent: incoherentMemberIds.length === 0, maximumLinkDistance, requiredNeighbours: applicableRequirement, members: results, incoherentMemberIds };
}
