import { getPointSizes } from './calculations';
import type { NormalizedDatabase, NormalizedUnit, RosterItem } from './types';

export type FigureType = 'real' | 'proxy';

export interface InventoryEntry {
  databaseFingerprint: string;
  unitId: string;
  figureId: number;
  type: FigureType;
}

export interface InventoryDataset {
  databaseFingerprint: string;
  entries: InventoryEntry[];
  sourceLabel: string;
  sourceKind: 'bundled' | 'local';
}

export interface InventoryReservation {
  itemId: string;
  unitId: string;
  required: number;
  realFigureIds: number[];
  proxyFigureIds: number[];
  missing: number;
  hasCatalogEntry: boolean;
}

export interface InventoryAllocation {
  reservationsByItemId: Map<string, InventoryReservation>;
  reservedFigureIds: Set<number>;
}

export interface InventoryAvailability {
  hasCatalogEntry: boolean;
  real: number;
  proxy: number;
  used: number;
  total: number;
}

/**
 * One physical miniature can be associated with more than one datasheet. The
 * association is deliberate: it is how the existing inventory format models a
 * legal stand-in without allowing the miniature to be allocated twice.
 */
export interface InventoryFigure {
  figureId: number;
  realUnitIds: string[];
  proxyUnitIds: string[];
}

interface CsvRow {
  line: number;
  cells: string[];
}

const REQUIRED_COLUMNS = ['DatabaseFingerprint', 'UnitId', 'ID_figurine', 'Type'] as const;
const INVENTORY_CSV_HEADER = REQUIRED_COLUMNS.join(',');

