import type { NormalizedDatabase, NormalizedDetachment, NormalizedUnit } from './types';
import type { SupportedLocale } from '../i18n';

export interface OfficialCatalogLocaleSource {
  schemaVersion: 'warforge-official-locale-source/v1';
  locale: 'fr';
  provenance: {
    kind: 'official-terminology';
    source: string;
    version: string;
    retrievedAt: string;
    scope: string;
  };
  factions?: Record<string, string>;
  terms?: Record<string, string>;
  units?: Record<string, { name?: string }>;
  detachments?: Record<string, { name?: string }>;
}

export interface CatalogLocaleOverlay extends Omit<OfficialCatalogLocaleSource, 'schemaVersion'> {
  schemaVersion: 'warforge-catalog-locale/v1';
  catalogFingerprint: string;
}

export type CatalogLocaleStatus = 'not-needed' | 'ready' | 'incompatible' | 'unavailable';

export interface CatalogLocalization {
  locale: SupportedLocale;
  status: CatalogLocaleStatus;
  unitName(unit: NormalizedUnit): string;
  detachmentName(detachment: NormalizedDetachment): string;
  factionName(value: string | undefined): string;
  term(value: string | undefined): string;
  searchTerms(unit: NormalizedUnit): string[];
  isTranslated(value: string | undefined): boolean;
}

function stableKey(value: { sourceKey: string; sourceIndex: number }): string {
  return `${value.sourceKey}::${value.sourceIndex}`;
}

function localizedValue(value: string | undefined, terms: Record<string, string> | undefined, locale: SupportedLocale): string {
  const raw = value?.trim() ?? '';
  if (!raw || locale !== 'fr') return raw;
  return terms?.[raw] ?? raw;
}

export function isCatalogLocaleOverlay(value: unknown, database: NormalizedDatabase): value is CatalogLocaleOverlay {
  if (!value || typeof value !== 'object') return false;
  const overlay = value as Partial<CatalogLocaleOverlay>;
  return overlay.schemaVersion === 'warforge-catalog-locale/v1'
    && overlay.locale === 'fr'
    && overlay.catalogFingerprint === database.fingerprint
    && overlay.provenance?.kind === 'official-terminology';
}

export async function loadCatalogLocaleOverlay(
  locale: SupportedLocale,
  database: NormalizedDatabase,
  dataBaseUrl: string
): Promise<{ overlay: CatalogLocaleOverlay | null; status: CatalogLocaleStatus }> {
  if (locale !== 'fr') return { overlay: null, status: 'not-needed' };
  try {
    const response = await fetch(`${dataBaseUrl}locales/fr/catalog.json`);
    if (!response.ok) return { overlay: null, status: 'unavailable' };
    const parsed: unknown = await response.json();
    return isCatalogLocaleOverlay(parsed, database)
      ? { overlay: parsed, status: 'ready' }
      : { overlay: null, status: 'incompatible' };
  } catch {
    return { overlay: null, status: 'unavailable' };
  }
}

export function createCatalogLocalization(
  locale: SupportedLocale,
  overlay: CatalogLocaleOverlay | null,
  status: CatalogLocaleStatus = locale === 'fr' ? 'unavailable' : 'not-needed'
): CatalogLocalization {
  const terms = overlay?.terms;
  const factions = overlay?.factions;
  const unitName = (unit: NormalizedUnit): string => {
    if (locale !== 'fr') return unit.displayName;
    return overlay?.units?.[stableKey(unit)]?.name?.trim() || unit.displayName;
  };
  const detachmentName = (detachment: NormalizedDetachment): string => {
    if (locale !== 'fr') return detachment.displayName;
    return overlay?.detachments?.[stableKey(detachment)]?.name?.trim() || detachment.displayName;
  };
  const factionName = (value: string | undefined): string => {
    const raw = value?.trim() ?? '';
    return locale === 'fr' ? factions?.[raw] ?? raw : raw;
  };
  const term = (value: string | undefined): string => localizedValue(value, terms, locale);
  return {
    locale,
    status,
    unitName,
    detachmentName,
    factionName,
    term,
    isTranslated: (value) => locale !== 'fr' || Boolean(value?.trim() && terms?.[value.trim()]),
    searchTerms: (unit) => [
      unit.displayName,
      unitName(unit),
      unit.factionName,
      factionName(unit.factionName),
      ...(unit.Keywords ?? []),
      ...(unit.Keywords ?? []).map(term),
      ...(unit.FactionKeywords ?? []),
      ...(unit.FactionKeywords ?? []).map(term)
    ].filter(Boolean)
  };
}
