/// <reference lib="webworker" />
import { aggregateUnitConfigurations, attachBenchmarks, calculateUnitStatisticalProfile, enumerateUnitConfigurations, type UnitAnalysisContext, type UnitStatisticalProfile } from './domain/statistics';
import type { NormalizedDatabase } from './domain/types';

interface StatisticsWorkerRequest {
  database: NormalizedDatabase;
  context: UnitAnalysisContext;
  granularity: 'units' | 'configurations';
  playgroupFactions: string[];
}

self.onmessage = async (event: MessageEvent<StatisticsWorkerRequest>) => {
  const { database, context, granularity, playgroupFactions } = event.data;
  try {
    const profiles: UnitStatisticalProfile[] = [];
    let batch: UnitStatisticalProfile[] = [];
    for (let index = 0; index < database.units.length; index += 1) {
      const unit = database.units[index];
      const configurations = enumerateUnitConfigurations(unit);
      const visibleProfiles = granularity === 'configurations'
        ? configurations.map((configuration) => calculateUnitStatisticalProfile(database, unit, configuration, context, true))
        : [aggregateUnitConfigurations(database, unit, configurations, context)].filter((profile) => profile !== null);
      visibleProfiles.forEach((profile) => { profiles.push(profile); batch.push(profile); });
      if (index % 10 === 0 || index === database.units.length - 1) {
        self.postMessage({ type: 'batch', completed: index + 1, total: database.units.length, profiles: batch });
        batch = [];
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    self.postMessage({ type: 'complete', profiles: attachBenchmarks(profiles, new Set(playgroupFactions), database) });
  } catch (error) {
    self.postMessage({ type: 'error', error: error instanceof Error ? error.message : 'Calcul statistique impossible.' });
  }
};

export {};
