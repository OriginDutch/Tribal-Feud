/**
 * Cloud saves, run by the worker (it has the world and the save text already).
 *
 * users/{uid}                       { email, created, lastSeen }
 * users/{uid}/worlds/{1|2|3}        { key, name, savedAt, gameTime, version, size, chunks }
 * users/{uid}/worlds/{n}/chunks/{i} { data }   the gzipped save, cut in pieces
 *
 * A world and its pieces are written in ONE commit: either the whole new save is there or the old
 * one still is, never half of each. A world that is further along in the cloud than here (played
 * elsewhere, or an older save loaded here) is not overwritten unless the player says so.
 */
import { CHUNK_BYTES, CLOUD_EVERY_MS, MAX_CHUNKS, MAX_WORLDS } from './config';
import { CloudError, type Doc, type Fields, type Write } from './rest';

export interface CloudUser {
  uid: string;
  email: string;
  verified: boolean;
  token: string;
}

export type CloudState = 'off' | 'ok' | 'busy' | 'error' | 'full' | 'conflict';

export interface CloudStatus {
  /** signed in as */
  email: string | null;
  state: CloudState;
  /** real time of the last upload that worked */
  at: number | null;
  message?: string;
}

export interface CloudWorld {
  slot: string;
  key: string;
  name: string;
  savedAt: number;
  gameTime: number;
  version: number;
  /** gzipped bytes */
  size: number;
}

/** What sync needs from Firestore (the REST client, or a fake in tests). */
export interface Store {
  get(path: string): Promise<Doc | null>;
  list(collection: string): Promise<Doc[]>;
  commit(writes: Write[]): Promise<void>;
}

/** The save to upload: its text and what the list shows. */
export interface Upload {
  key: string;
  name: string;
  savedAt: number;
  gameTime: number;
  version: number;
  json: string;
}

export const SLOTS = Array.from({ length: MAX_WORLDS }, (_, i) => String(i + 1));

