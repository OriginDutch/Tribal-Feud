import { OUTCOME_LABEL, reportOutcome } from '../../shared/reportOutcome';
import { definedLetters } from '../../shared/farmTemplates';
import { PlayerLink } from '../components/PlayerLink';
import { useSaved } from '../useSaved';
import { Coords } from '../components/Coords';
import { BARB_TYPE_NAMES } from '../../shared/barbarianTypes';
import { useEffect, useState } from 'preact/hooks';
import { BUILDING_IDS, UNIT_IDS, type UnitCounts } from '../../shared/gameData';
import { formatGameTime } from '../../shared/time';
import type { Report } from '../../sim/movement';
import { nowHeld } from '../../shared/reportHeld';
import { num } from '../format';
import { attackVillage, ranking, reportOwnersNow, reports, screen, send, simPrefill, snapshot, tribes } from '../store';
import { FLAG_NAMES, type FlagType } from '../../shared/flags';
import { UnitIcon } from '../units/UnitIcon';

const RES = [
  { name: 'Hout', key: 'wood' },
  { name: 'Leem', key: 'stone' },
  { name: 'IJzer', key: 'iron' },
] as const;

type Kind = 'attack' | 'defense' | 'scout';
type Filter = 'all' | Kind | 'auto';

const scoutOnly = (r: Report) => {
  const sent = Object.entries(r.attackerUnits.sent).filter(([, n]) => (n ?? 0) > 0);
  return sent.length > 0 && sent.every(([u]) => u === 'spy');
};
const kindOf = (r: Report): Kind => (r.defense ? 'defense' : scoutOnly(r) ? 'scout' : 'attack');

/** Colour of a report: from your side, so a held defense is green. */
export function tone(r: Report): 'win' | 'mid' | 'loss' | 'scout' {
  if (r.defense) return r.result === 'loss' ? 'win' : 'loss';
  if (scoutOnly(r)) return r.result === 'loss' ? 'loss' : 'scout';
  return r.result === 'win' ? 'win' : r.result === 'winLosses' ? 'mid' : 'loss';
}

function headline(r: Report): string {
  const target = `${r.defender.name} (${r.defender.x}|${r.defender.y})`;
  if (r.defense) return `${r.result === 'loss' ? 'Verdedigd' : 'Doorgebroken'} · ${r.attacker.ownerName} viel ${target} aan`;
  if (r.conquered) return `Veroverd · ${target}`;
  if (scoutOnly(r)) return `${r.result === 'loss' ? 'Verkenners verloren' : 'Verkend'} · ${target}`;
  return `${r.result === 'win' ? 'Gewonnen' : r.result === 'winLosses' ? 'Gewonnen met verliezen' : 'Verloren'} · ${target}`;
}

/**
 * The picture above a report, by outcome (public/art): your attack won / lost / took the village,
 * a scout, your defense held / broke. Farm-assistant reports keep the plain colour bar.
 */
function reportArt(r: Report): string | null {
  if (r.auto) return null;
  if (r.defense) return scoutOnly(r) ? 'scouted' : r.result === 'loss' ? 'held' : 'village-lost';
  if (r.conquered) return 'conquered';
  if (scoutOnly(r)) return r.result === 'loss' ? 'lost' : 'scouted';
  return r.result === 'loss' ? 'lost' : 'won';
}

export function listTitle(r: Report): string {
  const target = `${r.defender.name} (${r.defender.x}|${r.defender.y})`;
  if (r.defense) return `Verdediging: ${r.attacker.ownerName} valt ${r.defender.name} aan`;
  if (scoutOnly(r)) return `Verkenning van ${target}`;
  return `${r.attacker.name} valt ${target} aan`;
}

const total = (u: UnitCounts) => UNIT_IDS.reduce((a, id) => a + (u[id] ?? 0), 0);

function TrashIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
    </svg>
  );
}

