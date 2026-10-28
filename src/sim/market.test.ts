import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { HOUR, MINUTE } from '../shared/time';
import { acceptOffer, balanceVillages, cancelOffer, createOffer, merchantsFree, merchantsTotal, sendResources, tradeTimeMs } from './market';
import { advance, setPaused } from './simulation';
import { BARBARIAN, HUMAN_ID, createWorld, invalidateOwners, playerVillage, villagesOf, type WorldState } from './state';
import { currentResources, type Village } from './village';
import { distance } from './movement';

function world(bots = 2) {
  const s = createWorld(createConfig('classic', 'Markt', 61, { bots: { count: bots } }));
  setPaused(s, false);
  const v = playerVillage(s);
  if (!v) throw new Error('no village');
  Object.assign(v.buildings, { main: 5, storage: 15, market: 5 });
  v.res = [20000, 20000, 20000];
  v.resAt = s.time;
  return { s, v };
}

function run(s: WorldState, ms: number): void {
  for (let left = ms; left > 0; left -= 10 * MINUTE) {
    const r = advance(s, Math.min(left, 10 * MINUTE));
    if (r.autoPaused) setPaused(s, false);
  }
}

function secondVillage(s: WorldState, v: Village): Village {
  const w = Object.values(s.villages)
    .filter((x) => x.owner === BARBARIAN)
    .sort((a, b) => distance(a, v) - distance(b, v))[0] as Village;
  w.owner = HUMAN_ID;
  delete w.growth;
  w.buildings.storage = Math.max(w.buildings.storage, 10);
  invalidateOwners(s);
  return w;
}

describe('market', () => {
  it('merchants carry 1000 each, walk 6 min per field and come back', () => {
    const { s, v } = world();
    const w = secondVillage(s, v);
    w.res = [0, 0, 0];
    w.resAt = s.time;
    expect(merchantsTotal(v)).toBe(5);
    expect(sendResources(s, v.id, w.id, [2500, 0, 0])).toBeNull();
    expect(merchantsFree(s, v)).toBe(2);
    expect(sendResources(s, v.id, w.id, [3000, 0, 0])).toBe('3 handelaren nodig, 2 beschikbaar.');
    const t = tradeTimeMs(s, v, w);
    expect(t).toBe(Math.round(distance(v, w) * 6 * MINUTE));
    run(s, t);
    expect(currentResources(s.config, w, s.time)[0]).toBeGreaterThanOrEqual(2500);
    run(s, t);
    expect(merchantsFree(s, v)).toBe(5);
  });

  it('offers set resources aside; taking one sends both sides; cancelling refunds', () => {
    const { s, v } = world();
    const bot = s.players.find((p) => p.isBot);
    const b = bot ? villagesOf(s, bot.id)[0] : undefined;
    if (!b) throw new Error('no bot');
    Object.assign(b.buildings, { main: 5, market: 5, storage: 15 });
    b.res = [0, 10000, 0];
    b.resAt = s.time;
    expect(createOffer(s, v.id, { res: 0, amount: 3000 }, { res: 1, amount: 2000 })).toBeNull();
    expect(Math.floor(currentResources(s.config, v, s.time)[0])).toBeLessThanOrEqual(17000 + 50);
    expect(merchantsFree(s, v)).toBe(2);
    const offer = s.offers?.[0];
    if (!offer) throw new Error('no offer');
    expect(acceptOffer(s, offer.id, b.id)).toBeNull();
    expect(s.offers).toHaveLength(0);
    expect(Object.values(s.movements).filter((m) => m.kind === 'trade')).toHaveLength(2);
    run(s, 2 * tradeTimeMs(s, v, b) + MINUTE);
    expect(currentResources(s.config, b, s.time)[0]).toBeGreaterThanOrEqual(3000);
    // cancel
    expect(createOffer(s, v.id, { res: 2, amount: 1000 }, { res: 0, amount: 5000 })).toBeNull();
    const before = currentResources(s.config, v, s.time)[2];
    const id = s.offers?.find((o) => o.owner === HUMAN_ID)?.id ?? -1;
    expect(cancelOffer(s, id, HUMAN_ID)).toBeNull();
    expect(currentResources(s.config, v, s.time)[2]).toBeGreaterThanOrEqual(before + 1000);
  });

  it('balancing moves resources from full villages to empty ones', () => {
    const { s, v } = world();
    const w = secondVillage(s, v);
    Object.assign(w.buildings, { storage: 15 });
    w.res = [0, 0, 0];
    w.resAt = s.time;
    expect(balanceVillages(s, HUMAN_ID)).toBeGreaterThan(0);
    run(s, 2 * HOUR);
    const r = currentResources(s.config, w, s.time);
    expect(r[0]).toBeGreaterThan(1000);
  });

  it('bots take a fair offer of what they lack and post their own surplus', () => {
    const { s, v } = world(12);
    const near = s.players.filter((p) => p.isBot).flatMap((p) => villagesOf(s, p.id));
    const b = near.sort((a, c) => distance(a, v) - distance(c, v))[0];
    if (!b) throw new Error('no bot');
    expect(distance(b, v)).toBeLessThanOrEqual(40);
    Object.assign(b.buildings, { main: 5, market: 10, storage: 20 });
    b.res = [500, 30000, 9000];
    b.resAt = s.time;
    // a greedy offer is ignored, a fair one is taken
    expect(createOffer(s, v.id, { res: 0, amount: 1000 }, { res: 1, amount: 3000 })).toBeNull();
    expect(createOffer(s, v.id, { res: 0, amount: 3000 }, { res: 1, amount: 3000 })).toBeNull();
    run(s, 12 * HOUR);
    const mine = (s.offers ?? []).filter((o) => o.owner === HUMAN_ID);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.want.amount).toBe(3000);
    // still heavy on clay: it puts some up itself
    expect((s.offers ?? []).some((o) => o.villageId === b.id && o.give.res === 1)).toBe(true);
  });
});
