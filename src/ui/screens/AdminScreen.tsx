import { useEffect } from 'preact/hooks';
import { account } from '../../cloud/auth';
import { lang, tr } from '../../shared/i18n';
import { accounts, adminError, isNew, markSeen, refreshAccounts } from '../../cloud/admin';

const when = (d: Date | null) => (d ? d.toLocaleString(lang.value === 'nl' ? 'nl-NL' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '–');

/** Admin: who has an account. New ones (since the last look) are marked. */
export function AdminScreen() {
  const list = accounts.value;
  // looking at the list clears the badge, a moment later so the marks are still seen
  useEffect(() => {
    const t = window.setTimeout(markSeen, 4000);
    return () => window.clearTimeout(t);
  }, [list]);
  if (!account.value?.admin) return <section class="panel"><h2>{tr('Admin')}</h2><p class="muted">{tr('Alleen voor de beheerder.')}</p></section>;
  return (
    <section class="panel">
      <div class="row">
        <h2 style={{ flex: 1, margin: 0 }}>{tr('Accounts')}</h2>
        <button class="small" onClick={() => void refreshAccounts()}>{tr('Vernieuwen')}</button>
      </div>
      {adminError.value && <p class="form-error">{adminError.value}</p>}
      {list === null ? (
        <p class="muted">{tr('Laden…')}</p>
      ) : (
        <table class="table">
          <thead>
            <tr><th>{tr('E-mailadres')}</th><th>{tr('Aangemaakt')}</th><th>{tr('Laatst gezien')}</th></tr>
          </thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.uid}>
                <td>{a.email}{isNew(a) && <span class="tag">{tr('nieuw')}</span>}</td>
                <td>{when(a.created)}</td>
                <td>{when(a.lastSeen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p class="hint">{list ? (list.length === 1 ? tr('1 account. ') : tr('{n} accounts. ', { n: list.length })) : ''}{tr('Wordt elke 10 minuten opnieuw opgehaald zolang het spel open staat.')}</p>
    </section>
  );
}
