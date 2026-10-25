import { it } from 'vitest';
import { appendFileSync } from 'node:fs';
import { createConfig } from '../shared/config';
import { ARCHETYPE_NAMES } from '../shared/botProfiles';
import { createWorld, villagesOf, BARBARIAN } from './state';
import { advance, setPaused } from './simulation';
const SEED = Number(process.env.SEED ?? 4);
const DAYS = (process.env.DAYS ?? '2,3,3.5').split(',').map(Number);
const FILE = process.env.OUT ?? '/tmp/dist.txt';
it('t', () => {
  const out = (l: string) => appendFileSync(FILE, l + '\n');
  const s = createWorld(createConfig('classic', 'x', SEED, { worldSpeed: 20, productionMultiplier: 1 }));
  setPaused(s, false);
  const H = 3600000;
  const bots = s.players.filter((p) => p.isBot);
  let t0 = performance.now();
  for (const day of DAYS) {
    while (s.time < day * 24 * H) { advance(s, H / 4); setPaused(s, false); }
    const counts = bots.map((p) => villagesOf(s, p.id).length).sort((a, b) => a - b);
    const q = (f: number) => counts[Math.floor(f * (counts.length - 1))];
    const barbs = Object.values(s.villages).filter((v) => v.owner === BARBARIAN).length;
    const humanAttacks = s.reports.filter((r) => r.defense).length;
    out(`seed ${SEED} day ${day}: villages ${counts.reduce((a, b) => a + b, 0)} · p10 ${q(0.1)} med ${q(0.5)} p90 ${q(0.9)} max ${q(1)} · one-village bots ${counts.filter((c) => c === 1).length} · barbs ${barbs} · attacks on you ${humanAttacks} · ${((performance.now() - t0) / 1000).toFixed(0)}s`);
    const byArch: Record<string, number[]> = {};
    for (const p of bots) (byArch[ARCHETYPE_NAMES[p.bot!.archetype]] ??= []).push(villagesOf(s, p.id).length);
    out('   ' + Object.entries(byArch).map(([k, l]) => `${k} ${(l.reduce((a, b) => a + b, 0) / l.length).toFixed(1)}`).join(', '));
    t0 = performance.now();
  }
}, 30000000);
