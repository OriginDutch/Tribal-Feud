/**
 * The few Firestore REST calls the game needs (get, list, an atomic commit). No SDK: it runs in the
 * worker as well as in a tab, and adds no weight to the game.
 */
import { firestoreRoot } from './config';

export type Value = string | number | boolean | null | Uint8Array | Date;
export type Fields = Record<string, Value>;

interface RestValue {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  bytesValue?: string;
  timestampValue?: string;
  nullValue?: null;
}

export interface Doc {
  /** last part of the path */
  id: string;
  fields: Fields;
}

export class CloudError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function encode(v: Value): RestValue {
  if (v === null) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  return { bytesValue: toBase64(v) };
}

function decode(v: RestValue): Value {
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.bytesValue !== undefined) return fromBase64(v.bytesValue);
  if (v.timestampValue !== undefined) return new Date(v.timestampValue);
  return null;
}

const encodeFields = (f: Fields) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, encode(v)]));
const decodeFields = (f: Record<string, RestValue> | undefined): Fields => Object.fromEntries(Object.entries(f ?? {}).map(([k, v]) => [k, decode(v)]));
const toDoc = (d: { name: string; fields?: Record<string, RestValue> }): Doc => ({ id: d.name.slice(d.name.lastIndexOf('/') + 1), fields: decodeFields(d.fields) });

/** One write in a commit: a document set to these fields (createdAt-style fields can be stamped by the server), or deleted. */
export type Write = { set: string; fields: Fields; serverTime?: string[]; mustExist?: boolean } | { remove: string };

export class Firestore {
  constructor(
    readonly projectId: string,
    private token: () => Promise<string>,
  ) {}

  private get root() {
    return firestoreRoot(this.projectId);
  }

  private name(path: string) {
    return `projects/${this.projectId}/databases/(default)/documents/${path}`;
  }

  private async call(url: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${await this.token()}` } });
    if (!res.ok && res.status !== 404) {
      let msg = res.statusText;
      try {
        msg = ((await res.json()) as { error?: { message?: string } }).error?.message ?? msg;
      } catch {
        /* no body */
      }
      throw new CloudError(res.status, msg);
    }
    return res;
  }

  async get(path: string): Promise<Doc | null> {
    const res = await this.call(`${this.root}/${path}`);
    return res.status === 404 ? null : toDoc((await res.json()) as { name: string; fields?: Record<string, RestValue> });
  }

  async list(collection: string): Promise<Doc[]> {
    const out: Doc[] = [];
    let page = '';
    do {
      const res = await this.call(`${this.root}/${collection}?pageSize=300${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`);
      if (res.status === 404) return out;
      const body = (await res.json()) as { documents?: { name: string; fields?: Record<string, RestValue> }[]; nextPageToken?: string };
      out.push(...(body.documents ?? []).map(toDoc));
      page = body.nextPageToken ?? '';
    } while (page);
    return out;
  }

  /** All writes happen together or not at all. */
  async commit(writes: Write[]): Promise<void> {
    const body = {
      writes: writes.map((w) =>
        'remove' in w
          ? { delete: this.name(w.remove) }
          : {
              update: { name: this.name(w.set), fields: encodeFields(w.fields) },
              ...(w.serverTime?.length ? { updateTransforms: w.serverTime.map((f) => ({ fieldPath: f, setToServerValue: 'REQUEST_TIME' })) } : {}),
              ...(w.mustExist !== undefined ? { currentDocument: { exists: w.mustExist } } : {}),
            },
      ),
    };
    await this.call(`${this.root}:commit`, { method: 'POST', body: JSON.stringify(body) });
  }
}
