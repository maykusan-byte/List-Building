import type { SimulationAutosaveV1, SimulationStorageAdapter } from './types';

function clone<T>(value: T): T {
  return structuredClone(value);
}

/** A defensive adapter for unit tests, SSR and explicitly ephemeral sessions. */
export class InMemorySimulationStorageAdapter implements SimulationStorageAdapter {
  private readonly records = new Map<string, unknown>();

  public async read(gameId: string): Promise<unknown | null> {
    const value = this.records.get(gameId);
    return value === undefined ? null : clone(value);
  }

  public async write(autosave: SimulationAutosaveV1): Promise<void> {
    this.records.set(autosave.gameId, clone(autosave));
  }

  public async remove(gameId: string): Promise<void> {
    this.records.delete(gameId);
  }
}

export interface IndexedDbSimulationStorageOptions {
  readonly databaseName?: string;
  readonly storeName?: string;
  readonly version?: number;
  readonly indexedDb?: IDBFactory;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error ?? new Error('IndexedDB request failed.')), { once: true });
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.')), { once: true });
    transaction.addEventListener('error', () => reject(transaction.error ?? new Error('IndexedDB transaction failed.')), { once: true });
  });
}

/**
 * Browser storage adapter.  Opening is lazy so merely importing simulator
 * persistence remains safe in non-browser test and rendering environments.
 */
export class IndexedDbSimulationStorageAdapter implements SimulationStorageAdapter {
  private readonly databaseName: string;
  private readonly storeName: string;
  private readonly version: number;
  private readonly indexedDb: IDBFactory | undefined;
  private databasePromise: Promise<IDBDatabase> | null = null;

  public constructor(options: IndexedDbSimulationStorageOptions = {}) {
    this.databaseName = options.databaseName ?? 'warforge-simulator';
    this.storeName = options.storeName ?? 'autosaves';
    this.version = options.version ?? 1;
    this.indexedDb = options.indexedDb ?? globalThis.indexedDB;
  }

  public async read(gameId: string): Promise<unknown | null> {
    const database = await this.open();
    const transaction = database.transaction(this.storeName, 'readonly');
    const request = transaction.objectStore(this.storeName).get(gameId);
    const value = await requestResult(request);
    await transactionComplete(transaction);
    return value === undefined ? null : value;
  }

  public async write(autosave: SimulationAutosaveV1): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(this.storeName, 'readwrite');
    transaction.objectStore(this.storeName).put(autosave);
    await transactionComplete(transaction);
  }

  public async remove(gameId: string): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(this.storeName, 'readwrite');
    transaction.objectStore(this.storeName).delete(gameId);
    await transactionComplete(transaction);
  }

  private open(): Promise<IDBDatabase> {
    if (!this.databasePromise) {
      if (!this.indexedDb) throw new Error('IndexedDB n’est pas disponible dans cet environnement.');
      this.databasePromise = new Promise((resolve, reject) => {
        const request = this.indexedDb!.open(this.databaseName, this.version);
        request.addEventListener('upgradeneeded', () => {
          if (!request.result.objectStoreNames.contains(this.storeName)) request.result.createObjectStore(this.storeName, { keyPath: 'gameId' });
        }, { once: true });
        request.addEventListener('success', () => resolve(request.result), { once: true });
        request.addEventListener('error', () => reject(request.error ?? new Error('Impossible d’ouvrir IndexedDB.')), { once: true });
      });
    }
    return this.databasePromise;
  }
}
