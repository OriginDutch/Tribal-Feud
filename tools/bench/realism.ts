/**
 * Realism measurement: npm run realism -- <bots> <barbarians> <days> [worldSpeed] [difficulty]
 * Classifies every attack on a player as it lands, and follows wars and conquests per day.
 *
 * Attack classes (a bot attacking a player):
 *   scout     only scouts
 *   conquest  carries a nobleman
 *   war       the tribes are at war
 *   revenge   the attacker holds a grudge (>= 0.5) against the defender
 *   farm      a small group (under 10% of the attacking village's army) at a player
 *   joint     part of a tribe operation (several members landing together; part b)
 *   none      none of the above: no clear reason
 * provocation: the attacker is clearly outclassed by the defender (should be ~0)
 */
import { createConfig } from '../../src/shared/config';
import { DAY, HOUR } from '../../src/shared/time';
import { advance } from '../../src/sim/simulation';
import { BARBARIAN, createWorld, villagesOf, type WorldState } from '../../src/sim/state';
import { loyaltyNow, setAttackHook, type Movement } from '../../src/sim/movement';
import { relationBetween, tribeOf } from '../../src/sim/tribes';
import { grudge } from '../../src/sim/botReact';
import { outclassed } from '../../src/sim/warCause';
import { defenseOf } from '../../src/sim/botStrategy';
import type { Village } from '../../src/sim/village';

const bots = Number(process.argv[2] ?? 200), barbs = Number(process.argv[3] ?? 3000), days = Number(process.argv[4] ?? 7);
const speed = Number(process.argv[5] ?? 20), difficulty = process.argv[6] ?? 'normal';
const s = createWorld(createConfig('classic', 'Realism', 11, { worldSpeed: speed, bots: { count: bots, difficulty }, map: { barbarianCount: barbs }, ...(process.env.EXTRA ? JSON.parse(process.env.EXTRA) : {}) } as never));

type Cls = 'scout' | 'conquest' | 'war' | 'revenge' | 'farm' | 'joint' | 'none';
const total: Record<Cls, number> = { scout: 0, conquest: 0, war: 0, revenge: 0, farm: 0, joint: 0, none: 0 };
let day: Record<Cls, number> = { ...total };
let provocations = 0;
const provBy: Record<string, number> = {};
const nobleTargets = new Map<number, number>(); // village -> noble attacks on it
let nobleAttacks = 0;
// per war (tribe pair): which members of each side attacked the other today
const warAttackers = new Map<string, Set<number>>();

const armyOf = (v: Village) => ['axe', 'light', 'marcher', 'heavy', 'ram', 'spear', 'sword'].reduce((n, u) => n + v.units[u as 'axe'] + v.outside[u as 'axe'], 0);

