import { sessionCompatibilityFingerprint, sessionCoverageRequirements, type CoverageEntryV1, type CoverageReportV1, type SessionSetup } from '../domain';

export type SimulationCoverageSubjectType = CoverageEntryV1['subjectType'];

/** A concrete simulator dependency that must be explicitly covered before play. */
export interface SimulationCoverageRequirement {
  readonly subjectType: SimulationCoverageSubjectType;
  readonly subjectId: string;
}

export interface CompatibilityFailure {
  readonly requirement: SimulationCoverageRequirement;
  readonly code: 'missing-coverage' | 'partial-coverage' | 'invalid-requirement';
  readonly message: string;
  readonly entries: readonly CoverageEntryV1[];
}

/**
 * A serializable, explainable verdict used to gate session setup.  Callers are
 * responsible for listing every rule, weapon, profile and scenario consumed by
 * their adapter; this module deliberately never guesses missing dependencies.
 */
export interface SimulationCompatibilityReport {
  readonly coverageVersion: string;
  /** Null for a generic report that cannot authorize a particular session. */
  readonly manifestFingerprint: string | null;
  readonly requirements: readonly SimulationCoverageRequirement[];
  readonly failures: readonly CompatibilityFailure[];
  readonly isCompatible: boolean;
}

function requirementKey(requirement: SimulationCoverageRequirement): string {
  return `${requirement.subjectType}:${requirement.subjectId}`;
}

function isRequirement(value: SimulationCoverageRequirement): boolean {
  return value.subjectId.trim().length > 0;
}

/**
 * Checks declared dependencies against the immutable coverage matrix.  A
 * `partial` entry is intentionally a blocker: a valid game is never produced
 * from an approximation.
 */
export function createSimulationCompatibilityReport(
  coverage: CoverageReportV1,
  requirements: readonly SimulationCoverageRequirement[]
): SimulationCompatibilityReport {
  const uniqueRequirements = [...new Map(requirements.map((requirement) => [requirementKey(requirement), requirement])).values()];
  const failures: CompatibilityFailure[] = [];

  for (const requirement of uniqueRequirements) {
    if (!isRequirement(requirement)) {
      failures.push({
        requirement,
        code: 'invalid-requirement',
        message: 'Une dépendance de simulation doit avoir un identifiant non vide.',
        entries: []
      });
      continue;
    }

    const entries = coverage.entries.filter((entry) => entry.subjectType === requirement.subjectType && entry.subjectId === requirement.subjectId);
    if (entries.length === 0) {
      failures.push({
        requirement,
        code: 'missing-coverage',
        message: `Aucune couverture n’est déclarée pour ${requirement.subjectType}:${requirement.subjectId}.`,
        entries
      });
      continue;
    }

    if (entries.some((entry) => entry.status !== 'covered')) {
      failures.push({
        requirement,
        code: 'partial-coverage',
        message: `La couverture de ${requirement.subjectType}:${requirement.subjectId} n’est pas complète.`,
        entries
      });
    }
  }

  return {
    coverageVersion: coverage.version,
    manifestFingerprint: null,
    requirements: uniqueRequirements,
    failures,
    isCompatible: failures.length === 0
  };
}

/**
 * Builds the report required to authorize one concrete session.  Profiles,
 * scenario and declared rule packs are inferred from the immutable session;
 * roster adapters must add their unit and weapon requirements explicitly.
 */
export function createSessionCompatibilityReport(
  session: SessionSetup,
  coverage: CoverageReportV1,
  adapterRequirements: readonly SimulationCoverageRequirement[] = []
): SimulationCompatibilityReport {
  const report = createSimulationCompatibilityReport(coverage, [
    ...adapterRequirements,
    ...sessionCoverageRequirements(session)
  ]);
  return { ...report, manifestFingerprint: sessionCompatibilityFingerprint(session, report.requirements) };
}

/**
 * Ensures that a compatibility verdict belongs to the manifest being started.
 * This prevents a successful report built from an older coverage matrix from
 * silently authorizing a newer session.
 */
export function isSessionCompatible(session: SessionSetup, report: SimulationCompatibilityReport): boolean {
  return session.manifest.coverageVersion === report.coverageVersion
    && report.manifestFingerprint === sessionCompatibilityFingerprint(session, report.requirements)
    && report.isCompatible;
}
