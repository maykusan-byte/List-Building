import type {
  NormalizedUnit,
  RawWargearOption,
  RawWeaponGroup,
  RawWeaponProfile,
  RosterItem,
  WargearSelectionCounts
} from './types';

export interface ModelCompositionState {
  id: string;
  label: string;
  min: number;
  max: number;
  count: number;
  editable: boolean;
}

export interface WargearRule {
  id: string;
  compositionId: string;
  compositionLabel: string;
  initialWargear: string[];
  options: string[];
  max?: number;
  perXModels?: number;
  replaces: string[];
  requiredDetachment?: string;
}

export interface ArsenalEntry {
  name: string;
  count: number;
  hasProfile: boolean;
  grantsAbilities: string[];
}

/** Equipment resolved for one type of model in the unit. */
export interface ModelWargear {
  composition: ModelCompositionState;
  rules: WargearRule[];
  equipment: ArsenalEntry[];
  profiles: SelectedWeaponProfile[];
  nonProfileEquipment: ArsenalEntry[];
}

export interface SelectedWeaponProfile {
  group: string;
  melee: boolean;
  profile: RawWeaponProfile;
}

export interface WargearResolution {
  totalModels: number;
  compositions: ModelCompositionState[];
  rules: WargearRule[];
  selections: WargearSelectionCounts;
  arsenal: ArsenalEntry[];
  profiles: SelectedWeaponProfile[];
  nonProfileEquipment: ArsenalEntry[];
  byComposition: ModelWargear[];
  warnings: string[];
}

