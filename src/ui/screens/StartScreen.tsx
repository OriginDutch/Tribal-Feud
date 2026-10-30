/**
 * The start screen: the key art, signing in, and every world (on this device and in the cloud) with
 * what you can do with it. Shown whenever no world is open.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { account, cloudEnabled, openAccount } from '../../cloud/auth';
import { MAX_WORLDS } from '../../cloud/config';
import { formatGameTime } from '../../shared/time';
import { worldsOverview, type WorldRow } from '../../shared/worlds';
import { cloudLine } from '../components/Account';
import { MusicButton } from '../music/MusicButton';
import { cloudOff, setCloudOff } from '../cloudPrefs';
import { NewWorldPanel } from '../panels/NewWorldPanel';
import { SavesPanel, exportSlots } from '../panels/SavesPanel';
import { autoPause, cloudStatus, cloudWorlds, confirmAllTabs, saves, send } from '../store';

const day = (ms: number) => formatGameTime(ms).replace(/:\d\d$/, '');
const clock = (t: number) => {
  const d = new Date(t);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  const hm = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return hm;
  if (d.toDateString() === yesterday.toDateString()) return `gisteren ${hm}`;
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
};

type Modal = { kind: 'new' } | { kind: 'saves' } | { kind: 'full'; row: WorldRow } | { kind: 'cloudOnly'; row: WorldRow } | null;

function play(row: WorldRow): void {
  if (!confirmAllTabs('Deze wereld openen')) return;
  autoPause.value = null;
  if (row.local) send({ type: 'load', slot: row.local.slot });
  else if (row.cloud) send({ type: 'cloudLoad', slot: row.cloud.slot });
}

const Icon = {
  cloud: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">
      <path d="M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 9.5 4.25 4.25 0 0 0 7 18z" />
    </svg>
  ),
  warn: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
      <path d="M12 3 L22 20 H2 Z" />
      <path d="M12 10 V14 M12 17 V17.01" />
    </svg>
  ),
  down: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
    </svg>
  ),
};

function Crest({ size }: { size: number }) {
  return (
    <svg class="home-crest" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2 L20 6 V12 C20 17 16 20.5 12 22 C8 20.5 4 17 4 12 V6 Z" fill="none" stroke="currentColor" stroke-width="1.6" />
      <path d="M8 11 L12 7 L16 11 M12 7 V17" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" />
    </svg>
  );
}

/** What a world's line under its name says. */
function Status({ row, signedIn }: { row: WorldRow; signedIn: boolean }) {
  if (row.cloud && !row.local) return <span class="ws ws-cloudonly">{Icon.down} Alleen in de cloud · {day(row.cloud.gameTime)}</span>;
  if (row.cloud && row.cloudAhead) return <span class="ws ws-warn">{Icon.warn} Cloud is verder ({day(row.cloud.gameTime)}) dan hier ({day(row.local!.gameTime)})</span>;
  if (row.cloud) return <span class="ws ws-ok">{Icon.cloud} In de cloud · bijgewerkt {clock(row.cloud.savedAt)}</span>;
  if (signedIn) return <span class="ws ws-local">{Icon.warn} Alleen op dit apparaat</span>;
  return <span class="ws ws-muted">{day(row.gameTime)} · alleen op dit apparaat</span>;
}

function CloudSwitch({ row, onToggle }: { row: WorldRow; onToggle: () => void }) {
  const on = row.cloud !== null;
  return (
    <button type="button" class={`cloud-switch ${on ? 'on' : ''}`} aria-pressed={on} aria-label={`${row.name} in de cloud bewaren`} title="In de cloud bewaren" onClick={onToggle}>
      <span class="track" aria-hidden="true">
        <span class="knob" />
      </span>
      Cloud
    </button>
  );
}

