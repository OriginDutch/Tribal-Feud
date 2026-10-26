/**
 * Equivalence check for sim refactors: runs worlds and writes the full state (minus the event
 * queue and log, which may legitimately differ) at checkpoints. Run before and after a change,
 * then compare the files.  npm run fingerprint -- <outDir>
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { createConfig } from '../../src/shared/config';
import { HOUR } from '../../src/shared/time';
import { advance } from '../../src/sim/simulation';
import { fromSaveData } from '../../src/sim/save';
import { createWorld, type WorldState } from '../../src/sim/state';
import * as village from '../../src/sim/village';

const out = process.argv[2] ?? '/tmp/fp';
mkdirSync(out, { recursive: true });

/** Bring every village up to date (only exists after the lazy-recruit refactor). */
function settleAll(s: WorldState): void {
  const fn = (village as unknown as { settleRecruits?: (s: WorldState, v: unknown) => void }).settleRecruits;
  if (fn) for (const v of Object.values(s.villages)) fn(s, v);
}

function dump(s: WorldState): string {
  settleAll(s);
  const { queue: _q, log: _l, ...rest } = s as WorldState & Record<string, unknown>;
  void _q; void _l;
  return JSON.stringify(rest);
}

function run(name: string, s: WorldState, hours: number, every: number): void {
  const lines: string[] = [];
  for (let h = 1; h <= hours; h++) {
    const end = s.time + HOUR;
    while (s.time < end) { s.paused = false; s.speed = 1 as never; advance(s, end - s.time); }
    if (h % every === 0) {
      const d = dump(s);
      writeFileSync(`${out}/${name}-h${h}.json`, d);
      lines.push(`${name} h${h} ${createHash('sha1').update(d).digest('hex').slice(0, 12)}`);
    }
  }
  console.log(lines.join('\n'));
}

const t0 = performance.now();
run('small20', createWorld(createConfig('classic', 'FP', 101, { worldSpeed: 20, bots: { count: 40 }, map: { barbarianCount: 600 } } as never)), 48, 6);
run('mid1', createWorld(createConfig('classic', 'FP', 202, { bots: { count: 120 }, map: { barbarianCount: 2000 } } as never)), 96, 12);
run('war20', createWorld(createConfig('classic', 'FP', 303, { worldSpeed: 20, unitSpeed: 2, bots: { count: 80 }, map: { barbarianCount: 900 }, conquest: { protectionDays: 0 } } as never)), 36, 6);
try {
  const raw = JSON.parse(readFileSync('/mnt/user-data/uploads/59a62fe2-tribal-feud-saves.json', 'utf8'));
  run('marcel', fromSaveData(raw[0].data), 12, 3);
} catch (e) { console.log('marcel save skipped', (e as Error).message); }
console.log(`klaar in ${((performance.now() - t0) / 1000).toFixed(0)} s`);