function normalized(value: string | undefined): string {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\([^)]*\)/g, '')
    .replace(/\b(?:standard|supercharge)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function singular(value: string): string {
  return value.replace(/ies$/u, 'y').replace(/s$/u, '');
}

function canonical(value: string | undefined): string {
  return singular(normalized(value));
}

function compositionId(index: number): string {
  return `c${index}`;
}

function selectedModelCount(unit: NormalizedUnit, pointIndex: number): number {
  const sizes = [...new Set((unit.Points ?? [])
    .map((point) => point.ModelCount)
    .filter((count): count is number => typeof count === 'number'))]
    .sort((left, right) => left - right);
  return sizes[pointIndex] ?? sizes[0] ?? 0;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : undefined;
}

function baseCompositions(unit: NormalizedUnit, totalModels: number): ModelCompositionState[] {
  const models = unit.UnitComposition?.ModelCompositions ?? [];
  const minima = models.map((composition) => numberValue(composition.Limit?.Min) ?? 1);
  const hasExplicitLimits = models.some((composition) => composition.Limit?.Min !== undefined || composition.Limit?.Max !== undefined);
  return models.map((composition, index) => {
    const min = minima[index];
    const rawMax = numberValue(composition.Limit?.Max);
    const inferredMax = hasExplicitLimits && rawMax === undefined ? min : totalModels;
    const max = Math.max(min, Math.min(rawMax ?? inferredMax, Math.max(0, totalModels - minima.reduce((sum, value, otherIndex) => sum + (otherIndex === index ? 0 : value), 0))));
    return {
      id: compositionId(index),
      label: composition.ModelName?.trim() || `Figurine ${index + 1}`,
      min,
      max,
      count: min,
      editable: min !== max
    };
  });
}

function rebalanceCompositions(compositions: ModelCompositionState[], totalModels: number, preferred?: Record<string, number>, pinnedId?: string): ModelCompositionState[] {
  const next = compositions.map((composition) => ({
    ...composition,
    count: Math.min(composition.max, Math.max(composition.min, numberValue(preferred?.[composition.id]) ?? composition.min))
  }));
  const total = () => next.reduce((sum, composition) => sum + composition.count, 0);
  const othersReverse = [...next].reverse().filter((composition) => composition.id !== pinnedId);
  const othersForward = [...next].reverse().filter((composition) => composition.id !== pinnedId);

  for (const composition of othersReverse) {
    if (total() <= totalModels) break;
    composition.count -= Math.min(composition.count - composition.min, total() - totalModels);
  }
  for (const composition of othersForward) {
    if (total() >= totalModels) break;
    composition.count += Math.min(composition.max - composition.count, totalModels - total());
  }
  if (pinnedId) {
    const pinned = next.find((composition) => composition.id === pinnedId);
    if (pinned && total() > totalModels) pinned.count -= Math.min(pinned.count - pinned.min, total() - totalModels);
    if (pinned && total() < totalModels) pinned.count += Math.min(pinned.max - pinned.count, totalModels - total());
  }
  return next;
}

export function resolveModelCompositions(unit: NormalizedUnit, item: Pick<RosterItem, 'pointIndex' | 'modelCounts'>): ModelCompositionState[] {
  const totalModels = selectedModelCount(unit, item.pointIndex);
  return rebalanceCompositions(baseCompositions(unit, totalModels), totalModels, item.modelCounts);
}

export function updateModelCount(unit: NormalizedUnit, item: RosterItem, id: string, requestedCount: number): RosterItem {
  const totalModels = selectedModelCount(unit, item.pointIndex);
  const existing = resolveModelCompositions(unit, item);
  const preferred = Object.fromEntries(existing.map((composition) => [composition.id, composition.count]));
  preferred[id] = requestedCount;
  const modelCounts = Object.fromEntries(rebalanceCompositions(baseCompositions(unit, totalModels), totalModels, preferred, id)
    .map((composition) => [composition.id, composition.count]));
  return { ...item, modelCounts };
}

function cleanedOptions(values: string[] | undefined): string[] {
  const seen = new Set<string>();
  return (values ?? []).flatMap((value) => {
    const clean = value.trim();
    const key = canonical(clean);
    if (!clean || !key || seen.has(key)) return [];
    seen.add(key);
    return [clean];
  });
}

function asOption(value: RawWargearOption | string): RawWargearOption {
  return typeof value === 'string' ? { Options: [value] } : value;
}

export function getWargearRules(unit: NormalizedUnit): WargearRule[] {
  const rules: WargearRule[] = [];
  unit.UnitComposition?.ModelCompositions?.forEach((composition, compositionIndex) => {
    composition.Wargear?.forEach((wargear, wargearIndex) => {
      (wargear.Options ?? []).forEach((rawOption, optionIndex) => {
        const option = asOption(rawOption);
        const options = cleanedOptions(option.Options);
        if (options.length === 0) return;
        const rawReplaces: unknown = option.Replaces;
        const replaces = (Array.isArray(rawReplaces) ? rawReplaces : typeof rawReplaces === 'string' ? [rawReplaces] : [])
          .map((value) => value.trim())
          .filter(Boolean);
        rules.push({
          id: `c${compositionIndex}-w${wargearIndex}-o${optionIndex}`,
          compositionId: compositionId(compositionIndex),
          compositionLabel: composition.ModelName?.trim() || `Figurine ${compositionIndex + 1}`,
          initialWargear: wargear.InitalWargear?.map((value) => value.trim()).filter(Boolean) ?? [],
          options,
          max: numberValue(option.Max),
          perXModels: numberValue(option.PerXModels),
          replaces,
          requiredDetachment: option.RequiredDettachment?.trim() || undefined
        });
      });
    });
  });
  return rules;
}

export function normalizedWargearSelections(item: Pick<RosterItem, 'wargearSelections' | 'wargearSelectionCounts'>): WargearSelectionCounts {
  const next: WargearSelectionCounts = {};
  Object.entries(item.wargearSelectionCounts ?? {}).forEach(([ruleId, options]) => {
    if (!options || typeof options !== 'object') return;
    const counts: Record<string, number> = {};
    Object.entries(options).forEach(([name, count]) => {
      const quantity = numberValue(count);
      const cleanName = name.trim();
      if (cleanName && quantity && quantity > 0) counts[cleanName] = quantity;
    });
    if (Object.keys(counts).length > 0) next[ruleId] = counts;
  });
  Object.entries(item.wargearSelections ?? {}).forEach(([ruleId, selected]) => {
    if (!selected || next[ruleId]) return;
    const cleanSelected = selected.trim();
    if (cleanSelected) next[ruleId] = { [cleanSelected]: 1 };
  });
  return next;
}

function legacySummary(selections: WargearSelectionCounts): Record<string, string> {
  return Object.fromEntries(Object.entries(selections).flatMap(([ruleId, options]) => {
    const first = Object.entries(options).find(([, count]) => count > 0)?.[0];
    return first ? [[ruleId, first]] : [];
  }));
}

export function normalizeRosterItemWargear(item: RosterItem): RosterItem {
  const selections = normalizedWargearSelections(item);
  return { ...item, wargearSelections: legacySummary(selections), wargearSelectionCounts: selections };
}

export function updateWargearQuantity(item: RosterItem, ruleId: string, option: string, quantity: number): RosterItem {
  const selections = normalizedWargearSelections(item);
  const rule = { ...(selections[ruleId] ?? {}) };
  const nextQuantity = Math.max(0, Math.floor(quantity));
  if (nextQuantity === 0) delete rule[option];
  else rule[option] = nextQuantity;
  if (Object.keys(rule).length === 0) delete selections[ruleId];
  else selections[ruleId] = rule;
  return { ...item, wargearSelectionCounts: selections, wargearSelections: legacySummary(selections) };
}

export function selectionQuantity(item: RosterItem, ruleId: string, option: string): number {
  return normalizedWargearSelections(item)[ruleId]?.[option] ?? 0;
}

/**
 * The largest quantity that can be selected for one option while preserving
 * the shared cap of its choice group.  Existing imported quantities are kept
 * selectable so they can be reduced instead of disappearing from the UI.
 */
export function optionQuantityLimit(
  item: RosterItem,
  rule: WargearRule,
  compositionCount: number,
  totalModels: number,
  option: string
): number {
  const selected = normalizedWargearSelections(item)[rule.id] ?? {};
  const current = selected[option] ?? 0;
  const selectedTotal = Object.values(selected).reduce((sum, quantity) => sum + quantity, 0);
  return Math.max(current, ruleLimit(rule, compositionCount, totalModels) - selectedTotal + current);
}

export function ruleLimit(rule: WargearRule, compositionCount: number, totalModels: number): number {
  const maximum = rule.max ?? compositionCount;
  const perX = rule.perXModels ? Math.floor(totalModels / rule.perXModels) : Number.POSITIVE_INFINITY;
  return Math.max(0, Math.min(maximum, compositionCount, perX));
}

function pieces(value: string): Array<{ name: string; count: number }> {
  return value
    .replace(/[–—]/g, '-')
    .split(/\s*(?:,|\band\b)\s*/iu)
    .flatMap((part) => {
      const match = part.trim().match(/^(\d+)\s+(.+)$/u);
      const name = (match?.[2] ?? part).trim();
      const count = Number(match?.[1] ?? 1);
      return name && Number.isFinite(count) ? [{ name, count }] : [];
    });
}

function addCount(target: Map<string, { name: string; count: number }>, name: string, count: number): void {
  const key = canonical(name);
  if (!key || count === 0) return;
  const current = target.get(key) ?? { name: name.trim(), count: 0 };
  current.count += count;
  target.set(key, current);
}

function addCountForComposition(target: Map<string, { name: string; count: number }>, composition: string, name: string, count: number): void {
  const key = `${composition}\u0000${canonical(name)}`;
  if (!key || count === 0) return;
  const current = target.get(key) ?? { name: name.trim(), count: 0 };
  current.count += count;
  target.set(key, current);
}

export function weaponProfiles(unit: NormalizedUnit): SelectedWeaponProfile[] {
  return (unit.Weapons ?? []).flatMap((group: RawWeaponGroup) => (group.Weapons ?? []).map((profile) => ({
    group: group.Name?.trim() || (group.IsMelee ? 'ARMES DE CORPS À CORPS' : 'ARMES'),
    melee: Boolean(group.IsMelee),
    profile
  })));
}

function profileMatches(profile: RawWeaponProfile, equipment: string): boolean {
  const weaponName = canonical(profile.Name);
  const baseName = canonical((profile.Name ?? '').replace(/\s*[–—-]\s*(?:standard|supercharge).*$/iu, ''));
  const equipmentName = canonical(equipment);
  if (!weaponName || !equipmentName) return false;
  return weaponName === equipmentName || baseName === equipmentName;
}

export function resolveWargear(unit: NormalizedUnit, item: RosterItem, detachmentNames: readonly string[] = []): WargearResolution {
  const totalModels = selectedModelCount(unit, item.pointIndex);
  const compositions = resolveModelCompositions(unit, item);
  const compositionById = new Map(compositions.map((composition) => [composition.id, composition]));
  const rules = getWargearRules(unit);
  const selections = normalizedWargearSelections(item);
  const warnings: string[] = [];
  const initial = new Map<string, { name: string; count: number }>();
  const replacements = new Map<string, { name: string; count: number }>();
  const additions = new Map<string, { name: string; count: number }>();

  unit.UnitComposition?.ModelCompositions?.forEach((composition, compositionIndex) => {
    const count = compositionById.get(compositionId(compositionIndex))?.count ?? 0;
    composition.Wargear?.forEach((wargear) => (wargear.InitalWargear ?? []).forEach((weapon) => {
      pieces(weapon).forEach((piece) => addCountForComposition(initial, compositionId(compositionIndex), piece.name, piece.count * count));
    }));
  });

  rules.forEach((rule) => {
    const selected = selections[rule.id] ?? {};
    const selectedTotal = Object.values(selected).reduce((sum, count) => sum + count, 0);
    const compositionCount = compositionById.get(rule.compositionId)?.count ?? 0;
    const maximum = ruleLimit(rule, compositionCount, totalModels);
    if (selectedTotal > maximum) warnings.push(`${rule.compositionLabel} : ${selectedTotal}/${maximum} choix autorisé(s) pour ${rule.options.join(' / ')}.`);
    if (rule.requiredDetachment && !detachmentNames.some((name) => normalized(name) === normalized(rule.requiredDetachment))) {
      if (selectedTotal > 0) warnings.push(`${rule.compositionLabel} : ${rule.requiredDetachment} est requis pour ${rule.options.join(' / ')}.`);
    }
    Object.entries(selected).forEach(([option, count]) => {
      if (!rule.options.some((candidate) => canonical(candidate) === canonical(option))) {
        warnings.push(`${rule.compositionLabel} : option d’équipement inconnue « ${option} ».`);
      }
      pieces(option).forEach((piece) => addCountForComposition(additions, rule.compositionId, piece.name, piece.count * count));
      rule.replaces.forEach((replaced) => pieces(replaced).forEach((piece) => addCountForComposition(replacements, rule.compositionId, piece.name, piece.count * count)));
    });
  });

  replacements.forEach((replacement, key) => {
    const available = initial.get(key)?.count ?? 0;
    if (replacement.count > available) warnings.push(`Remplacement impossible : ${replacement.name} est remplacé(e) ${replacement.count} fois pour ${available} exemplaire(s) initial(aux).`);
  });

  const remainingInitial = new Map(initial);
  replacements.forEach((replacement, key) => {
    const current = remainingInitial.get(key);
    if (current) current.count = Math.max(0, current.count - replacement.count);
  });
  const arsenal = new Map<string, { name: string; count: number }>();
  remainingInitial.forEach((entry) => addCount(arsenal, entry.name, entry.count));
  additions.forEach((addition) => addCount(arsenal, addition.name, addition.count));
  const allProfiles = weaponProfiles(unit);
  const grantsByEquipment = new Map((unit.UnitComposition?.WargearDefinitions ?? []).map((definition) => [canonical(definition.Key), definition.GrantsAbilities ?? []]));
  const profileKeys = new Set<string>();
  const profiles: SelectedWeaponProfile[] = [];
  const arsenalEntries = [...arsenal.values()].filter((entry) => entry.count > 0).map((entry) => {
    const matched = allProfiles.filter((candidate) => profileMatches(candidate.profile, entry.name));
    matched.forEach((candidate) => {
      const key = `${candidate.group}\u0000${candidate.profile.Name ?? ''}`;
      if (!profileKeys.has(key)) {
        profileKeys.add(key);
        profiles.push(candidate);
      }
    });
    return { ...entry, hasProfile: matched.length > 0, grantsAbilities: grantsByEquipment.get(canonical(entry.name)) ?? [] };
  });
  const byComposition = compositions.map((composition) => {
    const prefix = `${composition.id}\u0000`;
    const compositionArsenal = new Map<string, { name: string; count: number }>();
    remainingInitial.forEach((entry, key) => {
      if (key.startsWith(prefix)) addCount(compositionArsenal, entry.name, entry.count);
    });
    additions.forEach((entry, key) => {
      if (key.startsWith(prefix)) addCount(compositionArsenal, entry.name, entry.count);
    });
    const profileKeysForComposition = new Set<string>();
    const profilesForComposition: SelectedWeaponProfile[] = [];
    const equipment = [...compositionArsenal.values()].filter((entry) => entry.count > 0).map((entry) => {
      const matched = allProfiles.filter((candidate) => profileMatches(candidate.profile, entry.name));
      matched.forEach((candidate) => {
        const key = `${candidate.group}\u0000${candidate.profile.Name ?? ''}`;
        if (!profileKeysForComposition.has(key)) {
          profileKeysForComposition.add(key);
          profilesForComposition.push(candidate);
        }
      });
      return { ...entry, hasProfile: matched.length > 0, grantsAbilities: grantsByEquipment.get(canonical(entry.name)) ?? [] };
    });
    return {
      composition,
      rules: rules.filter((rule) => rule.compositionId === composition.id),
      equipment,
      profiles: profilesForComposition,
      nonProfileEquipment: equipment.filter((entry) => !entry.hasProfile)
    };
  });

  return {
    totalModels,
    compositions,
    rules,
    selections,
    arsenal: arsenalEntries,
    profiles,
    nonProfileEquipment: arsenalEntries.filter((entry) => !entry.hasProfile),
    byComposition,
    warnings
  };
}

export function wargearCost(unit: NormalizedUnit, item: RosterItem): number {
  const costs = new Map((unit.UnitComposition?.WargearDefinitions ?? []).map((definition) => [canonical(definition.Key), definition.Cost ?? 0]));
  return Object.values(normalizedWargearSelections(item)).reduce((total, options) => total + Object.entries(options)
    .reduce((groupTotal, [option, count]) => groupTotal + (costs.get(canonical(option)) ?? 0) * count, 0), 0);
}
