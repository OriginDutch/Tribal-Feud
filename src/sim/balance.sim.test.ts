import { it } from 'vitest';
import { appendFileSync } from 'node:fs';
import { DIFFICULTIES, createConfig } from '../shared/config';
import { ARCHETYPE_NAMES } from '../shared/botProfiles';
import { createWorld, villagesOf, BARBARIAN } from './state';
import { advance, setPaused } from './simulation';
import { villagePoints } from './barbarians';
import { push } from './eventQueue';
const SEED = Number(process.env.SEED ?? 4);
const DAYS = (process.env.DAYS ?? '2,3,3.5').split(',').map(Number);
const FILE = process.env.OUT ?? '/tmp/dist.txt';
it('t', () => {
  const out = (l: string) => appendFileSync(FILE, l + '\n');
  const difficulty = (process.env.DIFF ?? 'hard') as 'easy' | 'normal' | 'hard';
  // tuning: DIFFDEF='{"turnRate":0.5,"villagesPerTurn":3,"conquestCooldownHours":48}'
  if (process.env.DIFFDEF) Object.assign(DIFFICULTIES[difficulty], JSON.parse(process.env.DIFFDEF));
  const label = (process.env.DIFFDEF ? `${difficulty} ${process.env.DIFFDEF}` : difficulty) + (process.env.REF ? ` ref${process.env.REF}m` : '');
  const s = createWorld(createConfig('classic', 'x', SEED, { worldSpeed: 20, productionMultiplier: 1, bots: { difficulty } }));
  setPaused(s, false);
  const H = 3600000;
  // REF=<game minutes>: the human plays as a reference player (account manager + farm
  // assistant, checking in every REF game minutes, all villages at once)
  const REF = process.env.REF ? Number(process.env.REF) : 0;
  if (REF > 0) {
    const human = s.players[0]!;
    human.bot = { archetype: (process.env.REFTYPE ?? 'farmer') as 'farmer', activity: 1, nextTurn: 0, farmLog: {}, outgoing: [], reference: { interval: REF * 60000 } };
    push(s.queue, 0, { kind: 'botTurn', playerId: 0 });
  }
  const bots = s.players.filter((p) => p.isBot);
  let t0 = performance.now();
  let attacksOnYou = 0;
  let lastReport = 0;
  // ping-pong check: villages that change hands again soon after a conquest
  const owners = new Map<number, number>(Object.values(s.villages).map((v) => [v.id, v.owner]));
  const takenAt = new Map<number, number>();
  let flips = 0;
  let quickFlips = 0;
  for (const day of DAYS) {
    while (s.time < day * 24 * H) {
      advance(s, H / 4);
      setPaused(s, false);
      for (const r of s.reports) if (r.id > lastReport && r.defense) attacksOnYou++;
      for (const v of Object.values(s.villages)) {
        const before = owners.get(v.id);
        if (before === v.owner) continue;
        owners.set(v.id, v.owner);
        if (before === undefined || v.owner < 0) continue;
        if (before < 0) {
          takenAt.set(v.id, s.time);
          continue;
        }
        flips++;
        const at = takenAt.get(v.id);
        if (at !== undefined && s.time - at < 6 * H) quickFlips++;
        takenAt.set(v.id, s.time);
      }
      lastReport = s.reports.at(-1)?.id ?? lastReport;
    }
    const counts = bots.map((p) => villagesOf(s, p.id).length).sort((a, b) => a - b);
    const q = (f: number) => counts[Math.floor(f * (counts.length - 1))];
    const barbs = Object.values(s.villages).filter((v) => v.owner === BARBARIAN).length;
    const humanAttacks = attacksOnYou;
    const pts = bots.map((p) => villagesOf(s, p.id).reduce((a, v) => a + villagePoints(s.config, v), 0)).sort((a, b) => a - b);
    const conqueredPlayers = s.conquests?.player ?? 0;
    out(`${label} seed ${SEED} day ${day}: villages ${counts.reduce((a, b) => a + b, 0)} · p10 ${q(0.1)} med ${q(0.5)} p90 ${q(0.9)} max ${q(1)} · one-village bots ${counts.filter((c) => c === 1).length} · barbs ${barbs} · attacks on you ${humanAttacks} · your villages ${villagesOf(s, 0).length} (${villagesOf(s, 0).reduce((a, v) => a + villagePoints(s.config, v), 0)} p) · player villages taken ${conqueredPlayers} (of which retaken within 6h ${quickFlips}/${flips}) · points med ${pts[100]} top ${pts[199]} · ${((performance.now() - t0) / 1000).toFixed(0)}s`);
    const byArch: Record<string, number[]> = {};
    for (const p of bots) (byArch[ARCHETYPE_NAMES[p.bot!.archetype]] ??= []).push(villagesOf(s, p.id).length);
    out('   ' + Object.entries(byArch).map(([k, l]) => `${k} ${(l.reduce((a, b) => a + b, 0) / l.length).toFixed(1)}`).join(', '));
    t0 = performance.now();
  }
}, 30000000);
