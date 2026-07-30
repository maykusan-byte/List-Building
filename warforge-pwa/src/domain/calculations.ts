import type {
  CostBreakdown,
  EnhancementSelection,
  NormalizedDatabase,
  NormalizedDetachment,
  NormalizedUnit,
  RawEnhancement,
  RawPointOption,
  RawWargearDefinition,
  RosterItem
} from './types';

export interface WargearChoiceGroup {
  id: string;
  label: string;
  options: string[];
}

function normalized(value: string | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase();
}

function matchesPointShape(candidate: RawPointOption, selected: RawPointOption): boolean {
  return (
    (candidate.ModelCount === undefined || candidate.ModelCount === selected.ModelCount) &&
    (candidate.UnitCount === undefined || candidate.UnitCount === selected.UnitCount)
  );
}

export function getPointOption(unit: NormalizedUnit, pointIndex: number): RawPointOption | undefined {
  return unit.Points?.[pointIndex] ?? unit.Points?.[0];
}

// In the source data, a missing detachment cost denotes the standard 1 DP cost.
// Keep the interpretation here so display and validation cannot diverge.
export function getDetachmentCost(detachment: Pick<NormalizedDetachment, 'Cost'>): number {
  return typeof detachment.Cost === 'number' && Number.isFinite(detachment.Cost) ? detachment.Cost : 1;
}

export function getSelectedDetachments(database: NormalizedDatabase, detachmentIds: readonly string[]): NormalizedDetachment[] {
  const detachmentsById = new Map(database.detachments.map((detachment) => [detachment.id, detachment]));
  return detachmentIds.flatMap((id) => {
    const detachment = detachmentsById.get(id);
    return detachment ? [detachment] : [];
  });
}

export function getWargearChoiceGroups(unit: NormalizedUnit): WargearChoiceGroup[] {
  const groups: WargearChoiceGroup[] = [];
  unit.UnitComposition?.ModelCompositions?.forEach((composition, compositionIndex) => {
    composition.Wargear?.forEach((wargear, wargearIndex) => {
      wargear.Options?.forEach((optionGroup, optionIndex) => {
        const options = typeof optionGroup === 'string' ? [optionGroup] : optionGroup.Options ?? [];
        if (options.length > 0) {
          groups.push({
            id: `c${compositionIndex}-w${wargearIndex}-o${optionIndex}`,
            label: composition.ModelName || `Option d’équipement ${groups.length + 1}`,
            options
          });
        }
      });
    });
  });
  return groups;
}

function wargearCost(definitions: RawWargearDefinition[] | undefined, selected: string | undefined): number {
  if (!selected) return 0;
  return definitions?.find((definition) => normalized(definition.Key) === normalized(selected))?.Cost ?? 0;
}

export function enhancementIsEligible(unit: NormalizedUnit, enhancement: RawEnhancement): boolean {
  const keywords = new Set(
    [
      ...(unit.Keywords ?? []),
      ...(unit.FactionKeywords ?? []),
      unit.Faction,
      unit.factionName
    ].filter(Boolean).map((keyword) => normalized(keyword))
  );
  const abilities = new Set([...(unit.CoreAbilities ?? []), ...(unit.UnitAbilities ?? []).map((ability) => ability.Title ?? '')]
    .filter(Boolean)
    .map((ability) => normalized(ability)));
  const includes = (keyword: string) => keywords.has(normalized(keyword));

  if ((enhancement.RequiredKeywords ?? []).some((keyword) => !includes(keyword))) return false;
  if ((enhancement.RequiredOneOfKeywords ?? []).length > 0 && !(enhancement.RequiredOneOfKeywords ?? []).some(includes)) return false;
  if ((enhancement.ExcludedKeywords ?? []).some(includes)) return false;
  if ((enhancement.RequiredAbilities ?? []).some((ability) => !abilities.has(normalized(ability)))) return false;
  return true;
}

export function getEnhancement(
  database: NormalizedDatabase,
  selection: EnhancementSelection | undefined
): { detachment: NormalizedDetachment; enhancement: RawEnhancement } | undefined {
  if (!selection) return undefined;
  const detachment = database.detachments.find((candidate) => candidate.id === selection.detachmentId);
  const enhancement = detachment?.Enhancements?.[selection.enhancementIndex];
  return detachment && enhancement ? { detachment, enhancement } : undefined;
}

export function calculateItemCost(
  database: NormalizedDatabase,
  item: RosterItem,
  selectedDetachmentIds: string[]
): CostBreakdown {
  const unit = database.units.find((candidate) => candidate.id === item.unitId);
  if (!unit) return { base: 0, wargear: 0, enhancement: 0, total: 0, notices: ['Unité introuvable dans cette base.'] };

  const selectedPoint = getPointOption(unit, item.pointIndex);
  const base = selectedPoint?.Cost ?? 0;
  const selectedDetachments = database.detachments.filter((detachment) => selectedDetachmentIds.includes(detachment.id));
  const overrides = selectedDetachments.flatMap((detachment) =>
    (detachment.Effects ?? []).flatMap((effect) => {
      const affectsUnit = (effect.AffectedUnits ?? []).some((name) => normalized(name) === normalized(unit.displayName));
      if (!affectsUnit || !selectedPoint) return [];
      return (effect.PointsOverride ?? [])
        .filter((point) => matchesPointShape(point, selectedPoint) && typeof point.Cost === 'number')
        .map((point) => ({ detachment, cost: point.Cost as number }));
    })
  );
  const notices: string[] = [];
  if (overrides.length > 1) notices.push('Plusieurs surcharges de coût correspondent : la première est utilisée.');
  const pointOverride = overrides[0]?.cost;
  const wargear = Object.values(item.wargearSelections).reduce(
    (total, selected) => total + wargearCost(unit.UnitComposition?.WargearDefinitions, selected),
    0
  );
  const enhancement = getEnhancement(database, item.enhancement);
  const enhancementCost = enhancement?.enhancement.Cost ?? 0;
  if (enhancement && !enhancementIsEligible(unit, enhancement.enhancement)) notices.push('L’amélioration sélectionnée n’est plus éligible.');

  return {
    base,
    pointOverride,
    wargear,
    enhancement: enhancementCost,
    total: (pointOverride ?? base) + wargear + enhancementCost,
    notices
  };
}

export function calculateRosterTotal(database: NormalizedDatabase, items: RosterItem[], detachmentIds: string[]): number {
  return items.reduce((total, item) => total + calculateItemCost(database, item, detachmentIds).total, 0);
}
