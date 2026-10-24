/**
 * IndexedDB save slots. Works in the worker and on the main thread.
 * One object store, one record per slot: { slot, meta fields, data }.
 */
import type { SaveData, SaveMeta } from '../sim/save';

const DB_NAME = 'tribal-feud';
const DB_VERSION = 1;
const STORE = 'saves';

interface SaveRecord extends SaveMeta {
  data: SaveData;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'slot' });
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => {
      dbPromise = null;
      reject(open.error);
    };
  });
  return dbPromise;
}

async function store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const db = await openDb();
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function putSave(slot: string, data: SaveData): Promise<SaveMeta> {
  const meta: SaveMeta = {
    slot,
    worldName: data.state.config.name,
    gameTime: data.state.time,
    savedAt: data.savedAt,
    version: data.version,
  };
  const record: SaveRecord = { ...meta, data };
  await req((await store('readwrite')).put(record));
  return meta;
}

export async function getSave(slot: string): Promise<SaveData | undefined> {
  const record = (await req((await store('readonly')).get(slot))) as SaveRecord | undefined;
  return record?.data;
}

export async function listSaves(): Promise<SaveMeta[]> {
  const records = (await req((await store('readonly')).getAll())) as SaveRecord[];
  return records
    .map(({ slot, worldName, gameTime, savedAt, version }) => ({ slot, worldName, gameTime, savedAt, version }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

export async function deleteSave(slot: string): Promise<void> {
  await req((await store('readwrite')).delete(slot));
}
