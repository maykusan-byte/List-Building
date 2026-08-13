import type { Aabb } from './types';
import { validateInteger } from './primitives';

export interface SpatialHashEntry<T> {
  readonly id: string;
  readonly bounds: Aabb;
  readonly value: T;
}

/**
 * A deterministic uniform-grid broad phase. Authored geometry remains integer,
 * but conservative AABBs derived from rotations may be fractional. Cell
 * selection therefore accepts finite calculated bounds and applies floor to
 * both extrema, which cannot discard a narrow-phase candidate.
 */
export class SpatialHash<T> {
  private readonly cells = new Map<string, Set<string>>();
  private readonly entries = new Map<string, SpatialHashEntry<T>>();

  constructor(readonly cellSize: number) {
    validateInteger(cellSize, 'Spatial hash cellSize');
    if (cellSize <= 0) throw new Error('Spatial hash cellSize must be positive.');
  }

  insert(entry: SpatialHashEntry<T>): void {
    if (this.entries.has(entry.id)) throw new Error(`Spatial hash already contains '${entry.id}'.`);
    validateBounds(entry.bounds);
    this.entries.set(entry.id, entry);
    this.addToCells(entry);
  }

  update(entry: SpatialHashEntry<T>): void {
    if (this.entries.has(entry.id)) this.remove(entry.id);
    this.insert(entry);
  }

  remove(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;
    for (const key of this.cellKeys(entry.bounds)) {
      const cell = this.cells.get(key);
      cell?.delete(id);
      if (cell?.size === 0) this.cells.delete(key);
    }
    this.entries.delete(id);
    return true;
  }

  clear(): void {
    this.cells.clear();
    this.entries.clear();
  }

  query(bounds: Aabb): SpatialHashEntry<T>[] {
    validateBounds(bounds);
    const ids = new Set<string>();
    for (const key of this.cellKeys(bounds)) for (const id of this.cells.get(key) ?? []) ids.add(id);
    return [...ids]
      .map((id) => this.entries.get(id))
      .filter((entry): entry is SpatialHashEntry<T> => entry !== undefined)
      .sort(compareEntryIds);
  }

  /** Returns possible colliding pairs only; callers perform their exact narrow-phase test. */
  queryPairs(): Array<readonly [SpatialHashEntry<T>, SpatialHashEntry<T>]> {
    const keys = new Set<string>();
    for (const members of this.cells.values()) {
      const ids = [...members].sort();
      for (let leftIndex = 0; leftIndex < ids.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < ids.length; rightIndex += 1) keys.add(`${ids[leftIndex]}\u0000${ids[rightIndex]}`);
      }
    }
    return [...keys].sort().flatMap((key) => {
      const [leftId, rightId] = key.split('\u0000');
      const left = this.entries.get(leftId);
      const right = this.entries.get(rightId);
      return left && right ? [[left, right] as const] : [];
    });
  }

  private addToCells(entry: SpatialHashEntry<T>): void {
    for (const key of this.cellKeys(entry.bounds)) {
      const cell = this.cells.get(key) ?? new Set<string>();
      cell.add(entry.id);
      this.cells.set(key, cell);
    }
  }

  private cellKeys(bounds: Aabb): string[] {
    const minX = Math.floor(bounds.minX / this.cellSize);
    const maxX = Math.floor(bounds.maxX / this.cellSize);
    const minY = Math.floor(bounds.minY / this.cellSize);
    const maxY = Math.floor(bounds.maxY / this.cellSize);
    const keys: string[] = [];
    for (let x = minX; x <= maxX; x += 1) for (let y = minY; y <= maxY; y += 1) keys.push(`${x},${y}`);
    return keys;
  }
}

function compareEntryIds<T>(left: SpatialHashEntry<T>, right: SpatialHashEntry<T>): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function validateBounds(bounds: Aabb): void {
  if (![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite)
    || bounds.minX > bounds.maxX || bounds.minY > bounds.maxY) {
    throw new Error('Spatial hash bounds must be finite and ordered.');
  }
}
