export interface ScenarioDefinition {
  id: string;
  label: string;
  guide: string;
}

export const SCENARIOS: ScenarioDefinition[] = [
  {
    id: 'TAKE AND HOLD',
    label: 'Take and Hold',
    guide: 'Construisez une force capable de conserver plusieurs objectifs sur la durée. Privilégiez la présence, la résistance et des unités capables de reprendre le centre.'
  },
  {
    id: 'PRIORITY ASSETS',
    label: 'Priority Assets',
    guide: 'Prévoyez des unités autonomes pour défendre et contester des ressources clés, sans immobiliser toute votre puissance de frappe.'
  },
  {
    id: 'DISRUPTION',
    label: 'Disruption',
    guide: 'Favorisez la mobilité, la pression sur les flancs et des outils capables de perturber le plan adverse à des moments décisifs.'
  },
  {
    id: 'RECONNAISSANCE',
    label: 'Reconnaissance',
    guide: 'Valorisez les unités rapides, infiltrées ou pouvant agir loin de la force principale pour couvrir le terrain et créer des options.'
  },
  {
    id: 'PURGE THE FOE',
    label: 'Purge the Foe',
    guide: 'Préservez des ressources de combat capables de réaliser des échanges favorables, tout en gardant assez d’unités pour continuer à jouer les objectifs.'
  }
];

export function scenarioLabel(id: string): string {
  return SCENARIOS.find((scenario) => scenario.id === id)?.label ?? id;
}

type ScenarioLinkedDetachment = { ForceDispositions?: string[] };

/**
 * Without a detachment, a player may configure the roster freely. Once one
 * or more detachments are selected, their scenario links form a union: any
 * scenario offered by at least one selected detachment is allowed.
 */
export function selectableScenarios(detachments: readonly ScenarioLinkedDetachment[]): ScenarioDefinition[] {
  if (detachments.length === 0) return SCENARIOS;

  const allowedIds = new Set(detachments.flatMap((detachment) => detachment.ForceDispositions ?? []));
  return SCENARIOS.filter((scenario) => allowedIds.has(scenario.id));
}

export function scenarioIsSelectable(detachments: readonly ScenarioLinkedDetachment[], scenarioId: string): boolean {
  return selectableScenarios(detachments).some((scenario) => scenario.id === scenarioId);
}

export function keepSelectableScenario(detachments: readonly ScenarioLinkedDetachment[], currentScenarioId: string): string {
  const scenarios = selectableScenarios(detachments);
  return scenarios.some((scenario) => scenario.id === currentScenarioId)
    ? currentScenarioId
    : scenarios[0]?.id ?? currentScenarioId;
}
