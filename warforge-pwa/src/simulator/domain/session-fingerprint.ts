import type { CoverageEntryV1, SessionSetup } from './types';

export interface SessionCoverageRequirement {
  readonly subjectType: CoverageEntryV1['subjectType'];
  readonly subjectId: string;
}

function requirementKey(requirement: SessionCoverageRequirement): string {
  return `${requirement.subjectType}:${requirement.subjectId}`;
}

/** Exhaustive dependencies implied by a concrete simulator session. */
export function sessionCoverageRequirements(session: SessionSetup): readonly SessionCoverageRequirement[] {
  return [...new Map([
    ...(session.units ?? []).flatMap((unit) => [
      unit.coverageSubject ?? { subjectType: 'fixture-unit' as const, subjectId: unit.fixtureId },
      ...unit.weaponProfiles.map((weapon) => ({ subjectType: 'weapon' as const, subjectId: weapon.id })),
      ...(unit.weaponAssignments ?? []).map((assignment) => ({ subjectType: 'weapon' as const, subjectId: assignment.weaponProfileId }))
    ]),
    ...session.models.map((model) => ({ subjectType: 'physical-profile' as const, subjectId: model.profileId })),
    ...session.manifest.rulePackIds.map((rulePackId) => ({ subjectType: 'rule' as const, subjectId: rulePackId })),
    { subjectType: 'scenario' as const, subjectId: session.manifest.scenarioId }
  ].map((requirement) => [requirementKey(requirement), requirement])).values()];
}

/** Canonical compatibility identity bound to manifest, models, units and environment. */
export function sessionCompatibilityFingerprint(
  session: SessionSetup,
  requirements: readonly SessionCoverageRequirement[] = sessionCoverageRequirements(session)
): string {
  const manifest = session.manifest;
  return JSON.stringify({
    simulatorVersion: manifest.simulatorVersion,
    catalogFingerprint: manifest.catalogFingerprint,
    rulePackIds: manifest.rulePackIds,
    rulePackFingerprint: manifest.rulePackFingerprint,
    scenarioId: manifest.scenarioId,
    scenarioFingerprint: manifest.scenarioFingerprint,
    coverageVersion: manifest.coverageVersion,
    shootingEnvironmentFingerprint: session.shootingEnvironmentFingerprint ?? null,
    players: [...session.players].map((player) => ({ id: player.id, rosterId: player.rosterId })).sort((left, right) => left.id.localeCompare(right.id)),
    models: [...session.models].map((model) => ({
      id: model.id, playerId: model.playerId, profileId: model.profileId,
      position: model.position, orientationDegrees: model.orientationDegrees
    })).sort((left, right) => left.id.localeCompare(right.id)),
    units: [...(session.units ?? [])].map((unit) => ({
      id: unit.id, fixtureId: unit.fixtureId, coverageSubject: unit.coverageSubject ?? null, playerId: unit.playerId,
      modelIds: [...unit.modelIds], keywords: [...unit.keywords], toughness: unit.toughness,
      save: unit.save, woundsPerModel: unit.woundsPerModel, weaponProfiles: unit.weaponProfiles,
      weaponAssignments: unit.weaponAssignments ?? [], sourceRefs: unit.sourceRefs
    })).sort((left, right) => left.id.localeCompare(right.id)),
    requirements: [...requirements].map(requirementKey).sort()
  });
}