function UnitTable({ rows }: { rows: { label: string; units: UnitCounts; losses?: boolean }[] }) {
  const cols = UNIT_IDS.filter((u) => rows.some((r) => (r.units[u] ?? 0) > 0));
  if (cols.length === 0) return <p class="muted">Geen troepen.</p>;
  return (
    <div class="table-scroll">
      <table class="table compact report-units">
        <thead>
          <tr>
            <th />
            {cols.map((u) => (
              <th key={u} class="center">
                <UnitIcon id={u} size={26} title={snapshot.value?.village?.units.find((x) => x.id === u)?.name ?? u} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td class="muted">{r.label}</td>
              {cols.map((u) => {
                const n = r.units[u] ?? 0;
                return (
                  <td key={u} class={`center mono ${n === 0 ? 'muted' : r.losses ? 'lost' : ''}`}>
                    {num(n)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResPills({ res }: { res: [number, number, number] }) {
  return (
    <>
      {RES.map((r, i) => (
        <span key={r.key} class="pill" title={r.name}>
          <span class={`res res-${r.key}`} />
          {num(res[i] ?? 0)}
        </span>
      ))}
    </>
  );
}

export function ReportDetail({ r }: { r: Report }) {
  const s = snapshot.value;
  const names = s?.village?.buildings ?? [];
  const bname = (id: string) => names.find((b) => b.id === id)?.name ?? id;
  const t = tone(r);
  const sent = total(r.attackerUnits.sent);
  const lostPct = sent > 0 ? (total(r.attackerUnits.lost) / sent) * 100 : 0;
  const ownAttacker = !r.defense && (s?.villages ?? []).some((v) => v.id === r.attacker.id);
  const barbTarget = r.defender.ownerName === 'Barbaren';
  const lootSum = r.loot ? r.loot[0] + r.loot[1] + r.loot[2] : 0;
  const luck = r.luck * 100;

  const art = reportArt(r);
  return (
    <div class="report-card">
      <div class={`report-banner ${t}${art ? ' has-art' : ''}`} {...(art ? { style: { '--art': `url(/art/report-${art}.webp)` }, 'data-art': art } : {})}>
        <div>
          <div class="report-big">{headline(r)}</div>
          <div class="report-sub">
            {formatGameTime(r.time)}
            {sent > 0 && !r.defense && ` · aanvaller verliest ${lostPct.toFixed(lostPct < 10 ? 1 : 0).replace('.', ',')}%`}
          </div>
        </div>
      </div>

      {r.loot && (
        <div class="report-row">
          <ResPills res={r.loot} />
          <span class="muted">
            buit {num(lootSum)} / {num(r.carry ?? 0)} draagvermogen
          </span>
        </div>
      )}

      <div class="report-side">
        <h4>
          Aanvaller · {r.attacker.owner !== undefined ? <PlayerLink id={r.attacker.owner} name={r.attacker.ownerName} /> : r.attacker.ownerName} <span class="muted">· {r.attacker.name} <Coords x={r.attacker.x} y={r.attacker.y} /></span>
        </h4>
        <UnitTable
          rows={[
            { label: 'Aantal', units: r.attackerUnits.sent },
            { label: 'Verlies', units: r.attackerUnits.lost, losses: true },
          ]}
        />
      </div>

      <div class="report-side">
        <h4>
          Verdediger · {r.defender.owner !== undefined ? <PlayerLink id={r.defender.owner} name={r.defender.ownerName} /> : r.defender.ownerName} <span class="muted">· {r.defender.name} <Coords x={r.defender.x} y={r.defender.y} /></span>
        </h4>
        {r.defenderUnits ? (
          <UnitTable
            rows={[
              { label: 'Aantal', units: r.defenderUnits.present },
              { label: 'Verlies', units: r.defenderUnits.lost, losses: true },
            ]}
          />
        ) : (
          <p class="muted">Geen van je troepen is teruggekomen om te vertellen wat er stond.</p>
        )}
        {r.supportUnits && (
          <>
            <p class="muted">Jouw ondersteuning in dit dorp:</p>
            <UnitTable
              rows={[
                { label: 'Aantal', units: r.supportUnits.present },
                { label: 'Verlies', units: r.supportUnits.lost, losses: true },
              ]}
            />
          </>
        )}
      </div>

      {r.scouted && (
        <div class="report-side">
          <h4>Verkend</h4>
          <div class="report-row inner">
            {r.scouted.barbType && <span class="pill">Type: {BARB_TYPE_NAMES[r.scouted.barbType]}</span>}
            {r.scouted.flag && <span class="pill">Vlag: {FLAG_NAMES[r.scouted.flag.type as FlagType]} L{r.scouted.flag.level}</span>}
            {r.scouted.item && <span class="pill">Paladijn met {r.scouted.item}</span>}
            <ResPills res={r.scouted.res} />
          </div>
          <p class="muted">
            {BUILDING_IDS.filter((b) => r.scouted?.buildings[b])
              .map((b) => `${bname(b)} ${r.scouted?.buildings[b]}`)
              .join(' · ')}
          </p>
          <UnitTable rows={[{ label: 'In het dorp', units: r.scouted.units }, ...(r.scouted.away ? [{ label: 'Niet thuis (telescoop)', units: r.scouted.away }] : [])]} />
        </div>
      )}

      <div class="report-row">
        {r.wall && (
          <span class="pill">
            Muur {r.wall.before !== r.wall.after ? `${r.wall.before} → ${r.wall.after}` : r.wall.after}
          </span>
        )}
        {r.building && (
          <span class="pill">
            {bname(r.building.id)} {r.building.before} → {r.building.after}
          </span>
        )}
        {r.loyalty && (
          <span class="pill">
            Toestemming {r.loyalty.before} → {r.conquered ? <strong>veroverd!</strong> : r.loyalty.after}
          </span>
        )}
        <span class="pill" title="Geluk: tussen -25% en +25%">
          Geluk
          <span class="luck-bar">
            <b style={{ left: luck >= 0 ? '50%' : `${50 + luck * 2}%`, width: `${Math.abs(luck) * 2}%`, background: luck >= 0 ? 'var(--good, #7fa35a)' : 'var(--danger)' }} />
            <i />
          </span>
          {luck >= 0 ? '+' : ''}
          {luck.toFixed(1).replace('.', ',')}%
        </span>
        <span class="pill">Moraal {Math.round(r.morale * 100)}%</span>
      </div>
      {r.modifiers && (r.modifiers.attacker.length > 0 || r.modifiers.defender.length > 0) && (
        <div class="report-mods">
          {r.modifiers.attacker.length > 0 && (
            <div><span class="muted">Aanvaller:</span> {r.modifiers.attacker.map((t, i) => <span key={i} class="pill">{t}</span>)}</div>
          )}
          {r.modifiers.defender.length > 0 && (
            <div><span class="muted">Verdediger:</span> {r.modifiers.defender.map((t, i) => <span key={i} class="pill">{t}</span>)}</div>
          )}
        </div>
      )}

      <div class="report-foot">
        <span class="row">
          {r.defenderUnits && (
            <button
              class="small"
              title="Open dit gevecht in de simulator"
              onClick={() => {
                simPrefill.value = { attacker: r.attackerUnits.sent, defender: r.defenderUnits!.present, wall: r.wall?.before ?? 0, morale: r.morale, luck: r.luck };
                screen.value = 'simulator';
              }}
            >
              Simuleren
            </button>
          )}
          {ownAttacker && barbTarget && (
            <>
              {definedLetters(snapshot.value?.farmTemplates).map((l) => (
                <button key={l} class="small" onClick={() => send({ type: 'sendFarm', from: r.attacker.id, to: r.defender.id, template: l })}>
                  Farm {l}
                </button>
              ))}
            </>
          )}
          {!r.defense && (
            <button class="small" onClick={() => attackVillage(r.defender.x, r.defender.y)}>
              Naar verzamelplaats
            </button>
          )}
        </span>
        <button class="small danger" onClick={() => send({ type: 'deleteReports', ids: [r.id] })}>
          <TrashIcon size={13} /> Verwijderen
        </button>
      </div>
    </div>
  );
}

/**
 * Search in reports: "501|497" (or "501 497") = that village on either side, "[TAG]" = a member of
 * that tribe on either side, anything else = part of a player's or village's name.
 */
function matcher(q: string): (r: Report) => boolean {
  const t = q.trim();
  if (!t) return () => true;
  const xy = /^(\d{1,4})\s*[|,/ ]\s*(\d{1,4})$/.exec(t);
  if (xy) {
    const x = Number(xy[1]), y = Number(xy[2]);
    return (r) => (r.attacker.x === x && r.attacker.y === y) || (r.defender.x === x && r.defender.y === y);
  }
  const tag = /^\[(.+)\]$/.exec(t);
  if (tag) {
    const tr = tribes.value.find((x) => x.tag.toLowerCase() === tag[1]!.toLowerCase());
    if (!tr) return () => false;
    const members = new Set(ranking.value.filter((p) => p.tribe === tr.id).map((p) => p.id));
    const names = new Set(ranking.value.filter((p) => p.tribe === tr.id).map((p) => p.name));
    const inTribe = (v: Report['attacker']) => (v.owner !== undefined ? members.has(v.owner) : names.has(v.ownerName));
    return (r) => inTribe(r.attacker) || inTribe(r.defender);
  }
  const n = t.toLowerCase();
  return (r) => [r.attacker.ownerName, r.defender.ownerName, r.attacker.name, r.defender.name].some((x) => x.toLowerCase().includes(n));
}

export function ReportsScreen() {
  const list = reports.value;
  const [open, setOpen] = useState<number | null>(null);
  const [filter, setFilter] = useSaved<Filter>('reports-filter', 'all');
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [hideAuto, setHideAuto] = useSaved('reports-hide-auto', true);
  const [query, setQuery] = useState('');
  const [hideTaken, setHideTaken] = useSaved('reports-hide-taken', false);
  const now = reportOwnersNow.value;
  const taken = (r: Report) => nowHeld(r, now)?.mine === true;

  useEffect(() => {
    send({ type: 'getReports' });
  }, [snapshot.value?.unreadReports, snapshot.value?.villages.length]);
  // for searching on [TAG]: who is in which tribe
  useEffect(() => { send({ type: 'getRanking' }); }, []);

  const match = matcher(query);
  // auto-farm reports: their own filter; elsewhere hidden if you want
  const shown = [...list].reverse().filter((r) =>
    (filter === 'auto' ? !!r.auto : (!r.auto || !hideAuto) && (filter === 'all' || kindOf(r) === filter)) && match(r) && !(hideTaken && taken(r)),
  );
  const autoCount = list.filter((r) => r.auto).length;
  const takenIds = list.filter(taken).map((r) => r.id);
  const pickedShown = shown.filter((r) => picked.has(r.id));
  const allPicked = shown.length > 0 && pickedShown.length === shown.length;

  const toggle = (r: Report) => {
    setOpen(open === r.id ? null : r.id);
    if (!r.read) send({ type: 'markReportsRead', ids: [r.id] });
  };
  const pick = (id: number, on: boolean) => {
    const next = new Set(picked);
    if (on) next.add(id);
    else next.delete(id);
    setPicked(next);
  };
  const remove = (ids: number[] | 'read') => {
    send({ type: 'deleteReports', ids });
    setPicked(new Set());
    if (ids !== 'read' && open !== null && ids.includes(open)) setOpen(null);
  };
  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'Alles' },
    { id: 'attack', label: 'Aanvallen' },
    { id: 'defense', label: 'Verdediging' },
    { id: 'scout', label: 'Verkenning' },
    { id: 'auto', label: `Auto-farm (${autoCount})` },
  ];

  return (
    <div class="screen">
      <div class="row">
        <h2 style={{ margin: 0, flex: 1 }}>Rapporten</h2>
        <button class="small" onClick={() => send({ type: 'markReportsRead', ids: 'all' })}>
          Alles gelezen
        </button>
      </div>
      <section class="panel">
        <div class="row report-tools">
          {filters.map((f) => (
            <button key={f.id} class={`chip ${filter === f.id ? 'on' : ''}`} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
          <input class="report-search" type="search" placeholder="Speler, dorp, [STAM] of 501|497" value={query} aria-label="Rapporten zoeken"
            onInput={(e) => setQuery(e.currentTarget.value)} />
          <span style={{ flex: 1 }} />
          <label class="inline-check" title="Rapporten van automatisch farmen alleen tonen onder Auto-farm">
            <input type="checkbox" checked={hideAuto} onChange={(e) => setHideAuto(e.currentTarget.checked)} /> auto-farm verbergen
          </label>
          <label class="inline-check" title="Rapporten over dorpen die sindsdien van jou zijn">
            <input type="checkbox" checked={hideTaken} onChange={(e) => setHideTaken(e.currentTarget.checked)} /> overgenomen verbergen
          </label>
        </div>
        <div class="row report-tools">
          <label class="inline-check">
            <input type="checkbox" checked={allPicked} onChange={(e) => setPicked(e.currentTarget.checked ? new Set(shown.map((r) => r.id)) : new Set())} /> alles
          </label>
          <button class="small danger" disabled={pickedShown.length === 0} onClick={() => remove(pickedShown.map((r) => r.id))}>
            <TrashIcon size={13} /> Verwijder geselecteerde{pickedShown.length > 0 ? ` (${pickedShown.length})` : ''}
          </button>
          <button class="small" disabled={!list.some((r) => r.read)} onClick={() => remove('read')}>
            Verwijder gelezen
          </button>
          {takenIds.length > 0 && (
            <button class="small" title="Rapporten over dorpen die sindsdien van jou zijn" onClick={() => remove(takenIds)}>
              Verwijder overgenomen ({takenIds.length})
            </button>
          )}
          {autoCount > 0 && (
            <button class="small" onClick={() => remove(list.filter((r) => r.auto).map((r) => r.id))}>
              Verwijder auto-farm ({autoCount})
            </button>
          )}
        </div>
        {shown.length === 0 ? (
          <p class="muted">{list.length === 0 ? 'Nog geen rapporten.' : 'Geen rapporten in deze categorie.'}</p>
        ) : (
          <ul class="reports">
            {shown.map((r) => (
              <li key={r.id} class={r.read ? '' : 'unread'}>
                <div class="report-line">
                  <span class={`odot ${reportOutcome(r)}`} title={OUTCOME_LABEL[reportOutcome(r)]} />
                  <input type="checkbox" aria-label="Selecteren" checked={picked.has(r.id)} onChange={(e) => pick(r.id, e.currentTarget.checked)} />
                  <button class="report-head" onClick={() => toggle(r)}>
                    <span class="report-title">
                      {listTitle(r)}
                      {r.conquered && <strong class="warn"> · veroverd</strong>}
                      {(() => { const h = nowHeld(r, now); return h && <strong class={h.mine ? 'held-mine' : 'held-other'}> · {h.label}</strong>; })()}
                    </span>
                    {r.loot && <span class="muted mono">buit {num(r.loot[0] + r.loot[1] + r.loot[2])}</span>}
                    <span class="mono muted">{formatGameTime(r.time)}</span>
                  </button>
                  <button class="link trash" title="Verwijderen" aria-label="Rapport verwijderen" onClick={() => remove([r.id])}>
                    <TrashIcon />
                  </button>
                </div>
                {open === r.id && <ReportDetail r={r} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
