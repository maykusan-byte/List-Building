import {
  compatibilityReportFingerprintV2,
  type CompatibilityReportV2,
  type CompatibilityRequirementV2
} from './full-game-compiler';

export const CORE_POC_COVERAGE_SCHEMA = 'warforge-simulator-core-poc-coverage/v1' as const;
export const CORE_POC_SCOPE = 'closed-complete-game-core-poc-v1' as const;
export const CORE_POC_TECHNICAL_LIMITATION_IDS = [
  'core-stratagem.command-reroll',
  'core-stratagem.epic-challenge',
  'core-stratagem.overwatch',
  'core-stratagem.heroic-intervention'
] as const;

export type CorePocRequirementStatus = 'covered' | 'partial' | 'planned';

export interface CorePocCoverageRequirementV1 {
  readonly id: string;
  readonly kind: 'core-rule' | 'core-stratagem' | 'mission-rule' | 'project-physical-convention' | 'runtime' | 'persistence' | 'ui';
  readonly required: boolean;
  readonly status: CorePocRequirementStatus;
  readonly sourceIds: readonly string[];
  readonly note: string;
}

export interface CorePocFixtureUnitV1 {
  readonly id: string;
  readonly subjectType: 'fixture-unit';
  readonly role: 'line' | 'character';
  readonly modelCount: number;
  readonly physicalProfileId: string;
  readonly runtimeStatus: 'planned' | 'ready';
}

export interface CorePocCoverageDocumentV1 {
  readonly schemaVersion: typeof CORE_POC_COVERAGE_SCHEMA;
  readonly version: string;
  readonly manifestVersion: string;
  readonly scope: typeof CORE_POC_SCOPE;
  readonly status: 'draft-blocked' | 'covered';
  readonly decisionReference: 'ADR-022';
  readonly technicalDecisionReference: 'ADR-025';
  readonly catalogPolicy: {
    readonly coverageClaim: 'none';
    readonly supportedUnitIds: readonly never[];
    readonly supportedFactionIds: readonly never[];
    readonly unitSubjectType: 'fixture-unit';
    readonly allowsRosterDraftImport: false;
    readonly statement: string;
  };
  readonly canonicalSourceIds: readonly string[];
  readonly excludedContent: readonly {
    readonly id: string;
    readonly status: 'excluded-from-poc';
    readonly reason: string;
  }[];
  readonly technicalLimitations: readonly {
    readonly id: typeof CORE_POC_TECHNICAL_LIMITATION_IDS[number];
    readonly status: 'unsupported-in-technical-poc';
    readonly ruleReferences: readonly string[];
    readonly reason: string;
  }[];
  readonly physicalConvention: {
    readonly status: 'pending-human-review' | 'human-reviewed';
    readonly requestedScope: typeof CORE_POC_SCOPE;
    readonly profileIds: readonly string[];
    readonly basis: string;
    readonly reviewedBy: 'project-owner' | null;
    readonly reviewedAt: string | null;
  };
  readonly forces: readonly {
    readonly id: string;
    readonly playerId: string;
    readonly displayName: string;
    readonly units: readonly CorePocFixtureUnitV1[];
  }[];
  readonly requirements: readonly CorePocCoverageRequirementV1[];
  readonly readiness: {
    readonly compatible: boolean;
    readonly blockingRequirementIds: readonly string[];
    readonly pendingOwnerActions: readonly string[];
  };
}

export interface CorePocCompatibilityReportV1 {
  readonly schemaVersion: 'warforge-core-poc-compatibility-report/v1';
  readonly scope: typeof CORE_POC_SCOPE;
  readonly coverageVersion: string;
  readonly manifestVersion: string;
  readonly compatible: boolean;
  readonly fixtureUnitIds: readonly string[];
  readonly supportedCatalogUnitIds: readonly never[];
  readonly blockingRequirementIds: readonly string[];
  readonly pendingOwnerActions: readonly string[];
  readonly issues: readonly { readonly code: string; readonly subjectId: string; readonly message: string }[];
}

