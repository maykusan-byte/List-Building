import { getPointOption } from './calculations';
import type { NormalizedDatabase, RosterItem } from './types';

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
}

interface CsvRow {
  line: number;
  cells: string[];
}

const REQUIRED_COLUMNS = ['DatabaseFingerprint', 'UnitId', 'ID_figurine', 'Type'] as const;

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
      required: getPointOption(unit, item.pointIndex)?.ModelCount ?? 0,
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

  // This two-pass allocation is global: a physical miniature that is real for
  // any selected unit cannot be consumed as a proxy by an earlier list item.
  for (const type of ['real', 'proxy'] as const) {
    for (const entry of pending) {
      entry.reservation.hasCatalogEntry = entry.candidates.length > 0;
      for (const candidate of entry.candidates) {
        const reservedCount = entry.reservation.realFigureIds.length + entry.reservation.proxyFigureIds.length;
        if (candidate.type !== type || reservedFigureIds.has(candidate.figureId) || reservedCount >= entry.reservation.required) continue;
        reservedFigureIds.add(candidate.figureId);
        (type === 'real' ? entry.reservation.realFigureIds : entry.reservation.proxyFigureIds).push(candidate.figureId);
      }
    }
  }

  for (const entry of pending) {
    const reservedCount = entry.reservation.realFigureIds.length + entry.reservation.proxyFigureIds.length;
    entry.reservation.missing = Math.max(0, entry.reservation.required - reservedCount);
    reservationsByItemId.set(entry.item.id, entry.reservation);
  }

  return { reservationsByItemId, reservedFigureIds };
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
    proxy: available.filter((entry) => entry.type === 'proxy').length
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
