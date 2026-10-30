import { BACKUP_PREFIX, BACKUPS_KEPT, UPDATE_PREFIX, slotLabel } from '../../shared/protocol';
import type { SaveMeta } from '../../sim/save';
import { formatGameTime } from '../../shared/time';
import { fromSaveData, type SaveData } from '../../sim/save';
import { getSave, listSaves, putSave } from '../../storage/saveStore';
import { AUTOSAVE_SLOT } from '../../shared/protocol';
import { account, accountOpen, cloudEnabled } from '../../cloud/auth';
import { MAX_WORLDS } from '../../cloud/config';
import type { CloudWorld } from '../../cloud/sync';
import { cloudLine } from '../components/Account';
import { autoPause, cloudStatus, cloudWorlds, confirmAllTabs, notice, saves, send, snapshot } from '../store';

/** File format: a list of { slot, data } records (the same as a raw IndexedDB dump). */
interface ExportRecord {
  slot: string;
  data: SaveData;
}

function download(name: string, records: ExportRecord[]): void {
  const blob = new Blob([JSON.stringify(records)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

const fileSafe = (s: string) => s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'save';

export async function exportSlots(slots: string[]): Promise<void> {
  const records: ExportRecord[] = [];
  for (const slot of slots) {
    const data = await getSave(slot);
    if (data) records.push({ slot, data });
  }
  const first = records[0];
  if (!first) return;
  const world = fileSafe(first.data.state.config.name);
  download(records.length === 1 ? `tribal-feud-${world}-${fileSafe(first.slot)}.json` : `tribal-feud-saves.json`, records);
}

/** Reads a save file; every save in it must load, otherwise nothing is imported. */
async function importFile(file: File): Promise<void> {
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    notice.value = { text: 'Dat is geen save-bestand.', level: 'error' };
    return;
  }
  const list = (Array.isArray(raw) ? raw : [raw]) as Partial<ExportRecord & SaveData>[];
  const records: ExportRecord[] = [];
  for (const item of list) {
    // a record { slot, data } or a bare SaveData
    const data = (item.data ?? item) as SaveData;
    try {
      fromSaveData(data);
    } catch (e) {
      notice.value = { text: `Save kan niet geladen worden: ${e instanceof Error ? e.message : String(e)}`, level: 'error' };
      return;
    }
    records.push({ slot: typeof item.slot === 'string' && item.slot ? item.slot : 'geïmporteerd', data });
  }
  // never overwrite an existing save: an import gets a free name
  const taken = new Set((await listSaves()).map((x) => x.slot));
  for (const r of records) {
    let slot = r.slot;
    for (let n = 2; taken.has(slot); n++) slot = `${r.slot} (import${n > 2 ? ` ${n - 1}` : ''})`;
    taken.add(slot);
    await putSave(slot, r.data);
  }
  send({ type: 'listSaves' });
  notice.value = { text: `${records.length} save${records.length === 1 ? '' : 's'} geïmporteerd.`, level: 'info' };
}

export function pickFile(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) importFile(file).catch((e: unknown) => (notice.value = { text: `Importeren mislukt: ${String(e)}`, level: 'error' }));
  };
  input.click();
}

export function SavesPanel({ cloud = true }: { cloud?: boolean } = {}) {
  const list = saves.value;
  return (
    <section class="panel">
      <h2>Saves</h2>
      <div class="row">
        <button disabled={!snapshot.value} onClick={() => send({ type: 'saveWorld' })}>
          Opslaan
        </button>
        <button title="Een save-bestand (.json) inlezen; bestaande saves blijven staan" onClick={pickFile}>
          Save importeren
        </button>
        {list.length > 1 && (
          <button title="Alle saves in één bestand, als backup" onClick={() => void exportSlots(list.map((x) => x.slot))}>
            Alles exporteren
          </button>
        )}
      </div>
      <SaveList list={list.filter((x) => !isSafetyCopy(x.slot))} empty="Nog geen saves." />
      {cloud && <CloudSaves />}
      {list.some((x) => isSafetyCopy(x.slot)) && (
        <details class="save-backups">
          <summary>Backups ({list.filter((x) => isSafetyCopy(x.slot)).length})</summary>
          <p class="hint">
            Per wereld de laatste {BACKUPS_KEPT} (ongeveer elke 20 minuten spelen een nieuwe), en het origineel van een save van vóór een
            update. Komt er na een update iets niet goed, laad dan de kopie "Voor update".
          </p>
          <SaveList list={list.filter((x) => isSafetyCopy(x.slot))} empty="" />
        </details>
      )}
    </section>
  );
}

