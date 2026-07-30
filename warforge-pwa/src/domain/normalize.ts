import type {
  FactionSummary,
  NormalizedDatabase,
  NormalizedDetachment,
  NormalizedUnit,
  RawBattleSizeDefinition,
  RawBook
} from './types';

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

export function normalizeDatabase(raw: string): NormalizedDatabase {
  const parsed: unknown = JSON.parse(raw.replace(/^\uFEFF/, ''));
  if (!Array.isArray(parsed)) {
    throw new Error('La base doit être un tableau de livres de faction.');
  }

  const books = parsed as RawBook[];
  const units: NormalizedUnit[] = [];
  const detachments: NormalizedDetachment[] = [];
  const factionMap = new Map<string, FactionSummary>();
  const sourceBooks = books.map((book, index) => {
    const name = book.Name?.trim() || 'Faction inconnue';
    const id = `book-${index}-${slug(book.Id?.trim() || name)}`;
    const faction = factionMap.get(name) ?? { name, bookIds: [], unitCount: 0, detachmentCount: 0 };
    faction.bookIds.push(id);

    (book.Units ?? []).forEach((unit, unitIndex) => {
      units.push({
        ...unit,
        id: `${id}:unit:${unitIndex}`,
        bookId: id,
        factionName: name,
        sourceIndex: unitIndex,
        displayName: unit.Name?.trim() || 'Unité inconnue'
      });
      faction.unitCount += 1;
    });

    (book.Dettachments ?? []).forEach((detachment, detachmentIndex) => {
      detachments.push({
        ...detachment,
        id: `${id}:detachment:${detachmentIndex}`,
        bookId: id,
        factionName: name,
        sourceIndex: detachmentIndex,
        displayName: detachment.Name?.trim() || 'Détachement inconnu'
      });
      faction.detachmentCount += 1;
    });

    // Some source blocks only carry global metadata. They are useful for
    // preserving source positions, but must not become a selectable empty
    // faction in the roster builder.
    if ((book.Units?.length ?? 0) > 0 || (book.Dettachments?.length ?? 0) > 0) {
      factionMap.set(name, faction);
    }
    return { id, index, name, version: book.Version, publishDate: book.PublishDate };
  });

  const battleSizeMap = new Map<number, Required<RawBattleSizeDefinition>>();
  books.flatMap((book) => book.BattleSizeDefinitions ?? []).forEach((size) => {
    const complete = completeBattleSize(size);
    if (complete && !battleSizeMap.has(complete.PointsTotal)) {
      battleSizeMap.set(complete.PointsTotal, complete);
    }
  });

  const battleSizes = [...battleSizeMap.values()].sort((left, right) => left.PointsTotal - right.PointsTotal);
  if (battleSizes.length === 0) {
    throw new Error('Aucun format de bataille exploitable n’a été trouvé.');
  }

  return {
    fingerprint: fingerprintRaw(raw),
    loadedAt: new Date().toISOString(),
    books: sourceBooks,
    factions: [...factionMap.values()].sort((left, right) => left.name.localeCompare(right.name, 'fr')),
    units,
    detachments,
    battleSizes
  };
}
