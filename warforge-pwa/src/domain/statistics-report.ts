import { primaryRosterSourceKeysForFaction } from './catalog';
import {
  DEFAULT_STATISTICS_CONTEXT,
  DEFENSIVE_THREATS,
  STATISTICS_ANNOTATION_VERSION,
  STATISTICS_DISTANCE_BANDS,
  STATISTICS_ENGINE_VERSION,
  STATISTICS_GUIDE_VERSION,
  STATISTICS_TARGETS,
  attachBenchmarks,
  calculateConfigurationOffenseAtDistance,
  calculateUnitStatisticalProfile,
  defaultUnitConfiguration,
  enumerateUnitConfigurations,
  type ProbabilityDistribution,
  type StatisticsAttackMode,
  type TacticalRoleScore,
  type UnitConfiguration,
  type UnitStatisticalProfile
} from './statistics';
import type { FactionSummary, NormalizedDatabase, NormalizedUnit } from './types';

export const STATISTICS_REPORT_SCHEMA_VERSION = 'warforge-statistics-report/v1.0.0';

export const DEFAULT_REPORT_COHORT_NAMES = [
  'Space Marines', 'Ultramarines', 'Salamanders', 'Dark Angels', 'Blood Angels',
  'Astra Militarum', 'Tau Empire', 'Orks', 'Thousand Sons'
] as const;

export interface StatisticsReportRequest {
  snapshotDate: string;
  cohortNames: readonly string[];
  distances: readonly number[];
}

export type DistributionSummary = Omit<ProbabilityDistribution, 'mass'>;

export interface StatisticsScenarioResult {
  targetId?: string;
  threatId?: string;
  distance?: number;
  mode?: StatisticsAttackMode;
  usefulDamage?: DistributionSummary;
  rawDamage?: DistributionSummary;
  incomingDamage?: DistributionSummary;
  destroyProbability?: number;
  survivalProbability?: number;
  expectedModelsDestroyed?: number;
  effectiveWounds?: number;
  oneShotDamage?: DistributionSummary;
  activeProfiles?: string[];
}

export interface StatisticsReportConfiguration {
  id: string;
  hash: string;
  label: string;
  points: number;
  models: number;
  requiredDetachments: string[];
  warnings: string[];
}

export interface StatisticsReportUnit {
  id: string;
  name: string;
  sourceKey: string;
  rosterFactionIds: string[];
  keywords: string[];
  defaultConfigurationId: string;
  configurations: StatisticsReportConfiguration[];
  points: { minimum: number; median: number; maximum: number };
  characteristics: UnitStatisticalProfile['characteristics'];
  mobility: UnitStatisticalProfile['mobility'];
  control: UnitStatisticalProfile['control'];
  efficiency: UnitStatisticalProfile['efficiency'];
  reliability: UnitStatisticalProfile['reliability'];
  roles: TacticalRoleScore[];
  coverage: UnitStatisticalProfile['coverage'];
  unsupportedEffects: string[];
  benchmarks: UnitStatisticalProfile['benchmarks'];
  offenseScenarios: StatisticsScenarioResult[];
  defenseScenarios: StatisticsScenarioResult[];
}

export interface StatisticsReportFaction {
  id: string;
  name: string;
  sourceKey: string;
  primaryRosterSourceKeys: string[];
  unitIds: string[];
}

export interface StatisticsReportSnapshot {
  schemaVersion: string;
  generatedAt: string;
  snapshotDate: string;
  catalogVersion: string;
  catalogDate?: string;
  catalogFingerprint: string;
  engineVersion: string;
  guideVersion: string;
  annotationVersion: string;
  assumptions: string[];
  distances: number[];
  targets: typeof STATISTICS_TARGETS;
  threats: typeof DEFENSIVE_THREATS;
  factions: StatisticsReportFaction[];
  units: StatisticsReportUnit[];
  totals: {
    factions: number;
    units: number;
    configurations: number;
    completeCoverage: number;
    partialCoverage: number;
  };
}

export interface StatisticsReportManifest {
  schemaVersion: string;
  snapshotDate: string;
  catalogVersion: string;
  catalogFingerprint: string;
  engineVersion: string;
  files: Array<{ path: string; bytes: number; pages: number; sha256: string }>;
}

