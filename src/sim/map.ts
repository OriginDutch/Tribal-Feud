/**
 * World generation: bot players with one village each, and barbarian villages,
 * in a circle around the human player's village at 500|500.
 */
import { seedBarbarian } from './barbarians';
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
    const target = nextInt(state.rng, config.barbarians.startPointsMin, config.barbarians.startPointsMax);
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
