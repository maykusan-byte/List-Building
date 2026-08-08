import type { NormalizedDatabase, NormalizedUnit } from './types';

export function primaryRosterSourceKeysForFaction(database: NormalizedDatabase, factionId: string): Set<string> {
  const faction = database.factions.find((candidate) => candidate.id === factionId);
  if (!faction) return new Set();
  const primaryRosters = database.primaryRostersByFaction?.[factionId] ?? [faction.sourceKey];
  return new Set(primaryRosters);
}

export function sourceKeysForFaction(database: NormalizedDatabase, factionId: string): Set<string> {
  const faction = database.factions.find((candidate) => candidate.id === factionId);
  if (!faction) return new Set();
  const primaryRosters = database.primaryRostersByFaction?.[factionId] ?? [faction.sourceKey];
  return new Set([...primaryRosters, ...(database.alliesByFaction[factionId] ?? [])]);
}

export function isUnitAvailableToFaction(database: NormalizedDatabase, factionId: string, unit: NormalizedUnit): boolean {
  return sourceKeysForFaction(database, factionId).has(unit.sourceKey);
}

export function isAlliedUnit(database: NormalizedDatabase, factionId: string, unit: NormalizedUnit): boolean {
  const faction = database.factions.find((candidate) => candidate.id === factionId);
  if (!faction) return false;
  const primaryKeys = primaryRosterSourceKeysForFaction(database, factionId);
  return !primaryKeys.has(unit.sourceKey) && sourceKeysForFaction(database, factionId).has(unit.sourceKey);
}

export function sourceLabel(database: NormalizedDatabase, sourceKey: string): string {
  return database.books.find((book) => book.sourceKey === sourceKey)?.sourceLabel ?? sourceKey;
}

export interface InvulSaveInfo {
  save: string;
  formatted: string;
  description?: string;
}

export function parseInvulSave(line: Record<string, unknown>): InvulSaveInfo | null {
  const invulObj = line.InvulSave ?? line.InvulnerableSave;
  if (!invulObj) return null;

  let rawSave = '';
  let description: string | undefined = undefined;

  if (typeof invulObj === 'string') {
    rawSave = invulObj.trim();
  } else if (typeof invulObj === 'object' && invulObj !== null) {
    const obj = invulObj as Record<string, unknown>;
    if (typeof obj.Save === 'string') rawSave = obj.Save.trim();
    if (typeof obj.Description === 'string' && obj.Description.trim()) {
      description = obj.Description.trim();
    } else if (typeof obj.Info === 'string' && obj.Info.trim()) {
      description = obj.Info.trim();
    }
  }

  if (!rawSave || rawSave === '—' || rawSave === '-') return null;

  let formatted = rawSave;
  if (!formatted.includes('++')) {
    formatted = formatted.endsWith('+') ? `${formatted}+` : `${formatted}++`;
  }

  return {
    save: rawSave,
    formatted,
    description
  };
}

export function formatSaveDisplay(line: Record<string, unknown>): { displaySave: string; invul: InvulSaveInfo | null } {
  const rawSave = String(line.Save ?? '—').trim();
  const invul = parseInvulSave(line);
  if (!invul) {
    return { displaySave: rawSave, invul: null };
  }
  return {
    displaySave: `${rawSave}/${invul.formatted}`,
    invul
  };
}