function RowMenu({ row, signedIn, anchor, onClose, onCloudOff, onCloudOn }: { row: WorldRow; signedIn: boolean; anchor: DOMRect; onClose: () => void; onCloudOff: () => void; onCloudOn: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: anchor.bottom + 4, left: Math.max(8, anchor.right - 300) });
  useEffect(() => {
    // open upwards when there is no room below
    const h = ref.current?.offsetHeight ?? 0;
    if (anchor.bottom + 4 + h > window.innerHeight - 8) setPos({ top: Math.max(8, anchor.top - 4 - h), left: Math.max(8, anchor.right - 300) });
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('.world-more')) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    const scroll = () => onClose();
    window.addEventListener('scroll', scroll, true);
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); window.removeEventListener('scroll', scroll, true); };
  }, []);
  const act = (f: () => void) => () => { onClose(); f(); };
  return (
    <div class="row-menu" role="menu" aria-label={`Opties voor ${row.name}`} ref={ref} style={{ top: `${pos.top}px`, left: `${pos.left}px` }}>
      {signedIn && row.cloud && row.local && row.cloudAhead && (
        <>
          <button type="button" role="menuitem" class="primary-item" onClick={act(() => play({ ...row, local: null }))}>
            <span>Cloudversie laden</span>
            <small>Verder vanaf {day(row.cloud.gameTime)}. De versie van dit apparaat blijft als backup.</small>
          </button>
          <button type="button" role="menuitem" onClick={act(() => { if (window.confirm(`De cloudversie (${day(row.cloud!.gameTime)}) overschrijven met de versie van dit apparaat (${day(row.local!.gameTime)})?`)) send({ type: 'cloudPush', key: row.key, force: true }); })}>
            <span>Cloud overschrijven met deze versie</span>
            <small>De cloudversie ({day(row.cloud.gameTime)}) is daarna weg.</small>
          </button>
          <div class="sep" />
        </>
      )}
      {signedIn && row.cloud && row.local && !row.cloudAhead && (
        <button type="button" role="menuitem" onClick={act(() => send({ type: 'cloudPush', key: row.key, force: false }))}>Nu naar de cloud</button>
      )}
      {signedIn && row.cloud && !row.local && (
        <button type="button" role="menuitem" onClick={act(() => send({ type: 'cloudDownload', slot: row.cloud!.slot }))}>Downloaden naar dit apparaat</button>
      )}
      {signedIn && !row.cloud && <button type="button" role="menuitem" onClick={act(onCloudOn)}>In de cloud bewaren</button>}
      {signedIn && row.cloud && <button type="button" role="menuitem" onClick={act(onCloudOff)}>Uit de cloud halen</button>}
      {row.local && <button type="button" role="menuitem" onClick={act(() => void exportSlots([row.local!.slot]))}>Exporteren als bestand</button>}
      {row.local && (
        <button
          type="button"
          role="menuitem"
          class="danger-item"
          onClick={act(() => {
            const msg = row.cloud ? `"${row.name}" van dit apparaat verwijderen? In de cloud blijft hij staan.` : `"${row.name}" van dit apparaat verwijderen, met al zijn backups? Hij staat nergens anders: dit is voorgoed.`;
            if (window.confirm(msg)) send({ type: 'deleteWorld', key: row.key });
          })}
        >
          Verwijderen van dit apparaat
        </button>
      )}
    </div>
  );
}

function WorldItem({ row, signedIn, onToggle, onCloudOff }: { row: WorldRow; signedIn: boolean; onToggle: () => void; onCloudOff: () => void }) {
  const [menu, setMenu] = useState<DOMRect | null>(null);
  return (
    <li class="world-row">
      <button type="button" class="world-info world-open" onClick={() => play(row)} title={row.local ? 'Spelen' : 'Downloaden en spelen'}>
        <strong>{row.name}</strong>
        <Status row={row} signedIn={signedIn} />
      </button>
      <div class="world-actions">
        {signedIn && <CloudSwitch row={row} onToggle={onToggle} />}
        <button type="button" class="world-play" onClick={() => play(row)}>
          {row.local ? 'Spelen' : 'Downloaden'}
        </button>
        <div class="row-menu-wrap">
          <button type="button" class="world-more" aria-label={`Meer opties voor ${row.name}`} aria-haspopup="menu" aria-expanded={!!menu} onClick={(e) => setMenu(menu ? null : e.currentTarget.getBoundingClientRect())}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="19" cy="12" r="1.8" />
            </svg>
          </button>
          {menu && <RowMenu row={row} signedIn={signedIn} anchor={menu} onClose={() => setMenu(null)} onCloudOff={onCloudOff} onCloudOn={onToggle} />}
        </div>
      </div>
    </li>
  );
}