const isSafetyCopy = (slot: string) => slot.startsWith(BACKUP_PREFIX) || slot.startsWith(UPDATE_PREFIX);

function SaveList({ list, empty }: { list: SaveMeta[]; empty: string }) {
  return (
    <ul class="saves">
      {list.length === 0 && empty && <li class="muted">{empty}</li>}
      {list.map((save) => (
        <li key={save.slot}>
          <div class="meta">
            <strong>
              {slotLabel(save.slot, save.version)} · {save.worldName}
            </strong>
            <span class="muted">
              {formatGameTime(save.gameTime)} · {new Date(save.savedAt).toLocaleString('nl-NL')}
            </span>
          </div>
          <div class="row">
            <button
              onClick={() => {
                if (!confirmAllTabs('Deze save laden')) return;
                autoPause.value = null;
                send({ type: 'load', slot: save.slot });
              }}
            >
              Laden
            </button>
            <button title="Download deze save als bestand" onClick={() => void exportSlots([save.slot])}>
              Exporteren
            </button>
            <button class="danger" onClick={() => send({ type: 'deleteSave', slot: save.slot })}>
              Verwijder
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The worlds in the cloud (signed in), or a nudge to sign in. */
function CloudSaves() {
  if (!cloudEnabled) return null;
  const a = account.value;
  if (a === undefined) return null;
  if (!a) {
    return (
      <div class="cloud-saves">
        <h3>Cloud</h3>
        <p class="hint">
          Met een account gaan je werelden ook naar de cloud.{' '}
          <button class="link" onClick={() => (accountOpen.value = true)}>Inloggen of account maken</button>
        </p>
      </div>
    );
  }
  const s = cloudStatus.value;
  const worlds = cloudWorlds.value;
  const local = saves.value;
  return (
    <div class="cloud-saves">
      <h3>
        Cloud <span class="muted">({worlds.length}/{MAX_WORLDS})</span>
      </h3>
      <p class={`hint cloud-line cloud-${s.state}`}>{cloudLine(s)}</p>
      {s.state === 'conflict' && (
        <div class="callout bad">
          Laad de cloudversie hieronder als je daar verder wilt, of overschrijf de cloud met de wereld die nu open is.
          <div class="row">
            <button class="small danger" onClick={() => { if (window.confirm('De cloudversie overschrijven met de wereld die nu open is? De cloudversie is dan weg.')) send({ type: 'cloudForce' }); }}>
              Cloud overschrijven
            </button>
          </div>
        </div>
      )}
      <ul class="saves">
        {worlds.length === 0 && <li class="muted">Nog niets in de cloud. Je wereld gaat er vanzelf heen bij pauze, de saveknop en elke 5 minuten spelen.</li>}
        {worlds.map((w) => (
          <CloudRow key={w.slot} w={w} localNewer={localNewer(w, local)} />
        ))}
      </ul>
    </div>
  );
}

/** The local autosave of the same world, if it is newer than the cloud copy. */
function localNewer(w: CloudWorld, local: SaveMeta[]): SaveMeta | undefined {
  const mine = local.find((x) => x.slot === `${AUTOSAVE_SLOT}:${w.key}`);
  return mine && mine.gameTime > w.gameTime ? mine : undefined;
}

function CloudRow({ w, localNewer: newer }: { w: CloudWorld; localNewer: SaveMeta | undefined }) {
  return (
    <li>
      <div class="meta">
        <strong>☁ {w.name}</strong>
        <span class="muted">
          {formatGameTime(w.gameTime)} · {new Date(w.savedAt).toLocaleString('nl-NL')} · {(w.size / 1e6).toFixed(1)} MB
        </span>
      </div>
      <div class="row">
        <button
          onClick={() => {
            if (newer && !window.confirm(`Op deze computer is "${w.name}" verder (${formatGameTime(newer.gameTime)}) dan in de cloud (${formatGameTime(w.gameTime)}). Toch de cloudversie laden? De versie van deze computer blijft als backup bewaard.`)) return;
            if (!confirmAllTabs('Deze save laden')) return;
            autoPause.value = null;
            send({ type: 'cloudLoad', slot: w.slot });
          }}
        >
          Laden
        </button>
        <button class="danger" onClick={() => { if (window.confirm(`"${w.name}" uit de cloud verwijderen? Saves op deze computer blijven staan.`)) send({ type: 'cloudDelete', slot: w.slot }); }}>
          Verwijder
        </button>
      </div>
    </li>
  );
}
