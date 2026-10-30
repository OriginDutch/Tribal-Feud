import { describe, expect, it } from 'vitest';
import { CHUNK_BYTES, CLOUD_EVERY_MS, MAX_CHUNKS } from './config';
import type { Doc, Fields, Write } from './rest';
import { CloudSync, gzip, type CloudStatus, type Store, type Upload } from './sync';

/** Firestore in memory; a commit is all or nothing, like the real one. */
function fakeStore() {
  const docs = new Map<string, Fields>();
  let failNext = false;
  let commits = 0;
  const store: Store = {
    async get(path) {
      const f = docs.get(path);
      return f ? { id: path.split('/').pop()!, fields: f } : null;
    },
    async list(col) {
      const out: Doc[] = [];
      for (const [p, f] of docs) if (p.startsWith(`${col}/`) && !p.slice(col.length + 1).includes('/')) out.push({ id: p.split('/').pop()!, fields: f });
      return out;
    },
    async commit(writes: Write[]) {
      if (failNext) { failNext = false; throw new TypeError('offline'); }
      commits++;
      for (const w of writes) 'remove' in w ? docs.delete(w.remove) : docs.set(w.set, { ...w.fields });
    },
  };
  return { store, docs, failOnce: () => (failNext = true), commits: () => commits };
}

function setup() {
  const f = fakeStore();
  let t = 1_000_000;
  const statuses: CloudStatus[] = [];
  const sync = new CloudSync(() => f.store, (s) => statuses.push(s), () => undefined, () => t);
  return { ...f, sync, statuses, tick: (ms: number) => (t += ms), last: () => statuses[statuses.length - 1]! };
}

const user = { uid: 'u1', email: 'a@b.nl', verified: true, token: 't' };
const world = (key: string, gameTime: number, json = JSON.stringify({ key, gameTime, pad: 'x'.repeat(100) })): Upload => ({ key, name: `Wereld ${key}`, savedAt: gameTime, gameTime, version: 19, json });

/** Random-ish text that does not compress well, to force several pieces. */
const noise = (n: number) => { let s = ''; let x = 7; while (s.length < n) { x = (x * 1103515245 + 12345) % 2 ** 31; s += x.toString(36); } return s.slice(0, n); };

describe('cloud sync', () => {
  it('uploads, downloads the same text back', async () => {
    const s = setup();
    await s.sync.setUser(user);
    const up = world('1', 100);
    await s.sync.offer(up, 'now');
    expect(s.last().state).toBe('ok');
    expect(s.sync.worlds.map((w) => w.slot)).toEqual(['1']);
    const back = await s.sync.download('1');
    expect(back.json).toBe(up.json);
  });

  it('large saves go in several pieces and come back whole; a smaller save leaves no old pieces', async () => {
    const s = setup();
    await s.sync.setUser(user);
    const big = world('1', 100, JSON.stringify({ n: noise(CHUNK_BYTES * 4) }));
    await s.sync.offer(big, 'now');
    const pieces = Math.ceil((await gzip(big.json)).length / CHUNK_BYTES);
    expect(pieces).toBeGreaterThanOrEqual(2);
    expect([...s.docs.keys()].filter((k) => k.includes('/chunks/')).length).toBe(pieces);
    expect((await s.sync.download('1')).json).toBe(big.json);
    await s.sync.offer(world('1', 200), 'now');
    expect([...s.docs.keys()].filter((k) => k.includes('/chunks/')).length).toBe(1);
    expect(JSON.parse((await s.sync.download('1')).json).gameTime).toBe(200);
  });

  it('auto saves go up at most every few minutes; now and force right away', async () => {
    const s = setup();
    await s.sync.setUser(user);
    await s.sync.offer(world('1', 100), 'auto');
    await s.sync.offer(world('1', 110), 'auto');
    expect(s.commits()).toBe(1);
    s.tick(CLOUD_EVERY_MS);
    await s.sync.offer(world('1', 120), 'auto');
    await s.sync.offer(world('1', 130), 'now');
    expect(s.commits()).toBe(3);
  });

  it('a failed upload keeps the previous cloud save and says so', async () => {
    const s = setup();
    await s.sync.setUser(user);
    await s.sync.offer(world('1', 100), 'now');
    s.failOnce();
    await s.sync.offer(world('1', 200), 'now');
    expect(s.last().state).toBe('error');
    expect(JSON.parse((await s.sync.download('1')).json).gameTime).toBe(100);
    await s.sync.offer(world('1', 300), 'now');
    expect(s.last().state).toBe('ok');
  });

  it('never overwrites a cloud world that is further along, unless forced', async () => {
    const s = setup();
    await s.sync.setUser(user);
    await s.sync.offer(world('1', 500), 'now');
    // another browser (fresh session) with an older copy of the same world
    const other = new CloudSync(() => s.store, () => undefined, () => undefined);
    let st: CloudStatus | null = null;
    const o2 = new CloudSync(() => s.store, (x) => (st = x), () => undefined);
    await other.setUser(user);
    await o2.setUser(user);
    await o2.offer(world('1', 300), 'now');
    expect(st!.state).toBe('conflict');
    expect(JSON.parse((await s.sync.download('1')).json).gameTime).toBe(500);
    await o2.offer(world('1', 300), 'force');
    expect(JSON.parse((await s.sync.download('1')).json).gameTime).toBe(300);
  });

  it('three worlds at most; deleting one frees its place', async () => {
    const s = setup();
    await s.sync.setUser(user);
    for (const k of ['a', 'b', 'c']) await s.sync.offer(world(k, 100), 'now');
    await s.sync.offer(world('d', 100), 'now');
    expect(s.last().state).toBe('full');
    const slotB = s.sync.worlds.find((w) => w.key === 'b')!.slot;
    await s.sync.remove(slotB);
    expect([...s.docs.keys()].some((k) => k.includes(`/worlds/${slotB}`))).toBe(false);
    await s.sync.offer(world('d', 100), 'now');
    expect(s.sync.worlds.find((w) => w.key === 'd')?.slot).toBe(slotB);
  });

  it('too big for the cloud: nothing written', async () => {
    const s = setup();
    await s.sync.setUser(user);
    await s.sync.offer(world('1', 1, JSON.stringify({ n: noise(CHUNK_BYTES * (MAX_CHUNKS + 1) * 2) })), 'now');
    expect(s.last().state).toBe('error');
    expect(s.docs.size).toBe(0);
  });

  it('signed out: nothing happens', async () => {
    const s = setup();
    await s.sync.offer(world('1', 1), 'now');
    expect(s.commits()).toBe(0);
  });
});
