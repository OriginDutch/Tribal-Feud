/**
 * Account button in the top bar and the account window: sign in or make an account, see whether
 * the cloud is up to date, sign out. Only there when this build has accounts.
 */
import { useEffect, useState } from 'preact/hooks';
import { account, accountMode, accountOpen, authError, cloudEnabled, reloadUser, resendVerification, resetPassword, signIn, signOut, signUp } from '../../cloud/auth';
import { MAX_WORLDS } from '../../cloud/config';
import type { CloudStatus } from '../../cloud/sync';
import { cloudStatus, cloudWorlds, showNotice } from '../store';
import { tr } from '../../shared/i18n';
import { trx } from '../i18n';

const clock = (t: number) => new Date(t).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });

export function cloudLine(s: CloudStatus): string {
  switch (s.state) {
    case 'off':
      return tr('Niet ingelogd: saves staan alleen op deze computer.');
    case 'busy':
      return tr('Bezig met opslaan naar de cloud…');
    case 'ok':
      return s.at ? tr('In de cloud opgeslagen om {time}.', { time: clock(s.at) }) : tr('Verbonden. De wereld gaat naar de cloud bij pauze, de saveknop en elke 5 minuten spelen.');
    default:
      return s.message ?? tr('Er ging iets mis met de cloud.');
  }
}

/** The button: a person when signed out, a cloud with its state when signed in. */
export function AccountButton() {
  if (!cloudEnabled) return null;
  const a = account.value;
  const s = cloudStatus.value;
  const warn = s.state === 'error' || s.state === 'full' || s.state === 'conflict';
  return (
    <button class={`account-btn ${a ? `cloud-${s.state}` : ''}`} data-cloud-at={s.at ?? ''} onClick={() => (accountOpen.value = true)} title={a ? `${a.email} · ${cloudLine(s)}` : tr('Inloggen voor saves in de cloud')} aria-label={a ? tr('Account en cloud') : tr('Inloggen')}>
      {a ? (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true">
          <path d="M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 9.5 4.25 4.25 0 0 0 7 18z" />
          {s.state === 'ok' && <path d="M9.5 13.5l2 2 3.5-4" stroke-linecap="round" />}
          {s.state === 'busy' && <path d="M12 11v4M10 13l2 2 2-2" stroke-linecap="round" />}
          {warn && <path d="M12 10.5v3M12 16v.01" stroke-linecap="round" />}
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" stroke-linecap="round" />
        </svg>
      )}
      {!a && <span>{tr('Inloggen')}</span>}
    </button>
  );
}

function SignInForm() {
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>(accountMode.value);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState('');

  async function submit(e: Event) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'in') await signIn(email, password);
      else if (mode === 'up') {
        await signUp(email, password);
        showNotice(tr('Account gemaakt. Bevestig je e-mailadres via de mail die je kreeg.'), 'info');
      } else {
        await resetPassword(email);
        setSent(tr('Als er een account is voor {email}, staat er nu een mail klaar om een nieuw wachtwoord te kiezen.', { email: email.trim() }));
      }
    } catch (err) {
      setError(authError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form class="account-form" onSubmit={submit}>
      <div class="seg" role="tablist">
        <button type="button" class={mode === 'in' ? 'on' : ''} onClick={() => setMode('in')}>{tr('Inloggen')}</button>
        <button type="button" class={mode === 'up' ? 'on' : ''} onClick={() => setMode('up')}>{tr('Account maken')}</button>
      </div>
      <p class="hint">
        {mode === 'up'
          ? tr('Met een account gaan je werelden ook naar de cloud (max {max}). Spelen zonder account blijft gewoon kunnen.', { max: MAX_WORLDS })
          : mode === 'reset'
            ? tr('Je krijgt een mail met een link om een nieuw wachtwoord te kiezen.')
            : tr('Log in om je werelden in de cloud te bewaren.')}
      </p>
      <label>
        {tr('E-mailadres')}
        <input type="email" name="email" autocomplete="email" required value={email} onInput={(e) => setEmail(e.currentTarget.value)} />
      </label>
      {mode !== 'reset' && (
        <label>
          {tr('Wachtwoord')}
          <input type="password" name="password" autocomplete={mode === 'up' ? 'new-password' : 'current-password'} required minLength={mode === 'up' ? 8 : undefined} value={password} onInput={(e) => setPassword(e.currentTarget.value)} />
        </label>
      )}
      {error && <p class="form-error">{error}</p>}
      {sent && <p class="hint">{sent}</p>}
      <div class="row">
        <button class="primary" type="submit" disabled={busy}>
          {mode === 'in' ? tr('Inloggen') : mode === 'up' ? tr('Account maken') : tr('Mail sturen')}
        </button>
        {mode === 'in' && <button type="button" class="link" onClick={() => { setMode('reset'); setError(''); }}>{tr('Wachtwoord vergeten?')}</button>}
        {mode === 'reset' && <button type="button" class="link" onClick={() => { setMode('in'); setSent(''); }}>{tr('Terug|navigatie')}</button>}
      </div>
    </form>
  );
}

function SignedIn() {
  const a = account.value!;
  const s = cloudStatus.value;
  const worlds = cloudWorlds.value;
  const [busy, setBusy] = useState(false);
  return (
    <div class="account-form">
      <p>
        {trx('Ingelogd als {email}', { email: <b>{a.email}</b> })}
        {a.admin && <span class="tag">admin</span>}
      </p>
      {!a.verified && (
        <p class="verify-line">
          {tr('E-mailadres nog niet bevestigd (zie je mail).')}
          <button class="link" disabled={busy} onClick={() => { setBusy(true); resendVerification().then(() => showNotice(tr('Mail opnieuw gestuurd.'), 'info'), (e: unknown) => showNotice(authError(e), 'error')).finally(() => setBusy(false)); }}>{tr('Opnieuw sturen')}</button>
          <button class="link" onClick={() => void reloadUser()}>{tr('Ik heb bevestigd')}</button>
        </p>
      )}
      <p class={`cloud-line cloud-${s.state}`}>{cloudLine(s)}</p>
      <p class="muted">
        {worlds.length
          ? tr('{n} van {max} werelden in de cloud: {names}.', { n: worlds.length, max: MAX_WORLDS, names: worlds.map((w) => w.name).join(', ') })
          : tr('{n} van {max} werelden in de cloud.', { n: worlds.length, max: MAX_WORLDS })}{' '}
        {tr('Laden en verwijderen doe je bij Saves.')}
      </p>
      <div class="row">
        <button onClick={() => { accountOpen.value = false; void signOut(); }}>{tr('Uitloggen')}</button>
      </div>
    </div>
  );
}

export function AccountModal() {
  const open = accountOpen.value;
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') accountOpen.value = false; };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);
  if (!open || !cloudEnabled) return null;
  return (
    <div class="modal-backdrop" onClick={() => (accountOpen.value = false)}>
      <div class="modal account-modal" role="dialog" aria-modal="true" aria-label={tr('Account')} onClick={(e) => e.stopPropagation()}>
        <div class="row">
          <h3 style={{ margin: 0, flex: 1 }}>{tr('Account')}</h3>
          <button class="small" onClick={() => (accountOpen.value = false)} aria-label={tr('Sluiten')}>✕</button>
        </div>
        {account.value === undefined ? <p class="muted">{tr('Laden…')}</p> : account.value ? <SignedIn /> : <SignInForm />}
      </div>
    </div>
  );
}
