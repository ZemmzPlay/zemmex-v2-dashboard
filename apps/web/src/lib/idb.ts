/**
 * A few lines over IndexedDB for the check-in console's offline copy: one
 * database, two stores (the guest list per session, and scans waiting to
 * upload). Every call fails soft: private windows can refuse storage, and the
 * console still works online without it.
 */
const DB = 'zemmz-checkin';
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('roster')) db.createObjectStore('roster');
      if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(store, mode).objectStore(store));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

export const idbGet = <T>(store: string, key: string) => run<T>(store, 'readonly', (s) => s.get(key) as IDBRequest<T>);
export const idbPut = (store: string, value: unknown, key?: string) => run(store, 'readwrite', (s) => s.put(value, key));
export const idbDelete = (store: string, key: string) => run(store, 'readwrite', (s) => s.delete(key));
export const idbAll = <T>(store: string) => run<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>);
