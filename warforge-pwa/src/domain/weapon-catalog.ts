import type { NormalizedDatabase, NormalizedUnit, RawWeaponProfile } from './types';

export interface WeaponCatalogEntry {
  /** Stable within a catalog and safe to use as a React key. */
  id: string;
  melee: boolean;
  profile: RawWeaponProfile;
  /** Individual weapon keywords, as written in the catalog. */
  keywords: string[];
  /** Datasheets which expose this exact profile. */
  carriers: NormalizedUnit[];
  /** Derived from the currently visible carriers. */
  factionNames: string[];
}

export interface WeaponCatalogFilters {
  faction?: string;
  keyword?: string;
  query?: string;
}

export type WeaponCatalogSortColumn = 'type' | 'name' | 'range' | 'attacks' | 'skill' | 'strength' | 'ap' | 'damage' | 'keywords' | 'factions' | 'units';
export type SortDirection = 'asc' | 'desc';

function normalized(value: string | undefined): string {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function text(value: string | undefined): string {
  return value?.trim() ?? '';
}

function profileKey(profile: RawWeaponProfile, melee: boolean): string {
  return JSON.stringify([
    melee,
    text(profile.Name),
    text(profile.Range),
    text(profile.Attacks),
    text(profile.ToHit),
    text(profile.Strength),
    text(profile.AP),
    text(profile.Damage),
    text(profile.Keywords)
  ]).toLocaleLowerCase();
}

function distinctNames(values: readonly string[]): string[] {
  const seen = new Map<string, string>();
  values.forEach((value) => {
    const clean = value.trim();
    const key = normalized(clean);
    if (clean && key && !seen.has(key)) seen.set(key, clean);
  });
  return [...seen.values()].sort((left, right) => left.localeCompare(right));
}

/** Splits source text such as "ASSAULT, HEAVY" into filterable keywords. */
export function weaponKeywordList(value: string | undefined): string[] {
  return distinctNames((value ?? '')
    .replace(/[\[\]]/g, '')
    .split(/[,;]+/u));
}

function entryWithCarriers(entry: WeaponCatalogEntry, carriers: NormalizedUnit[]): WeaponCatalogEntry {
  return {
    ...entry,
    carriers,
    factionNames: distinctNames(carriers.map((unit) => unit.factionName))
  };
}

/**
 * One result represents one exact stat-line, rather than merely one weapon
 * name. This preserves separate standard, overcharge, or otherwise distinct
 * profiles while combining every datasheet carrying an identical profile.
 */
export function buildWeaponCatalog(database: Pick<NormalizedDatabase, 'units'>): WeaponCatalogEntry[] {
  const entries = new Map<string, WeaponCatalogEntry>();
  const carrierIds = new Map<string, Set<string>>();

  database.units.forEach((unit) => {
    (unit.Weapons ?? []).forEach((group) => {
      const melee = Boolean(group.IsMelee);
      (group.Weapons ?? []).forEach((profile) => {
        const key = profileKey(profile, melee);
        const entry = entries.get(key);
        if (!entry) {
          entries.set(key, {
            id: `weapon:${key}`,
            melee,
            profile,
            keywords: weaponKeywordList(profile.Keywords),
            carriers: [unit],
            factionNames: [unit.factionName]
          });
          carrierIds.set(key, new Set([unit.id]));
          return;
        }
        const ids = carrierIds.get(key);
        if (!ids?.has(unit.id)) {
          ids?.add(unit.id);
          entry.carriers.push(unit);
        }
      });
    });
  });

  return [...entries.values()]
    .map((entry) => entryWithCarriers(entry, entry.carriers))
    .sort((left, right) => weaponName(left).localeCompare(weaponName(right)) || left.id.localeCompare(right.id));
}

export function weaponName(entry: Pick<WeaponCatalogEntry, 'profile'>): string {
  return text(entry.profile.Name) || '—';
}

export function weaponFactions(entries: readonly WeaponCatalogEntry[]): string[] {
  return distinctNames(entries.flatMap((entry) => entry.factionNames));
}

export function weaponKeywords(entries: readonly WeaponCatalogEntry[]): string[] {
  return distinctNames(entries.flatMap((entry) => entry.keywords));
}

export function filterWeaponCatalog(entries: readonly WeaponCatalogEntry[], filters: WeaponCatalogFilters): WeaponCatalogEntry[] {
  const faction = normalized(filters.faction);
  const keyword = normalized(filters.keyword);
  const query = normalized(filters.query);
  return entries.flatMap((entry) => {
    if (keyword && !entry.keywords.some((value) => normalized(value) === keyword)) return [];
    const carriers = faction
      ? entry.carriers.filter((unit) => normalized(unit.factionName) === faction)
      : entry.carriers;
    if (carriers.length === 0) return [];
    const visibleEntry = entryWithCarriers(entry, carriers);
    if (query) {
      const corpus = normalized([
        weaponName(visibleEntry),
        visibleEntry.profile.Keywords,
        ...visibleEntry.factionNames,
        ...carriers.flatMap((unit) => [unit.displayName, unit.factionName])
      ].filter(Boolean).join(' '));
      if (!corpus.includes(query)) return [];
    }
    return [visibleEntry];
  });
}

/** Average value for dice expressions, suitable for an intuitive numeric sort. */
export function weaponStatValue(value: string | undefined): number | null {
  const source = text(value).replace(',', '.');
  if (!source || source.toLocaleLowerCase() === 'melee') return null;
  let containsDice = false;
  let total = 0;
  const remainder = source.replace(/([+-]?)(\d*)d(\d+)/giu, (_match, sign: string, count: string, faces: string) => {
    containsDice = true;
    const dice = Number(count || 1) * ((Number(faces) + 1) / 2);
    total += sign === '-' ? -dice : dice;
    return ' ';
  });
  if (containsDice) {
    const modifiers = remainder.match(/[+-]\d+(?:\.\d+)?/g) ?? [];
    return total + modifiers.reduce((sum, modifier) => sum + Number(modifier), 0);
  }
  const match = source.match(/-?\d+(?:\.\d+)?/u);
  return match ? Number(match[0]) : null;
}

function sortableText(entry: WeaponCatalogEntry, column: WeaponCatalogSortColumn): string {
  switch (column) {
    case 'type': return entry.melee ? 'melee' : 'ranged';
    case 'name': return weaponName(entry);
    case 'keywords': return entry.keywords.join(', ');
    case 'factions': return entry.factionNames.join(', ');
    case 'units': return entry.carriers.map((unit) => unit.displayName).join(', ');
    default: return '';
  }
}

function sortableStat(entry: WeaponCatalogEntry, column: WeaponCatalogSortColumn): number | null {
  switch (column) {
    case 'range': return weaponStatValue(entry.profile.Range);
    case 'attacks': return weaponStatValue(entry.profile.Attacks);
    case 'skill': return weaponStatValue(entry.profile.ToHit);
    case 'strength': return weaponStatValue(entry.profile.Strength);
    case 'ap': return weaponStatValue(entry.profile.AP);
    case 'damage': return weaponStatValue(entry.profile.Damage);
    default: return null;
  }
}

export function sortWeaponCatalog(
  entries: readonly WeaponCatalogEntry[],
  column: WeaponCatalogSortColumn,
  direction: SortDirection,
  locale?: string
): WeaponCatalogEntry[] {
  const multiplier = direction === 'asc' ? 1 : -1;
  return [...entries].sort((left, right) => {
    if (column === 'units') {
      const countDifference = left.carriers.length - right.carriers.length;
      if (countDifference) return countDifference * multiplier;
    }
    const leftStat = sortableStat(left, column);
    const rightStat = sortableStat(right, column);
    if (leftStat !== null || rightStat !== null) {
      if (leftStat === null) return 1;
      if (rightStat === null) return -1;
      if (leftStat !== rightStat) return (leftStat - rightStat) * multiplier;
    }
    const compared = sortableText(left, column).localeCompare(sortableText(right, column), locale);
    if (compared) return compared * multiplier;
    return weaponName(left).localeCompare(weaponName(right), locale) * multiplier;
  });
}