function comparable(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function summary(distribution: ProbabilityDistribution): DistributionSummary {
  const { mass: _mass, ...rest } = distribution;
  return rest;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function compactConfiguration(configuration: UnitConfiguration): StatisticsReportConfiguration {
  return {
    id: configuration.id,
    hash: configuration.configurationHash,
    label: configuration.label,
    points: configuration.points,
    models: configuration.modelCount,
    requiredDetachments: configuration.requiredDetachments,
    warnings: configuration.warnings
  };
}

function resolveCohort(database: NormalizedDatabase, names: readonly string[]): FactionSummary[] {
  return names.map((name) => {
    const matches = database.factions.filter((faction) => comparable(faction.name) === comparable(name));
    if (matches.length !== 1) throw new Error(`Faction de rapport introuvable ou ambiguë : ${name}`);
    return matches[0];
  });
}

function modesFor(unit: NormalizedUnit, distance: number): StatisticsAttackMode[] {
  if (distance === 0) return ['melee', 'pistol'];
  const keywords = comparable([...(unit.Keywords ?? []), ...(unit.FactionKeywords ?? [])].join(' '));
  return keywords.includes('monster') || keywords.includes('vehicle')
    ? ['standard-ranged', 'pistol', 'vehicle-combined']
    : ['standard-ranged', 'pistol'];
}

export function buildStatisticsReportSnapshot(
  database: NormalizedDatabase,
  request: StatisticsReportRequest,
  onProgress?: (message: string) => void
): StatisticsReportSnapshot {
  const cohort = resolveCohort(database, request.cohortNames);
  const factionSources = new Map(cohort.map((faction) => [faction.id, primaryRosterSourceKeysForFaction(database, faction.id)]));
  const units = database.units.filter((unit) => [...factionSources.values()].some((sources) => sources.has(unit.sourceKey)));
  const uniqueUnits = [...new Map(units.map((unit) => [unit.id, unit])).values()];
  const baselines: UnitStatisticalProfile[] = [];
  const configurationsByUnit = new Map<string, UnitConfiguration[]>();
  for (const [index, unit] of uniqueUnits.entries()) {
    const startedAt = performance.now();
    onProgress?.(`Configurations ${index + 1}/${uniqueUnits.length} - ${unit.displayName}`);
    const configurations = enumerateUnitConfigurations(unit);
    onProgress?.(`Configurations terminées ${index + 1}/${uniqueUnits.length} - ${unit.displayName} : ${configurations.length} en ${Math.round(performance.now() - startedAt)} ms`);
    configurationsByUnit.set(unit.id, configurations);
    const fallback = defaultUnitConfiguration(unit);
    const selected = configurations.find((configuration) => configuration.id === fallback?.id) ?? configurations[0] ?? fallback;
    if (selected) baselines.push(calculateUnitStatisticalProfile(database, unit, selected, DEFAULT_STATISTICS_CONTEXT));
  }
  const benchmarked = attachBenchmarks(baselines, new Set(cohort.map((faction) => faction.id)), database);
  const baselineByUnit = new Map(benchmarked.map((profile) => [profile.unitId, profile]));
  const reportUnits: StatisticsReportUnit[] = [];
  for (const [index, unit] of uniqueUnits.entries()) {
    const baseline = baselineByUnit.get(unit.id);
    const configurations = configurationsByUnit.get(unit.id) ?? [];
    if (!baseline) continue;
    onProgress?.(`Scénarios ${index + 1}/${uniqueUnits.length} - ${unit.displayName}`);
    const offenseScenarios: StatisticsScenarioResult[] = [];
    for (const target of STATISTICS_TARGETS) {
      for (const distance of request.distances) {
        for (const mode of modesFor(unit, distance)) {
          const result = calculateConfigurationOffenseAtDistance(unit, baseline.configuration, target, { distance, mode });
          offenseScenarios.push({
            targetId: target.id, distance, mode,
            usefulDamage: summary(result.usefulDamage), rawDamage: summary(result.rawDamage),
            destroyProbability: result.destroyProbability,
            expectedModelsDestroyed: result.expectedModelsDestroyed,
            oneShotDamage: summary(result.oneShotDamage), activeProfiles: result.activeProfiles
          });
        }
      }
    }
    const defenseScenarios = DEFENSIVE_THREATS.map((threat) => {
      const profile = calculateUnitStatisticalProfile(database, unit, baseline.configuration, { ...DEFAULT_STATISTICS_CONTEXT, threat }, false);
      return {
        threatId: threat.id,
        incomingDamage: summary(profile.defense.incomingDamage),
        survivalProbability: profile.defense.survivalProbability,
        effectiveWounds: profile.defense.effectiveWounds
      } satisfies StatisticsScenarioResult;
    });
    const compactConfigurations = configurations.length > 0
      ? configurations
      : [baseline.configuration];
    const points = compactConfigurations.map((configuration) => configuration.points);
    const pointRange = points.reduce(
      (range, value) => ({ minimum: Math.min(range.minimum, value), maximum: Math.max(range.maximum, value) }),
      { minimum: Number.POSITIVE_INFINITY, maximum: Number.NEGATIVE_INFINITY }
    );
    reportUnits.push({
      id: unit.id,
      name: unit.displayName,
      sourceKey: unit.sourceKey,
      rosterFactionIds: cohort.filter((faction) => factionSources.get(faction.id)?.has(unit.sourceKey)).map((faction) => faction.id),
      keywords: baseline.keywords,
      defaultConfigurationId: baseline.configuration.id,
      configurations: compactConfigurations.map(compactConfiguration),
      points: { minimum: pointRange.minimum, median: median(points), maximum: pointRange.maximum },
      characteristics: baseline.characteristics,
      mobility: baseline.mobility,
      control: baseline.control,
      efficiency: baseline.efficiency,
      reliability: baseline.reliability,
      roles: baseline.roles,
      coverage: baseline.coverage,
      unsupportedEffects: baseline.unsupportedEffects,
      benchmarks: baseline.benchmarks,
      offenseScenarios,
      defenseScenarios
    });
  }
  const factions = cohort.map((faction) => ({
    id: faction.id,
    name: faction.name,
    sourceKey: faction.sourceKey,
    primaryRosterSourceKeys: [...(factionSources.get(faction.id) ?? [])].sort(),
    unitIds: reportUnits.filter((unit) => unit.rosterFactionIds.includes(faction.id)).map((unit) => unit.id)
  }));
  return {
    schemaVersion: STATISTICS_REPORT_SCHEMA_VERSION,
    generatedAt: `${request.snapshotDate}T00:00:00.000Z`,
    snapshotDate: request.snapshotDate,
    catalogVersion: database.dataInfo?.Version ?? 'unknown',
    catalogDate: database.dataInfo?.PublishDate ?? request.snapshotDate,
    catalogFingerprint: database.fingerprint,
    engineVersion: STATISTICS_ENGINE_VERSION,
    guideVersion: STATISTICS_GUIDE_VERSION,
    annotationVersion: STATISTICS_ANNOTATION_VERSION,
    assumptions: [
      'catalogue-only', 'neutral-baseline', 'target-visible', 'no-cover', 'no-external-buffs',
      'melee-and-shooting-separated', 'rapid-fire-and-melta-active-at-inclusive-half-range',
      'pistol-and-standard-ranged-are-exclusive-for-non-monster-non-vehicle', 'unsupported-effects-never-applied'
    ],
    distances: [...request.distances],
    targets: STATISTICS_TARGETS,
    threats: DEFENSIVE_THREATS,
    factions,
    units: reportUnits,
    totals: {
      factions: factions.length,
      units: reportUnits.length,
      configurations: reportUnits.reduce((sum, unit) => sum + unit.configurations.length, 0),
      completeCoverage: reportUnits.filter((unit) => unit.coverage === 'complete').length,
      partialCoverage: reportUnits.filter((unit) => unit.coverage === 'partial').length
    }
  };
}

export const DEFAULT_STATISTICS_REPORT_REQUEST: StatisticsReportRequest = {
  snapshotDate: '2026-08-11',
  cohortNames: DEFAULT_REPORT_COHORT_NAMES,
  distances: STATISTICS_DISTANCE_BANDS
};