function parseCsv(raw: string): CsvRow[] {
  const rows: CsvRow[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;

  const finishCell = (): void => {
    cells.push(cell);
    cell = '';
  };
  const finishRow = (): void => {
    finishCell();
    if (cells.some((value) => value.length > 0)) rows.push({ line, cells });
    cells = [];
  };

  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    if (quoted) {
      if (character === '"') {
        if (raw[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"') {
      if (cell.length > 0) throw new Error(`CSV invalide ligne ${line} : guillemet inattendu.`);
      quoted = true;
    } else if (character === ',') {
      finishCell();
    } else if (character === '\n') {
      finishRow();
      line += 1;
    } else if (character !== '\r') {
      cell += character;
    }
  }

  if (quoted) throw new Error(`CSV invalide ligne ${line} : guillemet non fermé.`);
  if (cell.length > 0 || cells.length > 0) finishRow();
  return rows;
}

function cell(row: CsvRow, column: number): string {
  return (row.cells[column] ?? '').trim();
}

/**
 * Parses only the four contractual columns. Documentary fields such as
 * Nom_datasheet intentionally never enter the inventory model.
 */
export function parseInventoryCsv(
  raw: string,
  database: NormalizedDatabase,
  sourceLabel: string,
  sourceKind: InventoryDataset['sourceKind'] = 'local'
): InventoryDataset {
  const rows = parseCsv(raw.replace(/^\uFEFF/, ''));
  if (rows.length === 0) throw new Error('Le CSV d’inventaire est vide.');

  const header = rows[0];
  const columnIndexes = new Map(header.cells.map((value, index) => [value.trim(), index]));
  const missingColumns = REQUIRED_COLUMNS.filter((column) => !columnIndexes.has(column));
  if (missingColumns.length > 0) {
    throw new Error(`Colonnes obligatoires manquantes : ${missingColumns.join(', ')}.`);
  }

  const fingerprintColumn = columnIndexes.get('DatabaseFingerprint') as number;
  const unitIdColumn = columnIndexes.get('UnitId') as number;
  const figureIdColumn = columnIndexes.get('ID_figurine') as number;
  const typeColumn = columnIndexes.get('Type') as number;
  const unitIds = new Set(database.units.map((unit) => unit.id));
  const identities = new Set<string>();
  const entries: InventoryEntry[] = [];

  for (const row of rows.slice(1)) {
    const fingerprint = cell(row, fingerprintColumn);
    const unitId = cell(row, unitIdColumn);
    const figureIdText = cell(row, figureIdColumn);
    const type = cell(row, typeColumn);

    if (!fingerprint) throw new Error(`Ligne ${row.line} : DatabaseFingerprint est requis.`);
    if (fingerprint !== database.fingerprint) {
      throw new Error(`Ligne ${row.line} : DatabaseFingerprint incompatible avec la base chargée.`);
    }
    if (!unitIds.has(unitId)) throw new Error(`Ligne ${row.line} : UnitId inconnu.`);
    if (!/^\d+$/.test(figureIdText)) throw new Error(`Ligne ${row.line} : ID_figurine doit être un entier positif.`);
    const figureId = Number(figureIdText);
    if (!Number.isSafeInteger(figureId) || figureId <= 0) {
      throw new Error(`Ligne ${row.line} : ID_figurine doit être un entier positif.`);
    }
    if (type !== 'real' && type !== 'proxy') throw new Error(`Ligne ${row.line} : Type doit être real ou proxy.`);

    const identity = `${figureId}\u0000${unitId}`;
    if (identities.has(identity)) throw new Error(`Ligne ${row.line} : doublon ID_figurine + UnitId.`);
    identities.add(identity);
    entries.push({ databaseFingerprint: fingerprint, unitId, figureId, type });
  }

  if (entries.length === 0) throw new Error('Le CSV d’inventaire ne contient aucune association.');
  return { databaseFingerprint: database.fingerprint, entries, sourceLabel, sourceKind };
}

function entriesForUnit(inventory: InventoryDataset, unitId: string): InventoryEntry[] {
  return inventory.entries
    .filter((entry) => entry.unitId === unitId)
    .sort((left, right) => (left.type === right.type ? left.figureId - right.figureId : left.type === 'real' ? -1 : 1));
}

export function inventoryFigures(inventory: InventoryDataset | null): InventoryFigure[] {
  if (!inventory) return [];
  const figures = new Map<number, InventoryFigure>();
  for (const entry of inventory.entries) {
    const figure = figures.get(entry.figureId) ?? {
      figureId: entry.figureId,
      realUnitIds: [],
      proxyUnitIds: []
    };
    const unitIds = entry.type === 'real' ? figure.realUnitIds : figure.proxyUnitIds;
    unitIds.push(entry.unitId);
    figures.set(entry.figureId, figure);
  }
  return [...figures.values()]
    .map((figure) => ({
      ...figure,
      realUnitIds: [...figure.realUnitIds].sort(),
      proxyUnitIds: [...figure.proxyUnitIds].sort()
    }))
    .sort((left, right) => left.figureId - right.figureId);
}

export function nextInventoryFigureId(inventory: InventoryDataset): number {
  const highestId = inventory.entries.reduce((highest, entry) => Math.max(highest, entry.figureId), 0);
  if (highestId >= Number.MAX_SAFE_INTEGER) throw new Error('Impossible d’attribuer un nouvel ID de figurine.');
  return highestId + 1;
}

export function addOwnedFigures(inventory: InventoryDataset, unitId: string, count: number): InventoryDataset {
  if (!Number.isSafeInteger(count) || count <= 0) throw new Error('Le nombre de figurines doit être un entier positif.');
  const firstFigureId = nextInventoryFigureId(inventory);
  if (firstFigureId + count - 1 > Number.MAX_SAFE_INTEGER) throw new Error('Impossible d’attribuer ces IDs de figurines.');
  const newEntries = Array.from({ length: count }, (_, index): InventoryEntry => ({
    databaseFingerprint: inventory.databaseFingerprint,
    unitId,
    figureId: firstFigureId + index,
    type: 'real'
  }));
  return { ...inventory, entries: [...inventory.entries, ...newEntries] };
}

export function addProxyAssociation(inventory: InventoryDataset, figureId: number, unitId: string): InventoryDataset {
  if (!Number.isSafeInteger(figureId) || figureId <= 0) throw new Error('ID de figurine invalide.');
  const figureEntries = inventory.entries.filter((entry) => entry.figureId === figureId);
  if (!figureEntries.some((entry) => entry.type === 'real')) {
    throw new Error('Un proxy doit être rattaché à une figurine réellement possédée.');
  }
  if (figureEntries.some((entry) => entry.unitId === unitId)) {
    throw new Error('Cette figurine est déjà associée à cette unité.');
  }
  return {
    ...inventory,
    entries: [...inventory.entries, {
      databaseFingerprint: inventory.databaseFingerprint,
      unitId,
      figureId,
      type: 'proxy'
    }]
  };
}

export function removeInventoryAssociation(inventory: InventoryDataset, figureId: number, unitId: string): InventoryDataset {
  const entries = inventory.entries.filter((entry) => entry.figureId !== figureId || entry.unitId !== unitId);
  if (entries.length === inventory.entries.length) throw new Error('Association d’inventaire introuvable.');
  return { ...inventory, entries };
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function inventoryToCsv(inventory: InventoryDataset): string {
  const rows = [...inventory.entries]
    .sort((left, right) => left.figureId - right.figureId || left.unitId.localeCompare(right.unitId))
    .map((entry) => [entry.databaseFingerprint, entry.unitId, entry.figureId, entry.type].map(csvCell).join(','));
  return `\uFEFF${INVENTORY_CSV_HEADER}\n${rows.join('\n')}\n`;
}

export function allocateInventory(
  database: NormalizedDatabase,
  items: RosterItem[],
  inventory: InventoryDataset | null
): InventoryAllocation {
  const reservationsByItemId = new Map<string, InventoryReservation>();
  const reservedFigureIds = new Set<number>();
  if (!inventory || inventory.databaseFingerprint !== database.fingerprint) return { reservationsByItemId, reservedFigureIds };

  const pending = items.flatMap((item) => {
    const unit = database.units.find((candidate) => candidate.id === item.unitId);
    if (!unit) return [];
    const reservation: InventoryReservation = {
      itemId: item.id,
      unitId: item.unitId,
      required: getPointSizes(unit)[item.pointIndex]?.modelCount ?? getPointSizes(unit)[0]?.modelCount ?? 0,
      realFigureIds: [],
      proxyFigureIds: [],
      missing: 0,
      hasCatalogEntry: false
    };
    return [{
      item,
      candidates: entriesForUnit(inventory, item.unitId),
      reservation
    }];
  });

  for (const entry of pending) {
    entry.reservation.hasCatalogEntry = entry.candidates.length > 0;
  }

  // Pass 1: Allocate primary figure type for all items first
  for (const entry of pending) {
    const pref = entry.item.figurePreference ?? 'any';
    const primaryType = pref === 'proxy' ? 'proxy' : 'real';
    let candidatesToTry = entry.candidates;
    if (primaryType === 'proxy' && entry.item.preferredProxySourceId) {
      const preferredId = entry.item.preferredProxySourceId;
      candidatesToTry = [...entry.candidates].sort((a, b) => {
        if (a.type !== 'proxy' || b.type !== 'proxy') return 0;
        const aReal = inventory.entries.find((e) => e.figureId === a.figureId && e.type === 'real');
        const bReal = inventory.entries.find((e) => e.figureId === b.figureId && e.type === 'real');
        const aMatch = aReal?.unitId === preferredId;
        const bMatch = bReal?.unitId === preferredId;
        return Number(bMatch) - Number(aMatch);
      });
    }
    for (const candidate of candidatesToTry) {
      const reservedCount = entry.reservation.realFigureIds.length + entry.reservation.proxyFigureIds.length;
      if (candidate.type !== primaryType || reservedFigureIds.has(candidate.figureId) || reservedCount >= entry.reservation.required) continue;
      reservedFigureIds.add(candidate.figureId);
      (candidate.type === 'real' ? entry.reservation.realFigureIds : entry.reservation.proxyFigureIds).push(candidate.figureId);
    }
  }

  // Pass 2: Allocate secondary figure type for remaining slots across all items
  for (const entry of pending) {
    const pref = entry.item.figurePreference ?? 'any';
    const secondaryType = pref === 'proxy' ? 'real' : (pref === 'real' ? null : 'proxy');
    if (!secondaryType) continue;

    let candidatesToTry = entry.candidates;
    if (secondaryType === 'proxy' && entry.item.preferredProxySourceId) {
      const preferredId = entry.item.preferredProxySourceId;
      candidatesToTry = [...entry.candidates].sort((a, b) => {
        if (a.type !== 'proxy' || b.type !== 'proxy') return 0;
        const aReal = inventory.entries.find((e) => e.figureId === a.figureId && e.type === 'real');
        const bReal = inventory.entries.find((e) => e.figureId === b.figureId && e.type === 'real');
        const aMatch = aReal?.unitId === preferredId;
        const bMatch = bReal?.unitId === preferredId;
        return Number(bMatch) - Number(aMatch);
      });
    }
    for (const candidate of candidatesToTry) {
      const reservedCount = entry.reservation.realFigureIds.length + entry.reservation.proxyFigureIds.length;
      if (candidate.type !== secondaryType || reservedFigureIds.has(candidate.figureId) || reservedCount >= entry.reservation.required) continue;
      reservedFigureIds.add(candidate.figureId);
      (candidate.type === 'real' ? entry.reservation.realFigureIds : entry.reservation.proxyFigureIds).push(candidate.figureId);
    }
  }

  for (const entry of pending) {
    const reservedCount = entry.reservation.realFigureIds.length + entry.reservation.proxyFigureIds.length;
    entry.reservation.missing = Math.max(0, entry.reservation.required - reservedCount);
    reservationsByItemId.set(entry.item.id, entry.reservation);
  }

  return { reservationsByItemId, reservedFigureIds };
}

export function getProxySourceUnits(
  inventory: InventoryDataset | null,
  database: NormalizedDatabase,
  unitId: string
): NormalizedUnit[] {
  if (!inventory) return [];
  const proxyEntries = inventory.entries.filter((entry) => entry.unitId === unitId && entry.type === 'proxy');
  if (proxyEntries.length === 0) return [];

  const sourceUnitIds = new Set<string>();
  for (const proxyEntry of proxyEntries) {
    const realEntry = inventory.entries.find((entry) => entry.figureId === proxyEntry.figureId && entry.type === 'real');
    if (realEntry && realEntry.unitId !== unitId) {
      sourceUnitIds.add(realEntry.unitId);
    }
  }

  return database.units.filter((unit) => sourceUnitIds.has(unit.id));
}

export function getReservedProxySources(
  inventory: InventoryDataset | null,
  database: NormalizedDatabase,
  proxyFigureIds: number[]
): NormalizedUnit[] {
  if (!inventory || proxyFigureIds.length === 0) return [];
  const sourceUnitIds = new Set<string>();
  for (const figId of proxyFigureIds) {
    const realEntry = inventory.entries.find((entry) => entry.figureId === figId && entry.type === 'real');
    if (realEntry) {
      sourceUnitIds.add(realEntry.unitId);
    }
  }
  return database.units.filter((unit) => sourceUnitIds.has(unit.id));
}

export function getInventoryAvailability(
  inventory: InventoryDataset | null,
  allocation: InventoryAllocation,
  unitId: string
): InventoryAvailability | null {
  if (!inventory) return null;
  const candidates = entriesForUnit(inventory, unitId);
  const available = candidates.filter((entry) => !allocation.reservedFigureIds.has(entry.figureId));
  return {
    hasCatalogEntry: candidates.length > 0,
    real: available.filter((entry) => entry.type === 'real').length,
    proxy: available.filter((entry) => entry.type === 'proxy').length,
    used: candidates.length - available.length,
    total: candidates.length
  };
}

export function hasFreeInventory(
  inventory: InventoryDataset | null,
  allocation: InventoryAllocation,
  unitId: string
): boolean {
  const availability = getInventoryAvailability(inventory, allocation, unitId);
  return (availability?.real ?? 0) + (availability?.proxy ?? 0) > 0;
}
