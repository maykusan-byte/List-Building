import type { InventoryDataset } from './inventory';
import type { NormalizedDatabase, SavedDraft } from './types';

const DATABASE_NAME = 'warforge-40k';
const DATABASE_VERSION = 3;
const DATA_STORE = 'datasets';
const INVENTORY_STORE = 'inventory';
const DATA_KEY = 'catalog-v2';
const DRAFTS_KEY = 'warforge.saved-drafts.v2';
const ACTIVE_DRAFT_KEY = 'warforge.active-draft.v1';
const FAVORITES_KEY = 'warforge.favourites.v2';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DATA_STORE)) request.result.createObjectStore(DATA_STORE);
      if (!request.result.objectStoreNames.contains(INVENTORY_STORE)) request.result.createObjectStore(INVENTORY_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function cacheDatabase(database: NormalizedDatabase): Promise<void> {
  const connection = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = connection.transaction(DATA_STORE, 'readwrite');
    transaction.objectStore(DATA_STORE).put(database, DATA_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  connection.close();
}

export async function getCachedDatabase(): Promise<NormalizedDatabase | null> {
  const connection = await openDatabase();
  const result = await new Promise<NormalizedDatabase | null>((resolve, reject) => {
    const request = connection.transaction(DATA_STORE, 'readonly').objectStore(DATA_STORE).get(DATA_KEY);
    request.onsuccess = () => resolve((request.result as NormalizedDatabase | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
  connection.close();
  return result;
}

export async function cacheInventory(inventory: InventoryDataset): Promise<void> {
  const connection = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = connection.transaction(INVENTORY_STORE, 'readwrite');
    transaction.objectStore(INVENTORY_STORE).put(inventory, 'latest');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  connection.close();
}

export async function getCachedInventory(): Promise<InventoryDataset | null> {
  const connection = await openDatabase();
  const result = await new Promise<InventoryDataset | null>((resolve, reject) => {
    const request = connection.transaction(INVENTORY_STORE, 'readonly').objectStore(INVENTORY_STORE).get('latest');
    request.onsuccess = () => resolve((request.result as InventoryDataset | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
  connection.close();
  return result;
}

export function readSavedDrafts(): SavedDraft[] {
  try {
    const value = localStorage.getItem(DRAFTS_KEY);
    const parsed: unknown = value ? JSON.parse(value) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((saved): saved is SavedDraft => Boolean(
      saved
      && typeof saved === 'object'
      && typeof (saved as SavedDraft).id === 'string'
      && typeof (saved as SavedDraft).name === 'string'
      && typeof (saved as SavedDraft).updatedAt === 'string'
      && (saved as SavedDraft).draft
    ));
  } catch {
    return [];
  }
}

export function writeSavedDrafts(drafts: SavedDraft[]): boolean {
  try {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
    return true;
  } catch {
    return false;
  }
}

export function readActiveDraftId(): string | null {
  try {
    const value = localStorage.getItem(ACTIVE_DRAFT_KEY);
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

export function writeActiveDraftId(id: string): boolean {
  try {
    localStorage.setItem(ACTIVE_DRAFT_KEY, id);
    return true;
  } catch {
    return false;
  }
}

export function readFavorites(): string[] {
  try {
    const value = localStorage.getItem(FAVORITES_KEY);
    return value ? (JSON.parse(value) as string[]) : [];
  } catch {
    return [];
  }
}

export function writeFavorites(favorites: string[]): void {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
}