const nobleOutcome: Record<string, number> = {};
const warPairs: Record<string, number> = {};
const nobleDef: Record<string, number> = {};
const loyBefore = new Map<number, number>();
const conqAt: Record<string, number> = {};
const afterOwn: Record<string, number> = {};
const hitsOn = new Map<number, number>();
const perConq: Record<string, number> = {};
const restAt: Record<string, number> = {};
const firstLoy: Record<string, number> = {};
const ownerBefore = new Map<number, number>();
const clearInfo = new Map<number, { scouted: number; now: number; supported: boolean }>();
const clearOut: { won: boolean; ratio: number; supported: boolean }[] = [];
setAttackHook((state: WorldState, m: Movement, target: Village, after?: { won: boolean; conquered: boolean; loyalty?: number }) => {
  if (after && clearInfo.has(m.id)) {
    const c = clearInfo.get(m.id)!; clearInfo.delete(m.id);
    clearOut.push({ won: after.won, ratio: c.now / Math.max(1, c.scouted), supported: c.supported });
  }
  if (after) {
    if ((m.units.snob ?? 0) > 0) {
      const k = after.conquered ? 'veroverd' : !after.won ? 'gevecht verloren' : after.loyalty !== undefined ? `loyaliteit ${after.loyalty <= 25 ? '≤25' : after.loyalty <= 60 ? '26-60' : '>60'}` : (ownerBefore.has(m.id) ? ownerBefore.get(m.id) : m.owner) === m.owner ? 'eigen dorp al' : 'gewonnen, edel gesneuveld';
      const ob = ownerBefore.has(m.id) ? ownerBefore.get(m.id) : m.owner;
      const who = ob === BARBARIAN ? 'barb' : ob === m.owner ? 'al eigen' : m.op !== undefined ? 'operatie' : m.train !== undefined ? 'eigen trein' : 'speler los';
      ownerBefore.delete(m.id);
      const lb = loyBefore.get(m.id); loyBefore.delete(m.id);
      const kind = m.op !== undefined ? 'op' : m.train !== undefined ? 'trein' : 'los';
      if (after.conquered) { const b = lb === undefined ? '?' : lb >= 99.5 ? '100 (1 edel!)' : lb > 60 ? '61-99' : lb > 35 ? '36-60' : '≤35'; const k2 = `${ob === BARBARIAN ? 'barb' : 'speler'} ${kind}: loyaliteit vóór laatste edel ${b}`; conqAt[k2] = (conqAt[k2] ?? 0) + 1; }
      if (ob !== m.owner && lb !== undefined) {
        if (lb >= 99.5) hitsOn.set(target.id, 0);
        if (!hitsOn.has(target.id)) { const fb = lb > 75 ? '76-99' : lb > 50 ? '51-75' : '≤50'; firstLoy[fb] = (firstLoy[fb] ?? 0) + 1; hitsOn.set(target.id, 0); }
        hitsOn.set(target.id, hitsOn.get(target.id)! + 1);
        if (after.conquered) { const rest = Object.values(state.movements).filter((x) => x.id !== m.id && x.kind === 'attack' && x.to === target.id && x.owner === m.owner && (x.units.snob ?? 0) > 0); const sameTime = rest.filter((x) => x.arrives === m.arrives).length; const k5 = `${ob === BARBARIAN ? 'barb' : 'speler'}: nog ${rest.length} onderweg (${sameTime} tegelijk, ${rest.length - sameTime} later)`; restAt[k5] = (restAt[k5] ?? 0) + 1;
          const k4 = `${ob === BARBARIAN ? 'barb' : 'speler'} ${hitsOn.get(target.id)} edels`; perConq[k4] = (perConq[k4] ?? 0) + 1; hitsOn.delete(target.id); }
      }
      if (ob === m.owner) { const k3 = `${kind}`; afterOwn[k3] = (afterOwn[k3] ?? 0) + 1; }
      nobleOutcome[`${who}: ${k}`] = (nobleOutcome[`${who}: ${k}`] ?? 0) + 1;
    }
    return;
  }
  if ((m.units.snob ?? 0) > 0) { ownerBefore.set(m.id, target.owner); loyBefore.set(m.id, loyaltyNow(state.config, target, state.time)); }
  if ((m.units.snob ?? 0) > 0 && target.owner >= 0 && target.owner !== m.owner) {
    const own = Object.values(target.units).reduce((a, b) => a + b, 0);
    const sup = Object.values(target.support ?? {}).reduce((a, s) => a + Object.values(s).reduce((x, y) => x + (y ?? 0), 0), 0);
    const esc = Object.entries(m.units).filter(([u]) => u !== 'snob').reduce((a, [, n]) => a + (n ?? 0), 0);
    const k = `${m.train !== undefined ? 'trein' : 'los'} eigen:${own === 0 ? '0' : own < 100 ? '<100' : own < 1000 ? '<1k' : '1k+'} sup:${sup === 0 ? '0' : sup < 1000 ? '<1k' : '1k+'} escort:${esc < 50 ? '<50' : esc < 500 ? '<500' : '500+'}`;
    nobleDef[k] = (nobleDef[k] ?? 0) + 1;
  }
  if (m.train !== undefined && !(m.units.snob ?? 0) && target.owner >= 0 && target.owner !== m.owner) {
    const sc = state.players[m.owner]?.bot?.scouted?.[target.id];
    const present: Record<string, number> = { ...target.units };
    for (const sup of Object.values(target.support ?? {})) for (const [u, n] of Object.entries(sup)) present[u] = (present[u] ?? 0) + (n ?? 0);
    clearInfo.set(m.id, { scouted: sc?.def ?? 0, now: defenseOf(state, present as never, target.buildings.wall), supported: Object.keys(target.support ?? {}).length > 0 });
  }
  if (target.owner === BARBARIAN || target.owner < 0 || !state.players[m.owner]?.bot) return;
  const from = state.villages[m.from];
  const units = Object.entries(m.units).filter(([, n]) => n);
  const size = units.reduce((n, [u, k]) => n + (u === 'spy' ? 0 : k!), 0);
  let c: Cls;
  if (size === 0) c = 'scout';
  else if ((m.units.snob ?? 0) > 0) c = 'conquest';
  else if ((m as Movement & { op?: number }).op !== undefined) c = 'joint';
  else if (relationBetween(state, m.owner, target.owner) === 'war') c = 'war';
  else if (grudge(state, state.players[m.owner]!, target.owner) >= 0.5) c = 'revenge';
  else if (from && size < 0.1 * Math.max(1, armyOf(from) + size)) c = 'farm';
  else c = 'none';
  total[c]++; day[c]++;
  if (c === 'war') { const ta = tribeOf(state, m.owner), tb = tribeOf(state, target.owner); const k = `${ta?.tag}>${tb?.tag} ${state.players[m.owner]?.name}`; warPairs[k] = (warPairs[k] ?? 0) + 1; }
  if (c !== 'scout' && outclassed(state, m.owner, target.owner)) { provocations++; provBy[c] = (provBy[c] ?? 0) + 1; }
  if (c === 'conquest') { nobleAttacks++; nobleTargets.set(target.id, (nobleTargets.get(target.id) ?? 0) + 1); }
  if (c !== 'scout' && relationBetween(state, m.owner, target.owner) === 'war') {
    const ta = tribeOf(state, m.owner)!, tb = tribeOf(state, target.owner)!;
    const key = `${ta.id}>${tb.id}`;
    if (!warAttackers.has(key)) warAttackers.set(key, new Set());
    warAttackers.get(key)!.add(m.owner);
  }
});

