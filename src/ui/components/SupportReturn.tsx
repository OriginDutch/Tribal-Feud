import { useEffect, useState } from 'preact/hooks';
import type { SupportRow } from '../../shared/protocol';
import type { UnitCounts, UnitId } from '../../shared/gameData';
import { duration } from '../format';
import { groupFilter, send, snapshot, supportRows } from '../store';
import { unitsText } from '../units';
import { Confirm } from './Confirm';
import { tr } from '../../shared/i18n';

const SECTIONS: { kind: SupportRow['kind']; title: string; empty: string; button: string; hint: string }[] = [
  { kind: 'foreign', title: 'Vreemde steun in je dorpen', empty: 'Geen troepen van andere spelers in deze dorpen.', button: 'Alles wegsturen', hint: 'Troepen van andere spelers die in jouw dorpen staan. Ze lopen terug naar hun eigen dorp.' },
  { kind: 'mine', title: 'Jouw steun bij anderen', empty: 'Geen troepen van je bij andere spelers.', button: 'Alles terughalen', hint: 'Jouw troepen in dorpen van anderen. Ze lopen terug naar het dorp waar ze vandaan kwamen.' },
  { kind: 'own', title: 'Steun tussen je eigen dorpen', empty: 'Je dorpen ondersteunen elkaar niet.', button: 'Alles naar huis', hint: 'Troepen van je ene dorp in je andere dorp. Ze lopen terug naar hun thuisdorp.' },
];

/**
 * Sends supports home in bulk: foreign troops in your villages, your troops elsewhere, and
 * supports between your own villages, each with its own button. Scope: all villages, a group,
 * or one village.
 */
export function SupportReturn({ village, onClose }: { village?: number; onClose?: () => void }) {
  const s = snapshot.value;
  const [scope, setScope] = useState<string>(village !== undefined ? 'village' : (groupFilter.value ?? 'all'));
  useEffect(() => {
    send({ type: 'getSupportList' });
    const t = window.setInterval(() => send({ type: 'getSupportList' }), 3000);
    return () => window.clearInterval(t);
  }, []);
  if (!s) return null;
  const rows = supportRows.value;
  const here = village ?? s.village?.id;
  const inScope = (id: number): boolean => {
    if (scope === 'all') return s.villages.some((v) => v.id === id);
    if (scope === 'village') return id === here;
    return s.villages.some((v) => v.id === id && v.groups.includes(scope));
  };
  const matches = (r: SupportRow) => (r.kind === 'foreign' ? inScope(r.host.id) : r.kind === 'mine' ? inScope(r.origin.id) : inScope(r.host.id) || inScope(r.origin.id));
  const total = (list: SupportRow[]): UnitCounts => {
    const t: UnitCounts = {};
    for (const r of list) for (const [u, n] of Object.entries(r.units) as [UnitId, number][]) t[u] = (t[u] ?? 0) + n;
    return t;
  };
  const sendHome = (list: SupportRow[]) => send({ type: 'returnSupportMany', pairs: list.map((r) => ({ hostId: r.host.id, originId: r.origin.id })) });
  const name = (v: SupportRow['host']) => `${v.name} (${v.x}|${v.y})`;
  return (
    <div class="support-return">
      <div class="row wrap">
        <label class="row">
          {tr('Dorpen')}
          <select value={scope} onChange={(e) => setScope(e.currentTarget.value)}>
            <option value="all">{tr('Alle dorpen')}</option>
            {s.groups.map((g) => <option key={g.id} value={String(g.id)}>{tr('Groep {name}', { name: g.name })}</option>)}
            {here !== undefined && <option value="village">{tr('Alleen {name}', { name: s.villages.find((v) => v.id === here)?.name ?? tr('dit dorp') })}</option>}
          </select>
        </label>
        <span style={{ flex: 1 }} />
        {onClose && <button class="small" onClick={onClose}>{tr('Sluiten')}</button>}
      </div>
      {rows === null ? (
        <p class="muted">{tr('Laden…')}</p>
      ) : (
        SECTIONS.map((sec) => {
          const list = rows.filter((r) => r.kind === sec.kind && matches(r)).sort((a, b) => a.host.name.localeCompare(b.host.name));
          const slowest = list.reduce((m, r) => Math.max(m, r.travel), 0);
          return (
            <section key={sec.kind} class="support-return-section">
              <div class="row wrap">
                <h4 title={tr(sec.hint)}>{tr(sec.title)} ({list.length})</h4>
                <span style={{ flex: 1 }} />
                {list.length > 0 && (
                  <Confirm
                    label={`${tr(sec.button)} (${list.length})`}
                    sure={tr('Zeker? {n}× terug, laatste is over {time} thuis', { n: list.length, time: duration(slowest) })}
                    onConfirm={() => sendHome(list)}
                  />
                )}
              </div>
              {list.length === 0 ? (
                <p class="muted">{tr(sec.empty)}</p>
              ) : (
                <table class="table compact">
                  <thead>
                    <tr>
                      <th>{tr('Staat in')}</th>
                      <th>{tr('Komt uit')}</th>
                      <th>{tr('Troepen')}</th>
                      <th class="right">{tr('Terug in')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => (
                      <tr key={`${r.host.id}-${r.origin.id}`}>
                        <td class="ellipsis">{name(r.host)}{r.kind === 'mine' && <span class="muted"> · {r.host.ownerName}</span>}</td>
                        <td class="ellipsis">{name(r.origin)}{r.kind === 'foreign' && <span class="muted"> · {r.origin.ownerName}</span>}</td>
                        <td class="muted">{unitsText(r.units)}</td>
                        <td class="right mono">{duration(r.travel)}</td>
                        <td class="right">
                          <button class="small" onClick={() => sendHome([r])}>{tr('Terug')}</button>
                        </td>
                      </tr>
                    ))}
                    <tr class="total-row">
                      <td colSpan={2}><strong>{tr('Totaal')}</strong></td>
                      <td class="muted">{unitsText(total(list))}</td>
                      <td colSpan={2} />
                    </tr>
                  </tbody>
                </table>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
