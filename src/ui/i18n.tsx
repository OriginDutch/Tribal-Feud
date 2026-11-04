/** The language switch, and `trx` for text with markup in it. */
import type { ComponentChildren, VNode } from 'preact';
import { LANGS, lang, tr, type Lang } from '../shared/i18n';
import '../shared/i18n/en';
import { send } from './store';

const KEY = 'tf-lang';
const NAMES: Record<Lang, string> = { en: 'English', nl: 'Nederlands' };

/** The language this browser chose (English unless Dutch was picked). */
export function initLanguage(): void {
  let l: Lang = 'en';
  try { const s = localStorage.getItem(KEY); if (s === 'nl' || s === 'en') l = s; } catch { /* private mode */ }
  lang.value = l;
  document.documentElement.lang = l;
  send({ type: 'setLang', lang: l });
}

export function setLanguage(l: Lang): void {
  lang.value = l;
  document.documentElement.lang = l;
  try { localStorage.setItem(KEY, l); } catch { /* private mode */ }
  // the simulation writes its notices and log in this language from now on
  send({ type: 'setLang', lang: l });
}

/**
 * Text with markup: `trx('Je hebt {n} dorpen', { n: <strong>{n}</strong> })`. Values that are plain
 * strings or numbers are filled in like `tr`; elements are put in place.
 */
export function trx(nl: string, p: Record<string, ComponentChildren>): ComponentChildren[] {
  const plain: Record<string, string> = {};
  for (const [k, v] of Object.entries(p)) if (typeof v === 'string' || typeof v === 'number') plain[k] = String(v);
  const s = tr(nl, plain);
  const out: ComponentChildren[] = [];
  let last = 0;
  for (const m of s.matchAll(/\{(\w+)\}/g)) {
    if (!(m[1]! in p)) continue;
    out.push(s.slice(last, m.index));
    out.push(p[m[1]!] as VNode);
    last = m.index! + m[0].length;
  }
  out.push(s.slice(last));
  return out;
}

/** Settings: the language. */
export function LanguagePanel() {
  return (
    <section class="panel">
      <h2>{tr('Taal')} · Language</h2>
      <div class="row wrap">
        {LANGS.map((l) => (
          <button key={l} class={`chip ${lang.value === l ? 'on' : ''}`} onClick={() => setLanguage(l)}>{NAMES[l]}</button>
        ))}
      </div>
    </section>
  );
}

/** A small EN / NL switch (start screen). */
export function LangToggle({ class: cls = '' }: { class?: string }) {
  const next: Lang = lang.value === 'en' ? 'nl' : 'en';
  return (
    <button type="button" class={`lang-toggle ${cls}`} onClick={() => setLanguage(next)} title={NAMES[next]} aria-label={NAMES[next]}>
      {lang.value.toUpperCase()}
    </button>
  );
}
