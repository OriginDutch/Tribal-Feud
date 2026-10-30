import { useEffect, useMemo, useState } from 'preact/hooks';
import { Coords } from '../components/Coords';
import type { UnitCounts, UnitId } from '../../shared/gameData';
import { DAY, HOUR, MINUTE, SECOND, formatGameTime } from '../../shared/time';
import { Confirm } from '../components/Confirm';
import { duration, num } from '../format';
import { send, snapshot, supportPlan } from '../store';
import { UNIT_SHORT, distance } from '../units';
import { UnitIcon } from '../units/UnitIcon';

/** Units you can pick; nobles stay home. */
const PICKABLE: UnitId[] = ['spear', 'sword', 'axe', 'archer', 'spy', 'light', 'marcher', 'heavy', 'ram', 'catapult', 'knight'];
const DEFAULT_UNITS: UnitId[] = ['spear', 'sword', 'archer', 'heavy'];
const UNITS_KEY = 'tf-support-units';

function loadUnits(): UnitId[] {
  try {
    const raw = JSON.parse(localStorage.getItem(UNITS_KEY) ?? 'null') as unknown;
    if (Array.isArray(raw)) return raw.filter((u): u is UnitId => PICKABLE.includes(u as UnitId));
  } catch {
    /* storage can be unavailable */
  }
  return DEFAULT_UNITS;
}

/** "Dag 5 14:30", "dag 5 14:30:15" or just "14:30" (the next time it is that o'clock). */
function parseTime(text: string, now: number): number | null {
  const t = text.trim().toLowerCase();
  const full = /^dag\s*(\d+)\D+(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t);
  if (full) return (Number(full[1]) - 1) * DAY + Number(full[2]) * HOUR + Number(full[3]) * MINUTE + Number(full[4] ?? 0) * SECOND;
  const clock = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t);
  if (!clock) return null;
  const inDay = Number(clock[1]) * HOUR + Number(clock[2]) * MINUTE + Number(clock[3] ?? 0) * SECOND;
  let at = Math.floor(now / DAY) * DAY + inDay;
  if (at <= now) at += DAY;
  return at;
}

/**
 * Support planner: pick one of your villages and (optionally) when the troops must be there; every
 * other village shows what it has at home, when it would arrive, and whether that is in time.
 * You choose the numbers per village; units that would be too late are marked per unit.
 */