export async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function gunzip(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

const worldOf = (d: Doc): CloudWorld => ({
  slot: d.id,
  key: String(d.fields.key ?? ''),
  name: String(d.fields.name ?? ''),
  savedAt: Number(d.fields.savedAt ?? 0),
  gameTime: Number(d.fields.gameTime ?? 0),
  version: Number(d.fields.version ?? 0),
  size: Number(d.fields.size ?? 0),
});

export class CloudSync {
  user: CloudUser | null = null;
  status: CloudStatus = { email: null, state: 'off', at: null };
  worlds: CloudWorld[] = [];
  /** per world key: real time of the last upload (this session) */
  private last = new Map<string, number>();
  /** per world key: the cloud copy we know is ours (uploaded or loaded this session) */
  private known = new Map<string, number>();
  private running: Promise<void> | null = null;
  private queued: { up: Upload; force: boolean } | null = null;

  constructor(
    private store: (user: CloudUser) => Store,
    private onStatus: (s: CloudStatus) => void,
    private onWorlds: (w: CloudWorld[]) => void,
    private now: () => number = Date.now,
  ) {}

  private set(state: CloudState, message?: string, at = this.status.at): void {
    this.status = { email: this.user?.email ?? null, state, at, ...(message ? { message } : {}) };
    this.onStatus(this.status);
  }

  private get db(): Store {
    return this.store(this.user!);
  }

  private base(): string {
    return `users/${this.user!.uid}`;
  }

  /** A tab signed in, out, or got a fresh token. */
  async setUser(user: CloudUser | null): Promise<void> {
    const changed = user?.uid !== this.user?.uid;
    this.user = user;
    if (!changed) return;
    this.worlds = [];
    this.last.clear();
    this.known.clear();
    this.onWorlds([]);
    if (!user) return this.set('off', undefined, null);
    this.set('ok', undefined, null);
    await this.refresh().catch((e: unknown) => this.fail(e));
  }

  async refresh(): Promise<CloudWorld[]> {
    if (!this.user) return [];
    const docs = await this.db.list(`${this.base()}/worlds`);
    this.worlds = docs.map(worldOf).sort((a, b) => b.savedAt - a.savedAt);
    this.onWorlds(this.worlds);
    return this.worlds;
  }

  private fail(e: unknown): void {
    const auth = e instanceof CloudError && (e.status === 401 || e.status === 403);
    const net = e instanceof TypeError; // fetch: offline, blocked
    this.set('error', auth ? 'Geen toegang tot de cloud (log opnieuw in).' : net ? 'Geen verbinding met de cloud; probeert het later opnieuw.' : `Cloud: ${e instanceof Error ? e.message : String(e)}`);
  }

  /**
   * After a local save. `auto` saves go up at most every CLOUD_EVERY_MS per world;
   * `now` (pause, save button, hidden tab) goes up right away; `force` also overwrites a cloud copy that is further along.
   */
  offer(up: Upload, when: 'auto' | 'now' | 'force'): Promise<void> {
    if (!this.user) return Promise.resolve();
    if (when === 'auto' && this.now() - (this.last.get(up.key) ?? -Infinity) < CLOUD_EVERY_MS) return Promise.resolve();
    // one upload at a time; while one runs only the newest waiting save is kept
    this.queued = { up, force: when === 'force' || (this.queued?.force ?? false) };
    this.running ??= this.drain().finally(() => (this.running = null));
    return this.running;
  }

  private async drain(): Promise<void> {
    while (this.queued) {
      const { up, force } = this.queued;
      this.queued = null;
      try {
        await this.upload(up, force);
      } catch (e) {
        this.fail(e);
      }
    }
  }

  private async upload(up: Upload, force: boolean): Promise<void> {
    if (!this.user) return;
    this.set('busy');
    const worlds = await this.refresh();
    const mine = worlds.find((w) => w.key === up.key);
    if (mine && !force && mine.gameTime > up.gameTime && this.known.get(up.key) !== mine.savedAt) {
      this.set('conflict', `In de cloud staat "${mine.name}" verder gespeeld dan hier. Niet overschreven; kies in Saves welke je houdt.`);
      return;
    }
    const slot = mine?.slot ?? SLOTS.find((s) => !worlds.some((w) => w.slot === s));
    if (!slot) {
      this.set('full', `De cloud is vol (${MAX_WORLDS} werelden). Verwijder er een in Saves om "${up.name}" te bewaren.`);
      return;
    }
    const bytes = await gzip(up.json);
    const count = Math.ceil(bytes.length / CHUNK_BYTES);
    if (count > MAX_CHUNKS) {
      this.set('error', `"${up.name}" is te groot voor de cloud (${Math.round(bytes.length / 1e6)} MB ingepakt).`);
      return;
    }
    const path = `${this.base()}/worlds/${slot}`;
    const writes: Write[] = [];
    for (let i = 0; i < MAX_CHUNKS; i++) {
      // pieces past the end are removed in the same commit, so an old tail never sticks to a new save
      writes.push(i < count ? { set: `${path}/chunks/${i}`, fields: { data: bytes.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES) } } : { remove: `${path}/chunks/${i}` });
    }
    const fields: Fields = { key: up.key, name: up.name, savedAt: up.savedAt, gameTime: up.gameTime, version: up.version, size: bytes.length, chunks: count };
    writes.push({ set: path, fields });
    await this.db.commit(writes);
    this.last.set(up.key, this.now());
    this.known.set(up.key, up.savedAt);
    const w = worldOf({ id: slot, fields });
    this.worlds = [w, ...this.worlds.filter((x) => x.slot !== slot)].sort((a, b) => b.savedAt - a.savedAt);
    this.onWorlds(this.worlds);
    this.set('ok', undefined, this.now());
  }

  /** The save text of a cloud world, checked whole. */
  async download(slot: string): Promise<{ world: CloudWorld; json: string }> {
    if (!this.user) throw new Error('Niet ingelogd.');
    const path = `${this.base()}/worlds/${slot}`;
    const doc = await this.db.get(path);
    if (!doc) throw new Error('Deze wereld staat niet (meer) in de cloud.');
    const world = worldOf(doc);
    const count = Number(doc.fields.chunks ?? 0);
    const parts = await Promise.all(Array.from({ length: count }, (_, i) => this.db.get(`${path}/chunks/${i}`)));
    const bytes = new Uint8Array(world.size);
    let at = 0;
    for (const p of parts) {
      const data = p?.fields.data;
      if (!(data instanceof Uint8Array) || at + data.length > bytes.length) throw new Error('De cloud-save is niet compleet.');
      bytes.set(data, at);
      at += data.length;
    }
    if (at !== world.size) throw new Error('De cloud-save is niet compleet.');
    const json = await gunzip(bytes);
    this.known.set(world.key, world.savedAt);
    this.last.set(world.key, this.now());
    return { world, json };
  }

  async remove(slot: string): Promise<void> {
    if (!this.user) return;
    const path = `${this.base()}/worlds/${slot}`;
    await this.db.commit([...Array.from({ length: MAX_CHUNKS }, (_, i): Write => ({ remove: `${path}/chunks/${i}` })), { remove: path }]);
    const key = this.worlds.find((w) => w.slot === slot)?.key;
    if (key) { this.known.delete(key); this.last.delete(key); }
    this.worlds = this.worlds.filter((w) => w.slot !== slot);
    this.onWorlds(this.worlds);
    if (this.status.state === 'full' || this.status.state === 'conflict') this.set('ok');
  }
}
