import type {
  CostBreakdown,
  EnhancementSelection,
  NormalizedDatabase,
  NormalizedDetachment,
  NormalizedUnit,
  RawEnhancement,
  RawPointOption,
  RosterItem
} from './types';
import { wargearCost as calculateWargearCost } from './wargear';

export interface WargearChoiceGroup {
  id: string;
  label: string;
  options: string[];
}

export interface PointSizeOption {
  modelCount: number;
  points: RawPointOption[];
}

export interface ResolvedPointOption {
  modelCount: number;
  cost: number;
  unitCount?: number;
}

function normalized(value: string | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase();
}

/** Returns one selector entry per number of miniatures, never per UnitCount tier. */
export function getPointSizes(unit: NormalizedUnit): PointSizeOption[] {
  const byModelCount = new Map<number, RawPointOption[]>();
  (unit.Points ?? []).forEach((point) => {
    if (typeof point.ModelCount !== 'number') return;
    const values = byModelCount.get(point.ModelCount) ?? [];
    values.push(point);
    byModelCount.set(point.ModelCount, values);
  });
  return [...byModelCount.entries()]
    .map(([modelCount, points]) => ({ modelCount, points: [...points].sort((left, right) => (left.UnitCount ?? 0) - (right.UnitCount ?? 0)) }))
    .sort((left, right) => left.modelCount - right.modelCount);
}

function resolvePointList(points: RawPointOption[] | undefined, modelCount: number, occurrence: number): RawPointOption | undefined {
  const matching = (points ?? []).filter((point) => point.ModelCount === modelCount && typeof point.Cost === 'number');
  const fixed = matching.find((point) => point.UnitCount === undefined);
  if (fixed) return fixed;
  const tiers = matching
    .filter((point): point is RawPointOption & { UnitCount: number } => typeof point.UnitCount === 'number')
    .sort((left, right) => left.UnitCount - right.UnitCount);
  return tiers.find((point) => occurrence <= point.UnitCount) ?? tiers.at(-1);
}

/** Resolves the price tier for a unique size and an occurrence rank (1-based). */
export function resolvePointOption(unit: NormalizedUnit, pointIndex: number, occurrence = 1): ResolvedPointOption | undefined {
  const size = getPointSizes(unit)[pointIndex] ?? getPointSizes(unit)[0];
  if (!size) return undefined;
  const selected = resolvePointList(size.points, size.modelCount, occurrence);
  if (!selected || typeof selected.Cost !== 'number') return undefined;
  return { modelCount: size.modelCount, cost: selected.Cost, unitCount: selected.UnitCount };
}

/** Kept for callers that only need the default size/first occurrence. */
export function getPointOption(unit: NormalizedUnit, pointIndex: number): ResolvedPointOption | undefined {
  return resolvePointOption(unit, pointIndex, 1);
}

export function occurrenceForItem(items: readonly RosterItem[], item: RosterItem): number {
  let occurrence = 0;
  for (const candidate of items) {
    if (candidate.unitId === item.unitId) occurrence += 1;
    if (candidate.id === item.id) return occurrence;
  }
  return Math.max(1, occurrence);
}

// In the source data, a missing detachment cost denotes the standard 1 DP cost.
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
        if (options.length > 0) groups.push({ id: `c${compositionIndex}-w${wargearIndex}-o${optionIndex}`, label: composition.ModelName || `Option d’équipement ${groups.length + 1}`, options });
      });
    });
  });
  return groups;
}

export function enhancementIsEligible(unit: NormalizedUnit, enhancement: RawEnhancement): boolean {
  const keywords = new Set([...(unit.Keywords ?? []), ...(unit.FactionKeywords ?? []), unit.Faction, unit.factionName]
    .filter(Boolean).map((keyword) => normalized(keyword)));
  const abilities = new Set([...(unit.CoreAbilities ?? []), ...(unit.UnitAbilities ?? []).map((ability) => ability.Title ?? '')]
    .filter(Boolean).map((ability) => normalized(ability)));
  const includes = (keyword: string) => keywords.has(normalized(keyword));
  if ((enhancement.RequiredKeywords ?? []).some((keyword) => !includes(keyword))) return false;
  if ((enhancement.RequiredOneOfKeywords ?? []).length > 0 && !(enhancement.RequiredOneOfKeywords ?? []).some(includes)) return false;
  if ((enhancement.ExcludedKeywords ?? []).some(includes)) return false;
  if ((enhancement.RequiredAbilities ?? []).some((ability) => !abilities.has(normalized(ability)))) return false;
  return true;
}

export function getEnhancement(database: NormalizedDatabase, selection: EnhancementSelection | undefined): { detachment: NormalizedDetachment; enhancement: RawEnhancement } | undefined {
  if (!selection) return undefined;
  const detachment = database.detachments.find((candidate) => candidate.id === selection.detachmentId);
  const enhancement = detachment?.Enhancements?.[selection.enhancementIndex];
  return detachment && enhancement ? { detachment, enhancement } : undefined;
}

export function calculateItemCost(database: NormalizedDatabase, item: RosterItem, items: readonly RosterItem[], selectedDetachmentIds: string[]): CostBreakdown {
  const unit = database.units.find((candidate) => candidate.id === item.unitId);
  if (!unit) return { base: 0, wargear: 0, enhancement: 0, total: 0, notices: ['Unité introuvable dans cette base.'] };
  const occurrence = occurrenceForItem(items, item);
  const selectedPoint = resolvePointOption(unit, item.pointIndex, occurrence);
  const base = selectedPoint?.cost ?? 0;
  const selectedDetachments = database.detachments.filter((detachment) => selectedDetachmentIds.includes(detachment.id));
  const overrides = selectedDetachments.flatMap((detachment) => (detachment.Effects ?? []).flatMap((effect) => {
    const affectsUnit = (effect.AffectedUnits ?? []).some((name) => normalized(name) === normalized(unit.displayName));
    if (!affectsUnit || !selectedPoint) return [];
    const override = resolvePointList(effect.PointsOverride, selectedPoint.modelCount, occurrence);
    return override && typeof override.Cost === 'number' ? [{ detachment, cost: override.Cost }] : [];
  }));
  const notices: string[] = [];
  if (overrides.length > 1) notices.push('Plusieurs surcharges de coût correspondent : la première est utilisée.');
  const pointOverride = overrides[0]?.cost;
  const wargear = calculateWargearCost(unit, item);
  const enhancement = getEnhancement(database, item.enhancement);
  const enhancementCost = enhancement?.enhancement.Cost ?? 0;
  if (enhancement && !enhancementIsEligible(unit, enhancement.enhancement)) notices.push('L’amélioration sélectionnée n’est plus éligible.');
  return { base, pointOverride, wargear, enhancement: enhancementCost, total: (pointOverride ?? base) + wargear + enhancementCost, notices };
}

export function calculateRosterTotal(database: NormalizedDatabase, items: RosterItem[], detachmentIds: string[]): number {
  return items.reduce((total, item) => total + calculateItemCost(database, item, items, detachmentIds).total, 0);
}
