import type {
  FactionSummary,
  NormalizedDatabase,
  NormalizedDetachment,
  NormalizedUnit,
  RawBattleSizeDefinition,
  RawBook,
  RawCatalogBundle,
  RawFactionInfo,
  SourceBook
} from './types';
import { repairImportedText } from './text';

function slug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'inconnu';
}

export function fingerprintRaw(raw: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}-${raw.length}`;
}

function completeBattleSize(value: RawBattleSizeDefinition): Required<RawBattleSizeDefinition> | null {
  if (
    typeof value.PointsTotal !== 'number' ||
    typeof value.DetachmentPoints !== 'number' ||
    typeof value.EnhancementLimit !== 'number' ||
    typeof value.UnitLimit !== 'number'
  ) {
    return null;
  }

  return {
    PointsTotal: value.PointsTotal,
    DetachmentPoints: value.DetachmentPoints,
    EnhancementLimit: value.EnhancementLimit,
    UnitLimit: value.UnitLimit
  };
}

function isCatalogBundle(value: unknown): value is RawCatalogBundle {
  return typeof value === 'object' && value !== null && Array.isArray((value as RawCatalogBundle).Books);
}

function normalizedBooks(books: RawBook[], catalog: boolean): {
  books: SourceBook[];
  units: NormalizedUnit[];
  detachments: NormalizedDetachment[];
} {
  const units: NormalizedUnit[] = [];
  const detachments: NormalizedDetachment[] = [];
  const sourceBooks = books.map((book, index) => {
    const name = book.Name?.trim() || 'Faction inconnue';
    const sourceKey = book.SourceKey?.trim() || book.Id?.trim() || name;
    const id = catalog ? `book-${slug(sourceKey)}` : `book-${index}-${slug(sourceKey)}`;
    const sourceLabel = book.SourceLabel?.trim() || name;

    (book.Units ?? []).forEach((unit, unitIndex) => {
      units.push({
        ...unit,
        id: `${id}:unit:${unitIndex}`,
        bookId: id,
        sourceKey,
        factionName: name,
        sourceIndex: unitIndex,
        displayName: unit.Name?.trim() || 'Unité inconnue'
      });
    });

    (book.Dettachments ?? []).forEach((detachment, detachmentIndex) => {
      detachments.push({
        ...detachment,
        id: `${id}:detachment:${detachmentIndex}`,
        bookId: id,
        sourceKey,
        factionName: name,
        sourceIndex: detachmentIndex,
        displayName: detachment.Name?.trim() || 'Détachement inconnu'
      });
    });

    return { id, index, name, sourceKey, sourceLabel, version: book.Version, publishDate: book.PublishDate };
  });

  return { books: sourceBooks, units, detachments };
}

function legacyFactions(sourceBooks: SourceBook[], units: NormalizedUnit[], detachments: NormalizedDetachment[]): FactionSummary[] {
  const factionMap = new Map<string, FactionSummary>();
  sourceBooks.forEach((book) => {
    const unitCount = units.filter((unit) => unit.bookId === book.id).length;
    const detachmentCount = detachments.filter((detachment) => detachment.bookId === book.id).length;
    if (unitCount === 0 && detachmentCount === 0) return;
    const faction = factionMap.get(book.name) ?? {
      id: book.name,
      name: book.name,
      sourceKey: book.sourceKey,
      bookIds: [],
      unitCount: 0,
      detachmentCount: 0
    };
    faction.bookIds.push(book.id);
    faction.unitCount += unitCount;
    faction.detachmentCount += detachmentCount;
    factionMap.set(book.name, faction);
  });
  return [...factionMap.values()].sort((left, right) => left.name.localeCompare(right.name, 'fr'));
}

function catalogFactions(
  factionInfo: RawFactionInfo[] | undefined,
  sourceBooks: SourceBook[],
  units: NormalizedUnit[],
  detachments: NormalizedDetachment[]
): { factions: FactionSummary[]; alliesByFaction: Record<string, string[]>; primaryRostersByFaction: Record<string, string[]> } {
  const bySourceKey = new Map(sourceBooks.map((book) => [book.sourceKey, book]));
  const factions: FactionSummary[] = [];
  const alliesByFaction: Record<string, string[]> = {};
  const primaryRostersByFaction: Record<string, string[]> = {};

  const resolveTarget = (target: string | undefined): string[] => {
    const trimmed = target?.trim();
    if (!trimmed) return [];
    if (bySourceKey.has(trimmed)) return [trimmed];
    const primaryMatch = (factionInfo ?? []).find((candidate) => candidate.Name?.trim() === trimmed || candidate.FactionKeyword?.trim() === trimmed);
    if (primaryMatch?.Name && bySourceKey.has(primaryMatch.Name)) return [primaryMatch.Name];
    const fallbackMatch = (factionInfo ?? []).find((candidate) => (candidate.AdditionalFactionKeywords ?? []).some((keyword) => keyword.trim() === trimmed));
    return fallbackMatch?.Name && bySourceKey.has(fallbackMatch.Name) ? [fallbackMatch.Name] : [];
  };

  (factionInfo ?? []).forEach((info) => {
    const id = info.Name?.trim();
    if (!id) return;
    const book = bySourceKey.get(id);
    if (!book) return;
    const allies = [...new Set((info.Allies ?? []).flatMap((ally) => resolveTarget(ally.FactionKeyword)))];
    const primaryRosters = [...new Set([
      book.sourceKey,
      ...(info.Allies ?? []).flatMap((ally) => ally.IsIncludedInPrimaryRoster ? resolveTarget(ally.FactionKeyword) : [])
    ])];
    alliesByFaction[id] = allies;
    primaryRostersByFaction[id] = primaryRosters;
    factions.push({
      id,
      name: info.Name?.trim() || book.name,
      sourceKey: book.sourceKey,
      bookIds: [book.id],
      unitCount: units.filter((unit) => unit.bookId === book.id).length,
      detachmentCount: detachments.filter((detachment) => detachment.bookId === book.id).length
    });
  });

  if (factions.length === 0) {
    return { factions: legacyFactions(sourceBooks, units, detachments), alliesByFaction, primaryRostersByFaction };
  }
  return { factions: factions.sort((left, right) => left.name.localeCompare(right.name, 'fr')), alliesByFaction, primaryRostersByFaction };
}

function battleSizesFrom(values: RawBattleSizeDefinition[]): Required<RawBattleSizeDefinition>[] {
  const battleSizeMap = new Map<number, Required<RawBattleSizeDefinition>>();
  values.forEach((size) => {
    const complete = completeBattleSize(size);
    if (complete && !battleSizeMap.has(complete.PointsTotal)) battleSizeMap.set(complete.PointsTotal, complete);
  });
  return [...battleSizeMap.values()].sort((left, right) => left.PointsTotal - right.PointsTotal);
}

export function normalizeDatabase(raw: string): NormalizedDatabase {
  const parsed: unknown = JSON.parse(raw.replace(/^\uFEFF/, ''));
  if (!Array.isArray(parsed) && !isCatalogBundle(parsed)) {
    throw new Error('La base doit être un tableau de livres de faction ou un catalogue Warforge v2.');
  }

  repairImportedText(parsed);
  const catalog = isCatalogBundle(parsed) ? parsed : undefined;
  const books = catalog?.Books ?? (parsed as RawBook[]);
  const normalized = normalizedBooks(books, Boolean(catalog));
  const factionData = catalog
    ? catalogFactions(catalog.FactionInfo?.Factions, normalized.books, normalized.units, normalized.detachments)
    : { factions: legacyFactions(normalized.books, normalized.units, normalized.detachments), alliesByFaction: {}, primaryRostersByFaction: {} };
  const battleSizes = battleSizesFrom(catalog?.BattleSizeDefinitions ?? books.flatMap((book) => book.BattleSizeDefinitions ?? []));
  if (battleSizes.length === 0) throw new Error('Aucun format de bataille exploitable n’a été trouvé.');

  return {
    fingerprint: fingerprintRaw(raw),
    loadedAt: new Date().toISOString(),
    books: normalized.books,
    factions: factionData.factions,
    alliesByFaction: factionData.alliesByFaction,
    primaryRostersByFaction: factionData.primaryRostersByFaction,
    dataInfo: catalog?.DataInfo,
    units: normalized.units,
    detachments: normalized.detachments,
    battleSizes
  };
}
