/**
 * Allies (part c of "real wars"): nothing is required, but an ally that never helps in your war
 * is worth less. Every tribe keeps a trust per ally (0..100, starts at 60):
 *   - while it is at war and the ally is not fighting that enemy, trust slowly drops
 *   - help counts: the ally's attacks on the enemy, its support in your villages, joining the war
 *   - without a war it slowly settles back to 60
 * Under 30 a bot tribe turns the alliance into a NAP; a NAP is ended when trust stays under 10.
 * A bot ally may also come to help: it declares war on the enemy (chance by how social its
 * leader is and whether it can stand up to that enemy).
 * You: as leader of your tribe you decide about your own alliances (you see the trust both
 * ways); a bot ally of yours can cool down on you too if you never help.
 */
import { HUMAN_ID, addLog, type WorldState } from './state';
import { nextFloat } from './rng';
import type { Tribe } from './tribes';

const START = 60;
/** Trust lost per diplomacy tick (90 game minutes) per unhelped war. */
const NEGLECT = 1.5;
/** Most a tick of help can add. */
const MAX_GAIN = 6;
const COOL = 30;
const BREAK = 10;

export function trustIn(t: Tribe, other: number): number {
  return t.allyTrust?.[other] ?? START;
}

function setTrust(t: Tribe, other: number, v: number): void {
  (t.allyTrust ??= {})[other] = Math.max(0, Math.min(100, v));
}

/** The tribes that `t` is at war with. */
const warsOf = (t: Tribe) => Object.entries(t.relations).filter(([, r]) => r === 'war').map(([id]) => Number(id));

/**
 * Help from `helper` (a player) against `enemy` (a player): every tribe that is at war with the
 * enemy's tribe and allied to the helper's tribe notes it.
 */
export function creditAllyAttack(state: WorldState, helper: number, enemy: number): void {
  const tx = tribeOfId(state, helper), te = tribeOfId(state, enemy);
  if (!tx || !te || tx.id === te.id) return;
  for (const [id, rel] of Object.entries(tx.relations)) {
    if (rel !== 'ally') continue;
    const ally = state.tribes?.[Number(id)];
    if (ally && ally.relations[te.id] === 'war') (ally.allyHelp ??= {})[tx.id] = (ally.allyHelp[tx.id] ?? 0) + 0.5;
  }
}

/** Support that arrived in a village of `host` from `helper`: counts if the host's tribe is at war. */
export function creditAllySupport(state: WorldState, helper: number, host: number): void {
  const tx = tribeOfId(state, helper), th = tribeOfId(state, host);
  if (!tx || !th || tx.id === th.id || th.relations[tx.id] !== 'ally' || !warsOf(th).length) return;
  (th.allyHelp ??= {})[tx.id] = (th.allyHelp[tx.id] ?? 0) + 1.5;
}

function tribeOfId(state: WorldState, player: number): Tribe | undefined {
  const id = player >= 0 ? state.players[player]?.tribe : undefined;
  return id !== undefined ? state.tribes?.[id] : undefined;
}

export interface AllyHooks {
  strength: (t: Tribe) => number;
  social: (t: Tribe) => number;
  declareWar: (by: Tribe, on: Tribe) => void;
  setRelation: (a: Tribe, b: Tribe, rel: 'nap' | null) => void;
  news: (text: string) => void;
}

/** Diplomacy tick for one alliance, both ways. */
export function allianceTick(state: WorldState, a: Tribe, b: Tribe, hooks: AllyHooks): void {
  for (const [me, ally] of [[a, b], [b, a]] as const) {
    // allies, and NAPs that used to be an alliance (they can still lose the last of their trust)
    const rel = me.relations[ally.id];
    if (rel !== 'ally' && !(rel === 'nap' && me.allyTrust?.[ally.id] !== undefined)) continue;
    const unhelped = warsOf(me).filter((e) => ally.relations[e] !== 'war' && ally.relations[e] !== 'ally');
    const help = me.allyHelp?.[ally.id] ?? 0;
    if (me.allyHelp) delete me.allyHelp[ally.id];
    let trust = trustIn(me, ally.id);
    if (unhelped.length) trust -= NEGLECT * unhelped.length;
    else if (!warsOf(me).length) trust += (START - trust) * 0.03;
    trust += Math.min(MAX_GAIN, help);
    setTrust(me, ally.id, trust);

    // a bot ally may come to help: it joins the war against one enemy it can stand up to
    if (me.relations[ally.id] === 'ally' && ally.leader !== HUMAN_ID && unhelped.length) {
      const enemy = state.tribes?.[unhelped[0]!];
      if (enemy && ally.relations[enemy.id] !== 'nap' && hooks.strength(ally) * 2 >= hooks.strength(enemy) && nextFloat(state.rng) < 0.08 * hooks.social(ally)) {
        hooks.declareWar(ally, enemy);
        setTrust(me, ally.id, trustIn(me, ally.id) + 15);
        hooks.news(`[${ally.tag}] komt bondgenoot [${me.tag}] te hulp tegen [${enemy.tag}].`);
      }
    }
  }
  // a bot tribe that lost faith: alliance becomes a NAP, a NAP without any trust ends
  for (const [me, ally] of [[a, b], [b, a]] as const) {
    if (me.leader === HUMAN_ID) continue; // you decide yourself
    const rel = me.relations[ally.id];
    const trust = trustIn(me, ally.id);
    if (rel === 'ally' && trust < COOL) {
      hooks.setRelation(me, ally, 'nap');
      hooks.news(`[${me.tag}] zet het bondgenootschap met [${ally.tag}] om naar een NAP: geen hulp in de oorlog.`);
      if (ally.members.includes(HUMAN_ID)) addLog(state, { time: state.time, text: `[${me.tag}] vertrouwt jullie niet meer als bondgenoot: jullie hielpen niet in hun oorlog. Het is nu een NAP.` });
      return;
    }
    if (rel === 'nap' && trust < BREAK) {
      hooks.setRelation(me, ally, null);
      hooks.news(`[${me.tag}] zegt het verdrag met [${ally.tag}] op.`);
      if (ally.members.includes(HUMAN_ID)) addLog(state, { time: state.time, text: `[${me.tag}] zegt het verdrag met jullie op.` });
      return;
    }
  }
}