export function SupportScreen() {
  const s = snapshot.value;
  const plan = supportPlan.value;
  const [target, setTarget] = useState<number | null>(plan?.target ?? s?.village?.id ?? null);
  const [deadline, setDeadline] = useState<number | null>(plan?.deadline ?? null);
  const [deadlineText, setDeadlineText] = useState(plan?.deadline ? formatGameTime(plan.deadline).replace(' ·', '') : '');
  const [units, setUnits] = useState<UnitId[]>(loadUnits);
  const [amounts, setAmounts] = useState<Record<number, Partial<Record<UnitId, string>>>>({});
  const [fromGroup, setFromGroup] = useState<string>(() => localStorage.getItem('tf-support-group') ?? '');

  // a new request from elsewhere (an incoming attack, a village)
  useEffect(() => {
    if (!plan) return;
    setTarget(plan.target);
    setDeadline(plan.deadline);
    setDeadlineText(plan.deadline ? formatGameTime(plan.deadline).replace(' ·', '') : '');
    setAmounts({});
  }, [plan]);
  useEffect(() => {
    try {
      localStorage.setItem(UNITS_KEY, JSON.stringify(units));
    } catch {
      /* fine */
    }
  }, [units]);

  const to = s?.villages.find((v) => v.id === target);
  const rows = useMemo(() => {
    if (!s || !to) return [];
    return s.villages
      .filter((v) => v.id !== to.id && v.canSend && (!fromGroup || !s.groups.some((g) => g.id === fromGroup) || v.groups.includes(fromGroup)))
      .map((v) => ({ v, dist: distance(v, to) }))
      .sort((a, b) => a.dist - b.dist);
  }, [s?.villages, to?.id, fromGroup]);

  if (!s) return null;
  const travel = (u: UnitId, dist: number) => Math.round(((dist * s.unitSpeeds[u]) / s.marchFactor) * 60_000);
  const inTime = (u: UnitId, dist: number) => deadline === null || s.time + travel(u, dist) <= deadline;
  const chosen = (id: number): UnitCounts => {
    const out: UnitCounts = {};
    const a = amounts[id] ?? {};
    const v = s.villages.find((x) => x.id === id);
    for (const u of units) {
      const n = Math.min(Math.floor(Number(a[u] ?? 0)), v?.units[u] ?? 0);
      if (n > 0) out[u] = n;
    }
    return out;
  };
  const arrival = (c: UnitCounts, dist: number): number | null => {
    let slow = 0;
    for (const u of Object.keys(c) as UnitId[]) slow = Math.max(slow, travel(u, dist));
    return slow > 0 ? s.time + slow : null;
  };
  const setCell = (id: number, u: UnitId, value: string) => setAmounts({ ...amounts, [id]: { ...amounts[id], [u]: value } });
  const fillRow = (id: number, dist: number, a: typeof amounts) => {
    const v = s.villages.find((x) => x.id === id)!;
    const row: Partial<Record<UnitId, string>> = {};
    for (const u of units) if ((v.units[u] ?? 0) > 0 && inTime(u, dist)) row[u] = String(v.units[u]);
    return { ...a, [id]: row };
  };

  const plans = rows.map(({ v, dist }) => {
    const c = chosen(v.id);
    const at = arrival(c, dist);
    return { v, dist, c, at, late: at !== null && deadline !== null && at > deadline };
  });
  const sending = plans.filter((p) => p.at !== null);
  const late = sending.filter((p) => p.late);
  const total = (list: typeof plans) => {
    const t: UnitCounts = {};
    for (const p of list) for (const [u, n] of Object.entries(p.c) as [UnitId, number][]) t[u] = (t[u] ?? 0) + n;
    return t;
  };
  const fmt = (t: UnitCounts) =>
    (Object.entries(t) as [UnitId, number][]).map(([u, n]) => `${num(n)} ${UNIT_SHORT[u]}`).join(' · ') || '—';
  const incomingHere = s.incoming.filter((m) => m.to.id === target);
  const go = () => {
    send({ type: 'sendSupportMany', to: target!, orders: sending.map((p) => ({ from: p.v.id, units: p.c })) });
    setAmounts({});
  };

  return (
    <div class="screen">
      <h2>Support</h2>
      <section class="panel support-head">
        <div class="support-controls">
          <label>
            Naar
            <select value={String(target ?? '')} onChange={(e) => { setTarget(Number(e.currentTarget.value)); setAmounts({}); }}>
              {s.villages.map((v) => (
                <option key={v.id} value={String(v.id)}>
                  {v.name} ({v.x}|{v.y})
                </option>
              ))}
            </select>
          </label>
          {s.groups.length > 0 && (
            <label>
              Vanuit groep
              <select
                value={fromGroup}
                onChange={(e) => {
                  const g = e.currentTarget.value;
                  setFromGroup(g);
                  setAmounts({});
                  try { localStorage.setItem('tf-support-group', g); } catch { /* fine */ }
                }}
              >
                <option value="">Alle dorpen</option>
                {s.groups.map((g) => (
                  <option key={g.id} value={String(g.id)}>{g.name}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            Moet er zijn vóór
            <div class="row">
              <input
                type="text"
                placeholder="geen deadline — bijv. Dag 5 14:30"
                value={deadlineText}
                onInput={(e) => {
                  const text = e.currentTarget.value;
                  setDeadlineText(text);
                  setDeadline(text.trim() ? parseTime(text, s.time) : null);
                }}
              />
              {deadlineText && (
                <button class="small" onClick={() => { setDeadlineText(''); setDeadline(null); }}>
                  Geen
                </button>
              )}
            </div>
            {deadlineText.trim() && deadline === null && <span class="error">Snap ik niet. Schrijf bijv. "Dag 5 14:30" of "14:30".</span>}
            {deadline !== null && <span class="muted">{formatGameTime(deadline)} · nog {duration(deadline - s.time)}</span>}
          </label>
        </div>
        {incomingHere.length > 0 && (
          <div class="row wrap support-incoming">
            <span class="muted">Aanvallen op dit dorp:</span>
            {incomingHere.map((m) => (
              <button
                key={m.id}
                class={`small ${deadline === m.arrives ? 'active' : ''}`}
                onClick={() => { setDeadline(m.arrives); setDeadlineText(formatGameTime(m.arrives).replace(' ·', '')); }}
              >
                ⚔ {formatGameTime(m.arrives)} · {m.from.ownerName}
              </button>
            ))}
            {s.myTribe !== null && incomingHere.some((m) => !s.helpAsked.includes(m.id)) && (
              <button
                class="small"
                title="Vraagt je stam om hulp bij alle aanvallen op dit dorp"
                onClick={() => { for (const m of incomingHere) if (!s.helpAsked.includes(m.id)) send({ type: 'askTribeHelp', movement: m.id }); }}
              >
                Stam om hulp vragen
              </button>
            )}
          </div>
        )}
        <div class="row wrap support-units">
          <span class="muted">Eenheden:</span>
          {PICKABLE.map((u) => (
            <label key={u} class={`unit-toggle ${units.includes(u) ? 'on' : ''}`}>
              <input type="checkbox" checked={units.includes(u)} onChange={() => setUnits(units.includes(u) ? units.filter((x) => x !== u) : [...units, u])} />
              <UnitIcon id={u} size={16} /> {UNIT_SHORT[u]}
            </label>
          ))}
        </div>
      </section>

      {!to ? (
        <section class="panel"><p class="muted">Kies een dorp.</p></section>
      ) : rows.length === 0 ? (
        <section class="panel"><p class="muted">Je hebt geen andere dorpen met een verzamelplaats.</p></section>
      ) : (
        <section class="panel">
          <div class="row">
            <h3 style={{ flex: 1 }}>Vanuit je dorpen</h3>
            <button class="small" onClick={() => setAmounts(rows.reduce((a, r) => fillRow(r.v.id, r.dist, a), {} as typeof amounts))}>
              Alles wat op tijd komt
            </button>
            <button class="small" onClick={() => setAmounts({})}>
              Alles leeg
            </button>
          </div>
          <div class="table-scroll">
            <table class="table support-table">
              <thead>
                <tr>
                  <th>Dorp</th>
                  <th class="right">Afstand</th>
                  {units.map((u) => (
                    <th key={u} class="right" title={UNIT_SHORT[u]}>
                      <UnitIcon id={u} size={16} />
                    </th>
                  ))}
                  <th class="right">Aankomst</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {plans.map(({ v, dist, at, late: isLate }) => (
                  <tr key={v.id} class={at === null ? '' : isLate ? 'late' : 'ok'}>
                    <td class="ellipsis">
                      {v.name} <Coords x={v.x} y={v.y} />
                    </td>
                    <td class="right mono">{dist.toFixed(1)}</td>
                    {units.map((u) => {
                      const have = v.units[u] ?? 0;
                      const ok = inTime(u, dist);
                      return (
                        <td key={u} class={`right unit-cell ${have === 0 ? 'none' : ok ? '' : 'too-late'}`} title={have ? `${UNIT_SHORT[u]}: aankomst ${formatGameTime(s.time + travel(u, dist))}${ok ? '' : ' — te laat'}` : ''}>
                          {have > 0 ? (
                            <>
                              <input type="number" min={0} max={have} placeholder="0" value={amounts[v.id]?.[u] ?? ''} onInput={(e) => setCell(v.id, u, e.currentTarget.value)} />
                              <button class="link avail" onClick={() => setCell(v.id, u, String(have))}>
                                {num(have)}
                              </button>
                            </>
                          ) : (
                            <span class="muted">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td class="right mono">
                      {at === null ? <span class="muted">—</span> : (
                        <>
                          {formatGameTime(at)}
                          <div class={isLate ? 'error' : 'good'}>
                            {deadline === null ? `over ${duration(at - s.time)}` : isLate ? `✗ ${duration(at - deadline)} te laat` : `✓ ${duration(deadline - at)} marge`}
                          </div>
                        </>
                      )}
                    </td>
                    <td class="right nowrap">
                      <button class="small" onClick={() => setAmounts(fillRow(v.id, dist, amounts))}>
                        Max
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div class="support-foot">
            <div>
              <div>
                <strong>{deadline === null ? 'Gaat mee' : 'Op tijd'}:</strong> {fmt(total(sending.filter((p) => !p.late)))}
              </div>
              {late.length > 0 && (
                <div class="error">
                  Te laat ({late.length} {late.length === 1 ? 'dorp' : 'dorpen'}): {fmt(total(late))}
                </div>
              )}
            </div>
            {late.length > 0 ? (
              <Confirm label={`Versturen (${sending.length})`} sure={`${late.length} te laat — toch versturen?`} cls="primary" onConfirm={go} />
            ) : (
              <button class="primary" disabled={sending.length === 0} onClick={go}>
                Versturen ({sending.length})
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