const warStart = new Map<string, number>();
const ended: number[] = [];
const t0 = performance.now();
const newsSeen = new Set<string>();
const newsCount: Record<string, number> = {};
const NEWS: [string, RegExp][] = [['vredesverdrag', /^Vrede tussen/], ['ally helpt', /te hulp tegen/], ['ally koelt af', /bondgenootschap .* om naar een NAP/], ['verdrag opgezegd', /zegt het verdrag .* op/], ['verdrag gebroken', /vredesverdrag .* gebroken/], ['weigeraar eruit', /weigert .* uit de stam/], ['weigeraar: doorvechten', /weigert .* vecht door/], ['nieuwe leider', /neemt de leiding over/]];
const countNews = () => { for (const n of s.tribeNews ?? []) { const k = `${n.time}|${n.text}`; if (newsSeen.has(k)) continue; newsSeen.add(k); for (const [name, re] of NEWS) if (re.test(n.text)) newsCount[name] = (newsCount[name] ?? 0) + 1; } };
for (let d = 1; d <= days; d++) {
  warAttackers.clear();
  const end = d * DAY;
  while (s.time < end) { s.paused = false; advance(s, Math.min(HOUR, end - s.time)); countNews(); }
  // wars now
  const now = new Set<string>();
  for (const t of Object.values(s.tribes ?? {})) for (const [o, r] of Object.entries(t.relations)) {
    if (r !== 'war' || t.id > Number(o)) continue;
    const k = `${t.id}-${o}`; now.add(k);
    if (!warStart.has(k)) warStart.set(k, t.since?.[Number(o)] ?? s.time);
  }
  for (const [k, at] of warStart) if (!now.has(k)) { ended.push((s.time - at) / HOUR); warStart.delete(k); }
  // participation: share of members of a warring tribe that hit the enemy today
  let shares: number[] = [];
  for (const k of now) {
    const [a, b] = k.split('-').map(Number) as [number, number];
    for (const [x, y] of [[a, b], [b, a]] as const) {
      const t = s.tribes?.[x]; if (!t) continue;
      const hit = warAttackers.get(`${x}>${y}`)?.size ?? 0;
      shares.push(hit / Math.max(1, t.members.length));
    }
  }
  const part = shares.length ? Math.round((shares.reduce((p, q) => p + q, 0) / shares.length) * 100) : 0;
  const tribes = Object.keys(s.tribes ?? {}).length;
  const pvp = (Object.keys(day) as Cls[]).filter((k) => k !== 'scout').reduce((n, k) => n + day[k], 0);
  const pct = (k: Cls) => (pvp ? Math.round((day[k] / pvp) * 100) : 0);
  const ws = s.worldStats?.days.find((x) => x.day === d - 1);
  const top = Math.max(...s.players.filter((p) => p.bot).map((p) => villagesOf(s, p.id).length));
  console.log(`dag ${d}: aanvallen op spelers ${pvp} (verkenningen ${day.scout}) · oorlog ${pct('war')}% · gezamenlijk ${pct('joint')}% · verovering ${pct('conquest')}% · wraak ${pct('revenge')}% · farm ${pct('farm')}% · GEEN REDEN ${pct('none')}% · provocaties ${provocations} · oorlogen ${now.size}/${tribes} stammen · deelname ${part}% · veroverd ${ws?.conquestsPvp ?? 0}+${ws?.conquestsBarb ?? 0}b · grootste ${top}`);
  day = { scout: 0, conquest: 0, war: 0, revenge: 0, farm: 0, joint: 0, none: 0 };
}
const taken = new Set((s.worldStats?.conquests ?? []).map((x) => x.village));
const hit = [...nobleTargets.keys()];
{
  const lost = clearOut.filter((c) => !c.won), won = clearOut.filter((c) => c.won);
  const med = (a: number[]) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? 0;
  console.log(`clears op spelers: ${won.length} gewonnen (verdediging bij aankomst / bij verkenning: mediaan ${med(won.map((c) => c.ratio)).toFixed(2)}×), ${lost.length} verloren (mediaan ${med(lost.map((c) => c.ratio)).toFixed(2)}×, met ondersteuning in het dorp: ${lost.filter((c) => c.supported).length})`);
}
console.log(`edels nodig per verovering (sinds loyaliteit 100): ${JSON.stringify(perConq)} · eerste treffer niet op 100: ${JSON.stringify(firstLoy)}`);
console.log(`bij verovering nog eigen edels onderweg: ${JSON.stringify(restAt)}`);
console.log(`veroveringen: ${JSON.stringify(conqAt)}`);
console.log(`edels die in al eigen dorp landen, per soort: ${JSON.stringify(afterOwn)}`);
console.log(`edel bij aankomst: ${JSON.stringify(nobleDef)}`);
{
  const { tribeStrength } = await import('../../src/sim/warCause');
  const rows: string[] = [];
  for (const t of Object.values(s.tribes ?? {})) for (const [o, r] of Object.entries(t.relations)) {
    if (r !== 'war' || t.id > Number(o)) continue;
    const u = s.tribes![Number(o)]!;
    const a = tribeStrength(s, t), b = tribeStrength(s, u);
    rows.push(`[${t.tag}]-[${u.tag}] kracht ${(Math.max(a, b) / Math.max(1, Math.min(a, b))).toFixed(2)}x, ${Math.round((s.time - (t.since?.[u.id] ?? s.time)) / HOUR)} u`);
  }
  console.log(`oorlogen: ${rows.join(' | ')}`);
}
console.log(`oorlogsaanvallen top: ${Object.entries(warPairs).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k}: ${n}`).join(' | ')}`);
console.log(`stamnieuws: ${JSON.stringify(newsCount)} · bondgenootschappen nu ${Object.values(s.tribes ?? {}).reduce((n, t) => n + Object.values(t.relations).filter((r) => r === 'ally').length, 0) / 2}`);
console.log(`uitkomst edelaanvallen (ook barbaren): ${JSON.stringify(nobleOutcome)}`);
console.log(`edelaanvallen op spelers: ${nobleAttacks} op ${hit.length} dorpen, waarvan ${hit.filter((id) => taken.has(id)).length} veroverd · provocaties per soort: ${JSON.stringify(provBy)}`);
const avgEnded = ended.length ? (ended.reduce((a, b) => a + b, 0) / ended.length).toFixed(0) : '-';
const running = [...warStart.values()].map((at) => (s.time - at) / HOUR);
console.log(`oorlogen beëindigd: ${ended.length} (gem. ${avgEnded} speluren) · nog bezig: ${running.length} (gem. ${running.length ? (running.reduce((a, b) => a + b, 0) / running.length).toFixed(0) : '-'} speluren) · klaar in ${((performance.now() - t0) / 1000).toFixed(0)} s`);
