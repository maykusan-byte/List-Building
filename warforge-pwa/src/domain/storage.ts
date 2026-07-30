import type { NormalizedDatabase, SavedDraft } from './types';

const DATABASE_NAME = 'warforge-40k';
const DATABASE_VERSION = 1;
const DATA_STORE = 'datasets';
const DRAFTS_KEY = 'warforge.saved-drafts.v1';
const FAVORITES_KEY = 'warforge.favourites.v1';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DATA_STORE)) request.result.createObjectStore(DATA_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function cacheDatabase(database: NormalizedDatabase): Promise<void> {
  const connection = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = connection.transaction(DATA_STORE, 'readwrite');
    transaction.objectStore(DATA_STORE).put(database, 'latest');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  connection.close();
}

export async function getCachedDatabase(): Promise<NormalizedDatabase | null> {
  const connection = await openDatabase();
  const result = await new Promise<NormalizedDatabase | null>((resolve, reject) => {
    const request = connection.transaction(DATA_STORE, 'readonly').objectStore(DATA_STORE).get('latest');
    request.onsuccess = () => resolve((request.result as NormalizedDatabase | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
  connection.close();
  return result;
}

export function readSavedDrafts(): SavedDraft[] {
  try {
    const value = localStorage.getItem(DRAFTS_KEY);
    return value ? (JSON.parse(value) as SavedDraft[]) : [];
  } catch {
    return [];
  }
}

export function writeSavedDrafts(drafts: SavedDraft[]): void {
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
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
