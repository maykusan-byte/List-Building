import type { NormalizedDatabase } from './types';

export const UNIT_IMAGE_SCHEMA = 'warforge-unit-images/v1' as const;

export interface UnitImageEntry {
  unitId: string;
  asset: string;
  productName: string;
  sourceUrl: string;
  sourceLabel: string;
  licenseReference: string;
  retrievedAt: string;
}

export interface UnitImageManifest {
  schemaVersion: typeof UNIT_IMAGE_SCHEMA;
  databaseFingerprint: string;
  generatedAt: string;
  entries: UnitImageEntry[];
}

export type UnitImageStatus = 'ready' | 'incompatible' | 'unavailable';

const ASSET_PATH = /^img\/units\/[a-z0-9][a-z0-9._-]*\.(?:webp|png|jpe?g)$/i;

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isUnitImageEntry(value: unknown): value is UnitImageEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<UnitImageEntry>;
  return isNonEmptyText(entry.unitId)
    && typeof entry.asset === 'string'
    && ASSET_PATH.test(entry.asset)
    && isNonEmptyText(entry.productName)
    && isHttpsUrl(entry.sourceUrl)
    && isNonEmptyText(entry.sourceLabel)
    && isNonEmptyText(entry.licenseReference)
    && isNonEmptyText(entry.retrievedAt);
}

/**
 * Validates a static manifest before exposing any file path to the UI. The
 * catalog fingerprint prevents a renamed/reindexed catalog from displaying a
 * plausible but incorrect miniature.
 */
export function isUnitImageManifest(value: unknown, database: NormalizedDatabase): value is UnitImageManifest {
  if (!value || typeof value !== 'object') return false;
  const manifest = value as Partial<UnitImageManifest>;
  if (manifest.schemaVersion !== UNIT_IMAGE_SCHEMA
    || manifest.databaseFingerprint !== database.fingerprint
    || !isNonEmptyText(manifest.generatedAt)
    || !Array.isArray(manifest.entries)
    || !manifest.entries.every(isUnitImageEntry)) return false;

  const validUnitIds = new Set(database.units.map((unit) => unit.id));
  const mappedUnitIds = new Set<string>();
  return manifest.entries.every((entry) => {
    if (!validUnitIds.has(entry.unitId) || mappedUnitIds.has(entry.unitId)) return false;
    mappedUnitIds.add(entry.unitId);
    return true;
  });
}

export function unitImageMap(manifest: UnitImageManifest | null): ReadonlyMap<string, UnitImageEntry> {
  return new Map((manifest?.entries ?? []).map((entry) => [entry.unitId, entry]));
}

export function unitImageUrl(entry: UnitImageEntry, dataBaseUrl: string): string {
  const documentUrl = typeof window === 'undefined' ? 'http://localhost/' : window.location.href;
  return new URL(entry.asset, new URL(dataBaseUrl, documentUrl)).toString();
}

export async function loadUnitImageManifest(
  database: NormalizedDatabase,
  dataBaseUrl: string
): Promise<{ manifest: UnitImageManifest | null; status: UnitImageStatus }> {
  try {
    const response = await fetch(`${dataBaseUrl}unit-images.json`);
    if (!response.ok) return { manifest: null, status: 'unavailable' };
    const parsed: unknown = await response.json();
    return isUnitImageManifest(parsed, database)
      ? { manifest: parsed, status: 'ready' }
      : { manifest: null, status: 'incompatible' };
  } catch {
    return { manifest: null, status: 'unavailable' };
  }
}
