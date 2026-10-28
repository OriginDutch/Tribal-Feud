/**
 * World generation: bot players with one village each, and barbarian villages, in a circle
 * around 500|500. Your village is in the middle, or (playerStart: random) anywhere among the bots.
 */
import { barbarianStartPoints, seedBarbarian } from './barbarians';
import { nextFloat, nextInt } from './rng';
import { BARBARIAN, nextId, type WorldState } from './state';
import { createVillage } from './village';

const CENTER = 500;

const NAME_A = ['Ald', 'Bran', 'Cor', 'Dirk', 'Ed', 'Fal', 'Gor', 'Hen', 'Ise', 'Jor', 'Kel', 'Lot', 'Mor', 'Nor', 'Os', 'Ra', 'Sig', 'Tor', 'Ul', 'Wil', 'Ys', 'Ger', 'Har', 'Lam'];
const NAME_B = ['ric', 'win', 'mund', 'bert', 'wald', 'helm', 'fried', 'mar', 'old', 'hard', 'win', 'gar', 'dan', 'ulf', 'mer', 'ard'];
const TITLES = ['', '', '', 'de Rode', 'de Stille', 'van het Woud', 'IJzerhand', 'de Jonge', 'de Oude', 'Bijlslag', 'de Wolf', 'van de Heide'];

function botName(state: WorldState): string {
  const a = NAME_A[nextInt(state.rng, 0, NAME_A.length - 1)] ?? 'Ald';
  const b = NAME_B[nextInt(state.rng, 0, NAME_B.length - 1)] ?? 'ric';
  const t = TITLES[nextInt(state.rng, 0, TITLES.length - 1)] ?? '';
  return t ? `${a}${b} ${t}` : `${a}${b}`;
}

const key = (x: number, y: number) => `${x}|${y}`;

export function generateMap(state: WorldState): void {
  const { config } = state;
  const existing = Object.values(state.villages);
  const total = existing.length + config.bots.count + config.map.barbarianCount;
  const radius = Math.sqrt(total / (Math.PI * config.map.density));

  // your village anywhere among the bots: not at the very edge, where you'd have fewer neighbours
  if (config.map.playerStart === 'random') {
    for (const v of existing) {
      if (v.owner === BARBARIAN) continue;
      const r = radius * 0.75 * Math.sqrt(nextFloat(state.rng));
      const angle = nextFloat(state.rng) * Math.PI * 2;
      v.x = Math.round(CENTER + r * Math.cos(angle));
      v.y = Math.round(CENTER + r * Math.sin(angle));
    }
  }
  const occupied = new Set(existing.map((v) => key(v.x, v.y)));
  const playerSpots = existing.filter((v) => v.owner !== BARBARIAN).map((v) => [v.x, v.y] as const);

  const randomSpot = (maxR: number): [number, number] => {
    const r = maxR * Math.sqrt(nextFloat(state.rng));
    const angle = nextFloat(state.rng) * Math.PI * 2;
    return [Math.round(CENTER + r * Math.cos(angle)), Math.round(CENTER + r * Math.sin(angle))];
  };

  const freeSpot = (maxR: number, minPlayerDist: number): [number, number] => {
    for (let tries = 0; ; tries++) {
      const r = maxR + Math.floor(tries / 200); // grow the circle if it is full
      const [x, y] = randomSpot(r);
      if (occupied.has(key(x, y))) continue;
      if (minPlayerDist > 0 && tries < 100) {
        const tooClose = playerSpots.some(([px, py]) => Math.hypot(px - x, py - y) < minPlayerDist);
        if (tooClose) continue;
      }
      occupied.add(key(x, y));
      return [x, y];
    }
  };

  for (let i = 0; i < config.bots.count; i++) {
    const id = state.players.length;
    const name = botName(state);
    state.players.push({ id, name, isBot: true });
    const [x, y] = freeSpot(radius * 0.9, config.map.minPlayerDistance);
    playerSpots.push([x, y]);
    const v = createVillage(config, nextId(state), id, `${name}s dorp`, x, y, state.time);
    state.villages[v.id] = v;
  }

  for (let i = 0; i < config.map.barbarianCount; i++) {
    const [x, y] = freeSpot(radius, 0);
    const v = createVillage(config, nextId(state), BARBARIAN, 'Barbarendorp', x, y, state.time);
    v.res = [0, 0, 0];
    const target = barbarianStartPoints(config, v, nextFloat(state.rng));
    seedBarbarian(config, v, target, state.time);
    state.villages[v.id] = v;
  }
}

