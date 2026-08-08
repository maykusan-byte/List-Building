export const MISSION_DATA_URL = `${import.meta.env.BASE_URL}data/missions.json`;

export interface OfficialPdfMissionSource {
  kind: 'official-pdf';
  relativePath: string;
  createdAt: string;
  pageCount: number;
}

export interface TrustedWebMissionSource {
  kind: 'trusted-web';
  url: 'https://gdmissions.app/11th';
  archivePath: string;
  scope: string;
  title: string;
  retrievedAt: string;
  pageCount: number;
  assetCount: number;
}

export type MissionSource = OfficialPdfMissionSource | TrustedWebMissionSource;

export interface MissionScoreTier {
  text: string;
  vp: number | string;
  perUnit?: boolean;
  cumulative?: boolean;
  plus?: boolean;
  or?: boolean;
  kind?: string;
}

export interface PrimaryMissionCard {
  name: string;
  deck: string;
  vs?: string;
  rule?: string;
  sections: Array<{ when: string; trigger?: string; tiers: MissionScoreTier[] }>;
  back?: PrimaryMissionCard | null;
  sourcePath: string;
  asset: string | null;
}

export interface SecondaryMissionCard {
  name: string;
  kindLabel?: string;
  whenDrawn?: string;
  sections: Array<{
    when: string;
    trigger: string;
    chip?: string;
    headerKind?: string;
    rows: MissionScoreTier[];
  }>;
  sourcePath: string;
  asset: string | null;
}

export interface MissionLayout {
  number: number;
  name: string;
  image: string;
  measurementsImage: string;
}

export interface MissionLayoutMatchup {
  sourcePath: string;
  layouts: MissionLayout[];
}

export interface ForceDispositionCard {
  sourcePath: string;
  title: string | null;
  asset: string | null;
}

export interface MissionCards {
  primary: PrimaryMissionCard[];
  secondary: SecondaryMissionCard[];
  layouts: MissionLayoutMatchup[];
  forceDispositions: ForceDispositionCard[];
  matrix: { sourcePath: string } | null;
}

export interface MissionPack {
  id: string;
  title: string;
  language: 'fr' | 'en';
  status: 'summary-only' | 'verified-cards' | 'trusted-web-cards';
  source: MissionSource;
  summary: {
    primary: string[];
    secondary: string[];
  };
  unavailableNotice: string;
  cards?: MissionCards;
}

interface MissionCatalog {
  schemaVersion: 'warforge-mission-packs/v1';
  activePackId: string;
  packs: MissionPack[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isMissionSource(value: unknown): value is MissionSource {
  if (!isRecord(value) || typeof value.kind !== 'string') return false;
  if (value.kind === 'official-pdf') {
    return typeof value.relativePath === 'string'
      && typeof value.createdAt === 'string'
      && typeof value.pageCount === 'number';
  }
  return value.kind === 'trusted-web'
    && value.url === 'https://gdmissions.app/11th'
    && typeof value.archivePath === 'string'
    && typeof value.scope === 'string'
    && typeof value.title === 'string'
    && typeof value.retrievedAt === 'string'
    && typeof value.pageCount === 'number'
    && typeof value.assetCount === 'number';
}

function isScoreTier(value: unknown): value is MissionScoreTier {
  return isRecord(value)
    && typeof value.text === 'string'
    && (typeof value.vp === 'string' || typeof value.vp === 'number');
}

function isPrimaryCard(value: unknown): value is PrimaryMissionCard {
  return isRecord(value)
    && typeof value.name === 'string'
    && typeof value.deck === 'string'
    && typeof value.sourcePath === 'string'
    && (typeof value.asset === 'string' || value.asset === null)
    && Array.isArray(value.sections)
    && value.sections.every((section) => isRecord(section)
      && typeof section.when === 'string'
      && (typeof section.trigger === 'string' || section.trigger === undefined)
      && Array.isArray(section.tiers)
      && section.tiers.every(isScoreTier));
}

function isSecondaryCard(value: unknown): value is SecondaryMissionCard {
  return isRecord(value)
    && typeof value.name === 'string'
    && typeof value.sourcePath === 'string'
    && (typeof value.asset === 'string' || value.asset === null)
    && Array.isArray(value.sections)
    && value.sections.every((section) => isRecord(section)
      && typeof section.when === 'string'
      && typeof section.trigger === 'string'
      && Array.isArray(section.rows)
      && section.rows.every(isScoreTier));
}

function isMissionCards(value: unknown): value is MissionCards {
  return isRecord(value)
    && Array.isArray(value.primary)
    && value.primary.every(isPrimaryCard)
    && Array.isArray(value.secondary)
    && value.secondary.every(isSecondaryCard)
    && Array.isArray(value.layouts)
    && Array.isArray(value.forceDispositions)
    && (value.matrix === null || isRecord(value.matrix));
}

function isMissionPack(value: unknown): value is MissionPack {
  if (!isRecord(value)) return false;
  const pack = value as Partial<MissionPack>;
  return typeof pack.id === 'string'
    && typeof pack.title === 'string'
    && (pack.language === 'fr' || pack.language === 'en')
    && (pack.status === 'summary-only' || pack.status === 'verified-cards' || pack.status === 'trusted-web-cards')
    && isMissionSource(pack.source)
    && isStringList(pack.summary?.primary)
    && isStringList(pack.summary?.secondary)
    && typeof pack.unavailableNotice === 'string'
    && (pack.cards === undefined || isMissionCards(pack.cards));
}

export function activeMissionPack(value: unknown): MissionPack | null {
  if (!isRecord(value)) return null;
  const catalog = value as Partial<MissionCatalog>;
  if (catalog.schemaVersion !== 'warforge-mission-packs/v1' || !Array.isArray(catalog.packs)) return null;
  const pack = catalog.packs.find((candidate) => candidate.id === catalog.activePackId);
  return isMissionPack(pack) ? pack : null;
}

export function isTrustedWebMissionPack(pack: MissionPack): pack is MissionPack & { source: TrustedWebMissionSource; cards: MissionCards } {
  return pack.source.kind === 'trusted-web' && pack.cards !== undefined;
}

export function missionSourceFilename(source: MissionSource): string {
  if (source.kind === 'trusted-web') return source.title;
  return source.relativePath.split(/[\\/]/).pop() ?? source.relativePath;
}

export function missionSourceDate(source: MissionSource): string {
  return source.kind === 'trusted-web' ? source.retrievedAt : source.createdAt;
}

export function formatMissionSourceDate(value: string, locale: 'fr' | 'en'): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'long' }).format(date);
}

export function missionAssetUrl(asset: string | null): string | null {
  if (!asset?.startsWith('/assets/11th/')) return null;
  return `${import.meta.env.BASE_URL}assets/gdm-11th/${asset.slice('/assets/11th/'.length)}`;
}
