import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { DAY } from '../shared/time';
import { attemptCoup, coupChance, coupView } from './coup';
import { RECRUIT_DAYS } from './ranks';
import { HUMAN_ID, createWorld, villagesOf, type WorldState } from './state';
import { isOutlaw } from './talks';
import { found, join } from './tribes';

function world(): WorldState {
  return createWorld(createConfig('classic', 'C', 61, { worldSpeed: 1, bots: { tiers: { pro: 1, mid: 0 }, count: 20 } } as never));
}
function tribe(s: WorldState) {
  const bots = s.players.filter((p) => p.bot && villagesOf(s, p.id).length).slice(0, 5);
  const t = found(s, bots[0]!);
  for (const b of bots.slice(1)) join(s, t, b);
  join(s, t, s.players[HUMAN_ID]!);
  return { t, lead: bots[0]!, mates: bots.slice(1) };
}

describe('machtsgreep', () => {
  it('not as a recruit; then the chance rises with discontent', () => {
    const s = world();
    const { t, mates } = tribe(s);
    expect(coupView(s)?.blocker).toMatch(/rekruut/);
    s.time += RECRUIT_DAYS * DAY + 1;
    for (const m of mates) m.bot!.mood = 70;
    const calm = coupChance(s, t).chance;
    for (const m of mates) m.bot!.mood = 10;
    const angry = coupChance(s, t).chance;
    expect(angry).toBeGreaterThan(calm + 0.3);
  });

  it('it works: you lead, the old leader is out with a grudge; a bot that liked him may follow him', () => {
    const s = world();
    const { t, lead, mates } = tribe(s);
    s.time += RECRUIT_DAYS * DAY + 1;
    for (const m of mates) m.bot!.mood = 0;
    expect(attemptCoup(s, 0)).toBeNull();
    expect(t.leader).toBe(HUMAN_ID);
    expect(t.members).not.toContain(lead.id);
    expect(lead.bot!.grudges?.[HUMAN_ID]?.why).toBe('machtsgreep');
    expect(s.news?.some((n) => n.kind === 'leader' && n.players?.includes(HUMAN_ID))).toBe(true);
  });

  it('it fails: out and an outlaw', () => {
    const s = world();
    const { t, lead } = tribe(s);
    s.time += RECRUIT_DAYS * DAY + 1;
    expect(attemptCoup(s, 1)).toBeNull();
    expect(t.leader).toBe(lead.id);
    expect(t.members).not.toContain(HUMAN_ID);
    expect(isOutlaw(s, HUMAN_ID)).toBe(true);
    expect(lead.bot!.grudges?.[HUMAN_ID]?.why).toBe('machtsgreep');
  });
});
