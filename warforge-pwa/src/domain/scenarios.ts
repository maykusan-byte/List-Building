export interface ScenarioDefinition {
  id: string;
}

export const SCENARIOS: ScenarioDefinition[] = [
  { id: 'TAKE AND HOLD' },
  { id: 'PRIORITY ASSETS' },
  { id: 'DISRUPTION' },
  { id: 'RECONNAISSANCE' },
  { id: 'PURGE THE FOE' }
];

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
