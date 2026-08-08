export const MISSION_DATA_URL = `${import.meta.env.BASE_URL}data/missions.json`;

export interface MissionPack {
  id: string;
  title: string;
  language: 'fr' | 'en';
  status: 'summary-only' | 'verified-cards';
  source: {
    relativePath: string;
    createdAt: string;
    pageCount: number;
  };
  summary: {
    primary: string[];
    secondary: string[];
  };
  unavailableNotice: string;
}

interface MissionCatalog {
  schemaVersion: 'warforge-mission-packs/v1';
  activePackId: string;
  packs: MissionPack[];
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isMissionPack(value: unknown): value is MissionPack {
  if (typeof value !== 'object' || value === null) return false;
  const pack = value as Partial<MissionPack>;
  return typeof pack.id === 'string'
    && typeof pack.title === 'string'
    && (pack.language === 'fr' || pack.language === 'en')
    && (pack.status === 'summary-only' || pack.status === 'verified-cards')
    && typeof pack.source?.relativePath === 'string'
    && typeof pack.source.createdAt === 'string'
    && typeof pack.source.pageCount === 'number'
    && isStringList(pack.summary?.primary)
    && isStringList(pack.summary?.secondary)
    && typeof pack.unavailableNotice === 'string';
}

export function activeMissionPack(value: unknown): MissionPack | null {
  if (typeof value !== 'object' || value === null) return null;
  const catalog = value as Partial<MissionCatalog>;
  if (catalog.schemaVersion !== 'warforge-mission-packs/v1' || !Array.isArray(catalog.packs)) return null;
  const pack = catalog.packs.find((candidate) => candidate.id === catalog.activePackId);
  return isMissionPack(pack) ? pack : null;
}

export function missionSourceFilename(relativePath: string): string {
  return relativePath.split(/[\\/]/).pop() ?? relativePath;
}

export function formatMissionSourceDate(value: string, locale: 'fr' | 'en'): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'long' }).format(date);
}