const REQUIRED_EXCLUSIONS = [
  'army-codex-data',
  'army-rules',
  'catalog-points-and-legality',
  'datasheet-abilities',
  'detachment-rules',
  'enhancements',
  'faction-stratagems'
] as const;

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function compileCorePocCompatibilityV1(
  document: CorePocCoverageDocumentV1,
  environment: { readonly manifestVersion: string; readonly registeredSourceIds: readonly string[] }
): CorePocCompatibilityReportV1 {
  const issues: { code: string; subjectId: string; message: string }[] = [];
  const issue = (code: string, subjectId: string, message: string): void => { issues.push({ code, subjectId, message }); };

  if (document.schemaVersion !== CORE_POC_COVERAGE_SCHEMA || document.scope !== CORE_POC_SCOPE || document.decisionReference !== 'ADR-022') {
    issue('invalid-identity', 'core-poc', 'Le document ne correspond pas au périmètre POC versionné par ADR-022.');
  }
  if (document.technicalDecisionReference !== 'ADR-025') {
    issue('invalid-identity', 'technicalDecisionReference', 'Le périmètre technique doit rester lié à ADR-025.');
  }
  if (document.manifestVersion !== environment.manifestVersion) {
    issue('manifest-mismatch', 'manifestVersion', 'La matrice POC et le manifeste ne portent pas la même version.');
  }
  if (document.catalogPolicy.coverageClaim !== 'none'
    || document.catalogPolicy.supportedUnitIds.length !== 0
    || document.catalogPolicy.supportedFactionIds.length !== 0
    || document.catalogPolicy.unitSubjectType !== 'fixture-unit'
    || document.catalogPolicy.allowsRosterDraftImport) {
    issue('catalog-coverage-forbidden', 'catalogPolicy', 'Le POC ne peut annoncer aucune couverture de catalogue, faction ou RosterDraft.');
  }

  const exclusions = sortedUnique(document.excludedContent.map((entry) => entry.id));
  if (JSON.stringify(exclusions) !== JSON.stringify([...REQUIRED_EXCLUSIONS])) {
    issue('codex-exclusions-incomplete', 'excludedContent', 'Les exclusions de codex, détachement et faction ne sont pas exhaustives.');
  }
  if (document.excludedContent.some((entry) => entry.status !== 'excluded-from-poc' || !entry.reason.trim())) {
    issue('invalid-exclusion', 'excludedContent', 'Chaque exclusion du POC doit être explicite et motivée.');
  }

  const limitationIds = sortedUnique(document.technicalLimitations.map((entry) => entry.id));
  if (JSON.stringify(limitationIds) !== JSON.stringify([...CORE_POC_TECHNICAL_LIMITATION_IDS].sort())) {
    issue('technical-limitations-incomplete', 'technicalLimitations', 'Les quatre limitations communes d’ADR-025 doivent être exactes.');
  }
  if (document.technicalLimitations.some((entry) => entry.status !== 'unsupported-in-technical-poc'
    || entry.ruleReferences.length === 0 || entry.ruleReferences.some((reference) => !reference.trim()) || !entry.reason.trim())) {
    issue('technical-limitation-invalid', 'technicalLimitations', 'Chaque limitation technique doit être explicite, sourcée et motivée.');
  }

  const registeredSources = new Set(environment.registeredSourceIds);
  const canonicalSources = new Set(document.canonicalSourceIds);
  if (canonicalSources.size !== document.canonicalSourceIds.length || document.canonicalSourceIds.some((id) => !registeredSources.has(id))) {
    issue('source-inventory-invalid', 'canonicalSourceIds', 'Une source POC est dupliquée ou absente du manifeste.');
  }
  if (document.canonicalSourceIds.some((id) => /(?:faction-pack|catalog|codex)/i.test(id))) {
    issue('codex-source-forbidden', 'canonicalSourceIds', 'Une source de codex, faction pack ou catalogue ne peut fonder le POC.');
  }

  const fixtureUnits = document.forces.flatMap((force) => force.units);
  const fixtureUnitIds = fixtureUnits.map((unit) => unit.id);
  if (document.forces.length !== 2 || new Set(document.forces.map((force) => force.id)).size !== 2
    || new Set(document.forces.map((force) => force.playerId)).size !== 2) {
    issue('force-identity-invalid', 'forces', 'Le POC exige exactement deux forces et deux joueurs distincts.');
  }
  if (new Set(fixtureUnitIds).size !== fixtureUnitIds.length
    || fixtureUnits.some((unit) => unit.subjectType !== 'fixture-unit' || !Number.isInteger(unit.modelCount) || unit.modelCount <= 0)) {
    issue('fixture-identity-invalid', 'forces.units', 'Les unités POC doivent être des fixtures uniques avec un effectif entier positif.');
  }
  if (document.forces.some((force) => force.units.filter((unit) => unit.role === 'character').length !== 1)) {
    issue('character-role-invalid', 'forces.units', 'Chaque force POC doit contenir exactement un personnage pour la mission fermée.');
  }

  const requirementIds = document.requirements.map((requirement) => requirement.id);
  if (new Set(requirementIds).size !== requirementIds.length) {
    issue('duplicate-requirement', 'requirements', 'Les exigences POC doivent avoir des identifiants uniques.');
  }
  for (const requirement of document.requirements) {
    if (!requirement.id.trim() || !requirement.note.trim()) issue('invalid-requirement', requirement.id || 'requirements', 'Une exigence POC est incomplète.');
    if (requirement.sourceIds.some((sourceId) => !canonicalSources.has(sourceId))) {
      issue('requirement-source-invalid', requirement.id, 'Une exigence référence une source hors du corpus POC.');
    }
  }
  const fixtureRuntime = document.requirements.find((requirement) => requirement.id === 'poc.fixture-runtime');
  if (fixtureRuntime?.status === 'covered' && fixtureUnits.some((unit) => unit.runtimeStatus !== 'ready')) {
    issue('fixture-runtime-not-ready', 'poc.fixture-runtime', 'Une couverture du runtime exige que les six fixtures soient prêtes.');
  }

  const blockingRequirementIds = document.requirements
    .filter((requirement) => requirement.required && requirement.status !== 'covered')
    .map((requirement) => requirement.id);
  if (JSON.stringify(document.readiness.blockingRequirementIds) !== JSON.stringify(blockingRequirementIds)) {
    issue('readiness-mismatch', 'readiness.blockingRequirementIds', 'La readiness doit énumérer les exigences requises non couvertes dans leur ordre de déclaration.');
  }
  const physicalApproved = document.physicalConvention.status === 'human-reviewed'
    && document.physicalConvention.reviewedBy === 'project-owner'
    && document.physicalConvention.reviewedAt !== null;
  const expectedCompatible = document.status === 'covered' && blockingRequirementIds.length === 0 && physicalApproved && issues.length === 0;
  if (document.readiness.compatible !== expectedCompatible) {
    issue('readiness-mismatch', 'readiness.compatible', 'Le verdict de compatibilité ne correspond pas aux exigences et approbations du POC.');
  }

  return {
    schemaVersion: 'warforge-core-poc-compatibility-report/v1',
    scope: CORE_POC_SCOPE,
    coverageVersion: document.version,
    manifestVersion: document.manifestVersion,
    compatible: expectedCompatible && issues.length === 0,
    fixtureUnitIds: sortedUnique(fixtureUnitIds),
    supportedCatalogUnitIds: [],
    blockingRequirementIds: [...blockingRequirementIds],
    pendingOwnerActions: [...document.readiness.pendingOwnerActions],
    issues: issues.sort((left, right) => `${left.code}:${left.subjectId}`.localeCompare(`${right.code}:${right.subjectId}`))
  };
}

