import type { NormalizedDatabase, NormalizedUnit } from './types';

export function sourceKeysForFaction(database: NormalizedDatabase, factionId: string): Set<string> {
  const faction = database.factions.find((candidate) => candidate.id === factionId);
  if (!faction) return new Set();
  return new Set([faction.sourceKey, ...(database.alliesByFaction[factionId] ?? [])]);
}

export function isUnitAvailableToFaction(database: NormalizedDatabase, factionId: string, unit: NormalizedUnit): boolean {
  return sourceKeysForFaction(database, factionId).has(unit.sourceKey);
}

export function isAlliedUnit(database: NormalizedDatabase, factionId: string, unit: NormalizedUnit): boolean {
  const faction = database.factions.find((candidate) => candidate.id === factionId);
  return Boolean(faction && unit.sourceKey !== faction.sourceKey && sourceKeysForFaction(database, factionId).has(unit.sourceKey));
}

export function sourceLabel(database: NormalizedDatabase, sourceKey: string): string {
  return database.books.find((book) => book.sourceKey === sourceKey)?.sourceLabel ?? sourceKey;
}