/** A free field just outside the current edge of the world. */
export function edgeSpot(state: WorldState): [number, number] {
  const occupied = new Set<string>();
  let maxR = 0;
  for (const v of Object.values(state.villages)) {
    occupied.add(`${v.x}|${v.y}`);
    maxR = Math.max(maxR, Math.hypot(v.x - CENTER, v.y - CENTER));
  }
  for (let tries = 0; ; tries++) {
    const r = maxR + 1 + nextFloat(state.rng) * 3 + Math.floor(tries / 50);
    const angle = nextFloat(state.rng) * Math.PI * 2;
    const x = Math.round(CENTER + r * Math.cos(angle));
    const y = Math.round(CENTER + r * Math.sin(angle));
    if (!occupied.has(`${x}|${y}`)) return [x, y];
  }
}

/** Barbarian villages a restarted player finds around his new village. */
export const RESTART_BARBARIANS = 5;

/**
 * Where a player who lost everything starts over: like TW, in a gap at the outer ring of the
 * inhabited world, between other players, not beyond the last village of the map. Returns the
 * spot and puts a few small barbarian villages around it to start with.
 */
export function restartSpot(state: WorldState): [number, number] {
  const { config } = state;
  const all = Object.values(state.villages);
  const occupied = new Set(all.map((v) => key(v.x, v.y)));
  const players = all.filter((v) => v.owner !== BARBARIAN);
  const radii = players.map((v) => Math.hypot(v.x - CENTER, v.y - CENTER)).sort((a, b) => a - b);
  const ring = radii[Math.floor(radii.length * 0.9)] ?? 0;
  const minDist = Math.max(3, config.map.minPlayerDistance);
  let best: { x: number; y: number; score: number } | undefined;
  for (let i = 0; i < 80 && ring > 0; i++) {
    const r = ring * (0.8 + nextFloat(state.rng) * 0.25);
    const angle = nextFloat(state.rng) * Math.PI * 2;
    const x = Math.round(CENTER + r * Math.cos(angle));
    const y = Math.round(CENTER + r * Math.sin(angle));
    if (occupied.has(key(x, y))) continue;
    let nearestPlayer = Infinity, crowd = 0, neighbours = 0;
    for (const v of all) {
      const d = Math.hypot(v.x - x, v.y - y);
      if (d <= 6) crowd++;
      if (v.owner !== BARBARIAN) {
        nearestPlayer = Math.min(nearestPlayer, d);
        if (d <= 15) neighbours++;
      }
    }
    if (nearestPlayer < minDist) continue;
    // between players (a few within reach), with room around it for the starting barbarians
    const score = Math.min(neighbours, 4) * 3 - crowd - Math.max(0, nearestPlayer - 10);
    if (!best || score > best.score) best = { x, y, score };
  }
  const [x, y] = best ? [best.x, best.y] : edgeSpot(state);
  occupied.add(key(x, y));
  for (let n = 0, tries = 0; n < RESTART_BARBARIANS && tries < 200; tries++) {
    const r = 3 + nextFloat(state.rng) * 3;
    const angle = nextFloat(state.rng) * Math.PI * 2;
    const bx = Math.round(x + r * Math.cos(angle));
    const by = Math.round(y + r * Math.sin(angle));
    if (occupied.has(key(bx, by))) continue;
    occupied.add(key(bx, by));
    const v = createVillage(config, nextId(state), BARBARIAN, 'Barbarendorp', bx, by, state.time);
    v.res = [0, 0, 0];
    seedBarbarian(config, v, barbarianStartPoints(config, v, nextFloat(state.rng)), state.time);
    state.villages[v.id] = v;
    n++;
  }
  return [x, y];
}
