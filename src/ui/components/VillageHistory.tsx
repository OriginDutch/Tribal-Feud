import { OUTCOME_LABEL, reportOutcome } from '../../shared/reportOutcome';
import { useEffect, useState } from 'preact/hooks';
import { formatGameTime } from '../../shared/time';
import { reportPopup, send, villageInfo } from '../store';
import { listTitle, tone } from '../screens/ReportsScreen';
import { unitsText } from '../units';
import { num } from '../format';

/**
 * A village in detail: your note (and one on its owner), your last scout, your support in it,
 * earlier owners and your reports about it. Click a report to read it.
 */
export function VillageHistory({ id, owner }: { id: number; owner?: number }) {
  useEffect(() => { send({ type: 'getVillage', id }); }, [id]);
  const info = villageInfo.value?.id === id ? villageInfo.value : null;
  const [note, setNote] = useState<string | null>(null);
  const [ownerNote, setOwnerNote] = useState<string | null>(null);
  useEffect(() => { setNote(null); setOwnerNote(null); }, [id]);
  const [all, setAll] = useState(false);
  if (!info) return <p class="muted">Laden…</p>;
  const save = (target: 'village' | 'player', tid: number, text: string | null) => {
    if (text === null) return;
    send({ type: 'setNote', target, id: tid, text });
    send({ type: 'getVillage', id });
    send({ type: 'getMap' });
  };
  const shown = all ? info.reports : info.reports.slice(0, 6);
  return (
    <div class="vhist">
      <label class="vhist-note">
        <span class="muted">Notitie bij dit dorp</span>
        <textarea rows={2} maxLength={500} placeholder="bv. edeldoel, muur 20, veel def" value={note ?? info.note}
          onInput={(e) => setNote(e.currentTarget.value)} onBlur={() => save('village', id, note)} />
      </label>
      {owner !== undefined && owner >= 0 && (
        <label class="vhist-note">
          <span class="muted">Notitie bij {info.ownerName}</span>
          <textarea rows={2} maxLength={500} value={ownerNote ?? info.ownerNote}
            onInput={(e) => setOwnerNote(e.currentTarget.value)} onBlur={() => save('player', owner, ownerNote)} />
        </label>
      )}
      {info.scout && (
        <p class="vhist-line">
          <span class="muted">Laatste verkenning {formatGameTime(info.scout.time)}:</span> {unitsText(info.scout.units) || 'geen troepen thuis'}
          {info.scout.away && unitsText(info.scout.away) ? <span class="muted"> · buiten: {unitsText(info.scout.away)}</span> : null}
        </p>
      )}
      {info.yourSupport && <p class="vhist-line"><span class="muted">Jouw support hier:</span> {unitsText(info.yourSupport)}</p>}
      {info.owners.length > 0 && (
        <p class="vhist-line">
          <span class="muted">Eerder veroverd:</span> {info.owners.map((o) => `${formatGameTime(o.at)} ${o.from} → ${o.to}`).join(' · ')}
        </p>
      )}
      <h4>Rapporten over dit dorp {info.reports.length ? `(${info.reports.length})` : ''}</h4>
      {info.reports.length === 0 ? (
        <p class="muted">Nog geen rapporten.</p>
      ) : (
        <ul class="vhist-reports">
          {shown.map((r) => (
            <li key={r.id}>
              <button class="link" onClick={() => (reportPopup.value = r)}>
                <span class={`odot ${reportOutcome(r)}`} title={OUTCOME_LABEL[reportOutcome(r)]} />
                <span class="vhist-title">{listTitle(r)}{r.conquered ? ' · veroverd' : ''}{r.loyalty ? ` · toestemming ${Math.round(r.loyalty.before)}→${Math.round(r.loyalty.after)}` : ''}</span>
                {r.loot ? <span class="muted mono">{num(r.loot[0] + r.loot[1] + r.loot[2])}</span> : null}
                <span class="muted mono">{formatGameTime(r.time)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {info.reports.length > 6 && <button class="small link" onClick={() => setAll(!all)}>{all ? 'Minder' : `Alle ${info.reports.length}`}</button>}
    </div>
  );
}