function Dialog({ title, danger, onClose, children }: { title: string; danger?: boolean; onClose: () => void; children: preact.ComponentChildren }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, []);
  return (
    <div class="modal-backdrop" onClick={onClose}>
      <div class={`modal home-dialog ${danger ? 'danger' : ''}`} role={danger ? 'alertdialog' : 'dialog'} aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function CloudFullDialog({ row, onClose }: { row: WorldRow; onClose: () => void }) {
  const inCloud = cloudWorlds.value;
  const rows = worldsOverview(saves.value, inCloud).filter((r) => r.cloud);
  return (
    <Dialog title="De cloud is vol" onClose={onClose}>
      <h2 class="dlg-title">De cloud is vol</h2>
      <p class="dlg-text">
        Er passen {MAX_WORLDS} werelden in de cloud. Kies er een die plaatsmaakt voor <strong>{row.name}</strong>.
      </p>
      <ul class="dlg-list">
        {rows.map((r) => (
          <li key={r.key}>
            <span class="world-info">
              <strong>{r.name}</strong>
              {r.local ? <span class="ws ws-muted">Bijgewerkt {clock(r.cloud!.savedAt)} · blijft op dit apparaat</span> : <span class="ws ws-warn">{Icon.warn} Staat alleen in de cloud</span>}
            </span>
            {r.local ? (
              <button
                type="button"
                class="dlg-btn"
                onClick={() => {
                  setCloudOff(r.key, true);
                  setCloudOff(row.key, false);
                  send({ type: 'cloudReplace', slot: r.cloud!.slot, key: row.key });
                  onClose();
                }}
              >
                Vervangen
              </button>
            ) : (
              <button type="button" class="dlg-btn" onClick={() => send({ type: 'cloudDownload', slot: r.cloud!.slot })}>
                Eerst downloaden
              </button>
            )}
          </li>
        ))}
      </ul>
      <div class="dlg-buttons">
        <button type="button" class="dlg-secondary" onClick={onClose}>
          Annuleren
        </button>
      </div>
    </Dialog>
  );
}

function CloudOnlyDialog({ row, onClose }: { row: WorldRow; onClose: () => void }) {
  return (
    <Dialog title={`${row.name} uit de cloud halen?`} danger onClose={onClose}>
      <div class="dlg-warn">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
          <path d="M12 3 L22 20 H2 Z" />
          <path d="M12 10 V14 M12 17 V17.01" />
        </svg>
        <div>
          <h2 class="dlg-title">{row.name} uit de cloud halen?</h2>
          <p class="dlg-text">
            Deze wereld staat nergens anders: niet op dit apparaat en niet in een bestand. Haal je hem uit de cloud, dan is hij <strong>voorgoed weg</strong>.
          </p>
        </div>
      </div>
      <div class="dlg-buttons">
        <button type="button" class="dlg-secondary" onClick={onClose}>
          Annuleren
        </button>
        <button type="button" class="primary" onClick={() => { send({ type: 'cloudDownload', slot: row.cloud!.slot }); onClose(); }}>
          Eerst downloaden
        </button>
        <button type="button" class="dlg-danger" onClick={() => { setCloudOff(row.key, true); send({ type: 'cloudDelete', slot: row.cloud!.slot }); onClose(); }}>
          Voorgoed verwijderen
        </button>
      </div>
    </Dialog>
  );
}

export function StartScreen() {
  const [modal, setModal] = useState<Modal>(null);
  const a = account.value;
  const signedIn = cloudEnabled && !!a;
  const rows = worldsOverview(saves.value, signedIn ? cloudWorlds.value : []);
  const inCloud = rows.filter((r) => r.cloud).length;
  const latest = rows[0];
  void cloudOff.value; // re-render when the switches change

  function cloudOffFor(row: WorldRow): void {
    if (!row.local) return setModal({ kind: 'cloudOnly', row });
    if (!window.confirm(`"${row.name}" uit de cloud halen? Op dit apparaat blijft hij staan.`)) return;
    setCloudOff(row.key, true);
    send({ type: 'cloudDelete', slot: row.cloud!.slot });
  }
  function toggle(row: WorldRow): void {
    if (row.cloud) return cloudOffFor(row);
    if (inCloud >= MAX_WORLDS) return setModal({ kind: 'full', row });
    setCloudOff(row.key, false);
    send({ type: 'cloudPush', key: row.key, force: false });
  }

  return (
    <div class="home">
      <picture class="home-art" aria-hidden="true">
        <source media="(max-width: 700px)" srcset="/home/hero-tall-full.webp" />
        <img src="/home/hero-wide-full.webp" alt="" />
      </picture>
      <div class="home-shade" aria-hidden="true" />
      <div class="home-inner">
        <header class="home-head">
          <MusicButton class="home-music" />
          {signedIn && (
            <button type="button" class={`home-account cloud-${cloudStatus.value.state}`} data-cloud-at={cloudStatus.value.at ?? ''} onClick={() => openAccount('in')} title={cloudLine(cloudStatus.value)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
                <path d="M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 9.5 4.25 4.25 0 0 0 7 18z" />
                {cloudStatus.value.state === 'ok' && <path d="M9.5 13.5l2 2 3.5-4" />}
              </svg>
              <span class="home-account-mail">{a.email}</span>
            </button>
          )}
        </header>

        <main class="home-main">
          <div class="home-title">
            <Crest size={56} />
            <h1>Tribal Feud</h1>
            <p>{signedIn ? 'Welkom terug. Je stam wacht.' : 'Bouw je dorp. Overleef je buren.'}</p>
          </div>

          {signedIn && latest ? (
            <button type="button" class="home-continue" onClick={() => play(latest)}>
              <span>
                <b>Verder spelen</b>
                <small>
                  {latest.name} · {day(latest.gameTime)}
                </small>
              </span>
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 4v16l13-8z" fill="currentColor" />
              </svg>
            </button>
          ) : (
            cloudEnabled &&
            a === null && (
              <div class="home-auth">
                <div class="home-auth-buttons">
                  <button type="button" class="primary big" onClick={() => openAccount('up')}>
                    Account maken
                  </button>
                  <button type="button" class="ghost big" onClick={() => openAccount('in')}>
                    Inloggen
                  </button>
                </div>
                <p class="hint">Met een account staan je werelden veilig in de cloud.</p>
              </div>
            )
          )}

          <section class="home-worlds" aria-labelledby="home-worlds-title">
            <div class="home-worlds-head">
              <h2 id="home-worlds-title">
                {signedIn ? (
                  <>
                    Je werelden <span>· {inCloud} van {MAX_WORLDS} in de cloud</span>
                  </>
                ) : cloudEnabled ? (
                  'Zonder account spelen'
                ) : (
                  'Je werelden'
                )}
              </h2>
              <button type="button" class="link home-new home-new-top" onClick={() => setModal({ kind: 'new' })}>
                + Nieuwe wereld
              </button>
            </div>
            {cloudEnabled && !signedIn && (
              <p class="home-warning">
                {Icon.warn}
                <span>Zonder account staat je wereld alleen in deze browser. Wis je je browsergegevens of wissel je van apparaat, dan ben je hem kwijt.</span>
              </p>
            )}
            {signedIn && (cloudStatus.value.state === 'error' || cloudStatus.value.state === 'full') && <p class="home-warning">{Icon.warn}<span>{cloudLine(cloudStatus.value)}</span></p>}
            {rows.length === 0 ? (
              <p class="hint">Nog geen werelden. Begin met een nieuwe wereld.</p>
            ) : (
              <ul class="world-list" tabIndex={0} aria-label="Werelden">
                {rows.map((r) => (
                  <WorldItem key={r.key} row={r} signedIn={signedIn} onToggle={() => toggle(r)} onCloudOff={() => cloudOffFor(r)} />
                ))}
              </ul>
            )}
            <button type="button" class="link home-new home-new-bottom" onClick={() => setModal({ kind: 'new' })}>
              + Nieuwe wereld
            </button>
            <button type="button" class="link home-saves" onClick={() => setModal({ kind: 'saves' })}>
              Saves, backups en importeren
            </button>
          </section>
        </main>
      </div>

      {modal?.kind === 'new' && (
        <div class="modal-backdrop" onClick={() => setModal(null)}>
          <div class="modal home-panel-modal" role="dialog" aria-modal="true" aria-label="Nieuwe wereld" onClick={(e) => e.stopPropagation()}>
            <button type="button" class="small modal-x" onClick={() => setModal(null)} aria-label="Sluiten">✕</button>
            <NewWorldPanel />
          </div>
        </div>
      )}
      {modal?.kind === 'saves' && (
        <div class="modal-backdrop" onClick={() => setModal(null)}>
          <div class="modal home-panel-modal" role="dialog" aria-modal="true" aria-label="Saves" onClick={(e) => e.stopPropagation()}>
            <button type="button" class="small modal-x" onClick={() => setModal(null)} aria-label="Sluiten">✕</button>
            <SavesPanel cloud={false} />
          </div>
        </div>
      )}
      {modal?.kind === 'full' && <CloudFullDialog row={modal.row} onClose={() => setModal(null)} />}
      {modal?.kind === 'cloudOnly' && <CloudOnlyDialog row={modal.row} onClose={() => setModal(null)} />}
    </div>
  );
}
