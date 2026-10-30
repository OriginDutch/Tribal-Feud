/**
 * IndexedDB save slots. Works in the worker and on the main thread.
 *
 * Two object stores: 'saves' holds { slot, meta fields, data } per slot, 'meta' only the meta fields.
 * Listing reads 'meta', so it never pulls every full world out of the database (with an autosave,
 * five backups and a few manual saves of a big world that is tens of MB, each minute).
 * The world is stored as a JSON string: copying one string into IndexedDB is a lot cheaper than
 * a structured clone of the whole object tree. Older records hold the object itself; both load.
 */
import type { SaveData, SaveMeta } from '../sim/save';

const DB_NAME = 'tribal-feud';
const DB_VERSION = 2;
const STORE = 'saves';
const META = 'meta';

interface SaveRecord extends SaveMeta {
  data: SaveData | string;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

const metaOf = ({ slot, worldName, gameTime, savedAt, version, key }: SaveMeta): SaveMeta => ({ slot, worldName, gameTime, savedAt, version, ...(key !== undefined ? { key } : {}) });

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'slot' });
      if (!db.objectStoreNames.contains(META)) {
        // first time with a meta store: fill it from the saves that already exist (one by one)
        const meta = db.createObjectStore(META, { keyPath: 'slot' });
        const saves = open.transaction!.objectStore(STORE);
        saves.openCursor().onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (!cursor) return;
          meta.put(metaOf(cursor.value as SaveRecord));
          cursor.continue();
        };
      }
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => {
      dbPromise = null;
      reject(open.error);
    };
  });
  return dbPromise;
}

async function tx(mode: IDBTransactionMode): Promise<IDBTransaction> {
  const db = await openDb();
  return db.transaction([STORE, META], mode);
}

function done(t: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function putSave(slot: string, data: SaveData, json = JSON.stringify(data)): Promise<SaveMeta> {
  // stringified right away, before any await: later changes to the live world never end up in this save
  const meta: SaveMeta = {
    slot,
    worldName: data.state.config.name,
    gameTime: data.state.time,
    savedAt: data.savedAt,
    version: data.version,
  };
  const seed = (data.state.config as { seed?: unknown } | undefined)?.seed;
  if (seed !== undefined) meta.key = String(seed);
  const t = await tx('readwrite');
  const record: SaveRecord = { ...meta, data: json };
  t.objectStore(STORE).put(record);
  t.objectStore(META).put(meta);
  await done(t);
  return meta;
}

export async function getSave(slot: string): Promise<SaveData | undefined> {
  const t = await tx('readonly');
  const record = (await req(t.objectStore(STORE).get(slot))) as SaveRecord | undefined;
  if (!record) return undefined;
  return typeof record.data === 'string' ? (JSON.parse(record.data) as SaveData) : record.data;
}

export async function listSaves(): Promise<SaveMeta[]> {
  const t = await tx('readonly');
  const records = (await req(t.objectStore(META).getAll())) as SaveMeta[];
  return records.map(metaOf).sort((a, b) => b.savedAt - a.savedAt);
}

export async function deleteSave(slot: string): Promise<void> {
  const t = await tx('readwrite');
  t.objectStore(STORE).delete(slot);
  t.objectStore(META).delete(slot);
  await done(t);
}
