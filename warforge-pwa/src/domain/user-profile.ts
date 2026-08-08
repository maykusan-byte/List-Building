import type { InventoryDataset } from './inventory';
import type { SavedDraft } from './types';

export const USER_PROFILE_SCHEMA = 'warforge-user-profile/v1';

export interface UserProfile {
  schemaVersion: typeof USER_PROFILE_SCHEMA;
  exportedAt: string;
  locale: 'fr' | 'en';
  favorites: string[];
  savedDrafts: SavedDraft[];
  activeDraftId: string | null;
  localInventory?: InventoryDataset;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'number' && Number.isFinite(entry));
}

function isWargearSelectionCounts(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every(isNumberRecord);
}

function isRosterItem(value: unknown): boolean {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.unitId !== 'string'
    || typeof value.pointIndex !== 'number'
    || !Number.isInteger(value.pointIndex)
    || value.pointIndex < 0
    || !isStringRecord(value.wargearSelections)) return false;
  if (value.wargearSelectionCounts !== undefined && !isWargearSelectionCounts(value.wargearSelectionCounts)) return false;
  if (value.modelCounts !== undefined && !isNumberRecord(value.modelCounts)) return false;
  if (value.enhancement !== undefined && (!isRecord(value.enhancement)
    || typeof value.enhancement.detachmentId !== 'string'
    || typeof value.enhancement.enhancementIndex !== 'number'
    || !Number.isInteger(value.enhancement.enhancementIndex))) return false;
  if (value.figurePreference !== undefined && value.figurePreference !== 'real' && value.figurePreference !== 'proxy' && value.figurePreference !== 'any') return false;
  return value.preferredProxySourceId === undefined || typeof value.preferredProxySourceId === 'string';
}

function isSavedDraft(value: unknown): value is SavedDraft {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.name !== 'string'
    || typeof value.updatedAt !== 'string'
    || !isRecord(value.draft)) return false;
  const draft = value.draft;
  if (typeof draft.id !== 'string'
    || typeof draft.name !== 'string'
    || typeof draft.primaryFaction !== 'string'
    || typeof draft.battleSizePoints !== 'number'
    || !Number.isFinite(draft.battleSizePoints)
    || typeof draft.scenario !== 'string'
    || !isStringList(draft.detachmentIds)
    || !Array.isArray(draft.items)
    || !draft.items.every(isRosterItem)) return false;
  return value.databaseFingerprint === undefined || typeof value.databaseFingerprint === 'string';
}

function isLocalInventory(value: unknown): value is InventoryDataset {
  if (!isRecord(value)
    || typeof value.databaseFingerprint !== 'string'
    || typeof value.sourceLabel !== 'string'
    || value.sourceKind !== 'local'
    || !Array.isArray(value.entries)) return false;
  return value.entries.every((entry) => isRecord(entry)
    && typeof entry.databaseFingerprint === 'string'
    && typeof entry.unitId === 'string'
    && typeof entry.figureId === 'number'
    && Number.isFinite(entry.figureId)
    && (entry.type === 'real' || entry.type === 'proxy'));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function createUserProfile({
  locale,
  favorites,
  savedDrafts,
  activeDraftId,
  localInventory
}: Omit<UserProfile, 'schemaVersion' | 'exportedAt'>): UserProfile {
  return {
    schemaVersion: USER_PROFILE_SCHEMA,
    exportedAt: new Date().toISOString(),
    locale,
    favorites: uniqueStrings(favorites),
    savedDrafts,
    activeDraftId,
    ...(localInventory?.sourceKind === 'local' ? { localInventory } : {})
  };
}

export function parseUserProfile(value: unknown): UserProfile | null {
  if (!isRecord(value)
    || value.schemaVersion !== USER_PROFILE_SCHEMA
    || typeof value.exportedAt !== 'string'
    || (value.locale !== 'fr' && value.locale !== 'en')
    || !isStringList(value.favorites)
    || !Array.isArray(value.savedDrafts)
    || !value.savedDrafts.every(isSavedDraft)
    || (value.activeDraftId !== null && typeof value.activeDraftId !== 'string')
    || (value.localInventory !== undefined && !isLocalInventory(value.localInventory))) return null;

  return {
    schemaVersion: USER_PROFILE_SCHEMA,
    exportedAt: value.exportedAt,
    locale: value.locale,
    favorites: uniqueStrings(value.favorites),
    savedDrafts: value.savedDrafts,
    activeDraftId: value.activeDraftId,
    ...(value.localInventory ? { localInventory: value.localInventory } : {})
  };
}