function compatibilityRequirement(requirement: CorePocCoverageRequirementV1): CompatibilityRequirementV2 {
  return {
    nodeId: requirement.id,
    kind: requirement.kind,
    title: requirement.note,
    status: requirement.status,
    satisfied: requirement.status === 'covered',
    sourceIds: sortedUnique(requirement.sourceIds),
    sourceRefs: sortedUnique(requirement.sourceIds).map((sourceId) => ({ sourceId, references: [requirement.id] })),
    dependsOn: [],
    blockingGapIds: []
  };
}

/**
 * Adapts the fixture-only POC proof to the stable V6 compatibility envelope.
 * The four ADR-025 limitations remain explicit non-reachable requirements;
 * this report must never be presented as full V11 coverage.
 */
export function compileCorePocTechnicalCompatibilityReportV2(
  document: CorePocCoverageDocumentV1,
  environment: { readonly manifestVersion: string; readonly registeredSourceIds: readonly string[] },
  executableSessionFingerprint: string
): CompatibilityReportV2 {
  const pocReport = compileCorePocCompatibilityV1(document, environment);
  if (!pocReport.compatible || pocReport.issues.length > 0 || !executableSessionFingerprint.trim()) {
    throw new RangeError('La matrice du POC technique ne peut pas produire un rapport V6 compatible.');
  }
  const commonStratagemRequirement = document.requirements.find((requirement) => requirement.id === 'poc.common-stratagems');
  if (!commonStratagemRequirement || commonStratagemRequirement.required || commonStratagemRequirement.status !== 'partial') {
    throw new RangeError('La limite des stratagèmes communs du POC technique est incohérente.');
  }
  const requirements = [
    ...document.requirements.filter((requirement) => requirement.id !== commonStratagemRequirement.id).map(compatibilityRequirement),
    ...document.technicalLimitations.map((limitation): CompatibilityRequirementV2 => ({
      nodeId: limitation.id,
      kind: 'core-stratagem',
      title: limitation.reason,
      status: 'deferred',
      satisfied: false,
      sourceIds: sortedUnique(commonStratagemRequirement.sourceIds),
      sourceRefs: sortedUnique(commonStratagemRequirement.sourceIds).map((sourceId) => ({
        sourceId,
        references: [...limitation.ruleReferences]
      })),
      dependsOn: [],
      blockingGapIds: []
    }))
  ];
  const satisfiedRequirements = requirements.filter((requirement) => requirement.satisfied);
  const nonReachableRequirements = requirements.filter((requirement) => !requirement.satisfied);
  const reportWithoutFingerprint: Omit<CompatibilityReportV2, 'canonicalFingerprint'> = {
    schemaVersion: 'warforge-compatibility-report/v2',
    reportVersion: '2.0.0',
    coverageScope: document.scope,
    coverageVersion: document.version,
    coverageStatus: document.status,
    manifestVersion: document.manifestVersion,
    canonicalSourceIds: [...document.canonicalSourceIds],
    arbitrationIds: [],
    gapStatuses: [],
    gapInventory: [],
    executableSessionFingerprint,
    compatible: true,
    rosterCandidates: document.forces.map((force) => ({
      id: force.id,
      side: force.playerId,
      status: 'covered',
      expectedPoints: 0,
      attachmentPolicy: 'all-characters-unattached',
      characterInstanceIds: force.units.filter((unit) => unit.role === 'character').map((unit) => unit.id),
      blockingGapIds: [],
      units: force.units.map((unit) => ({
        instanceId: unit.id,
        unitId: unit.id,
        modelCount: unit.modelCount,
        points: 0,
        origin: 'core-poc-fixture'
      })),
      executable: false
    })),
    missionCandidate: {
      id: 'closed-complete-game-disruption-v1',
      status: 'covered',
      primaryMission: 'Disruption',
      deploymentLayout: 'mirror-layout-1',
      missionRuleBySide: Object.fromEntries(document.forces.map((force) => [force.playerId, 'Outmanoeuvre'])),
      fixedSecondaryIds: ['Assassination', 'Engage on All Fronts'],
      blockingGapIds: [],
      authorityNote: 'Archive GDM 2026 approuvée par le propriétaire du projet ; ne constitue pas une publication officielle Games Workshop.',
      executable: false
    },
    satisfiedRequirements,
    unmetRequirements: [],
    nonReachableRequirements,
    blockingGaps: [],
    humanDecisions: [],
    missingSources: [],
    issues: []
  };
  return {
    ...reportWithoutFingerprint,
    canonicalFingerprint: compatibilityReportFingerprintV2(reportWithoutFingerprint)
  };
}
